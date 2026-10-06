/**
 * Ejercicios de movilidad / calentamiento del libro (p. 50–61). Nunca se programan ni se progresan.
 * Nombres y región: direct. Cues: resumen (derived) de la ficha; el libro no imprime repeticiones ni tiempos
 * para estos movimientos, por lo que default_reps_or_seconds queda sin definir ("no disponible").
 */
import type { MovementPattern, WarmupExercise, WarmupRegion } from '@domain/entities'
import { BOOK_SOURCE } from '@domain/entities'

type SeedWarmup = Omit<WarmupExercise, 'created_at' | 'updated_at' | 'source'>

const w = (id: string, name: string, region: WarmupRegion, page: number, patterns: MovementPattern[],
  cues: string[], aliases?: string[]): SeedWarmup => ({
  id, name, region, movement_patterns: patterns, execution_cues: cues,
  catalog_source: BOOK_SOURCE, source_page: page, source_confidence: 'direct', ...(aliases ? { aliases } : {}),
})

export const seedWarmups: SeedWarmup[] = [
  w('wu_neck_flexion', 'Extensión y flexión de cuello', 'neck', 50, [], ['De pie o sentado, mirada al frente, hombros relajados.', 'Levanta la barbilla sin forzar; luego baja la barbilla al pecho.']),
  w('wu_neck_rotation', 'Rotación de cuello', 'neck', 51, ['rotation'], ['Columna neutra, brazos sueltos.', 'Gira lento hasta mirar por encima de un hombro; mantén; vuelve por la línea media al otro lado.', 'Objetivo: al menos 70° por lado sin tirones.']),
  w('wu_neck_lateral', 'Flexión lateral de cuello', 'neck', 51, ['lateral_flexion'], ['Lleva la oreja hacia el hombro sin subir el hombro.', 'Mantén y cambia de lado.']),
  w('wu_arm_circle', 'Círculos de brazos', 'shoulder', 52, ['shoulder_rotation'], ['Brazos rectos, hombros bajos, pecho alto.', 'Círculos amplios y continuos hacia delante y hacia atrás; las manos pasan por detrás de la línea del cuerpo.']),
  w('wu_shoulder_rotation', 'Rotación de hombros', 'shoulder', 53, ['shoulder_rotation'], ['Encoge y rota los hombros hacia atrás en círculo.', 'Movimiento suave y continuo.']),
  w('wu_wrist_rotation', 'Rotación de muñecas', 'wrist', 53, [], ['Dedos entrelazados o manos sueltas; muñecas relajadas.', 'Rota en ambos sentidos; prepara el agarre.']),
  w('wu_hip_circle', 'Círculos de cadera', 'hip', 54, ['rotation'], ['Manos en las caderas, postura relajada, mirada al frente.', 'Círculos amplios con la cadera, pies fijos.']),
  w('wu_torso_rotation', 'Rotación de torso', 'trunk', 55, ['rotation'], ['Pies a la anchura de hombros, brazos relajados.', 'Gira el torso de un lado a otro con las caderas al frente.']),
  w('wu_trunk_flexion', 'Flexión lateral de tronco', 'trunk', 55, ['lateral_flexion'], ['Brazos a los lados, hombros relajados, pecho alto.', 'Flexiona de lado a lado sin inclinarte hacia delante.']),
  w('wu_frankenstein_walk', 'Caminata Frankenstein', 'hip', 56, ['hip_extension'], ['Extiende la mano al frente con la palma abajo.', 'Patea la pierna contraria hacia la mano con la rodilla lo más recta posible; ritmo constante, sin balanceo.']),
  w('wu_pike_walk', 'Caminata en pica', 'hip', 57, ['hinge'], ['Desde bisagra, camina con las manos hacia delante y vuelve con los pies.', 'No dejes caer el brazo delantero hacia el pie.']),
  w('wu_hip_walk', 'Caminata de cadera', 'hip', 57, ['hip_extension'], ['Abraza una rodilla al pecho mientras avanzas sobre la otra pierna.', 'Sirve también como estiramiento de glúteo.']),
  w('wu_quad_stretch', 'Estiramiento de cuádriceps en marcha', 'knee', 57, ['knee_flexion'], ['Toma el pie por detrás y acerca el talón al glúteo con las rodillas juntas.', 'Mantén el torso erguido; alterna.']),
  w('wu_squat', 'Sentadilla de movilidad', 'general', 58, ['squat'], ['Brazos rectos y paralelos al suelo, pecho erguido.', 'Baja todo lo que puedas con buena forma para mejorar el rango; movilizador fundamental del tren inferior.']),
  w('wu_leg_flexion', 'Flexión de pierna (balanceo frontal)', 'hip', 59, ['hip_extension'], ['Torso erguido, cabeza nivelada.', 'Balancea la pierna adelante y atrás desde la cadera con control.']),
  w('wu_leg_abduction', 'Abducción de pierna (balanceo lateral)', 'hip', 59, ['hip_abduction'], ['Columna neutra, apoyo en una pierna.', 'Balancea la pierna de lado a lado; libera glúteos e ingle.']),
  w('wu_lunge', 'Estocada de movilidad', 'general', 60, ['lunge'], ['Inhala y da un paso al frente con el pie plano; cuerpo erguido, core activo.', 'La rodilla trasera baja cerca del suelo; empuja con el talón delantero para volver.']),
  w('wu_rotational_lunge', 'Estocada con giro', 'general', 61, ['lunge', 'rotation'], ['Estocada al frente y gira el torso hacia la pierna delantera.', 'Vuelve al centro antes de regresar.']),
  w('wu_overhead_lunge', 'Estocada con peso sobre la cabeza', 'general', 61, ['lunge', 'vertical_push'], ['Peso ligero sobre la cabeza con los brazos extendidos.', 'Estocada manteniendo la posición vertical; trabaja estabilizadores de hombro y movilidad de cadera y zona lumbar.']),
]
