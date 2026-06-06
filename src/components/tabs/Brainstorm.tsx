import { useEffect, useMemo, useRef, useState } from 'react'
import type { APIKeys, BrainstormMessage, RoleConfig } from '../../types/index'
import SafeMarkdown from '../ui/SafeMarkdown'
import { getModelLabel } from '../ui/modelLabels'
import { TEXT_ATTACHMENT_ACCEPT, useComposerAttachments } from '../ui/useComposerAttachments'
import { useProviders } from '../ui/useProviders'
import { streamChatCompletion } from '../../lib/streaming'

type Side = 'left' | 'right'

interface RelayState {
  leftMessages: BrainstormMessage[]
  rightMessages: BrainstormMessage[]
  nextTarget: Side
  transferFrom: Side | null
}

const LEFT_CONFIG: RoleConfig = {
  provider: 'openai',
  model: 'gpt-5.5',
  thinkingLevel: 'medium',
}

const RIGHT_CONFIG: RoleConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  thinkingLevel: 'medium',
}

const BRAINSTORM_EXAMPLES = [
  'Jak postavit jednoduchý SaaS pro malé restaurace?',
  'Jak navrhnout lepší onboarding pro nového B2B zákazníka?',
  'Jak přejít z freelance na malou agenturu bez chaosu?',
]

function BrainstormColumn({
  title,
  accent,
  modelLabel,
  messages,
}: {
  title: string
  accent: string
  modelLabel: string
  messages: BrainstormMessage[]
}) {
  const columnRef = useRef<HTMLDivElement>(null)
  const lastMessage = messages[messages.length - 1]

  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [lastMessage?.content])

  return (
    <section className="parallel-column brainstorm-column">
      <header className="parallel-column-header">
        <div>
          <div className="column-kicker" style={{ color: accent }}>{title}</div>
          <div className="provider-badge">
            <span className="provider-dot" style={{ background: accent }} />
            <span style={{ color: accent, fontWeight: 600 }}>{modelLabel}</span>
          </div>
        </div>
      </header>

      <div className="parallel-column-body" ref={columnRef}>
        {messages.length === 0 ? (
          <div className="column-empty">Tady se objeví předaný prompt a následná odpověď.</div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.speaker}-${index}`} className={`thread-message thread-message-${message.role}`}>
              <div className="thread-message-meta">
                {message.role === 'user' ? 'Přijatý prompt' : message.speakerLabel}
              </div>
              {message.status === 'loading' ? (
                <>
                  {message.content ? <SafeMarkdown text={message.content} className="thread-message-content" /> : null}
                  <div className="loading-state">
                    <span className="spinner" />
                    <span>Generuji odpověď…</span>
                  </div>
                </>
              ) : message.status === 'error' ? (
                <div className="error-msg">{message.error ?? 'Nepodařilo se vygenerovat odpověď.'}</div>
              ) : (
                <SafeMarkdown
                  text={message.content}
                  className={`thread-message-content ${message.role === 'user' ? 'thread-message-user' : ''}`}
                />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default function Brainstorm({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [relay, setRelay] = useState<RelayState>({
    leftMessages: [],
    rightMessages: [],
    nextTarget: 'left',
    transferFrom: null,
  })
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
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input])

  const leftLabel = getModelLabel(LEFT_CONFIG, providers)
  const rightLabel = getModelLabel(RIGHT_CONFIG, providers)

  const hasConversation = relay.leftMessages.length > 0 || relay.rightMessages.length > 0

  const transferLabel = useMemo(() => {
    if (relay.transferFrom === 'left') return `${leftLabel} -> ${rightLabel}`
    if (relay.transferFrom === 'right') return `${rightLabel} -> ${leftLabel}`
    return ''
  }, [leftLabel, relay.transferFrom, rightLabel])

  async function runOnSide(side: Side, prompt: string) {
    const modelConfig = side === 'left' ? LEFT_CONFIG : RIGHT_CONFIG
    const speakerLabel = side === 'left' ? leftLabel : rightLabel
    const speaker = side === 'left' ? 'openai' : 'anthropic'
    const messageListKey = side === 'left' ? 'leftMessages' : 'rightMessages'

    setRelay(previous => ({
      ...previous,
      [messageListKey]: [
        ...previous[messageListKey],
        { role: 'user', speaker: 'user', speakerLabel: 'Přijatý prompt', content: prompt, status: 'done' },
        { role: 'assistant', speaker, speakerLabel, modelName: modelConfig.model, content: '', status: 'loading' },
      ],
      transferFrom: null,
    }))

    try {
      await streamChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        modelConfig,
        apiKeys,
        maxTokens: 700,
        onDelta: delta => {
          setRelay(previous => {
            const messages = [...previous[messageListKey]]
            const current = messages[messages.length - 1]
            messages[messages.length - 1] = {
              role: 'assistant',
              speaker,
              speakerLabel,
              modelName: modelConfig.model,
              content: `${current?.content ?? ''}${delta}`,
              status: 'loading',
            }
            return { ...previous, [messageListKey]: messages }
          })
        },
      })

      setRelay(previous => {
        const messages = [...previous[messageListKey]]
        const current = messages[messages.length - 1]
        messages[messages.length - 1] = {
          role: 'assistant',
          speaker,
          speakerLabel,
          modelName: modelConfig.model,
          content: current?.content ?? '',
          status: 'done',
        }

        return {
          ...previous,
          [messageListKey]: messages,
          transferFrom: side,
          nextTarget: side === 'left' ? 'right' : 'left',
        }
      })
    } catch (error) {
      setRelay(previous => {
        const messages = [...previous[messageListKey]]
        messages[messages.length - 1] = {
          role: 'assistant',
          speaker,
          speakerLabel,
          modelName: modelConfig.model,
          content: '',
          status: 'error',
          error: error instanceof Error ? error.message : 'Nepodařilo se vygenerovat odpověď.',
        }
        return { ...previous, [messageListKey]: messages }
      })
    }
  }

  async function submitIntervention() {
    const prompt = input.trim()
    if (!prompt || running) return

    setRunning(true)
    const nextPrompt = appendAttachmentContext(prompt)
    const target = relay.nextTarget
    setInput('')

    try {
      await runOnSide(target, nextPrompt)
    } finally {
      setRunning(false)
      clearAttachments()
    }
  }

  async function transferToOtherSide() {
    if (running || !relay.transferFrom) return

    const sourceMessages = relay.transferFrom === 'left' ? relay.leftMessages : relay.rightMessages
    const latestResponse = [...sourceMessages].reverse().find(message => message.role === 'assistant' && message.status === 'done' && message.content.trim())
    if (!latestResponse) return

    setRunning(true)
    try {
      await runOnSide(relay.transferFrom === 'left' ? 'right' : 'left', latestResponse.content)
    } finally {
      setRunning(false)
    }
  }

  function clearConversation() {
    setRelay({
      leftMessages: [],
      rightMessages: [],
      nextTarget: 'left',
      transferFrom: null,
    })
    setInput('')
    clearAttachments()
  }

  const placeholder = hasConversation
    ? `Usměrni další tah pro ${relay.nextTarget === 'left' ? leftLabel : rightLabel}…`
    : `Začni zadáním pro ${leftLabel}…`

  return (
    <div className="tab-page">
      <div className="thread-page-header">
        <div>
          <h2>Brainstorm</h2>
          <p>Dva modely si ručně předávají celý výstup jako další prompt a prostřední vstup slouží jen pro tvoje zásahy do směru.</p>
        </div>
        {hasConversation && (
          <button type="button" className="btn-secondary" onClick={clearConversation}>
            Nový chat
          </button>
        )}
      </div>

      <div className="parallel-grid brainstorm-grid">
        <BrainstormColumn title="Levá stopa" accent="#10a37f" modelLabel={leftLabel} messages={relay.leftMessages} />

        <div className="brainstorm-transfer">
          <div className="brainstorm-transfer-inner">
            <div className="brainstorm-transfer-label">
              {relay.transferFrom ? 'Přesuň poslední odpověď jako nový prompt' : 'Nejdřív spusť první odpověď vlevo'}
            </div>
            <button
              type="button"
              className="brainstorm-arrow"
              disabled={!relay.transferFrom || running}
              onClick={transferToOtherSide}
              aria-label="Přesunout odpověď do druhého sloupce"
            >
              {relay.transferFrom === 'right' ? '←' : '→'}
            </button>
            {relay.transferFrom && <div className="brainstorm-transfer-meta">{transferLabel}</div>}
          </div>
        </div>

        <BrainstormColumn title="Pravá stopa" accent="#d97706" modelLabel={rightLabel} messages={relay.rightMessages} />
      </div>

      {!hasConversation && (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <div className="example-row">
            {BRAINSTORM_EXAMPLES.map(example => (
              <button key={example} type="button" className="example-chip" onClick={() => setInput(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

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
              placeholder={placeholder}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitIntervention()
                }
              }}
              rows={1}
              disabled={running}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={submitIntervention} disabled={running || !input.trim()} aria-label="Odeslat">
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
