import { useEffect, useRef, useState } from 'react'
import type { RoleConfig, ThinkingLevel } from '../../types/index'
import type { LiveProvider } from './useProviders'

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  low: 'Rychlé',
  medium: 'Standard',
  high: 'Hluboké',
}

function formatModelLabel(model: string) {
  return model.replace(/^gpt-/, 'GPT-').replace('claude-', 'Claude ').replace(/-/g, ' ')
}

export default function ModelPicker({
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
          {formatModelLabel(config.model)}
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
