import { useState } from 'react'
import WeakestAssumption from './components/tabs/WeakestAssumption'
import ThreeAnswers from './components/tabs/ThreeAnswers'
import Council from './components/tabs/Council'
import './index.css'

type Tab = 'weakest' | 'three' | 'council'

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'weakest', label: 'Nejslabší předpoklad', hint: 'Kde se to může celé rozbít?' },
  { id: 'three',   label: 'Tři odpovědi',         hint: 'Jedna otázka, tři různé pohledy.' },
  { id: 'council', label: 'AI Council',            hint: 'Více rolí, vzájemná kritika, závěr.' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('weakest')

  return (
    <div className="app-shell">
      {/* Compact top bar */}
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
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Each tab manages its own sidebar + results layout */}
      <div className="app-workspace">
        {activeTab === 'weakest' && <WeakestAssumption />}
        {activeTab === 'three'   && <ThreeAnswers />}
        {activeTab === 'council' && <Council />}
      </div>
    </div>
  )
}
