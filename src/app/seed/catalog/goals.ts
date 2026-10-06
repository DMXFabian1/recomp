/**
 * Objetivos de entrenamiento del capítulo PROGRAMAS (p. 222–245). SOLO metadatos educativos:
 * ningún valor típico se copia a TemplateExercise ni lo lee el motor (ajuste 4 del diseño aprobado).
 * Solo muscular_endurance tiene valores típicos leídos del texto (p. 222); los demás quedan sin definir
 * porque sus tablas por ejercicio no se transcribieron en esta fase ("no disponible").
 */
import type { TrainingGoal } from '@domain/entities'
import { SEED_IDS } from '../ids'

const E = SEED_IDS.exercises
type SeedGoal = Omit<TrainingGoal, 'created_at' | 'updated_at' | 'source'>
const tag = (exercise_id: string, role: 'core' | 'optional' = 'core') => ({ exercise_id, role })

export const seedGoals: SeedGoal[] = [
  {
    id: 'tg_muscular_endurance', goal: 'muscular_endurance', name: 'Resistencia muscular',
    description: 'Programas de circuito con cargas ligeras y muchas repeticiones; se progresa añadiendo una repetición por serie hasta 20 o reduciendo el descanso.',
    source_pages: [222, 223], typical_sets: [2, 3], typical_reps: [12, 20], typical_load_rm: 12,
    exercise_tags: [tag(E.legPress), tag(E.latPulldown), tag(E.machineChestPress), tag(E.cableRow), tag(E.plank, 'optional')],
    source_confidence: 'direct',
  },
  {
    id: 'tg_body_sculpting', goal: 'body_sculpting', name: 'Body sculpting (tonificación)',
    description: 'Programas básicos y divididos orientados a la forma general; el libro aclara que "tonificar" es hipertrofia moderada con cargas medias.',
    source_pages: [224, 225, 226, 227, 228, 229],
    exercise_tags: [tag(E.squat), tag(E.bench), tag(E.latPulldown), tag(E.dbShoulderPress), tag('ex_db_triceps_extension', 'optional')],
    source_confidence: 'derived',
  },
  {
    id: 'tg_bodybuilding', goal: 'bodybuilding', name: 'Culturismo (hipertrofia)',
    description: 'Programas básicos y divididos para masa muscular; 2–3 entrenamientos por semana con 1–2 días de descanso entre ellos.',
    source_pages: [230, 231, 232, 233],
    exercise_tags: [tag(E.squat), tag(E.bench), tag(E.deadlift), tag('ex_bent_over_row'), tag(E.inclineDbPress, 'optional'), tag('ex_barbell_curl', 'optional')],
    source_confidence: 'derived',
  },
  {
    id: 'tg_maximal_strength', goal: 'maximal_strength', name: 'Fuerza máxima',
    description: 'Programa de 14 semanas centrado en los grandes levantamientos con cargas altas; opción dividida para enfoque específico.',
    source_pages: [234, 235],
    exercise_tags: [tag(E.squat), tag(E.bench), tag(E.deadlift), tag('ex_military_press'), tag(E.latPulldown, 'optional')],
    source_confidence: 'derived',
  },
  {
    id: 'tg_core_strength', goal: 'core_strength', name: 'Fuerza del núcleo',
    description: 'Dos opciones: core aislado o integrado. Empezar con 1–2 series de 10 repeticiones y añadir repeticiones hasta 2 series de 50; 30 s–1 min entre ejercicios.',
    source_pages: [236, 237],
    exercise_tags: [tag(E.plank), tag('ex_side_plank'), tag('ex_crunch'), tag('ex_reverse_crunch'), tag('ex_suitcase_deadlift', 'optional'), tag('ex_woodchop', 'optional')],
    source_confidence: 'derived',
  },
  {
    id: 'tg_sport_specific', goal: 'sport_specific', name: 'Ejercicios específicos por deporte',
    description: 'Selección de ejercicios por deporte (potencia, estocadas multidireccionales, agarre); los levantamientos dinámicos aparecen aquí.',
    source_pages: [238, 239, 240, 241, 242, 243, 244, 245],
    exercise_tags: [tag('ex_power_clean'), tag('ex_push_press'), tag('ex_overhead_split_squat'), tag('ex_woodchop'), tag('ex_kb_high_pull', 'optional')],
    source_confidence: 'derived',
  },
]
