/**
 * Reporte quincenal — Fase 8.10. Bloque en MÁS. Solo lectura: genera el reporte bajo demanda desde los datos actuales,
 * muestra un resumen y, con [VER REPORTE], la vista completa. [COPIAR PARA CLAUDE] copia SOLO el texto estructurado.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isAppError } from '@domain/errors'
import { localDay } from '@domain/time/day'
import { loadCoachReport, type CoachReportView } from '@app/services'
import { useApp } from '../AppContext'
import { copyText } from '../clipboard'

const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—')
const nd = (x: number | string | null | undefined, unit = '') => (x === null || x === undefined ? 'sin datos' : `${x}${unit}`)
const sg = (n: number | null, unit = '') => (n === null ? 'sin datos' : `${n > 0 ? '+' : ''}${n}${unit}`)
const STATUS_LABEL = { closed: 'ventana cerrada', partial: 'ventana en curso (parcial)', empty: 'sin días cerrados' } as const

/** `refreshKey`: al cambiar, el reporte se regenera desde los datos actuales (p. ej. tras la evaluación 8.9). */
export function CoachReportPanel({ refreshKey = 0 }: { refreshKey?: number } = {}) {
  const { storage } = useApp()
  const [today] = useState(() => localDay(new Date()))
  const [view, setView] = useState<CoachReportView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fallback'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => {
    loadCoachReport(storage, today, new Date().toISOString())
      .then(v => { setView(v); setErr(null) })
      .catch((e: unknown) => setErr(isAppError(e) ? e.message : 'No se pudo generar el reporte.'))
  }, [storage, today])
  useEffect(() => { load() }, [load, refreshKey])

  useEffect(() => { if (copy === 'fallback') area.current?.select() }, [copy])

  const onCopy = () => {
    if (!view) return
    copyText(view.text).then(ok => setCopy(ok ? 'ok' : 'fallback'))
  }

  if (err) return <div className="card"><div className="eyebrow">Reporte quincenal</div><div className="banner">{err}</div></div>
  if (!view) return <div className="card"><div className="eyebrow">Reporte quincenal</div><div className="muted">…</div></div>
  const r = view.report
  const p = r.period
  const pendingRec = r.adjustments.recommendations.find(x => x.status === 'pending')

  return (
    <div className="card" data-testid="coach-report">
      <div className="eyebrow">Reporte quincenal</div>
      <div className="big">{fmtDate(p.start)} → {fmtDate(p.end)}</div>
      <div className="muted">{STATUS_LABEL[p.status]} · {p.days} días · generado {fmtDate(r.generated_at.slice(0, 10))}</div>
      <dl className="kv">
        <dt>Peso prom. 7 d</dt><dd>{nd(r.body.avg7_kg, ' kg')} ({sg(r.body.avg7_change_kg, ' kg')})</dd>
        <dt>Sesiones</dt><dd>{r.training.counts.completed} completadas</dd>
        <dt>Adherencia</dt><dd>{r.nutrition.adherence.pct === null ? `sin datos (${r.nutrition.adherence.answered}/14)` : `${r.nutrition.adherence.pct} %`}</dd>
        <dt>Alertas</dt><dd>{r.alerts.items.length}</dd>
        <dt>Ajuste</dt><dd>{pendingRec ? 'pendiente de decidir' : r.adjustments.recommendations.length ? `${r.adjustments.recommendations.length} en el periodo` : 'ninguno'}</dd>
        <dt>Datos faltantes</dt><dd>{r.missing.items.length}</dd>
      </dl>
      <button className="btn" onClick={onCopy}>COPIAR PARA CLAUDE</button>
      {copy === 'ok' && <div className="muted" role="status">Copiado. Pégalo en Claude.</div>}
      {copy === 'fallback' && (
        <>
          <div className="muted" role="status">No se pudo copiar automáticamente. Selecciona el texto y cópialo.</div>
          <textarea ref={area} readOnly value={view.text} rows={10} style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12 }} aria-label="Texto para Claude" />
        </>
      )}
      <button className="btn secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'OCULTAR REPORTE' : 'VER REPORTE'}</button>
      {open && <ReportBody view={view} />}
    </div>
  )
}

function ReportBody({ view }: { view: CoachReportView }) {
  const r = view.report
  const b = r.body, t = r.training, c = r.cardio, n = r.nutrition, h = r.habits
  return (
    <div className="report">
      <h2>Período</h2>
      <dl className="kv">
        <dt>Desde</dt><dd>{r.period.start}</dd>
        <dt>Hasta</dt><dd>{r.period.end ?? '—'}</dd>
        <dt>Estado</dt><dd>{STATUS_LABEL[r.period.status]}</dd>
      </dl>
      <h2>Estado corporal</h2>
      <dl className="kv">
        <dt>Último peso</dt><dd>{b.latest_weight ? `${b.latest_weight.kg} kg · ${fmtDate(b.latest_weight.date)}` : 'sin datos'}</dd>
        <dt>Prom. 7 d</dt><dd>{nd(b.avg7_kg, ' kg')}</dd>
        <dt>Prom. 7 d anterior</dt><dd>{nd(b.avg7_prev_kg, ' kg')}</dd>
        <dt>Cambio</dt><dd>{sg(b.avg7_change_kg, ' kg')} · {nd(b.loss_pct_week, ' %/sem')}</dd>
        <dt>Tendencia</dt><dd>{sg(b.trend_kg_week, ' kg/sem')}</dd>
        <dt>Cintura</dt><dd>{b.waist_latest ? `${b.waist_latest.cm} cm` : 'sin datos'} ({sg(b.waist_change_cm, ' cm')})</dd>
        <dt>BIA</dt><dd>{b.bia.length ? `${fmtDate(b.bia.at(-1)!.date)} · grasa ${nd(b.bia.at(-1)!.bia_fat_pct, ' %')}` : 'sin datos'}</dd>
      </dl>
      <h2>Entrenamiento</h2>
      <dl className="kv">
        <dt>Completadas</dt><dd>{t.counts.completed} (cortas {t.counts.short}, mínimas {t.counts.minimal})</dd>
        <dt>Abandonadas</dt><dd>{t.counts.abandoned} · canceladas {t.counts.cancelled}</dd>
        <dt>Siguiente</dt><dd>{t.rotation?.next ?? '—'}</dd>
        {t.key_lifts.map(l => (
          <span key={l.id} style={{ display: 'contents' }}>
            <dt>{l.name}</dt>
            <dd>{l.comparison.comparable ? `${l.comparison.previous.load_kg} → ${l.comparison.current.load_kg} kg${l.comparison.lower ? ' · menor' : ''}` : l.sessions.length ? `${l.sessions.at(-1)!.load_kg} kg × ${l.sessions.at(-1)!.reps.join('/')}` : 'sin sesiones'}</dd>
          </span>
        ))}
        <dt>Estancamientos</dt><dd>{t.stalls.length}</dd>
      </dl>
      <h2>Cardio</h2>
      <dl className="kv">
        <dt>Sesiones</dt><dd>{c.sessions.length ? `${c.sessions.length} · ${c.total_minutes} min` : 'sin sesiones registradas'}</dd>
        <dt>Distancia</dt><dd>{nd(c.total_distance_m, ' m')}</dd>
        <dt>Prueba mensual</dt><dd>{c.monthly_test ? `${c.monthly_test.distance_m} m · ${sg(c.monthly_test.distance_delta_m, ' m')}` : 'sin datos'}</dd>
      </dl>
      <h2>Nutrición</h2>
      <dl className="kv">
        <dt>Objetivo</dt><dd>{n.kcal_target} kcal · {n.protein_target_g} g (piso {n.protein_floor_g})</dd>
        <dt>Comidas registradas</dt><dd>{n.meal_logs}</dd>
        <dt>Fuera de plan</dt><dd>{n.by_status.off_plan} · emergencia {n.by_status.emergency} · saltadas {n.by_status.skipped}</dd>
        <dt>Proteína prom.</dt><dd>{n.protein_avg_g === null ? 'no disponible' : `${n.protein_avg_g} g (estimado, ${n.protein_days_with_data} días)`}</dd>
        <dt>Sin macros</dt><dd>{n.foods_without_macros.join(', ') || 'ninguno'}</dd>
      </dl>
      <h2>Hábitos</h2>
      <dl className="kv">
        <dt>Check-ins</dt><dd>{h.checkin_days}/{r.period.days}</dd>
        <dt>Sueño &lt;6</dt><dd>{h.sleep['<6']} días</dd>
        <dt>Pasos prom.</dt><dd>{nd(h.steps_avg)}</dd>
        <dt>Energía / hambre / ánimo</dt><dd>{nd(h.energy_avg)} / {nd(h.hunger_avg)} / {nd(h.mood_avg)}</dd>
      </dl>
      <h2>Objetivos</h2>
      <dl className="kv">
        {r.goals.months.length === 0 && (<><dt>Mes</dt><dd>sin metas</dd></>)}
        {r.goals.months.map(m => (
          <span key={m.month} style={{ display: 'contents' }}>
            <dt>{m.month}</dt><dd>peso real {nd(m.weight_real_kg, ' kg')} · fuerza {m.strength_sessions_real}/{m.strength_sessions_goal} · cardio {m.cardio_sessions_real}/{m.cardio_sessions_goal}</dd>
          </span>
        ))}
      </dl>
      <h2>Alertas</h2>
      {r.alerts.items.length === 0 ? <p className="muted">Ninguna.</p> : (
        <ul className="plain">{r.alerts.items.map((a, i) => <li key={i}>{fmtDate(a.date)} · {a.message}</li>)}</ul>
      )}
      <h2>Ajustes</h2>
      <dl className="kv">
        <dt>Vigente</dt><dd>desde {fmtDate(r.adjustments.current.effective_from)} · {r.adjustments.current.kcal_target} kcal · {r.adjustments.current.steps_target} pasos</dd>
        {r.adjustments.recommendations.map(x => (
          <span key={x.id} style={{ display: 'contents' }}>
            <dt>{fmtDate(x.date)}</dt>
            <dd>{x.proposed_change ? `${x.proposed_change.type} ${x.proposed_change.delta > 0 ? '+' : ''}${x.proposed_change.delta}` : x.type} · {x.status}{x.decision?.applied_effective_from ? ` · desde ${fmtDate(x.decision.applied_effective_from)}` : ''}</dd>
          </span>
        ))}
      </dl>
      <h2>Datos faltantes</h2>
      <ul className="plain">{r.missing.items.map((m, i) => <li key={i}>{m}</li>)}</ul>
      <h2>Contexto para coach</h2>
      <p className="muted">El texto copiado incluye estos datos, instrucciones para Claude y marca como no_data todo lo que no está registrado. Generar o copiar no cambia nada en la app.</p>
    </div>
  )
}
