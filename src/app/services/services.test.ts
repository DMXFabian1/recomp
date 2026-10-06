/**
 * Tests de AHORA (Fase 8.5) sobre IndexedDB real (fake-indexeddb) con el seed oficial.
 * Fechas de prueba relativas a effective_from del seed (2026-10-06).
 */
import { describe, expect, it } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import { getCheckIn, saveCheckIn, setIrregular } from './checkin'
import { logOffPlan, slotForTime } from './meals'
import { loadNowState } from './now'
import { decideNowAction } from './nowAction'
import { getOpenSession, recordNoTime, startSession, suggestVersion } from './sessions'
import { planForTimeBudget } from '@domain/progression/timeBudget'
import { getToday, type TodayState } from '@domain/rotation/getToday'
import type { DailyCheckIn } from '@domain/entities'

const T = (d: string, hhmm = '06:30') => new Date(`${d}T${hhmm}:00`)
const ISO = (d: string, hhmm = '06:30') => T(d, hhmm).toISOString()
const DAY = '2026-10-06'

async function fresh(name: string) {
  const s = new DexieStorage(name)
  await s.open()
  await seedIfEmpty(s)
  return s
}

describe('check-in', () => {
  it('guarda parcialmente y fusiona en guardados sucesivos; lo ausente queda ausente', async () => {
    const s = await fresh('now_ci_1')
    expect(await getCheckIn(s, DAY)).toBeNull()
    const a = await saveCheckIn(s, DAY, { weight_kg: 119.4 }, ISO(DAY))
    expect(a.weight_kg).toBe(119.4)
    expect(a.sleep_bucket).toBeUndefined()
    expect(a.irregular).toBe(false)
    const b = await saveCheckIn(s, DAY, { sleep_bucket: '<6', food_yesterday: 'almost' }, ISO(DAY, '06:40'))
    expect(b.id).toBe(a.id)
    expect(b.weight_kg).toBe(119.4)
    expect(b.sleep_bucket).toBe('<6')
    expect(b.food_yesterday).toBe('almost')
    expect((await s.repos.daily_check_ins.whereEquals('date', DAY))).toHaveLength(1)
    s.close()
  })
  it('rechaza datos inválidos sin guardar nada', async () => {
    const s = await fresh('now_ci_2')
    await expect(saveCheckIn(s, DAY, { weight_kg: 5 }, ISO(DAY))).rejects.toMatchObject({ code: 'validation' })
    expect(await getCheckIn(s, DAY)).toBeNull()
    s.close()
  })
  it('modo irregular: marca, registra evento, no cambia settings ni programa; quitar limpia los extras', async () => {
    const s = await fresh('now_irr')
    const settingsBefore = await s.repos.settings.getAll()
    const programBefore = (await s.repos.programs.get(SEED_IDS.program))!
    const on = await setIrregular(s, DAY, true, ISO(DAY), { irregular_food: 'high', irregular_activity: 'walk' })
    expect(on.irregular).toBe(true)
    expect(on.irregular_food).toBe('high')
    expect(await s.repos.app_events.whereEquals('type', 'irregular_on')).toHaveLength(1)
    await setIrregular(s, DAY, true, ISO(DAY, '07:00')) // idempotente: sin segundo evento
    expect(await s.repos.app_events.whereEquals('type', 'irregular_on')).toHaveLength(1)
    const off = await setIrregular(s, DAY, false, ISO(DAY, '08:00'))
    expect(off.irregular).toBe(false)
    expect(off.irregular_food).toBeUndefined()
    expect(await s.repos.app_events.whereEquals('type', 'irregular_off')).toHaveLength(1)
    expect(await s.repos.settings.getAll()).toEqual(settingsBefore)
    expect((await s.repos.programs.get(SEED_IDS.program))!).toEqual(programBefore)
    s.close()
  })
})

describe('ME SALÍ', () => {
  it('registra off_plan con proteína opcional y no toca alimentos ni inventario', async () => {
    const s = await fresh('now_off')
    const foodsBefore = await s.repos.foods.getAll()
    const log = await logOffPlan(s, { date: DAY, slot: 'lunch', protein_g: null, note: 'tacos' }, ISO(DAY, '15:00'))
    expect(log.status).toBe('off_plan')
    expect(log.off_plan_protein_g).toBeNull()
    expect(log.est_complete).toBe(false)
    const again = await logOffPlan(s, { date: DAY, slot: 'lunch', protein_g: 35 }, ISO(DAY, '15:10'))
    expect(again.id).toBe(log.id) // upsert por [date+slot]
    expect(again.off_plan_protein_g).toBe(35)
    expect(await s.repos.meal_logs.count()).toBe(1)
    expect(await s.repos.foods.getAll()).toEqual(foodsBefore)
    expect(await s.repos.inventory_items.count()).toBe(0)
    s.close()
  })
  it('slot preseleccionado según hora y horario', () => {
    const schedule = { wake: '06:00', breakfast: '06:30', row: '06:45', work: '09:00', lunch: '14:00', snack: '17:00', gym: '18:15', dinner: '19:45', lights: '22:45' }
    expect(slotForTime('07:00', schedule)).toBe('breakfast')
    expect(slotForTime('14:30', schedule)).toBe('lunch')
    expect(slotForTime('17:00', schedule)).toBe('snack')
    expect(slotForTime('20:00', schedule)).toBe('dinner')
  })
})

describe('estado de AHORA', () => {
  it('día antes del inicio: not_started, acción check_in sin check-in, y rotation_cursor intacto', async () => {
    const s = await fresh('now_state_1')
    const st = await loadNowState(s, T('2026-10-05'))
    expect(st.today_state.kind).toBe('not_started')
    expect(st.today_state.template?.name).toBe('Pierna A')
    expect(st.action).toBe('check_in')
    expect(st.yesterday.adherence).toBe('unknown')
    expect(st.yesterday.protein.status).toBe('no_data')
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    s.close()
  })
  it('6 oct con check-in completo → start_session Pierna A 1/4; food_yesterday no toca la proteína real', async () => {
    const s = await fresh('now_state_2')
    await saveCheckIn(s, DAY, { weight_kg: 120, food_yesterday: 'plan' }, ISO(DAY))
    const st = await loadNowState(s, T(DAY))
    expect(st.action).toBe('start_session')
    expect(st.today_state.kind).toBe('suggested')
    expect(st.today_state.rotation_position).toEqual({ index: 1, length: 4 })
    expect(st.yesterday.adherence).toBe('high')
    expect(st.yesterday.protein.status).toBe('no_data') // sin MealLog de ayer: no se deduce de la adherencia
    expect(st.yesterday.protein_complete).toBeNull()
    s.close()
  })
  it('check-in sin food_yesterday → register_yesterday antes que start_session', async () => {
    const s = await fresh('now_state_3')
    await saveCheckIn(s, DAY, { weight_kg: 120 }, ISO(DAY))
    expect((await loadNowState(s, T(DAY))).action).toBe('register_yesterday')
    s.close()
  })
  it('proteína real de ayer viene de los MealLog; adherencia baja + proteína completa conviven', async () => {
    const s = await fresh('now_state_4')
    await saveCheckIn(s, DAY, { food_yesterday: 'off' }, ISO(DAY))
    await logOffPlan(s, { date: '2026-10-05', slot: 'lunch', protein_g: 100 }, ISO('2026-10-05', '15:00'))
    await logOffPlan(s, { date: '2026-10-05', slot: 'dinner', protein_g: 70 }, ISO('2026-10-05', '20:00'))
    const st = await loadNowState(s, T(DAY))
    expect(st.yesterday.adherence).toBe('low')
    expect(st.yesterday.protein_complete).toBe(true)
    expect(st.yesterday.estimated_protein_g).toBe(170)
    s.close()
  })
  it('usa getToday del dominio (mismo resultado) y no lo duplica', async () => {
    const s = await fresh('now_state_5')
    const st = await loadNowState(s, T('2026-10-07'))
    const program = (await s.repos.programs.get(SEED_IDS.program))!
    const direct = getToday({ today: '2026-10-07', effective_from: '2026-10-06', program, templates: await s.repos.workout_templates.getLive(), sessions: [] })
    expect(st.today_state).toEqual(direct)
    s.close()
  })
})

describe('iniciar sesión (integración mínima para 8.6)', () => {
  it('crea una sesión abierta con la versión elegida; no mueve el cursor; AHORA pasa a continue_session', async () => {
    const s = await fresh('now_start')
    await saveCheckIn(s, DAY, { sleep_bucket: '<6', food_yesterday: 'plan' }, ISO(DAY))
    const st = await loadNowState(s, T(DAY, '18:10'))
    const tpl = st.today_state.template!
    const sugg = suggestVersion({ template: tpl, sleep_bucket: '<6' })
    expect(sugg.version).toBe('short')
    const ws = await startSession(s, { template: tpl, date: DAY, suggestion: sugg, userChoice: 'full' }, ISO(DAY, '18:15'))
    expect(ws.status).toBe('open')
    expect(ws.version).toBe('full') // el usuario rechazó la sugerencia
    expect(ws.sleep_short_suggested).toBe(true)
    expect((await s.repos.programs.get(SEED_IDS.program))!.rotation_cursor).toBe(0)
    const st2 = await loadNowState(s, T(DAY, '18:20'))
    expect(st2.action).toBe('continue_session')
    expect(st2.open_session?.id).toBe(ws.id)
    expect((await getOpenSession(s))?.id).toBe(ws.id)
    await expect(startSession(s, { template: tpl, date: DAY, suggestion: sugg, userChoice: null }, ISO(DAY, '18:30'))).rejects.toMatchObject({ code: 'conflict' })
    expect(await s.repos.workout_sessions.count()).toBe(1)
    s.close()
  })
})

describe('no tengo tiempo', () => {
  it('orienta sin elegir ejercicios y registra un evento no_time; nunca toca el programa', async () => {
    const s = await fresh('now_time')
    const before = (await s.repos.programs.get(SEED_IDS.program))!
    const p15 = await recordNoTime(s, 15, true, ISO(DAY))
    expect(p15).toEqual({ minutes: 15, action: 'session_minimal', session_version: 'minimal', time_mode: 'minimal' })
    const p5 = await recordNoTime(s, 5, true, ISO(DAY, '06:31'))
    expect(p5.action).toBe('walk_or_prep')
    expect(await s.repos.app_events.whereEquals('type', 'no_time')).toHaveLength(2)
    expect((await s.repos.programs.get(SEED_IDS.program))!).toEqual(before)
    s.close()
  })
  it('tabla pura: 5 → caminar/preparar; 15 → mínima; 30 → corta; 60 → completa; sin sesión hoy → caminar/preparar', () => {
    expect(planForTimeBudget(5, true).action).toBe('walk_or_prep')
    expect(planForTimeBudget(15, true).session_version).toBe('minimal')
    expect(planForTimeBudget(30, true).session_version).toBe('short')
    expect(planForTimeBudget(60, true).session_version).toBe('full')
    expect(planForTimeBudget(60, false).action).toBe('walk_or_prep')
  })
})

describe('decideNowAction (puro)', () => {
  const today = (kind: TodayState['kind']): TodayState => ({
    kind, today: DAY, template: null, template_id: null, rotation_cursor: 0, rotation_position: null, is_suggested_weekday: true,
    open_session: null, last_completed: null, days_since_last_completed: null, long_absence: false, abandoned_today: 0, template_missing: false,
  })
  const ci = (food?: DailyCheckIn['food_yesterday']): DailyCheckIn => ({ id: 'x', created_at: '', updated_at: '', source: 'user', date: DAY, irregular: false, ...(food ? { food_yesterday: food } : {}) })
  it.each([
    [null, 'suggested', 'check_in'],
    [ci('plan'), 'session_open', 'continue_session'],
    [ci(), 'session_open', 'continue_session'],
    [ci(), 'suggested', 'register_yesterday'],
    [ci('off'), 'suggested', 'start_session'],
    [ci('almost'), 'done_today', 'rest'],
    [ci('plan'), 'not_started', 'prepare'],
    [ci('plan'), 'no_program', 'none'],
  ] as const)('check-in %o + %s → %s', (c, kind, expected) => {
    expect(decideNowAction(c, today(kind))).toBe(expected)
  })
})
