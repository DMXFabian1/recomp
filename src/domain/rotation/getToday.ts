/**
 * getToday(state, today) — Fase 8.3. Servicio PURO: calcula qué debería aparecer hoy.
 *
 * Fuentes de verdad, en este orden:
 *  1. Programa activo (si no hay → 'no_program').
 *  2. effective_from de Settings (si hoy es anterior → 'not_started'; la rotación sigue en cursor 0).
 *  3. rotation_cursor: índice de la siguiente sesión. NUNCA se modifica aquí; avanza solo al
 *     completar una sesión (8.4). Una sesión perdida o abandonada no mueve el cursor.
 *  4. Sesiones existentes: solo para saber si hay una abierta, si hoy ya se completó y cuánto
 *     hace de la última completada. No se crean sesiones ni se infiere ninguna retroactiva.
 *
 * suggested_weekdays solo informa (is_suggested_weekday); nunca elige la sesión.
 */
import type { DayString, Program, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { diffDays, weekdayOf } from '@domain/time/day'

export interface TodayInput {
  today: DayString
  effective_from: DayString
  program: Program | null | undefined
  templates: WorkoutTemplate[]
  sessions: WorkoutSession[]
}

export type TodayKind =
  | 'no_program' // no hay programa activo o su rotación está vacía
  | 'not_started' // today < effective_from
  | 'session_open' // existe una sesión abierta (de hoy o de otro día)
  | 'done_today' // hoy ya hay una sesión completada
  | 'suggested' // mostrar la plantilla del cursor

/** Días sin sesión completada a partir de los cuales marcamos ausencia (solo descriptivo; sin efecto). */
export const ABSENCE_DAYS = 7

export interface TodayState {
  kind: TodayKind
  today: DayString
  /** Plantilla que señala el cursor (null solo en 'no_program'). */
  template: WorkoutTemplate | null
  template_id: string | null
  /** Copia del cursor del programa, sin tocar. */
  rotation_cursor: number
  /** Posición legible: "2 de 4". */
  rotation_position: { index: number; length: number } | null
  is_suggested_weekday: boolean
  /** Sesión abierta (si la hay), esté o no fechada hoy. */
  open_session: WorkoutSession | null
  /** Última sesión completada antes de hoy (o hoy). */
  last_completed: WorkoutSession | null
  /** Días desde la última completada; null si nunca se completó una. */
  days_since_last_completed: number | null
  /** Hay historial (≥1 completada) y han pasado ≥ ABSENCE_DAYS días. */
  long_absence: boolean
  /** Sesiones abandonadas de hoy (informativo; no mueven el cursor). */
  abandoned_today: number
  /** La plantilla del cursor no existe en `templates` (datos inconsistentes). */
  template_missing: boolean
}

export function getToday(input: TodayInput): TodayState {
  const { today, effective_from, program, templates, sessions } = input
  const base: TodayState = {
    kind: 'no_program', today, template: null, template_id: null, rotation_cursor: 0, rotation_position: null,
    is_suggested_weekday: false, open_session: null, last_completed: null, days_since_last_completed: null,
    long_absence: false, abandoned_today: 0, template_missing: false,
  }

  if (!program || !program.active || program.rotation.length === 0) return base

  const length = program.rotation.length
  const cursor = program.rotation_cursor
  const index = ((cursor % length) + length) % length // tolera cursor fuera de rango sin corregirlo
  const templateId = program.rotation[index]!
  const template = templates.find(t => t.id === templateId && !t.deleted_at) ?? null

  const live = sessions.filter(s => !s.deleted_at)
  const open = live.filter(s => s.status === 'open').sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0] ?? null
  const completed = live.filter(s => s.status === 'completed' && s.date <= today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.started_at < b.started_at ? 1 : -1))
  const lastCompleted = completed[0] ?? null
  const daysSince = lastCompleted ? diffDays(lastCompleted.date, today) : null
  const abandonedToday = live.filter(s => s.status === 'abandoned' && s.date === today).length

  const state: TodayState = {
    ...base,
    template,
    template_id: templateId,
    rotation_cursor: cursor,
    rotation_position: { index: index + 1, length },
    is_suggested_weekday: program.suggested_weekdays.includes(weekdayOf(today)),
    open_session: open,
    last_completed: lastCompleted,
    days_since_last_completed: daysSince,
    long_absence: daysSince !== null && daysSince >= ABSENCE_DAYS,
    abandoned_today: abandonedToday,
    template_missing: template === null,
  }

  if (today < effective_from) return { ...state, kind: 'not_started' }
  if (open) return { ...state, kind: 'session_open' }
  if (lastCompleted && lastCompleted.date === today) return { ...state, kind: 'done_today' }
  return { ...state, kind: 'suggested' }
}
