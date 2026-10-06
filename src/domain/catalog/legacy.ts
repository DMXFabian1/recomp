/**
 * Mapeo de los campos v1 de Exercise a los campos de catálogo v2.
 * Lo usan la migración de IndexedDB y la migración del backup, así que vive en domain.
 * Solo rellena campos AUSENTES; nunca sobrescribe.
 */
import type { BodyRegion, Exercise, ExerciseCategory, ExercisePattern, FieldProvenance, MovementPattern } from '@domain/entities'
import { legacyEquipmentToList } from './equipment'

export function legacyPatternToPatterns(p: ExercisePattern): MovementPattern[] {
  switch (p) {
    case 'squat': return ['squat']
    case 'hinge': return ['hinge']
    case 'push_h': return ['horizontal_push']
    case 'push_v': return ['vertical_push']
    case 'pull_h': return ['horizontal_pull']
    case 'pull_v': return ['vertical_pull']
    case 'single_leg': return ['lunge']
    case 'calf': return ['ankle_plantarflexion']
    case 'core': return ['anti_extension']
    case 'arms': return ['elbow_flexion', 'elbow_extension']
    case 'glute': return ['hip_extension']
  }
}

export function categoryFromPattern(p: ExercisePattern): ExerciseCategory {
  switch (p) {
    case 'squat': case 'hinge': case 'single_leg': case 'calf': case 'glute': return 'legs'
    case 'push_h': return 'chest'
    case 'push_v': return 'shoulders'
    case 'pull_h': case 'pull_v': return 'back'
    case 'arms': return 'arms'
    case 'core': return 'core'
  }
}

export function regionFromCategory(c: ExerciseCategory): BodyRegion {
  switch (c) {
    case 'legs': return 'lower'
    case 'core': return 'core'
    case 'dynamic': return 'full'
    default: return 'upper'
  }
}

/** Devuelve una copia del ejercicio con los campos v2 derivados de los v1, sin tocar los que ya existen. */
export function enrichLegacyExercise<T extends Exercise>(e: T): T {
  const out: T = { ...e }
  const prov: FieldProvenance = { ...(e.field_provenance ?? {}) }
  if (!out.movement_patterns) { out.movement_patterns = legacyPatternToPatterns(e.pattern); prov.movement_patterns ??= 'manual' }
  if (!out.equipment_list) { out.equipment_list = legacyEquipmentToList(e.equipment); prov.equipment_list ??= 'manual' }
  if (!out.category) { out.category = categoryFromPattern(e.pattern); prov.category ??= 'manual' }
  if (!out.body_region) { out.body_region = regionFromCategory(out.category); prov.body_region ??= 'manual' }
  if (out.unilateral === undefined) { out.unilateral = e.pattern === 'single_leg'; prov.unilateral ??= 'manual' }
  if (out.compound === undefined) { out.compound = !['calf', 'arms'].includes(e.pattern); prov.compound ??= 'manual' }
  if (!out.catalog_source) { out.catalog_source = 'manual'; out.source_confidence = 'manual' }
  out.field_provenance = prov
  return out
}
