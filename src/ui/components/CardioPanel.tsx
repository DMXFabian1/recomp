/** Cardio / remo y prueba mensual de 10 min (Fase 8.6). Registro simple; sin zonas inventadas. */
import { useState } from 'react'
import { isAppError } from '@domain/errors'
import { CARDIO_PRESETS, logCardio, logMonthlyTest, MONTHLY_TEST_DURATION_S } from '@app/services'
import { useApp } from '../AppContext'
import { Chips } from './Chips'

export function CardioPanel({ today, onSaved, onError }: { today: string; onSaved: () => void; onError: (m: string) => void }) {
  const { storage } = useApp()
  const [mode, setMode] = useState<'none' | 'cardio' | 'test'>('none')
  const [modality, setModality] = useState<'row' | 'walk' | 'other'>('row')
  const [preset, setPreset] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [rpe, setRpe] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const nowIso = () => new Date().toISOString()
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); setSaved(msg); setMode('none'); setMinutes(''); setDistance(''); setRpe(null); setNote(''); setPreset(null); onSaved() }
    catch (e) { onError(isAppError(e) ? e.message : 'No se pudo guardar.') }
  }
  const saveCardio = () => {
    const p = CARDIO_PRESETS.find(x => x.id === preset)
    const dur = num(minutes) !== undefined ? Math.round(num(minutes)! * 60) : p?.duration_s
    if (!dur || rpe === null) { onError('Falta duración o RPE.'); return }
    const d = num(distance)
    return run(() => logCardio(storage, { date: today, modality, duration_s: dur, rpe, ...(p ? { preset: p.id } : {}), ...(d !== undefined ? { distance_m: d } : {}), ...(note ? { note } : {}) }, nowIso()), 'Cardio registrado.')
  }
  const saveTest = (replace: boolean) => {
    const d = num(distance)
    if (d === undefined) { onError('Falta la distancia.'); return }
    return run(() => logMonthlyTest(storage, { date: today, distance_m: d, replace, ...(note ? { note } : {}) }, nowIso()), 'Prueba mensual registrada.')
  }

  return (
    <section className="block" aria-label="Cardio">
      <div className="row-head"><span className="eyebrow">Cardio / remo</span>{saved && <span className="small status-ok">{saved}</span>}</div>
      <div className="quick">
        <button className={`btn secondary${mode === 'cardio' ? ' active' : ''}`} onClick={() => setMode(m => m === 'cardio' ? 'none' : 'cardio')}>Registrar cardio</button>
        <button className={`btn secondary${mode === 'test' ? ' active' : ''}`} onClick={() => setMode(m => m === 'test' ? 'none' : 'test')}>Prueba 10 min</button>
      </div>
      {mode === 'cardio' && (
        <div className="sheet">
          <Chips label="Modalidad" options={[{ v: 'row', l: 'Remo' }, { v: 'walk', l: 'Caminar' }, { v: 'other', l: 'Otro' }]} value={modality} onChange={v => setModality(v as 'row' | 'walk' | 'other')} />
          {modality === 'row' && <Chips label="Preset" options={CARDIO_PRESETS.map(p => ({ v: p.id, l: p.label }))} value={preset} onChange={v => { setPreset(String(v)); setMinutes('') }} />}
          {preset && <p className="muted small">{CARDIO_PRESETS.find(p => p.id === preset)?.hint}</p>}
          <div className="two">
            <label className="field"><span>Minutos{preset ? ' (opcional)' : ''}</span><input inputMode="decimal" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
            <label className="field"><span>Distancia (m) · opcional</span><input inputMode="numeric" value={distance} onChange={e => setDistance(e.target.value)} /></label>
          </div>
          <Chips label="RPE (1 muy suave · 10 máximo)" options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ v: n, l: String(n) }))} value={rpe} onChange={v => setRpe(Number(v))} />
          <label className="field"><span>Nota · opcional</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} /></label>
          <button className="btn" onClick={() => void saveCardio()}>Guardar cardio</button>
          <p className="muted small">Zona 2 = puedes hablar en frases completas. No se calculan zonas por pulso.</p>
        </div>
      )}
      {mode === 'test' && (
        <div className="sheet">
          <div className="eyebrow">Prueba mensual · {MONTHLY_TEST_DURATION_S / 60} min en remo</div>
          <label className="field"><span>Distancia (m)</span><input inputMode="numeric" value={distance} onChange={e => setDistance(e.target.value)} /></label>
          <label className="field"><span>Nota · opcional</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} /></label>
          <div className="quick">
            <button className="btn" onClick={() => void saveTest(false)}>Guardar prueba</button>
            <button className="btn secondary" onClick={() => { if (window.confirm('¿Reemplazar la prueba de este mes?')) void saveTest(true) }}>Reemplazar la de este mes</button>
          </div>
          <p className="muted small">Se guarda distancia y split medio. La comparación entre meses llega en PROGRESO.</p>
        </div>
      )}
    </section>
  )
}
