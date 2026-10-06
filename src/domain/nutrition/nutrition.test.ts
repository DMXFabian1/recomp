import { describe, expect, it } from 'vitest'
import type { DailyCheckIn, Food, MealLog, MealPlan, Recipe } from '@domain/entities'
import { calculateEstimatedProtein } from './protein'
import { getYesterdayNutritionStatus } from './yesterday'

const T0 = '2026-10-01T00:00:00.000Z'
const base = { created_at: T0, updated_at: T0, source: 'user' as const }

const food = (id: string, protein_g: number | undefined, status: Food['nutrition_status'] = 'estimated'): Food => ({
  ...base, id, name: id, category: 'protein', portion_label: '1 porción', nutrition_status: status, store: 'super',
  purchase_unit: 'pza', portions_per_unit: 1, lactose_free: true,
  ...(protein_g !== undefined ? { protein_g, kcal: 100 } : {}),
})
const FOODS = [food('chicken', 31), food('egg', 6.5), food('rice', 4), food('oil', 0), food('iso', undefined, 'missing')]
const recipe = (id: string, items: Recipe['items']): Recipe => ({ ...base, id, name: id, items, prep_min: 10, emergency: false })
const RECIPES = [
  recipe('r_chicken_rice', [{ food_id: 'chicken', portions: 2 }, { food_id: 'rice', portions: 1 }]), // 66
  recipe('r_eggs', [{ food_id: 'egg', portions: 4 }]), // 26
  recipe('r_shake', [{ food_id: 'iso', portions: 1 }]), // desconocido
  recipe('r_oil', [{ food_id: 'oil', portions: 1 }]), // 0
  recipe('r_ghost', [{ food_id: 'nope', portions: 1 }]),
]
const Y = '2026-10-05'
const log = (slot: MealLog['slot'], status: MealLog['status'], extra: Partial<MealLog> = {}): MealLog => ({
  ...base, id: `${Y}_${slot}`, date: Y, slot, status, est_complete: false, logged_at: `${Y}T20:00:00.000Z`, ...extra,
})
const est = (logs: MealLog[], floor?: number) => calculateEstimatedProtein({ meal_logs: logs, recipes: RECIPES, foods: FOODS }, floor)

describe('calculateEstimatedProtein', () => {
  it('cálculo normal desde recetas y alimentos', () => {
    const r = est([log('lunch', 'planned', { recipe_id: 'r_chicken_rice' })])
    expect(r.grams_known).toBe(66)
    expect(r.status).toBe('incomplete')
    expect(r.known_meals).toBe(1)
  })

  it('múltiples alimentos y comidas suman; exactamente 160 g es completa', () => {
    const r = est([
      log('breakfast', 'planned', { recipe_id: 'r_eggs' }), // 26
      log('lunch', 'planned', { recipe_id: 'r_chicken_rice' }), // 66
      log('dinner', 'planned', { recipe_id: 'r_chicken_rice' }), // 66
      log('snack', 'off_plan', { off_plan_protein_g: 2 }), // 2 → 160
    ])
    expect(r.grams_known).toBe(160)
    expect(r.status).toBe('complete')
  })

  it('159.9 g es incompleta; >160 completa', () => {
    const r = est([log('lunch', 'off_plan', { off_plan_protein_g: 159.9 })])
    expect(r.status).toBe('incomplete')
    expect(est([log('lunch', 'off_plan', { off_plan_protein_g: 160.1 })]).status).toBe('complete')
  })

  it('alimentos sin proteína suman 0 y se consideran conocidos', () => {
    const r = est([log('snack', 'planned', { recipe_id: 'r_oil' })])
    expect(r.grams_known).toBe(0)
    expect(r.status).toBe('incomplete')
    expect(r.unknown_meals).toBe(0)
  })

  it('cantidad faltante (off_plan sin gramos) → desconocido; no se fabrica un número', () => {
    const r = est([log('lunch', 'off_plan', { off_plan_protein_g: null }), log('dinner', 'off_plan')])
    expect(r.status).toBe('unknown')
    expect(r.grams_known).toBe(0)
    expect(r.unknown_meals).toBe(2)
    expect(r.meals.every(m => m.reason === 'off_plan_unknown')).toBe(true)
  })

  it('comida desconocida: receta inexistente o alimento inexistente → desconocido', () => {
    const r = est([log('lunch', 'planned', { recipe_id: 'r_missing' }), log('dinner', 'planned', { recipe_id: 'r_ghost' })])
    expect(r.status).toBe('unknown')
    expect(r.meals[0]!.reason).toBe('no_recipe')
    expect(r.meals[1]!.reason).toBe('food_missing')
  })

  it("alimento con nutrition_status 'missing' (Mutant ISO) → desconocido, no 0", () => {
    const r = est([log('breakfast', 'planned', { recipe_id: 'r_shake' })])
    expect(r.status).toBe('unknown')
    expect(r.meals[0]!.reason).toBe('food_without_protein')
  })

  it('datos insuficientes: sin registros → no_data con grams null', () => {
    const r = est([])
    expect(r.status).toBe('no_data')
    expect(r.grams_known).toBeNull()
  })

  it('cota inferior: si lo conocido ya supera el piso, es completa aunque haya desconocidos', () => {
    const r = est([log('lunch', 'off_plan', { off_plan_protein_g: 170 }), log('dinner', 'off_plan')])
    expect(r.status).toBe('complete')
    expect(r.unknown_meals).toBe(1)
  })

  it('usa protein_g_est solo cuando est_complete; aplica sustituciones; skipped = 0', () => {
    const r = est([
      log('breakfast', 'planned', { recipe_id: 'r_eggs', protein_g_est: 30, est_complete: true }), // 30, no 26
      log('lunch', 'substituted', { recipe_id: 'r_chicken_rice', substitutions: [{ food_id: 'chicken', substitute_food_id: 'egg', portions: 4 }] }), // 26 + 4 = 30
      log('snack', 'skipped'),
    ])
    expect(r.grams_known).toBe(60)
    expect(r.meals[2]!.grams).toBe(0)
  })

  it('respeta el piso configurado', () => {
    expect(est([log('lunch', 'off_plan', { off_plan_protein_g: 120 })], 120).status).toBe('complete')
  })
})

describe('getYesterdayNutritionStatus', () => {
  const TODAY = '2026-10-06'
  const checkIn = (food_yesterday?: DailyCheckIn['food_yesterday']): DailyCheckIn => ({
    ...base, id: `ci_${TODAY}`, date: TODAY, irregular: false, ...(food_yesterday ? { food_yesterday } : {}),
  })
  const plans: MealPlan[] = (['breakfast', 'lunch', 'snack', 'dinner'] as const).map(slot => ({
    ...base, id: `mp_0_${slot}`, weekday: 1, slot, recipe_id: 'r_eggs', time: '08:00', // 5 oct 2026 es lunes
  }))
  const run = (ci: DailyCheckIn | null, logs: MealLog[]) =>
    getYesterdayNutritionStatus({ today: TODAY, today_check_in: ci, meal_plans: plans, meal_logs: logs, recipes: RECIPES, foods: FOODS })
  const full = [log('lunch', 'off_plan', { off_plan_protein_g: 100 }), log('dinner', 'off_plan', { off_plan_protein_g: 70 })]
  const low = [log('lunch', 'off_plan', { off_plan_protein_g: 40 })]

  it('adherencia alta + proteína completa', () => {
    const s = run(checkIn('plan'), full)
    expect(s.adherence).toBe('high')
    expect(s.protein_complete).toBe(true)
    expect(s.estimated_protein_g).toBe(170)
  })
  it('adherencia alta + proteína incompleta (no se infiere de la adherencia)', () => {
    const s = run(checkIn('plan'), low)
    expect(s.adherence).toBe('high')
    expect(s.protein_complete).toBe(false)
  })
  it('adherencia baja + proteína completa (no se infiere de la proteína)', () => {
    const s = run(checkIn('off'), full)
    expect(s.adherence).toBe('low')
    expect(s.protein_complete).toBe(true)
  })
  it('adherencia baja + proteína incompleta', () => {
    const s = run(checkIn('off'), low)
    expect(s.adherence).toBe('low')
    expect(s.protein_complete).toBe(false)
  })
  it('sin datos: adherencia unknown, proteína no_data, protein_complete null; las planeadas se siguen contando', () => {
    const s = run(null, [])
    expect(s.date).toBe('2026-10-05')
    expect(s.adherence).toBe('unknown')
    expect(s.protein.status).toBe('no_data')
    expect(s.protein_complete).toBeNull()
    expect(s.estimated_protein_g).toBeNull()
    expect(s.planned_meals).toBe(4)
    expect(s.logged_meals).toBe(0)
  })
  it('check-in sin food_yesterday → adherencia unknown aunque haya proteína', () => {
    expect(run(checkIn(), full).adherence).toBe('unknown')
  })
  it('comidas consumidas vs estimadas vs omitidas', () => {
    const s = run(checkIn('almost'), [
      log('breakfast', 'planned', { recipe_id: 'r_eggs', protein_g_est: 26, est_complete: true }),
      log('lunch', 'planned', { recipe_id: 'r_chicken_rice' }), // est_complete false → estimada
      log('snack', 'skipped'),
    ])
    expect(s.adherence).toBe('medium')
    expect(s.logged_meals).toBe(3)
    expect(s.consumed_meals).toBe(2)
    expect(s.estimated_meals).toBe(1)
    expect(s.skipped_meals).toBe(1)
    expect(s.estimated_protein_g).toBe(92)
  })
  it('cantidades faltantes → protein_complete null (unknown), adherencia intacta', () => {
    const s = run(checkIn('plan'), [log('lunch', 'off_plan')])
    expect(s.adherence).toBe('high')
    expect(s.protein.status).toBe('unknown')
    expect(s.protein_complete).toBeNull()
  })
  it('solo usa los registros de ayer, no los de otros días', () => {
    const other = { ...log('lunch', 'off_plan', { off_plan_protein_g: 500 }), id: 'x', date: '2026-10-04' }
    expect(run(checkIn('plan'), [other]).protein.status).toBe('no_data')
  })
})
