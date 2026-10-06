/**
 * Formulario de check-in (Fase 8.5). Todo opcional: lo vacío no se envía y queda como "sin dato".
 * Sin puntuaciones, sin rachas.
 */
import { useState } from 'react'
import type { DailyCheckIn } from '@domain/entities'
import type { CheckInPatch } from '@app/services'
import { Chips } from './Chips'

const SCALE = [1, 2, 3, 4, 5].map(n => ({ v: n, l: String(n) }))

export function CheckInForm({ initial, onSave, onCancel }: { initial: DailyCheckIn | null; onSave: (p: CheckInPatch) => void; onCancel?: () => void }) {
  const [weight, setWeight] = useState(initial?.weight_kg?.toString() ?? '')
  const [sleep, setSleep] = useState<DailyCheckIn['sleep_bucket'] | null>(initial?.sleep_bucket ?? null)
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null)
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null)
  const [hunger, setHunger] = useState<number | null>(initial?.hunger ?? null)
  const [food, setFood] = useState<DailyCheckIn['food_yesterday'] | null>(initial?.food_yesterday ?? null)
  const [steps, setSteps] = useState(initial?.steps_yesterday?.toString() ?? '')

  const submit = () => {
    const w = weight.trim() === '' ? undefined : Number(weight.replace(',', '.'))
    const s = steps.trim() === '' ? undefined : Math.round(Number(steps))
    onSave({
      ...(w !== undefined && Number.isFinite(w) ? { weight_kg: w } : {}),
      ...(sleep ? { sleep_bucket: sleep } : {}),
      ...(energy ? { energy: energy as 1 | 2 | 3 | 4 | 5 } : {}),
      ...(mood ? { mood: mood as 1 | 2 | 3 | 4 | 5 } : {}),
      ...(hunger ? { hunger: hunger as 1 | 2 | 3 | 4 | 5 } : {}),
      ...(food ? { food_yesterday: food } : {}),
      ...(s !== undefined && Number.isFinite(s) ? { steps_yesterday: s, steps_source: 'manual' as const } : {}),
    })
  }

  return (
    <form className="form" onSubmit={e => { e.preventDefault(); submit() }}>
      <div className="two">
        <label className="field"><span>Peso (kg)</span><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="—" /></label>
        <label className="field"><span>Pasos ayer</span><input inputMode="numeric" value={steps} onChange={e => setSteps(e.target.value)} placeholder="—" /></label>
      </div>
      <Chips label="Sueño" options={[{ v: '<6', l: '<6 h' }, { v: '6-7', l: '6–7' }, { v: '7-8', l: '7–8' }, { v: '8+', l: '8+' }]} value={sleep ?? null} onChange={v => setSleep(v as DailyCheckIn['sleep_bucket'])} />
      <Chips label="Energía" options={SCALE} value={energy} onChange={v => setEnergy(Number(v))} />
      <Chips label="Ánimo" options={SCALE} value={mood} onChange={v => setMood(Number(v))} />
      <Chips label="Hambre" options={SCALE} value={hunger} onChange={v => setHunger(Number(v))} />
      <Chips label="Ayer comí" options={[{ v: 'plan', l: 'Según el plan' }, { v: 'almost', l: 'Casi' }, { v: 'off', l: 'Me salí' }]} value={food ?? null} onChange={v => setFood(v as DailyCheckIn['food_yesterday'])} />
      <div className="quick">
        <button className="btn" type="submit">Guardar</button>
        {onCancel && <button className="btn secondary" type="button" onClick={onCancel}>Cancelar</button>}
      </div>
      <p className="muted small">Puedes guardar a medias; lo vacío queda sin dato.</p>
    </form>
  )
}
