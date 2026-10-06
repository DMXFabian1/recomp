import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseSubstitutionGroup, SubstitutionMember } from '@domain/entities'
import { orderedSubstitutes } from '@domain/catalog/equipment'
import { decideProgression } from '@domain/progression/decide'
import { recordSubstitution, substituteOptions } from './substitute'
import { createExerciseFixture, createProgressionFixture, createSessionFixture, createTemplateExerciseFixture, createTemplateFixture } from '@test/fixtures/training'

const T0 = '2001-01-01T00:00:00.000Z'
const base = { created_at: T0, updated_at: T0, source: 'system' as const }
const ex = (id: string, over: Partial<Exercise> = {}) => createExerciseFixture({ id, name: `TEST ${id}`, is_basic: false, ...over })
const m = (exercise_id: string, quality: SubstitutionMember['quality'], equipment: SubstitutionMember['equipment'], complexity: 1 | 2 | 3, unilateral = false, functional_rating?: number): SubstitutionMember & { functional_rating?: number } =>
  ({ exercise_id, quality, reason: 'test', equipment, complexity, stability: 1, unilateral, ...(functional_rating ? { functional_rating } : {}) })

const EXERCISES = [
  ex('test_orig', { unilateral: false, functional_rating: 1 }),
  ex('test_high_bb', { functional_rating: 1 }), ex('test_high_db', { functional_rating: 5 }), ex('test_med_kb'), ex('test_low_bw'),
  ex('test_high_uni', { unilateral: true }), ex('test_high_cx3'),
]
const GROUP: ExerciseSubstitutionGroup = {
  ...base, id: 'test_group', name: 'TEST grupo', movement_patterns: ['squat'], primary_muscles: ['quadriceps'], source_confidence: 'manual',
  members: [
    m('test_orig', 'high', ['olympic_barbell', 'rack'], 2),
    m('test_low_bw', 'low', ['bodyweight'], 1),
    m('test_high_db', 'high', ['dumbbells'], 2, false, 5),
    m('test_med_kb', 'medium', ['kettlebell'], 1),
    m('test_high_bb', 'high', ['olympic_barbell'], 2, false, 1),
    m('test_high_uni', 'high', ['dumbbells'], 2, true),
    m('test_high_cx3', 'high', ['dumbbells'], 3),
  ],
}
const GYM = { name: 'gym', items: ['olympic_barbell', 'rack', 'dumbbells', 'kettlebell'] as const }
const HOME = { name: 'home', items: ['olympic_barbell', 'kettlebell'] as const }
const opts = (profile: { name: string; items: readonly string[] }) =>
  substituteOptions({ exercise: EXERCISES[0]!, groups: [GROUP], profile: { name: profile.name, items: [...profile.items] as never }, exercises: EXERCISES })

describe('substituteOptions', () => {
  it('solo devuelve compatibles; los incompatibles quedan excluidos', () => {
    const ids = opts(HOME).map(o => o.exercise.id)
    expect(ids).toEqual(['test_high_bb', 'test_med_kb', 'test_low_bw'])
    expect(ids).not.toContain('test_high_db')
    expect(opts(HOME).every(o => o.compatible)).toBe(true)
  })
  it('orden: quality → compatible → lateralidad → menor cambio de complejidad; empate por id', () => {
    const ids = opts(GYM).map(o => o.exercise.id)
    // high: mismos lat (no unilateral) y complejidad 2 = orig → bb y db (empate → id); luego cx3 (Δ1); luego el unilateral; medium; low
    expect(ids).toEqual(['test_high_bb', 'test_high_db', 'test_high_cx3', 'test_high_uni', 'test_med_kb', 'test_low_bw'])
  })
  it('functional_rating nunca participa: invertirlo no cambia el orden', () => {
    const swapped = EXERCISES.map(e => (e.id === 'test_high_bb' ? { ...e, functional_rating: 5 as const } : e.id === 'test_high_db' ? { ...e, functional_rating: 1 as const } : e))
    const a = substituteOptions({ exercise: EXERCISES[0]!, groups: [GROUP], profile: { name: 'g', items: [...GYM.items] }, exercises: EXERCISES }).map(o => o.exercise.id)
    const b = substituteOptions({ exercise: EXERCISES[0]!, groups: [GROUP], profile: { name: 'g', items: [...GYM.items] }, exercises: swapped }).map(o => o.exercise.id)
    expect(a).toEqual(b)
    const src = JSON.stringify(orderedSubstitutes.toString())
    expect(src.includes('functional_rating')).toBe(false)
  })
  it('ejercicio sin grupo → sin opciones; nunca se elige automáticamente', () => {
    expect(substituteOptions({ exercise: ex('test_alone'), groups: [GROUP], profile: { name: 'g', items: [...GYM.items] }, exercises: EXERCISES })).toEqual([])
  })
})

describe('recordSubstitution', () => {
  it('registra en la sesión y no modifica plantilla, programa ni cursor', () => {
    const tpl = createTemplateFixture('test_tpl_leg_a', 'Pierna A', 0)
    const frozenTpl = structuredClone(tpl)
    const session = createSessionFixture({ template_id: tpl.id })
    const r = recordSubstitution(session, { original_exercise_id: 'test_ex_1', substitute_exercise_id: 'test_high_db', reason: 'equipment' }, T0)
    expect(r.substitutions).toEqual([{ original_exercise_id: 'test_ex_1', substitute_exercise_id: 'test_high_db', reason: 'equipment' }])
    expect(session.substitutions).toBeUndefined() // copia, no mutación
    expect(tpl).toEqual(frozenTpl)
    expect(r.template_id).toBe(tpl.id)
    // volver a sustituir el mismo original reemplaza, no duplica
    const r2 = recordSubstitution(r, { original_exercise_id: 'test_ex_1', substitute_exercise_id: 'test_med_kb' }, T0)
    expect(r2.substitutions).toHaveLength(1)
    expect(r2.substitutions![0]!.substitute_exercise_id).toBe('test_med_kb')
    expect(recordSubstitution(session, { original_exercise_id: 'a', substitute_exercise_id: 'a' }, T0)).toBe(session)
  })
  it('una sustitución registrada bloquea la progresión de ese ejercicio en esa sesión (original y sustituto)', () => {
    const subs = [{ original_exercise_id: 'test_orig', substitute_exercise_id: 'test_high_db' }]
    const forOriginal = decideProgression({ exercise: EXERCISES[0]!, template_exercise: createTemplateExerciseFixture(), increment_kg: 2.5,
      history: createProgressionFixture('test_orig', [{ sets: [], session: { substitutions: subs } }]) })
    expect(forOriginal.blocked_by).toEqual(['substituted'])
    expect(forOriginal.action).toBe('hold')
    const forSub = decideProgression({ exercise: EXERCISES[2]!, template_exercise: createTemplateExerciseFixture(), increment_kg: 2.5,
      history: createProgressionFixture('test_high_db', [{ sets: [{ w: 20, reps: 10 }, { w: 20, reps: 10 }, { w: 20, reps: 10 }], session: { substitutions: subs } }]) })
    expect(forSub.blocked_by).toEqual(['substituted'])
    expect(forSub.action).toBe('hold')
  })
})
