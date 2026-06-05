import { useState } from 'react'
import type { CouncilSession, CouncilSynthesis, RoleConfig } from '../../types/index'
import AIConfigPanel from '../ui/AIConfigPanel'

const COUNCIL_ROLES_CONFIG = [
  { key: 'practitioner', label: 'Praktik' },
  { key: 'skeptic',      label: 'Skeptik' },
  { key: 'strategist',   label: 'Stratég' },
]

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f', anthropic: '#d97706', gemini: '#4285f4', claude: '#d97706', mock: '#6b7280',
}

const DEFAULT_COUNCIL_CONFIGS: Record<string, RoleConfig> = {
  practitioner: { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  skeptic:      { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  strategist:   { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

function verdictClass(v: string) {
  return v === 'nejdřív ověřit' ? 'nejdřív-ověřit' : v
}

function Collapsible({ title, children, defaultOpen = false }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="collapsible-section">
      <button className="collapsible-trigger" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <svg className={`chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  )
}

function SynthesisView({ synthesis }: { synthesis: CouncilSynthesis }) {
  return (
    <div className="synthesis-card">
      <div className="synthesis-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Závěr rady
      </div>

      {/* Verdict */}
      <div className={`verdict-banner ${verdictClass(synthesis.verdict)}`} style={{ marginBottom: 20 }}>
        <div>
          <div className="verdict-label">Finální verdikt</div>
          <div className="verdict-text">{synthesis.verdict.toUpperCase()}</div>
        </div>
      </div>

      <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text)', marginBottom: 20 }}>
        {synthesis.summary}
      </p>

      <div className="synthesis-grid">
        <div className="synthesis-item">
          <div className="label">Kde se rádci shodli</div>
          <ul className="bullet-list">
            {synthesis.consensus.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>

        <div className="synthesis-item">
          <div className="label">Kde se rozcházejí</div>
          <ul className="bullet-list">
            {synthesis.disagreements.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>

        <div className="synthesis-item">
          <div className="label">Nejsilnější argument</div>
          <div className="value">{synthesis.strongestArgument}</div>
        </div>

        <div className="synthesis-item">
          <div className="label">Největší riziko</div>
          <div className="value">{synthesis.biggestRisk}</div>
        </div>

        <div className="synthesis-item full">
          <div className="label">Co chybí vědět</div>
          <div className="value">{synthesis.missingInfo}</div>
        </div>

        <div className="synthesis-item full">
          <div className="label" style={{ color: 'var(--accent)' }}>Doporučený další krok</div>
          <div className="value" style={{ fontWeight: 600, color: 'var(--text-h)' }}>{synthesis.nextStep}</div>
        </div>
      </div>
    </div>
  )
}

const STEP_LABELS = ['Nezávislé odpovědi', 'Vzájemné hodnocení', 'Závěr rady']

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="council-steps">
      {STEP_LABELS.map((label, i) => (
        <div
          key={i}
          className={`council-step ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}`}
        >
          <span className="council-step-num">
            {i < currentStep ? '✓' : i + 1}
          </span>
          {label}
        </div>
      ))}
    </div>
  )
}

const LOADING_MESSAGES: Record<string, string> = {
  initial_responses: 'Rada přemýšlí…',
  evaluating: 'Rádci si navzájem hodnotí odpovědi…',
  synthesizing: 'Předseda rady připravuje závěr…',
}

export default function Council() {
  const [prompt, setPrompt] = useState('')
  const [roleConfigs, setRoleConfigs] = useState<Record<string, RoleConfig>>(DEFAULT_COUNCIL_CONFIGS)
  const [session, setSession] = useState<CouncilSession>({
    status: 'idle',
    initialResponses: [],
    evaluations: [],
    synthesis: null,
    error: null,
  })

  const currentStep =
    session.status === 'idle' || session.status === 'initial_responses' ? 0
    : session.status === 'evaluating' ? 1
    : session.status === 'synthesizing' || session.status === 'done' ? 2
    : 0

  async function runCouncil() {
    if (!prompt.trim()) return

    setSession({ status: 'initial_responses', initialResponses: [], evaluations: [], synthesis: null, error: null })

    try {
      setSession(s => ({ ...s, status: 'evaluating' }))

      const res = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, roleConfigs }),
      })

      if (!res.ok) throw new Error('Server error')
      const data = await res.json()

      setSession(s => ({
        ...s,
        status: 'synthesizing',
        initialResponses: data.initialResponses,
        evaluations: data.evaluation ? [data.evaluation] : [],
      }))

      // Small delay for UX — show "synthesizing" step briefly
      await new Promise(r => setTimeout(r, 300))

      setSession(s => ({
        ...s,
        status: 'done',
        synthesis: data.synthesis,
      }))
    } catch {
      setSession(s => ({
        ...s,
        status: 'error',
        error: 'Něco se nepodařilo. Zkus to prosím znovu.',
      }))
    }
  }

  const isRunning = ['initial_responses', 'evaluating', 'synthesizing'].includes(session.status)
  const isDone = session.status === 'done'

  const roleColors: Record<string, string> = {
    practitioner: '#10b981',
    skeptic: '#ef4444',
    strategist: '#8b5cf6',
  }

  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="panel-card panel-card-sticky">
          <div className="tab-header">
            <h2>AI Council</h2>
            <p className="sub">Nech více AI rolí odpovědět, zkritizovat se navzájem a vytvořit společný závěr.</p>
          </div>

          <div className="input-form">
            <textarea
              className="main-input"
              placeholder="Popiš otázku, rozhodnutí nebo problém pro AI radu…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) runCouncil() }}
              rows={4}
            />
            <button
              className="btn-primary"
              onClick={runCouncil}
              disabled={!prompt.trim() || isRunning}
            >
              {isRunning ? 'Rada pracuje…' : 'Spustit AI Council'}
            </button>
          </div>

          {(isDone || session.status === 'error') && (
            <div className="sidebar-actions">
              <button className="btn-secondary btn-secondary-block" onClick={() => setSession({ status: 'idle', initialResponses: [], evaluations: [], synthesis: null, error: null })}>
                Nová otázka
              </button>
            </div>
          )}

          <AIConfigPanel
            roles={COUNCIL_ROLES_CONFIG}
            configs={roleConfigs}
            onChange={setRoleConfigs}
          />
        </div>
      </aside>

      <section className="workspace-results">
        {(isRunning || isDone || session.status === 'error') ? (
          <div>
          {/* Question recap */}
          <div className="results-toolbar">
            <span>
              <strong>Otázka:</strong>{' '}
              {prompt}
            </span>
          </div>

          <StepIndicator currentStep={isDone ? 3 : currentStep} />

          {isRunning && (
            <div className="loading-state" style={{ marginBottom: 24 }}>
              <span className="spinner" />
              <span>{LOADING_MESSAGES[session.status] ?? 'Zpracovávám…'}</span>
            </div>
          )}

          {session.error && <div className="error-msg">{session.error}</div>}

          {/* Synthesis first when done */}
          {isDone && session.synthesis && (
            <div style={{ marginBottom: 24 }}>
              <SynthesisView synthesis={session.synthesis} />
            </div>
          )}

          {/* Initial responses */}
          {(session.initialResponses.length > 0 || isRunning) && (
            <Collapsible title="Odpovědi rádců" defaultOpen={!isDone}>
              <div className="council-members-grid">
                {session.initialResponses.length > 0
                  ? session.initialResponses.map(r => (
                    <div key={r.roleName} className="council-member-card">
                      <div
                        className="council-member-header"
                        style={{ borderTop: `3px solid ${roleColors[r.roleName] ?? '#6366f1'}` }}
                      >
                        <div>
                          <span className="council-role-badge">{r.roleLabel}</span>
                          <div className="provider-badge" style={{ marginTop: 4 }}>
                            <span className="provider-dot" style={{ background: PROVIDER_COLORS[r.providerName] ?? '#6b7280' }} />
                            <span style={{ color: PROVIDER_COLORS[r.providerName] ?? '#6b7280', fontWeight: 700 }}>
                              {r.providerName === 'anthropic' ? 'Claude' :
                               r.providerName === 'openai' ? 'OpenAI' :
                               r.providerName === 'gemini' ? 'Gemini' :
                               r.providerName === 'mock' ? 'Mock' : r.providerName}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                              {' · '}{r.modelName === 'mock-cs-v1' ? 'Demo' : r.modelName}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="council-member-body">
                        {r.status === 'error'
                          ? <div className="error-msg">Tato odpověď se nepodařila vygenerovat.</div>
                          : <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content) }} />
                        }
                      </div>
                    </div>
                  ))
                  : ['Praktik', 'Skeptik', 'Stratég'].map(label => (
                    <div key={label} className="council-member-card">
                      <div className="council-member-header">
                        <span className="council-role-badge">{label}</span>
                      </div>
                      <div className="council-member-body">
                        <div className="loading-state"><span className="spinner" /> Připravuji…</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </Collapsible>
          )}

          {/* Evaluation */}
          {session.evaluations.length > 0 && (
            <Collapsible title="Vzájemné hodnocení" defaultOpen={false}>
              {session.evaluations.map((ev, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'Co bylo silné', value: ev.strengths },
                    { label: 'Co bylo slabé', value: ev.weaknesses },
                    { label: 'Co chybí', value: ev.missing },
                    { label: 'Nejdůležitější argument', value: ev.bestArgument },
                  ].map(item => (
                    <div key={item.label} className="result-section">
                      <div className="section-label">{item.label}</div>
                      <div className="section-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.value) }} />
                    </div>
                  ))}
                </div>
              ))}
            </Collapsible>
          )}
        </div>
        ) : (
        <div className="empty-state empty-state-large">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <p>Zadej otázku nebo problém pro AI radu. Vpravo se pak rozloží odpovědi, hodnocení i závěr.</p>
        </div>
        )}
      </section>
    </div>
  )
}
