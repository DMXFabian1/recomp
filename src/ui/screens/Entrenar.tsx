/**
 * ENTRENAR — Fase 8.6. Flujo: sesión abierta → ejercicio actual → registrar serie → siguiente → completar →
 * resultado del motor (+ advertencia de fuera de orden). Sin sesión: iniciar, cardio/remo y prueba mensual.
 * Toda regla viene de app/services (evaluateSession / decideProgression / completeSession / substitution).
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Flag, Repeat, Trash2, X } from 'lucide-react'
import type { ExerciseSet } from '@domain/entities'
import { isAppError } from '@domain/errors'
import {
  abandonOpenSession, cancelOpenSession, finishSession, loadNowState, loadSessionView, logSet, removeSet, startSession,
  substituteInSession, substitutionOptionsFor, type ExerciseView, type FinishResult, type NowState, type SessionView, type SubstituteOption,
} from '@app/services'
import { useApp } from '../AppContext'
import { Chips } from '../components/Chips'
import { StartSessionSheet } from '../components/StartSessionSheet'
import { CardioPanel } from '../components/CardioPanel'
import { VERSION_LABEL, blockLabel } from '../labels'

const nowIso = () => new Date().toISOString()
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

export function Entrenar({ onGoNow }: { onGoNow: () => void }) {
  const { storage } = useApp()
  const [now, setNow] = useState<NowState | null>(null)
  const [view, setView] = useState<SessionView | null>(null)
  const [result, setResult] = useState<FinishResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)

  const refresh = useCallback(() => {
    loadNowState(storage, new Date())
      .then(async st => {
        setNow(st)
        setView(st.open_session ? await loadSessionView(storage, st.open_session.id) : null)
        setError(null)
      })
      .catch((e: unknown) => setError(isAppError(e) ? e.message : 'No se pudo leer el estado.'))
  }, [storage])
  useEffect(() => { refresh() }, [refresh])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); refresh() } catch (e) { setError(isAppError(e) ? e.message : 'No se pudo guardar.') }
  }

  if (!now) return <><div className="eyebrow">Entrenar</div><p className="muted">{error ?? 'Cargando…'}</p></>

  if (result) return <FinishSummary result={result} onDone={() => { setResult(null); onGoNow() }} />

  if (!view) {
    const t = now.today_state
    return (
      <>
        <div className="eyebrow">Entrenar · {fmtDate(now.today)}</div>
        {error && <div className="banner">{error}</div>}
        {t.kind === 'done_today' && <p className="note status-ok">Hoy ya completaste {now.templates.find(x => x.id === t.last_completed?.template_id)?.name ?? 'la sesión'}. Siguiente: {t.template?.name}.</p>}
        {t.template && (t.kind === 'suggested' || t.kind === 'done_today' || t.kind === 'not_started') && (
          <StartSessionSheet template={t.template} sleepBucket={now.check_in?.sleep_bucket ?? null}
            hint={t.kind === 'not_started' ? `El programa empieza el ${fmtDate(now.settings?.effective_from ?? now.today)}; puedes iniciar igual.` : `${t.rotation_position?.index ?? '?'} de ${t.rotation_position?.length ?? 4} en la rotación.`}
            onStart={(sugg, choice, tm) => act(() => startSession(storage, { template: t.template!, date: now.today, suggestion: sugg, userChoice: choice, time_mode: tm }, nowIso()))} />
        )}
        {t.kind === 'no_program' && <p className="muted">Sin programa activo.</p>}
        <CardioPanel today={now.today} onSaved={refresh} onError={setError} />
      </>
    )
  }

  const ex = view.exercises[Math.min(current, view.exercises.length - 1)]!
  const allDone = view.exercises.every(e => e.work_sets_done >= e.template_exercise.sets)
  return (
    <>
      <div className="eyebrow">Entrenar · {view.template.name} · {VERSION_LABEL[view.session.version].toLowerCase()} · {view.session.started_at.slice(11, 16)}</div>
      {error && <div className="banner">{error}</div>}

      <nav className="ex-nav" aria-label="Ejercicios">
        {view.exercises.map((e, i) => (
          <button key={e.original.id} className={`ex-pill${i === current ? ' on' : ''}${e.work_sets_done >= e.template_exercise.sets ? ' done' : ''}`} onClick={() => setCurrent(i)}>
            {i + 1} <span className="mono">{e.work_sets_done}/{e.template_exercise.sets}</span>
          </button>
        ))}
      </nav>

      <ExerciseBlock key={ex.original.id + view.session.updated_at} ex={ex}
        onLog={input => act(() => logSet(storage, { session_id: view.session.id, exercise_id: ex.performed.id, ...input }, nowIso()))}
        onRemove={id => act(() => removeSet(storage, id, nowIso()))}
        onSubstitute={(subId, reason) => act(() => substituteInSession(storage, view.session.id, { original_exercise_id: ex.original.id, substitute_exercise_id: subId, reason }, nowIso()))}
        onNext={() => setCurrent(c => Math.min(c + 1, view.exercises.length - 1))}
        isLast={current === view.exercises.length - 1}
      />

      <section className="block">
        <button className="btn" onClick={() => act(async () => { setResult(await finishSession(storage, view.session.id, nowIso(), now.today)) })}>
          <Check size={18} strokeWidth={2} aria-hidden /> Completar sesión{allDone ? '' : ' (faltan series)'}
        </button>
        <div className="quick">
          <button className="btn secondary" onClick={() => { if (window.confirm('¿Abandonar la sesión? Lo registrado se conserva; la rotación no avanza.')) void act(() => abandonOpenSession(storage, view.session.id, nowIso())) }}><X size={16} aria-hidden /> Abandonar</button>
          <button className="btn secondary" onClick={() => { if (window.confirm('¿Cancelar? La sesión se descarta; la rotación no avanza.')) void act(() => cancelOpenSession(storage, view.session.id, nowIso())) }}><Trash2 size={16} aria-hidden /> Cancelar</button>
        </div>
      </section>
    </>
  )
}

// ───────────────────────── Ejercicio actual ─────────────────────────

type SetDraft = { weight_kg: number; reps: number; rir: 0 | 1 | 2 | 3 | 4; is_warmup: boolean; pain_flag: boolean; technique_flag: boolean }

function ExerciseBlock({ ex, onLog, onRemove, onSubstitute, onNext, isLast }: {
  ex: ExerciseView; onLog: (d: SetDraft) => void; onRemove: (id: string) => void
  onSubstitute: (id: string, reason: 'equipment' | 'pain' | 'preference' | 'other') => void; onNext: () => void; isLast: boolean
}) {
  const { storage } = useApp()
  const te = ex.template_exercise
  const d = ex.decision
  const lastWork = ex.sets.filter(s => !s.is_warmup).at(-1)
  const [weight, setWeight] = useState(String(lastWork?.weight_kg ?? d.suggested_weight_kg ?? ''))
  const [reps, setReps] = useState(String(lastWork?.reps ?? ''))
  const [rir, setRir] = useState<0 | 1 | 2 | 3 | 4>(te.target_rir as 0 | 1 | 2 | 3 | 4)
  const [warmup, setWarmup] = useState(ex.sets.length === 0)
  const [pain, setPain] = useState(false)
  const [technique, setTechnique] = useState(false)
  const [showSub, setShowSub] = useState(false)
  const [options, setOptions] = useState<SubstituteOption[] | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const openSub = () => {
    setShowSub(s => !s)
    if (!options) substitutionOptionsFor(storage, ex.original.id).then(setOptions).catch(() => setOptions([]))
  }
  const submit = () => {
    const w = Number(weight.replace(',', '.')), r = Number(reps)
    if (!Number.isFinite(w) || !Number.isFinite(r)) return
    onLog({ weight_kg: w, reps: Math.round(r), rir, is_warmup: warmup, pain_flag: pain, technique_flag: technique })
    setWarmup(false); setPain(false); setTechnique(false)
  }

  return (
    <section className="exercise">
      <div className="row-head">
        <h1>{ex.performed.name}</h1>
        <button className="link" onClick={openSub}><Repeat size={14} aria-hidden /> {ex.substitution ? 'Sustituido' : 'Sustituir'}</button>
      </div>
      {ex.substitution && <p className="note status-warn">Sustituye a {ex.original.name} solo en esta sesión. La progresión de ambos queda bloqueada hoy.</p>}
      <div className="targets mono">{te.sets} × {te.reps_min}–{te.reps_max} · RIR {te.target_rir} · descanso {te.rest_s} s</div>

      <ProgressionLine ex={ex} open={showDetail} onToggle={() => setShowDetail(s => !s)} />

      {showSub && (
        <div className="sheet">
          <div className="eyebrow">Sustitutos compatibles con tu equipo</div>
          {options === null ? <p className="muted small">Buscando…</p> : options.length === 0 ? <p className="muted small">Sin sustitutos compatibles en el catálogo.</p> : (
            <ul className="options">
              {options.map(o => (
                <li key={o.exercise.id}>
                  <button className="option" onClick={() => { onSubstitute(o.exercise.id, 'equipment'); setShowSub(false) }}>
                    <span>{o.exercise.name}</span>
                    <span className="muted small">{o.member.quality === 'high' ? 'equivalente' : o.member.quality === 'medium' ? 'parcial' : 'lejano'} · {o.member.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Elegir un sustituto no cambia la plantilla ni el programa.</p>
        </div>
      )}

      <SetsTable sets={ex.sets} onRemove={onRemove} />

      <form className="set-form" onSubmit={e => { e.preventDefault(); submit() }}>
        <div className="set-row">
          <label className="field"><span>kg</span><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></label>
          <label className="field"><span>reps</span><input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} placeholder="0 = no hecha" /></label>
        </div>
        <Chips label="RIR" options={[0, 1, 2, 3, 4].map(n => ({ v: n, l: n === 4 ? '4+' : String(n) }))} value={rir} onChange={v => setRir(Number(v) as 0 | 1 | 2 | 3 | 4)} />
        <div className="toggles">
          <button type="button" className={`chip${warmup ? ' on' : ''}`} aria-pressed={warmup} onClick={() => setWarmup(w => !w)}>Calentamiento</button>
          <button type="button" className={`chip flag${pain ? ' on-crit' : ''}`} aria-pressed={pain} onClick={() => setPain(p => !p)}><Flag size={14} aria-hidden /> Dolor</button>
          <button type="button" className={`chip flag${technique ? ' on-crit' : ''}`} aria-pressed={technique} onClick={() => setTechnique(t => !t)}><AlertTriangle size={14} aria-hidden /> Técnica</button>
        </div>
        <div className="quick">
          <button className="btn" type="submit">Registrar serie {ex.sets.length + 1}</button>
          <button className="btn secondary" type="button" onClick={onNext} disabled={isLast}>Siguiente ejercicio</button>
        </div>
        {(pain || technique) && <p className="muted small">Con dolor o técnica marcados la progresión de este ejercicio queda bloqueada hoy. Sigue si quieres; nada cambia automáticamente.</p>}
        <p className="muted small">Las series de calentamiento se guardan pero no cuentan para la progresión. Reps 0 = serie no realizada.</p>
      </form>
    </section>
  )
}

function ProgressionLine({ ex, open, onToggle }: { ex: ExerciseView; open: boolean; onToggle: () => void }) {
  const d = ex.decision
  const last = ex.last
  const label = d.blocked_by.includes('no_history') ? 'Sin datos suficientes' :
    d.progression_blocked ? `Bloqueada (${d.blocked_by.map(blockLabel).join(', ')})` :
    d.action === 'increase' ? `Subir → ${d.suggested_weight_kg} kg` :
    d.action === 'decrease_10pct' ? `Bajar 10 % → ${d.suggested_weight_kg} kg` : `Mantener ${d.suggested_weight_kg} kg`
  const cls = d.blocked_by.includes('no_history') ? '' : d.progression_blocked ? 'status-crit' : d.action === 'increase' ? 'status-ok' : d.action === 'decrease_10pct' ? 'status-warn' : ''
  return (
    <div className="progression">
      <button className="row-head link-row" onClick={onToggle} aria-expanded={open}>
        <span>Hoy: <strong className={cls}>{label}</strong>{d.stalled && <span className="status-warn"> · estancado</span>}</span>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {open && (
        <dl className="kv">
          <dt>Última vez</dt><dd>{last && last.load_kg !== null ? `${fmtDate(last.date)} · ${last.load_kg} kg × ${last.reps.join(' / ')} · RIR ${last.rirs.join('/')}` : 'sin registro'}</dd>
          {last && last.outcome === 'blocked' && <><dt>Esa sesión</dt><dd className="status-crit">bloqueada: {last.blocked_by.map(blockLabel).join(', ')}</dd></>}
          {last && last.outcome === 'incomparable' && <><dt>Esa sesión</dt><dd>incomparable (otra carga u objetivos)</dd></>}
          <dt>Sin progreso</dt><dd>{d.sessions_without_progress} sesión(es){d.stalled ? ' · estancamiento: solo se reporta' : ''}</dd>
          <dt>Bajo el piso</dt><dd>{d.sessions_under_floor} sesión(es) seguidas</dd>
          <dt>Motor</dt><dd className="small">{d.rationale}</dd>
        </dl>
      )}
    </div>
  )
}

function SetsTable({ sets, onRemove }: { sets: ExerciseSet[]; onRemove: (id: string) => void }) {
  if (sets.length === 0) return <p className="muted small">Sin series todavía.</p>
  return (
    <table className="sets">
      <thead><tr><th>#</th><th>kg</th><th>reps</th><th>RIR</th><th></th><th></th></tr></thead>
      <tbody>
        {sets.map(s => (
          <tr key={s.id} className={s.is_warmup ? 'warm' : ''}>
            <td className="mono">{s.set_number}</td><td className="mono">{s.weight_kg}</td><td className="mono">{s.reps === 0 ? '—' : s.reps}</td><td className="mono">{s.rir === 4 ? '4+' : s.rir}</td>
            <td className="small">{s.is_warmup ? 'calent.' : ''}{s.pain_flag ? <span className="status-crit"> dolor</span> : ''}{s.technique_flag ? <span className="status-crit"> técnica</span> : ''}{s.reps === 0 && !s.is_warmup ? <span className="muted"> no hecha</span> : ''}</td>
            <td><button className="link" aria-label={`Borrar serie ${s.set_number}`} onClick={() => onRemove(s.id)}><Trash2 size={14} aria-hidden /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ───────────────────────── Resumen al completar ─────────────────────────

function FinishSummary({ result, onDone }: { result: FinishResult; onDone: () => void }) {
  const c = result.completion
  return (
    <>
      <div className="eyebrow">Sesión {c.reason === 'already_completed' ? 'ya estaba completada' : c.reason === 'template_mismatch' ? 'cerrada (fuera de la rotación)' : 'completada'}</div>
      <h1 className="question">Resultado</h1>
      {c.reason === 'advanced_out_of_order' && (
        <div className="warn-box">
          <div className="eyebrow status-warn">Sesión fuera de orden</div>
          <dl className="kv">
            <dt>Completaste</dt><dd>{result.completed_template_name}</dd>
            <dt>La rotación esperaba</dt><dd>{result.skipped_template_name}</dd>
            <dt>Continuará desde</dt><dd>{result.next_template_name}</dd>
          </dl>
          <p className="muted small">{result.skipped_template_name} no se recuperará automáticamente.</p>
        </div>
      )}
      {c.reason === 'template_mismatch' && <p className="note status-warn">Esta plantilla no pertenece a la rotación: la sesión queda registrada pero la rotación no se mueve.</p>}
      {c.advanced && c.reason === 'advanced' && <p className="note status-ok">Rotación: siguiente sesión {result.next_template_name}.</p>}
      {result.stall_alerts_created > 0 && <p className="note status-warn">Estancamiento detectado en {result.stall_alerts_created} ejercicio(s). Solo se reporta; nada cambia en el programa.</p>}
      <section className="block">
        <div className="eyebrow">Progresión por ejercicio</div>
        <dl className="kv">
          {result.decisions.map(({ exercise, decision, today }) => (
            <span key={exercise.id} style={{ display: 'contents' }}>
              <dt>{exercise.name}{today && today.load_kg !== null ? <span className="muted small"> · {today.load_kg} kg × {today.reps.join('/')}</span> : ''}</dt>
              <dd className={decisionClass(decision)}>{decisionLabel(decision, today)}</dd>
            </span>
          ))}
        </dl>
      </section>
      <button className="btn" onClick={onDone}>Volver a AHORA</button>
    </>
  )
}

function decisionClass(d: FinishResult['decisions'][number]['decision']) {
  if (d.blocked_by.includes('no_history')) return ''
  if (d.progression_blocked) return 'status-crit'
  if (d.action === 'increase') return 'status-ok'
  if (d.action === 'decrease_10pct') return 'status-warn'
  return ''
}
function decisionLabel(d: FinishResult['decisions'][number]['decision'], today: FinishResult['decisions'][number]['today']) {
  if (!today || today.outcome === 'not_evaluable') return 'sin datos suficientes'
  if (today.outcome === 'blocked') return `bloqueada · ${today.blocked_by.map(blockLabel).join(', ')}`
  if (today.outcome === 'incomparable') return 'incomparable'
  const base = d.action === 'increase' ? `subir → ${d.suggested_weight_kg} kg` : d.action === 'decrease_10pct' ? `bajar 10 % → ${d.suggested_weight_kg} kg` : `mantener ${d.suggested_weight_kg} kg`
  return `${base}${d.stalled ? ' · estancado' : ''}${today.performance_below_floor ? ' · bajo el piso' : ''}`
}
