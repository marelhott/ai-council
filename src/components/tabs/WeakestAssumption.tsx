import { useEffect, useRef, useState } from 'react'
import type { APIKeys, RoleConfig, WeakestAssumptionResult } from '../../types/index'
import ModelPicker from '../ui/ModelPicker'
import SafeMarkdown from '../ui/SafeMarkdown'
import { TEXT_ATTACHMENT_ACCEPT, useComposerAttachments } from '../ui/useComposerAttachments'
import { useProviders } from '../ui/useProviders'

const EXAMPLES = [
  'Chci spustit službu, kde si zákazník vybere termín a systém přiřadí řemeslníka.',
  'Přemýšlím, jestli změnit pricing ze ročního na měsíční model.',
  'Chci postavit AI nástroj pro interní onboarding zaměstnanců.',
  'Plánuji klientovi poslat nabídku na 3měsíční projekt za 180 000 Kč.',
]

const REFINE_ACTIONS = [
  { label: 'Zostřit kritiku', value: 'Zostři kritiku. Buď tvrdší a konkrétnější v rizicích.' },
  { label: 'Jednodušší test', value: 'Navrhni jednodušší a levnější první test.' },
  { label: 'Provozní riziko', value: 'Zaměř se hlavně na provozní a procesní rizika.' },
  { label: 'Obchodní riziko', value: 'Zaměř se hlavně na obchodní a tržní rizika.' },
  { label: 'Stručněji', value: 'Přepiš výstup stručněji. Každá sekce max 2 věty.' },
]

interface AnalysisTurn {
  id: string
  prompt: string
  result: WeakestAssumptionResult | null
  error: string | null
  loading: boolean
}

const DEFAULT_ANALYSIS_CONFIG: RoleConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  thinkingLevel: 'low',
}

function verdictClass(verdict: string) {
  return verdict === 'nejdřív ověřit' ? 'nejdřív-ověřit' : verdict
}

function AnalysisView({ result, onRefine, loading }: {
  result: WeakestAssumptionResult
  onRefine: (action: string) => void
  loading: boolean
}) {
  return (
    <div className="analysis-flow">
      <div className={`verdict-banner ${verdictClass(result.verdict)}`}>
        <div>
          <div className="verdict-label">Verdikt</div>
          <div className="verdict-text">{result.verdict.toUpperCase()}</div>
          <div className="verdict-reason">{result.verdictReason}</div>
        </div>
      </div>

      <div className="analysis-section">
        <div className="section-label">Nejslabší předpoklad</div>
        <SafeMarkdown text={result.weakestAssumption} className="section-content" />
      </div>

      <div className="analysis-section">
        <div className="section-label">Proč je to kritické</div>
        <SafeMarkdown text={result.whyCritical} className="section-content" />
      </div>

      <div className="analysis-section">
        <div className="section-label">Největší slepé místo</div>
        <SafeMarkdown text={result.blindSpot} className="section-content" />
      </div>

      <div className="analysis-inline-grid">
        <div className="analysis-section">
          <div className="section-label">První test</div>
          <SafeMarkdown text={result.firstTest} className="section-content" />
        </div>
        <div className="analysis-section">
          <div className="section-label">Kill kritérium</div>
          <SafeMarkdown text={result.killCriterion} className="section-content" />
        </div>
      </div>

      <div className="next-step-box">
        <div className="section-label">Další krok</div>
        <div className="section-content">{result.nextStep}</div>
      </div>

      <div className="refine-row">
        {REFINE_ACTIONS.map(action => (
          <button
            key={action.label}
            type="button"
            className="btn-secondary"
            disabled={loading}
            onClick={() => onRefine(action.value)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function WeakestAssumption({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<AnalysisTurn[]>([])
  const [loading, setLoading] = useState(false)
  const [analysisConfig, setAnalysisConfig] = useState<RoleConfig>(DEFAULT_ANALYSIS_CONFIG)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    attachments,
    inputRef: attachmentInputRef,
    openPicker,
    onFileChange,
    removeAttachment,
    clearAttachments,
    appendAttachmentContext,
  } = useComposerAttachments()

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length])

  useEffect(() => {
    if (!providers.length) return
    const provider = providers.find(item => item.provider === analysisConfig.provider)
    if (!provider) return
    if (!provider.models.some(model => model.id === analysisConfig.model)) {
      setAnalysisConfig(previous => ({ ...previous, model: provider.models[0]?.id ?? previous.model }))
    }
  }, [providers, analysisConfig.provider, analysisConfig.model])

  async function submit(refineAction?: string, promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim()
    if (!prompt) return
    const promptWithAttachments = appendAttachmentContext(prompt)

    setLoading(true)
    const turnId = crypto.randomUUID()
    setTurns(previous => [...previous, { id: turnId, prompt, result: null, error: null, loading: true }])
    setInput('')

    try {
      const response = await fetch('/api/weakest-assumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptWithAttachments, refineAction, modelConfig: analysisConfig, apiKeys }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Něco se nepodařilo. Zkus to prosím znovu.')
      }
      const data: WeakestAssumptionResult = await response.json()
      setTurns(previous =>
        previous.map(turn => (turn.id === turnId ? { ...turn, result: data, error: null, loading: false } : turn))
      )
    } catch (error) {
      setTurns(previous =>
        previous.map(turn =>
          turn.id === turnId
            ? { ...turn, result: null, error: error instanceof Error ? error.message : 'Něco se nepodařilo. Zkus to prosím znovu.', loading: false }
            : turn
        )
      )
    } finally {
      setLoading(false)
      clearAttachments()
    }
  }

  const latestPrompt = turns[turns.length - 1]?.prompt ?? ''

  return (
    <div className="tab-page">
      <div className="thread-page-header">
        <div>
          <h2>Nejslabší předpoklad</h2>
          <p>Jedna otázka dovnitř, jedna tvrdá analýza ven. Bez panelů, přímo v proudu konverzace.</p>
        </div>
        <div className="single-config-strip">
          <div className="inline-role-config">
            <div className="provider-badge">
              <span className="provider-dot" style={{ background: '#d97706' }} />
              <span>Analytik</span>
            </div>
            <ModelPicker config={analysisConfig} providers={providers} onChange={setAnalysisConfig} />
          </div>
        </div>
      </div>

      <div className="chat-thread">
        <div className="thread-narrow">
          {turns.length === 0 ? (
            <div className="empty-state empty-state-large">
              <p>Napiš nápad nebo rozhodnutí a odpověď poběží přímo tady jako konverzace.</p>
              <div className="example-row">
                {EXAMPLES.map(example => (
                  <button key={example} type="button" className="example-chip" onClick={() => setInput(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map(turn => (
              <div key={turn.id} className="thread-turn thread-turn-stacked">
                <div className="thread-message thread-message-user">
                  <div className="thread-message-meta">Ty</div>
                  <div className="prose thread-message-content thread-message-user">
                    <p>{turn.prompt}</p>
                  </div>
                </div>

                <div className="thread-message thread-message-assistant">
                  <div className="thread-message-meta">AI Council</div>
                  {turn.loading ? (
                    <div className="loading-state">
                      <span className="spinner" />
                      <span>Analyzuji nejslabší předpoklad…</span>
                    </div>
                  ) : turn.error ? (
                    <div className="error-msg">{turn.error}</div>
                  ) : turn.result ? (
                    <AnalysisView
                      result={turn.result}
                      loading={loading}
                      onRefine={action => submit(action, turn.prompt)}
                    />
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer-shell">
          <input
            ref={attachmentInputRef}
            className="hidden-file-input"
            type="file"
            multiple
            accept={TEXT_ATTACHMENT_ACCEPT}
            onChange={onFileChange}
          />
          {attachments.length > 0 && (
            <div className="attachment-row">
              {attachments.map((attachment, index) => (
                <button key={`${attachment.file.name}-${index}`} type="button" className="attachment-chip" onClick={() => removeAttachment(index)}>
                  {attachment.file.name}
                </button>
              ))}
            </div>
          )}
          <div className="composer-row">
            <button type="button" className="composer-add" aria-label="Přidat soubor" onClick={openPicker}>
              +
            </button>
            <textarea
              ref={inputRef}
              className="composer-input"
              placeholder={latestPrompt ? 'Další nápad nebo nové rozhodnutí…' : 'Popiš svůj nápad nebo rozhodnutí…'}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (!loading) submit()
                }
              }}
              rows={1}
              disabled={loading}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={() => submit()} disabled={loading || !input.trim()} aria-label="Odeslat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
