/**
 * Sugerencia de versión de sesión — Fase 8.4. RECOMENDAR ≠ APLICAR: el motor sugiere, el usuario decide.
 *  - sueño < 6 h (horas exactas, o bucket '<6') → versión corta.
 *  - time_mode 'short' → corta; 'minimal' → mínima (manda sobre el sueño: es una decisión explícita del usuario).
 *  - Nada modifica el programa ni la plantilla; solo se filtra la lista de ejercicios por in_short / in_minimal.
 */
import type { SleepBucket, TemplateExercise, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import type { SessionVersionSuggestion } from './types'

export const SLEEP_SHORT_THRESHOLD_H = 6

export interface SessionVersionInput {
  template: WorkoutTemplate
  sleep_hours?: number | null
  sleep_bucket?: SleepBucket | null
  time_mode?: 'full' | 'short' | 'minimal' | null
}

export function exercisesForVersion(template: WorkoutTemplate, version: WorkoutSession['version']): TemplateExercise[] {
  const all = [...template.exercises].sort((a, b) => a.order - b.order)
  if (version === 'minimal') return all.filter(e => e.in_minimal)
  if (version === 'short') return all.filter(e => e.in_short)
  return all
}

export function isSleepShort(input: Pick<SessionVersionInput, 'sleep_hours' | 'sleep_bucket'>): boolean {
  if (typeof input.sleep_hours === 'number') return input.sleep_hours < SLEEP_SHORT_THRESHOLD_H
  return input.sleep_bucket === '<6'
}

export function suggestSessionVersion(input: SessionVersionInput): SessionVersionSuggestion {
  const sleepShort = isSleepShort(input)
  let version: WorkoutSession['version'] = 'full'
  let reason: SessionVersionSuggestion['reason'] = 'none'
  if (input.time_mode === 'minimal') { version = 'minimal'; reason = 'time_mode_minimal' }
  else if (input.time_mode === 'short') { version = 'short'; reason = 'time_mode_short' }
  else if (sleepShort) { version = 'short'; reason = 'sleep_short' }
  return { version, reason, template: input.template, exercises: exercisesForVersion(input.template, version), sleep_short_suggested: sleepShort }
}

/** El usuario decide. Devuelve la versión final y los ejercicios; la sugerencia queda como dato (sleep_short_suggested). */
export function resolveSessionVersion(suggestion: SessionVersionSuggestion, userChoice: WorkoutSession['version'] | null | undefined): { version: WorkoutSession['version']; exercises: TemplateExercise[]; sleep_short_suggested: boolean } {
  const version = userChoice ?? suggestion.version
  return { version, exercises: exercisesForVersion(suggestion.template, version), sleep_short_suggested: suggestion.sleep_short_suggested }
}
