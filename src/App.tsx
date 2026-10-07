import { useState } from 'react'
import { Activity, Dumbbell, LineChart, MoreHorizontal, UtensilsCrossed } from 'lucide-react'
import { Diagnostics } from '@ui/screens/Diagnostics'
import { Ahora } from '@ui/screens/Ahora'
import { Entrenar } from '@ui/screens/Entrenar'
import { Comida } from '@ui/screens/Comida'
import { Progreso } from '@ui/screens/Progreso'

type Tab = 'now' | 'training' | 'meals' | 'progress' | 'more'

const TABS: Array<{ id: Tab; label: string; Icon: typeof Activity }> = [
  { id: 'now', label: 'AHORA', Icon: Activity },
  { id: 'training', label: 'ENTRENAR', Icon: Dumbbell },
  { id: 'meals', label: 'COMIDA', Icon: UtensilsCrossed },
  { id: 'progress', label: 'PROGRESO', Icon: LineChart },
  { id: 'more', label: 'MÁS', Icon: MoreHorizontal },
]

/** Shell: 5 pestañas. AHORA (8.5) y MÁS → Diagnóstico (8.1) con contenido; ENTRENAR muestra la sesión abierta (integración 8.6). */
export default function App() {
  const [tab, setTab] = useState<Tab>('now')
  return (
    <div className="shell">
      <main className="content">
        {tab === 'now' ? (
          <Ahora key={tab} onGoTraining={() => setTab('training')} />
        ) : tab === 'training' ? (
          <Entrenar key={tab} onGoNow={() => setTab('now')} />
        ) : tab === 'meals' ? (
          <Comida key={tab} />
        ) : tab === 'progress' ? (
          <Progreso key={tab} />
        ) : tab === 'more' ? (
          <Diagnostics />
        ) : (
          <>
            <div className="eyebrow">{TABS.find(t => t.id === tab)?.label}</div>
            <p className="muted">Pendiente.</p>
          </>
        )}
      </main>
      <nav className="tabs" role="tablist" aria-label="Navegación principal">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon size={22} strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
