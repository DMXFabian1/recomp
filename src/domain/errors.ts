/**
 * Errores de dominio y de aplicación. La UI decide qué mostrar según `code`,
 * nunca según el texto.
 */
export type AppErrorCode =
  | 'storage_unavailable' // IndexedDB no abre
  | 'write_failed' // transacción abortada
  | 'not_found'
  | 'validation'
  | 'conflict' // p. ej. dos sesiones abiertas
  | 'migration'
  | 'import_invalid'
  | 'not_allowed' // regla de negocio (p. ej. aplicar Settings sin decisión aceptada)

export class AppError extends Error {
  readonly code: AppErrorCode
  override readonly cause?: unknown
  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
