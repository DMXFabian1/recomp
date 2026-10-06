/**
 * Siembra idempotente: cada colección solo se llena si está vacía, así los datos que el
 * usuario edite después nunca se sobrescriben. Todo en UNA transacción; registra un AppEvent 'seed'.
 */
import { ulid } from 'ulid'
import type { BaseEntity, CollectionName } from '@domain/entities'
import type { Repos, Storage } from '@repo/index'
import {
  seedBaseline, seedEquivalents, seedExercises, seedFoods, seedGoal, seedMealPlans, seedMonthlyGoals,
  seedProgram, seedRecipes, seedSettings, seedTemplates, seedUser,
} from './data'

export interface SeedResult {
  seeded: CollectionName[]
  skipped: CollectionName[]
}

const SEED_COLLECTIONS: CollectionName[] = [
  'users', 'settings', 'baselines', 'exercises', 'workout_templates', 'programs',
  'foods', 'food_equivalents', 'recipes', 'meal_plans', 'goals', 'monthly_goals', 'app_events',
]

function stamp<T extends object>(rows: T[], now: string): Array<T & BaseEntity> {
  return rows.map(r => ({ ...r, created_at: now, updated_at: now, source: 'system' }) as T & BaseEntity)
}

export async function seedIfEmpty(storage: Storage, now = new Date().toISOString()): Promise<SeedResult> {
  return storage.run(SEED_COLLECTIONS, async (repos: Repos) => {
    const seeded: CollectionName[] = []
    const skipped: CollectionName[] = []

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
    await fill('exercises', seedExercises)
    await fill('workout_templates', seedTemplates)
    await fill('programs', [seedProgram])
    await fill('foods', seedFoods)
    await fill('food_equivalents', seedEquivalents)
    await fill('recipes', seedRecipes)
    await fill('meal_plans', seedMealPlans)
    await fill('goals', [seedGoal])
    await fill('monthly_goals', seedMonthlyGoals)

    if (seeded.length > 0) {
      await repos.app_events.put({
        id: ulid(), created_at: now, updated_at: now, source: 'system',
        ts: now, type: 'seed', payload: { seeded },
      })
    }
    return { seeded, skipped }
  })
}
