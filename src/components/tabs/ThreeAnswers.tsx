import { useEffect, useMemo, useRef, useState } from 'react'
import type { APIKeys, ProviderName, ThinkingLevel } from '../../types/index'
import SafeMarkdown from '../ui/SafeMarkdown'
import { TEXT_ATTACHMENT_ACCEPT, useComposerAttachments } from '../ui/useComposerAttachments'
import { getModelLabel } from '../ui/modelLabels'
import { useProviders, type LiveProvider } from '../ui/useProviders'
import { streamChatCompletion } from '../../lib/streaming'

interface SlotConfig {
  provider: ProviderName
  model: string
  thinkingLevel: ThinkingLevel
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  status?: 'done' | 'loading' | 'error'
  error?: string
}

interface SlotState {
  config: SlotConfig
  messages: ChatMessage[]
  loading: boolean
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97706',
  gemini: '#4285f4',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
}

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  low: 'Rychlé',
  medium: 'Standard',
  high: 'Hluboké',
}

const DEFAULT_SLOTS: SlotConfig[] = [
  { provider: 'openai', model: 'gpt-5.5', thinkingLevel: 'medium' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', thinkingLevel: 'medium' },
  { provider: 'gemini', model: 'gemini-3.5-flash', thinkingLevel: 'medium' },
]

function SlotSettings({
  config,
  providers,
  onChange,
}: {
  config: SlotConfig
  providers: LiveProvider[]
  onChange: (config: SlotConfig) => void
}) {
  const [openMenu, setOpenMenu] = useState<'model' | 'thinking' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const providerData = providers.find(provider => provider.provider === config.provider)
  const models = providerData?.models ?? []
  const selectedModelLabel = getModelLabel(config, providers)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function setProvider(provider: ProviderName) {
    const providerInfo = providers.find(item => item.provider === provider)
    const model = providerInfo?.models[0]?.id ?? config.model
    onChange({ ...config, provider, model })
  }

  return (
    <div className="stream-config-row" ref={menuRef}>
      <div className="stream-config">
        <button type="button" className="stream-text-trigger" onClick={() => setOpenMenu(current => current === 'model' ? null : 'model')}>
          {selectedModelLabel}
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
                  title={!provider.hasKey ? 'API klíč není nastaven' : provider.label}
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

function ChatColumn({
  slot,
  providers,
  onConfigChange,
  index,
}: {
  slot: SlotState
  providers: LiveProvider[]
  onConfigChange: (config: SlotConfig) => void
  index: number
}) {
  const color = PROVIDER_COLORS[slot.config.provider] ?? '#6b7280'
  const providerLabel = PROVIDER_LABELS[slot.config.provider] ?? slot.config.provider
  const modelLabel = getModelLabel(slot.config, providers)
  const providerData = providers.find(provider => provider.provider === slot.config.provider)
  const connected = providerData?.source === 'live' && providerData.hasKey
  const columnRef = useRef<HTMLDivElement>(null)
  const lastMessage = slot.messages[slot.messages.length - 1]

  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [slot.messages.length])

  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [lastMessage?.content])

  return (
    <section className="parallel-column">
      <header className="parallel-column-header">
        <div>
          <div className="column-kicker">Model {index + 1}</div>
          <div className="provider-badge">
            <span className="provider-dot" style={{ background: color }} />
            <span style={{ color, fontWeight: 600 }}>{providerLabel}</span>
            <span className="provider-meta">{modelLabel}</span>
            {connected && <span className="connection-status connected"><span className="provider-dot" /> online</span>}
          </div>
        </div>
        <SlotSettings config={slot.config} providers={providers} onChange={onConfigChange} />
      </header>

      <div className="parallel-column-body" ref={columnRef}>
        {slot.messages.length === 0 && !slot.loading && (
          <div className="column-empty">
            Tady poběží čistý dialog s tímto modelem.
          </div>
        )}

        {slot.messages.map((message, messageIndex) => (
          <div key={messageIndex} className={`thread-message thread-message-${message.role}`}>
            <div className="thread-message-meta">{message.role === 'user' ? 'Ty' : providerLabel}</div>

            {message.role === 'assistant' && message.status === 'loading' ? (
              <>
                {message.content ? (
                  <SafeMarkdown text={message.content} className="thread-message-content" />
                ) : null}
                <div className="loading-state">
                  <span className="spinner" />
                  <span>Generuji odpověď…</span>
                </div>
              </>
            ) : message.role === 'assistant' && message.status === 'error' ? (
              <div className="error-msg">{message.error ?? 'Nepodařilo se vygenerovat odpověď.'}</div>
            ) : (
              <SafeMarkdown text={message.content} className={`thread-message-content ${message.role === 'user' ? 'thread-message-user' : ''}`} />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ThreeAnswers({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [slots, setSlots] = useState<SlotState[]>(() =>
    DEFAULT_SLOTS.map(config => ({ config, messages: [], loading: false }))
  )
  const [input, setInput] = useState('')
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
    setSlots(previous =>
      previous.map(slot => {
        const provider = providers.find(item => item.provider === slot.config.provider)
        if (!provider) return slot
        const modelExists = provider.models.some(model => model.id === slot.config.model)
        if (modelExists) return slot
        return { ...slot, config: { ...slot.config, model: provider.models[0]?.id ?? slot.config.model } }
      })
    )
  }, [providers])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input])

  function updateSlotConfig(index: number, config: SlotConfig) {
    setSlots(previous => previous.map((slot, slotIndex) => (slotIndex === index ? { ...slot, config } : slot)))
  }

  async function sendMessage() {
    const prompt = input.trim()
    if (!prompt) return
    const promptWithAttachments = appendAttachmentContext(prompt)

    setInput('')
    setSlots(previous =>
      previous.map(slot => ({
        ...slot,
        loading: true,
        messages: [
          ...slot.messages,
          { role: 'user', content: prompt, status: 'done' },
          { role: 'assistant', content: '', status: 'loading' },
        ],
      }))
    )

    await Promise.allSettled(
      slots.map(async (slot, index) => {
        const history = slot.messages
          .filter(message => message.status !== 'loading')
          .map(message => ({ role: message.role as 'user' | 'assistant', content: message.content }))

        try {
          await streamChatCompletion({
            messages: [...history, { role: 'user', content: promptWithAttachments }],
            modelConfig: slot.config,
            apiKeys,
            onDelta: delta => {
              setSlots(previous =>
                previous.map((currentSlot, slotIndex) => {
                  if (slotIndex !== index) return currentSlot
                  const nextMessages = [...currentSlot.messages]
                  const current = nextMessages[nextMessages.length - 1]
                  nextMessages[nextMessages.length - 1] = {
                    role: 'assistant',
                    content: `${current?.content ?? ''}${delta}`,
                    status: 'loading',
                  }
                  return { ...currentSlot, messages: nextMessages }
                }),
              )
            },
          })

          setSlots(previous =>
            previous.map((currentSlot, slotIndex) => {
              if (slotIndex !== index) return currentSlot
              const nextMessages = [...currentSlot.messages]
              const current = nextMessages[nextMessages.length - 1]
              nextMessages[nextMessages.length - 1] = { role: 'assistant', content: current?.content ?? '', status: 'done' }
              return { ...currentSlot, loading: false, messages: nextMessages }
            })
          )
        } catch (error) {
          setSlots(previous =>
            previous.map((currentSlot, slotIndex) => {
              if (slotIndex !== index) return currentSlot
              const nextMessages = [...currentSlot.messages]
              nextMessages[nextMessages.length - 1] = {
                role: 'assistant',
                content: '',
                status: 'error',
                error: error instanceof Error ? error.message : 'Nepodařilo se vygenerovat odpověď.',
              }
              return { ...currentSlot, loading: false, messages: nextMessages }
            })
          )
        }
      })
    )
    clearAttachments()
  }

  function clearAll() {
    setSlots(previous => previous.map(slot => ({ ...slot, messages: [], loading: false })))
    setInput('')
    clearAttachments()
  }

  const anyLoading = slots.some(slot => slot.loading)
  const hasConversation = useMemo(() => slots.some(slot => slot.messages.length > 0), [slots])

  return (
    <div className="tab-page">
      <div className="parallel-page-header">
        <div>
          <h2>Tři odpovědi</h2>
          <p>Jeden prompt, tři paralelní dialogy. Bez rolí a bez zbytečných panelů.</p>
        </div>
        {hasConversation && (
          <button type="button" className="btn-secondary" onClick={clearAll}>
            Nový chat
          </button>
        )}
      </div>

      <div className="parallel-grid">
        {slots.map((slot, index) => (
          <ChatColumn
            key={index}
            index={index}
            slot={slot}
            providers={providers}
            onConfigChange={config => updateSlotConfig(index, config)}
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
              placeholder="Napiš zprávu pro všechny tři modely…"
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (!anyLoading) sendMessage()
                }
              }}
              rows={1}
              disabled={anyLoading}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={sendMessage} disabled={anyLoading || !input.trim()} aria-label="Odeslat">
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
