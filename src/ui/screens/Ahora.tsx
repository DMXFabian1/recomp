/**
 * AHORA — Fase 8.5. Responde "¿Qué hago ahora?". Una acción dominante; después check-in, qué toca hoy,
 * ayer, y las acciones rápidas (No tengo tiempo · Me salí · Día irregular).
 * Toda regla viene de app/services (que delegan en domain). Aquí no hay rotación, progresión ni nutrición.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, Play, RefreshCw, UtensilsCrossed } from 'lucide-react'
import type { DailyCheckIn, MealSlot, WorkoutSession } from '@domain/entities'
import { isAppError } from '@domain/errors'
import {
  loadNowState, logOffPlan, MEAL_SLOTS, recordNoTime, saveCheckIn, setIrregular, slotForTime, startSession, suggestVersion,
  type CheckInPatch, type NowState, type SessionVersionSuggestion, type TimeBudget, type TimeBudgetPlan,
} from '@app/services'
import { useApp } from '../AppContext'
import { CheckInForm } from '../components/CheckInForm'
import { Chips } from '../components/Chips'

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Desayuno', lunch: 'Comida', snack: 'Snack', dinner: 'Cena' }
const VERSION_LABEL: Record<WorkoutSession['version'], string> = { full: 'Completa', short: 'Corta', minimal: 'Mínima' }
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

type Sheet = 'none' | 'no_time' | 'off_plan' | 'irregular' | 'start'

export function Ahora({ onGoTraining }: { onGoTraining: () => void }) {
  const { storage } = useApp()
  const [state, setState] = useState<NowState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>('none')
  const [editingCheckIn, setEditingCheckIn] = useState(false)
  const [plan, setPlan] = useState<TimeBudgetPlan | null>(null)

  const refresh = useCallback(() => {
    loadNowState(storage, new Date())
      .then(s => { setState(s); setError(null) })
      .catch((e: unknown) => setError(isAppError(e) ? e.message : 'No se pudo leer el estado.'))
  }, [storage])
  useEffect(() => { refresh() }, [refresh])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); setSheet('none'); refresh() }
    catch (e) { setError(isAppError(e) ? e.message : 'No se pudo guardar.') }
  }

  if (!state) return <><div className="eyebrow">Ahora</div><p className="muted">{error ?? 'Cargando…'}</p></>

  const { today_state: t, check_in: ci, yesterday: y, action } = state
  const sessionAvailable = t.kind === 'suggested' || t.kind === 'session_open'
  const nowIso = () => new Date().toISOString()

  const onSaveCheckIn = (patch: CheckInPatch) => act(async () => { await saveCheckIn(storage, state.today, patch, nowIso()); setEditingCheckIn(false) })

  return (
    <>
      <div className="eyebrow">Ahora · {fmtDate(state.today)} · {state.now_hhmm}</div>
      <h1 className="question">¿Qué hago ahora?</h1>
      {error && <div className="banner">{error}</div>}

      <PrimaryAction action={action} state={state} onCheckIn={() => setEditingCheckIn(true)} onStart={() => setSheet(sheet === 'start' ? 'none' : 'start')} onContinue={onGoTraining} />
      {sheet === 'start' && t.template && <StartSheet state={state} onStart={(sugg, choice, tm) => act(() => startSession(storage, { template: t.template!, date: state.today, suggestion: sugg, userChoice: choice, time_mode: tm }, nowIso()))} />}

      <section className="block" aria-label="Check-in">
        <div className="row-head"><span className="eyebrow">Check-in</span>{ci && !editingCheckIn && <button className="link" onClick={() => setEditingCheckIn(true)}>Editar</button>}</div>
        {ci && !editingCheckIn ? <CheckInSummary ci={ci} /> : <CheckInForm initial={ci} onSave={onSaveCheckIn} onCancel={ci ? () => setEditingCheckIn(false) : undefined} />}
      </section>

      <section className="block" aria-label="Hoy">
        <div className="eyebrow">Hoy</div>
        <TodayBlock state={state} />
      </section>

      <section className="block" aria-label="Ayer">
        <div className="eyebrow">Ayer · {fmtDate(y.date)}</div>
        <dl className="kv">
          <dt>Adherencia</dt><dd className={y.adherence === 'high' ? 'status-ok' : y.adherence === 'low' ? 'status-crit' : y.adherence === 'medium' ? 'status-warn' : ''}>{adherenceLabel(y.adherence)}</dd>
          <dt>Proteína</dt><dd className={y.protein_complete === true ? 'status-ok' : y.protein_complete === false ? 'status-warn' : ''}>{proteinLabel(y)}</dd>
          <dt>Comidas</dt><dd>{y.logged_meals === 0 ? 'sin registro' : `${y.consumed_meals} de ${y.planned_meals}${y.estimated_meals ? ` · ${y.estimated_meals} estimadas` : ''}${y.skipped_meals ? ` · ${y.skipped_meals} omitidas` : ''}`}</dd>
        </dl>
        <p className="muted small">Adherencia y proteína se miden por separado; ninguna se deduce de la otra.</p>
      </section>

      <section className="block" aria-label="Acciones rápidas">
        <div className="quick">
          <button className="btn secondary" onClick={() => setSheet(sheet === 'no_time' ? 'none' : 'no_time')}><Clock size={18} strokeWidth={1.75} aria-hidden /> No tengo tiempo</button>
          <button className="btn secondary" onClick={() => setSheet(sheet === 'off_plan' ? 'none' : 'off_plan')}><UtensilsCrossed size={18} strokeWidth={1.75} aria-hidden /> Me salí</button>
          <button className={`btn secondary${ci?.irregular ? ' active' : ''}`} onClick={() => setSheet(sheet === 'irregular' ? 'none' : 'irregular')}><AlertTriangle size={18} strokeWidth={1.75} aria-hidden /> {ci?.irregular ? 'Día irregular: activo' : 'Día irregular'}</button>
        </div>
        {sheet === 'no_time' && <NoTimeSheet sessionAvailable={sessionAvailable} onPick={m => act(async () => setPlan(await recordNoTime(storage, m, sessionAvailable, nowIso())))} />}
        {sheet === 'off_plan' && state.settings && <OffPlanSheet defaultSlot={slotForTime(state.now_hhmm, state.settings.schedule)} onSave={(slot, protein, note) => act(() => logOffPlan(storage, { date: state.today, slot, protein_g: protein, ...(note ? { note } : {}) }, nowIso()))} />}
        {sheet === 'irregular' && <IrregularSheet ci={ci} onSet={(on, extra) => act(() => setIrregular(storage, state.today, on, nowIso(), extra))} />}
        {plan && <PlanNote plan={plan} onHide={() => setPlan(null)} />}
      </section>
    </>
  )
}

function PlanNote({ plan, onHide }: { plan: TimeBudgetPlan; onHide: () => void }) {
  const text = {
    walk_or_prep: 'Con ese tiempo, lo útil: caminar o dejar listo el día (comida, ropa, bolsa). No es un fallo.',
    session_minimal: 'Versión mínima: los 2 ejercicios marcados de la sesión de hoy. Elige "Mínima" al iniciar.',
    session_short: 'Versión corta: los 3 ejercicios marcados. Elige "Corta" al iniciar.',
    session_full: 'Te alcanza para la sesión completa.',
  }[plan.action]
  return <p className="note"><span className="mono">{plan.minutes} min</span> · {text} <button className="link" onClick={onHide}>Ocultar</button></p>
}

// ───────────────────────── Bloques ─────────────────────────

function PrimaryAction({ action, state, onCheckIn, onStart, onContinue }: { action: NowState['action']; state: NowState; onCheckIn: () => void; onStart: () => void; onContinue: () => void }) {
  const t = state.today_state
  const name = t.template?.name ?? '—'
  const map: Record<NowState['action'], { title: string; detail: string; label?: string; onClick?: () => void; Icon?: typeof Play }> = {
    check_in: { title: 'Registra el check-in', detail: 'Peso, sueño y cómo comiste ayer. Lo que no sepas, déjalo vacío.', label: 'Hacer check-in', onClick: onCheckIn },
    continue_session: { title: `Sesión abierta: ${state.open_session ? nameOf(state, state.open_session.template_id) : name}`, detail: `Versión ${VERSION_LABEL[state.open_session?.version ?? 'full'].toLowerCase()} · iniciada ${state.open_session?.started_at.slice(11, 16) ?? ''}`, label: 'Continuar sesión', onClick: onContinue, Icon: RefreshCw },
    register_yesterday: { title: 'Falta cómo comiste ayer', detail: 'Plan, casi o me salí. Un toque; la proteína se calcula aparte.', label: 'Registrar ayer', onClick: onCheckIn },
    start_session: { title: `Toca ${name}`, detail: `${t.rotation_position ? `${t.rotation_position.index} de ${t.rotation_position.length} en la rotación` : ''}${t.is_suggested_weekday ? '' : ' · hoy no es día sugerido, pero la rotación no cambia'}`, label: `Iniciar ${name}`, onClick: onStart, Icon: Play },
    rest: { title: 'Hoy ya entrenaste', detail: `Siguiente: ${name}. Cuida comida, pasos y sueño.` },
    prepare: { title: 'El programa empieza el ' + fmtDate(state.settings?.effective_from ?? state.today), detail: `Primera sesión: ${name}. Deja listo el gym y la comida.` },
    none: { title: 'Sin programa activo', detail: 'Revisa MÁS → Diagnóstico.' },
  }
  const a = map[action]
  const Icon = a.Icon ?? Play
  return (
    <div className="primary">
      <div className="primary-title">{a.title}</div>
      {a.detail && <div className="muted">{a.detail}</div>}
      {a.label && a.onClick && <button className="btn" onClick={a.onClick}><Icon size={18} strokeWidth={2} aria-hidden /> {a.label}</button>}
    </div>
  )
}

function nameOf(state: NowState, templateId: string) {
  return state.templates.find(t => t.id === templateId)?.name ?? templateId
}

function TodayBlock({ state }: { state: NowState }) {
  const t = state.today_state
  if (t.kind === 'no_program') return <p className="muted">Sin programa activo.</p>
  const pos = t.rotation_position ? `${t.rotation_position.index}/${t.rotation_position.length}` : '—'
  return (
    <dl className="kv">
      <dt>Estado</dt><dd>{kindLabel(t.kind)}</dd>
      <dt>Sesión</dt><dd>{t.template?.name ?? (t.template_missing ? 'plantilla no encontrada' : '—')} · {pos}</dd>
      <dt>Día sugerido</dt><dd>{t.is_suggested_weekday ? 'sí' : 'no'}</dd>
      <dt>Última completada</dt><dd>{t.last_completed ? `${fmtDate(t.last_completed.date)} · hace ${t.days_since_last_completed} d` : 'ninguna todavía'}</dd>
      {t.long_absence && <><dt>Ausencia</dt><dd className="status-warn">{t.days_since_last_completed} días; se retoma donde quedó</dd></>}
      {t.template && t.kind !== 'session_open' && <><dt>Ejercicios</dt><dd>{t.template.exercises.length} · corta {t.template.exercises.filter(e => e.in_short).length} · mínima {t.template.exercises.filter(e => e.in_minimal).length}</dd></>}
    </dl>
  )
}

function CheckInSummary({ ci }: { ci: DailyCheckIn }) {
  const v = (x: unknown, suffix = '') => (x === undefined ? '—' : `${x}${suffix}`)
  return (
    <dl className="kv">
      <dt>Peso</dt><dd>{v(ci.weight_kg, ' kg')}</dd>
      <dt>Sueño</dt><dd>{v(ci.sleep_bucket, ' h')}</dd>
      <dt>Energía · ánimo · hambre</dt><dd>{v(ci.energy)} · {v(ci.mood)} · {v(ci.hunger)}</dd>
      <dt>Ayer comí</dt><dd>{ci.food_yesterday ? adherenceLabel(ci.food_yesterday === 'plan' ? 'high' : ci.food_yesterday === 'almost' ? 'medium' : 'low') : '—'}</dd>
      <dt>Pasos ayer</dt><dd>{v(ci.steps_yesterday)}</dd>
    </dl>
  )
}

function NoTimeSheet({ sessionAvailable, onPick }: { sessionAvailable: boolean; onPick: (m: TimeBudget) => void }) {
  return (
    <div className="sheet">
      <div className="eyebrow">¿Cuánto tiempo tienes?</div>
      <Chips options={[{ v: 5, l: '5 min' }, { v: 15, l: '15 min' }, { v: 30, l: '30 min' }, { v: 60, l: '60+ min' }]} value={null} onChange={v => onPick(v as TimeBudget)} />
      <p className="muted small">{sessionAvailable ? 'Te oriento a la versión que cabe. Tú eliges al iniciar.' : 'Hoy no toca sesión: cualquier tiempo sirve para caminar o preparar.'}</p>
    </div>
  )
}

function OffPlanSheet({ defaultSlot, onSave }: { defaultSlot: MealSlot; onSave: (slot: MealSlot, protein: number | null, note: string) => void }) {
  const [slot, setSlot] = useState<MealSlot>(defaultSlot)
  const [protein, setProtein] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="sheet">
      <div className="eyebrow">Me salí · ¿en cuál comida?</div>
      <Chips options={MEAL_SLOTS.map(s => ({ v: s, l: SLOT_LABEL[s] }))} value={slot} onChange={v => setSlot(v as MealSlot)} />
      <label className="field"><span>Proteína aproximada (g) · opcional</span><input inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} placeholder="no sé" /></label>
      <label className="field"><span>Nota breve · opcional</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} /></label>
      <button className="btn" onClick={() => onSave(slot, protein.trim() === '' ? null : Number(protein), note.trim())}>Registrar</button>
      <p className="muted small">Queda como fuera del plan. No cambia alimentos ni inventario.</p>
    </div>
  )
}

function IrregularSheet({ ci, onSet }: { ci: DailyCheckIn | null; onSet: (on: boolean, extra: { irregular_food?: DailyCheckIn['irregular_food']; irregular_activity?: DailyCheckIn['irregular_activity'] }) => void }) {
  const [food, setFood] = useState<DailyCheckIn['irregular_food']>(ci?.irregular_food)
  const [activity, setActivity] = useState<DailyCheckIn['irregular_activity']>(ci?.irregular_activity)
  return (
    <div className="sheet">
      <div className="eyebrow">Día irregular</div>
      <p className="muted small">Viaje, evento, enfermedad. No cambia calorías, programa ni metas; solo queda registrado.</p>
      <Chips label="Comida" options={[{ v: 'low', l: 'Poca' }, { v: 'normal', l: 'Normal' }, { v: 'high', l: 'Mucha' }]} value={food ?? null} onChange={v => setFood(v as DailyCheckIn['irregular_food'])} />
      <Chips label="Actividad" options={[{ v: 'none', l: 'Nada' }, { v: 'walk', l: 'Caminé' }, { v: 'train', l: 'Entrené' }]} value={activity ?? null} onChange={v => setActivity(v as DailyCheckIn['irregular_activity'])} />
      <div className="quick">
        <button className="btn" onClick={() => onSet(true, { ...(food ? { irregular_food: food } : {}), ...(activity ? { irregular_activity: activity } : {}) })}>{ci?.irregular ? 'Actualizar' : 'Marcar irregular'}</button>
        {ci?.irregular && <button className="btn secondary" onClick={() => onSet(false, {})}>Quitar</button>}
      </div>
    </div>
  )
}

function StartSheet({ state, onStart }: { state: NowState; onStart: (s: SessionVersionSuggestion, choice: WorkoutSession['version'] | null, tm: 'short' | 'minimal' | null) => void }) {
  const t = state.today_state.template!
  const [timeMode, setTimeMode] = useState<'short' | 'minimal' | null>(null)
  const sugg = suggestVersion({ template: t, sleep_bucket: state.check_in?.sleep_bucket ?? null, time_mode: timeMode })
  const [choice, setChoice] = useState<WorkoutSession['version'] | null>(null)
  const version = choice ?? sugg.version
  const count = (v: WorkoutSession['version']) => v === 'minimal' ? t.exercises.filter(e => e.in_minimal).length : v === 'short' ? t.exercises.filter(e => e.in_short).length : t.exercises.length
  return (
    <div className="sheet">
      <div className="eyebrow">Iniciar {t.name}</div>
      {sugg.reason === 'sleep_short' && <p className="note status-warn">Dormiste menos de 6 h: te sugiero la versión corta. Tú decides.</p>}
      <Chips label="Versión" options={(['full', 'short', 'minimal'] as const).map(v => ({ v, l: `${VERSION_LABEL[v]} · ${count(v)} ej.${sugg.version === v ? ' · sugerida' : ''}` }))} value={version} onChange={v => { setChoice(v as WorkoutSession['version']); setTimeMode(v === 'short' ? 'short' : v === 'minimal' ? 'minimal' : null) }} />
      <button className="btn" onClick={() => onStart(sugg, choice, timeMode)}><Play size={18} strokeWidth={2} aria-hidden /> Iniciar versión {VERSION_LABEL[version].toLowerCase()}</button>
      <p className="muted small">El registro serie a serie llega en la pantalla ENTRENAR (8.6). La rotación solo avanza al completar.</p>
    </div>
  )
}

// ───────────────────────── Etiquetas ─────────────────────────
function kindLabel(k: NowState['today_state']['kind']) {
  return { no_program: 'sin programa', not_started: 'programa no iniciado', session_open: 'sesión abierta', done_today: 'completada hoy', suggested: 'toca entrenar' }[k]
}
function adherenceLabel(a: NowState['yesterday']['adherence']) {
  return { high: 'Según el plan', medium: 'Casi', low: 'Me salí', unknown: 'Sin dato' }[a]
}
function proteinLabel(y: NowState['yesterday']) {
  const p = y.protein
  if (p.status === 'no_data') return 'sin registro'
  const g = `${p.grams_known} g`
  if (p.status === 'complete') return `${g} · completa (≥ ${p.floor_g})`
  if (p.status === 'incomplete') return `${g} · falta para ${p.floor_g}`
  return `≥ ${g} conocidos · ${p.unknown_meals} comida(s) sin dato`
}
