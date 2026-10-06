import { beforeEach, describe, expect, it } from 'vitest'
import { decideProgression } from './decide'
import { evaluateSession } from './evaluate'
import { roundDeload, roundToIncrement } from './rounding'
import { buildStallAlert } from './stall'
import type { ProgressionInput } from './types'
import {
  createCompletedSessionFixture, createExerciseFixture, createProgressionFixture, createSetsFixture,
  createSessionFixture, createTemplateExerciseFixture, resetFixtureSequence, type SetSpec,
} from '@test/fixtures/training'

const EX = 'test_ex_basic'
const MAX3 = (w: number): SetSpec[] => [{ w, reps: 10, rir: 2 }, { w, reps: 10, rir: 2 }, { w, reps: 10, rir: 2 }]
const MID3 = (w: number): SetSpec[] => [{ w, reps: 8, rir: 2 }, { w, reps: 8, rir: 2 }, { w, reps: 7, rir: 2 }]
const LOW3 = (w: number): SetSpec[] => [{ w, reps: 6, rir: 1 }, { w, reps: 5, rir: 1 }, { w, reps: 4, rir: 0 }]

function input(history: ProgressionInput['history'], over: Partial<ProgressionInput> = {}): ProgressionInput {
  return { exercise: createExerciseFixture({ is_basic: false }), template_exercise: createTemplateExerciseFixture(), history, increment_kg: 2.5, ...over }
}
const basic = createExerciseFixture({ is_basic: true })

beforeEach(resetFixtureSequence)

describe('doble progresión', () => {
  it('todas las series a reps_max con RIR suficiente → subir current + increment', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: MAX3(60) }])))
    expect(d.action).toBe('increase')
    expect(d.suggested_weight_kg).toBe(62.5)
    expect(d.current_weight_kg).toBe(60)
    expect(d.progression_blocked).toBe(false)
  })
  it('una serie bajo reps_max → mantener', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10 }, { w: 60, reps: 10 }, { w: 60, reps: 9 }] }])))
    expect(d.action).toBe('hold')
    expect(d.suggested_weight_kg).toBe(60)
  })
  it('RIR insuficiente en una serie → mantener', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10, rir: 2 }, { w: 60, reps: 10, rir: 1 }, { w: 60, reps: 10, rir: 2 }] }])))
    expect(d.action).toBe('hold')
  })
  it('sin historial → hold con no_history y sin carga sugerida', () => {
    const d = decideProgression(input([]))
    expect(d.action).toBe('hold')
    expect(d.blocked_by).toEqual(['no_history'])
    expect(d.suggested_weight_kg).toBeNull()
  })
  it('es determinista: mismos inputs → misma decisión', () => {
    const h = createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MAX3(60) }])
    expect(decideProgression(input(h))).toEqual(decideProgression(input(h)))
  })
  it('no modifica el historial de entrada', () => {
    const h = createProgressionFixture(EX, [{ sets: LOW3(60) }, { sets: LOW3(60) }])
    const frozen = structuredClone(h)
    decideProgression(input(h))
    expect(h).toEqual(frozen)
  })
})

describe('RIR', () => {
  it('basic + RIR 0 → bloqueado, aunque haya alcanzado el máximo', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10, rir: 0 }, { w: 60, reps: 10, rir: 2 }, { w: 60, reps: 10, rir: 2 }] }]), { exercise: basic }))
    expect(d.action).toBe('hold')
    expect(d.blocked_by).toEqual(['rir_zero_on_basic'])
    expect(d.progression_blocked).toBe(true)
    expect(d.suggested_weight_kg).toBe(60)
  })
  it('basic + RIR 1/2/3 → evaluado normalmente', () => {
    for (const rir of [1, 2, 3] as const) {
      const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10, rir }, { w: 60, reps: 10, rir }, { w: 60, reps: 10, rir }] }]), { exercise: basic }))
      expect(d.progression_blocked).toBe(false)
      expect(d.action).toBe(rir >= 2 ? 'increase' : 'hold')
    }
  })
  it('non-basic + RIR 0 → sin bloqueo por esta regla (se evalúa: RIR 0 < target → mantener)', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10, rir: 0 }, { w: 60, reps: 10, rir: 2 }, { w: 60, reps: 10, rir: 2 }] }])))
    expect(d.blocked_by).toEqual([])
    expect(d.action).toBe('hold')
  })
  it('non-basic + RIR 0 con target_rir 0 → puede subir', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 10, rir: 0 }, { w: 60, reps: 10, rir: 0 }, { w: 60, reps: 10, rir: 0 }], targets: { reps_min: 6, reps_max: 10, target_rir: 0 } }])))
    expect(d.action).toBe('increase')
  })
})

describe('dolor, técnica, short, minimal, sustitución → bloqueo', () => {
  it.each([
    ['pain', { sets: [{ w: 60, reps: 10, pain: true }, { w: 60, reps: 10 }, { w: 60, reps: 10 }] }],
    ['technique', { sets: [{ w: 60, reps: 10 }, { w: 60, reps: 10, technique: true }, { w: 60, reps: 10 }] }],
    ['short_session', { sets: MAX3(60), session: { version: 'short' as const } }],
    ['minimal_session', { sets: MAX3(60), session: { version: 'minimal' as const } }],
    ['substituted', { sets: MAX3(60), session: { substitutions: [{ original_exercise_id: EX, substitute_exercise_id: 'test_ex_other' }] } }],
  ])('%s → hold bloqueado, sin subir aunque las series sean máximas', (reason, spec) => {
    const d = decideProgression(input(createProgressionFixture(EX, [spec as never])))
    expect(d.action).toBe('hold')
    expect(d.blocked_by).toContain(reason)
    expect(d.progression_blocked).toBe(true)
    expect(d.suggested_weight_kg).toBe(60)
  })
  it('bloqueo no cambia ejercicio/rango/volumen: la decisión solo trae carga y flags', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: [{ w: 60, reps: 3, pain: true }, { w: 60, reps: 3 }, { w: 60, reps: 3 }] }])))
    expect(Object.keys(d).sort()).toEqual(['action', 'blocked_by', 'current_weight_kg', 'evaluations', 'exercise_id', 'progression_blocked', 'rationale', 'sessions_under_floor', 'sessions_without_progress', 'stalled', 'suggested_weight_kg'])
    expect(d.action).not.toBe('decrease_10pct')
  })
  it('short/minimal: registro de ejecución (evaluada, con carga) pero nunca evidencia de progreso ni de bajo piso', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60), session: { version: 'short' } }, { sets: LOW3(60), session: { version: 'minimal' } }])))
    expect(d.sessions_under_floor).toBe(0)
    expect(d.action).toBe('hold')
    expect(d.evaluations.every(e => e.outcome === 'blocked' && e.load_kg === 60)).toBe(true)
  })
})

describe('bajo el piso ≠ bloqueo (−10 %)', () => {
  it('1 sesión bajo piso → no descarga', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60) }])))
    expect(d.action).toBe('hold')
    expect(d.sessions_under_floor).toBe(1)
  })
  it('2 consecutivas bajo piso a la misma carga → −10 % redondeado al incremento', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60) }, { sets: LOW3(60) }])))
    expect(d.action).toBe('decrease_10pct')
    expect(d.sessions_under_floor).toBe(2)
    expect(d.suggested_weight_kg).toBe(55) // 54 → múltiplo de 2.5 más cercano = 55
  })
  it('una bajo piso + una bloqueada (dolor) → no −10 %; la bloqueada no cuenta como bajo rendimiento', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60) }, { sets: [{ w: 60, reps: 3, pain: true }, { w: 60, reps: 3 }, { w: 60, reps: 3 }] }])))
    expect(d.action).toBe('hold')
    expect(d.progression_blocked).toBe(true)
    expect(d.sessions_under_floor).toBe(1)
  })
  it('bloqueada (RIR 0 básico) entre dos bajo piso: la bloqueada es transparente, las dos relevantes sí cuentan', () => {
    const under = (): SetSpec[] => [{ w: 60, reps: 5, rir: 1 }, { w: 60, reps: 5, rir: 1 }, { w: 60, reps: 4, rir: 1 }]
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: under() }, { sets: [{ w: 60, reps: 4, rir: 0 }, { w: 60, reps: 4, rir: 0 }, { w: 60, reps: 4, rir: 0 }] }, { sets: under() }]), { exercise: basic }))
    expect(d.action).toBe('decrease_10pct')
    expect(d.sessions_under_floor).toBe(2)
  })
  it('dos bloqueadas → no −10 %, aunque las reps estén bajo el piso', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60), session: { version: 'short' } }, { sets: [{ w: 60, reps: 3, technique: true }, { w: 60, reps: 3 }, { w: 60, reps: 3 }] }])))
    expect(d.action).toBe('hold')
    expect(d.sessions_under_floor).toBe(0)
  })
  it('sesión normal intermedia reinicia la secuencia', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60) }, { sets: MID3(60) }, { sets: LOW3(60) }])))
    expect(d.action).toBe('hold')
    expect(d.sessions_under_floor).toBe(1)
  })
  it('dos bajo piso a cargas distintas no son comparables → no −10 %', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(57.5) }, { sets: LOW3(60) }])))
    expect(d.action).toBe('hold')
    expect(d.sessions_under_floor).toBe(1)
    expect(d.evaluations[1]!.outcome).toBe('incomparable')
  })
  it('dos bajo piso con objetivos distintos no son comparables → no −10 %', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: LOW3(60), targets: { reps_min: 8, reps_max: 12, target_rir: 2 } }, { sets: LOW3(60) }])))
    expect(d.action).toBe('hold')
    expect(d.sessions_under_floor).toBe(1)
  })
  it('sesión abandonada o abierta no es evaluable: ni cuenta ni rompe la racha', () => {
    const h = createProgressionFixture(EX, [{ sets: LOW3(60) }, { sets: LOW3(60), session: { status: 'abandoned' } }, { sets: LOW3(60) }])
    const d = decideProgression(input(h))
    expect(d.evaluations[1]!.outcome).toBe('not_evaluable')
    expect(d.action).toBe('decrease_10pct')
  })
  it('carga descargada correcta con otros incrementos y nunca igual a la actual', () => {
    expect(roundDeload(100 * 0.9, 5, 100)).toBe(90)
    expect(roundDeload(20 * 0.9, 2, 20)).toBe(18)
    expect(roundDeload(12 * 0.9, 4, 12)).toBe(8) // 10.8 → 12 sería igual → baja un incremento
    expect(roundDeload(0, 0, 0)).toBe(0)
    expect(roundToIncrement(62.5, 2.5)).toBe(62.5)
    expect(roundToIncrement(61, 2.5)).toBe(60)
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5)
    expect(roundToIncrement(7.3, 0)).toBe(7.3)
  })
})

describe('estancamiento', () => {
  it('1 y 2 sesiones sin progreso → no stall', () => {
    expect(decideProgression(input(createProgressionFixture(EX, [{ sets: MID3(60) }]))).stalled).toBe(false)
    expect(decideProgression(input(createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MID3(60) }]))).stalled).toBe(false)
  })
  it('3 relevantes consecutivas sin progreso → stall; acción sigue siendo hold', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MID3(60) }, { sets: MID3(60) }])))
    expect(d.stalled).toBe(true)
    expect(d.sessions_without_progress).toBe(3)
    expect(d.action).toBe('hold')
    expect(d.suggested_weight_kg).toBe(60)
  })
  it('bloqueadas y no evaluables no cuentan como no-progreso ni rompen la racha', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MID3(60), session: { version: 'short' } }, { sets: MID3(60), session: { status: 'abandoned' } }, { sets: MID3(60) }, { sets: MID3(60) }])))
    expect(d.stalled).toBe(true)
    expect(d.sessions_without_progress).toBe(3)
  })
  it('una sesión incomparable (otros objetivos) corta la racha', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MID3(60), targets: { reps_min: 8, reps_max: 12, target_rir: 2 } }, { sets: MID3(60) }, { sets: MID3(60) }])))
    expect(d.sessions_without_progress).toBe(2)
    expect(d.stalled).toBe(false)
    expect(d.evaluations[2]!.outcome).toBe('incomparable')
  })
  it('subir de carga cuenta como progreso: la primera sesión a la carga nueva no suma a la racha', () => {
    const d = decideProgression(input(createProgressionFixture(EX, [{ sets: MAX3(57.5) }, { sets: MID3(60) }, { sets: MID3(60) }, { sets: MID3(60) }])))
    expect(d.evaluations[3]!.outcome).toBe('progressed') // alcanzó el máximo a 57.5
    expect(d.evaluations[2]!.outcome).toBe('progressed') // subió a 60
    expect(d.sessions_without_progress).toBe(2)
    expect(d.stalled).toBe(false)
    const d2 = decideProgression(input(createProgressionFixture(EX, [{ sets: MAX3(57.5) }, { sets: MID3(60) }, { sets: MID3(60) }, { sets: MID3(60) }, { sets: MID3(60) }])))
    expect(d2.stalled).toBe(true)
  })
  it('stall genera una Alert "stall" con contexto y action_taken none; no cambia nada más', () => {
    const ex = createExerciseFixture({ is_basic: false, name: 'TEST press' })
    const inp = input(createProgressionFixture(EX, [{ sets: MID3(60) }, { sets: MID3(60) }, { sets: MID3(60) }]), { exercise: ex })
    const frozenTemplate = structuredClone(inp.template_exercise)
    const d = decideProgression(inp)
    const alert = buildStallAlert(ex, d)!
    expect(alert.type).toBe('stall')
    expect(alert.context.action_taken).toBe('none')
    expect(alert.context.load_kg).toBe(60)
    expect((alert.context.sessions as unknown[]).length).toBe(3)
    expect(inp.template_exercise).toEqual(frozenTemplate) // rango y volumen intactos
    expect(inp.exercise.id).toBe(ex.id) // ejercicio intacto
    expect(buildStallAlert(ex, { ...d, stalled: false })).toBeNull()
  })
})

describe('evaluateSession', () => {
  it('ignora calentamientos y usa la carga máxima de las series de trabajo', () => {
    const ws = createCompletedSessionFixture()
    const sets = createSetsFixture(ws, EX, [{ w: 40, reps: 10, warmup: true }, { w: 60, reps: 10 }, { w: 62.5, reps: 8 }])
    const e = evaluateSession(createExerciseFixture(), { session: ws, sets })
    expect(e.working_sets).toBe(2)
    expect(e.load_kg).toBe(62.5)
    expect(e.reached_max).toBe(false)
  })
  it('sesión abierta → not_completed; sin series → no_working_sets; objetivos mezclados → invalid_data', () => {
    const open = createSessionFixture()
    expect(evaluateSession(createExerciseFixture(), { session: open, sets: [] }).not_evaluable_reason).toBe('not_completed')
    const ws = createCompletedSessionFixture()
    expect(evaluateSession(createExerciseFixture(), { session: ws, sets: [] }).not_evaluable_reason).toBe('no_working_sets')
    const mixed = [...createSetsFixture(ws, EX, [{ w: 60, reps: 8 }]), ...createSetsFixture(ws, EX, [{ w: 60, reps: 8 }], { reps_min: 8, reps_max: 12, target_rir: 2 })]
    expect(evaluateSession(createExerciseFixture(), { session: ws, sets: mixed }).not_evaluable_reason).toBe('invalid_data')
  })
  it('sustituido sin series propias → blocked (no not_evaluable)', () => {
    const ws = createCompletedSessionFixture({ substitutions: [{ original_exercise_id: EX, substitute_exercise_id: 'x' }] })
    const e = evaluateSession(createExerciseFixture(), { session: ws, sets: [] })
    expect(e.outcome).toBe('blocked')
    expect(e.blocked_by).toEqual(['substituted'])
  })
})
