/**
 * Finalización de sesión — Fase 8.4. ÚNICO lugar donde rotation_cursor avanza (lo verifica el test de
 * arquitectura: ninguna otra ruta de src/domain ni src/app asigna rotation_cursor).
 * Puro: devuelve copias; no muta program ni session; no lee la hora (finished_at es input).
 *
 * Regla conceptual (decisión final 8.4):
 *   "rotation_cursor representa la siguiente sesión de la rotación después de la última sesión válida realmente completada."
 *
 *  - Sesión ya 'completed' → no vuelve a avanzar (reintento / doble toque): idempotente.
 *  - Sesión no 'open' (abandonada/cancelada) → no avanza.
 *  - Plantilla == la del cursor → cursor + 1 ('advanced').
 *  - Plantilla ≠ la del cursor pero PERTENECE a la rotación → sesión válida completada fuera de orden:
 *    cursor = índice de esa plantilla + 1 ('advanced_out_of_order'); la que tocaba se considera perdida
 *    (skipped_template_id): no se recupera, no se inserta, no se crea retroactiva.
 *  - Plantilla NO pertenece a la rotación → inconsistencia: la sesión se cierra (registro real) pero el cursor
 *    no se mueve ('template_mismatch').
 *  - Las versiones short/minimal completadas avanzan igual: no existe "sesión extra".
 */
import type { Program, WorkoutSession } from '@domain/entities'
import type { SessionCompletionInput, SessionCompletionResult } from './types'

export function completeSession(input: SessionCompletionInput): SessionCompletionResult {
  const { program, session, finished_at } = input
  const prev = program.rotation_cursor
  const length = program.rotation.length
  const expectedIndex = length > 0 ? ((prev % length) + length) % length : -1
  const noAdvance = (reason: SessionCompletionResult['reason'], s: WorkoutSession): SessionCompletionResult =>
    ({ program, session: s, previous_rotation_cursor: prev, next_rotation_cursor: prev, advanced: false, reason })

  if (session.status === 'completed') return noAdvance('already_completed', session)
  if (session.status !== 'open') return noAdvance('not_open', session)

  const closed: WorkoutSession = { ...session, status: 'completed', finished_at, updated_at: finished_at }
  const doneIndex = program.rotation.indexOf(session.template_id)
  if (length === 0 || doneIndex === -1) return noAdvance('template_mismatch', closed)

  const next = (doneIndex + 1) % length
  const advancedProgram: Program = { ...program, rotation_cursor: next, updated_at: finished_at }
  const inOrder = doneIndex === expectedIndex
  return {
    program: advancedProgram, session: closed, previous_rotation_cursor: prev, next_rotation_cursor: next, advanced: true,
    reason: inOrder ? 'advanced' : 'advanced_out_of_order',
    ...(inOrder ? {} : { skipped_template_id: program.rotation[expectedIndex]! }),
  }
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
