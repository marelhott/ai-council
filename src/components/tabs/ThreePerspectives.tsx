import { useEffect, useMemo, useRef, useState } from 'react'
import type { APIKeys, ConversationRound, RoleConfig, RoleResponse, ThinkingLevel } from '../../types/index'
import { useProviders, type LiveProvider } from '../ui/AIConfigPanel'
import { useComposerAttachments } from '../ui/useComposerAttachments'

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97706',
  gemini: '#4285f4',
  claude: '#d97706',
}

const ROLE_COLORS: Record<string, string> = {
  practical: '#10b981',
  critical: '#ef4444',
  creative: '#8b5cf6',
}

const ROLES_CONFIG = [
  { key: 'practical', label: 'Praktický poradce' },
  { key: 'critical', label: 'Kritický oponent' },
  { key: 'creative', label: 'Kreativní stratég' },
]

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  low: 'Rychlé',
  medium: 'Standard',
  high: 'Hluboké',
}

const DEFAULT_CONFIGS: Record<string, RoleConfig> = {
  practical: { provider: 'openai', model: 'gpt-5.5', thinkingLevel: 'medium' },
  critical: { provider: 'anthropic', model: 'claude-sonnet-4-6', thinkingLevel: 'medium' },
  creative: { provider: 'gemini', model: 'gemini-3.5-flash', thinkingLevel: 'medium' },
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,4} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

function RoleSettings({
  config,
  providers,
  onChange,
}: {
  config: RoleConfig
  providers: LiveProvider[]
  onChange: (config: RoleConfig) => void
}) {
  const [openMenu, setOpenMenu] = useState<'model' | 'thinking' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const providerData = providers.find(provider => provider.provider === config.provider)
  const models = providerData?.models ?? []

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function setProvider(providerName: RoleConfig['provider']) {
    const provider = providers.find(item => item.provider === providerName)
    const model = provider?.models[0]?.id ?? config.model
    onChange({ ...config, provider: providerName, model })
  }

  return (
    <div className="stream-config-row" ref={menuRef}>
      <div className="stream-config">
        <button type="button" className="stream-text-trigger" onClick={() => setOpenMenu(current => current === 'model' ? null : 'model')}>
          {config.model.replace(/^gpt-/, 'GPT-').replace('claude-', 'Claude ').replace(/-/g, ' ')}
        </button>
        {openMenu === 'model' && (
        <div className="stream-config-panel">
          <div className="stream-config-group">
            <div className="stream-config-label">Provider</div>
            <div className="menu-list">
              {providers.map(provider => (
                <button
                  key={provider.provider}
                  type="button"
                  className={`menu-option ${config.provider === provider.provider ? 'selected' : ''}`}
                  onClick={() => {
                    setProvider(provider.provider)
                    setOpenMenu(null)
                  }}
                >
                  <span>{provider.label}</span>
                  <span className={`connection-status inline ${provider.source === 'live' && provider.hasKey ? 'connected' : 'disconnected'}`}>
                    <span className="provider-dot" />
                  </span>
                  {config.provider === provider.provider && <span className="menu-check">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="stream-config-group">
            <div className="stream-config-label">Model</div>
            <div className="menu-list">
              {models.map(model => (
                <button
                key={model.id}
                type="button"
                className={`menu-option ${config.model === model.id ? 'selected' : ''}`}
                onClick={() => {
                  onChange({ ...config, model: model.id })
                  setOpenMenu(null)
                }}
              >
                  <span>{model.label}</span>
                  {config.model === model.id && <span className="menu-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="stream-config">
        <button type="button" className="stream-text-trigger" onClick={() => setOpenMenu(current => current === 'thinking' ? null : 'thinking')}>
          {THINKING_LABELS[config.thinkingLevel]}
        </button>
        {openMenu === 'thinking' && (
        <div className="stream-config-panel">
          <div className="stream-config-group">
            <div className="stream-config-label">Uvažování</div>
            <div className="menu-list">
              {(['low', 'medium', 'high'] as ThinkingLevel[]).map(level => (
                <button
                key={level}
                type="button"
                className={`menu-option ${config.thinkingLevel === level ? 'selected' : ''}`}
                onClick={() => {
                  onChange({ ...config, thinkingLevel: level })
                  setOpenMenu(null)
                }}
              >
                  <span>{THINKING_LABELS[level]}</span>
                  {config.thinkingLevel === level && <span className="menu-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

function RoleColumn({
  role,
  rounds,
  config,
  providers,
  onConfigChange,
}: {
  role: { key: string; label: string }
  rounds: ConversationRound[]
  config: RoleConfig
  providers: LiveProvider[]
  onConfigChange: (config: RoleConfig) => void
}) {
  const providerColor = PROVIDER_COLORS[config.provider] ?? '#6b7280'
  const providerLabel =
    config.provider === 'anthropic'
      ? 'Claude'
      : config.provider === 'openai'
        ? 'OpenAI'
        : config.provider === 'gemini'
          ? 'Gemini'
          : 'Nepřipojeno'
  const modelLabel = config.model
  const providerData = providers.find(provider => provider.provider === config.provider)
  const connected = providerData?.source === 'live' && providerData.hasKey
  const columnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    columnRef.current?.scrollTo({ top: columnRef.current.scrollHeight, behavior: 'smooth' })
  }, [rounds.length])

  return (
    <section className="parallel-column">
      <header className="parallel-column-header">
        <div>
          <div className="column-kicker" style={{ color: ROLE_COLORS[role.key] ?? 'var(--text-secondary)' }}>
            {role.label}
          </div>
          <div className="provider-badge">
            <span className="provider-dot" style={{ background: providerColor }} />
            <span style={{ color: providerColor, fontWeight: 600 }}>{providerLabel}</span>
            <span className="provider-meta">{modelLabel}</span>
            {connected && <span className="connection-status connected"><span className="provider-dot" /> online</span>}
          </div>
        </div>
        <RoleSettings config={config} providers={providers} onChange={onConfigChange} />
      </header>

      <div className="parallel-column-body" ref={columnRef}>
        {rounds.length === 0 && (
          <div className="column-empty">
            Tento pohled čeká na první otázku.
          </div>
        )}

        {rounds.map(round => {
          const response = round.responses.find(item => item.roleName === role.key)
          if (!response) return null

          return (
            <div key={`${round.id}-${role.key}`} className="thread-turn">
              <div className="thread-message thread-message-user">
                <div className="thread-message-meta">Ty</div>
                <div className="prose thread-message-content thread-message-user">
                  <p>{round.userPrompt}</p>
                </div>
              </div>

              <div className="thread-message thread-message-assistant">
                <div className="thread-message-meta">{role.label}</div>
                {response.status === 'pending' ? (
                  <div className="loading-state">
                    <span className="spinner" />
                    <span>Připravuji odpověď…</span>
                  </div>
                ) : response.status === 'error' ? (
                  <div className="error-msg">{response.error}</div>
                ) : (
                  <div className="prose thread-message-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(response.content) }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function ThreePerspectives({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [input, setInput] = useState('')
  const [rounds, setRounds] = useState<ConversationRound[]>([])
  const [loading, setLoading] = useState(false)
  const [roleConfigs, setRoleConfigs] = useState<Record<string, RoleConfig>>(DEFAULT_CONFIGS)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
      for (const role of ROLES_CONFIG) {
        const current = next[role.key]
        const provider = providers.find(item => item.provider === current.provider)
        if (!provider) continue
        if (!provider.models.some(model => model.id === current.model)) {
          next[role.key] = { ...current, model: provider.models[0]?.id ?? current.model }
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

  async function fetchAnswers(userPrompt: string, isFollowUp: boolean) {
    setLoading(true)
    const promptWithAttachments = appendAttachmentContext(userPrompt)

    const history = isFollowUp
      ? rounds.flatMap(round => [
          { role: 'user' as const, content: round.userPrompt, persona: 'all' },
          ...round.responses.map(response => ({
            role: 'assistant' as const,
            content: response.content,
            persona: response.roleName,
          })),
        ])
      : undefined

    const pendingRound: ConversationRound = {
      id: crypto.randomUUID(),
      userPrompt,
      responses: ROLES_CONFIG.map(role => ({
        roleName: role.key,
        roleLabel: role.label,
        providerName: roleConfigs[role.key].provider,
        modelName: roleConfigs[role.key].model,
        content: '',
        status: 'pending',
        error: null,
      })),
      createdAt: new Date().toISOString(),
    }

    setRounds(previous => [...previous, pendingRound])

    try {
      const response = await fetch('/api/three-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptWithAttachments, history, roleConfigs, apiKeys }),
      })
      if (!response.ok) throw new Error('Server error')
      const data: { responses: RoleResponse[] } = await response.json()
      setRounds(previous =>
        previous.map(round => (round.id === pendingRound.id ? { ...round, responses: data.responses } : round))
      )
    } catch {
      setRounds(previous =>
        previous.map(round =>
          round.id === pendingRound.id
            ? {
                ...round,
                responses: round.responses.map(responseItem => ({
                  ...responseItem,
                  status: 'error',
                  error: 'Tato odpověď se nepodařila vygenerovat.',
                })),
              }
            : round
        )
      )
    } finally {
      setLoading(false)
      clearAttachments()
    }
  }

  function submitPrompt() {
    const prompt = input.trim()
    if (!prompt || loading) return
    const isFollowUp = rounds.length > 0
    setInput('')
    fetchAnswers(prompt, isFollowUp)
  }

  function clearConversation() {
    setRounds([])
    setInput('')
    clearAttachments()
  }

  const hasRounds = rounds.length > 0
  const subtitle = useMemo(
    () =>
      hasRounds
        ? 'Každý sloupec vede vlastní souvislý dialog, ale všechny role reagují na stejný vstup.'
        : 'Praktik, oponent a stratég odpovídají souběžně na stejnou otázku.',
    [hasRounds]
  )

  return (
    <div className="tab-page">
      <div className="parallel-page-header">
        <div>
          <h2>Tři pohledy</h2>
          <p>{subtitle}</p>
        </div>
        {hasRounds && (
          <button type="button" className="btn-secondary" onClick={clearConversation}>
            Nový chat
          </button>
        )}
      </div>

      <div className="parallel-grid">
        {ROLES_CONFIG.map(role => (
          <RoleColumn
            key={role.key}
            role={role}
            rounds={rounds}
            config={roleConfigs[role.key]}
            providers={providers}
            onConfigChange={config => setRoleConfigs(previous => ({ ...previous, [role.key]: config }))}
          />
        ))}
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
          <div className="composer-row">
            <button type="button" className="composer-add" aria-label="Přidat soubor" onClick={openPicker}>
              +
            </button>
            <textarea
              ref={inputRef}
              className="composer-input"
              placeholder={hasRounds ? 'Navazující otázka pro všechny tři pohledy…' : 'Zeptej se na cokoli…'}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitPrompt()
                }
              }}
              rows={1}
              disabled={loading}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={submitPrompt} disabled={loading || !input.trim()} aria-label="Odeslat">
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
