import { describe, expect, it } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from './seed'
import { SEED_IDS } from './ids'
import { seedExercises, seedFoods, seedMealPlans, seedTemplates } from './data'

async function fresh(name: string) {
  const s = new DexieStorage(name)
  await s.open()
  return s
}

describe('seed', () => {
  it('siembra todas las colecciones del protocolo en una base vacía', async () => {
    const s = await fresh('seed_1')
    const r = await seedIfEmpty(s)
    expect(r.skipped).toEqual([])
    expect(r.seeded).toContain('programs')
    expect(await s.repos.exercises.count()).toBe(seedExercises.length)
    expect(await s.repos.foods.count()).toBe(seedFoods.length)
    expect(await s.repos.meal_plans.count()).toBe(28)
    expect(await s.repos.workout_templates.count()).toBe(4)
    expect(await s.repos.monthly_goals.count()).toBe(4)
    const ev = await s.repos.app_events.whereEquals('type', 'seed')
    expect(ev).toHaveLength(1)
    s.close()
  })

  it('es idempotente: una segunda ejecución no cambia nada ni duplica', async () => {
    const s = await fresh('seed_2')
    await seedIfEmpty(s)
    const r2 = await seedIfEmpty(s)
    expect(r2.seeded).toEqual([])
    expect(await s.repos.foods.count()).toBe(seedFoods.length)
    expect(await s.repos.app_events.whereEquals('type', 'seed')).toHaveLength(1)
    s.close()
  })

  it('no sobrescribe una colección que el usuario ya editó', async () => {
    const s = await fresh('seed_3')
    await seedIfEmpty(s)
    const iso = (await s.repos.foods.get(SEED_IDS.foods.iso))!
    await s.run(['foods'], r => r.foods.put({ ...iso, protein_g: 27, kcal: 115, nutrition_status: 'verified' }))
    await seedIfEmpty(s)
    const after = (await s.repos.foods.get(SEED_IDS.foods.iso))!
    expect(after.protein_g).toBe(27)
    expect(after.nutrition_status).toBe('verified')
    s.close()
  })

  it('Mutant ISO se siembra sin macros y con nutrition_status missing', async () => {
    const s = await fresh('seed_4')
    await seedIfEmpty(s)
    const iso = (await s.repos.foods.get(SEED_IDS.foods.iso))!
    expect(iso.nutrition_status).toBe('missing')
    expect(iso.protein_g).toBeUndefined()
    expect(iso.kcal).toBeUndefined()
    s.close()
  })

  it('hay exactamente 4 key lifts: sentadilla, banca, peso muerto, remo pecho apoyado', async () => {
    const s = await fresh('seed_5')
    await seedIfEmpty(s)
    const keys = (await s.repos.exercises.getLive()).filter(e => e.is_key_lift).map(e => e.id).sort()
    expect(keys).toEqual([SEED_IDS.exercises.bench, SEED_IDS.exercises.chestRow, SEED_IDS.exercises.deadlift, SEED_IDS.exercises.squat].sort())
    s.close()
  })

  it('la rotación es Pierna A → Torso A → Pierna B → Torso B con cursor en 0 y días sugeridos L-M-J-V', async () => {
    const s = await fresh('seed_6')
    await seedIfEmpty(s)
    const p = (await s.repos.programs.get(SEED_IDS.program))!
    expect(p.rotation).toEqual([SEED_IDS.templates.legA, SEED_IDS.templates.upperA, SEED_IDS.templates.legB, SEED_IDS.templates.upperB])
    expect(p.rotation_cursor).toBe(0)
    expect(p.suggested_weekdays).toEqual([1, 2, 4, 5])
    s.close()
  })

  it('cada plantilla tiene versión corta (3 ejercicios) y mínima (2) derivadas de in_short / in_minimal', () => {
    for (const t of seedTemplates) {
      expect(t.exercises.filter(e => e.in_short)).toHaveLength(3)
      expect(t.exercises.filter(e => e.in_minimal)).toHaveLength(2)
      expect(t.exercises.filter(e => e.in_minimal).every(e => e.in_short)).toBe(true)
    }
  })

  it('el menú cubre 7 días × 4 comidas y las recetas referencian alimentos existentes', async () => {
    const s = await fresh('seed_7')
    await seedIfEmpty(s)
    const foodIds = new Set((await s.repos.foods.getAll()).map(f => f.id))
    const recipes = await s.repos.recipes.getAll()
    for (const r of recipes) for (const it of r.items) expect(foodIds.has(it.food_id)).toBe(true)
    const recipeIds = new Set(recipes.map(r => r.id))
    for (const mp of seedMealPlans) expect(recipeIds.has(mp.recipe_id)).toBe(true)
    s.close()
  })

  it('todas las plantillas referencian ejercicios existentes y los sustitutos también', () => {
    const ids = new Set(seedExercises.map(e => e.id))
    for (const t of seedTemplates) for (const e of t.exercises) expect(ids.has(e.exercise_id)).toBe(true)
    for (const e of seedExercises) for (const sId of e.substitutes) expect(ids.has(sId)).toBe(true)
  })
})
