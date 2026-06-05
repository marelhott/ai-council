import { useState } from 'react'
import type { WeakestAssumptionResult, WeakestAssumptionState } from '../../types/index'

const EXAMPLES = [
  'Chci spustit službu, kde si zákazník vybere termín a systém přiřadí řemeslníka.',
  'Přemýšlím, jestli změnit pricing ze ročního na měsíční model.',
  'Chci postavit AI nástroj pro interní onboarding zaměstnanců.',
  'Plánuji klientovi poslat nabídku na 3měsíční projekt za 180 000 Kč.',
]

const REFINE_ACTIONS = [
  { label: 'Zostřit kritiku',  value: 'Zostři kritiku. Buď tvrdší a konkrétnější v rizicích.' },
  { label: 'Jednodušší test', value: 'Navrhni jednodušší a levnější první test.' },
  { label: 'Provozní riziko', value: 'Zaměř se hlavně na provozní a procesní rizika.' },
  { label: 'Obchodní riziko', value: 'Zaměř se hlavně na obchodní a tržní rizika.' },
  { label: 'Stručněji',       value: 'Přepiš výstup stručněji. Každá sekce max 2 věty.' },
]

function verdictClass(verdict: string) {
  return verdict === 'nejdřív ověřit' ? 'nejdřív-ověřit' : verdict
}

function md(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export default function WeakestAssumption() {
  const [prompt, setPrompt] = useState('')
  const [state, setState] = useState<WeakestAssumptionState>({ status: 'pending', result: null, error: null })
  const [loading, setLoading] = useState(false)

  async function submit(refineAction?: string) {
    if (!prompt.trim()) return
    setLoading(true)
    setState({ status: 'pending', result: null, error: null })
    try {
      const res = await fetch('/api/weakest-assumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, refineAction }),
      })
      if (!res.ok) throw new Error()
      const data: WeakestAssumptionResult = await res.json()
      setState({ status: 'done', result: data, error: null })
    } catch {
      setState({ status: 'error', result: null, error: 'Něco se nepodařilo. Zkus to prosím znovu.' })
    } finally {
      setLoading(false)
    }
  }

  const result = state.result

  return (
    <div className="workspace-layout">
      {/* ── Left sidebar: input ── */}
      <aside className="workspace-sidebar">
        <div className="panel-card panel-card-sticky">
          <div className="tab-header">
            <h2>Nejslabší předpoklad</h2>
            <p className="sub">Popiš nápad nebo rozhodnutí. AI najde místo, kde se to může rozbít, a navrhne nejrychlejší test.</p>
          </div>

          <div className="input-form">
            <textarea
              className="main-input"
              placeholder="Popiš svůj nápad nebo rozhodnutí..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submit() }}
              rows={5}
            />
            <div className="examples">
              {EXAMPLES.map(ex => (
                <button key={ex} className="example-chip" onClick={() => setPrompt(ex)}>
                  {ex.length > 55 ? ex.slice(0, 53) + '…' : ex}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={() => submit()} disabled={loading || !prompt.trim()}>
              {loading ? <><span className="spinner" /> Analyzuji…</> : 'Otestovat nápad'}
            </button>
          </div>

          {result && (
            <div className="sidebar-actions">
              <div className="sidebar-actions-title">Upravit analýzu</div>
              {REFINE_ACTIONS.map(action => (
                <button
                  key={action.label}
                  className="btn-secondary btn-secondary-block"
                  onClick={() => submit(action.value)}
                  disabled={loading}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: results ── */}
      <section className="workspace-results">
        {state.error && <div className="error-msg">{state.error}</div>}

        {loading && !result && (
          <div className="empty-state empty-state-large">
            <div className="loading-state"><span className="spinner" /> Analyzuji nejslabší předpoklad…</div>
          </div>
        )}

        {result && (
          <div className="result-block">
            <div className={`verdict-banner ${verdictClass(result.verdict)}`}>
              <div>
                <div className="verdict-label">Verdikt</div>
                <div className="verdict-text">{result.verdict.toUpperCase()}</div>
                <div className="verdict-reason">{result.verdictReason}</div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="result-section highlight">
                  <div className="section-label">Nejslabší předpoklad</div>
                  <div className="section-content" dangerouslySetInnerHTML={{ __html: md(result.weakestAssumption) }} />
                </div>
                <div className="result-section">
                  <div className="section-label">Proč je to kritické</div>
                  <div className="section-content" dangerouslySetInnerHTML={{ __html: md(result.whyCritical) }} />
                </div>
                <div className="result-section">
                  <div className="section-label">Největší slepé místo</div>
                  <div className="section-content" dangerouslySetInnerHTML={{ __html: md(result.blindSpot) }} />
                </div>
              </div>
            </div>

            <div className="result-grid">
              <div className="card">
                <div className="section-label" style={{ marginBottom: 8 }}>První test</div>
                <div className="section-content prose" dangerouslySetInnerHTML={{ __html: md(result.firstTest) }} />
              </div>
              <div className="card">
                <div className="section-label" style={{ marginBottom: 8 }}>Kill kritérium</div>
                <div className="section-content prose" dangerouslySetInnerHTML={{ __html: md(result.killCriterion) }} />
              </div>
            </div>

            <div className="next-step-box">
              <div className="section-label">Další krok</div>
              <div className="section-content">{result.nextStep}</div>
            </div>
          </div>
        )}

        {!result && !loading && !state.error && (
          <div className="empty-state empty-state-large">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            <p>Vlevo popiš nápad nebo rozhodnutí.<br/>Výsledek se zobrazí tady.</p>
          </div>
        )}
      </section>
    </div>
  )
}
