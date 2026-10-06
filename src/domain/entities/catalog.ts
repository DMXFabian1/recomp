/**
 * Catálogo de ejercicios enriquecido (Fase 8.2) a partir de Strength Training (DK/BWLA, 2009).
 * Reglas:
 *  - Nada de aquí lo lee la progresión, la rotación ni las métricas: es estructural/educativo.
 *  - `functional_rating` y los datos de TrainingGoal son SOLO metadatos descriptivos.
 *  - La procedencia se guarda por campo (`field_provenance`), nunca mezclada.
 */
import type { BaseEntity, Id } from './base'

export const MOVEMENT_PATTERNS = [
  'squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'lunge', 'step', 'carry', 'rotation', 'anti_rotation', 'anti_extension', 'anti_lateral_flexion',
  'lateral_flexion', 'elbow_flexion', 'elbow_extension', 'shoulder_abduction', 'shoulder_rotation',
  'shoulder_elevation', 'hip_extension', 'hip_abduction', 'hip_adduction', 'knee_flexion',
  'knee_extension', 'ankle_plantarflexion', 'spinal_flexion', 'dynamic_power',
] as const
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]

export const MUSCLES = [
  'trapezius', 'levator_scapulae', 'deltoids', 'deltoid_anterior', 'deltoid_medial', 'deltoid_posterior',
  'rotator_cuff', 'teres_major', 'rhomboids', 'serratus_anterior',
  'pectoralis_major', 'pectoralis_minor', 'latissimus_dorsi', 'erector_spinae', 'quadratus_lumborum',
  'biceps_brachii', 'brachialis', 'brachioradialis', 'triceps_brachii', 'anconeus', 'forearm_flexors', 'forearm_extensors',
  'rectus_abdominis', 'obliques_external', 'obliques_internal', 'transversus_abdominis', 'iliopsoas',
  'glutes', 'gluteus_maximus', 'gluteus_medius', 'gluteus_minimus', 'tensor_fasciae_latae', 'adductors', 'sartorius',
  'quadriceps', 'hamstrings', 'gastrocnemius', 'soleus', 'tibialis_anterior',
] as const
export type Muscle = (typeof MUSCLES)[number]

export const EQUIPMENT = [
  'olympic_barbell', 'rack', 'bench', 'incline_bench', 'dumbbells', 'kettlebell', 'cable', 'machine',
  'leg_press', 'pull_up_bar', 'assisted_pullup_machine', 'dip_station', 'bodyweight', 'resistance_band',
  'stability_ball', 'smith_machine', 'other',
] as const
export type EquipmentItem = (typeof EQUIPMENT)[number]

export type ExerciseCategory = 'legs' | 'back' | 'chest' | 'shoulders' | 'arms' | 'core' | 'dynamic'
export type BodyRegion = 'lower' | 'upper' | 'core' | 'full'

/** 'direct' = impreso en el libro · 'derived' = clasificado por nosotros a partir del libro · 'manual' = sin apoyo del libro. */
export type Provenance = 'direct' | 'derived' | 'manual'
export const BOOK_SOURCE = 'Strength Training — DK/BWLA'
export type SourceName = typeof BOOK_SOURCE | 'manual'

export type FieldProvenance = Partial<Record<string, Provenance>>

/** Campos educativos (ficha). Todos opcionales. */
export interface ExerciseEducation {
  description?: string
  setup_cues?: string[]
  execution_cues?: string[]
  common_errors?: string[]
  safety_notes?: string[]
  variations?: string[]
  regressions?: Id[]
  progressions?: Id[]
  short_card?: string
}

/** Campos de catálogo que se añaden a Exercise en v2. Todos opcionales salvo los marcados en la migración. */
export interface ExerciseCatalogFields extends ExerciseEducation {
  aliases?: string[]
  category?: ExerciseCategory
  body_region?: BodyRegion
  movement_patterns?: MovementPattern[]
  primary_muscles?: Muscle[]
  secondary_muscles?: Muscle[]
  stabilizers?: Muscle[]
  equipment_list?: EquipmentItem[]
  unilateral?: boolean
  compound?: boolean
  /** Columna de la matriz de funcionalidad (1 = más aislado … 5 = más funcional). SOLO descriptivo. */
  functional_rating?: 1 | 2 | 3 | 4 | 5
  technical_complexity?: 1 | 2 | 3
  stability_demand?: 1 | 2 | 3
  skill_demand?: 1 | 2 | 3
  /** Defaults educativos. TemplateExercise es la autoridad; nunca se copian al programa. */
  default_rep_range?: [number, number]
  default_rest_seconds?: number
  substitute_group_ids?: Id[]
  /** Fuente del contenido del catálogo (distinta de BaseEntity.source, que dice quién escribió el registro). */
  catalog_source?: SourceName
  source_page?: number
  source_confidence?: Provenance
  field_provenance?: FieldProvenance
}

export type VariantType =
  | 'equipment' | 'grip' | 'stance' | 'stability' | 'unilateral' | 'angle' | 'range' | 'load_position' | 'tempo'

export interface ExerciseVariant extends BaseEntity {
  parent_exercise_id: Id
  /** Ausente cuando la variante no tiene ficha propia (p. ej. "sentadilla sumo", solo descrita en un recuadro). */
  variant_exercise_id?: Id
  name: string
  variant_type: VariantType
  equipment_change?: string
  grip_change?: string
  stance_change?: string
  stability_change?: string
  unilateral_change?: string
  difficulty_change: 'easier' | 'similar' | 'harder'
  catalog_source: SourceName
  source_page?: number
  source_confidence: Provenance
}

export type SubstitutionQuality = 'high' | 'medium' | 'low'

export interface SubstitutionMember {
  exercise_id: Id
  quality: SubstitutionQuality
  reason: string
  equipment: EquipmentItem[]
  complexity: 1 | 2 | 3
  stability: 1 | 2 | 3
  unilateral: boolean
}

export interface ExerciseSubstitutionGroup extends BaseEntity {
  name: string
  movement_patterns: MovementPattern[]
  primary_muscles: Muscle[]
  members: SubstitutionMember[]
  source_confidence: Provenance
}

export type WarmupRegion = 'neck' | 'shoulder' | 'wrist' | 'trunk' | 'hip' | 'knee' | 'ankle' | 'general'

export interface WarmupExercise extends BaseEntity {
  name: string
  aliases?: string[]
  region: WarmupRegion
  movement_patterns: MovementPattern[]
  execution_cues?: string[]
  common_errors?: string[]
  default_reps_or_seconds?: { reps?: number; seconds?: number }
  catalog_source: SourceName
  source_page?: number
  source_confidence: Provenance
}

export type TrainingGoalId =
  | 'muscular_endurance' | 'body_sculpting' | 'bodybuilding' | 'maximal_strength' | 'core_strength' | 'sport_specific'

/** Metadatos educativos del capítulo de programas. NUNCA alimentan TemplateExercise ni el motor. */
export interface TrainingGoal extends BaseEntity {
  goal: TrainingGoalId
  name: string
  description: string
  source_pages: number[]
  typical_sets?: [number, number]
  typical_reps?: [number, number]
  typical_load_rm?: number
  typical_rest_s?: [number, number]
  exercise_tags: Array<{ exercise_id: Id; role: 'core' | 'optional' }>
  source_confidence: Provenance
}

/** Perfil de equipamiento (en Settings). `max_load_kg` es solo informativo para la UI. */
export interface EquipmentProfile {
  name: string
  items: EquipmentItem[]
  max_load_kg?: number
}
