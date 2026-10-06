/**
 * Esquema de stores e índices por versión de Dexie.
 * Cada versión lista el esquema COMPLETO (Dexie lo exige). Solo se añade; nunca se borra
 * y renombra en la misma versión (regla de la Fase 3).
 * La clave primaria es siempre `id` (ULID). Los índices siguen la Fase 4.
 */
import type { CollectionName } from '@domain/entities'

export type DexieStores = Record<CollectionName, string>

const V1: DexieStores = {
  users: 'id',
  settings: 'id, effective_from',
  baselines: 'id',
  daily_check_ins: 'id, &date',
  body_measurements: 'id, [type+date], date',
  progress_photos: 'id, &[month+view], month',
  programs: 'id, active',
  workout_templates: 'id, order_in_rotation',
  exercises: 'id, pattern, is_key_lift',
  workout_sessions: 'id, [template_id+date], status, date',
  exercise_sets: 'id, session_id, [exercise_id+completed_at], exercise_id',
  cardio_sessions: 'id, date',
  monthly_tests: 'id, &month',
  foods: 'id, category, store',
  food_equivalents: 'id, food_id',
  recipes: 'id',
  meal_plans: 'id, &[weekday+slot]',
  meal_logs: 'id, &[date+slot], date',
  inventory_items: 'id, &food_id, status',
  shopping_lists: 'id, status',
  shopping_list_items: 'id, &[list_id+food_id], list_id',
  goals: 'id',
  monthly_goals: 'id, &month',
  recommendations: 'id, date, status, type',
  recommendation_decisions: 'id, recommendation_id',
  coach_reports: 'id, generated_at',
  alerts: 'id, [type+created_at], type',
  app_events: 'id, ts, type',
  backups: 'id, created_at, kind',
}

/** Índice = versión de Dexie (1-based). `DEXIE_SCHEMAS[0]` es la v1. */
export const DEXIE_SCHEMAS: DexieStores[] = [V1]

export const DB_NAME = 'recomp'
