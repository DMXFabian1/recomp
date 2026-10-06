/**
 * Tipos de las 26 entidades del modelo (Fase 4, con las correcciones de la revisión final).
 * Solo tipos: las reglas viven en domain/<módulo>. Los validadores (zod) se añaden en la Fase 8.2.
 */
import type { BaseEntity, DayString, HourString, Id, IsoDateTime, MonthString } from './base'
import type {
  EquipmentProfile, ExerciseCatalogFields, ExerciseSubstitutionGroup, ExerciseVariant, TrainingGoal, WarmupExercise,
} from './catalog'

// ───────────────────────── Usuario y configuración ─────────────────────────

export interface User extends BaseEntity {
  name: string
  sex: 'male' | 'female'
  birth_date?: DayString // no se siembra: lo captura el usuario (no se inventa)
  height_cm: number
  device_id: string
}

export interface Schedule {
  wake: HourString
  breakfast: HourString
  row: HourString
  work: HourString
  lunch: HourString
  snack: HourString
  gym: HourString
  dinner: HourString
  lights: HourString
}

export interface Increments {
  barbell_leg: number
  barbell_upper: number
  dumbbell: number
  machine: number // "siguiente bloque": se expresa en kg nominales del gym
}

export type SettingsChangeOrigin = 'seed' | 'recommendation' | 'manual'

export interface Settings extends BaseEntity {
  kcal_target: number
  protein_target_g: number
  protein_floor_g: number
  fat_g_range: [number, number]
  carb_g_range: [number, number]
  steps_target: number
  schedule: Schedule
  gym_slot: 'morning' | 'evening'
  increments: Increments
  rest_s: { basic: number; accessory: number }
  theme: 'system' | 'light' | 'dark'
  units: 'metric'
  /** v2: perfiles de equipamiento; solo filtran la UI del catálogo. */
  equipment_profiles?: Record<string, EquipmentProfile>
  active_equipment_profile?: string
  effective_from: DayString
  change_origin: SettingsChangeOrigin
  recommendation_decision_id?: Id
}

export interface Baseline extends BaseEntity {
  weight_avg_kg?: number
  weight_samples: DayString[]
  closed: boolean
  waist_cm?: number
  waist_date?: DayString
  photos_complete: boolean
  bia_fat_pct?: number
  bia_ffm_kg?: number
  bia_date?: DayString
}

// ───────────────────────── Cuerpo y día ─────────────────────────

export type SleepBucket = '<6' | '6-7' | '7-8' | '8+'
export type FoodYesterday = 'plan' | 'almost' | 'off'

export interface DailyCheckIn extends BaseEntity {
  date: DayString
  weight_kg?: number
  sleep_bucket?: SleepBucket
  energy?: 1 | 2 | 3 | 4 | 5
  mood?: 1 | 2 | 3 | 4 | 5
  hunger?: 1 | 2 | 3 | 4 | 5
  food_yesterday?: FoodYesterday
  steps_yesterday?: number
  steps_source?: 'shortcut' | 'manual'
  irregular: boolean
  irregular_protein_g?: number
  irregular_food?: 'low' | 'normal' | 'high'
  irregular_activity?: 'none' | 'walk' | 'train'
  lights_off_done?: boolean
  note?: string
}

export interface BodyMeasurement extends BaseEntity {
  date: DayString
  type: 'waist' | 'bia'
  waist_cm?: number
  bia_weight_kg?: number
  bia_fat_pct?: number
  bia_ffm_kg?: number
  bia_muscle_kg?: number
  bia_visceral?: number
  bia_bmr?: number
}

export interface ProgressPhoto extends BaseEntity {
  date: DayString
  month: MonthString
  view: 'front' | 'side' | 'back'
  blob: Blob
  thumb: Blob
  width: number
  height: number
  bytes: number
}

// ───────────────────────── Entrenamiento ─────────────────────────

export interface Program extends BaseEntity {
  name: string
  rotation: Id[] // template_id en orden
  rotation_cursor: number // índice de la siguiente sesión; avanza solo al completar
  suggested_weekdays: number[] // 0 = domingo … 6 = sábado; solo para ofrecer, nunca para elegir
  deload_windows: Array<{ start: DayString; end: DayString }>
  active: boolean
}

export interface TemplateExercise {
  exercise_id: Id
  order: number
  sets: number
  reps_min: number
  reps_max: number
  target_rir: number
  rest_s: number
  in_short: boolean
  in_minimal: boolean
}

export interface WorkoutTemplate extends BaseEntity {
  name: string
  order_in_rotation: number
  exercises: TemplateExercise[]
}

export type ExercisePattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'single_leg' | 'calf' | 'core' | 'arms' | 'glute'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell'

/**
 * Exercise. Los campos v1 (`pattern`, `equipment` únicos) se conservan para compatibilidad y
 * siguen siendo los que lee el motor junto con `is_basic`, `is_key_lift` e `increment_kg`.
 * Los campos de catálogo (v2) son opcionales y solo informativos.
 */
export interface Exercise extends BaseEntity, ExerciseCatalogFields {
  name: string
  pattern: ExercisePattern
  equipment: Equipment
  increment_kg: number
  is_basic: boolean // bloquea progresión con RIR 0
  is_key_lift: boolean // exactamente 4: sentadilla, banca, peso muerto, remo pecho apoyado
  substitutes: Id[]
}

export type SessionStatus = 'open' | 'completed' | 'abandoned'
export type SessionVersion = 'full' | 'short' | 'minimal'

/** Sustitución registrada en una sesión: el ejercicio de la plantilla se hizo con otro. No toca plantilla ni programa. */
export interface SessionSubstitution {
  original_exercise_id: Id
  substitute_exercise_id: Id
  reason?: 'equipment' | 'pain' | 'preference' | 'other'
}

export interface WorkoutSession extends BaseEntity {
  template_id: Id
  date: DayString
  started_at: IsoDateTime
  finished_at?: IsoDateTime
  status: SessionStatus
  version: SessionVersion
  time_mode?: number
  sleep_short_suggested: boolean
  /** v2.1: sustituciones hechas en esta sesión (8.4). Opcional y aditivo. */
  substitutions?: SessionSubstitution[]
  duration_s?: number
  tonnage_kg?: number
  note?: string
}

export interface ExerciseSet extends BaseEntity {
  session_id: Id
  exercise_id: Id
  set_number: number
  weight_kg: number
  reps: number
  rir: 0 | 1 | 2 | 3 | 4 // 4 = "4+"
  target_reps_min: number
  target_reps_max: number
  target_rir: number
  pain_flag: boolean
  technique_flag: boolean
  is_warmup: boolean
  completed_at: IsoDateTime
}

export type CardioPreset = 'z2_20' | 'z2_25' | 'z2_30' | 'intervals_6x1' | 'intervals_8x1'

export interface CardioSession extends BaseEntity {
  date: DayString
  modality: 'row' | 'walk' | 'other'
  preset?: CardioPreset
  duration_s: number
  distance_m?: number
  split_s_per_500m?: number
  spm?: number
  hr_avg?: number
  rpe: number // 1–10
  note?: string
}

export interface MonthlyTest extends BaseEntity {
  date: DayString
  month: MonthString
  duration_s: number
  distance_m: number
  split_avg_s: number
  spm?: number
  hr_avg?: number
  watts_avg?: number
}

// ───────────────────────── Comida e inventario ─────────────────────────

export type FoodCategory = 'protein' | 'dairy' | 'produce' | 'carb' | 'fat' | 'supplement' | 'other'
export type Store = 'costco' | 'super' | 'market'
export type NutritionStatus = 'verified' | 'estimated' | 'missing'

export interface Food extends BaseEntity {
  name: string
  category: FoodCategory
  portion_label: string
  portion_g?: number
  protein_g?: number
  kcal?: number
  fat_g?: number
  carb_g?: number
  fiber_g?: number
  nutrition_status: NutritionStatus
  store: Store
  purchase_unit: string
  portions_per_unit: number
  perishable_days?: number
  lactose_free: boolean
}

export interface FoodEquivalent extends BaseEntity {
  food_id: Id
  substitute_food_id: Id
  ratio: number
  /** Deltas cacheados; ausentes si alguno de los dos alimentos tiene nutrition_status 'missing'. Se recalculan al editar un Food. */
  protein_delta_g?: number
  kcal_delta?: number
  priority: number
}

export interface RecipeItem {
  food_id: Id
  portions: number
}

export interface Recipe extends BaseEntity {
  name: string
  items: RecipeItem[]
  prep_min: number
  protein_g?: number // cacheado; null/undefined si algún alimento tiene nutrition_status 'missing'
  kcal?: number
  emergency: boolean
}

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner'

export interface MealPlan extends BaseEntity {
  weekday: number // 0–6
  slot: MealSlot
  recipe_id: Id
  time: HourString
}

export type MealLogStatus = 'planned' | 'substituted' | 'adapted' | 'off_plan' | 'emergency' | 'skipped'

export interface MealSubstitution {
  food_id: Id
  substitute_food_id: Id
  portions: number
}

export interface MealLog extends BaseEntity {
  date: DayString
  slot: MealSlot
  status: MealLogStatus
  recipe_id?: Id
  substitutions?: MealSubstitution[]
  protein_g_est?: number
  kcal_est?: number
  est_complete: boolean
  off_plan_protein_g?: number | null // null = "no sé"
  time_mode?: number
  logged_at: IsoDateTime
}

export type InventoryStatus = 'available' | 'low' | 'out'

export interface InventoryItem extends BaseEntity {
  food_id: Id
  portions_left: number
  status: InventoryStatus // derivado: >2 available, ≤2 low, ≤0 out
  last_restock_at?: IsoDateTime
  expires_at?: DayString
}

export interface ShoppingList extends BaseEntity {
  horizons: { costco: number; super: number; market: number }
  reserve_pct: number
  status: 'open' | 'done'
}

export interface ShoppingListItem extends BaseEntity {
  list_id: Id
  food_id: Id
  needed_portions: number
  have_portions: number
  buy_units: number
  store: Store
  checked: boolean
}

// ───────────────────────── Metas y coaching ─────────────────────────

export interface Goal extends BaseEntity {
  kind: 'recomposition'
  start_date: DayString
  end_date: DayString
  target_fat_pct_range: [number, number]
  target_weight_kg_range: [number, number]
  description: string
}

export interface MonthlyGoal extends BaseEntity {
  month: MonthString
  weight_pct_range: [number, number]
  weight_kg_range?: [number, number]
  waist_delta_cm_range: [number, number]
  steps_target: number
  strength_sessions: number
  cardio_sessions: number
  focus_text: string
}

export type RecommendationOrigin = 'rules' | 'claude' | 'progression'
export type RecommendationType = 'kcal' | 'steps' | 'deload' | 'load' | 'exercise_swap' | 'other'
export type RecommendationStatus = 'pending' | 'accepted' | 'ignored' | 'auto'

export interface Recommendation extends BaseEntity {
  date: DayString
  origin: RecommendationOrigin
  type: RecommendationType
  payload: Record<string, unknown>
  rationale: string
  status: RecommendationStatus
}

export interface RecommendationDecision extends BaseEntity {
  recommendation_id: Id
  decided_at: IsoDateTime
  decision: 'accepted' | 'ignored'
  applied_settings_id?: Id
}

export interface CoachReport extends BaseEntity {
  generated_at: IsoDateTime
  period_start: DayString
  period_end: DayString
  text: string
  questions?: string
  response_pasted?: string
  alert_ids: Id[]
}

export type AlertType = 'adherence_high' | 'weight_flat' | 'sleep_drop' | 'stall' | 'mood'

export interface Alert extends BaseEntity {
  type: AlertType
  message: string
  context: Record<string, unknown>
  acknowledged_at?: IsoDateTime
  included_in_report_id?: Id
}

// ───────────────────────── Sistema ─────────────────────────

export type AppEventType =
  | 'prep_done' | 'no_time' | 'irregular_on' | 'irregular_off' | 'backup_created'
  | 'import_done' | 'migration' | 'continue_after_gap' | 'settings_manual_change' | 'seed'

export interface AppEvent extends BaseEntity {
  ts: IsoDateTime
  type: AppEventType
  payload?: Record<string, unknown>
}

export interface Backup extends BaseEntity {
  schema_version: number
  kind: 'auto_pre_migration' | 'manual'
  blob: Blob
  bytes: number
}

/** Mapa colección → tipo, usado por repositorios genéricos y por el backup. */
export interface EntityMap {
  users: User
  settings: Settings
  baselines: Baseline
  daily_check_ins: DailyCheckIn
  body_measurements: BodyMeasurement
  progress_photos: ProgressPhoto
  programs: Program
  workout_templates: WorkoutTemplate
  exercises: Exercise
  workout_sessions: WorkoutSession
  exercise_sets: ExerciseSet
  cardio_sessions: CardioSession
  monthly_tests: MonthlyTest
  foods: Food
  food_equivalents: FoodEquivalent
  recipes: Recipe
  meal_plans: MealPlan
  meal_logs: MealLog
  inventory_items: InventoryItem
  shopping_lists: ShoppingList
  shopping_list_items: ShoppingListItem
  goals: Goal
  monthly_goals: MonthlyGoal
  recommendations: Recommendation
  recommendation_decisions: RecommendationDecision
  coach_reports: CoachReport
  alerts: Alert
  app_events: AppEvent
  backups: Backup
  // v2
  exercise_variants: ExerciseVariant
  exercise_substitution_groups: ExerciseSubstitutionGroup
  warmup_exercises: WarmupExercise
  training_goals: TrainingGoal
}
