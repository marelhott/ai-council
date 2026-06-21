import { useState } from 'react'
import type { APIKeys } from '../../types/index'
import type { LiveProvider } from './useProviders'

interface Props {
  apiKeys: APIKeys
  open: boolean
  providers: LiveProvider[]
  onClose: () => void
  onSave: (keys: APIKeys) => void
}

const LABELS: Record<keyof APIKeys, string> = {
  openai: 'OpenAI API key',
  anthropic: 'Anthropic API key',
  gemini: 'Gemini API key',
}

export default function SettingsPanel({ apiKeys, open, providers, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<APIKeys>(apiKeys)

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={event => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h3>Nastavení</h3>
            <p>Pro deploy verzi patří produkční klíče do Vercel env. Stav říká jen to, že klíč existuje; billing a limity se ověří až při generování.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít nastavení">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {(Object.keys(LABELS) as Array<keyof APIKeys>).map(key => {
            const provider = providers.find(item => item.provider === key)
            const connected = provider?.source === 'live' && provider.hasKey
            return (
              <label key={key} className="settings-field">
                <div className="settings-field-head">
                  <span>{LABELS[key]}</span>
                  <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                    <span className="provider-dot" />
                    {connected ? 'Klíč nalezen' : provider?.hasKey ? 'Uloženo, ale neověřeno' : 'Bez klíče'}
                  </span>
                </div>
                <input
                  className="settings-input"
                  type="text"
                  value={draft[key]}
                  onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))}
                  placeholder={`Vlož ${LABELS[key]}`}
                  spellCheck={false}
                />
              </label>
            )
          })}
        </div>

        <div className="settings-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Zavřít
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            Uložit klíče
          </button>
        </div>
      </div>
    </div>
  )
}
