/**
 * Ejercicios del programa que NO tienen ficha en Strength Training (DK/BWLA).
 * Todo su contenido es `manual` (criterio propio); no se les asigna functional_rating ni source_page.
 */
import type { EquipmentItem, Exercise, ExerciseCategory, FieldProvenance, Muscle, MovementPattern } from '@domain/entities'
import { SEED_IDS } from '../ids'
import type { SeedExercise } from './book-exercises'

const E = SEED_IDS.exercises

interface ManualSpec {
  id: string
  name: string
  pattern: Exercise['pattern']
  equipment: Exercise['equipment']
  increment: number
  category: ExerciseCategory
  patterns: MovementPattern[]
  primary: Muscle[]
  secondary?: Muscle[]
  items: EquipmentItem[]
  unilateral?: boolean
  compound?: boolean
  basic?: boolean
  key?: boolean
  substitutes?: string[]
  aliases?: string[]
  complexity: 1 | 2 | 3
  stability: 1 | 2 | 3
  description: string
  execution: string[]
}

function manual(s: ManualSpec): SeedExercise {
  const prov: FieldProvenance = {
    name: 'manual', movement_patterns: 'manual', category: 'manual', body_region: 'manual', equipment_list: 'manual',
    primary_muscles: 'manual', unilateral: 'manual', compound: 'manual', is_basic: 'manual', is_key_lift: 'manual',
    increment_kg: 'manual', technical_complexity: 'manual', stability_demand: 'manual', description: 'manual',
    execution_cues: 'manual',
  }
  if (s.secondary) prov.secondary_muscles = 'manual'
  if (s.aliases) prov.aliases = 'manual'
  const out: SeedExercise = {
    id: s.id, name: s.name, pattern: s.pattern, equipment: s.equipment, increment_kg: s.increment,
    is_basic: s.basic ?? false, is_key_lift: s.key ?? false, substitutes: s.substitutes ?? [],
    category: s.category, body_region: s.category === 'legs' ? 'lower' : s.category === 'core' ? 'core' : 'upper',
    movement_patterns: s.patterns, primary_muscles: s.primary, equipment_list: s.items,
    unilateral: s.unilateral ?? false, compound: s.compound ?? true,
    technical_complexity: s.complexity, stability_demand: s.stability,
    description: s.description, execution_cues: s.execution, short_card: s.execution.slice(0, 2).join(' · '),
    catalog_source: 'manual', source_confidence: 'manual', field_provenance: prov,
  }
  if (s.secondary) out.secondary_muscles = s.secondary
  if (s.aliases) out.aliases = s.aliases
  return out
}

export const manualExercises: SeedExercise[] = [
  manual({
    id: E.chestRow, name: 'Remo con pecho apoyado (máquina)', pattern: 'pull_h', equipment: 'machine', increment: 5,
    category: 'back', patterns: ['horizontal_pull'], primary: ['latissimus_dorsi', 'trapezius', 'rhomboids'],
    secondary: ['biceps_brachii', 'deltoid_posterior'], items: ['machine'], basic: true, key: true,
    substitutes: [E.cableRow, E.kbRow, 'ex_prone_row'], aliases: ['chest supported row', 'remo en máquina'],
    complexity: 1, stability: 1,
    description: 'Remo horizontal con el pecho apoyado en la almohadilla de la máquina. Es el cuarto key lift: tracción horizontal con la espalda baja descargada. Relacionado por función con el remo prono con mancuernas del libro (p. 106), pero son ejercicios distintos.',
    execution: ['Pecho pegado a la almohadilla todo el tiempo.', 'Tira llevando los codos atrás y junta las escápulas.', 'Baja controlado hasta extender los brazos sin despegar el pecho.'],
  }),
  manual({
    id: E.hipThrust, name: 'Hip thrust con barra', pattern: 'glute', equipment: 'barbell', increment: 5,
    category: 'legs', patterns: ['hip_extension'], primary: ['glutes', 'hamstrings'], secondary: ['quadriceps', 'erector_spinae'],
    items: ['olympic_barbell', 'bench'], substitutes: [E.rdl], complexity: 2, stability: 1,
    description: 'Extensión de cadera con la espalda alta apoyada en un banco y la barra sobre las caderas.',
    execution: ['Escápulas apoyadas en el banco; barra acolchada sobre las caderas.', 'Empuja con los talones hasta alinear rodilla–cadera–hombro; barbilla al pecho.', 'Pausa arriba y baja controlado.'],
  }),
  manual({
    id: E.cableCrunch, name: 'Crunch en polea', pattern: 'core', equipment: 'cable', increment: 2.5,
    category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external'], items: ['cable'],
    compound: false, substitutes: [E.plank, 'ex_crunch'], complexity: 1, stability: 1,
    description: 'Flexión de columna con carga en polea alta, de rodillas.',
    execution: ['Cuerda detrás de la cabeza, caderas fijas.', 'Flexiona el tronco llevando los codos hacia las rodillas.', 'Vuelve controlado sin mover las caderas.'],
  }),
  manual({
    id: E.facePull, name: 'Face pull', pattern: 'pull_h', equipment: 'cable', increment: 2.5,
    category: 'shoulders', patterns: ['horizontal_pull', 'shoulder_rotation'], primary: ['deltoid_posterior', 'rotator_cuff', 'rhomboids'],
    secondary: ['trapezius'], items: ['cable'], compound: false, substitutes: ['ex_rear_lateral_raise'], complexity: 1, stability: 1,
    description: 'Tracción de polea alta hacia la cara con rotación externa; salud de hombro y deltoides posterior.',
    execution: ['Cuerda a la altura de la cara, agarre neutro.', 'Tira separando las manos hacia las orejas, codos altos.', 'Vuelve lento sin encoger los hombros.'],
  }),
  manual({
    id: E.gobletSquat, name: 'Sentadilla goblet con kettlebell', pattern: 'squat', equipment: 'kettlebell', increment: 4,
    category: 'legs', patterns: ['squat'], primary: ['quadriceps', 'glutes'], secondary: ['rectus_abdominis', 'erector_spinae'],
    items: ['kettlebell'], substitutes: [E.squat, E.legPress], aliases: ['goblet squat'], complexity: 1, stability: 2,
    description: 'Sentadilla con la kettlebell sujeta contra el pecho; versión mínima en casa.',
    execution: ['Kettlebell pegada al pecho, codos abajo.', 'Baja con rodillas en línea con los pies y torso erguido.', 'Sube empujando el suelo.'],
  }),
  manual({
    id: E.kbRow, name: 'Remo con kettlebell', pattern: 'pull_h', equipment: 'kettlebell', increment: 4,
    category: 'back', patterns: ['horizontal_pull'], primary: ['latissimus_dorsi', 'trapezius', 'rhomboids'], secondary: ['biceps_brachii'],
    items: ['kettlebell'], unilateral: true, substitutes: [E.chestRow, 'ex_one_arm_row'], complexity: 1, stability: 2,
    description: 'Remo a un brazo con kettlebell apoyando la mano libre; versión mínima en casa.',
    execution: ['Bisagra de cadera, mano libre apoyada, espalda plana.', 'Tira del codo hacia la cadera.', 'Baja controlado sin girar el torso.'],
  }),
  manual({
    id: E.kbSwing, name: 'Swings con kettlebell', pattern: 'hinge', equipment: 'kettlebell', increment: 4,
    category: 'legs', patterns: ['hinge', 'dynamic_power'], primary: ['glutes', 'hamstrings'], secondary: ['erector_spinae', 'rectus_abdominis'],
    items: ['kettlebell'], substitutes: [E.rdl, 'ex_kb_high_pull'], complexity: 2, stability: 2,
    description: 'Bisagra explosiva de cadera con kettlebell; versión mínima en casa.',
    execution: ['Bisagra de cadera; la kettlebell pasa entre las piernas.', 'Extiende caderas con fuerza; los brazos solo guían.', 'Deja que baje y vuelve a la bisagra sin encorvar.'],
  }),
  manual({
    id: E.calfSeated, name: 'Pantorrilla sentado', pattern: 'calf', equipment: 'machine', increment: 5,
    category: 'legs', patterns: ['ankle_plantarflexion'], primary: ['soleus', 'gastrocnemius'], items: ['machine'],
    compound: false, substitutes: [E.calfStanding], complexity: 1, stability: 1,
    description: 'Flexión plantar con rodilla doblada; prioriza el sóleo.',
    execution: ['Almohadilla sobre las rodillas, talones libres.', 'Sube hasta la máxima flexión plantar; pausa.', 'Baja hasta el estiramiento completo.'],
  }),
  manual({
    id: E.dbCurl, name: 'Curl con mancuerna', pattern: 'arms', equipment: 'dumbbell', increment: 2,
    category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis'], items: ['dumbbells'],
    compound: false, substitutes: [E.hammerCurl, 'ex_barbell_curl'], complexity: 1, stability: 1,
    description: 'Curl supino con mancuernas, de pie o sentado. El libro tiene curl con barra, inclinado y de concentración; este es la versión estándar.',
    execution: ['Codos pegados al torso.', 'Sube con supinación completa.', 'Baja lento hasta extender.'],
  }),
]
