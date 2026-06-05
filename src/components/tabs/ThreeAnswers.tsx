/**
 * Tři odpovědi — čistý paralelní chat.
 * Žádné role, žádné systémové prompty. Tři modely odpovídají stejně jako na normálním chatu.
 * Uživatel si vybere 3 libovolné modely (klidně stejné) a chatuje s nimi paralelně.
 */
import { useState, useRef, useEffect } from 'react'
import type { ProviderName, ThinkingLevel } from '../../types/index'
import { useProviders, type LiveProvider } from '../ui/AIConfigPanel'

// ---- Types ----

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

// ---- Constants ----

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f', anthropic: '#d97706', gemini: '#4285f4', mock: '#6b7280',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', mock: 'Mock',
}

const DEFAULT_SLOTS: SlotConfig[] = [
  { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
]

// ---- Slot selector (provider + model + thinking) ----

function SlotSelector({ config, providers, onChange, index }: {
  config: SlotConfig
  providers: LiveProvider[]
  onChange: (c: SlotConfig) => void
  index: number
}) {
  const pData = providers.find(p => p.provider === config.provider)
  const models = pData?.models ?? []
  const color = pData?.color ?? '#6b7280'

  function setProvider(provider: ProviderName) {
    const p = providers.find(p => p.provider === provider)
    const model = p?.models[0]?.id ?? config.model
    onChange({ ...config, provider, model })
  }

  return (
    <div className="slot-selector">
      <div className="slot-selector-header">
        <span className="slot-num">Model {index + 1}</span>
      </div>
      {/* Provider pills */}
      <div className="slot-provider-pills">
        {providers.map(p => (
          <button
            key={p.provider}
            className={`slot-provider-pill ${config.provider === p.provider ? 'active' : ''}`}
            style={config.provider === p.provider ? { borderColor: p.color, color: p.color, background: p.color + '15' } : {}}
            onClick={() => setProvider(p.provider)}
            title={!p.hasKey && p.provider !== 'mock' ? 'API klíč není nastaven' : p.label}
          >
            {p.label}
            {!p.hasKey && p.provider !== 'mock' && <span className="no-key-dot">!</span>}
          </button>
        ))}
      </div>
      {/* Model — free-text + datalist suggestions */}
      <input
        type="text"
        className="ai-config-select"
        list={`slot-models-${index}`}
        value={config.model}
        onChange={e => onChange({ ...config, model: e.target.value })}
        placeholder="napiš libovolný model ID..."
        spellCheck={false}
        autoComplete="off"
      />
      <datalist id={`slot-models-${index}`}>
        {models.map(m => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </datalist>
      {/* Thinking level */}
      <div className="slot-thinking">
        {(['low', 'medium', 'high'] as ThinkingLevel[]).map(lvl => {
          const labels = { low: 'Rychlé', medium: 'Standard', high: 'Hluboké' }
          return (
            <button
              key={lvl}
              className={`thinking-pill ${config.thinkingLevel === lvl ? 'active' : ''}`}
              style={config.thinkingLevel === lvl ? { borderColor: color, color, background: color + '15' } : {}}
              onClick={() => onChange({ ...config, thinkingLevel: lvl })}
            >
              {labels[lvl]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- Single chat column ----

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
}

function ChatColumn({ slot }: { slot: SlotState; index: number }) {
  const color = PROVIDER_COLORS[slot.config.provider] ?? '#6b7280'
  const providerLabel = PROVIDER_LABELS[slot.config.provider] ?? slot.config.provider
  const modelLabel = slot.config.model === 'mock-cs-v1' ? 'Demo' : slot.config.model
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [slot.messages.length])

  return (
    <div className="chat-column">
      <div className="chat-column-header" style={{ borderTop: `3px solid ${color}` }}>
        <div className="provider-badge">
          <span className="provider-dot" style={{ background: color }} />
          <span style={{ color, fontWeight: 700 }}>{providerLabel}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {modelLabel}</span>
        </div>
      </div>
      <div className="chat-column-body">
        {slot.messages.length === 0 && !slot.loading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>
            Odpověď se zobrazí tady
          </div>
        )}
        {slot.messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            {msg.role === 'user' ? (
              <div className="chat-msg-user">{msg.content}</div>
            ) : msg.status === 'loading' ? (
              <div className="loading-state" style={{ padding: '8px 0' }}>
                <span className="spinner" />
                <span>Přemýšlí…</span>
              </div>
            ) : msg.status === 'error' ? (
              <div className="error-msg">{msg.error ?? 'Chyba při generování.'}</div>
            ) : (
              <div className="prose chat-msg-ai" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ---- Main component ----

export default function ThreeAnswers() {
  const providers = useProviders()

  const [slots, setSlots] = useState<SlotState[]>(() =>
    DEFAULT_SLOTS.map(config => ({ config, messages: [], loading: false }))
  )
  const [input, setInput] = useState('')
  const [hasConversation, setHasConversation] = useState(false)

  // Sync provider defaults once providers are loaded
  useEffect(() => {
    if (!providers.length) return
    setSlots(prev => prev.map(slot => {
      const p = providers.find(p => p.provider === slot.config.provider)
      if (!p) return slot
      const modelExists = p.models.some(m => m.id === slot.config.model)
      if (modelExists) return slot
      return { ...slot, config: { ...slot.config, model: p.models[0]?.id ?? slot.config.model } }
    }))
  }, [providers.length])

  function updateSlotConfig(i: number, config: SlotConfig) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, config } : s))
  }

  async function sendMessage() {
    const prompt = input.trim()
    if (!prompt) return
    setInput('')
    setHasConversation(true)

    // Optimistically add user message + loading placeholder to each slot
    setSlots(prev => prev.map(slot => ({
      ...slot,
      loading: true,
      messages: [
        ...slot.messages,
        { role: 'user', content: prompt },
        { role: 'assistant', content: '', status: 'loading' },
      ],
    })))

    // Fire all 3 requests in parallel, each independent
    await Promise.allSettled(
      slots.map(async (slot, i) => {
        const history = slot.messages
          .filter(m => m.status !== 'loading')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        try {
          const res = await fetch('/api/pure-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [...history, { role: 'user', content: prompt }],
              modelConfig: slot.config,
            }),
          })

          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data: { content: string } = await res.json()

          setSlots(prev => prev.map((s, idx) => {
            if (idx !== i) return s
            const msgs = [...s.messages]
            msgs[msgs.length - 1] = { role: 'assistant', content: data.content, status: 'done' }
            return { ...s, loading: false, messages: msgs }
          }))
        } catch (err) {
          setSlots(prev => prev.map((s, idx) => {
            if (idx !== i) return s
            const msgs = [...s.messages]
            msgs[msgs.length - 1] = { role: 'assistant', content: '', status: 'error', error: 'Nepodařilo se vygenerovat odpověď.' }
            return { ...s, loading: false, messages: msgs }
          }))
        }
      })
    )
  }

  function clearAll() {
    setSlots(prev => prev.map(s => ({ ...s, messages: [], loading: false })))
    setHasConversation(false)
    setInput('')
  }

  const anyLoading = slots.some(s => s.loading)

  return (
    <div className="workspace-layout">
      {/* ── Left sidebar ── */}
      <aside className="workspace-sidebar">
        <div className="panel-card panel-card-sticky">
          <div className="tab-header">
            <h2>Tři odpovědi</h2>
            <p className="sub">Čistý paralelní chat. Žádné role, žádné instrukce. Tři modely vedle sebe.</p>
          </div>

          {/* Input */}
          <div className="input-form">
            <textarea
              className="main-input"
              placeholder="Napiš cokoliv…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) sendMessage() }}
              rows={4}
              disabled={anyLoading}
            />
            <button className="btn-primary" onClick={sendMessage} disabled={anyLoading || !input.trim()}>
              {anyLoading ? <><span className="spinner" /> Generuji…</> : hasConversation ? 'Pokračovat' : 'Odeslat'}
            </button>
          </div>

          {hasConversation && (
            <button className="btn-secondary btn-secondary-block" onClick={clearAll}>
              Nový chat
            </button>
          )}

          {/* Model selectors */}
          <div className="ai-config-panel">
            <div className="sidebar-actions-title" style={{ padding: '10px 0 8px' }}>Výběr modelů</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {slots.map((slot, i) => (
                <SlotSelector
                  key={i}
                  index={i}
                  config={slot.config}
                  providers={providers}
                  onChange={cfg => updateSlotConfig(i, cfg)}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Right: 3 chat columns ── */}
      <section className="workspace-results" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="chat-columns-grid">
          {slots.map((slot, i) => (
            <ChatColumn key={i} slot={slot} index={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
