import { useState, useEffect } from 'react'
import type { RoleConfig, ProviderOption, ProviderName, ThinkingLevel } from '../../types/index'

// Default models per provider
const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai:    'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5',
  gemini:    'gemini-2.5-flash',
  mock:      'mock-cs-v1',
}

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  low:    'Rychlé',
  medium: 'Standard',
  high:   'Hluboké',
}

const THINKING_TIPS: Record<ThinkingLevel, string> = {
  low:    'Nízká teplota / minimal reasoning — rychlá, konzistentní',
  medium: 'Vyvážená teplota — doporučeno pro většinu dotazů',
  high:   'Vysoká teplota / max reasoning — pomalejší, kreativnější',
}

interface Role {
  key: string
  label: string
}

interface Props {
  roles: Role[]
  configs: Record<string, RoleConfig>
  onChange: (configs: Record<string, RoleConfig>) => void
}

export default function AIConfigPanel({ roles, configs, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>([])

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json())
      .then(d => setProviders(d.providers ?? []))
      .catch(() => {
        // Fallback: show all providers without key status
        setProviders([
          { id: 'openai',    label: 'OpenAI', color: '#10a37f', models: [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' }, { id: 'gpt-4.1', label: 'GPT-4.1' }, { id: 'o4-mini', label: 'o4 Mini' }], hasKey: false },
          { id: 'anthropic', label: 'Claude', color: '#d97706', models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' }, { id: 'claude-opus-4-5', label: 'Opus 4.5' }, { id: 'claude-haiku-3-5', label: 'Haiku 3.5' }], hasKey: false },
          { id: 'gemini',    label: 'Gemini', color: '#4285f4', models: [{ id: 'gemini-2.5-flash', label: '2.5 Flash' }, { id: 'gemini-2.5-pro', label: '2.5 Pro' }, { id: 'gemini-2.0-flash', label: '2.0 Flash' }], hasKey: false },
          { id: 'mock',      label: 'Mock',   color: '#6b7280', models: [{ id: 'mock-cs-v1', label: 'Mock CS v1' }], hasKey: true },
        ])
      })
  }, [])

  function updateConfig(roleKey: string, patch: Partial<RoleConfig>) {
    const current = configs[roleKey]
    const updated = { ...current, ...patch }
    // When provider changes, reset model to default for that provider
    if (patch.provider && patch.provider !== current.provider) {
      updated.model = DEFAULT_MODELS[patch.provider] ?? ''
    }
    onChange({ ...configs, [roleKey]: updated })
  }

  function getProviderColor(pName: ProviderName) {
    return providers.find(p => p.id === pName)?.color ?? '#6b7280'
  }

  function getModels(pName: ProviderName) {
    return providers.find(p => p.id === pName)?.models ?? []
  }

  return (
    <div className="ai-config-panel">
      <button className="ai-config-toggle" onClick={() => setOpen(o => !o)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        Konfigurace AI
        <svg className={`chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="ai-config-body">
          {roles.map(role => {
            const cfg = configs[role.key]
            const models = getModels(cfg.provider)
            return (
              <div key={role.key} className="ai-config-row">
                <div className="ai-config-role-label">{role.label}</div>

                {/* Provider select */}
                <div className="ai-config-fields">
                  <div className="ai-config-field">
                    <label>AI</label>
                    <div className="ai-config-provider-pills">
                      {providers.map(p => (
                        <button
                          key={p.id}
                          className={`provider-pill ${cfg.provider === p.id ? 'active' : ''} ${!p.hasKey && p.id !== 'mock' ? 'no-key' : ''}`}
                          style={cfg.provider === p.id ? { borderColor: p.color, color: p.color, background: p.color + '18' } : {}}
                          onClick={() => updateConfig(role.key, { provider: p.id })}
                          title={!p.hasKey && p.id !== 'mock' ? `${p.requiresKey} není nastaven` : p.label}
                        >
                          {p.label}
                          {!p.hasKey && p.id !== 'mock' && <span className="no-key-dot">!</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ai-config-field">
                    <label>Model</label>
                    <select
                      className="ai-config-select"
                      value={cfg.model}
                      onChange={e => updateConfig(role.key, { model: e.target.value })}
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ai-config-field">
                    <label>Přemýšlení</label>
                    <div className="thinking-pills">
                      {(['low', 'medium', 'high'] as ThinkingLevel[]).map(lvl => (
                        <button
                          key={lvl}
                          className={`thinking-pill ${cfg.thinkingLevel === lvl ? 'active' : ''}`}
                          style={cfg.thinkingLevel === lvl ? { borderColor: getProviderColor(cfg.provider), color: getProviderColor(cfg.provider), background: getProviderColor(cfg.provider) + '18' } : {}}
                          onClick={() => updateConfig(role.key, { thinkingLevel: lvl })}
                          title={THINKING_TIPS[lvl]}
                        >
                          {THINKING_LABELS[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
