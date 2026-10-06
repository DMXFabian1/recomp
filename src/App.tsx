import { useState } from 'react'
import { Activity, Dumbbell, LineChart, MoreHorizontal, UtensilsCrossed } from 'lucide-react'
import { Diagnostics } from '@ui/screens/Diagnostics'

type Tab = 'now' | 'training' | 'meals' | 'progress' | 'more'

const TABS: Array<{ id: Tab; label: string; Icon: typeof Activity }> = [
  { id: 'now', label: 'AHORA', Icon: Activity },
  { id: 'training', label: 'ENTRENAR', Icon: Dumbbell },
  { id: 'meals', label: 'COMIDA', Icon: UtensilsCrossed },
  { id: 'progress', label: 'PROGRESO', Icon: LineChart },
  { id: 'more', label: 'MÁS', Icon: MoreHorizontal },
]

/** Shell mínima (Fase 8.1): 5 pestañas; solo MÁS → Diagnóstico tiene contenido. */
export default function App() {
  const [tab, setTab] = useState<Tab>('more')
  return (
    <div className="shell">
      <main className="content">
        {tab === 'more' ? (
          <Diagnostics />
        ) : (
          <>
            <div className="eyebrow">{TABS.find(t => t.id === tab)?.label}</div>
            <p className="muted">Pendiente de la fase correspondiente (8.4–8.7).</p>
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
