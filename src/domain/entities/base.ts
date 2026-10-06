/**
 * Campos comunes a todas las entidades (Fase 4).
 * - `id`: ULID (ordenable por tiempo).
 * - Fechas de sistema en ISO 8601; fechas de día como 'YYYY-MM-DD' en hora local.
 * - `deleted_at`: borrado lógico (necesario para fusionar backups y para la futura sincronía).
 */
export type Id = string
export type IsoDateTime = string
export type DayString = string // 'YYYY-MM-DD'
export type MonthString = string // 'YYYY-MM'
export type HourString = string // 'HH:MM'

export type Source = 'user' | 'shortcut' | 'system' | 'import'

export interface BaseEntity {
  id: Id
  created_at: IsoDateTime
  updated_at: IsoDateTime
  deleted_at?: IsoDateTime
  source: Source
}

/** Lista de todas las colecciones (stores) del dominio. Es la fuente de verdad para Dexie y para el backup. */
export const COLLECTIONS = [
  'users',
  'settings',
  'baselines',
  'daily_check_ins',
  'body_measurements',
  'progress_photos',
  'programs',
  'workout_templates',
  'exercises',
  'workout_sessions',
  'exercise_sets',
  'cardio_sessions',
  'monthly_tests',
  'foods',
  'food_equivalents',
  'recipes',
  'meal_plans',
  'meal_logs',
  'inventory_items',
  'shopping_lists',
  'shopping_list_items',
  'goals',
  'monthly_goals',
  'recommendations',
  'recommendation_decisions',
  'coach_reports',
  'alerts',
  'app_events',
  'backups',
] as const

export type CollectionName = (typeof COLLECTIONS)[number]
