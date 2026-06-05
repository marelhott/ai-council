import { useState } from 'react'
import type { APIKeys, RoleConfig, ProviderName, ThinkingLevel } from '../../types/index'
import { useProviders } from './useProviders'

const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-5.5',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-3.5-flash',
}

const THINKING_LABELS: Record<ThinkingLevel, string> = { low: 'Rychlé', medium: 'Standard', high: 'Hluboké' }
const THINKING_TIPS: Record<ThinkingLevel, string> = {
  low:    'Rychlá, konzistentní — nízká teplota / minimal reasoning',
  medium: 'Vyvážená — doporučeno pro většinu dotazů',
  high:   'Hluboké přemýšlení — extended thinking / max reasoning effort',
}

interface Role { key: string; label: string }

interface Props {
  apiKeys: APIKeys
  roles: Role[]
  configs: Record<string, RoleConfig>
  onChange: (configs: Record<string, RoleConfig>) => void
  defaultOpen?: boolean
}

export default function AIConfigPanel({ apiKeys, roles, configs, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const providers = useProviders(apiKeys)

  function updateConfig(roleKey: string, patch: Partial<RoleConfig>) {
    const current = configs[roleKey]
    const updated = { ...current, ...patch }
    if (patch.provider && patch.provider !== current.provider) {
      // auto-select first available model for the new provider
      const p = providers.find(p => p.provider === patch.provider)
      updated.model = p?.models[0]?.id ?? DEFAULT_MODELS[patch.provider] ?? ''
    }
    onChange({ ...configs, [roleKey]: updated })
  }

  function getProvider(name: ProviderName) {
    return providers.find(p => p.provider === name)
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
            const pData = getProvider(cfg.provider)
            const models = pData?.models ?? []
            const pColor = pData?.color ?? '#6b7280'
            return (
              <div key={role.key} className="ai-config-row">
                <div className="ai-config-role-label">{role.label}</div>
                <div className="ai-config-fields">
                  <div className="ai-config-field">
                    <label>AI</label>
                    <div className="ai-config-provider-pills">
                      {providers.map(p => (
                        <button
                          key={p.provider}
                          className={`provider-pill ${cfg.provider === p.provider ? 'active' : ''} ${!p.hasKey ? 'no-key' : ''}`}
                          style={cfg.provider === p.provider ? { borderColor: p.color, color: p.color, background: p.color + '18' } : {}}
                          onClick={() => updateConfig(role.key, { provider: p.provider })}
                          title={!p.hasKey ? 'API klíč není nastaven' : `${p.label} (${p.source})`}
                        >
                          {p.label}
                          {!p.hasKey && <span className="no-key-dot">!</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ai-config-field">
                    <label>
                      Model
                      {pData?.source === 'live' && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>● live</span>
                      )}
                    </label>
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
                          style={cfg.thinkingLevel === lvl ? { borderColor: pColor, color: pColor, background: pColor + '18' } : {}}
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
