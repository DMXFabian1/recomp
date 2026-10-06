import { describe, expect, it } from 'vitest'
import type { Program, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { getToday, ABSENCE_DAYS } from './getToday'

const T0 = '2026-10-01T00:00:00.000Z'
const base = { created_at: T0, updated_at: T0, source: 'system' as const }
const tpl = (id: string, name: string, order: number): WorkoutTemplate => ({
  ...base, id, name, order_in_rotation: order,
  exercises: [{ exercise_id: 'ex_squat', order: 0, sets: 3, reps_min: 6, reps_max: 10, target_rir: 2, rest_s: 150, in_short: true, in_minimal: true }],
})
const TEMPLATES = [tpl('tpl_leg_a', 'Pierna A', 0), tpl('tpl_upper_a', 'Torso A', 1), tpl('tpl_leg_b', 'Pierna B', 2), tpl('tpl_upper_b', 'Torso B', 3)]
const program = (cursor = 0, extra: Partial<Program> = {}): Program => ({
  ...base, id: 'program', name: 'Recomp', rotation: TEMPLATES.map(t => t.id), rotation_cursor: cursor,
  suggested_weekdays: [1, 2, 4, 5], deload_windows: [], active: true, ...extra,
})
const session = (id: string, date: string, status: WorkoutSession['status'], template_id = 'tpl_leg_a'): WorkoutSession => ({
  ...base, id, template_id, date, started_at: `${date}T18:15:00.000Z`, status, version: 'full', sleep_short_suggested: false,
  ...(status !== 'open' ? { finished_at: `${date}T19:30:00.000Z` } : {}),
})
const EFFECTIVE = '2026-10-06'
const run = (today: string, cursor = 0, sessions: WorkoutSession[] = [], p: Program | null = program(cursor)) =>
  getToday({ today, effective_from: EFFECTIVE, program: p, templates: TEMPLATES, sessions })

describe('getToday', () => {
  it('programa inexistente → no_program, sin plantilla', () => {
    const s = run('2026-10-06', 0, [], null)
    expect(s.kind).toBe('no_program')
    expect(s.template).toBeNull()
    expect(s.rotation_position).toBeNull()
  })

  it('programa inactivo → no_program', () => {
    expect(run('2026-10-06', 0, [], program(0, { active: false })).kind).toBe('no_program')
  })

  it('programa no iniciado (hoy < effective_from): not_started, pero ya señala Pierna A', () => {
    const s = run('2026-10-05')
    expect(s.kind).toBe('not_started')
    expect(s.template?.name).toBe('Pierna A')
    expect(s.rotation_cursor).toBe(0)
  })

  it('primer día (6 oct 2026, martes): Pierna A sugerida, día sugerido', () => {
    const s = run('2026-10-06')
    expect(s.kind).toBe('suggested')
    expect(s.template?.name).toBe('Pierna A')
    expect(s.rotation_position).toEqual({ index: 1, length: 4 })
    expect(s.is_suggested_weekday).toBe(true)
    expect(s.days_since_last_completed).toBeNull()
    expect(s.long_absence).toBe(false)
  })

  it.each([
    [0, 'Pierna A'], [1, 'Torso A'], [2, 'Pierna B'], [3, 'Torso B'],
  ])('cursor %i → %s', (cursor, name) => {
    expect(run('2026-10-07', cursor).template?.name).toBe(name)
  })

  it('cursor 4 vuelve a Pierna A (módulo) sin corregir el valor del programa', () => {
    const s = run('2026-10-13', 4)
    expect(s.template?.name).toBe('Pierna A')
    expect(s.rotation_cursor).toBe(4)
    expect(s.rotation_position).toEqual({ index: 1, length: 4 })
  })

  it('no modifica rotation_cursor ni el programa de entrada', () => {
    const p = program(2)
    const frozen = structuredClone(p)
    run('2026-10-08', 2, [session('s1', '2026-10-06', 'completed')], p)
    expect(p).toEqual(frozen)
    expect(p.rotation_cursor).toBe(2)
  })

  it('fecha distinta no cambia la plantilla: el cursor manda, no el calendario', () => {
    expect(run('2026-10-06', 1).template?.name).toBe('Torso A')
    expect(run('2026-10-20', 1).template?.name).toBe('Torso A')
    expect(run('2026-10-11', 1).is_suggested_weekday).toBe(false) // domingo
  })

  it('sesión previa completada: la plantilla sigue siendo la del cursor (el avance lo hace 8.4)', () => {
    const s = run('2026-10-07', 1, [session('s1', '2026-10-06', 'completed', 'tpl_leg_a')])
    expect(s.kind).toBe('suggested')
    expect(s.template?.name).toBe('Torso A')
    expect(s.last_completed?.id).toBe('s1')
    expect(s.days_since_last_completed).toBe(1)
  })

  it('sesión previa no completada (abandonada): cursor sin avanzar, se vuelve a ofrecer la misma', () => {
    const s = run('2026-10-07', 0, [session('s1', '2026-10-06', 'abandoned')])
    expect(s.kind).toBe('suggested')
    expect(s.template?.name).toBe('Pierna A')
    expect(s.last_completed).toBeNull()
    expect(s.abandoned_today).toBe(0)
  })

  it('sesión abierta (aunque sea de otro día) → session_open', () => {
    const s = run('2026-10-07', 0, [session('s1', '2026-10-06', 'open')])
    expect(s.kind).toBe('session_open')
    expect(s.open_session?.id).toBe('s1')
  })

  it('hoy ya completada → done_today', () => {
    const s = run('2026-10-06', 1, [session('s1', '2026-10-06', 'completed')])
    expect(s.kind).toBe('done_today')
    expect(s.days_since_last_completed).toBe(0)
  })

  it('ausencia: ≥ ABSENCE_DAYS sin completar marca long_absence; sin historial nunca', () => {
    const s = run('2026-10-20', 1, [session('s1', '2026-10-06', 'completed')])
    expect(s.days_since_last_completed).toBe(14)
    expect(s.long_absence).toBe(true)
    expect(ABSENCE_DAYS).toBe(7)
    expect(run('2026-10-20', 0).long_absence).toBe(false)
    expect(run('2026-10-06', 0).kind).toBe('suggested') // no se crean sesiones perdidas
  })

  it('no cuenta sesiones borradas ni futuras', () => {
    const del = { ...session('s1', '2026-10-06', 'completed'), deleted_at: T0 }
    const future = session('s2', '2026-10-30', 'completed')
    const s = run('2026-10-07', 0, [del, future])
    expect(s.last_completed).toBeNull()
    expect(s.kind).toBe('suggested')
  })

  it('plantilla del cursor inexistente → template_missing, sin lanzar', () => {
    const s = run('2026-10-06', 0, [], program(0, { rotation: ['tpl_nope'] }))
    expect(s.template).toBeNull()
    expect(s.template_missing).toBe(true)
    expect(s.template_id).toBe('tpl_nope')
  })
})
