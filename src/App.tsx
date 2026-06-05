import { useState } from 'react'
import WeakestAssumption from './components/tabs/WeakestAssumption'
import ThreeAnswers from './components/tabs/ThreeAnswers'
import ThreePerspectives from './components/tabs/ThreePerspectives'
import Council from './components/tabs/Council'
import './index.css'

type Tab = 'weakest' | 'three' | 'perspectives' | 'council'

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'three',        label: 'Tři odpovědi',          hint: 'Čistý paralelní chat, bez rolí.' },
  { id: 'perspectives', label: 'Tři pohledy',           hint: 'Poradce, oponent, stratég.' },
  { id: 'weakest',      label: 'Nejslabší předpoklad',  hint: 'Kde se to může celé rozbít?' },
  { id: 'council',      label: 'AI Council',            hint: 'Více rolí, vzájemná kritika, závěr.' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('three')

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
      </header>

      <div className="app-workspace">
        {activeTab === 'weakest'      && <WeakestAssumption />}
        {activeTab === 'three'        && <ThreeAnswers />}
        {activeTab === 'perspectives' && <ThreePerspectives />}
        {activeTab === 'council'      && <Council />}
      </div>
    </div>
  )
}
