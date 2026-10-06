/**
 * Primitivos de validación (Fase 8.3). Zod valida la FORMA; el comportamiento vive en los servicios.
 * Sin dependencias de infra ni de React.
 */
import { z } from 'zod'
import { isValidDay } from '@domain/time/day'

export const idSchema = z.string().min(1).max(128)

export const dayStringSchema = z.string().refine(isValidDay, { message: 'Fecha de día inválida (YYYY-MM-DD)' })

export const monthStringSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido (YYYY-MM)')

export const hourStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')

export const isoDateTimeSchema = z.string().refine(
  s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
  { message: 'Fecha-hora ISO 8601 inválida' },
)

export const sourceSchema = z.enum(['user', 'shortcut', 'system', 'import'])

export const baseEntitySchema = z.object({
  id: idSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  deleted_at: isoDateTimeSchema.optional(),
  source: sourceSchema,
})

export const nonNegative = z.number().finite().nonnegative()
export const positive = z.number().finite().positive()
export const positiveInt = z.number().int().positive()
export const nonNegativeInt = z.number().int().nonnegative()
export const scale1to5 = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
export const scale1to3 = z.union([z.literal(1), z.literal(2), z.literal(3)])

/** Par [min, max] con min ≤ max. */
export const orderedRange = (inner: z.ZodNumber = z.number().finite()) =>
  z.tuple([inner, inner]).refine(([a, b]) => a <= b, { message: 'El rango debe ser [min, max] con min ≤ max' })

/** Blob real en navegador o en tests (fake). Zod no puede inspeccionar su contenido. */
export const blobSchema = z.custom<Blob>(v => typeof Blob !== 'undefined' && v instanceof Blob, { message: 'Se esperaba un Blob' })
