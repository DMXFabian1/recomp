/**
 * Compatibilidad de equipamiento. Dos preguntas DISTINTAS, nunca mezcladas:
 *  1. isCompatible(exercise, profile): ¿puedo hacer ESTE ejercicio con lo que tengo?
 *  2. compatibleSubstitutes(group, profile): ¿qué miembros del grupo puedo hacer?
 * Un ejercicio con mancuernas NO es compatible porque exista una variante con kettlebell.
 * Esto solo filtra y ordena lo que ve el usuario; nunca cambia el programa.
 */
import type { Exercise, EquipmentItem, EquipmentProfile, ExerciseSubstitutionGroup, SubstitutionMember } from '@domain/entities'

const QUALITY_ORDER = { high: 0, medium: 1, low: 2 } as const

/** Equipamiento efectivo de un ejercicio: la lista v2 si existe; si no, el valor único v1 mapeado. */
export function equipmentOf(exercise: Pick<Exercise, 'equipment' | 'equipment_list'>): EquipmentItem[] {
  if (exercise.equipment_list && exercise.equipment_list.length > 0) return exercise.equipment_list
  return legacyEquipmentToList(exercise.equipment)
}

export function legacyEquipmentToList(e: Exercise['equipment']): EquipmentItem[] {
  switch (e) {
    case 'barbell': return ['olympic_barbell']
    case 'dumbbell': return ['dumbbells']
    case 'machine': return ['machine']
    case 'cable': return ['cable']
    case 'bodyweight': return ['bodyweight']
    case 'kettlebell': return ['kettlebell']
  }
}

/** Compatible solo si TODOS los elementos requeridos están en el perfil. `bodyweight` siempre está. */
export function isCompatible(exercise: Pick<Exercise, 'equipment' | 'equipment_list'>, profile: EquipmentProfile): boolean {
  const have = new Set<EquipmentItem>([...profile.items, 'bodyweight'])
  return equipmentOf(exercise).every(item => have.has(item))
}

export interface SubstituteOption {
  member: SubstitutionMember
  compatible: boolean
}

/**
 * Orden determinista de sustitutos para la hoja [SUSTITUIR]:
 * calidad (high→low) · compatible antes que incompatible · misma lateralidad que el original ·
 * menor CAMBIO de complejidad respecto al original (|complejidad − original|).
 * `functional_rating` NO participa (es solo descriptivo).
 * La lateralidad y complejidad del original se toman de su propio miembro del grupo cuando existe;
 * `originalUnilateral` es el respaldo si el original no está en el grupo.
 */
export function orderedSubstitutes(
  group: ExerciseSubstitutionGroup,
  originalExerciseId: string,
  originalUnilateral: boolean,
  profile: EquipmentProfile,
): SubstituteOption[] {
  const have = new Set<EquipmentItem>([...profile.items, 'bodyweight'])
  const original = group.members.find(m => m.exercise_id === originalExerciseId)
  const origUni = original?.unilateral ?? originalUnilateral
  const origCx = original?.complexity
  const cxDelta = (m: SubstitutionMember) => (origCx === undefined ? m.complexity : Math.abs(m.complexity - origCx))
  return group.members
    .filter(m => m.exercise_id !== originalExerciseId)
    .map(member => ({ member, compatible: member.equipment.every(i => have.has(i)) }))
    .sort((a, b) =>
      QUALITY_ORDER[a.member.quality] - QUALITY_ORDER[b.member.quality]
      || Number(b.compatible) - Number(a.compatible)
      || Number(a.member.unilateral !== origUni) - Number(b.member.unilateral !== origUni)
      || cxDelta(a.member) - cxDelta(b.member)
      || a.member.exercise_id.localeCompare(b.member.exercise_id),
    )
}

/** Solo los sustitutos que sí puedes hacer. Responde la pregunta 2, no la 1. */
export function compatibleSubstitutes(
  group: ExerciseSubstitutionGroup,
  originalExerciseId: string,
  originalUnilateral: boolean,
  profile: EquipmentProfile,
): SubstitutionMember[] {
  return orderedSubstitutes(group, originalExerciseId, originalUnilateral, profile)
    .filter(o => o.compatible)
    .map(o => o.member)
}
