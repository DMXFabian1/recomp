/**
 * Catálogo de ejercicios de Strength Training (DK/BWLA, 1.ª ed. americana 2009).
 * Página = página del libro (PDF − 2). Cada entrada declara la procedencia por campo:
 *   name, source_page, primary_muscles, secondary_muscles, variations, safety_notes, default_reps_or_seconds → direct
 *   movement_patterns, category, body_region, equipment_list, unilateral, compound, functional_rating,
 *   description, setup/execution_cues, common_errors → derived
 *   aliases, technical_complexity, stability_demand, is_basic, is_key_lift, increment_kg → manual
 * Los campos educativos (cues) solo existen para las 15 fichas revisadas una a una (Fase 8.2, muestra aprobada);
 * el resto del catálogo lleva datos estructurales + músculos objetivo + columna de la matriz.
 * functional_rating = columna de la matriz de funcionalidad (p. 218–221): SOLO descriptivo.
 */
import type {
  Equipment, EquipmentItem, Exercise, ExerciseCategory, ExercisePattern, FieldProvenance, Muscle, MovementPattern,
} from '@domain/entities'
import { BOOK_SOURCE } from '@domain/entities'
import { SEED_IDS } from '../ids'

export type SeedExercise = Omit<Exercise, 'created_at' | 'updated_at' | 'source'>

interface Spec {
  id: string
  name: string
  page: number
  category: ExerciseCategory
  patterns: MovementPattern[]
  primary: Muscle[]
  equipment: EquipmentItem[]
  rating?: 1 | 2 | 3 | 4 | 5
  unilateral?: boolean
  compound?: boolean
  secondary?: Muscle[]
  aliases?: string[]
  increment?: number
  basic?: boolean
  key?: boolean
  substitutes?: string[]
  complexity?: 1 | 2 | 3
  stability?: 1 | 2 | 3
  edu?: {
    description?: string
    setup?: string[]
    execution?: string[]
    errors?: string[]
    safety?: string[]
    variations?: string[]
    seconds?: number
  }
}

const E = SEED_IDS.exercises

/** Patrón v1 equivalente (compatibilidad con el motor). */
function legacyPattern(patterns: MovementPattern[], category: ExerciseCategory): ExercisePattern {
  const p = patterns[0]
  switch (p) {
    case 'squat': case 'knee_extension': return 'squat'
    case 'hinge': case 'hip_extension': case 'knee_flexion': return category === 'legs' || category === 'back' ? 'hinge' : 'core'
    case 'horizontal_push': return 'push_h'
    case 'vertical_push': return 'push_v'
    case 'horizontal_pull': return 'pull_h'
    case 'vertical_pull': return 'pull_v'
    case 'lunge': case 'step': return 'single_leg'
    case 'ankle_plantarflexion': return 'calf'
    case 'elbow_flexion': case 'elbow_extension': return 'arms'
    case 'shoulder_abduction': case 'shoulder_rotation': case 'shoulder_elevation': return 'push_v'
    case 'hip_abduction': case 'hip_adduction': return 'glute'
    case 'dynamic_power': return 'hinge'
    default: return 'core'
  }
}

function legacyEquipment(items: EquipmentItem[]): Equipment {
  if (items.includes('olympic_barbell') || items.includes('smith_machine')) return 'barbell'
  if (items.includes('dumbbells')) return 'dumbbell'
  if (items.includes('kettlebell')) return 'kettlebell'
  if (items.includes('cable')) return 'cable'
  if (items.includes('machine') || items.includes('leg_press') || items.includes('assisted_pullup_machine')) return 'machine'
  return 'bodyweight'
}

function region(c: ExerciseCategory) {
  return c === 'legs' ? 'lower' : c === 'core' ? 'core' : c === 'dynamic' ? 'full' : 'upper'
}

function defaultIncrement(items: EquipmentItem[], category: ExerciseCategory): number {
  if (items.includes('olympic_barbell')) return category === 'legs' || category === 'dynamic' ? 5 : 2.5
  if (items.includes('dumbbells')) return 2
  if (items.includes('kettlebell')) return 4
  if (items.includes('cable')) return 2.5
  if (items.includes('machine') || items.includes('leg_press')) return 5
  return 0
}

export function fromBook(s: Spec): SeedExercise {
  const prov: FieldProvenance = {
    name: 'direct', source_page: 'direct', primary_muscles: 'direct',
    movement_patterns: 'derived', category: 'derived', body_region: 'derived', equipment_list: 'derived',
    unilateral: 'derived', compound: 'derived',
    is_basic: 'manual', is_key_lift: 'manual', increment_kg: 'manual',
  }
  if (s.rating) prov.functional_rating = 'derived'
  if (s.secondary) prov.secondary_muscles = 'direct'
  if (s.aliases) prov.aliases = 'manual'
  if (s.complexity) prov.technical_complexity = 'manual'
  if (s.stability) prov.stability_demand = 'manual'
  const edu = s.edu
  if (edu?.description) prov.description = 'derived'
  if (edu?.setup) prov.setup_cues = 'derived'
  if (edu?.execution) prov.execution_cues = 'derived'
  if (edu?.errors) prov.common_errors = 'derived'
  if (edu?.safety) prov.safety_notes = 'direct'
  if (edu?.variations) prov.variations = 'direct'
  if (edu?.seconds) prov.default_rest_seconds = 'direct'

  const out: SeedExercise = {
    id: s.id,
    name: s.name,
    pattern: legacyPattern(s.patterns, s.category),
    equipment: legacyEquipment(s.equipment),
    increment_kg: s.increment ?? defaultIncrement(s.equipment, s.category),
    is_basic: s.basic ?? false,
    is_key_lift: s.key ?? false,
    substitutes: s.substitutes ?? [],
    category: s.category,
    body_region: region(s.category),
    movement_patterns: s.patterns,
    primary_muscles: s.primary,
    equipment_list: s.equipment,
    unilateral: s.unilateral ?? false,
    compound: s.compound ?? true,
    catalog_source: BOOK_SOURCE,
    source_page: s.page,
    source_confidence: 'derived',
    field_provenance: prov,
  }
  if (s.rating) out.functional_rating = s.rating
  if (s.secondary) out.secondary_muscles = s.secondary
  if (s.aliases) out.aliases = s.aliases
  if (s.complexity) out.technical_complexity = s.complexity
  if (s.stability) out.stability_demand = s.stability
  if (edu?.description) out.description = edu.description
  if (edu?.setup) out.setup_cues = edu.setup
  if (edu?.execution) { out.execution_cues = edu.execution; out.short_card = edu.execution.slice(0, 2).join(' · ') }
  if (edu?.errors) out.common_errors = edu.errors
  if (edu?.safety) out.safety_notes = edu.safety
  if (edu?.variations) out.variations = edu.variations
  return out
}

const BB: EquipmentItem[] = ['olympic_barbell']
const BBR: EquipmentItem[] = ['olympic_barbell', 'rack']
const DB: EquipmentItem[] = ['dumbbells']
const CB: EquipmentItem[] = ['cable']
const MC: EquipmentItem[] = ['machine']
const BW: EquipmentItem[] = ['bodyweight']
const BALL: EquipmentItem[] = ['stability_ball']

// ───────────────────────── PIERNAS (p. 64–89) ─────────────────────────
const LEGS: Spec[] = [
  { id: E.squat, name: 'Sentadilla trasera con barra', page: 64, category: 'legs', patterns: ['squat'], primary: ['quadriceps', 'glutes', 'hamstrings'], secondary: ['gastrocnemius', 'soleus'], equipment: BBR, rating: 5, basic: true, key: true, increment: 5, substitutes: [E.legPress, E.gobletSquat, 'ex_front_squat'], aliases: ['sentadilla', 'back squat'], complexity: 3, stability: 2,
    edu: {
      description: 'Ejercicio multiarticular que trabaja cuádriceps, glúteos e isquiotibiales con la barra apoyada en la parte alta de la espalda.',
      setup: ['Agarre equilibrado en el rack; barra en la parte alta de la espalda.', 'Pies un poco más abiertos que los hombros, puntas ligeramente hacia afuera.', 'Da un paso atrás y ponte derecho con el pecho alto.'],
      execution: ['Inspira, tensa abdomen y glúteos e inicia el descenso.', 'Rodillas siguiendo la línea de los pies; caderas atrás; torso en ángulo constante y columna neutra.', 'Baja hasta muslos paralelos al suelo.', 'Sube exhalando, con la barra estable y centrada sobre los pies.'],
      errors: ['Rodillas que se cierran hacia dentro.', 'Perder la posición neutra de la columna.', 'Mirar al suelo.'],
      variations: ['Sentadilla sumo (p. 64, variación).'],
    } },
  { id: 'ex_front_squat', name: 'Sentadilla frontal con barra', page: 66, category: 'legs', patterns: ['squat'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: BBR, rating: 5, basic: true, complexity: 3, stability: 2, aliases: ['front squat'] },
  { id: 'ex_hack_squat', name: 'Sentadilla hack con barra', page: 67, category: 'legs', patterns: ['squat'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: BB, rating: 4 },
  { id: 'ex_db_split_squat', name: 'Sentadilla dividida con mancuernas', page: 68, category: 'legs', patterns: ['lunge', 'squat'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: DB, rating: 5, unilateral: true },
  { id: 'ex_overhead_split_squat', name: 'Sentadilla dividida sobre la cabeza', page: 69, category: 'legs', patterns: ['lunge', 'squat', 'vertical_push'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: BB, rating: 5, unilateral: true, complexity: 3 },
  { id: 'ex_bulgarian_barbell', name: 'Sentadilla búlgara con barra', page: 70, category: 'legs', patterns: ['lunge', 'squat'], primary: ['quadriceps', 'glutes', 'hamstrings', 'gastrocnemius', 'soleus'], equipment: ['olympic_barbell', 'bench'], rating: 3, unilateral: true, complexity: 3 },
  { id: E.bulgarian, name: 'Sentadilla búlgara con mancuernas', page: 71, category: 'legs', patterns: ['lunge', 'squat'], primary: ['quadriceps', 'glutes', 'hamstrings', 'gastrocnemius', 'soleus'], secondary: ['deltoids', 'triceps_brachii', 'biceps_brachii', 'brachialis', 'latissimus_dorsi', 'erector_spinae'], equipment: ['dumbbells', 'bench'], rating: 3, unilateral: true, substitutes: [E.legPress, 'ex_db_split_squat'], complexity: 2, stability: 3,
    edu: {
      description: 'Sentadilla dividida con el pie trasero elevado; las mancuernas a los lados bajan el centro de gravedad y mejoran la estabilidad. Desarrolla equilibrio y fuerza de cadera y muslo.',
      setup: ['Pies a la anchura de las caderas; pie trasero apoyado por los dedos sobre el banco.', 'Pie delantero justo por delante del torso; mancuernas colgando a los lados.'],
      execution: ['Baja la rodilla trasera casi hasta el suelo con el torso erguido y la mirada al frente.', 'Rodilla delantera a 90°; respira con normalidad.', 'Sube extendiendo la pierna delantera sin saltar ni dar un paso.', 'Completa las repeticiones y cambia de pierna.'],
      errors: ['Inclinar el torso hacia delante.', 'Apoyar demasiado peso en el pie trasero.'],
    } },
  { id: 'ex_barbell_lunge', name: 'Estocada con barra', page: 72, category: 'legs', patterns: ['lunge'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: BB, rating: 5, unilateral: true },
  { id: 'ex_overhead_lunge', name: 'Estocada con barra sobre la cabeza', page: 73, category: 'legs', patterns: ['lunge', 'vertical_push'], primary: ['quadriceps', 'glutes', 'hamstrings', 'deltoids', 'erector_spinae'], equipment: BB, rating: 5, unilateral: true, complexity: 3 },
  { id: 'ex_forward_lunge', name: 'Estocada hacia adelante con mancuernas', page: 74, category: 'legs', patterns: ['lunge'], primary: ['quadriceps', 'glutes', 'hamstrings'], equipment: DB, rating: 5, unilateral: true,
    edu: { description: 'Ejercicio de cuerpo completo para la fuerza de piernas y cadera; las mancuernas a los lados facilitan mantener el cuerpo erguido.', setup: ['Cuerpo erguido, columna neutra, pecho alto y hombros atrás; mancuernas a los lados.'], execution: ['Da un paso adelante manteniendo el torso erguido.', 'Desciende con control doblando cadera, rodilla y tobillo hasta que ambas rodillas estén a 90°; la rodilla trasera bajo la cadera, casi en el suelo.', 'Empuja para volver al inicio.'], errors: ['Inclinarse hacia delante.'] } },
  { id: 'ex_lateral_lunge', name: 'Estocada lateral', page: 75, category: 'legs', patterns: ['lunge', 'hip_adduction'], primary: ['quadriceps', 'hamstrings', 'gastrocnemius'], equipment: DB, rating: 5, unilateral: true },
  { id: 'ex_step_up', name: 'Step-up con barra', page: 76, category: 'legs', patterns: ['step'], primary: ['quadriceps', 'hamstrings', 'glutes', 'gastrocnemius', 'soleus'], equipment: ['olympic_barbell', 'bench'], rating: 3, unilateral: true },
  { id: E.legPress, name: 'Prensa de piernas a 45°', page: 78, category: 'legs', patterns: ['squat'], primary: ['quadriceps', 'hamstrings'], secondary: ['gastrocnemius', 'soleus'], equipment: ['leg_press'], rating: 2, substitutes: [E.bulgarian], complexity: 1, stability: 1,
    edu: {
      description: 'El libro la presenta como constructor de confianza para principiantes y preparación para la sentadilla; pone poca tensión en la zona lumbar.',
      setup: ['Ajusta la máquina a tu altura; pies a la anchura de las caderas en la plataforma.', 'Toma el peso con las piernas y suelta el seguro.'],
      execution: ['Empuja de forma continua con talones y dedos en la plataforma; rodillas alineadas con los pies.', 'Extiende casi por completo sin bloquear; pausa breve.', 'Vuelve lento y bajo control, hasta al menos 90° de rodilla.'],
      safety: ['Mantén la zona lumbar firme contra el respaldo; deja de bajar si empieza a despegarse.', 'No bloquees las rodillas arriba; sube y baja el peso sin golpear la pila.'],
      variations: ['A una pierna, para corregir desequilibrios (p. 79).', 'Pies más abiertos y hacia afuera = más aductores; pies más altos = más glúteos (p. 79).'],
    } },
  { id: E.legCurl, name: 'Curl de piernas en máquina', page: 80, category: 'legs', patterns: ['knee_flexion'], primary: ['hamstrings'], equipment: MC, rating: 1, compound: false },
  { id: E.legExtension, name: 'Extensión de piernas en máquina', page: 80, category: 'legs', patterns: ['knee_extension'], primary: ['quadriceps'], equipment: MC, rating: 1, compound: false },
  { id: 'ex_hip_abductor', name: 'Abductor de cadera', page: 82, category: 'legs', patterns: ['hip_abduction'], primary: ['glutes', 'tensor_fasciae_latae'], equipment: MC, rating: 1, compound: false },
  { id: 'ex_hip_adductor', name: 'Aductor de cadera', page: 82, category: 'legs', patterns: ['hip_adduction'], primary: ['adductors'], equipment: MC, rating: 1, compound: false },
  { id: E.calfStanding, name: 'Elevación de pantorrillas con barra', page: 84, category: 'legs', patterns: ['ankle_plantarflexion'], primary: ['gastrocnemius', 'soleus'], equipment: BBR, rating: 3, compound: false, substitutes: [E.calfSeated], edu: { variations: ['En máquina Smith para estabilizar el cuerpo (p. 84).'] } },
  { id: 'ex_sldl', name: 'Peso muerto con piernas rectas', page: 85, category: 'legs', patterns: ['hinge'], primary: ['hamstrings', 'glutes', 'erector_spinae', 'quadriceps'], equipment: BB, rating: 3, basic: true, complexity: 3 },
  { id: E.deadlift, name: 'Peso muerto con barra', page: 86, category: 'legs', patterns: ['hinge', 'squat'], primary: ['glutes', 'trapezius', 'erector_spinae', 'rectus_abdominis', 'hamstrings', 'quadriceps'], secondary: ['deltoids', 'triceps_brachii', 'soleus'], equipment: BB, rating: 5, basic: true, key: true, increment: 5, substitutes: [E.rdl, E.hipThrust], aliases: ['deadlift'], complexity: 3, stability: 2,
    edu: {
      description: 'El libro lo llama "rey de los ejercicios" por su eficacia para la fuerza de piernas y espalda; es uno de los tres levantamientos de competición.',
      setup: ['Pies bajo la barra, barra contra las espinillas.', 'Agarre mixto (una mano prona, otra supina) más ancho que los hombros; espalda plana y tensa.'],
      execution: ['Inicia con un empuje largo y fuerte de piernas, extendiendo rodillas y caderas a la vez.', 'Barra pegada al cuerpo; hombros y caderas suben juntos.', 'Termina de pie con rodillas bloqueadas.', 'Desbloquea rodillas, lleva caderas atrás y baja la barra bajo control.'],
      errors: ['Subir primero las caderas y luego los hombros.', 'Dejar que la barra se aleje del cuerpo.'],
      safety: ['Nunca levantes con la columna flexionada hacia delante: es ineficaz y arriesga la columna.', 'Sube y baja hombros y caderas al mismo tiempo; no dejes caer la barra al final.'],
      variations: ['Con mancuernas, recluta más estabilizadores; útil para aprender la técnica (p. 87).'],
    } },
  { id: E.rdl, name: 'Peso muerto rumano', page: 88, category: 'legs', patterns: ['hinge'], primary: ['quadriceps', 'glutes', 'hamstrings', 'erector_spinae'], secondary: ['trapezius', 'deltoids', 'latissimus_dorsi', 'triceps_brachii', 'obliques_external'], equipment: BB, rating: 3, basic: true, increment: 5, substitutes: [E.legCurl, E.hipThrust], aliases: ['RDL'], complexity: 3, stability: 2,
    edu: {
      description: 'Equilibra el trabajo de cuádriceps desarrollando isquiotibiales y glúteos; el libro lo marca como movimiento avanzado.',
      setup: ['Agarre prono un poco más ancho que los hombros; barra apoyada en los muslos.', 'Rodillas desbloqueadas y algo dobladas; pies a la anchura de hombros; hombros atrás.'],
      execution: ['Inspira, encoge los hombros atrás y baja la barra pegada a los muslos.', 'Caderas atrás con la columna neutra; hombros por delante de la barra.', 'Baja hasta las rodillas, no más.', 'Vuelve a la posición erguida exhalando.'],
      errors: ['Encorvar la espalda.', 'Bajar la barra por debajo de las rodillas.'],
      safety: ['Depende de mantener la espalda neutra; no te encorves ni bajes más allá de las rodillas.', 'Es un movimiento avanzado: perfecciona la técnica con la barra vacía y pocas repeticiones.'],
      variations: ['En rack ajustado a tu altura con cargas altas; agarre mixto o muñequeras (p. 88).'],
    } },
]

// ───────────────────────── ESPALDA (p. 92–107) ─────────────────────────
const BACK: Spec[] = [
  { id: E.assistedPullup, name: 'Dominadas asistidas', page: 92, category: 'back', patterns: ['vertical_pull'], primary: ['latissimus_dorsi', 'biceps_brachii', 'teres_major'], secondary: ['deltoids', 'brachialis', 'rotator_cuff', 'triceps_brachii', 'trapezius', 'rhomboids', 'erector_spinae'], equipment: ['assisted_pullup_machine'], rating: 5, basic: true, substitutes: [E.latPulldown, 'ex_chin_up'], complexity: 2, stability: 2,
    edu: {
      description: 'Forma de trabajar los grandes músculos de la espalda y practicar la dominada cuando aún no puedes levantar todo tu peso. Más peso en la pila = más fácil.',
      setup: ['Elige el peso de asistencia y el agarre; rodillas sobre la almohadilla, brazos rectos.'],
      execution: ['Dobla codos y hombros usando los dorsales; cuerpo recto.', 'Sube hasta que la barbilla supere las manos; pausa.', 'Baja invirtiendo el movimiento hasta brazos completamente rectos.'],
      variations: ['Distintos agarres, ver chin-up (p. 94).'],
    } },
  { id: E.latPulldown, name: 'Jalón al pecho (lat pull-down)', page: 93, category: 'back', patterns: ['vertical_pull'], primary: ['latissimus_dorsi', 'biceps_brachii', 'trapezius', 'deltoid_posterior'], secondary: ['rotator_cuff', 'teres_major', 'triceps_brachii', 'brachialis', 'erector_spinae'], equipment: CB, rating: 2, substitutes: [E.assistedPullup], complexity: 1, stability: 1,
    edu: {
      description: 'Alternativa a la dominada cuando falta fuerza; permite aumentar la resistencia gradualmente.',
      setup: ['Agarre algo más ancho que los hombros; muslos anclados bajo la almohadilla; brazos rectos.'],
      execution: ['Inclina ligeramente el cuerpo atrás y tira de la barra hasta la parte alta del pecho con los codos pegados.', 'Deja que la barra vuelva lento y bajo control hasta brazos extendidos.'],
      errors: ['Balancear el torso para ganar palanca.', 'Tirar por detrás de la nuca.'],
    } },
  { id: 'ex_chin_up', name: 'Dominada (chin-up)', page: 94, category: 'back', patterns: ['vertical_pull'], primary: ['latissimus_dorsi', 'teres_major', 'trapezius', 'biceps_brachii'], equipment: ['pull_up_bar'], rating: 5, basic: true, complexity: 2 },
  { id: E.cableRow, name: 'Remo en polea sentado', page: 96, category: 'back', patterns: ['horizontal_pull'], primary: ['latissimus_dorsi', 'teres_major', 'trapezius'], secondary: ['deltoids', 'rhomboids', 'rotator_cuff', 'triceps_brachii', 'brachialis', 'erector_spinae', 'obliques_external'], equipment: CB, rating: 2, substitutes: [E.chestRow], complexity: 1, stability: 1,
    edu: {
      description: 'Constructor clave de músculo y fuerza de la espalda; la técnica importa para resultados seguros.',
      setup: ['Empuja con las piernas hasta brazos extendidos y espalda neutra; rodillas a unos 90°.', 'Pies firmes en los apoyos.'],
      execution: ['Lleva las manijas hacia el abdomen alto con los codos atrás, exhalando.', 'Columna neutra y torso erguido, a 90° del banco.', 'Deja que los brazos se extiendan de forma controlada, inhalando; no dejes que el peso te jale.'],
      safety: ['Rodillas dobladas y espalda sin doblar; no te inclines atrás para ganar palanca.', 'Trayectoria recta y horizontal; movimiento lento y continuo.'],
      variations: ['A un brazo, para equilibrar lados (p. 96).'],
    } },
  { id: 'ex_standing_cable_row', name: 'Remo en polea de pie', page: 98, category: 'back', patterns: ['horizontal_pull'], primary: ['latissimus_dorsi', 'trapezius', 'biceps_brachii'], equipment: CB, rating: 3 },
  { id: 'ex_one_arm_row', name: 'Remo a un brazo con mancuerna', page: 98, category: 'back', patterns: ['horizontal_pull'], primary: ['latissimus_dorsi', 'deltoid_posterior', 'biceps_brachii'], equipment: ['dumbbells', 'bench'], rating: 3, unilateral: true },
  { id: 'ex_bent_over_row', name: 'Remo inclinado con barra', page: 100, category: 'back', patterns: ['horizontal_pull', 'hinge'], primary: ['latissimus_dorsi', 'teres_major', 'biceps_brachii', 'glutes', 'quadriceps', 'hamstrings'], equipment: BB, rating: 5, basic: true, complexity: 3 },
  { id: 'ex_pullover', name: 'Pull-over con barra', page: 102, category: 'back', patterns: ['vertical_pull'], primary: ['pectoralis_major', 'latissimus_dorsi', 'triceps_brachii'], equipment: ['olympic_barbell', 'bench'], rating: 3 },
  { id: 'ex_good_morning', name: 'Buenos días con barra', page: 104, category: 'back', patterns: ['hinge'], primary: ['glutes', 'hamstrings', 'erector_spinae'], equipment: BBR, rating: 3, complexity: 3 },
  { id: 'ex_back_extension', name: 'Extensión de espalda', page: 104, category: 'back', patterns: ['hip_extension'], primary: ['erector_spinae', 'glutes', 'hamstrings', 'quadratus_lumborum'], equipment: MC, rating: 2 },
  { id: 'ex_prone_row', name: 'Remo prono con mancuernas (pecho apoyado en banco inclinado)', page: 106, category: 'back', patterns: ['horizontal_pull'], primary: ['trapezius', 'deltoid_posterior', 'biceps_brachii'], secondary: ['latissimus_dorsi', 'rotator_cuff', 'teres_major', 'rhomboids', 'erector_spinae', 'obliques_external'], equipment: ['dumbbells', 'incline_bench'], rating: 2, basic: true, complexity: 1, stability: 1,
    edu: {
      description: 'Variante del remo con mancuernas con el pecho apoyado; excelente para la parte alta de la espalda y el torso. Relacionado por función con nuestro remo con pecho apoyado en máquina, pero no es el mismo ejercicio.',
      setup: ['Banco inclinado a 45°; mancuernas en pronación; pecho contra el respaldo, pies apoyados.'],
      execution: ['Lleva los brazos atrás en ángulo recto con el torso, codos en línea con las muñecas.', 'Junta las escápulas al final; pausa breve.', 'Baja las mancuernas lento y bajo control.'],
      safety: ['Caderas pegadas al banco; no levantes ni gires la cabeza ni flexiones el cuello.', 'Torso y piernas quietos durante todo el ejercicio.'],
      variations: ['Sobre pelota de ejercicio para trabajar más los estabilizadores (p. 106).'],
    } },
  { id: 'ex_straight_arm_pulldown', name: 'Jalón con brazos rectos', page: 106, category: 'back', patterns: ['vertical_pull'], primary: ['latissimus_dorsi', 'teres_major', 'trapezius'], equipment: CB, rating: 2, compound: false, edu: { safety: ['Evítalo si tienes algún problema de hombro (p. 106).'] } },
]

// ───────────────────────── PECHO (p. 110–121) ─────────────────────────
const CHEST: Spec[] = [
  { id: E.bench, name: 'Press de banca con barra', page: 110, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], secondary: ['biceps_brachii', 'brachialis', 'forearm_extensors'], equipment: ['olympic_barbell', 'bench', 'rack'], rating: 3, basic: true, key: true, increment: 2.5, substitutes: [E.inclineDbPress, E.machineChestPress, 'ex_db_bench'], aliases: ['bench press', 'press de banca'], complexity: 2, stability: 2,
    edu: {
      description: 'Ejercicio clásico de pecho; el libro lo presenta como gran motivador con alto potencial de progreso en carga.',
      setup: ['Cabeza, hombros y glúteos firmes sobre el banco.', 'Agarre más ancho que los hombros, pulgares alrededor de la barra; barra sobre el pecho con brazos rectos.'],
      execution: ['Inhala y baja la barra en un arco corto hasta el pecho medio, antebrazos verticales en el punto bajo.', 'Empuja por el mismo arco hasta brazos rectos sobre el pecho.'],
      errors: ['Rebotar la barra en el pecho.', 'Despegar los glúteos del banco.'],
    } },
  { id: 'ex_db_bench', name: 'Press de banca con mancuernas', page: 110, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], equipment: ['dumbbells', 'bench'], rating: 3, basic: true, edu: { description: 'Ofrece mayor rango de movimiento que la barra (p. 110).' } },
  { id: 'ex_incline_bench', name: 'Press inclinado con barra', page: 112, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], equipment: ['olympic_barbell', 'incline_bench', 'rack'], rating: 3, basic: true },
  { id: E.inclineDbPress, name: 'Press inclinado con mancuernas', page: 113, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], secondary: ['biceps_brachii'], equipment: ['dumbbells', 'incline_bench'], rating: 3, basic: true, substitutes: [E.machineChestPress, E.bench], complexity: 2, stability: 2,
    edu: {
      description: 'Como el press inclinado con barra, pero con mayor rango de movimiento; el libro le da más valor funcional para deporte.',
      setup: ['Mancuernas sobre los hombros con brazos rectos, tocándose arriba; cabeza, espalda y glúteos apoyados; pies planos.'],
      execution: ['Baja lenta y uniformemente hasta que los brazos estén casi verticales y las mancuernas a la altura de los hombros.', 'Empuja en arco corto hasta extender; deja que se toquen ligeramente.'],
      safety: ['Sube y baja de forma uniforme; no sacudas ni tuerzas el cuerpo para "sacar" el peso.'],
    } },
  { id: 'ex_incline_fly', name: 'Aperturas inclinadas', page: 114, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'deltoid_anterior'], equipment: ['dumbbells', 'incline_bench'], rating: 2, compound: false, edu: { variations: ['Aperturas planas (p. 114).'] } },
  { id: 'ex_cable_crossover', name: 'Cruce de poleas', page: 116, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'deltoid_anterior'], equipment: CB, rating: 1, compound: false, edu: { variations: ['Polea baja e intermedia (p. 116).'] } },
  { id: E.machineChestPress, name: 'Press de pecho en máquina', page: 118, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'deltoid_anterior'], equipment: MC, rating: 2 },
  { id: 'ex_machine_fly', name: 'Aperturas en máquina', page: 118, category: 'chest', patterns: ['horizontal_push'], primary: ['pectoralis_major', 'deltoid_anterior'], equipment: MC, rating: 1, compound: false },
  { id: E.pushup, name: 'Lagartijas (push-up)', page: 120, category: 'chest', patterns: ['horizontal_push', 'anti_extension'], primary: ['pectoralis_major', 'deltoid_anterior', 'triceps_brachii'], secondary: ['deltoid_medial', 'deltoid_posterior', 'biceps_brachii', 'brachialis', 'glutes', 'quadriceps', 'rectus_abdominis', 'erector_spinae'], equipment: BW, rating: 5, complexity: 1, stability: 2,
    edu: {
      description: 'Uno de los ejercicios más sencillos y efectivos para pecho, hombros y brazos; no requiere aparatos.',
      setup: ['Apoyo en dedos de los pies y manos, un poco más anchas que los hombros, dedos al frente; piernas rectas, columna neutra.'],
      execution: ['Inhala y baja lento hasta que el torso toque el suelo, sin que se hunda.', 'Pausa de un segundo; exhala y empuja hasta brazos rectos.', 'Ángulo de la espalda constante y cabeza al frente.'],
      variations: ['Manos sobre pelota de estabilidad para más trabajo de estabilizadores (p. 120).'],
    } },
  { id: 'ex_frame_pushup', name: 'Lagartija apoyada en marco', page: 121, category: 'chest', patterns: ['horizontal_push', 'anti_extension'], primary: ['pectoralis_major', 'deltoid_anterior', 'triceps_brachii'], equipment: ['other'], rating: 5, complexity: 1, edu: { variations: ['Apoyada en marco elevado (p. 121).'] } },
]

// ───────────────────────── HOMBROS (p. 124–137) ─────────────────────────
const SHOULDERS: Spec[] = [
  { id: 'ex_military_press', name: 'Press militar con barra', page: 124, category: 'shoulders', patterns: ['vertical_push'], primary: ['deltoid_anterior', 'triceps_brachii'], equipment: BBR, rating: 5, basic: true, complexity: 2, edu: { variations: ['Sentado (p. 124).'] } },
  { id: E.dbShoulderPress, name: 'Press de hombros con mancuernas', page: 125, category: 'shoulders', patterns: ['vertical_push'], primary: ['deltoid_anterior', 'triceps_brachii'], secondary: ['biceps_brachii', 'rotator_cuff', 'teres_major', 'serratus_anterior', 'latissimus_dorsi', 'rectus_abdominis'], equipment: ['dumbbells', 'bench'], rating: 5, basic: true, substitutes: [E.lateralRaise, 'ex_military_press'], complexity: 2, stability: 2,
    edu: {
      description: 'Press de hombros sentado, de pie o alterno; evita mover la barra alrededor de la cara como en el press militar.',
      setup: ['Sentado al borde del banco, mancuernas a la altura de los hombros, pies apoyados, core activo.'],
      execution: ['Presiona hasta extender los brazos sin bloquear los codos, exhalando; deja que se toquen arriba.', 'Baja lento a la posición inicial.'],
      variations: ['Press en máquina si falta confianza; el libro lo considera menos efectivo porque no activa estabilizadores (p. 125).', 'De pie o alterno (p. 125).'],
    } },
  { id: 'ex_upright_row', name: 'Remo vertical con barra', page: 126, category: 'shoulders', patterns: ['shoulder_elevation', 'vertical_pull'], primary: ['trapezius', 'deltoid_anterior', 'biceps_brachii'], equipment: BB, rating: 3, edu: { variations: ['Con mancuernas; en polea (p. 126).'] } },
  { id: 'ex_db_shrug', name: 'Encogimiento de hombros con mancuernas', page: 128, category: 'shoulders', patterns: ['shoulder_elevation'], primary: ['trapezius', 'rhomboids'], equipment: DB, rating: 2, compound: false },
  { id: 'ex_hang_shrug', name: 'Encogimiento de hombros desde colgado', page: 129, category: 'shoulders', patterns: ['shoulder_elevation', 'hinge'], primary: ['trapezius', 'rhomboids', 'gastrocnemius'], equipment: BB, rating: 2 },
  { id: 'ex_front_raise', name: 'Elevación frontal con mancuernas', page: 130, category: 'shoulders', patterns: ['shoulder_abduction'], primary: ['deltoid_anterior', 'deltoid_medial'], equipment: DB, rating: 2, compound: false },
  { id: E.lateralRaise, name: 'Elevaciones laterales con mancuernas', page: 131, category: 'shoulders', patterns: ['shoulder_abduction'], primary: ['deltoid_anterior', 'deltoid_medial'], secondary: ['brachioradialis', 'biceps_brachii', 'trapezius', 'triceps_brachii', 'rotator_cuff', 'serratus_anterior', 'pectoralis_major', 'rectus_abdominis', 'obliques_external'], equipment: DB, rating: 2, compound: false, complexity: 1, stability: 1,
    edu: {
      description: 'Desarrolla la anchura de la parte alta de la espalda y hombros; el libro lo valora para deportes de raqueta y de campo.',
      setup: ['Pies a la anchura de caderas, rodillas ligeramente dobladas; mancuernas delante con los nudillos hacia fuera; abdomen firme.'],
      execution: ['Con los codos ligeramente doblados, sube ambas mancuernas a los lados hasta la altura de los ojos, no más.', 'Pausa de un segundo; baja lento y bajo control exhalando.'],
      errors: ['Impulsar con el tronco.', 'Subir por encima de los ojos.'],
      variations: ['Elevación lateral en decúbito prono (p. 133).'],
    } },
  { id: 'ex_rear_lateral_raise', name: 'Elevación lateral posterior', page: 132, category: 'shoulders', patterns: ['horizontal_pull'], primary: ['deltoid_posterior', 'deltoid_medial', 'deltoid_anterior', 'rhomboids'], equipment: DB, rating: 2, compound: false },
  { id: 'ex_scarecrow', name: 'Rotación de espantapájaros', page: 134, category: 'shoulders', patterns: ['shoulder_rotation'], primary: ['rotator_cuff', 'teres_major'], equipment: DB, rating: 1, compound: false, edu: { variations: ['En decúbito prono (p. 135).'] } },
  { id: 'ex_db_external_rotation', name: 'Rotación externa con mancuerna', page: 134, category: 'shoulders', patterns: ['shoulder_rotation'], primary: ['rotator_cuff', 'teres_major'], equipment: DB, rating: 3, compound: false, unilateral: true },
  { id: 'ex_cable_internal_rotation', name: 'Rotación interna en polea', page: 136, category: 'shoulders', patterns: ['shoulder_rotation'], primary: ['pectoralis_major', 'rotator_cuff', 'teres_major'], equipment: CB, rating: 3, compound: false, unilateral: true },
  { id: 'ex_cable_external_rotation', name: 'Rotación externa en polea', page: 136, category: 'shoulders', patterns: ['shoulder_rotation'], primary: ['rotator_cuff', 'teres_major'], equipment: CB, rating: 3, compound: false, unilateral: true },
]

// ───────────────────────── BRAZOS (p. 140–159) ─────────────────────────
const ARMS: Spec[] = [
  { id: 'ex_bench_dip', name: 'Fondos en banco', page: 140, category: 'arms', patterns: ['elbow_extension', 'vertical_push'], primary: ['deltoid_anterior', 'triceps_brachii', 'pectoralis_major'], equipment: ['bench'], rating: 3 },
  { id: 'ex_bar_dip', name: 'Fondos en barras', page: 141, category: 'arms', patterns: ['elbow_extension', 'vertical_push'], primary: ['triceps_brachii', 'deltoid_anterior', 'pectoralis_major'], equipment: ['dip_station'], rating: 5, complexity: 2 },
  { id: 'ex_db_triceps_extension', name: 'Extensión de tríceps con mancuerna', page: 142, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: DB, rating: 1, compound: false },
  { id: 'ex_barbell_triceps_extension', name: 'Extensión de tríceps con barra', page: 143, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: BB, rating: 2, compound: false },
  { id: 'ex_prone_triceps_extension', name: 'Extensión de tríceps en prono', page: 144, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: ['olympic_barbell', 'bench'], rating: 2, compound: false },
  { id: 'ex_triceps_kickback', name: 'Patada de tríceps', page: 144, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: DB, rating: 1, compound: false, unilateral: true },
  { id: 'ex_close_grip_bench', name: 'Press de banca con agarre cerrado', page: 146, category: 'arms', patterns: ['horizontal_push', 'elbow_extension'], primary: ['triceps_brachii', 'deltoids', 'pectoralis_major'], equipment: ['olympic_barbell', 'bench', 'rack'], rating: 3, basic: true, edu: { variations: ['Lagartijas con agarre cerrado (p. 146).'] } },
  { id: E.tricepsPushdown, name: 'Tríceps en polea (empuje hacia abajo)', page: 148, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: CB, rating: 2, compound: false, substitutes: [E.overheadTriceps] },
  { id: E.overheadTriceps, name: 'Extensión de tríceps sobre la cabeza', page: 148, category: 'arms', patterns: ['elbow_extension'], primary: ['triceps_brachii', 'anconeus'], equipment: DB, rating: 2, compound: false, substitutes: [E.tricepsPushdown] },
  { id: 'ex_barbell_curl', name: 'Curl con barra', page: 150, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis'], equipment: BB, rating: 2, compound: false },
  { id: E.hammerCurl, name: 'Curl martillo con mancuernas', page: 150, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis', 'brachioradialis'], equipment: DB, rating: 2, compound: false, substitutes: [E.dbCurl] },
  { id: 'ex_incline_curl', name: 'Curl inclinado con mancuernas', page: 152, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis'], equipment: ['dumbbells', 'incline_bench'], rating: 1, compound: false },
  { id: 'ex_concentration_curl', name: 'Curl de concentración', page: 152, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis'], equipment: DB, rating: 1, compound: false, unilateral: true },
  { id: 'ex_preacher_curl', name: 'Curl predicador', page: 154, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis', 'brachioradialis'], equipment: ['olympic_barbell', 'other'], rating: 1, compound: false },
  { id: 'ex_cable_curl', name: 'Curl en polea', page: 154, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachialis', 'brachioradialis'], equipment: CB, rating: 2, compound: false },
  { id: 'ex_reverse_curl', name: 'Curl inverso con barra', page: 156, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachioradialis'], equipment: BB, rating: 2, compound: false },
  { id: 'ex_reverse_cable_curl', name: 'Curl inverso en polea', page: 156, category: 'arms', patterns: ['elbow_flexion'], primary: ['biceps_brachii', 'brachioradialis'], equipment: CB, rating: 2, compound: false },
  { id: 'ex_wrist_extension', name: 'Extensión de muñeca', page: 158, category: 'arms', patterns: ['elbow_flexion'], primary: ['forearm_extensors'], equipment: DB, rating: 1, compound: false },
  { id: 'ex_wrist_flexion', name: 'Flexión de muñeca', page: 158, category: 'arms', patterns: ['elbow_flexion'], primary: ['forearm_flexors'], equipment: DB, rating: 1, compound: false },
]

// ───────────────────────── CORE (p. 162–179) ─────────────────────────
const CORE: Spec[] = [
  { id: 'ex_crunch', name: 'Crunch abdominal', page: 162, category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external'], equipment: BW, rating: 1, compound: false, edu: { variations: ['Variedad 1 y crunch con giro (p. 162).'] } },
  { id: 'ex_sit_up', name: 'Abdominales (sit-up)', page: 163, category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external'], equipment: BW, rating: 2, compound: false },
  { id: 'ex_reverse_crunch', name: 'Crunch inverso', page: 164, category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external', 'iliopsoas', 'quadriceps'], equipment: BW, compound: false },
  { id: 'ex_figure4_crunch', name: 'Crunch figura 4', page: 165, category: 'core', patterns: ['spinal_flexion', 'rotation'], primary: ['rectus_abdominis', 'obliques_external'], equipment: BW, rating: 2, compound: false },
  { id: 'ex_9090_crunch', name: 'Crunch 90/90', page: 166, category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external', 'transversus_abdominis'], equipment: BW, rating: 1, compound: false, edu: { variations: ['Con giro (p. 167).'] } },
  { id: 'ex_ball_crunch', name: 'Crunch sobre pelota', page: 166, category: 'core', patterns: ['spinal_flexion'], primary: ['rectus_abdominis', 'obliques_external'], equipment: BALL, rating: 1, compound: false },
  { id: 'ex_ball_twist', name: 'Giro con pelota', page: 168, category: 'core', patterns: ['rotation'], primary: ['rectus_abdominis', 'obliques_external', 'obliques_internal'], equipment: BALL, rating: 2 },
  { id: 'ex_ball_pushup', name: 'Lagartijas con pelota', page: 169, category: 'core', patterns: ['horizontal_push', 'anti_extension'], primary: ['rectus_abdominis', 'erector_spinae', 'pectoralis_major', 'triceps_brachii'], equipment: BALL, rating: 2 },
  { id: 'ex_ball_jackknife', name: 'Jackknife con pelota', page: 170, category: 'core', patterns: ['anti_extension', 'spinal_flexion'], primary: ['iliopsoas', 'rectus_abdominis'], equipment: BALL, rating: 2 },
  { id: 'ex_ball_back_extension', name: 'Extensión de espalda con pelota', page: 171, category: 'core', patterns: ['hip_extension'], primary: ['erector_spinae', 'glutes', 'hamstrings'], equipment: BALL, rating: 2 },
  { id: 'ex_lateral_bend', name: 'Flexión lateral', page: 172, category: 'core', patterns: ['lateral_flexion'], primary: ['obliques_external', 'obliques_internal', 'serratus_anterior'], equipment: DB, rating: 4, compound: false, unilateral: true },
  { id: 'ex_roman_chair_side_bend', name: 'Flexión lateral en silla romana', page: 172, category: 'core', patterns: ['lateral_flexion'], primary: ['obliques_external', 'obliques_internal', 'serratus_anterior'], equipment: MC, rating: 2, compound: false, unilateral: true },
  { id: E.plank, name: 'Plancha (tablón prono)', page: 174, category: 'core', patterns: ['anti_extension'], primary: ['erector_spinae', 'obliques_external', 'obliques_internal', 'rectus_abdominis', 'quadriceps'], secondary: ['deltoids', 'glutes', 'biceps_brachii', 'triceps_brachii'], equipment: BW, rating: 3, substitutes: ['ex_side_plank', E.cableCrunch], complexity: 1, stability: 2,
    edu: {
      description: 'Ejercicio isométrico (también llamado puente) que involucra el core y grandes grupos de la parte superior e inferior; el libro lo recomienda para prevenir problemas lumbares.',
      setup: ['Boca abajo sobre la colchoneta, codos a los lados, palmas junto a la cabeza, pies juntos.'],
      execution: ['Activa core y piernas y eleva el cuerpo apoyado en antebrazos y dedos de los pies; espalda plana y tensa.', 'Respira con normalidad; mantén la posición (empieza con unos 20 segundos).', 'Vuelve a bajar el cuerpo suavemente.'],
      variations: ['"Superman": extiende brazo y pierna opuestos; más difícil (p. 174).', 'Apoyando las rodillas en vez de los pies; más fácil (p. 174).'],
      seconds: 20,
    } },
  { id: 'ex_side_plank', name: 'Plancha lateral', page: 175, category: 'core', patterns: ['anti_lateral_flexion'], primary: ['obliques_external', 'obliques_internal', 'quadriceps'], equipment: BW, rating: 3, unilateral: true },
  { id: 'ex_v_leg_raise', name: 'Elevación de piernas en V', page: 176, category: 'core', patterns: ['anti_extension', 'spinal_flexion'], primary: ['rectus_abdominis'], equipment: BW, rating: 3, compound: false },
  { id: 'ex_suitcase_deadlift', name: 'Peso muerto con maleta', page: 176, category: 'core', patterns: ['hinge', 'anti_lateral_flexion', 'carry'], primary: ['quadriceps', 'obliques_external', 'transversus_abdominis', 'hamstrings', 'glutes'], equipment: DB, rating: 5, unilateral: true, complexity: 2 },
  { id: 'ex_woodchop', name: 'Corte de leña (woodchop)', page: 178, category: 'core', patterns: ['rotation'], primary: ['obliques_external', 'pectoralis_major', 'serratus_anterior', 'rotator_cuff', 'teres_major'], equipment: CB, rating: 5, unilateral: true, edu: { variations: ['Woodchop de polea baja (p. 179).'] } },
]

// ───────────────────────── LEVANTAMIENTOS DINÁMICOS (p. 182–205) — nunca en plantillas ─────────────────────────
const DYN_PRIMARY: Muscle[] = ['quadriceps', 'glutes', 'hamstrings', 'gastrocnemius', 'soleus', 'deltoids']
const DYNAMIC: Spec[] = [
  { id: 'ex_power_clean', name: 'Power clean', page: 182, category: 'dynamic', patterns: ['dynamic_power', 'hinge', 'squat'], primary: [...DYN_PRIMARY, 'pectoralis_major'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_power_snatch', name: 'Power snatch', page: 184, category: 'dynamic', patterns: ['dynamic_power', 'hinge', 'vertical_push'], primary: [...DYN_PRIMARY, 'pectoralis_major', 'triceps_brachii'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_hang_power_clean', name: 'Power clean desde colgado', page: 186, category: 'dynamic', patterns: ['dynamic_power', 'hinge'], primary: [...DYN_PRIMARY, 'pectoralis_major'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_hang_power_snatch', name: 'Power snatch desde colgado', page: 188, category: 'dynamic', patterns: ['dynamic_power', 'hinge', 'vertical_push'], primary: [...DYN_PRIMARY, 'pectoralis_major', 'triceps_brachii'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_squat_clean', name: 'Squat clean', page: 190, category: 'dynamic', patterns: ['dynamic_power', 'squat', 'hinge'], primary: [...DYN_PRIMARY, 'pectoralis_major'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_heavy_front_squat', name: 'Sentadilla frontal pesada', page: 192, category: 'dynamic', patterns: ['squat', 'dynamic_power'], primary: ['quadriceps', 'hamstrings', 'glutes', 'gastrocnemius', 'soleus', 'pectoralis_major', 'deltoids'], equipment: BBR, rating: 5, complexity: 3 },
  { id: 'ex_overhead_squat', name: 'Sentadilla sobre la cabeza', page: 194, category: 'dynamic', patterns: ['squat', 'vertical_push', 'dynamic_power'], primary: ['quadriceps', 'gastrocnemius', 'hamstrings', 'soleus', 'glutes', 'triceps_brachii', 'deltoids'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_jerk_balance', name: 'Equilibrio de jerk', page: 196, category: 'dynamic', patterns: ['dynamic_power', 'vertical_push', 'lunge'], primary: ['hamstrings', 'triceps_brachii', 'quadriceps', 'gastrocnemius', 'glutes', 'soleus', 'deltoids'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_snatch_balance', name: 'Equilibrio de arranque', page: 198, category: 'dynamic', patterns: ['dynamic_power', 'squat', 'vertical_push'], primary: ['quadriceps', 'triceps_brachii', 'hamstrings', 'gastrocnemius', 'glutes', 'soleus', 'deltoids'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_split_snatch', name: 'Arranque dividido', page: 200, category: 'dynamic', patterns: ['dynamic_power', 'lunge', 'vertical_push'], primary: ['quadriceps', 'hamstrings', 'glutes', 'deltoids'], equipment: BB, rating: 5, complexity: 3 },
  { id: 'ex_push_press', name: 'Push press', page: 202, category: 'dynamic', patterns: ['dynamic_power', 'vertical_push'], primary: ['triceps_brachii', 'hamstrings', 'deltoids', 'gastrocnemius', 'quadriceps', 'soleus', 'glutes'], equipment: BBR, rating: 5, complexity: 2 },
  { id: 'ex_kb_high_pull', name: 'Tirón alto con kettlebell', page: 204, category: 'dynamic', patterns: ['dynamic_power', 'hinge', 'vertical_pull'], primary: ['quadriceps', 'glutes', 'trapezius', 'deltoids', 'biceps_brachii', 'erector_spinae', 'hamstrings', 'gastrocnemius'], equipment: ['kettlebell'], rating: 4, complexity: 2 },
  { id: 'ex_barbell_jump_squat', name: 'Sentadilla con salto con barra', page: 205, category: 'dynamic', patterns: ['dynamic_power', 'squat'], primary: ['quadriceps', 'hamstrings', 'glutes', 'gastrocnemius', 'soleus'], equipment: BBR, rating: 5, complexity: 3 },
]

export const BOOK_SPECS: Spec[] = [...LEGS, ...BACK, ...CHEST, ...SHOULDERS, ...ARMS, ...CORE, ...DYNAMIC]
export const bookExercises: SeedExercise[] = BOOK_SPECS.map(fromBook)
