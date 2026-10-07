/**
 * PROGRESO — Fase 8.8. "¿Qué ha pasado con mis datos?" Descriptivo: cifras, fechas y gráficas; nunca juicios.
 * Secciones: Cuerpo · Fuerza · Cardio · Hábitos · Metas. Periodos 7 / 30 / todo. Datos faltantes explícitos.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import type { ProgressPhoto } from '@domain/entities'
import { isAppError } from '@domain/errors'
import { localDay } from '@domain/time/day'
import {
  deletePhoto, listPhotos, loadProgress, logBia, logWaist, PHOTO_VIEWS, savePhoto,
  type GoalVsReal, type HabitSummary, type Period, type PhotoView, type ProgressView,
} from '@app/services'
import { useApp } from '../AppContext'
import { Chips } from '../components/Chips'
import { LineChart } from '../components/LineChart'
import { makeThumb, readImage } from '../photo'

type Section = 'body' | 'strength' | 'cardio' | 'habits' | 'goals'
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
const NA = 'Sin datos suficientes'
const nowIso = () => new Date().toISOString()
const kg = (n: number | null) => (n === null ? NA : `${n.toFixed(1)} kg`)

export function Progreso() {
  const { storage } = useApp()
  const [section, setSection] = useState<Section>('body')
  const [period, setPeriod] = useState<Period>(30)
  const [v, setV] = useState<ProgressView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [today] = useState(() => localDay(new Date()))

  const refresh = useCallback(() => {
    loadProgress(storage, today, period).then(x => { setV(x); setError(null) }).catch((e: unknown) => setError(isAppError(e) ? e.message : 'No se pudo leer.'))
  }, [storage, today, period])
  useEffect(() => { refresh() }, [refresh])
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh() } catch (e) { setError(isAppError(e) ? e.message : 'No se pudo guardar.') } }

  return (
    <>
      <div className="eyebrow">Progreso · {fmtDate(today)}</div>
      <nav className="ex-nav" aria-label="Secciones">
        {(['body', 'strength', 'cardio', 'habits', 'goals'] as const).map(s => (
          <button key={s} className={`ex-pill${section === s ? ' on' : ''}`} onClick={() => setSection(s)}>{{ body: 'Cuerpo', strength: 'Fuerza', cardio: 'Cardio', habits: 'Hábitos', goals: 'Metas' }[s]}</button>
        ))}
      </nav>
      {section !== 'goals' && <Chips label="Periodo" options={[{ v: 7, l: '7 días' }, { v: 30, l: '30 días' }, { v: 'all', l: 'Todo' }]} value={period} onChange={p => setPeriod(p as Period)} />}
      {error && <div className="banner">{error}</div>}
      {!v ? <p className="muted">Cargando…</p> : (
        <>
          {section === 'body' && <Body v={v} act={act} today={today} />}
          {section === 'strength' && <Strength v={v} />}
          {section === 'cardio' && <Cardio v={v} />}
          {section === 'habits' && <Habits h={v.habits} stepsTarget={v.settings?.steps_target ?? null} />}
          {section === 'goals' && <Goals goals={v.goals} />}
        </>
      )}
    </>
  )
}

// ───────────────────────── CUERPO ─────────────────────────

function Body({ v, act, today }: { v: ProgressView; act: (fn: () => Promise<unknown>) => Promise<void>; today: string }) {
  const { storage } = useApp()
  const b = v.body
  const [waist, setWaist] = useState('')
  const [bia, setBia] = useState({ w: '', fat: '', ffm: '', muscle: '', visceral: '', bmr: '' })
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
  return (
    <>
      <section className="block">
        <div className="eyebrow">Peso</div>
        <dl className="kv">
          <dt>Peso actual</dt><dd>{b.latest ? `${b.latest.kg.toFixed(1)} kg` : NA}</dd>
          <dt>Fecha del último registro</dt><dd>{b.latest ? fmtDate(b.latest.date) : '—'}</dd>
          <dt>Promedio 7 días</dt><dd>{b.avg7.kg === null ? `${NA} (${b.avg7.points} de 7 días con registro)` : `${b.avg7.kg.toFixed(1)} kg · ${b.avg7.points} registros`}</dd>
          <dt>Promedio 7 días anterior</dt><dd>{kg(b.prev7.kg)}</dd>
          <dt>Pendiente del periodo</dt><dd>{b.trend_kg_week === null ? NA : `${b.trend_kg_week > 0 ? '+' : ''}${b.trend_kg_week.toFixed(2)} kg/semana`}</dd>
        </dl>
        <LineChart points={b.series.map(p => ({ date: p.date, value: p.kg }))} unit="kg" />
        <p className="muted small">Solo registros reales ({b.series.length} en el periodo, {b.all_points} en total). Los días sin peso no se rellenan.</p>
      </section>

      <section className="block">
        <div className="eyebrow">Cintura</div>
        <dl className="kv">
          <dt>Último registro</dt><dd>{b.waist_latest ? `${b.waist_latest.cm} cm` : NA}</dd>
          <dt>Fecha</dt><dd>{b.waist_latest ? fmtDate(b.waist_latest.date) : '—'}</dd>
        </dl>
        {b.waist_series.length >= 2 && <LineChart points={b.waist_series.map(p => ({ date: p.date, value: p.cm }))} unit="cm" height={100} />}
        <div className="two">
          <label className="field"><span>Cintura hoy (cm)</span><input inputMode="decimal" value={waist} onChange={e => setWaist(e.target.value)} /></label>
          <button className="btn secondary" disabled={!waist} onClick={() => act(async () => { await logWaist(storage, today, Number(waist.replace(',', '.')), nowIso()); setWaist('') })}>Registrar cintura</button>
        </div>
      </section>

      <section className="block">
        <div className="eyebrow">BIA · registro del dispositivo</div>
        {b.bia.length === 0 ? <p className="muted small">{NA}</p> : (
          <table className="sets">
            <thead><tr><th>fecha</th><th>kg</th><th>% grasa</th><th>magra</th><th>músculo</th><th>visceral</th><th>BMR</th></tr></thead>
            <tbody>{b.bia.map(m => (
              <tr key={m.id}><td className="mono">{fmtDate(m.date)}</td><td className="mono">{m.bia_weight_kg ?? '—'}</td><td className="mono">{m.bia_fat_pct ?? '—'}</td><td className="mono">{m.bia_ffm_kg ?? '—'}</td><td className="mono">{m.bia_muscle_kg ?? '—'}</td><td className="mono">{m.bia_visceral ?? '—'}</td><td className="mono">{m.bia_bmr ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
        <div className="two">
          <label className="field"><span>Peso báscula (kg)</span><input inputMode="decimal" value={bia.w} onChange={e => setBia({ ...bia, w: e.target.value })} /></label>
          <label className="field"><span>% grasa</span><input inputMode="decimal" value={bia.fat} onChange={e => setBia({ ...bia, fat: e.target.value })} /></label>
          <label className="field"><span>Masa magra (kg)</span><input inputMode="decimal" value={bia.ffm} onChange={e => setBia({ ...bia, ffm: e.target.value })} /></label>
          <label className="field"><span>Músculo (kg)</span><input inputMode="decimal" value={bia.muscle} onChange={e => setBia({ ...bia, muscle: e.target.value })} /></label>
          <label className="field"><span>Grasa visceral</span><input inputMode="decimal" value={bia.visceral} onChange={e => setBia({ ...bia, visceral: e.target.value })} /></label>
          <label className="field"><span>BMR</span><input inputMode="decimal" value={bia.bmr} onChange={e => setBia({ ...bia, bmr: e.target.value })} /></label>
        </div>
        <button className="btn secondary" onClick={() => act(async () => {
          await logBia(storage, today, { bia_weight_kg: num(bia.w), bia_fat_pct: num(bia.fat), bia_ffm_kg: num(bia.ffm), bia_muscle_kg: num(bia.muscle), bia_visceral: num(bia.visceral), bia_bmr: num(bia.bmr) }, nowIso())
          setBia({ w: '', fat: '', ffm: '', muscle: '', visceral: '', bmr: '' })
        })}>Registrar BIA de hoy</button>
        <p className="muted small">Se guarda tal cual lo muestra la báscula; no se corrige ni se interpreta.</p>
      </section>

      <Photos today={today} onError={() => undefined} />
    </>
  )
}

// ───────────────────────── FOTOS ─────────────────────────

function Photos({ today }: { today: string; onError: (m: string) => void }) {
  const { storage } = useApp()
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<ProgressPhoto | null>(null)
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<PhotoView | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const month = today.slice(0, 7)

  const load = useCallback(() => {
    listPhotos(storage).then(list => {
      setPhotos(list)
      setUrls(prev => {
        for (const u of Object.values(prev)) URL.revokeObjectURL(u)
        return Object.fromEntries(list.map(p => [p.id, URL.createObjectURL(p.thumb)]))
      })
    }).catch(() => setError('No se pudieron leer las fotos.'))
  }, [storage])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u); if (openUrl) URL.revokeObjectURL(openUrl) }, [urls, openUrl])

  const onFile = async (view: PhotoView, file: File | undefined) => {
    if (!file) return
    setBusy(view)
    try {
      const { width, height, bitmap } = await readImage(file)
      const thumb = await makeThumb(bitmap)
      bitmap.close()
      await savePhoto(storage, { date: today, view, blob: file, thumb, width, height }, nowIso())
      setError(null); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la foto.') }
    finally { setBusy(null); const el = inputs.current[view]; if (el) el.value = '' }
  }
  const openPhoto = (p: ProgressPhoto) => { if (openUrl) URL.revokeObjectURL(openUrl); setOpenUrl(URL.createObjectURL(p.blob)); setOpen(p) }
  const closePhoto = () => { if (openUrl) URL.revokeObjectURL(openUrl); setOpenUrl(null); setOpen(null) }
  const months = [...new Set(photos.map(p => p.month))]
  if (!months.includes(month)) months.unshift(month)
  const label: Record<PhotoView, string> = { front: 'Frente', side: 'Perfil', back: 'Espalda' }

  return (
    <section className="block">
      <div className="eyebrow">Fotos mensuales · solo en este dispositivo</div>
      {error && <div className="banner">{error}</div>}
      {months.map(m => (
        <div key={m} className="photo-month">
          <div className="small"><strong>{m}</strong>{m === month ? ' · este mes' : ''}</div>
          <div className="photo-row">
            {PHOTO_VIEWS.map(view => {
              const p = photos.find(x => x.month === m && x.view === view)
              return (
                <div key={view} className="photo-cell">
                  {p ? <button className="photo-thumb" onClick={() => openPhoto(p)} aria-label={`Ver ${label[view]} ${m}`}><img src={urls[p.id]} alt="" /></button> : <div className="photo-empty"><span className="muted small">{label[view]}</span></div>}
                  <div className="photo-actions">
                    {m === month && (
                      <>
                        <input ref={el => { inputs.current[view] = el }} type="file" accept="image/*" capture="environment" hidden onChange={e => void onFile(view, e.target.files?.[0])} />
                        <button className="link" disabled={busy === view} onClick={() => inputs.current[view]?.click()}><Camera size={14} aria-hidden /> {p ? 'Reemplazar' : label[view]}</button>
                      </>
                    )}
                    {p && <button className="link" aria-label="Borrar foto" onClick={() => { if (window.confirm('¿Borrar esta foto del dispositivo?')) void deletePhoto(storage, p.id).then(load) }}><Trash2 size={14} aria-hidden /></button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {open && openUrl && (
        <div className="photo-view" role="dialog" aria-label="Foto">
          <img src={openUrl} alt={`${label[open.view]} ${open.month}`} />
          <div className="row-head"><span className="small">{label[open.view]} · {fmtDate(open.date)} · {open.width}×{open.height}</span><button className="link" onClick={closePhoto}>Cerrar</button></div>
        </div>
      )}
      <p className="muted small">Las fotos no salen del teléfono: se guardan en la base local de la app. Se puede tomar con la cámara o elegir del carrete.</p>
    </section>
  )
}

// ───────────────────────── FUERZA ─────────────────────────

function Strength({ v }: { v: ProgressView }) {
  const t = v.strength.tonnage
  const last = t[t.length - 1]
  return (
    <>
      <section className="block">
        <div className="eyebrow">Tonelaje por sesión · Σ peso × reps de series de trabajo</div>
        <dl className="kv">
          <dt>Última sesión</dt><dd>{last ? `${last.tonnage_kg.toLocaleString('es-MX')} kg · ${fmtDate(last.date)} · ${last.work_sets} series` : NA}</dd>
          <dt>Sesiones completadas en el periodo</dt><dd>{t.length}</dd>
        </dl>
        <LineChart points={t.map(x => ({ date: x.date, value: x.tonnage_kg }))} unit="kg" decimals={0} />
        <p className="muted small">Solo sesiones completadas. Sin calentamientos, series no realizadas ni sesiones abandonadas o canceladas.</p>
      </section>
      {v.strength.key_lifts.map(k => {
        const lastL = k.history[k.history.length - 1]
        return (
          <section key={k.id} className="block">
            <div className="eyebrow">{k.name}</div>
            <dl className="kv">
              <dt>Última carga</dt><dd>{lastL ? `${lastL.load_kg} kg × ${lastL.reps.join('/')} · ${fmtDate(lastL.date)}` : NA}</dd>
              {k.history.length >= 2 && <><dt>Primera del periodo</dt><dd>{`${k.history[0]!.load_kg} kg · ${fmtDate(k.history[0]!.date)}`}</dd></>}
            </dl>
            <LineChart points={k.history.map(p => ({ date: p.date, value: p.load_kg }))} unit="kg" height={90} />
          </section>
        )
      })}
    </>
  )
}

// ───────────────────────── CARDIO ─────────────────────────

function Cardio({ v }: { v: ProgressView }) {
  const fmtSplit = (s: number) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')} /500 m` }
  return (
    <>
      <section className="block">
        <div className="eyebrow">Por semana (lunes a domingo)</div>
        <table className="sets">
          <thead><tr><th>semana</th><th>sesiones</th><th>min</th><th>km</th><th>RPE</th></tr></thead>
          <tbody>{v.cardio.weeks.map(w => (
            <tr key={w.week_start}><td className="mono">{fmtDate(w.week_start)}</td><td className="mono">{w.sessions}</td><td className="mono">{w.minutes}</td><td className="mono">{w.distance_m === null ? '—' : (w.distance_m / 1000).toFixed(1)}</td><td className="mono">{w.rpe_avg ?? '—'}</td></tr>
          ))}</tbody>
        </table>
        <p className="muted small">km solo suma las sesiones con distancia registrada.</p>
      </section>
      <section className="block">
        <div className="eyebrow">Prueba mensual · 10 min</div>
        {v.cardio.tests.length === 0 ? <p className="muted small">{NA}</p> : (
          <dl className="kv">
            {v.cardio.tests.map(t => (
              <span key={t.test.id} style={{ display: 'contents' }}>
                <dt>{t.test.month}</dt>
                <dd>{t.test.distance_m} m · {fmtSplit(t.test.split_avg_s)}{t.distance_delta_m !== null ? <span className="muted small"> · {t.distance_delta_m > 0 ? '+' : ''}{t.distance_delta_m} m, {t.split_delta_s! > 0 ? '+' : ''}{t.split_delta_s} s/500 vs anterior</span> : ''}</dd>
              </span>
            ))}
          </dl>
        )}
      </section>
    </>
  )
}

// ───────────────────────── HÁBITOS ─────────────────────────

function Habits({ h, stepsTarget }: { h: HabitSummary; stepsTarget: number | null }) {
  const adh = { plan: 'Según el plan', almost: 'Casi', off: 'Me salí', unknown: 'Sin dato' }
  const n = (x: number | null, suffix = '') => (x === null ? NA : `${x}${suffix}`)
  return (
    <>
      <section className="block">
        <div className="eyebrow">Resumen del periodo · {h.days.length} días</div>
        <dl className="kv">
          <dt>Adherencia declarada</dt><dd>{(['plan', 'almost', 'off', 'unknown'] as const).map(k => `${adh[k]} ${h.adherence[k]}`).join(' · ')}</dd>
          <dt>Proteína estimada</dt><dd>{h.protein_days === 0 ? NA : `media ${h.protein_avg} g en ${h.protein_days} días con registro · ${h.protein_days_at_floor} días ≥ mínimo`}</dd>
          <dt>Sueño (tramos)</dt><dd>{(['<6', '6-7', '7-8', '8+', 'unknown'] as const).map(k => `${k === 'unknown' ? 'sin dato' : k + ' h'} ${h.sleep[k]}`).join(' · ')}</dd>
          <dt>Pasos</dt><dd>{h.steps_days === 0 ? NA : `media ${Math.round(h.steps_avg!)} en ${h.steps_days} días${stepsTarget ? ` · referencia ${stepsTarget}` : ''}`}</dd>
          <dt>Energía · hambre · ánimo (1–5)</dt><dd>{n(h.energy_avg)} · {n(h.hunger_avg)} · {n(h.mood_avg)}</dd>
        </dl>
        <p className="muted small">Adherencia y proteína son señales distintas y se muestran por separado. Sin puntuaciones.</p>
      </section>
      <section className="block">
        <div className="eyebrow">Por día</div>
        <table className="sets">
          <thead><tr><th>día</th><th>ayer comí</th><th>proteína</th><th>sueño</th><th>pasos</th><th>E·H·Á</th></tr></thead>
          <tbody>{[...h.days].reverse().map(d => (
            <tr key={d.date}>
              <td className="mono">{fmtDate(d.date)}</td>
              <td className="small">{d.food_yesterday ? adh[d.food_yesterday] : '—'}</td>
              <td className="mono">{d.protein_g === null ? '—' : `${d.protein_lower_bound ? '≥' : '≈'}${d.protein_g}`}</td>
              <td className="mono">{d.sleep ?? '—'}</td>
              <td className="mono">{d.steps ?? '—'}</td>
              <td className="mono">{d.energy ?? '—'}·{d.hunger ?? '—'}·{d.mood ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  )
}

// ───────────────────────── METAS ─────────────────────────

function Goals({ goals }: { goals: GoalVsReal[] }) {
  const range = (r: [number, number] | null, unit: string) => (r ? `${r[0]}–${r[1]} ${unit}` : null)
  return (
    <>
      {goals.map(g => (
        <section key={g.goal.id} className="block">
          <div className="eyebrow">{g.month}</div>
          <dl className="kv">
            <dt>Peso · meta</dt><dd>{range(g.weight_goal_kg, 'kg') ?? `${g.weight_goal_pct[0]} a ${g.weight_goal_pct[1]} % (sin baseline en kg)`}</dd>
            <dt>Peso · real (promedio 7 d)</dt><dd>{g.weight_real_kg === null ? `${NA}${g.weight_real_points ? ` (${g.weight_real_points} registros)` : ''}` : `${g.weight_real_kg.toFixed(1)} kg`}</dd>
            <dt>Cintura · meta</dt><dd>{range(g.waist_goal_cm, 'cm') ?? `${g.waist_delta_goal_cm[0]} a ${g.waist_delta_goal_cm[1]} cm (sin baseline)`}</dd>
            <dt>Cintura · real</dt><dd>{g.waist_real_cm === null ? NA : `${g.waist_real_cm} cm · ${fmtDate(g.waist_real_date!)}`}</dd>
            <dt>Sesiones de fuerza</dt><dd>{g.strength_sessions_real} de {g.goal.strength_sessions} /semana previstas</dd>
            <dt>Sesiones de cardio</dt><dd>{g.cardio_sessions_real} de {g.goal.cardio_sessions} /semana previstas</dd>
            <dt>Pasos · referencia</dt><dd>{g.steps_target}</dd>
          </dl>
          <p className="muted small">{g.goal.focus_text}</p>
        </section>
      ))}
    </>
  )
}
