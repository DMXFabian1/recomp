import { beforeEach, describe, expect, it } from 'vitest'
import { getToday } from '@domain/rotation/getToday'
import { abandonSession, cancelSession, completeSession } from './completeSession'
import { exercisesForVersion, resolveSessionVersion, suggestSessionVersion } from './sessionVersion'
import { createProgramFixture, createSessionFixture, createTemplateFixture, resetFixtureSequence, TEST_ROTATION } from '@test/fixtures/training'

const AT = '2001-03-01T19:00:00.000Z'
const TEMPLATES = [
  createTemplateFixture('test_tpl_leg_a', 'Pierna A', 0), createTemplateFixture('test_tpl_upper_a', 'Torso A', 1),
  createTemplateFixture('test_tpl_leg_b', 'Pierna B', 2), createTemplateFixture('test_tpl_upper_b', 'Torso B', 3),
]
beforeEach(resetFixtureSequence)

describe('completeSession: único avance del cursor', () => {
  it.each([
    [0, 'test_tpl_leg_a', 1, 'Torso A'], [1, 'test_tpl_upper_a', 2, 'Pierna B'], [2, 'test_tpl_leg_b', 3, 'Torso B'], [3, 'test_tpl_upper_b', 0, 'Pierna A'],
  ])('cursor %i (%s) → completar → cursor %i (%s)', (cursor, templateId, next, nextName) => {
    const program = createProgramFixture(cursor)
    const session = createSessionFixture({ template_id: templateId, date: '2001-03-01' })
    const r = completeSession({ program, session, finished_at: AT, today: '2001-03-01' })
    expect(r.advanced).toBe(true)
    expect(r.next_rotation_cursor).toBe(next)
    expect(r.program.rotation_cursor).toBe(next)
    expect(r.session.status).toBe('completed')
    expect(r.session.finished_at).toBe(AT)
    // getToday ya ofrece la siguiente
    expect(getToday({ today: '2001-03-02', effective_from: '2001-01-01', program: r.program, templates: TEMPLATES, sessions: [r.session] }).template?.name).toBe(nextName)
  })

  it('no muta program ni session de entrada', () => {
    const program = createProgramFixture(0)
    const session = createSessionFixture({ template_id: 'test_tpl_leg_a' })
    const fp = structuredClone(program), fs = structuredClone(session)
    completeSession({ program, session, finished_at: AT, today: '2001-03-01' })
    expect(program).toEqual(fp)
    expect(session).toEqual(fs)
  })

  it('doble finalización (reintento / doble toque) avanza una sola vez', () => {
    const program = createProgramFixture(0)
    const session = createSessionFixture({ template_id: 'test_tpl_leg_a' })
    const r1 = completeSession({ program, session, finished_at: AT, today: '2001-03-01' })
    const r2 = completeSession({ program: r1.program, session: r1.session, finished_at: AT, today: '2001-03-01' })
    expect(r2.advanced).toBe(false)
    expect(r2.reason).toBe('already_completed')
    expect(r2.program.rotation_cursor).toBe(1)
    expect(r2.program).toBe(r1.program)
  })

  it('abandono → cursor intacto; la sesión queda abandoned', () => {
    const program = createProgramFixture(2)
    const session = createSessionFixture({ template_id: 'test_tpl_leg_b' })
    const r = abandonSession(program, session, AT)
    expect(r.program).toBe(program)
    expect(r.program.rotation_cursor).toBe(2)
    expect(r.session.status).toBe('abandoned')
    // completar una abandonada no avanza
    expect(completeSession({ program, session: r.session, finished_at: AT, today: '2001-03-01' }).reason).toBe('not_open')
  })

  it('cancelación → cursor intacto; la sesión se marca borrada', () => {
    const program = createProgramFixture(2)
    const r = cancelSession(program, createSessionFixture({ template_id: 'test_tpl_leg_b' }), AT)
    expect(r.program.rotation_cursor).toBe(2)
    expect(r.session.deleted_at).toBe(AT)
  })

  it('short/minimal completadas como la sesión que tocaba avanzan igual; no hay sesión extra', () => {
    for (const version of ['short', 'minimal'] as const) {
      const r = completeSession({ program: createProgramFixture(0), session: createSessionFixture({ template_id: 'test_tpl_leg_a', version }), finished_at: AT, today: '2001-03-01' })
      expect(r.advanced).toBe(true)
      expect(r.next_rotation_cursor).toBe(1)
      expect(r.session.version).toBe(version)
    }
  })

  it('otra plantilla VÁLIDA de la rotación (fuera de orden): cursor = la siguiente a la completada; la que tocaba se pierde', () => {
    // tocaba Pierna A (0); hizo Torso A (1) → cursor 2 (Pierna B); Pierna A perdida
    const r = completeSession({ program: createProgramFixture(0), session: createSessionFixture({ template_id: 'test_tpl_upper_a' }), finished_at: AT, today: '2001-03-01' })
    expect(r.advanced).toBe(true)
    expect(r.reason).toBe('advanced_out_of_order')
    expect(r.next_rotation_cursor).toBe(2)
    expect(r.skipped_template_id).toBe('test_tpl_leg_a')
    expect(r.session.status).toBe('completed')
    expect(getToday({ today: '2001-03-02', effective_from: '2001-01-01', program: r.program, templates: TEMPLATES, sessions: [r.session] }).template?.name).toBe('Pierna B')
    // tocaba Torso B (3); hizo Pierna A (0) → cursor 1 (Torso A), con wrap
    const r2 = completeSession({ program: createProgramFixture(3), session: createSessionFixture({ template_id: 'test_tpl_leg_a' }), finished_at: AT, today: '2001-03-01' })
    expect(r2.next_rotation_cursor).toBe(1)
    expect(r2.skipped_template_id).toBe('test_tpl_upper_b')
    // la perdida no se recupera: no aparece ninguna sesión nueva, solo la cerrada
    expect(Object.keys(r).sort()).toEqual(['advanced', 'next_rotation_cursor', 'previous_rotation_cursor', 'program', 'reason', 'session', 'skipped_template_id'])
  })

  it('fuera de orden es idempotente: completar dos veces no vuelve a mover el cursor', () => {
    const r1 = completeSession({ program: createProgramFixture(0), session: createSessionFixture({ template_id: 'test_tpl_leg_b' }), finished_at: AT, today: '2001-03-01' })
    const r2 = completeSession({ program: r1.program, session: r1.session, finished_at: AT, today: '2001-03-01' })
    expect(r1.next_rotation_cursor).toBe(3)
    expect(r2.reason).toBe('already_completed')
    expect(r2.program.rotation_cursor).toBe(3)
  })

  it('plantilla que NO pertenece a la rotación (inconsistencia): la sesión se cierra pero el cursor no se mueve', () => {
    const r = completeSession({ program: createProgramFixture(0), session: createSessionFixture({ template_id: 'test_tpl_desconocida' }), finished_at: AT, today: '2001-03-01' })
    expect(r.advanced).toBe(false)
    expect(r.reason).toBe('template_mismatch')
    expect(r.program.rotation_cursor).toBe(0)
    expect(r.session.status).toBe('completed')
    expect(r.skipped_template_id).toBeUndefined()
  })

  it('sesión perdida: sin entrenar no hay sesión, el cursor no cambia y la siguiente sigue desde el cursor', () => {
    const program = createProgramFixture(1)
    const s1 = getToday({ today: '2001-03-01', effective_from: '2001-01-01', program, templates: TEMPLATES, sessions: [] })
    const s2 = getToday({ today: '2001-03-15', effective_from: '2001-01-01', program, templates: TEMPLATES, sessions: [] })
    expect(s1.template?.name).toBe('Torso A')
    expect(s2.template?.name).toBe('Torso A')
    expect(program.rotation_cursor).toBe(1)
  })

  it('no crea sesiones retroactivas: completar solo transforma la sesión que recibe', () => {
    const r = completeSession({ program: createProgramFixture(0), session: createSessionFixture({ template_id: 'test_tpl_leg_a', date: '2001-03-01' }), finished_at: AT, today: '2001-03-05' })
    expect(r.session.date).toBe('2001-03-01')
    expect(Object.keys(r).sort()).toEqual(['advanced', 'next_rotation_cursor', 'previous_rotation_cursor', 'program', 'reason', 'session'])
  })

  it('rotación vacía: no avanza', () => {
    const r = completeSession({ program: createProgramFixture(0, { rotation: [] }), session: createSessionFixture(), finished_at: AT, today: '2001-03-01' })
    expect(r.advanced).toBe(false)
  })
  expect(TEST_ROTATION).toHaveLength(4)
})

describe('versión corta / mínima: recomendar ≠ aplicar', () => {
  const tpl = TEMPLATES[0]!
  it.each([
    [5, 'short', 'sleep_short'], [5.98, 'short', 'sleep_short'], [6, 'full', 'none'], [7, 'full', 'none'],
  ])('sueño %s h → %s (%s)', (h, version, reason) => {
    const s = suggestSessionVersion({ template: tpl, sleep_hours: h })
    expect(s.version).toBe(version)
    expect(s.reason).toBe(reason)
    expect(s.sleep_short_suggested).toBe(h < 6)
  })
  it("bucket '<6' sugiere corta; otros buckets no", () => {
    expect(suggestSessionVersion({ template: tpl, sleep_bucket: '<6' }).version).toBe('short')
    expect(suggestSessionVersion({ template: tpl, sleep_bucket: '6-7' }).version).toBe('full')
  })
  it('time_mode short → corta; minimal → mínima (manda sobre el sueño)', () => {
    expect(suggestSessionVersion({ template: tpl, time_mode: 'short', sleep_hours: 8 }).version).toBe('short')
    const m = suggestSessionVersion({ template: tpl, time_mode: 'minimal', sleep_hours: 5 })
    expect(m.version).toBe('minimal')
    expect(m.reason).toBe('time_mode_minimal')
    expect(m.exercises.map(e => e.exercise_id)).toEqual(['test_ex_1', 'test_ex_2'])
  })
  it('la sugerencia filtra ejercicios por in_short / in_minimal sin tocar la plantilla', () => {
    const frozen = structuredClone(tpl)
    expect(exercisesForVersion(tpl, 'full')).toHaveLength(4)
    expect(exercisesForVersion(tpl, 'short')).toHaveLength(3)
    expect(exercisesForVersion(tpl, 'minimal')).toHaveLength(2)
    expect(tpl).toEqual(frozen)
  })
  it('el usuario puede rechazar: elige full con sueño corto; la sugerencia queda registrada como dato', () => {
    const s = suggestSessionVersion({ template: tpl, sleep_hours: 5 })
    const r = resolveSessionVersion(s, 'full')
    expect(r.version).toBe('full')
    expect(r.exercises).toHaveLength(4)
    expect(r.sleep_short_suggested).toBe(true)
    expect(resolveSessionVersion(s, null).version).toBe('short')
  })
  it('la sugerencia no modifica el programa', () => {
    const program = createProgramFixture(0)
    const frozen = structuredClone(program)
    suggestSessionVersion({ template: tpl, sleep_hours: 4 })
    expect(program).toEqual(frozen)
  })
})
