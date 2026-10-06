/**
 * Datos iniciales tomados del protocolo aprobado (plan de recomposición oct 2026 → ene 2027).
 * - Macros de alimentos: valores de referencia por porción, marcados 'estimated' (editables en MÁS → Alimentos).
 * - Mutant ISO: sin macros, nutrition_status 'missing' (decisión aprobada: no se asume nada).
 * - Nada aquí decide reglas: las reglas viven en domain/*.
 */
import type {
  Exercise, Food, FoodEquivalent, Goal, MealPlan, MonthlyGoal, Program, Recipe, Settings,
  TemplateExercise, User, WorkoutTemplate, Baseline,
} from '@domain/entities'
import { SEED_IDS as S } from './ids'
import { seedCatalogExercises, seedEquipmentProfiles } from './catalog'

type Seedable<T> = Omit<T, 'created_at' | 'updated_at' | 'source'>

// ───────────────────────── Usuario, settings, baseline ─────────────────────────

export const seedUser: Seedable<User> = {
  id: S.user,
  name: 'Dany',
  sex: 'male',
  height_cm: 184,
  device_id: 'seed',
}

export const seedSettings: Seedable<Settings> = {
  id: S.settings,
  kcal_target: 2400,
  protein_target_g: 180,
  protein_floor_g: 160,
  fat_g_range: [70, 80],
  carb_g_range: [230, 270],
  steps_target: 9000,
  schedule: {
    wake: '06:00', breakfast: '06:30', row: '06:45', work: '09:00', lunch: '14:00',
    snack: '17:00', gym: '18:15', dinner: '19:45', lights: '22:45',
  },
  gym_slot: 'evening',
  increments: { barbell_leg: 5, barbell_upper: 2.5, dumbbell: 2, machine: 5 },
  rest_s: { basic: 150, accessory: 75 },
  theme: 'system',
  units: 'metric',
  effective_from: '2026-10-06',
  change_origin: 'seed',
  equipment_profiles: {
    home: { name: seedEquipmentProfiles.home.name, items: [...seedEquipmentProfiles.home.items], max_load_kg: seedEquipmentProfiles.home.max_load_kg },
    gym: { name: seedEquipmentProfiles.gym.name, items: [...seedEquipmentProfiles.gym.items] },
  },
  active_equipment_profile: 'gym',
}

export const seedBaseline: Seedable<Baseline> = {
  id: S.baseline,
  weight_samples: [],
  closed: false,
  photos_complete: false,
}

// ───────────────────────── Ejercicios ─────────────────────────

const E = S.exercises
type Ex = Seedable<Exercise>

/** Catálogo completo v2 (libro + manuales). Los 30 ejercicios del programa conservan sus ids v1. */
export const seedExercises: Seedable<Exercise>[] = seedCatalogExercises

const ex = (id: string, name: string, pattern: Exercise['pattern'], equipment: Exercise['equipment'],
  increment_kg: number, opts: Partial<Pick<Exercise, 'is_basic' | 'is_key_lift' | 'substitutes'>> = {}): Ex => ({
  id, name, pattern, equipment, increment_kg,
  is_basic: opts.is_basic ?? false,
  is_key_lift: opts.is_key_lift ?? false,
  substitutes: opts.substitutes ?? [],
})

/** Lista v1 (30 ejercicios). Se conserva solo para simular bases v1 en tests de migración. */
export const legacySeedExercisesV1: Ex[] = [
  // Key lifts (exactamente 4) — también básicos
  ex(E.squat, 'Sentadilla con barra', 'squat', 'barbell', 5, { is_basic: true, is_key_lift: true, substitutes: [E.legPress, E.gobletSquat] }),
  ex(E.bench, 'Press de banca con barra', 'push_h', 'barbell', 2.5, { is_basic: true, is_key_lift: true, substitutes: [E.inclineDbPress, E.machineChestPress] }),
  ex(E.deadlift, 'Peso muerto', 'hinge', 'barbell', 5, { is_basic: true, is_key_lift: true, substitutes: [E.rdl, E.hipThrust] }),
  ex(E.chestRow, 'Remo con pecho apoyado', 'pull_h', 'machine', 5, { is_basic: true, is_key_lift: true, substitutes: [E.cableRow, E.kbRow] }),
  // Básicos (bloqueo de RIR 0) sin ser key lift
  ex(E.rdl, 'Peso muerto rumano', 'hinge', 'barbell', 5, { is_basic: true, substitutes: [E.legCurl, E.hipThrust] }),
  ex(E.dbShoulderPress, 'Press militar con mancuernas, sentado', 'push_v', 'dumbbell', 2, { is_basic: true, substitutes: [E.lateralRaise] }),
  ex(E.inclineDbPress, 'Press inclinado con mancuernas', 'push_h', 'dumbbell', 2, { is_basic: true, substitutes: [E.machineChestPress, E.bench] }),
  ex(E.assistedPullup, 'Dominadas asistidas o jalón agarre neutro', 'pull_v', 'machine', 5, { is_basic: true, substitutes: [E.latPulldown] }),
  // Accesorios
  ex(E.legPress, 'Prensa', 'squat', 'machine', 5, { substitutes: [E.bulgarian] }),
  ex(E.legCurl, 'Curl femoral', 'hinge', 'machine', 5),
  ex(E.calfStanding, 'Pantorrilla de pie', 'calf', 'machine', 5, { substitutes: [E.calfSeated] }),
  ex(E.plank, 'Plancha', 'core', 'bodyweight', 0),
  ex(E.latPulldown, 'Jalón al pecho', 'pull_v', 'cable', 2.5, { substitutes: [E.assistedPullup] }),
  ex(E.lateralRaise, 'Elevaciones laterales', 'push_v', 'dumbbell', 2),
  ex(E.tricepsPushdown, 'Tríceps en polea', 'arms', 'cable', 2.5, { substitutes: [E.overheadTriceps] }),
  ex(E.dbCurl, 'Curl con mancuerna', 'arms', 'dumbbell', 2, { substitutes: [E.hammerCurl] }),
  ex(E.bulgarian, 'Sentadilla búlgara', 'single_leg', 'dumbbell', 2, { substitutes: [E.legPress] }),
  ex(E.hipThrust, 'Hip thrust con barra', 'glute', 'barbell', 5, { substitutes: [E.rdl] }),
  ex(E.legExtension, 'Extensión de cuádriceps', 'squat', 'machine', 5),
  ex(E.calfSeated, 'Pantorrilla sentado', 'calf', 'machine', 5, { substitutes: [E.calfStanding] }),
  ex(E.cableCrunch, 'Crunch en polea', 'core', 'cable', 2.5, { substitutes: [E.plank] }),
  ex(E.cableRow, 'Remo en polea sentado', 'pull_h', 'cable', 2.5, { substitutes: [E.chestRow] }),
  ex(E.machineChestPress, 'Press de pecho en máquina', 'push_h', 'machine', 5),
  ex(E.facePull, 'Face pull', 'pull_h', 'cable', 2.5),
  ex(E.hammerCurl, 'Curl martillo', 'arms', 'dumbbell', 2, { substitutes: [E.dbCurl] }),
  ex(E.overheadTriceps, 'Tríceps sobre la cabeza', 'arms', 'dumbbell', 2, { substitutes: [E.tricepsPushdown] }),
  // Versión mínima en casa
  ex(E.gobletSquat, 'Sentadilla goblet con kettlebell', 'squat', 'kettlebell', 4),
  ex(E.kbRow, 'Remo con kettlebell', 'pull_h', 'kettlebell', 4),
  ex(E.pushup, 'Lagartijas', 'push_h', 'bodyweight', 0),
  ex(E.kbSwing, 'Swings con kettlebell', 'hinge', 'kettlebell', 4),
]

// ───────────────────────── Plantillas y programa ─────────────────────────

const BASIC_REST = 150
const ACC_REST = 75
const te = (exercise_id: string, order: number, sets: number, reps_min: number, reps_max: number,
  target_rir: number, rest_s: number, in_short: boolean, in_minimal: boolean): TemplateExercise =>
  ({ exercise_id, order, sets, reps_min, reps_max, target_rir, rest_s, in_short, in_minimal })

export const seedTemplates: Seedable<WorkoutTemplate>[] = [
  {
    id: S.templates.legA, name: 'Pierna A', order_in_rotation: 0,
    exercises: [
      te(E.squat, 1, 3, 6, 8, 2, BASIC_REST, true, true),
      te(E.rdl, 2, 3, 8, 10, 2, BASIC_REST, true, true),
      te(E.legPress, 3, 2, 10, 15, 1, ACC_REST, true, false),
      te(E.legCurl, 4, 3, 10, 15, 1, ACC_REST, false, false),
      te(E.calfStanding, 5, 3, 10, 15, 1, 60, false, false),
      te(E.plank, 6, 3, 30, 45, 1, 60, false, false), // reps = segundos
    ],
  },
  {
    id: S.templates.upperA, name: 'Torso A', order_in_rotation: 1,
    exercises: [
      te(E.bench, 1, 3, 6, 8, 2, BASIC_REST, true, true),
      te(E.chestRow, 2, 3, 8, 12, 2, BASIC_REST, true, true),
      te(E.dbShoulderPress, 3, 3, 8, 12, 2, BASIC_REST, true, false),
      te(E.latPulldown, 4, 3, 10, 12, 1, ACC_REST, false, false),
      te(E.lateralRaise, 5, 3, 12, 20, 1, 60, false, false),
      te(E.tricepsPushdown, 6, 2, 10, 15, 1, 60, false, false),
      te(E.dbCurl, 7, 2, 10, 15, 1, 60, false, false),
    ],
  },
  {
    id: S.templates.legB, name: 'Pierna B', order_in_rotation: 2,
    exercises: [
      te(E.deadlift, 1, 3, 4, 6, 2, 180, true, true),
      te(E.bulgarian, 2, 3, 8, 12, 2, ACC_REST, true, true),
      te(E.hipThrust, 3, 3, 8, 12, 1, BASIC_REST, true, false),
      te(E.legExtension, 4, 2, 12, 15, 1, ACC_REST, false, false),
      te(E.calfSeated, 5, 3, 12, 15, 1, 60, false, false),
      te(E.cableCrunch, 6, 3, 10, 15, 1, 60, false, false),
    ],
  },
  {
    id: S.templates.upperB, name: 'Torso B', order_in_rotation: 3,
    exercises: [
      te(E.inclineDbPress, 1, 3, 8, 12, 2, BASIC_REST, true, true),
      te(E.assistedPullup, 2, 3, 6, 10, 2, BASIC_REST, true, true),
      te(E.cableRow, 3, 3, 10, 12, 1, ACC_REST, true, false),
      te(E.machineChestPress, 4, 2, 10, 15, 1, ACC_REST, false, false),
      te(E.facePull, 5, 3, 12, 20, 1, 60, false, false),
      te(E.hammerCurl, 6, 2, 10, 15, 1, 60, false, false),
      te(E.overheadTriceps, 7, 2, 10, 15, 1, 60, false, false),
    ],
  },
]

export const seedProgram: Seedable<Program> = {
  id: S.program,
  name: 'Recomposición oct 2026 – ene 2027',
  rotation: [S.templates.legA, S.templates.upperA, S.templates.legB, S.templates.upperB],
  rotation_cursor: 0,
  suggested_weekdays: [1, 2, 4, 5],
  deload_windows: [{ start: '2026-11-23', end: '2026-11-29' }],
  active: true,
}

// ───────────────────────── Alimentos ─────────────────────────

const F = S.foods
type Fd = Seedable<Food>
interface Macro { p: number; k: number; f: number; c: number; fi?: number }
const food = (id: string, name: string, category: Food['category'], portion_label: string, store: Food['store'],
  purchase_unit: string, portions_per_unit: number, m: Macro | null,
  extra: Partial<Pick<Food, 'portion_g' | 'perishable_days' | 'lactose_free'>> = {}): Fd => {
  const base: Fd = {
    id, name, category, portion_label, store, purchase_unit, portions_per_unit,
    nutrition_status: m ? 'estimated' : 'missing',
    lactose_free: extra.lactose_free ?? true,
  }
  if (m) {
    base.protein_g = m.p; base.kcal = m.k; base.fat_g = m.f; base.carb_g = m.c
    if (m.fi !== undefined) base.fiber_g = m.fi
  }
  if (extra.portion_g !== undefined) base.portion_g = extra.portion_g
  if (extra.perishable_days !== undefined) base.perishable_days = extra.perishable_days
  return base
}

export const seedFoods: Fd[] = [
  // Suplementos
  food(F.iso, 'Mutant ISO (proteína aislada)', 'supplement', '1 scoop', 'super', 'bote', 60, null),
  food(F.creatine, 'Creatina monohidratada', 'supplement', '5 g', 'costco', 'bote 600 g', 120, { p: 0, k: 0, f: 0, c: 0 }),
  // Lácteos
  food(F.greekYogurt, 'Yogur griego natural sin azúcar', 'dairy', '200 g', 'costco', 'envase 1 kg', 5, { p: 20, k: 130, f: 5, c: 7 }, { portion_g: 200, perishable_days: 21, lactose_free: false }),
  food(F.milkLf, 'Leche deslactosada light', 'dairy', '300 ml', 'costco', 'caja 1 L', 3.3, { p: 10, k: 130, f: 3, c: 15 }, { perishable_days: 120 }),
  // Fruta y verdura
  food(F.strawberries, 'Fresas congeladas', 'produce', '150 g', 'costco', 'bolsa 2 kg', 13, { p: 1, k: 50, f: 0.5, c: 11, fi: 3 }, { portion_g: 150 }),
  food(F.banana, 'Plátano', 'produce', '1 pieza', 'market', 'pieza', 1, { p: 1.3, k: 105, f: 0.4, c: 27, fi: 3 }, { perishable_days: 6 }),
  food(F.apple, 'Manzana', 'produce', '1 pieza', 'market', 'pieza', 1, { p: 0.5, k: 95, f: 0.3, c: 25, fi: 4 }, { perishable_days: 14 }),
  food(F.nopales, 'Nopales', 'produce', '100 g', 'market', 'kg', 10, { p: 1.5, k: 20, f: 0, c: 3, fi: 2 }, { portion_g: 100, perishable_days: 7 }),
  food(F.salad, 'Ensalada (lechuga, jitomate, pepino)', 'produce', '200 g', 'market', 'kg', 5, { p: 2, k: 35, f: 0.3, c: 7, fi: 3 }, { portion_g: 200, perishable_days: 5 }),
  food(F.avocado, 'Aguacate', 'fat', '¼ pieza', 'market', 'pieza', 4, { p: 1, k: 65, f: 6, c: 3, fi: 3 }, { perishable_days: 5 }),
  food(F.onion, 'Cebolla', 'produce', '100 g', 'market', 'kg', 10, { p: 1, k: 40, f: 0, c: 9, fi: 2 }, { portion_g: 100, perishable_days: 21 }),
  food(F.frozenVeg, 'Verdura congelada (brócoli o mezcla)', 'produce', '150 g', 'costco', 'bolsa 1.5 kg', 10, { p: 4, k: 55, f: 0.5, c: 10, fi: 4 }, { portion_g: 150 }),
  // Carbohidratos
  food(F.oats, 'Avena', 'carb', '40 g', 'costco', 'bolsa 4.5 kg', 112, { p: 5, k: 150, f: 3, c: 27, fi: 4 }, { portion_g: 40 }),
  food(F.tortilla, 'Tortilla de maíz', 'carb', '1 pieza (30 g)', 'market', 'kg', 33, { p: 1.5, k: 65, f: 1, c: 13, fi: 1.5 }, { portion_g: 30, perishable_days: 4 }),
  food(F.rice, 'Arroz cocido', 'carb', '150 g', 'costco', 'bolsa 900 g crudo', 18, { p: 4, k: 195, f: 0.5, c: 42 }, { portion_g: 150, perishable_days: 4 }),
  food(F.beans, 'Frijoles cocidos', 'carb', '½ taza (120 g)', 'costco', 'lata 430 g', 3.5, { p: 7, k: 110, f: 0.5, c: 20, fi: 7 }, { portion_g: 120 }),
  food(F.tostadas, 'Tostadas horneadas', 'carb', '1 pieza', 'costco', 'paquete 48', 48, { p: 1, k: 35, f: 0.5, c: 7 }),
  food(F.potato, 'Papa cocida', 'carb', '80 g', 'market', 'kg', 12, { p: 1.5, k: 70, f: 0, c: 16 }, { portion_g: 80, perishable_days: 21 }),
  // Grasas
  food(F.peanutButter, 'Crema de cacahuate natural', 'fat', '15 g', 'costco', 'frasco 794 g', 53, { p: 4, k: 90, f: 8, c: 3 }, { portion_g: 15 }),
  food(F.almonds, 'Almendras', 'fat', '15 piezas (18 g)', 'costco', 'bolsa 1.36 kg', 75, { p: 4, k: 105, f: 9, c: 4, fi: 2 }, { portion_g: 18 }),
  // Proteínas
  food(F.egg, 'Huevo', 'protein', '1 pieza', 'costco', 'charola 30', 30, { p: 6, k: 70, f: 5, c: 0.5 }, { perishable_days: 30 }),
  food(F.eggWhites, 'Claras de huevo', 'protein', '150 g', 'super', 'envase 1 L', 6.6, { p: 16, k: 75, f: 0, c: 1 }, { portion_g: 150, perishable_days: 7 }),
  food(F.chicken, 'Pechuga de pollo (cocida)', 'protein', '170 g cocido', 'costco', 'bolsa 2.26 kg', 13, { p: 53, k: 280, f: 6, c: 0 }, { portion_g: 170 }),
  food(F.porkLoin, 'Lomo de cerdo (cocido)', 'protein', '170 g cocido', 'costco', 'paquete 1.5 kg', 8, { p: 50, k: 330, f: 13, c: 0 }, { portion_g: 170 }),
  food(F.beefSteak, 'Bistec de res (cocido)', 'protein', '150 g cocido', 'costco', 'kg', 5, { p: 42, k: 300, f: 14, c: 0 }, { portion_g: 150 }),
  food(F.tuna, 'Atún en agua', 'protein', '1 lata (130 g)', 'costco', 'paquete 10 latas', 10, { p: 20, k: 90, f: 1, c: 0 }),
  food(F.chickenCan, 'Pechuga de pollo en lata', 'protein', '½ lata (177 g)', 'costco', 'paquete 6 latas', 12, { p: 40, k: 180, f: 3, c: 0 }),
]

// ───────────────────────── Equivalencias (del protocolo) ─────────────────────────
// Los deltas se calculan en tiempo de ejecución (Fase 8.6) a partir de los Food vigentes;
// no se cachean en el seed para no fijar valores que el usuario puede corregir.

type Eq = Seedable<FoodEquivalent>
let eqN = 0
const eq = (food_id: string, substitute_food_id: string, ratio: number, priority: number): Eq =>
  ({ id: `eq_${++eqN}_${food_id}_${substitute_food_id}`, food_id, substitute_food_id, ratio, priority })

export const seedEquivalents: Eq[] = [
  // Proteínas (100 g pollo = 100 g lomo = 1 lata atún + 1 huevo → en porciones)
  eq(F.chicken, F.porkLoin, 1, 1),
  eq(F.chicken, F.chickenCan, 1.3, 2),
  eq(F.chicken, F.tuna, 2, 3),
  eq(F.chicken, F.beefSteak, 1.2, 4),
  eq(F.porkLoin, F.chicken, 1, 1),
  eq(F.porkLoin, F.beefSteak, 1.2, 2),
  eq(F.beefSteak, F.chicken, 0.9, 1),
  eq(F.beefSteak, F.tuna, 2, 2),
  eq(F.tuna, F.chicken, 0.4, 1),
  eq(F.tuna, F.chickenCan, 0.5, 2),
  eq(F.tuna, F.egg, 1, 3),
  // Lácteos / proteína en polvo
  eq(F.greekYogurt, F.iso, 0.5, 1),
  eq(F.greekYogurt, F.milkLf, 1, 2),
  eq(F.milkLf, F.greekYogurt, 0.5, 1),
  eq(F.iso, F.greekYogurt, 1.5, 1),
  eq(F.iso, F.egg, 4, 2),
  // Carbohidratos (30 g tortilla = 25 g arroz cocido = 80 g papa, según protocolo)
  eq(F.tortilla, F.rice, 25 / 150, 1),
  eq(F.tortilla, F.potato, 1, 2),
  eq(F.rice, F.tortilla, 150 / 25, 1),
  eq(F.rice, F.potato, 150 / 25, 2),
  eq(F.oats, F.tortilla, 1.3, 1),
  // Fruta y verdura
  eq(F.strawberries, F.banana, 0.5, 1),
  eq(F.banana, F.strawberries, 2, 1),
  eq(F.banana, F.apple, 1, 2),
  eq(F.apple, F.banana, 1, 1),
  eq(F.nopales, F.frozenVeg, 0.7, 1),
  eq(F.salad, F.frozenVeg, 1, 1),
  eq(F.frozenVeg, F.salad, 1, 1),
  eq(F.tostadas, F.tortilla, 0.5, 1),
  eq(F.tortilla, F.tostadas, 2, 3),
  // Grasas
  eq(F.almonds, F.peanutButter, 1, 1),
  eq(F.peanutButter, F.almonds, 1, 1),
  eq(F.avocado, F.almonds, 0.6, 1),
]

// ───────────────────────── Recetas ─────────────────────────

const R = S.recipes
type Rc = Seedable<Recipe>
const rc = (id: string, name: string, prep_min: number, items: Array<[string, number]>, emergency = false): Rc =>
  ({ id, name, prep_min, items: items.map(([food_id, portions]) => ({ food_id, portions })), emergency })

export const seedRecipes: Rc[] = [
  rc(R.smoothie, 'Licuado (ISO, yogur, leche, fresas, plátano, avena)', 5,
    [[F.iso, 1], [F.greekYogurt, 1], [F.milkLf, 1], [F.strawberries, 1], [F.banana, 1], [F.oats, 1]]),
  rc(R.bowl, 'Bowl de yogur griego con ISO', 5,
    [[F.greekYogurt, 1.25], [F.iso, 1], [F.strawberries, 1], [F.oats, 1], [F.peanutButter, 1], [F.banana, 0.5]]),
  rc(R.eggs, 'Huevos con claras y nopales', 10,
    [[F.egg, 3], [F.eggWhites, 1], [F.nopales, 1], [F.tortilla, 3], [F.apple, 1]]),
  rc(R.lunchChicken, 'Comida: pollo, arroz, frijoles, ensalada', 5,
    [[F.chicken, 1], [F.rice, 1], [F.beans, 1], [F.salad, 1], [F.avocado, 1]]),
  rc(R.lunchPork, 'Comida: lomo, arroz, frijoles, ensalada', 5,
    [[F.porkLoin, 1], [F.rice, 1], [F.beans, 1], [F.salad, 1], [F.avocado, 1]]),
  rc(R.lunchTuna, 'Comida: atún, arroz, frijoles, ensalada', 5,
    [[F.tuna, 2], [F.rice, 1], [F.beans, 1], [F.salad, 1], [F.avocado, 1]]),
  rc(R.snack, 'Snack: shaker ISO + creatina, plátano, almendras', 1,
    [[F.iso, 1], [F.creatine, 1], [F.banana, 1], [F.almonds, 1]]),
  rc(R.dinnerBeef, 'Cena: tacos de bistec con nopales', 15,
    [[F.beefSteak, 1], [F.tortilla, 3], [F.nopales, 1], [F.onion, 1]]),
  rc(R.dinnerChicken, 'Cena: tacos de pollo con nopales', 12,
    [[F.chicken, 1], [F.tortilla, 3], [F.nopales, 1], [F.onion, 1]]),
  rc(R.dinnerTuna, 'Cena: tostadas de atún', 5,
    [[F.tuna, 2], [F.tostadas, 3], [F.onion, 1]]),
  rc(R.emergency, 'Emergencia: atún, tostadas y shaker', 3,
    [[F.tuna, 2], [F.tostadas, 3], [F.iso, 1]], true),
]

// ───────────────────────── Menú semanal (PLANIFICADO) ─────────────────────────

const GYM_DAYS = new Set([1, 2, 4, 5])
export const seedMealPlans: Seedable<MealPlan>[] = []
for (let weekday = 0; weekday <= 6; weekday++) {
  const breakfast = weekday === 0 || weekday === 6 ? R.bowl : R.smoothie
  const lunch = [1, 3, 5].includes(weekday) ? R.lunchChicken : [2, 6].includes(weekday) ? R.lunchPork : R.lunchTuna
  const dinner = [1, 2, 4, 6].includes(weekday) ? R.dinnerBeef : [3, 5].includes(weekday) ? R.dinnerChicken : R.dinnerTuna
  seedMealPlans.push(
    { id: `mp_${weekday}_breakfast`, weekday, slot: 'breakfast', recipe_id: breakfast, time: '06:30' },
    { id: `mp_${weekday}_lunch`, weekday, slot: 'lunch', recipe_id: lunch, time: '14:00' },
    { id: `mp_${weekday}_snack`, weekday, slot: 'snack', recipe_id: R.snack, time: '17:00' },
    { id: `mp_${weekday}_dinner`, weekday, slot: 'dinner', recipe_id: dinner, time: GYM_DAYS.has(weekday) ? '19:45' : '19:30' },
  )
}

// ───────────────────────── Metas ─────────────────────────

export const seedGoal: Seedable<Goal> = {
  id: S.goal,
  kind: 'recomposition',
  start_date: '2026-10-01',
  end_date: '2027-01-31',
  target_fat_pct_range: [31, 34],
  target_weight_kg_range: [108, 112],
  description: 'Perder grasa conservando o ganando músculo, fuerza y condición; hábitos sostenibles.',
}

export const seedMonthlyGoals: Seedable<MonthlyGoal>[] = [
  { id: 'mg_2026-10', month: '2026-10', weight_pct_range: [-1.5, -4], waist_delta_cm_range: [-2, -4], steps_target: 9000, strength_sessions: 4, cardio_sessions: 2, focus_text: 'Establecer: 3 comidas con proteína, pesarte diario, acostarte 22:45.' },
  { id: 'mg_2026-11', month: '2026-11', weight_pct_range: [-4, -7], waist_delta_cm_range: [-4, -6], steps_target: 10000, strength_sessions: 4, cardio_sessions: 3, focus_text: 'Progresar: cocinar por lote 2 veces por semana; proteína 6 de 7 días.' },
  { id: 'mg_2026-12', month: '2026-12', weight_pct_range: [-5, -8.5], waist_delta_cm_range: [-5, -8], steps_target: 9000, strength_sessions: 4, cardio_sessions: 3, focus_text: 'Consolidar: nunca dos fallos seguidos; mantenimiento permitido 24–25 y 31 dic.' },
  { id: 'mg_2027-01', month: '2027-01', weight_pct_range: [-6.5, -10], waist_delta_cm_range: [-7, -10], steps_target: 10000, strength_sessions: 4, cardio_sessions: 4, focus_text: 'Evaluar: prueba de fuerza la última semana; revisión completa y bloque siguiente.' },
]
