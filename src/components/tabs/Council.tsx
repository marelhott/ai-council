import { useEffect, useRef, useState } from 'react'
import type { APIKeys, CouncilSession, CouncilSynthesis, RoleConfig } from '../../types/index'
import { useProviders } from '../ui/AIConfigPanel'
import ModelPicker from '../ui/ModelPicker'
import { useComposerAttachments } from '../ui/useComposerAttachments'

const COUNCIL_ROLES_CONFIG = [
  { key: 'practitioner', label: 'Praktik' },
  { key: 'skeptic', label: 'Skeptik' },
  { key: 'strategist', label: 'Stratég' },
]

const ROLE_COLORS: Record<string, string> = {
  practitioner: '#10b981',
  skeptic: '#ef4444',
  strategist: '#8b5cf6',
}

const DEFAULT_COUNCIL_CONFIGS: Record<string, RoleConfig> = {
  practitioner: { provider: 'openai', model: 'gpt-5.5', thinkingLevel: 'low' },
  skeptic: { provider: 'anthropic', model: 'claude-sonnet-4-6', thinkingLevel: 'low' },
  strategist: { provider: 'gemini', model: 'gemini-3.5-flash', thinkingLevel: 'low' },
}

const DEFAULT_WRAPUP_CONFIGS: Record<string, RoleConfig> = {
  evaluator: { provider: 'anthropic', model: 'claude-sonnet-4-6', thinkingLevel: 'low' },
  synthesis: { provider: 'openai', model: 'gpt-5.5', thinkingLevel: 'low' },
}

const LOADING_MESSAGES: Record<string, string> = {
  initial_responses: 'Rada odpovídá…',
  synthesizing: 'Vzniká společný závěr…',
}

interface CouncilTurn {
  id: string
  prompt: string
  session: CouncilSession
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

function verdictClass(verdict: string) {
  return verdict === 'nejdřív ověřit' ? 'nejdřív-ověřit' : verdict
}

function providerLabel(providerName: string) {
  if (providerName === 'anthropic' || providerName === 'claude') return 'Claude'
  if (providerName === 'openai') return 'OpenAI'
  if (providerName === 'gemini') return 'Gemini'
  return providerName
}

function SynthesisView({ synthesis }: { synthesis: CouncilSynthesis }) {
  return (
    <div className="analysis-flow">
      <div className={`verdict-banner ${verdictClass(synthesis.verdict)}`}>
        <div>
          <div className="verdict-label">Finální verdikt</div>
          <div className="verdict-text">{synthesis.verdict.toUpperCase()}</div>
        </div>
      </div>

      <div className="analysis-section">
        <div className="section-label">Shrnutí</div>
        <div className="section-content">{synthesis.summary}</div>
      </div>

      <div className="analysis-inline-grid">
        <div className="analysis-section">
          <div className="section-label">Shoda rady</div>
          <ul className="bullet-list">
            {synthesis.consensus.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
        <div className="analysis-section">
          <div className="section-label">Rozpory</div>
          <ul className="bullet-list">
            {synthesis.disagreements.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="analysis-section">
        <div className="section-label">Nejsilnější argument</div>
        <div className="section-content">{synthesis.strongestArgument}</div>
      </div>

      <div className="analysis-section">
        <div className="section-label">Největší riziko</div>
        <div className="section-content">{synthesis.biggestRisk}</div>
      </div>

      <div className="analysis-section">
        <div className="section-label">Co ještě chybí vědět</div>
        <div className="section-content">{synthesis.missingInfo}</div>
      </div>

      <div className="next-step-box">
        <div className="section-label">Doporučený další krok</div>
        <div className="section-content">{synthesis.nextStep}</div>
      </div>
    </div>
  )
}

function RoleConfigStrip({
  configs,
  providers,
  onChange,
}: {
  configs: Record<string, RoleConfig>
  providers: ReturnType<typeof useProviders>
  onChange: (key: string, config: RoleConfig) => void
}) {
  return (
    <div className="inline-role-configs">
      {COUNCIL_ROLES_CONFIG.map(role => (
        <div key={role.key} className="inline-role-config">
          <div className="provider-badge">
            <span className="provider-dot" style={{ background: ROLE_COLORS[role.key] ?? '#6b7280' }} />
            <span>{role.label}</span>
          </div>
          <ModelPicker
            config={configs[role.key]}
            providers={providers}
            onChange={config => onChange(role.key, config)}
          />
        </div>
      ))}
    </div>
  )
}

function WrapupConfigStrip({
  configs,
  providers,
  onChange,
}: {
  configs: Record<string, RoleConfig>
  providers: ReturnType<typeof useProviders>
  onChange: (key: string, config: RoleConfig) => void
}) {
  return (
    <div className="single-config-strip">
      <div className="inline-role-config">
        <div className="provider-badge">
          <span className="provider-dot" style={{ background: '#6b7280' }} />
          <span>Vyhodnocení</span>
        </div>
        <ModelPicker config={configs.evaluator} providers={providers} onChange={config => onChange('evaluator', config)} />
      </div>
      <div className="inline-role-config">
        <div className="provider-badge">
          <span className="provider-dot" style={{ background: '#111827' }} />
          <span>Závěr</span>
        </div>
        <ModelPicker config={configs.synthesis} providers={providers} onChange={config => onChange('synthesis', config)} />
      </div>
    </div>
  )
}

export default function Council({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [input, setInput] = useState('')
  const [roleConfigs, setRoleConfigs] = useState<Record<string, RoleConfig>>(DEFAULT_COUNCIL_CONFIGS)
  const [wrapupConfigs, setWrapupConfigs] = useState<Record<string, RoleConfig>>(DEFAULT_WRAPUP_CONFIGS)
  const [turns, setTurns] = useState<CouncilTurn[]>([])
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
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
    if (!providers.length) return
    setRoleConfigs(previous => {
      const next = { ...previous }
      for (const role of COUNCIL_ROLES_CONFIG) {
        const current = next[role.key]
        const provider = providers.find(item => item.provider === current.provider)
        if (!provider) continue
        if (!provider.models.some(model => model.id === current.model)) {
          next[role.key] = { ...current, model: provider.models[0]?.id ?? current.model }
        }
      }
      return next
    })
    setWrapupConfigs(previous => {
      const next = { ...previous }
      for (const key of Object.keys(next)) {
        const current = next[key]
        const provider = providers.find(item => item.provider === current.provider)
        if (!provider) continue
        if (!provider.models.some(model => model.id === current.model)) {
          next[key] = { ...current, model: provider.models[0]?.id ?? current.model }
        }
      }
      return next
    })
  }, [providers])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length])

  async function runCouncil() {
    const prompt = input.trim()
    if (!prompt || running) return
    const promptWithAttachments = appendAttachmentContext(prompt)

    setRunning(true)
    setInput('')
    const turnId = crypto.randomUUID()
    const baseSession: CouncilSession = {
      status: 'initial_responses',
      initialResponses: [],
      evaluations: [],
      synthesis: null,
      error: null,
    }
    setTurns(previous => [...previous, { id: turnId, prompt, session: baseSession }])

    try {
      const response = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptWithAttachments,
          roleConfigs,
          evaluationConfig: wrapupConfigs.evaluator,
          synthesisConfig: wrapupConfigs.synthesis,
          apiKeys,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Něco se nepodařilo. Zkus to prosím znovu.')
      }

      const data = await response.json() as {
        initialResponses: CouncilSession['initialResponses']
        evaluation?: CouncilSession['evaluations'][number]
        synthesis: CouncilSynthesis
      }

      setTurns(previous =>
        previous.map(turn =>
          turn.id === turnId
            ? {
                ...turn,
                session: {
                  ...turn.session,
                  status: 'done',
                  initialResponses: data.initialResponses,
                  evaluations: data.evaluation ? [data.evaluation] : [],
                  synthesis: data.synthesis,
                },
              }
            : turn
        )
      )
    } catch (error) {
      setTurns(previous =>
        previous.map(turn =>
          turn.id === turnId
            ? {
                ...turn,
                session: {
                  ...turn.session,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Něco se nepodařilo. Zkus to prosím znovu.',
                },
              }
            : turn
        )
      )
    } finally {
      setRunning(false)
      clearAttachments()
    }
  }

  function clearConversation() {
    setTurns([])
    setInput('')
    clearAttachments()
  }

  return (
    <div className="tab-page">
      <div className="thread-page-header">
        <div>
          <h2>AI Council</h2>
          <p>Více rolí, jedna rada. Každý běh je nový deliberativní tah v témže prostoru.</p>
        </div>
        {turns.length > 0 && (
          <button type="button" className="btn-secondary" onClick={clearConversation}>
            Nový chat
          </button>
        )}
      </div>

      <div className="chat-thread">
        <div className="thread-narrow">
          {turns.length === 0 ? (
            <div className="empty-state empty-state-large">
              <p>AI Council rozvine otázku do samostatných hlasů, rychlého vyhodnocení a společného závěru.</p>
              <RoleConfigStrip
                configs={roleConfigs}
                providers={providers}
                onChange={(key, config) => setRoleConfigs(previous => ({ ...previous, [key]: config }))}
              />
              <WrapupConfigStrip
                configs={wrapupConfigs}
                providers={providers}
                onChange={(key, config) => setWrapupConfigs(previous => ({ ...previous, [key]: config }))}
              />
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

                  {['initial_responses', 'synthesizing'].includes(turn.session.status) && (
                    <div className="loading-state">
                      <span className="spinner" />
                      <span>{LOADING_MESSAGES[turn.session.status] ?? 'Zpracovávám…'}</span>
                    </div>
                  )}

                  {turn.session.error && <div className="error-msg">{turn.session.error}</div>}

                  {turn.session.initialResponses.length > 0 && (
                    <div className="council-inline-grid">
                      {turn.session.initialResponses.map(response => (
                        <div key={response.roleName} className="analysis-section">
                          <div className="provider-badge" style={{ marginBottom: 8 }}>
                            <span className="provider-dot" style={{ background: ROLE_COLORS[response.roleName] ?? '#6b7280' }} />
                            <span>{response.roleLabel}</span>
                            <span className="provider-meta">{providerLabel(response.providerName)}</span>
                          </div>
                          {response.status === 'error' ? (
                            <div className="error-msg">{response.error ?? 'Tato odpověď se nepodařila vygenerovat.'}</div>
                          ) : (
                            <div className="prose section-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(response.content) }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {turn.session.evaluations.length > 0 && (
                    <div className="analysis-section">
                      <div className="section-label">Vyhodnocení debaty</div>
                      {turn.session.evaluations.map((evaluation, index) => (
                        <div key={index} className="analysis-flow-tight">
                          <div className="section-content"><strong>Silné:</strong> {evaluation.strengths}</div>
                          <div className="section-content"><strong>Slabé:</strong> {evaluation.weaknesses}</div>
                          <div className="section-content"><strong>Chybí:</strong> {evaluation.missing}</div>
                          <div className="section-content"><strong>Klíčový argument:</strong> {evaluation.bestArgument}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {turn.session.synthesis && <SynthesisView synthesis={turn.session.synthesis} />}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer-shell">
          <input
            ref={attachmentInputRef}
            className="hidden-file-input"
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json"
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
          {turns.length > 0 && (
            <>
              <RoleConfigStrip
                configs={roleConfigs}
                providers={providers}
                onChange={(key, config) => setRoleConfigs(previous => ({ ...previous, [key]: config }))}
              />
              <WrapupConfigStrip
                configs={wrapupConfigs}
                providers={providers}
                onChange={(key, config) => setWrapupConfigs(previous => ({ ...previous, [key]: config }))}
              />
            </>
          )}
          <div className="composer-row">
            <button type="button" className="composer-add" aria-label="Přidat soubor" onClick={openPicker}>
              +
            </button>
            <textarea
              ref={inputRef}
              className="composer-input"
              placeholder="Popiš otázku, rozhodnutí nebo problém pro radu…"
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  runCouncil()
                }
              }}
              rows={1}
              disabled={running}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={runCouncil} disabled={!input.trim() || running} aria-label="Odeslat">
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
