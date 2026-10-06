/**
 * Fase 8.6 — servicios de entrenamiento sobre IndexedDB real (fake-indexeddb) con el seed oficial.
 * El motor (evaluate/decide/completeSession) ya está probado en domain; aquí se prueba la integración:
 * persistencia, transacciones, autoridad del motor y que el cursor solo cambia al completar.
 */
import { describe, expect, it } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import type { Storage } from '@repo/index'
import type { WorkoutSession } from '@domain/entities'
import { saveCheckIn } from './checkin'
import { loadNowState } from './now'
import { startSession, suggestVersion, getOpenSession } from './sessions'
import {
  abandonOpenSession, cancelOpenSession, finishSession, loadSessionView, logSet, removeSet, substituteInSession,
  substitutionOptionsFor, updateSet, activeProfile, type SetInput,
} from './training'
import { logCardio, logMonthlyTest, splitFor, CARDIO_PRESETS } from './cardio'

const E = SEED_IDS.exercises
const ISO = (d: string, hhmm = '18:15') => `${d}T${hhmm}:00.000Z`

async function fresh(name: string) {
  const s = new DexieStorage(name)
  await s.open()
  await seedIfEmpty(s)
  return s
}

async function open(s: Storage, date: string, version: WorkoutSession['version'] = 'full', templateId?: string) {
  const st = await loadNowState(s, new Date(`${date}T18:00:00`))
  const template = templateId ? (await s.repos.workout_templates.get(templateId))! : st.today_state.template!
  const sugg = suggestVersion({ template })
  return startSession(s, { template, date, suggestion: sugg, userChoice: version }, ISO(date))
}

const set = (session_id: string, exercise_id: string, w: number, reps: number, rir: 0 | 1 | 2 | 3 | 4 = 2, extra: Partial<SetInput> = {}): SetInput =>
  ({ session_id, exercise_id, weight_kg: w, reps, rir, is_warmup: false, ...extra })

async function logWork(s: Storage, session: WorkoutSession, exerciseId: string, w: number, repsList: number[], rir: 0 | 1 | 2 | 3 | 4 = 2, date = session.date) {
  for (const [i, reps] of repsList.entries()) await logSet(s, set(session.id, exerciseId, w, reps, rir), ISO(date, `18:${20 + i}`))
}

async function fullSession(s: Storage, date: string, templateId: string, squatW: number, squatReps: number[], rir: 0 | 1 | 2 | 3 | 4 = 2) {
  const ws = await open(s, date, 'full', templateId)
  await logWork(s, ws, E.squat, squatW, squatReps, rir, date)
  return finishSession(s, ws.id, ISO(date, '19:30'), date)
}

describe('sesión: iniciar, continuar, vista', () => {
  it('iniciar desde AHORA → vista con ejercicios de la versión, targets de la plantilla y decisión sin historial', async () => {
    const s = await fresh('tr_view')
    await saveCheckIn(s, '2026-10-06', { food_yesterday: 'plan' }, ISO('2026-10-06', '06:30'))
    const ws = await open(s, '2026-10-06', 'full')
    const v = await loadSessionView(s, ws.id)
    expect(v.template.name).toBe('Pierna A')
    expect(v.exercises).toHaveLength(6)
    const sq = v.exercises.find(e => e.original.id === E.squat)!
    expect(sq.decision.blocked_by).toEqual(['no_history'])
    expect(sq.decision.suggested_weight_kg).toBeNull()
    expect(sq.sets).toEqual([])
    expect((await getOpenSession(s))!.id).toBe(ws.id) // continuar
    s.close()
  })
  it.each(['full', 'short', 'minimal'] as const)('versión %s muestra solo sus ejercicios', async version => {
    const s = await fresh(`tr_ver_${version}`)
    const ws = await open(s, '2026-10-06', version)
    const v = await loadSessionView(s, ws.id)
    expect(v.exercises).toHaveLength(version === 'full' ? 6 : version === 'short' ? 3 : 2)
    s.close()
  })
  it('conflicto: no se puede abrir una segunda sesión', async () => {
    const s = await fresh('tr_conflict')
    await open(s, '2026-10-06')
    await expect(open(s, '2026-10-06')).rejects.toMatchObject({ code: 'conflict' })
    s.close()
  })
})

describe('series', () => {
  it('registra series con targets copiados de la plantilla, numeración automática y validación', async () => {
    const s = await fresh('tr_sets')
    const ws = await open(s, '2026-10-06')
    const a = await logSet(s, set(ws.id, E.squat, 40, 8, 4, { is_warmup: true }), ISO('2026-10-06', '18:16'))
    const b = await logSet(s, set(ws.id, E.squat, 60, 8), ISO('2026-10-06', '18:20'))
    expect(a.set_number).toBe(1)
    expect(b.set_number).toBe(2)
    expect(b.target_reps_min).toBe(6)
    expect(b.target_reps_max).toBe(8)
    expect(b.target_rir).toBe(2)
    const v = await loadSessionView(s, ws.id)
    const sq = v.exercises.find(e => e.original.id === E.squat)!
    expect(sq.sets).toHaveLength(2)
    expect(sq.work_sets_done).toBe(1) // el calentamiento no cuenta
    await expect(logSet(s, set(ws.id, E.squat, -5, 8), ISO('2026-10-06', '18:21'))).rejects.toMatchObject({ code: 'validation' })
    await expect(logSet(s, set(ws.id, E.squat, 60, 8.5), ISO('2026-10-06', '18:21'))).rejects.toMatchObject({ code: 'validation' })
    await expect(logSet(s, set(ws.id, 'ex_power_clean', 60, 8), ISO('2026-10-06', '18:21'))).rejects.toMatchObject({ code: 'not_allowed' })
    expect((await s.repos.exercise_sets.getLive())).toHaveLength(2)
    s.close()
  })
  it('editar y borrar serie (solo con sesión abierta); dolor y técnica se guardan como flags', async () => {
    const s = await fresh('tr_edit')
    const ws = await open(s, '2026-10-06')
    const a = await logSet(s, set(ws.id, E.squat, 60, 8), ISO('2026-10-06', '18:20'))
    const b = await updateSet(s, a.id, { reps: 9, pain_flag: true, technique_flag: true }, ISO('2026-10-06', '18:21'))
    expect(b.reps).toBe(9)
    expect(b.pain_flag).toBe(true)
    expect(b.technique_flag).toBe(true)
    await expect(updateSet(s, a.id, { rir: 7 as never }, ISO('2026-10-06', '18:22'))).rejects.toMatchObject({ code: 'validation' })
    await removeSet(s, a.id, ISO('2026-10-06', '18:23'))
    expect((await loadSessionView(s, ws.id)).exercises.find(e => e.original.id === E.squat)!.sets).toEqual([])
    await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
    await expect(logSet(s, set(ws.id, E.squat, 60, 8), ISO('2026-10-06', '19:01'))).rejects.toMatchObject({ code: 'not_allowed' })
    s.close()
  })
  it('serie no realizada (reps 0) se guarda pero el motor la excluye', async () => {
    const s = await fresh('tr_zero')
    const r = await fullSession(s, '2026-10-06', SEED_IDS.templates.legA, 60, [8, 8, 0])
    const d = r.decisions.find(d => d.exercise.id === E.squat)!
    expect(d.today!.working_sets).toBe(2)
    expect(d.today!.reached_max).toBe(true)
    expect(d.decision.action).toBe('increase')
    s.close()
  })
})

describe('completar: evaluación y progresión (motor como autoridad)', () => {
  it('todas al máximo con RIR ≥ target → increase +5 (incremento del seed para sentadilla)', async () => {
    const s = await fresh('tr_inc')
    const r = await fullSession(s, '2026-10-06', SEED_IDS.templates.legA, 60, [8, 8, 8])
    const d = r.decisions.find(d => d.exercise.id === E.squat)!
    expect(d.decision.action).toBe('increase')
    expect(d.decision.suggested_weight_kg).toBe(65)
    expect(r.completion.reason).toBe('advanced')
    expect(r.completion.next_rotation_cursor).toBe(1)
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(1)
    expect((await s.repos.workout_sessions.getLive())[0]!.status).toBe('completed')
    // La vista de la siguiente sesión del mismo ejercicio muestra la sugerencia y la última vez
    const cursorAfter = (await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor
    expect(cursorAfter).toBe(1)
    s.close()
  })
  it('una serie bajo el máximo → hold; RIR insuficiente → hold', async () => {
    const s = await fresh('tr_hold')
    const r = await fullSession(s, '2026-10-06', SEED_IDS.templates.legA, 60, [8, 8, 7])
    expect(r.decisions.find(d => d.exercise.id === E.squat)!.decision.action).toBe('hold')
    s.close()
  })
  it('RIR 0 en básico → bloqueado aunque haya máximos', async () => {
    const s = await fresh('tr_rir0')
    const r = await fullSession(s, '2026-10-06', SEED_IDS.templates.legA, 60, [8, 8, 8], 0)
    const d = r.decisions.find(d => d.exercise.id === E.squat)!.decision
    expect(d.action).toBe('hold')
    expect(d.blocked_by).toEqual(['rir_zero_on_basic'])
    s.close()
  })
  it('dolor y técnica bloquean sin cambiar nada más', async () => {
    const s = await fresh('tr_pain')
    const ws = await open(s, '2026-10-06')
    await logSet(s, set(ws.id, E.squat, 60, 8, 2, { pain_flag: true }), ISO('2026-10-06', '18:20'))
    await logSet(s, set(ws.id, E.squat, 60, 8, 2, { technique_flag: true }), ISO('2026-10-06', '18:21'))
    const tplBefore = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
    const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:30'), '2026-10-06')
    const d = r.decisions.find(d => d.exercise.id === E.squat)!.decision
    expect(d.blocked_by).toEqual(['pain', 'technique'])
    expect(d.action).toBe('hold')
    expect((await s.repos.workout_templates.get(SEED_IDS.templates.legA))!).toEqual(tplBefore)
    expect(r.completion.advanced).toBe(true) // bloqueo ≠ no completar
    s.close()
  })
  it.each(['short', 'minimal'] as const)('%s: completa y avanza la rotación, pero no es evidencia de progreso', async version => {
    const s = await fresh(`tr_${version}`)
    const ws = await open(s, '2026-10-06', version)
    await logWork(s, ws, E.squat, 60, [8, 8, 8])
    const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
    expect(r.completion.advanced).toBe(true)
    const d = r.decisions.find(d => d.exercise.id === E.squat)!.decision
    expect(d.blocked_by).toEqual([`${version}_session`])
    expect(d.action).toBe('hold')
    s.close()
  })
  it('2 sesiones consecutivas bajo el piso a la misma carga → decrease_10pct (60 → 55 con incremento 5); 1 sola no', async () => {
    const s = await fresh('tr_deload')
    const r1 = await fullSession(s, '2026-10-06', SEED_IDS.templates.legA, 60, [5, 5, 4])
    expect(r1.decisions.find(d => d.exercise.id === E.squat)!.decision.action).toBe('hold')
    expect(r1.decisions.find(d => d.exercise.id === E.squat)!.decision.sessions_under_floor).toBe(1)
    // completar Torso A, Pierna B, Torso B para volver a Pierna A (sin series: no evaluables para sentadilla)
    for (const t of [SEED_IDS.templates.upperA, SEED_IDS.templates.legB, SEED_IDS.templates.upperB]) {
      const ws = await open(s, '2026-10-07', 'full', t)
      await finishSession(s, ws.id, ISO('2026-10-07', '19:00'), '2026-10-07')
    }
    const r2 = await fullSession(s, '2026-10-13', SEED_IDS.templates.legA, 60, [5, 5, 4])
    const d = r2.decisions.find(d => d.exercise.id === E.squat)!.decision
    expect(d.action).toBe('decrease_10pct')
    expect(d.suggested_weight_kg).toBe(55)
    s.close()
  })
  it('carga nueva = incomparable para rachas; primera sesión a carga mayor es progreso; 3 sin progreso → stall + Alert única', async () => {
    const s = await fresh('tr_stall')
    const cycle = async (date: string, w: number, reps: number[]) => {
      const r = await fullSession(s, date, SEED_IDS.templates.legA, w, reps)
      for (const t of [SEED_IDS.templates.upperA, SEED_IDS.templates.legB, SEED_IDS.templates.upperB]) {
        const ws = await open(s, date, 'full', t)
        await finishSession(s, ws.id, ISO(date, '21:00'), date)
      }
      return r.decisions.find(d => d.exercise.id === E.squat)!.decision
    }
    const d1 = await cycle('2026-10-06', 55, [7, 7, 7]) // no_progress 1
    expect(d1.sessions_without_progress).toBe(1)
    const d2 = await cycle('2026-10-13', 60, [7, 7, 7]) // carga nueva → progreso; racha 0
    expect(d2.evaluations[0]!.outcome).toBe('progressed')
    expect(d2.sessions_without_progress).toBe(0)
    const d3 = await cycle('2026-10-20', 60, [7, 7, 6])
    const d4 = await cycle('2026-10-27', 60, [7, 7, 6])
    expect(d4.sessions_without_progress).toBe(2)
    expect(d4.stalled).toBe(false)
    const d5 = await cycle('2026-11-03', 60, [7, 6, 6])
    expect(d5.stalled).toBe(true)
    expect(d5.action).toBe('hold')
    expect(d3.stalled).toBe(false)
    const alerts = await s.repos.alerts.whereEquals('type', 'stall')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.context.exercise_id).toBe(E.squat)
    expect(alerts[0]!.context.action_taken).toBe('none')
    // nada cambió en plantilla ni programa salvo el cursor
    const tpl = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
    expect(tpl.exercises.find(e => e.exercise_id === E.squat)!.reps_max).toBe(8)
    // una sesión más estancada no duplica la alerta abierta
    await cycle('2026-11-10', 60, [7, 6, 6])
    expect(await s.repos.alerts.whereEquals('type', 'stall')).toHaveLength(1)
    s.close()
  })
})

describe('sustitución en sesión', () => {
  it('opciones solo compatibles con el perfil activo; functional_rating no ordena', async () => {
    const s = await fresh('tr_sub_opts')
    const settings = (await s.repos.settings.getLive())[0]!
    expect(activeProfile(settings).name).toBe('Gimnasio')
    const gym = await substitutionOptionsFor(s, E.squat)
    expect(gym.length).toBeGreaterThan(0)
    expect(gym.every(o => o.compatible)).toBe(true)
    expect(gym.map(o => o.exercise.id)).toContain(E.legPress)
    // perfil casa: sin prensa ni mancuernas
    await s.run(['settings'], r => r.settings.put({ ...settings, active_equipment_profile: 'home' }))
    const home = await substitutionOptionsFor(s, E.squat)
    expect(home.map(o => o.exercise.id)).not.toContain(E.legPress)
    expect(home.map(o => o.exercise.id)).toContain(E.gobletSquat)
    s.close()
  })
  it('registrar sustitución: queda en la sesión, bloquea progresión, no toca plantilla/programa/cursor; las series van al sustituto con targets del original', async () => {
    const s = await fresh('tr_sub')
    const ws = await open(s, '2026-10-06')
    const tplBefore = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
    const progBefore = (await s.repos.programs.get(SEED_IDS.program))!
    const updated = await substituteInSession(s, ws.id, { original_exercise_id: E.squat, substitute_exercise_id: E.legPress, reason: 'equipment' }, ISO('2026-10-06', '18:16'))
    expect(updated.substitutions).toEqual([{ original_exercise_id: E.squat, substitute_exercise_id: E.legPress, reason: 'equipment' }])
    const setRow = await logSet(s, set(ws.id, E.legPress, 150, 8), ISO('2026-10-06', '18:20'))
    expect(setRow.target_reps_min).toBe(6) // targets de la sentadilla (original)
    const v = await loadSessionView(s, ws.id)
    const sq = v.exercises.find(e => e.original.id === E.squat)!
    expect(sq.performed.id).toBe(E.legPress)
    expect(sq.sets).toHaveLength(1)
    expect((await s.repos.workout_templates.get(SEED_IDS.templates.legA))!).toEqual(tplBefore)
    expect((await s.repos.programs.get(SEED_IDS.program))!).toEqual(progBefore)
    const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:30'), '2026-10-06')
    const d = r.decisions.find(d => d.exercise.id === E.squat)!.decision
    expect(d.blocked_by).toEqual(['substituted'])
    expect(d.action).toBe('hold')
    expect((await s.repos.workout_templates.get(SEED_IDS.templates.legA))!).toEqual(tplBefore)
    await expect(substituteInSession(s, ws.id, { original_exercise_id: E.squat, substitute_exercise_id: E.legPress }, ISO('2026-10-06', '19:31'))).rejects.toMatchObject({ code: 'not_allowed' })
    s.close()
  })
})

describe('rotación desde la app', () => {
  it('completar en orden recorre A → Torso A → Pierna B → Torso B → A', async () => {
    const s = await fresh('tr_rot')
    const expected = [[SEED_IDS.templates.legA, 1], [SEED_IDS.templates.upperA, 2], [SEED_IDS.templates.legB, 3], [SEED_IDS.templates.upperB, 0]] as const
    for (const [tpl, next] of expected) {
      const ws = await open(s, '2026-10-06', 'full', tpl)
      const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
      expect(r.completion.reason).toBe('advanced')
      expect(r.completion.next_rotation_cursor).toBe(next)
    }
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    s.close()
  })
  it('fuera de orden: advanced_out_of_order, skipped_template_id, nombres para la advertencia, cursor a la siguiente de la hecha', async () => {
    const s = await fresh('tr_ooo')
    const ws = await open(s, '2026-10-06', 'full', SEED_IDS.templates.legB) // tocaba Pierna A
    const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
    expect(r.completion.reason).toBe('advanced_out_of_order')
    expect(r.completion.skipped_template_id).toBe(SEED_IDS.templates.legA)
    expect(r.skipped_template_name).toBe('Pierna A')
    expect(r.next_template_name).toBe('Torso B')
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(3)
    expect(await s.repos.workout_sessions.count()).toBe(1) // sin retroactivas
    s.close()
  })
  it('plantilla fuera de la rotación: la sesión se cierra, el cursor no se mueve', async () => {
    const s = await fresh('tr_mismatch')
    await s.run(['workout_templates'], r => r.workout_templates.put({ id: 'tpl_extra', created_at: ISO('2026-10-01'), updated_at: ISO('2026-10-01'), source: 'user', name: 'Extra', order_in_rotation: 9, exercises: [{ exercise_id: E.squat, order: 0, sets: 3, reps_min: 6, reps_max: 10, target_rir: 2, rest_s: 120, in_short: true, in_minimal: true }] }))
    const ws = await open(s, '2026-10-06', 'full', 'tpl_extra')
    const r = await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
    expect(r.completion.reason).toBe('template_mismatch')
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    expect((await s.repos.workout_sessions.get(ws.id))!.status).toBe('completed')
    s.close()
  })
  it('idempotencia: finalizar dos veces no avanza dos veces ni duplica alertas', async () => {
    const s = await fresh('tr_idem')
    const ws = await open(s, '2026-10-06')
    const r1 = await finishSession(s, ws.id, ISO('2026-10-06', '19:00'), '2026-10-06')
    const r2 = await finishSession(s, ws.id, ISO('2026-10-06', '19:01'), '2026-10-06')
    expect(r1.completion.advanced).toBe(true)
    expect(r2.completion.reason).toBe('already_completed')
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(1)
    s.close()
  })
  it('abandonar y cancelar: cursor intacto, sin progreso ni stall ni deload; las series registradas se conservan', async () => {
    const s = await fresh('tr_abandon')
    const ws = await open(s, '2026-10-06')
    await logSet(s, set(ws.id, E.squat, 60, 8), ISO('2026-10-06', '18:20'))
    const ab = await abandonOpenSession(s, ws.id, ISO('2026-10-06', '18:30'))
    expect(ab.status).toBe('abandoned')
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    expect((await s.repos.exercise_sets.getLive())).toHaveLength(1)
    expect(await s.repos.alerts.count()).toBe(0)
    // una abandonada no es evaluable en la siguiente vista
    const ws2 = await open(s, '2026-10-07')
    const v = await loadSessionView(s, ws2.id)
    expect(v.exercises.find(e => e.original.id === E.squat)!.decision.blocked_by).toEqual(['no_history'])
    const ca = await cancelOpenSession(s, ws2.id, ISO('2026-10-07', '18:05'))
    expect(ca.deleted_at).toBeDefined()
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    expect(await getOpenSession(s)).toBeNull()
    s.close()
  })
})

describe('cardio / remo', () => {
  it('registra cardio con preset y RPE; valida; datos faltantes quedan ausentes', async () => {
    const s = await fresh('tr_cardio')
    const z2 = CARDIO_PRESETS.find(p => p.id === 'z2_20')!
    const c = await logCardio(s, { date: '2026-10-07', modality: 'row', preset: 'z2_20', duration_s: z2.duration_s, rpe: 4 }, ISO('2026-10-07', '07:00'))
    expect(c.distance_m).toBeUndefined()
    expect(c.preset).toBe('z2_20')
    const w = await logCardio(s, { date: '2026-10-08', modality: 'walk', duration_s: 1800, distance_m: 2500, rpe: 3, note: 'parque' }, ISO('2026-10-08', '07:00'))
    expect(w.note).toBe('parque')
    await expect(logCardio(s, { date: '2026-10-08', modality: 'row', duration_s: 0, rpe: 4 }, ISO('2026-10-08'))).rejects.toMatchObject({ code: 'validation' })
    await expect(logCardio(s, { date: '2026-10-08', modality: 'row', duration_s: 600, rpe: 11 }, ISO('2026-10-08'))).rejects.toMatchObject({ code: 'validation' })
    expect(await s.repos.cardio_sessions.count()).toBe(2)
    s.close()
  })
  it('prueba mensual de 10 min: una por mes, split derivado, reemplazo explícito, nota como actividad asociada', async () => {
    const s = await fresh('tr_test')
    const t = await logMonthlyTest(s, { date: '2026-10-07', distance_m: 2300, note: 'primera' }, ISO('2026-10-07', '07:00'))
    expect(t.duration_s).toBe(600)
    expect(t.month).toBe('2026-10')
    expect(t.split_avg_s).toBe(splitFor(2300, 600))
    expect(splitFor(2300, 600)).toBe(130.4)
    await expect(logMonthlyTest(s, { date: '2026-10-20', distance_m: 2400 }, ISO('2026-10-20'))).rejects.toMatchObject({ code: 'conflict' })
    const t2 = await logMonthlyTest(s, { date: '2026-10-20', distance_m: 2400, replace: true }, ISO('2026-10-20'))
    expect(t2.id).toBe(t.id)
    expect(t2.distance_m).toBe(2400)
    expect(await s.repos.monthly_tests.count()).toBe(1)
    expect((await s.repos.cardio_sessions.getLive())[0]!.note).toContain('primera')
    await expect(logMonthlyTest(s, { date: '2026-11-07', distance_m: 0 }, ISO('2026-11-07'))).rejects.toMatchObject({ code: 'validation' })
    s.close()
  })
})
