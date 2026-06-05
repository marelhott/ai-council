import { useEffect, useMemo, useRef, useState } from 'react'
import type { APIKeys, BrainstormMessage, RoleConfig } from '../../types/index'
import SafeMarkdown from '../ui/SafeMarkdown'
import { getModelLabel } from '../ui/modelLabels'
import { TEXT_ATTACHMENT_ACCEPT, useComposerAttachments } from '../ui/useComposerAttachments'
import { useProviders } from '../ui/useProviders'

interface BrainstormTurn {
  id: string
  prompt: string
  messages: BrainstormMessage[]
}

const OPENAI_CONFIG: RoleConfig = {
  provider: 'openai',
  model: 'gpt-5.5',
  thinkingLevel: 'medium',
}

const CLAUDE_CONFIG: RoleConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  thinkingLevel: 'medium',
}

const BRAINSTORM_EXAMPLES = [
  'Jak postavit jednoduchý SaaS pro malé restaurace?',
  'Jaký je nejlepší první krok při přechodu z freelance na agenturu?',
  'Jak zlepšit onboarding nových uživatelů v B2B aplikaci?',
]

export default function Brainstorm({ apiKeys }: { apiKeys: APIKeys }) {
  const providers = useProviders(apiKeys)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<BrainstormTurn[]>([])
  const [running, setRunning] = useState(false)
  const [continuing, setContinuing] = useState<string | null>(null)
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
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const gptLabel = getModelLabel(OPENAI_CONFIG, providers)
  const claudeLabel = getModelLabel(CLAUDE_CONFIG, providers)

  async function executeBrainstorm({
    prompt,
    turnId,
    preserveInput = false,
  }: {
    prompt: string
    turnId?: string
    preserveInput?: boolean
  }) {
    if (!prompt.trim() || running) return

    const actualTurnId = turnId ?? crypto.randomUUID()
    const promptWithAttachments = appendAttachmentContext(prompt)
    const pendingMessages: BrainstormMessage[] = turnId
      ? []
      : [
      {
        role: 'user',
        speaker: 'user',
        speakerLabel: 'Ty',
        content: prompt,
        status: 'done',
      },
    ]

    try {
      setRunning(true)
      if (!preserveInput) setInput('')

      if (turnId) {
        setContinuing(turnId)
      } else {
        setTurns(previous => [...previous, { id: actualTurnId, prompt, messages: pendingMessages }])
      }

      const response = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptWithAttachments,
          openaiConfig: OPENAI_CONFIG,
          anthropicConfig: CLAUDE_CONFIG,
          apiKeys,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Brainstorm se nepodařilo spustit.')
      }

      const data = await response.json() as { messages: BrainstormMessage[] }
      setTurns(previous =>
        previous.map(turn =>
          turn.id === actualTurnId
            ? { ...turn, messages: turnId ? [...turn.messages, ...data.messages] : [pendingMessages[0], ...data.messages] }
            : turn,
        ),
      )
    } catch (error) {
      if (turnId) {
        setTurns(previous =>
          previous.map(turn =>
            turn.id === actualTurnId
              ? {
                  ...turn,
                  messages: [
                    ...turn.messages,
                    {
                      role: 'assistant',
                      speaker: 'openai',
                      speakerLabel: 'Brainstorm',
                      content: '',
                      status: 'error',
                      error: error instanceof Error ? error.message : 'Brainstorm se nepodařilo spustit.',
                    },
                  ],
                }
              : turn,
          ),
        )
      } else {
        setTurns(previous =>
          previous.map(turn =>
            turn.id === actualTurnId
              ? {
                  ...turn,
                  messages: [
                    pendingMessages[0],
                    {
                      role: 'assistant',
                      speaker: 'openai',
                      speakerLabel: 'Brainstorm',
                      content: '',
                      status: 'error',
                      error: error instanceof Error ? error.message : 'Brainstorm se nepodařilo spustit.',
                    },
                  ],
                }
              : turn,
          ),
        )
      }
    } finally {
      setRunning(false)
      setContinuing(null)
      clearAttachments()
    }
  }

  async function runBrainstorm() {
    const prompt = input.trim()
    if (!prompt || running) return
    await executeBrainstorm({ prompt })
  }

  async function continueBrainstorm(turn: BrainstormTurn) {
    const lastAssistantMessage = [...turn.messages].reverse().find(message => message.role === 'assistant' && message.content.trim())
    if (!lastAssistantMessage) return
    await executeBrainstorm({ prompt: lastAssistantMessage.content, turnId: turn.id, preserveInput: true })
  }

  function clearConversation() {
    setTurns([])
    setInput('')
    clearAttachments()
  }

  const hasConversation = useMemo(() => turns.length > 0, [turns.length])

  return (
    <div className="tab-page">
      <div className="thread-page-header">
        <div>
          <h2>Brainstorm</h2>
          <p>GPT-5.5 a Claude Opus si bez systémových promptů přehazují odpověď jako další vstup a postupně ji brousí.</p>
        </div>
        {hasConversation && (
          <button type="button" className="btn-secondary" onClick={clearConversation}>
            Nový chat
          </button>
        )}
      </div>

      <div className="chat-thread">
        <div className="thread-narrow">
          {turns.length === 0 ? (
            <div className="empty-state empty-state-large">
              <p>Začni jednou otázkou a sleduj, jak si ji GPT-5.5 a Claude Opus mezi sebou dál přepisují a zpřesňují.</p>
              <div className="example-row">
                {BRAINSTORM_EXAMPLES.map(example => (
                  <button key={example} type="button" className="example-chip" onClick={() => setInput(example)}>
                    {example}
                  </button>
                ))}
              </div>
              <div className="single-config-strip">
                <div className="inline-role-config">
                  <div className="provider-badge">
                    <span className="provider-dot" style={{ background: '#10a37f' }} />
                    <span>{gptLabel}</span>
                  </div>
                </div>
                <div className="inline-role-config">
                  <div className="provider-badge">
                    <span className="provider-dot" style={{ background: '#d97706' }} />
                    <span>{claudeLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            turns.map(turn => (
              <div key={turn.id} className="thread-turn thread-turn-stacked">
                {turn.messages.map((message, index) => (
                  <div key={`${turn.id}-${index}`} className={`thread-message thread-message-${message.role}`}>
                    <div className="thread-message-meta">
                      {message.speakerLabel}
                      {message.modelName ? ` · ${message.modelName}` : ''}
                    </div>
                    {message.status === 'error' ? (
                      <div className="error-msg">{message.error ?? 'Nepodařilo se vygenerovat odpověď.'}</div>
                    ) : (
                      <SafeMarkdown
                        text={message.content}
                        className={`thread-message-content ${message.role === 'user' ? 'thread-message-user' : ''}`}
                      />
                    )}
                  </div>
                ))}
                <div className="refine-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={running}
                    onClick={() => continueBrainstorm(turn)}
                  >
                    {continuing === turn.id ? 'Brousím dál…' : 'Pokračovat v broušení'}
                  </button>
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
              placeholder="Napiš zadání pro brainstorm…"
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  runBrainstorm()
                }
              }}
              rows={1}
              disabled={running}
            />
            <div className="composer-controls">
              <button type="button" className="composer-submit" onClick={runBrainstorm} disabled={running || !input.trim()} aria-label="Odeslat">
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
