import { useState } from 'react'
import WeakestAssumption from './components/tabs/WeakestAssumption'
import ThreeAnswers from './components/tabs/ThreeAnswers'
import ThreePerspectives from './components/tabs/ThreePerspectives'
import Council from './components/tabs/Council'
import Brainstorm from './components/tabs/Brainstorm'
import SettingsPanel from './components/ui/SettingsPanel'
import { useProviders } from './components/ui/useProviders'
import type { APIKeys } from './types/index'
import './index.css'

type Tab = 'weakest' | 'three' | 'perspectives' | 'council' | 'brainstorm'

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'three', label: 'Tři odpovědi', hint: 'Čistý paralelní chat, bez rolí.' },
  { id: 'perspectives', label: 'Tři pohledy', hint: 'Poradce, oponent, stratég.' },
  { id: 'council', label: 'AI Council', hint: 'Více rolí, vzájemná kritika, závěr.' },
  { id: 'brainstorm', label: 'Brainstorm', hint: 'GPT-5.5 a Claude Opus si brousí odpověď mezi sebou.' },
  { id: 'weakest', label: 'Nejslabší předpoklad', hint: 'Kde se to může celé rozbít?' },
]

const STORAGE_KEY = 'ai-council-api-keys'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('three')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKeys, setApiKeys] = useState<APIKeys>(() => {
    const emptyKeys = { openai: '', anthropic: '', gemini: '' }
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return emptyKeys

    try {
      const parsed = JSON.parse(saved) as Partial<APIKeys>
      return {
        openai: parsed.openai ?? '',
        anthropic: parsed.anthropic ?? '',
        gemini: parsed.gemini ?? '',
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
      return emptyKeys
    }
  })
  const providers = useProviders(apiKeys)

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <span className="brand-name">AI Council</span>
          <span className="brand-tagline">Nenech nápad projít bez odporu.</span>
        </div>

        <nav className="app-topbar-nav" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`topbar-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.hint}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="icon-button"
          aria-label="Otevřít nastavení"
          onClick={() => setSettingsOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.51 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </header>

      <div className="app-workspace">
        {activeTab === 'weakest' && <WeakestAssumption apiKeys={apiKeys} />}
        {activeTab === 'three' && <ThreeAnswers apiKeys={apiKeys} />}
        {activeTab === 'perspectives' && <ThreePerspectives apiKeys={apiKeys} />}
        {activeTab === 'council' && <Council apiKeys={apiKeys} />}
        {activeTab === 'brainstorm' && <Brainstorm apiKeys={apiKeys} />}
      </div>

      {settingsOpen && (
        <SettingsPanel
          key={JSON.stringify(apiKeys)}
          open={settingsOpen}
          apiKeys={apiKeys}
          providers={providers}
          onClose={() => setSettingsOpen(false)}
          onSave={keys => {
            setApiKeys(keys)
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
          }}
        />
      )}
    </div>
  )
}
