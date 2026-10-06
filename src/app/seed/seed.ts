/**
 * Siembra idempotente: cada colección solo se llena si está vacía, así los datos que el
 * usuario edite después nunca se sobrescriben. Todo en UNA transacción; registra un AppEvent 'seed'.
 *
 * Fase 8.2 — catálogo v2 sobre bases ya sembradas (v1 migrada):
 *  - ejercicios del catálogo que no existen → se insertan;
 *  - ejercicios existentes NO tocados por el usuario (source 'system' y updated_at === created_at)
 *    → se enriquecen con todos los campos de catálogo (id, ExerciseSet y plantillas intactos);
 *  - ejercicios editados por el usuario → solo se rellenan campos ausentes; nunca se sobrescribe.
 */
import { ulid } from 'ulid'
import type { BaseEntity, CollectionName, Exercise } from '@domain/entities'
import type { Repos, Storage } from '@repo/index'
import {
  seedBaseline, seedEquivalents, seedExercises, seedFoods, seedGoal, seedMealPlans, seedMonthlyGoals,
  seedProgram, seedRecipes, seedSettings, seedTemplates, seedUser,
} from './data'
import { seedGoals, seedGroups, seedVariants, seedWarmups } from './catalog'

export interface SeedResult {
  seeded: CollectionName[]
  skipped: CollectionName[]
  catalog: { inserted: number; enriched: number; filled: number; untouched: number }
}

const SEED_COLLECTIONS: CollectionName[] = [
  'users', 'settings', 'baselines', 'exercises', 'workout_templates', 'programs',
  'foods', 'food_equivalents', 'recipes', 'meal_plans', 'goals', 'monthly_goals', 'app_events',
  'exercise_variants', 'exercise_substitution_groups', 'warmup_exercises', 'training_goals',
]

/** Campos v1 del ejercicio que el motor usa: nunca se tocan en un registro existente. */
const ENGINE_FIELDS: ReadonlySet<string> = new Set(['id', 'pattern', 'equipment', 'increment_kg', 'is_basic', 'is_key_lift', 'substitutes', 'created_at', 'updated_at', 'source', 'deleted_at'])

function stamp<T extends object>(rows: T[], now: string): Array<T & BaseEntity> {
  return rows.map(r => ({ ...r, created_at: now, updated_at: now, source: 'system' }) as T & BaseEntity)
}

export function isUntouched(e: BaseEntity): boolean {
  return e.source === 'system' && e.updated_at === e.created_at
}

/**
 * Combina un ejercicio existente con su versión de catálogo.
 * Devuelve null si no hay nada que cambiar.
 */
export function mergeCatalogExercise(existing: Exercise, catalog: Omit<Exercise, 'created_at' | 'updated_at' | 'source'>): { row: Exercise; mode: 'enriched' | 'filled' } | null {
  const untouched = isUntouched(existing)
  const row: Exercise = { ...existing }
  let changed = false
  for (const [k, v] of Object.entries(catalog)) {
    if (ENGINE_FIELDS.has(k) || v === undefined) continue
    const cur = (existing as unknown as Record<string, unknown>)[k]
    const canWrite = untouched ? true : cur === undefined
    if (!canWrite) continue
    if (JSON.stringify(cur) === JSON.stringify(v)) continue
    ;(row as unknown as Record<string, unknown>)[k] = v
    changed = true
  }
  if (untouched) {
    // Un registro de sistema jamás editado puede adoptar el nombre del catálogo.
    if (row.name !== catalog.name) { row.name = catalog.name; changed = true }
  } else if (row.field_provenance && catalog.field_provenance) {
    // En registros editados, la procedencia solo se añade para campos que acabamos de rellenar.
    row.field_provenance = { ...catalog.field_provenance, ...existing.field_provenance }
  }
  if (!changed) return null
  return { row, mode: untouched ? 'enriched' : 'filled' }
}

export async function seedIfEmpty(storage: Storage, now = new Date().toISOString()): Promise<SeedResult> {
  return storage.run(SEED_COLLECTIONS, async (repos: Repos) => {
    const seeded: CollectionName[] = []
    const skipped: CollectionName[] = []
    const catalog = { inserted: 0, enriched: 0, filled: 0, untouched: 0 }

    async function fill<C extends CollectionName>(c: C, rows: object[]) {
      if ((await repos[c].count()) > 0) {
        skipped.push(c)
        return
      }
      await repos[c].bulkPut(stamp(rows, now) as never)
      seeded.push(c)
    }

    await fill('users', [seedUser])
    await fill('settings', [seedSettings])
    await fill('baselines', [seedBaseline])

    // Ejercicios: vacío → siembra completa; con datos → inserción de faltantes + enriquecimiento prudente.
    if ((await repos.exercises.count()) === 0) {
      await repos.exercises.bulkPut(stamp(seedExercises, now))
      seeded.push('exercises')
      catalog.inserted = seedExercises.length
    } else {
      skipped.push('exercises')
      const existing = new Map((await repos.exercises.getAll()).map(e => [e.id, e]))
      const toWrite: Exercise[] = []
      for (const c of seedExercises) {
        const cur = existing.get(c.id)
        if (!cur) {
          toWrite.push(stamp([c], now)[0]!)
          catalog.inserted++
          continue
        }
        const merged = mergeCatalogExercise(cur, c)
        if (!merged) { catalog.untouched++; continue }
        // Enriquecer no cuenta como edición del usuario: conservamos updated_at === created_at si era intacto.
        toWrite.push(merged.row)
        catalog[merged.mode]++
      }
      if (toWrite.length > 0) await repos.exercises.bulkPut(toWrite)
    }

    await fill('workout_templates', seedTemplates)
    await fill('programs', [seedProgram])
    await fill('foods', seedFoods)
    await fill('food_equivalents', seedEquivalents)
    await fill('recipes', seedRecipes)
    await fill('meal_plans', seedMealPlans)
    await fill('goals', [seedGoal])
    await fill('monthly_goals', seedMonthlyGoals)
    await fill('exercise_variants', seedVariants)
    await fill('exercise_substitution_groups', seedGroups)
    await fill('warmup_exercises', seedWarmups)
    await fill('training_goals', seedGoals)

    if (seeded.length > 0 || catalog.inserted > 0 || catalog.enriched > 0 || catalog.filled > 0) {
      await repos.app_events.put({
        id: ulid(), created_at: now, updated_at: now, source: 'system',
        ts: now, type: 'seed', payload: { seeded, catalog },
      })
    }
    return { seeded, skipped, catalog }
  })
}
