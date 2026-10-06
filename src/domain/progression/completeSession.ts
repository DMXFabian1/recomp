/**
 * Finalización de sesión — Fase 8.4. ÚNICO lugar donde rotation_cursor avanza (lo verifica el test de
 * arquitectura: ninguna otra ruta de src/domain ni src/app asigna rotation_cursor).
 * Puro: devuelve copias; no muta program ni session; no lee la hora (finished_at es input).
 *
 * Idempotencia: una sesión ya 'completed' no vuelve a avanzar el cursor (reintento / doble toque).
 * Correspondencia: solo avanza si la sesión es la plantilla que señala el cursor; si no coincide, la sesión
 * se cierra igual (es un registro real) pero el cursor no se toca y se reporta 'template_mismatch'.
 * Las versiones short/minimal completadas como la sesión que tocaba avanzan igual: no existe "sesión extra".
 * Abandonar o cancelar nunca avanza. No se crean sesiones retroactivas ni ficticias.
 */
import type { Program, WorkoutSession } from '@domain/entities'
import type { SessionCompletionInput, SessionCompletionResult } from './types'

export function completeSession(input: SessionCompletionInput): SessionCompletionResult {
  const { program, session, finished_at } = input
  const prev = program.rotation_cursor
  const length = program.rotation.length
  const expectedTemplate = length > 0 ? program.rotation[((prev % length) + length) % length] : undefined

  if (session.status === 'completed') {
    return { program, session, previous_rotation_cursor: prev, next_rotation_cursor: prev, advanced: false, reason: 'already_completed' }
  }
  if (session.status !== 'open') {
    return { program, session, previous_rotation_cursor: prev, next_rotation_cursor: prev, advanced: false, reason: 'not_open' }
  }
  const closed: WorkoutSession = { ...session, status: 'completed', finished_at, updated_at: finished_at }
  if (session.template_id !== expectedTemplate) {
    return { program, session: closed, previous_rotation_cursor: prev, next_rotation_cursor: prev, advanced: false, reason: 'template_mismatch' }
  }
  const next = (prev + 1) % length
  const advancedProgram: Program = { ...program, rotation_cursor: next, updated_at: finished_at }
  return { program: advancedProgram, session: closed, previous_rotation_cursor: prev, next_rotation_cursor: next, advanced: true, reason: 'advanced' }
}

/** Abandonar: cierra la sesión como 'abandoned'. El programa vuelve intacto (misma referencia). */
export function abandonSession(program: Program, session: WorkoutSession, at: string): { program: Program; session: WorkoutSession } {
  if (session.status !== 'open') return { program, session }
  return { program, session: { ...session, status: 'abandoned', finished_at: at, updated_at: at } }
}

/** Cancelar: marca la sesión abierta como borrada lógicamente (no se hizo nada). El programa vuelve intacto. */
export function cancelSession(program: Program, session: WorkoutSession, at: string): { program: Program; session: WorkoutSession } {
  if (session.status !== 'open') return { program, session }
  return { program, session: { ...session, status: 'abandoned', finished_at: at, deleted_at: at, updated_at: at } }
}
