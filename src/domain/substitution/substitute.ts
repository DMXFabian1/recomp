/**
 * Sustitución en sesión — Fase 8.4. ÚNICO punto del motor que toca domain/catalog.
 *  - substituteOptions: opciones ordenadas por orderedSubstitutes (calidad → compatible → lateralidad →
 *    menor cambio de complejidad). functional_rating no participa. Solo se devuelven compatibles con el perfil.
 *  - recordSubstitution: registra la sustitución EN LA SESIÓN (copia). No toca plantilla, programa ni cursor.
 *  - La progresión del ejercicio sustituido (y del sustituto) queda bloqueada en esa sesión (ver evaluate.ts).
 */
import type { EquipmentProfile, Exercise, ExerciseSubstitutionGroup, SessionSubstitution, SubstitutionMember, WorkoutSession } from '@domain/entities'
import { orderedSubstitutes } from '@domain/catalog/equipment'

export interface SubstituteOptionsInput {
  exercise: Exercise
  groups: ExerciseSubstitutionGroup[]
  profile: EquipmentProfile
  /** Para resolver el Exercise de cada opción (nombre, etc.). */
  exercises: Exercise[]
}

export interface SubstituteOption {
  exercise: Exercise
  member: SubstitutionMember
  group_id: string
  compatible: boolean
}

export function substituteOptions(input: SubstituteOptionsInput): SubstituteOption[] {
  const byId = new Map(input.exercises.filter(e => !e.deleted_at).map(e => [e.id, e]))
  const seen = new Set<string>()
  const out: SubstituteOption[] = []
  const groups = input.groups.filter(g => !g.deleted_at && g.members.some(m => m.exercise_id === input.exercise.id))
  for (const g of groups) {
    for (const o of orderedSubstitutes(g, input.exercise.id, input.exercise.unilateral ?? false, input.profile)) {
      if (!o.compatible || seen.has(o.member.exercise_id)) continue
      const ex = byId.get(o.member.exercise_id)
      if (!ex) continue
      seen.add(ex.id)
      out.push({ exercise: ex, member: o.member, group_id: g.id, compatible: true })
    }
  }
  return out
}

export function recordSubstitution(session: WorkoutSession, sub: SessionSubstitution, at: string): WorkoutSession {
  if (sub.original_exercise_id === sub.substitute_exercise_id) return session
  const existing = session.substitutions ?? []
  if (existing.some(s => s.original_exercise_id === sub.original_exercise_id)) {
    return { ...session, substitutions: existing.map(s => (s.original_exercise_id === sub.original_exercise_id ? sub : s)), updated_at: at }
  }
  return { ...session, substitutions: [...existing, sub], updated_at: at }
}
