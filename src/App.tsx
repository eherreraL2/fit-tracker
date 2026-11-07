import { useState } from 'react'
import { ExercisesScreen } from './screens/ExercisesScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TrainScreen } from './screens/TrainScreen'

const TABS = [
  { id: 'train', label: 'Entrenar', icon: '🏋️' },
  { id: 'history', label: 'Historial', icon: '📅' },
  { id: 'progress', label: 'Progreso', icon: '📈' },
  { id: 'exercises', label: 'Ejercicios', icon: '📋' },
  { id: 'settings', label: 'Ajustes', icon: '⚙️' },
] as const
type TabId = (typeof TABS)[number]['id']

function App() {
  const [tab, setTab] = useState<TabId>('train')

  return (
    <>
      <main className="app">
        {tab === 'train' && <TrainScreen onOpenSettings={() => setTab('settings')} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'progress' && <ProgressScreen />}
        {tab === 'exercises' && <ExercisesScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'active' : ''}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  )
}

export default App
