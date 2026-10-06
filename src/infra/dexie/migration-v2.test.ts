/**
 * Regresión de migración v1 → v2 sobre IndexedDB real (fake-indexeddb):
 * se crea una base v1 con el seed v1 (30 ejercicios + sets de un entrenamiento), se abre con v2 y se verifica
 * que ids, ExerciseSet y key lifts permanecen, que los ejercicios quedan enriquecidos, que hay backup automático
 * y que el seed v2 inserta el resto del catálogo sin pisar ediciones del usuario.
 */
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@domain/backup/schema'
import { MIGRATIONS, migrateBackup } from '@domain/backup/migrations'
import type { BackupFile } from '@domain/backup/schema'
import { BOOK_SOURCE, type Exercise, type ExerciseSet } from '@domain/entities'
import { legacySeedExercisesV1, seedTemplates } from '@app/seed/data'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import { DEXIE_SCHEMAS } from './schema'
import { DexieStorage } from './storage'

const T0 = '2026-10-01T00:00:00.000Z'
const E = SEED_IDS.exercises

async function makeV1(name: string, opts: { editSquat?: boolean } = {}) {
  const v1 = new Dexie(name)
  v1.version(1).stores(DEXIE_SCHEMAS[0] as Record<string, string>)
  await v1.open()
  const rows: Exercise[] = legacySeedExercisesV1.map(e => ({ ...e, created_at: T0, updated_at: T0, source: 'system' } as Exercise))
  if (opts.editSquat) {
    const sq = rows.find(r => r.id === E.squat)!
    sq.name = 'Sentadilla (mi nombre)'
    sq.increment_kg = 2.5
    sq.updated_at = '2026-10-02T00:00:00.000Z'
    sq.source = 'user'
  }
  await v1.table('exercises').bulkPut(rows)
  await v1.table('workout_templates').bulkPut(seedTemplates.map(t => ({ ...t, created_at: T0, updated_at: T0, source: 'system' })))
  const set: ExerciseSet = {
    id: 'set_1', created_at: T0, updated_at: T0, source: 'user', session_id: 'ws_1', exercise_id: E.squat,
    set_number: 1, reps: 8, weight_kg: 60, rir: 2,
  } as ExerciseSet
  await v1.table('exercise_sets').put(set)
  expect(v1.verno).toBe(1)
  v1.close()
}

describe('migración IndexedDB v1 → v2', () => {
  it('enriquece ejercicios, conserva ids/sets/key lifts y crea backup automático', async () => {
    await makeV1('mig_v2_a')
    const s = new DexieStorage('mig_v2_a')
    await s.open()
    expect((await s.info()).schema_version).toBe(SCHEMA_VERSION)

    const exercises = await s.repos.exercises.getAll()
    expect(exercises).toHaveLength(30)
    for (const e of exercises) {
      expect(e.movement_patterns!.length).toBeGreaterThan(0)
      expect(e.equipment_list!.length).toBeGreaterThan(0)
      expect(e.category).toBeDefined()
      expect(e.catalog_source).toBe('manual')
      expect(e.field_provenance!.movement_patterns).toBe('manual')
      expect(e.updated_at).toBe(T0) // la migración no cuenta como edición
    }
    const keys = exercises.filter(e => e.is_key_lift).map(e => e.id).sort()
    expect(keys).toEqual([E.bench, E.chestRow, E.deadlift, E.squat].sort())
    const sets = await s.repos.exercise_sets.getAll()
    expect(sets).toHaveLength(1)
    expect(sets[0]!.exercise_id).toBe(E.squat)
    expect(sets[0]!.weight_kg).toBe(60)

    const backups = await s.repos.backups.getAll()
    expect(backups).toHaveLength(1)
    expect(backups[0]!.kind).toBe('auto_pre_migration')
    expect(backups[0]!.schema_version).toBe(1)
    for (const c of ['exercise_variants', 'exercise_substitution_groups', 'warmup_exercises', 'training_goals'] as const) {
      expect(await s.repos[c].count()).toBe(0)
    }
    s.close()
  })

  it('seed v2 sobre base migrada: inserta 83 nuevos, enriquece 30 intactos desde el libro y siembra colecciones v2', async () => {
    await makeV1('mig_v2_b')
    const s = new DexieStorage('mig_v2_b')
    await s.open()
    const r = await seedIfEmpty(s)
    expect(r.skipped).toContain('exercises')
    expect(r.catalog.inserted).toBe(83)
    expect(r.catalog.enriched).toBe(30)
    expect(r.catalog.filled).toBe(0)
    expect(await s.repos.exercises.count()).toBe(113)

    const squat = (await s.repos.exercises.get(E.squat))!
    expect(squat.catalog_source).toBe(BOOK_SOURCE)
    expect(squat.source_page).toBe(64)
    expect(squat.functional_rating).toBe(5)
    expect(squat.increment_kg).toBe(5) // campo del motor: intacto
    expect(squat.is_key_lift).toBe(true)
    expect(squat.updated_at).toBe(T0)
    expect(await s.repos.exercise_variants.count()).toBeGreaterThan(0)
    expect(await s.repos.exercise_substitution_groups.count()).toBe(14)
    expect(await s.repos.warmup_exercises.count()).toBe(19)
    expect(await s.repos.training_goals.count()).toBe(6)

    // Plantillas: siguen apuntando a los mismos ids.
    const tpl = await s.repos.workout_templates.getAll()
    expect(tpl).toHaveLength(4)
    expect((await s.repos.exercise_sets.getAll())[0]!.exercise_id).toBe(E.squat)

    // Idempotencia
    const r2 = await seedIfEmpty(s)
    expect(r2.catalog).toEqual({ inserted: 0, enriched: 0, filled: 0, untouched: 113 })
    s.close()
  })

  it('no pisa un ejercicio editado por el usuario: solo rellena campos ausentes', async () => {
    await makeV1('mig_v2_c', { editSquat: true })
    const s = new DexieStorage('mig_v2_c')
    await s.open()
    const r = await seedIfEmpty(s)
    expect(r.catalog.enriched).toBe(29)
    expect(r.catalog.filled).toBe(1)
    const squat = (await s.repos.exercises.get(E.squat))!
    expect(squat.name).toBe('Sentadilla (mi nombre)')
    expect(squat.increment_kg).toBe(2.5)
    expect(squat.source).toBe('user')
    // Lo derivado en la migración (manual) se conserva; lo ausente (primary_muscles, source_page) se rellena.
    expect(squat.catalog_source).toBe('manual')
    expect(squat.field_provenance!.movement_patterns).toBe('manual')
    expect(squat.primary_muscles).toContain('quadriceps')
    expect(squat.field_provenance!.primary_muscles).toBe('direct')
    expect(squat.source_page).toBe(64)
    s.close()
  })
})

describe('migración de backup v1 → v2 (MIGRATIONS[1])', () => {
  it('añade colecciones v2 vacías y enriquece ejercicios; roundtrip estable', () => {
    const v1: BackupFile = {
      schema_version: 1, app_version: '0.1.0', exported_at: T0, device_id: 'x',
      collections: {
        exercises: legacySeedExercisesV1.map(e => ({ ...e, created_at: T0, updated_at: T0, source: 'system' })),
        exercise_sets: [{ id: 'set_1', exercise_id: E.squat, reps: 8, weight_kg: 60 }],
      },
    }
    expect(MIGRATIONS[1]).toBeDefined()
    const v2 = migrateBackup(v1)
    expect(v2.schema_version).toBe(2)
    for (const c of ['exercise_variants', 'exercise_substitution_groups', 'warmup_exercises', 'training_goals']) {
      expect(v2.collections[c]).toEqual([])
    }
    const ex = v2.collections.exercises as Exercise[]
    expect(ex).toHaveLength(30)
    expect(ex.every(e => e.movement_patterns && e.category && e.catalog_source === 'manual')).toBe(true)
    expect(ex.filter(e => e.is_key_lift)).toHaveLength(4)
    expect(v2.collections.exercise_sets).toEqual(v1.collections.exercise_sets)
    expect(migrateBackup(v2)).toEqual(v2)
  })
})
