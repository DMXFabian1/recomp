import { describe, expect, it } from 'vitest'
import { COLLECTIONS, type CollectionName } from '@domain/entities'
import { SCHEMA_VERSION, type BackupFile } from '@domain/backup/schema'
import {
  seedBaseline, seedEquivalents, seedExercises, seedFoods, seedGoal, seedMealPlans, seedMonthlyGoals, seedProgram,
  seedRecipes, seedSettings, seedTemplates, seedUser,
} from '@app/seed/data'
import { seedGoals, seedGroups, seedVariants, seedWarmups } from '@app/seed/catalog'
import { ENTITY_SCHEMAS, validateEntity } from './entities'
import { parseBackupJson, validateBackup } from './backup'
import { dayStringSchema, isoDateTimeSchema, hourStringSchema } from './primitives'

const T0 = '2026-10-01T00:00:00.000Z'
const stamp = <T extends object>(rows: T[]) => rows.map(r => ({ ...r, created_at: T0, updated_at: T0, source: 'system' as const }))

const SEED: Partial<Record<CollectionName, object[]>> = {
  users: stamp([seedUser]), settings: stamp([seedSettings]), baselines: stamp([seedBaseline]), exercises: stamp(seedExercises),
  workout_templates: stamp(seedTemplates), programs: stamp([seedProgram]), foods: stamp(seedFoods), food_equivalents: stamp(seedEquivalents),
  recipes: stamp(seedRecipes), meal_plans: stamp(seedMealPlans), goals: stamp([seedGoal]), monthly_goals: stamp(seedMonthlyGoals),
  exercise_variants: stamp(seedVariants), exercise_substitution_groups: stamp(seedGroups), warmup_exercises: stamp(seedWarmups), training_goals: stamp(seedGoals),
}

describe('schemas de entidad', () => {
  it('hay un schema por colección', () => {
    expect(Object.keys(ENTITY_SCHEMAS).sort()).toEqual([...COLLECTIONS].sort())
  })

  it('todo el seed (16 colecciones) es válido', () => {
    for (const [c, rows] of Object.entries(SEED)) {
      for (const row of rows!) {
        const r = validateEntity(c as CollectionName, row)
        expect(r.ok, `${c}: ${JSON.stringify(!r.ok && r.issues)}`).toBe(true)
      }
    }
  })

  it('objeto válido devuelve la MISMA referencia (no transforma)', () => {
    const row = SEED.users![0]!
    const r = validateEntity('users', row)
    expect(r.ok && r.value).toBe(row)
  })

  it('campo requerido ausente', () => {
    const { height_cm: _h, ...noHeight } = SEED.users![0] as Record<string, unknown>
    const r = validateEntity('users', noHeight)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]!.path).toBe('height_cm')
  })

  it('enum inválido', () => {
    const r = validateEntity('users', { ...SEED.users![0], sex: 'other' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]!.path).toBe('sex')
  })

  it('número inválido (rango, NaN, no entero)', () => {
    expect(validateEntity('users', { ...SEED.users![0], height_cm: 20 }).ok).toBe(false)
    expect(validateEntity('users', { ...SEED.users![0], height_cm: Number.NaN }).ok).toBe(false)
    expect(validateEntity('settings', { ...SEED.settings![0], kcal_target: 2400.5 }).ok).toBe(false)
    expect(validateEntity('settings', { ...SEED.settings![0], protein_floor_g: 200, protein_target_g: 180 }).ok).toBe(false)
  })

  it('fecha inválida (día, ISO, hora)', () => {
    expect(dayStringSchema.safeParse('2026-02-30').success).toBe(false)
    expect(dayStringSchema.safeParse('2026-10-6').success).toBe(false)
    expect(dayStringSchema.safeParse('2026-10-06').success).toBe(true)
    expect(isoDateTimeSchema.safeParse('ayer').success).toBe(false)
    expect(isoDateTimeSchema.safeParse('2026-10-06T18:15:00.000Z').success).toBe(true)
    expect(hourStringSchema.safeParse('24:00').success).toBe(false)
    expect(validateEntity('users', { ...SEED.users![0], created_at: 'nope' }).ok).toBe(false)
  })

  it('relaciones internas: reps_min ≤ reps_max, cursor dentro de rotación, start ≤ end', () => {
    const tpl = SEED.workout_templates![0] as { exercises: Array<Record<string, unknown>> }
    const bad = { ...tpl, exercises: [{ ...tpl.exercises[0], reps_min: 12, reps_max: 6 }] }
    expect(validateEntity('workout_templates', bad).ok).toBe(false)
    expect(validateEntity('programs', { ...SEED.programs![0], rotation_cursor: 4 }).ok).toBe(false)
    expect(validateEntity('goals', { ...SEED.goals![0], start_date: '2027-02-01' }).ok).toBe(false)
  })

  it('nullable: off_plan_protein_g acepta null, número ≥ 0 o ausente; rechaza string', () => {
    const ml = { id: 'm', created_at: T0, updated_at: T0, source: 'user', date: '2026-10-05', slot: 'lunch', status: 'off_plan', est_complete: false, logged_at: T0 }
    expect(validateEntity('meal_logs', { ...ml, off_plan_protein_g: null }).ok).toBe(true)
    expect(validateEntity('meal_logs', { ...ml, off_plan_protein_g: 30 }).ok).toBe(true)
    expect(validateEntity('meal_logs', ml).ok).toBe(true)
    expect(validateEntity('meal_logs', { ...ml, off_plan_protein_g: '30' }).ok).toBe(false)
    expect(validateEntity('meal_logs', { ...ml, status: 'planned' }).ok).toBe(false) // requiere recipe_id
  })

  it('arrays: tipo de elementos y mínimos', () => {
    expect(validateEntity('programs', { ...SEED.programs![0], rotation: [] }).ok).toBe(false)
    expect(validateEntity('programs', { ...SEED.programs![0], suggested_weekdays: [7] }).ok).toBe(false)
    expect(validateEntity('exercises', { ...SEED.exercises![0], movement_patterns: ['fly'] }).ok).toBe(false)
  })

  it('las claves desconocidas se toleran (formato aditivo)', () => {
    expect(validateEntity('users', { ...SEED.users![0], future_field: 1 }).ok).toBe(true)
  })
})

describe('backup', () => {
  const backup = (): BackupFile => ({
    schema_version: SCHEMA_VERSION, app_version: '0.2.0', exported_at: T0, device_id: 'd',
    collections: Object.fromEntries(Object.entries(SEED).map(([k, v]) => [k, v as unknown[]])),
  })

  it('backup válido: ok y misma referencia', () => {
    const b = backup()
    const r = validateBackup(b)
    expect(r.ok, JSON.stringify(!r.ok && r.issues)).toBe(true)
    expect(r.ok && r.value).toBe(b)
  })

  it('schema_version inválido: 0, 1.5, mayor que la app, string', () => {
    for (const v of [0, 1.5, SCHEMA_VERSION + 1, '2']) {
      const r = validateBackup({ ...backup(), schema_version: v })
      expect(r.ok, String(v)).toBe(false)
      expect(!r.ok && r.issues[0]!.path).toBe('schema_version')
    }
  })

  it('schema_version 1 (anterior) es aceptado: la migración es otro paso', () => {
    expect(validateBackup({ ...backup(), schema_version: 1 }).ok).toBe(true)
  })

  it('backup inválido: colección desconocida, colección excluida y entidad rota', () => {
    const r1 = validateBackup({ ...backup(), collections: { pets: [] } })
    expect(!r1.ok && r1.issues[0]).toEqual({ path: 'collections.pets', message: 'Colección desconocida' })
    const r2 = validateBackup({ ...backup(), collections: { progress_photos: [] } })
    expect(r2.ok).toBe(false)
    const r3 = validateBackup({ ...backup(), collections: { users: [{ id: 'x' }] } })
    expect(!r3.ok && r3.issues[0]!.path.startsWith('collections.users[0]')).toBe(true)
  })

  it('sobre inválido: faltan campos o collections no es un objeto', () => {
    expect(validateBackup({ schema_version: 2 }).ok).toBe(false)
    expect(validateBackup({ ...backup(), collections: [] }).ok).toBe(false)
    expect(validateBackup(null).ok).toBe(false)
  })

  it('JSON imposible de deserializar', () => {
    const r = parseBackupJson('{ "schema_version": 2, ')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]!.message.startsWith('JSON inválido')).toBe(true)
    expect(parseBackupJson(JSON.stringify(backup())).ok).toBe(true)
  })

  it('no modifica la entrada', () => {
    const b = backup()
    const frozen = structuredClone(b)
    validateBackup(b)
    expect(b).toEqual(frozen)
  })

  it('limita el número de issues por colección', () => {
    const r = validateBackup({ ...backup(), collections: { users: Array.from({ length: 50 }, () => ({})) } }, { maxIssuesPerCollection: 3 })
    expect(!r.ok && r.issues).toHaveLength(4)
  })
})
