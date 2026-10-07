/**
 * Schemas Zod de las 33 colecciones (Fase 8.3).
 * Reglas:
 *  - Validan tipos, enums, obligatorios, rangos, fechas, ids, arrays, nullables y relaciones INTERNAS
 *    del objeto (reps_min ≤ reps_max, start ≤ end, cursor dentro de la rotación…).
 *  - NO contienen reglas de negocio (progresión, adherencia, bloqueos): eso vive en los servicios.
 *  - Claves desconocidas se toleran (formato aditivo entre versiones) pero no se validan.
 *  - `satisfies z.ZodType<Entidad>` garantiza que el schema y el tipo TS no se separen.
 */
import { z } from 'zod'
import type * as T from '@domain/entities'
import { COLLECTIONS, EQUIPMENT, MOVEMENT_PATTERNS, MUSCLES, BOOK_SOURCE, type CollectionName } from '@domain/entities'
import {
  baseEntitySchema, blobSchema, dayStringSchema, hourStringSchema, idSchema, isoDateTimeSchema, monthStringSchema,
  nonNegative, nonNegativeInt, orderedRange, positive, positiveInt, scale1to3, scale1to5,
} from './primitives'

const B = baseEntitySchema

// ───────────────────────── Usuario y configuración ─────────────────────────

export const userSchema = B.extend({
  name: z.string().min(1),
  sex: z.enum(['male', 'female']),
  birth_date: dayStringSchema.optional(),
  height_cm: z.number().min(100).max(250),
  device_id: z.string().min(1),
}) satisfies z.ZodType<T.User>

export const scheduleSchema = z.object({
  wake: hourStringSchema, breakfast: hourStringSchema, row: hourStringSchema, work: hourStringSchema,
  lunch: hourStringSchema, snack: hourStringSchema, gym: hourStringSchema, dinner: hourStringSchema, lights: hourStringSchema,
}) satisfies z.ZodType<T.Schedule>

export const equipmentItemSchema = z.enum(EQUIPMENT)
export const movementPatternSchema = z.enum(MOVEMENT_PATTERNS)
export const muscleSchema = z.enum(MUSCLES)

export const equipmentProfileSchema = z.object({
  name: z.string().min(1),
  items: z.array(equipmentItemSchema),
  max_load_kg: positive.optional(),
}) satisfies z.ZodType<T.EquipmentProfile>

export const settingsSchema = B.extend({
  kcal_target: z.number().int().min(800).max(6000),
  protein_target_g: z.number().min(0).max(500),
  protein_floor_g: z.number().min(0).max(500),
  fat_g_range: orderedRange(nonNegative),
  carb_g_range: orderedRange(nonNegative),
  steps_target: nonNegativeInt,
  schedule: scheduleSchema,
  gym_slot: z.enum(['morning', 'evening']),
  increments: z.object({ barbell_leg: positive, barbell_upper: positive, dumbbell: positive, machine: positive }),
  rest_s: z.object({ basic: positiveInt, accessory: positiveInt }),
  theme: z.enum(['system', 'light', 'dark']),
  units: z.literal('metric'),
  equipment_profiles: z.record(z.string(), equipmentProfileSchema).optional(),
  active_equipment_profile: z.string().optional(),
  effective_from: dayStringSchema,
  change_origin: z.enum(['seed', 'recommendation', 'manual']),
  recommendation_decision_id: idSchema.optional(),
}).refine(s => s.protein_floor_g <= s.protein_target_g, { message: 'protein_floor_g debe ser ≤ protein_target_g', path: ['protein_floor_g'] })
  .refine(s => !s.active_equipment_profile || !s.equipment_profiles || s.active_equipment_profile in s.equipment_profiles,
    { message: 'active_equipment_profile no existe en equipment_profiles', path: ['active_equipment_profile'] }) satisfies z.ZodType<T.Settings>

export const baselineSchema = B.extend({
  weight_avg_kg: positive.optional(),
  weight_samples: z.array(dayStringSchema),
  closed: z.boolean(),
  waist_cm: positive.optional(),
  waist_date: dayStringSchema.optional(),
  photos_complete: z.boolean(),
  bia_fat_pct: z.number().min(0).max(100).optional(),
  bia_ffm_kg: positive.optional(),
  bia_date: dayStringSchema.optional(),
}) satisfies z.ZodType<T.Baseline>

// ───────────────────────── Cuerpo y día ─────────────────────────

export const dailyCheckInSchema = B.extend({
  date: dayStringSchema,
  weight_kg: z.number().min(20).max(400).optional(),
  sleep_bucket: z.enum(['<6', '6-7', '7-8', '8+']).optional(),
  energy: scale1to5.optional(),
  mood: scale1to5.optional(),
  hunger: scale1to5.optional(),
  food_yesterday: z.enum(['plan', 'almost', 'off']).optional(),
  steps_yesterday: nonNegativeInt.optional(),
  steps_source: z.enum(['shortcut', 'manual']).optional(),
  irregular: z.boolean(),
  irregular_protein_g: nonNegative.optional(),
  irregular_food: z.enum(['low', 'normal', 'high']).optional(),
  irregular_activity: z.enum(['none', 'walk', 'train']).optional(),
  lights_off_done: z.boolean().optional(),
  note: z.string().optional(),
}) satisfies z.ZodType<T.DailyCheckIn>

export const bodyMeasurementSchema = B.extend({
  date: dayStringSchema,
  type: z.enum(['waist', 'bia']),
  waist_cm: positive.optional(),
  bia_weight_kg: positive.optional(),
  bia_fat_pct: z.number().min(0).max(100).optional(),
  bia_ffm_kg: positive.optional(),
  bia_muscle_kg: positive.optional(),
  bia_visceral: nonNegative.optional(),
  bia_bmr: positive.optional(),
}).refine(m => m.type !== 'waist' || m.waist_cm !== undefined, { message: 'Una medición de cintura requiere waist_cm', path: ['waist_cm'] }) satisfies z.ZodType<T.BodyMeasurement>

export const progressPhotoSchema = B.extend({
  date: dayStringSchema,
  month: monthStringSchema,
  view: z.enum(['front', 'side', 'back']),
  blob: blobSchema,
  thumb: blobSchema,
  width: positiveInt,
  height: positiveInt,
  bytes: nonNegativeInt,
}) satisfies z.ZodType<T.ProgressPhoto>

// ───────────────────────── Entrenamiento ─────────────────────────

export const programSchema = B.extend({
  name: z.string().min(1),
  rotation: z.array(idSchema).min(1),
  rotation_cursor: nonNegativeInt,
  suggested_weekdays: z.array(z.number().int().min(0).max(6)),
  deload_windows: z.array(z.object({ start: dayStringSchema, end: dayStringSchema }).refine(w => w.start <= w.end, { message: 'start ≤ end' })),
  active: z.boolean(),
}).refine(p => p.rotation_cursor < p.rotation.length, { message: 'rotation_cursor fuera de la rotación', path: ['rotation_cursor'] }) satisfies z.ZodType<T.Program>

export const templateExerciseSchema = z.object({
  exercise_id: idSchema,
  order: nonNegativeInt,
  sets: positiveInt,
  reps_min: positiveInt,
  reps_max: positiveInt,
  target_rir: z.number().int().min(0).max(4),
  rest_s: positiveInt,
  in_short: z.boolean(),
  in_minimal: z.boolean(),
}).refine(t => t.reps_min <= t.reps_max, { message: 'reps_min ≤ reps_max', path: ['reps_max'] })
  .refine(t => !t.in_minimal || t.in_short, { message: 'in_minimal implica in_short', path: ['in_minimal'] }) satisfies z.ZodType<T.TemplateExercise>

export const workoutTemplateSchema = B.extend({
  name: z.string().min(1),
  order_in_rotation: nonNegativeInt,
  exercises: z.array(templateExerciseSchema).min(1),
}) satisfies z.ZodType<T.WorkoutTemplate>

const provenanceSchema = z.enum(['direct', 'derived', 'manual'])

export const exerciseSchema = B.extend({
  name: z.string().min(1),
  pattern: z.enum(['squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'single_leg', 'calf', 'core', 'arms', 'glute']),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell']),
  increment_kg: nonNegative,
  is_basic: z.boolean(),
  is_key_lift: z.boolean(),
  substitutes: z.array(idSchema),
  // v2 (catálogo), todo opcional
  aliases: z.array(z.string()).optional(),
  category: z.enum(['legs', 'back', 'chest', 'shoulders', 'arms', 'core', 'dynamic']).optional(),
  body_region: z.enum(['lower', 'upper', 'core', 'full']).optional(),
  movement_patterns: z.array(movementPatternSchema).optional(),
  primary_muscles: z.array(muscleSchema).optional(),
  secondary_muscles: z.array(muscleSchema).optional(),
  stabilizers: z.array(muscleSchema).optional(),
  equipment_list: z.array(equipmentItemSchema).optional(),
  unilateral: z.boolean().optional(),
  compound: z.boolean().optional(),
  functional_rating: scale1to5.optional(),
  technical_complexity: scale1to3.optional(),
  stability_demand: scale1to3.optional(),
  skill_demand: scale1to3.optional(),
  default_rep_range: orderedRange(positiveInt).optional(),
  default_rest_seconds: positiveInt.optional(),
  substitute_group_ids: z.array(idSchema).optional(),
  catalog_source: z.enum([BOOK_SOURCE, 'manual']).optional(),
  source_page: positiveInt.optional(),
  source_confidence: provenanceSchema.optional(),
  field_provenance: z.record(z.string(), provenanceSchema).optional(),
  description: z.string().optional(),
  setup_cues: z.array(z.string()).optional(),
  execution_cues: z.array(z.string()).optional(),
  common_errors: z.array(z.string()).optional(),
  safety_notes: z.array(z.string()).optional(),
  variations: z.array(z.string()).optional(),
  regressions: z.array(idSchema).optional(),
  progressions: z.array(idSchema).optional(),
  short_card: z.string().optional(),
}) satisfies z.ZodType<T.Exercise>

export const workoutSessionSchema = B.extend({
  template_id: idSchema,
  date: dayStringSchema,
  started_at: isoDateTimeSchema,
  finished_at: isoDateTimeSchema.optional(),
  status: z.enum(['open', 'completed', 'abandoned']),
  version: z.enum(['full', 'short', 'minimal']),
  time_mode: positiveInt.optional(),
  sleep_short_suggested: z.boolean(),
  substitutions: z.array(z.object({
    original_exercise_id: idSchema, substitute_exercise_id: idSchema,
    reason: z.enum(['equipment', 'pain', 'preference', 'other']).optional(),
  }).refine(s => s.original_exercise_id !== s.substitute_exercise_id, { message: 'Un ejercicio no puede sustituirse a sí mismo' })).optional(),
  duration_s: nonNegativeInt.optional(),
  tonnage_kg: nonNegative.optional(),
  note: z.string().optional(),
}).refine(s => s.status === 'open' || s.finished_at !== undefined, { message: 'Una sesión cerrada requiere finished_at', path: ['finished_at'] })
  .refine(s => !s.finished_at || s.finished_at >= s.started_at, { message: 'finished_at ≥ started_at', path: ['finished_at'] }) satisfies z.ZodType<T.WorkoutSession>

export const exerciseSetSchema = B.extend({
  session_id: idSchema,
  exercise_id: idSchema,
  set_number: positiveInt,
  weight_kg: nonNegative,
  reps: nonNegativeInt,
  rir: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  target_reps_min: positiveInt,
  target_reps_max: positiveInt,
  target_rir: z.number().int().min(0).max(4),
  pain_flag: z.boolean(),
  technique_flag: z.boolean(),
  is_warmup: z.boolean(),
  completed_at: isoDateTimeSchema,
}).refine(s => s.target_reps_min <= s.target_reps_max, { message: 'target_reps_min ≤ target_reps_max', path: ['target_reps_max'] }) satisfies z.ZodType<T.ExerciseSet>

export const cardioSessionSchema = B.extend({
  date: dayStringSchema,
  modality: z.enum(['row', 'walk', 'other']),
  preset: z.enum(['z2_20', 'z2_25', 'z2_30', 'intervals_6x1', 'intervals_8x1']).optional(),
  duration_s: positiveInt,
  distance_m: nonNegative.optional(),
  split_s_per_500m: positive.optional(),
  spm: positive.optional(),
  hr_avg: z.number().min(30).max(250).optional(),
  rpe: z.number().int().min(1).max(10),
  note: z.string().optional(),
}) satisfies z.ZodType<T.CardioSession>

export const monthlyTestSchema = B.extend({
  date: dayStringSchema,
  month: monthStringSchema,
  duration_s: positiveInt,
  distance_m: positive,
  split_avg_s: positive,
  spm: positive.optional(),
  hr_avg: z.number().min(30).max(250).optional(),
  watts_avg: positive.optional(),
}).refine(t => t.date.startsWith(t.month), { message: 'month debe coincidir con date', path: ['month'] }) satisfies z.ZodType<T.MonthlyTest>

// ───────────────────────── Comida e inventario ─────────────────────────

export const storeSchema = z.enum(['costco', 'super', 'market'])
export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'snack', 'dinner'])

export const foodSchema = B.extend({
  name: z.string().min(1),
  category: z.enum(['protein', 'dairy', 'produce', 'carb', 'fat', 'supplement', 'other']),
  portion_label: z.string().min(1),
  portion_g: positive.optional(),
  protein_g: nonNegative.optional(),
  kcal: nonNegative.optional(),
  fat_g: nonNegative.optional(),
  carb_g: nonNegative.optional(),
  fiber_g: nonNegative.optional(),
  nutrition_status: z.enum(['verified', 'estimated', 'missing']),
  store: storeSchema,
  purchase_unit: z.string().min(1),
  portions_per_unit: positive,
  perishable_days: positiveInt.optional(),
  lactose_free: z.boolean(),
}).refine(f => f.nutrition_status === 'missing' || (f.protein_g !== undefined && f.kcal !== undefined),
  { message: "Un alimento 'verified' o 'estimated' requiere protein_g y kcal", path: ['nutrition_status'] }) satisfies z.ZodType<T.Food>

export const foodEquivalentSchema = B.extend({
  food_id: idSchema,
  substitute_food_id: idSchema,
  ratio: positive,
  protein_delta_g: z.number().finite().optional(),
  kcal_delta: z.number().finite().optional(),
  priority: nonNegativeInt,
}).refine(e => e.food_id !== e.substitute_food_id, { message: 'Un alimento no puede sustituirse a sí mismo', path: ['substitute_food_id'] }) satisfies z.ZodType<T.FoodEquivalent>

export const recipeSchema = B.extend({
  name: z.string().min(1),
  items: z.array(z.object({ food_id: idSchema, portions: positive })).min(1),
  prep_min: nonNegativeInt,
  protein_g: nonNegative.optional(),
  kcal: nonNegative.optional(),
  emergency: z.boolean(),
}) satisfies z.ZodType<T.Recipe>

export const mealPlanSchema = B.extend({
  weekday: z.number().int().min(0).max(6),
  slot: mealSlotSchema,
  recipe_id: idSchema,
  time: hourStringSchema,
}) satisfies z.ZodType<T.MealPlan>

export const mealLogSchema = B.extend({
  date: dayStringSchema,
  slot: mealSlotSchema,
  status: z.enum(['planned', 'substituted', 'adapted', 'off_plan', 'emergency', 'skipped']),
  recipe_id: idSchema.optional(),
  substitutions: z.array(z.object({ food_id: idSchema, substitute_food_id: idSchema, portions: positive })).optional(),
  protein_g_est: nonNegative.optional(),
  kcal_est: nonNegative.optional(),
  est_complete: z.boolean(),
  off_plan_protein_g: nonNegative.nullable().optional(),
  time_mode: positiveInt.optional(),
  note: z.string().max(200).optional(),
  logged_at: isoDateTimeSchema,
}).refine(l => l.status === 'off_plan' || l.status === 'skipped' || l.recipe_id !== undefined,
  { message: 'Una comida del plan, sustituida, adaptada o de emergencia requiere recipe_id', path: ['recipe_id'] }) satisfies z.ZodType<T.MealLog>

export const inventoryItemSchema = B.extend({
  food_id: idSchema,
  portions_left: z.number().finite(),
  status: z.enum(['available', 'low', 'out']),
  last_restock_at: isoDateTimeSchema.optional(),
  expires_at: dayStringSchema.optional(),
}) satisfies z.ZodType<T.InventoryItem>

export const shoppingListSchema = B.extend({
  horizons: z.object({ costco: positiveInt, super: positiveInt, market: positiveInt }),
  reserve_pct: z.number().min(0).max(100),
  status: z.enum(['open', 'done']),
}) satisfies z.ZodType<T.ShoppingList>

export const shoppingListItemSchema = B.extend({
  list_id: idSchema,
  food_id: idSchema,
  needed_portions: nonNegative,
  have_portions: nonNegative,
  buy_units: nonNegativeInt,
  store: storeSchema,
  checked: z.boolean(),
}) satisfies z.ZodType<T.ShoppingListItem>

// ───────────────────────── Metas y coaching ─────────────────────────

export const goalSchema = B.extend({
  kind: z.literal('recomposition'),
  start_date: dayStringSchema,
  end_date: dayStringSchema,
  target_fat_pct_range: orderedRange(z.number().min(0).max(100)),
  target_weight_kg_range: orderedRange(positive),
  description: z.string(),
}).refine(g => g.start_date <= g.end_date, { message: 'start_date ≤ end_date', path: ['end_date'] }) satisfies z.ZodType<T.Goal>

export const monthlyGoalSchema = B.extend({
  month: monthStringSchema,
  weight_pct_range: orderedRange(),
  weight_kg_range: orderedRange(positive).optional(),
  waist_delta_cm_range: orderedRange(),
  steps_target: nonNegativeInt,
  strength_sessions: nonNegativeInt,
  cardio_sessions: nonNegativeInt,
  focus_text: z.string(),
}) satisfies z.ZodType<T.MonthlyGoal>

const jsonRecord = z.record(z.string(), z.unknown())

const adjustmentRuleIdSchema = z.enum(['adherence_low', 'weight_loss_too_fast', 'strength_drop', 'hunger_sustained', 'weight_waist_stable', 'weight_loss_adequate'])

export const recommendationSchema = B.extend({
  date: dayStringSchema,
  origin: z.enum(['rules', 'claude', 'progression']),
  type: z.enum(['kcal', 'steps', 'deload', 'load', 'exercise_swap', 'other']),
  payload: jsonRecord,
  rationale: z.string(),
  status: z.enum(['pending', 'accepted', 'ignored', 'auto']),
  // 8.9 — aditivo/opcional
  rule_id: adjustmentRuleIdSchema.optional(),
  evaluation_period_start: dayStringSchema.optional(),
  evaluation_period_end: dayStringSchema.optional(),
  evidence: z.array(z.object({
    rule_id: adjustmentRuleIdSchema, metric: z.string().min(1), observed: z.number().nullable(), threshold: z.number().nullable(),
    period_start: dayStringSchema, period_end: dayStringSchema,
  })).optional(),
  proposed_change: z.object({ type: z.enum(['kcal', 'steps']), delta: z.number().int() }).optional(),
}) satisfies z.ZodType<T.Recommendation>

export const recommendationDecisionSchema = B.extend({
  recommendation_id: idSchema,
  decided_at: isoDateTimeSchema,
  decision: z.enum(['accepted', 'ignored']),
  applied_settings_id: idSchema.optional(),
}) satisfies z.ZodType<T.RecommendationDecision>

export const coachReportSchema = B.extend({
  generated_at: isoDateTimeSchema,
  period_start: dayStringSchema,
  period_end: dayStringSchema,
  text: z.string(),
  questions: z.string().optional(),
  response_pasted: z.string().optional(),
  alert_ids: z.array(idSchema),
}).refine(r => r.period_start <= r.period_end, { message: 'period_start ≤ period_end', path: ['period_end'] }) satisfies z.ZodType<T.CoachReport>

export const alertSchema = B.extend({
  type: z.enum(['adherence_high', 'weight_flat', 'sleep_drop', 'stall', 'mood', 'adherence_low', 'strength_drop']),
  message: z.string().min(1),
  context: jsonRecord,
  acknowledged_at: isoDateTimeSchema.optional(),
  included_in_report_id: idSchema.optional(),
}) satisfies z.ZodType<T.Alert>

// ───────────────────────── Sistema ─────────────────────────

export const appEventSchema = B.extend({
  ts: isoDateTimeSchema,
  type: z.enum(['prep_done', 'no_time', 'irregular_on', 'irregular_off', 'backup_created', 'import_done', 'migration', 'continue_after_gap', 'settings_manual_change', 'seed']),
  payload: jsonRecord.optional(),
}) satisfies z.ZodType<T.AppEvent>

export const backupEntitySchema = B.extend({
  schema_version: positiveInt,
  kind: z.enum(['auto_pre_migration', 'manual']),
  blob: blobSchema,
  bytes: nonNegativeInt,
}) satisfies z.ZodType<T.Backup>

// ───────────────────────── Catálogo v2 ─────────────────────────

const sourceNameSchema = z.enum([BOOK_SOURCE, 'manual'])

export const exerciseVariantSchema = B.extend({
  parent_exercise_id: idSchema,
  variant_exercise_id: idSchema.optional(),
  name: z.string().min(1),
  variant_type: z.enum(['equipment', 'grip', 'stance', 'stability', 'unilateral', 'angle', 'range', 'load_position', 'tempo']),
  equipment_change: z.string().optional(),
  grip_change: z.string().optional(),
  stance_change: z.string().optional(),
  stability_change: z.string().optional(),
  unilateral_change: z.string().optional(),
  difficulty_change: z.enum(['easier', 'similar', 'harder']),
  catalog_source: sourceNameSchema,
  source_page: positiveInt.optional(),
  source_confidence: provenanceSchema,
}).refine(v => v.variant_exercise_id !== v.parent_exercise_id, { message: 'La variante no puede ser su propio padre', path: ['variant_exercise_id'] }) satisfies z.ZodType<T.ExerciseVariant>

export const substitutionMemberSchema = z.object({
  exercise_id: idSchema,
  quality: z.enum(['high', 'medium', 'low']),
  reason: z.string().min(1),
  equipment: z.array(equipmentItemSchema),
  complexity: scale1to3,
  stability: scale1to3,
  unilateral: z.boolean(),
}) satisfies z.ZodType<T.SubstitutionMember>

export const exerciseSubstitutionGroupSchema = B.extend({
  name: z.string().min(1),
  movement_patterns: z.array(movementPatternSchema).min(1),
  primary_muscles: z.array(muscleSchema).min(1),
  members: z.array(substitutionMemberSchema).min(2),
  source_confidence: provenanceSchema,
}) satisfies z.ZodType<T.ExerciseSubstitutionGroup>

export const warmupExerciseSchema = B.extend({
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  region: z.enum(['neck', 'shoulder', 'wrist', 'trunk', 'hip', 'knee', 'ankle', 'general']),
  movement_patterns: z.array(movementPatternSchema),
  execution_cues: z.array(z.string()).optional(),
  common_errors: z.array(z.string()).optional(),
  default_reps_or_seconds: z.object({ reps: positiveInt.optional(), seconds: positiveInt.optional() }).optional(),
  catalog_source: sourceNameSchema,
  source_page: positiveInt.optional(),
  source_confidence: provenanceSchema,
}) satisfies z.ZodType<T.WarmupExercise>

export const trainingGoalSchema = B.extend({
  goal: z.enum(['muscular_endurance', 'body_sculpting', 'bodybuilding', 'maximal_strength', 'core_strength', 'sport_specific']),
  name: z.string().min(1),
  description: z.string(),
  source_pages: z.array(positiveInt),
  typical_sets: orderedRange(positiveInt).optional(),
  typical_reps: orderedRange(positiveInt).optional(),
  typical_load_rm: positiveInt.optional(),
  typical_rest_s: orderedRange(positiveInt).optional(),
  exercise_tags: z.array(z.object({ exercise_id: idSchema, role: z.enum(['core', 'optional']) })),
  source_confidence: provenanceSchema,
}) satisfies z.ZodType<T.TrainingGoal>

// ───────────────────────── Registro ─────────────────────────

export const ENTITY_SCHEMAS: { [C in CollectionName]: z.ZodType<T.EntityMap[C]> } = {
  users: userSchema,
  settings: settingsSchema,
  baselines: baselineSchema,
  daily_check_ins: dailyCheckInSchema,
  body_measurements: bodyMeasurementSchema,
  progress_photos: progressPhotoSchema,
  programs: programSchema,
  workout_templates: workoutTemplateSchema,
  exercises: exerciseSchema,
  workout_sessions: workoutSessionSchema,
  exercise_sets: exerciseSetSchema,
  cardio_sessions: cardioSessionSchema,
  monthly_tests: monthlyTestSchema,
  foods: foodSchema,
  food_equivalents: foodEquivalentSchema,
  recipes: recipeSchema,
  meal_plans: mealPlanSchema,
  meal_logs: mealLogSchema,
  inventory_items: inventoryItemSchema,
  shopping_lists: shoppingListSchema,
  shopping_list_items: shoppingListItemSchema,
  goals: goalSchema,
  monthly_goals: monthlyGoalSchema,
  recommendations: recommendationSchema,
  recommendation_decisions: recommendationDecisionSchema,
  coach_reports: coachReportSchema,
  alerts: alertSchema,
  app_events: appEventSchema,
  backups: backupEntitySchema,
  exercise_variants: exerciseVariantSchema,
  exercise_substitution_groups: exerciseSubstitutionGroupSchema,
  warmup_exercises: warmupExerciseSchema,
  training_goals: trainingGoalSchema,
}

// Garantía estática: hay un schema por colección y ninguno sobra.
const _check: readonly CollectionName[] = COLLECTIONS
void _check

export interface ValidationIssue {
  path: string
  message: string
}
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] }

/** Valida una entidad SIN transformarla: en éxito devuelve el mismo objeto de entrada. */
export function validateEntity<C extends CollectionName>(collection: C, input: unknown): ValidationResult<T.EntityMap[C]> {
  const r = ENTITY_SCHEMAS[collection].safeParse(input)
  if (r.success) return { ok: true, value: input as T.EntityMap[C] }
  return { ok: false, issues: r.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message })) }
}
