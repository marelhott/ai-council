import { useState, useRef, useEffect } from 'react'
import type { ConversationRound, RoleResponse, RoleConfig } from '../../types/index'
import AIConfigPanel from '../ui/AIConfigPanel'

const PROVIDER_COLORS: Record<string, string> = {
  openai:    '#10a37f',
  anthropic: '#d97706',
  gemini:    '#4285f4',
  claude:    '#d97706',
  mock:      '#6b7280',
}

const ROLE_COLORS: Record<string, string> = {
  practical: '#10b981',
  critical:  '#ef4444',
  creative:  '#8b5cf6',
}

const ROLES_CONFIG = [
  { key: 'practical', label: 'Praktický poradce' },
  { key: 'critical',  label: 'Kritický oponent' },
  { key: 'creative',  label: 'Kreativní stratég' },
]

const DEFAULT_CONFIGS: Record<string, RoleConfig> = {
  practical: { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  critical:  { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
  creative:  { provider: 'mock', model: 'mock-cs-v1', thinkingLevel: 'medium' },
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,4} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
}

function AnswerCard({ response }: { response: RoleResponse }) {
  const providerColor = PROVIDER_COLORS[response.providerName] ?? '#6b7280'
  const roleColor = ROLE_COLORS[response.roleName] ?? '#6366f1'

  return (
    <div className="answer-card">
      <div className="answer-card-header" style={{ borderTop: `3px solid ${roleColor}` }}>
        <div className="answer-card-role">{response.roleLabel}</div>
        <div className="provider-badge">
          <span className="provider-dot" style={{ background: providerColor }} />
          <span style={{ color: providerColor, fontWeight: 700 }}>
            {response.providerName === 'mock' ? 'Mock' :
             response.providerName === 'anthropic' ? 'Claude' :
             response.providerName === 'openai' ? 'OpenAI' :
             response.providerName === 'gemini' ? 'Gemini' :
             response.providerName}
          </span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {' · '}{response.modelName === 'mock-cs-v1' ? 'Demo' : response.modelName}
          </span>
        </div>
      </div>
      <div className="answer-card-body">
        {response.status === 'pending' && (
          <div className="loading-state"><span className="spinner" /><span>Připravuji odpověď…</span></div>
        )}
        {response.status === 'error' && <div className="error-msg">{response.error}</div>}
        {response.status === 'done' && (
          <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(response.content) }} />
        )}
      </div>
    </div>
  )
}

function RoundBlock({ round, index }: { round: ConversationRound; index: number }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="round-header">Kolo {index + 1}</div>
      {round.userPrompt && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic',
          padding: '7px 12px', background: 'var(--bg-subtle)', borderRadius: 8, borderLeft: '3px solid var(--border)' }}>
          „{round.userPrompt}"
        </div>
      )}
      <div className="three-answers-grid">
        {round.responses.map(r => <AnswerCard key={r.roleName} response={r} />)}
      </div>
    </div>
  )
}

export default function ThreeAnswers() {
  const [prompt, setPrompt] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [rounds, setRounds] = useState<ConversationRound[]>([])
  const [loading, setLoading] = useState(false)
  const [roleConfigs, setRoleConfigs] = useState<Record<string, RoleConfig>>(DEFAULT_CONFIGS)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (rounds.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [rounds])

  async function fetchAnswers(userPrompt: string, isFollowUp: boolean) {
    setLoading(true)

    const history = isFollowUp
      ? rounds.flatMap(r => [
          { role: 'user' as const, content: r.userPrompt, persona: 'all' },
          ...r.responses.map(resp => ({ role: 'assistant' as const, content: resp.content, persona: resp.roleName })),
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

    setRounds(prev => [...prev, pendingRound])

    try {
      const res = await fetch('/api/three-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, history, roleConfigs }),
      })
      if (!res.ok) throw new Error('Server error')
      const data: { responses: RoleResponse[] } = await res.json()
      setRounds(prev => prev.map(r => r.id === pendingRound.id ? { ...r, responses: data.responses } : r))
    } catch {
      setRounds(prev => prev.map(r =>
        r.id === pendingRound.id
          ? { ...r, responses: r.responses.map(resp => ({ ...resp, status: 'error', error: 'Tato odpověď se nepodařila vygenerovat.' })) }
          : r
      ))
    } finally {
      setLoading(false)
    }
  }

  function handleStart() {
    if (!prompt.trim()) return
    setRounds([])
    fetchAnswers(prompt, false)
  }

  function handleFollowUp() {
    if (!followUp.trim() || loading) return
    fetchAnswers(followUp, true)
    setFollowUp('')
  }

  const hasRounds = rounds.length > 0

  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="panel-card panel-card-sticky">
          <div className="tab-header">
            <h2>Tři odpovědi</h2>
            <p className="sub">Polož libovolnou otázku a získej tři různé pohledy vedle sebe.</p>
          </div>

          <div className="input-form">
            <textarea
              className="main-input"
              placeholder="Zeptej se na cokoli…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleStart() }}
              rows={3}
            />
            <button className="btn-primary" onClick={handleStart} disabled={loading || !prompt.trim()}>
              {loading ? <><span className="spinner" /> Připravuji tři odpovědi…</> : 'Získat tři odpovědi'}
            </button>
          </div>

          {hasRounds && (
            <div className="sidebar-actions">
              <div className="sidebar-actions-title">Navázat na konverzaci</div>
              <div className="follow-up-form-sidebar">
                <textarea
                  placeholder="Doplňující otázka…"
                  value={followUp}
                  onChange={e => setFollowUp(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleFollowUp() }}
                  disabled={loading}
                />
                <button className="btn-primary" onClick={handleFollowUp} disabled={loading || !followUp.trim()}>
                  {loading ? <span className="spinner" /> : 'Zeptat se znovu'}
                </button>
              </div>
              <button className="btn-secondary btn-secondary-block" onClick={() => { setRounds([]); setPrompt(''); setFollowUp('') }}>
                Nová otázka
              </button>
            </div>
          )}

          {/* AI Config */}
          <AIConfigPanel
            roles={ROLES_CONFIG}
            configs={roleConfigs}
            onChange={setRoleConfigs}
          />
        </div>
      </aside>

      <section className="workspace-results">
        {hasRounds && (
          <div className="results-toolbar">
            Otázka: <strong>{prompt}</strong>
          </div>
        )}
        {hasRounds ? (
          <div>
            {rounds.map((round, i) => <RoundBlock key={round.id} round={round} index={i} />)}
            <div ref={bottomRef} />
          </div>
        ) : !loading ? (
          <div className="empty-state empty-state-large">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <p>Zadej otázku a vpravo se objeví tři vedle sebe porovnatelné odpovědi.</p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
