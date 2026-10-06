/** Hoja "Iniciar sesión": versión Completa / Corta / Mínima con la sugerencia del motor visible. Compartida por AHORA y ENTRENAR. */
import { useState } from 'react'
import { Play } from 'lucide-react'
import type { SleepBucket, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { suggestVersion, type SessionVersionSuggestion } from '@app/services'
import { Chips } from './Chips'

import { VERSION_LABEL } from '../labels'

export function StartSessionSheet({ template, sleepBucket, onStart, hint }: {
  template: WorkoutTemplate
  sleepBucket: SleepBucket | null
  onStart: (s: SessionVersionSuggestion, choice: WorkoutSession['version'] | null, tm: 'short' | 'minimal' | null) => void
  hint?: string
}) {
  const [timeMode, setTimeMode] = useState<'short' | 'minimal' | null>(null)
  const sugg = suggestVersion({ template, sleep_bucket: sleepBucket, time_mode: timeMode })
  const [choice, setChoice] = useState<WorkoutSession['version'] | null>(null)
  const version = choice ?? sugg.version
  const count = (v: WorkoutSession['version']) => v === 'minimal' ? template.exercises.filter(e => e.in_minimal).length : v === 'short' ? template.exercises.filter(e => e.in_short).length : template.exercises.length
  return (
    <div className="sheet">
      <div className="eyebrow">Iniciar {template.name}</div>
      {sugg.reason === 'sleep_short' && <p className="note status-warn">Dormiste menos de 6 h: te sugiero la versión corta. Tú decides.</p>}
      <Chips label="Versión" options={(['full', 'short', 'minimal'] as const).map(v => ({ v, l: `${VERSION_LABEL[v]} · ${count(v)} ej.${sugg.version === v ? ' · sugerida' : ''}` }))} value={version} onChange={v => { setChoice(v as WorkoutSession['version']); setTimeMode(v === 'short' ? 'short' : v === 'minimal' ? 'minimal' : null) }} />
      <button className="btn" onClick={() => onStart(sugg, choice, timeMode)}><Play size={18} strokeWidth={2} aria-hidden /> Iniciar versión {VERSION_LABEL[version].toLowerCase()}</button>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  )
}
