/**
 * Integridad del backup — Fase 8.11. Puro. Complementa validateBackup (estructura + entidades, 8.3) con:
 *  - colecciones completas: todas las de COLLECTIONS salvo BACKUP_EXCLUDED deben venir (aunque vacías);
 *  - ids: presentes y únicos dentro de cada colección (entre colecciones no se exige unicidad: cada store es independiente);
 *  - referencias: toda referencia a id debe existir en la colección destino (se incluyen registros con deleted_at:
 *    el borrado lógico conserva la fila). Nunca se eliminan referencias rotas ni se crean entidades fantasma.
 *  - fotos: id único, y la foto debe poder reconstruirse (metadata obligatoria la exige el envelope).
 * Las relaciones salen del modelo real (domain/entities). Las del catálogo (substitutes, regressions, progressions,
 * substitute_group_ids, variantes, grupos, objetivos) se validan igual: el seed oficial las cumple (test).
 */
import { COLLECTIONS, type CollectionName } from '@domain/entities'
import type { ValidationIssue } from '@domain/validation/entities'
import { BACKUP_EXCLUDED } from '@domain/validation/backup'
import type { BackupFile } from './schema'

/** Colecciones que viajan en `collections`. */
export const BACKUP_COLLECTIONS: CollectionName[] = COLLECTIONS.filter(c => !BACKUP_EXCLUDED.has(c))

type Row = Record<string, unknown>
interface RefRule { from: CollectionName; path: string; to: CollectionName; ids: (row: Row) => unknown[] }

const one = (k: string) => (r: Row) => (r[k] === undefined || r[k] === null ? [] : [r[k]])
const many = (k: string) => (r: Row) => (Array.isArray(r[k]) ? (r[k] as unknown[]) : [])
const nested = (arr: string, k: string) => (r: Row) => (Array.isArray(r[arr]) ? (r[arr] as Row[]).map(x => x?.[k]).filter(x => x !== undefined) : [])

export const REFERENCE_RULES: RefRule[] = [
  { from: 'settings', path: 'recommendation_decision_id', to: 'recommendation_decisions', ids: one('recommendation_decision_id') },
  { from: 'programs', path: 'rotation[]', to: 'workout_templates', ids: many('rotation') },
  { from: 'workout_templates', path: 'exercises[].exercise_id', to: 'exercises', ids: nested('exercises', 'exercise_id') },
  { from: 'exercises', path: 'substitutes[]', to: 'exercises', ids: many('substitutes') },
  { from: 'exercises', path: 'regressions[]', to: 'exercises', ids: many('regressions') },
  { from: 'exercises', path: 'progressions[]', to: 'exercises', ids: many('progressions') },
  { from: 'exercises', path: 'substitute_group_ids[]', to: 'exercise_substitution_groups', ids: many('substitute_group_ids') },
  { from: 'workout_sessions', path: 'template_id', to: 'workout_templates', ids: one('template_id') },
  { from: 'workout_sessions', path: 'substitutions[].original_exercise_id', to: 'exercises', ids: nested('substitutions', 'original_exercise_id') },
  { from: 'workout_sessions', path: 'substitutions[].substitute_exercise_id', to: 'exercises', ids: nested('substitutions', 'substitute_exercise_id') },
  { from: 'exercise_sets', path: 'session_id', to: 'workout_sessions', ids: one('session_id') },
  { from: 'exercise_sets', path: 'exercise_id', to: 'exercises', ids: one('exercise_id') },
  { from: 'food_equivalents', path: 'food_id', to: 'foods', ids: one('food_id') },
  { from: 'food_equivalents', path: 'substitute_food_id', to: 'foods', ids: one('substitute_food_id') },
  { from: 'recipes', path: 'items[].food_id', to: 'foods', ids: nested('items', 'food_id') },
  { from: 'meal_plans', path: 'recipe_id', to: 'recipes', ids: one('recipe_id') },
  { from: 'meal_logs', path: 'recipe_id', to: 'recipes', ids: one('recipe_id') },
  { from: 'meal_logs', path: 'substitutions[].food_id', to: 'foods', ids: nested('substitutions', 'food_id') },
  { from: 'meal_logs', path: 'substitutions[].substitute_food_id', to: 'foods', ids: nested('substitutions', 'substitute_food_id') },
  { from: 'inventory_items', path: 'food_id', to: 'foods', ids: one('food_id') },
  { from: 'shopping_list_items', path: 'list_id', to: 'shopping_lists', ids: one('list_id') },
  { from: 'shopping_list_items', path: 'food_id', to: 'foods', ids: one('food_id') },
  { from: 'recommendation_decisions', path: 'recommendation_id', to: 'recommendations', ids: one('recommendation_id') },
  { from: 'recommendation_decisions', path: 'applied_settings_id', to: 'settings', ids: one('applied_settings_id') },
  { from: 'coach_reports', path: 'alert_ids[]', to: 'alerts', ids: many('alert_ids') },
  { from: 'alerts', path: 'included_in_report_id', to: 'coach_reports', ids: one('included_in_report_id') },
  { from: 'exercise_variants', path: 'parent_exercise_id', to: 'exercises', ids: one('parent_exercise_id') },
  { from: 'exercise_variants', path: 'variant_exercise_id', to: 'exercises', ids: one('variant_exercise_id') },
  { from: 'exercise_substitution_groups', path: 'members[].exercise_id', to: 'exercises', ids: nested('members', 'exercise_id') },
  { from: 'training_goals', path: 'exercise_tags[].exercise_id', to: 'exercises', ids: nested('exercise_tags', 'exercise_id') },
]

export function checkCompleteness(b: BackupFile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const c of BACKUP_COLLECTIONS) if (!Array.isArray(b.collections[c])) issues.push({ path: `collections.${c}`, message: `Falta la colección ${c}` })
  return issues
}

export function checkIds(b: BackupFile, maxPerCollection = 20): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [c, rows] of Object.entries(b.collections)) {
    const seen = new Set<string>()
    let n = 0
    rows.forEach((row, i) => {
      if (n >= maxPerCollection) return
      const id = (row as Row)?.id
      if (typeof id !== 'string' || id.length === 0) { issues.push({ path: `collections.${c}[${i}].id`, message: 'Id faltante' }); n++; return }
      if (seen.has(id)) { issues.push({ path: `collections.${c}[${i}].id`, message: `Id duplicado en ${c}: ${id}` }); n++ }
      seen.add(id)
    })
  }
  const photoIds = new Set<string>()
  for (const [i, p] of (b.photos ?? []).entries()) {
    if (photoIds.has(p.id)) issues.push({ path: `photos[${i}].id`, message: `Id de foto duplicado: ${p.id}` })
    photoIds.add(p.id)
  }
  return issues
}

export function checkReferences(b: BackupFile, maxIssues = 50): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const idsOf = new Map<CollectionName, Set<string>>()
  const ids = (c: CollectionName) => {
    let s = idsOf.get(c)
    if (!s) { s = new Set((b.collections[c] ?? []).map(r => (r as Row).id as string)); idsOf.set(c, s) }
    return s
  }
  for (const rule of REFERENCE_RULES) {
    const rows = (b.collections[rule.from] ?? []) as Row[]
    rows.forEach((row, i) => {
      for (const ref of rule.ids(row)) {
        if (issues.length >= maxIssues) return
        if (typeof ref !== 'string' || !ids(rule.to).has(ref)) {
          issues.push({ path: `collections.${rule.from}[${i}].${rule.path}`, message: `Referencia inexistente: ${rule.from}.${rule.path} → ${rule.to} "${String(ref)}"` })
        }
      }
    })
  }
  return issues
}

/** Todas las comprobaciones de integridad posteriores a validateBackup. */
export function checkIntegrity(b: BackupFile): ValidationIssue[] {
  const completeness = checkCompleteness(b)
  if (completeness.length > 0) return completeness
  const idIssues = checkIds(b)
  if (idIssues.length > 0) return idIssues
  return checkReferences(b)
}
