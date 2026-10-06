/**
 * Variantes. `direct` = el libro las lista en un recuadro VARIACIÓN de la ficha padre.
 * `derived` = relación obvia entre dos fichas del libro (misma mecánica, distinto implemento/ángulo).
 * NO existe variante entre ex_prone_row (mancuernas, banco inclinado) y ex_chest_supported_row (máquina):
 * se relacionan solo por grupo de sustitución (ajuste 1 del diseño aprobado).
 */
import type { ExerciseVariant } from '@domain/entities'
import { BOOK_SOURCE } from '@domain/entities'
import { SEED_IDS } from '../ids'

const E = SEED_IDS.exercises
type SeedVariant = Omit<ExerciseVariant, 'created_at' | 'updated_at' | 'source'>

const v = (id: string, parent: string, name: string, type: ExerciseVariant['variant_type'],
  difficulty: ExerciseVariant['difficulty_change'], page: number, confidence: 'direct' | 'derived',
  extra: Partial<Pick<ExerciseVariant, 'variant_exercise_id' | 'equipment_change' | 'grip_change' | 'stance_change' | 'stability_change' | 'unilateral_change'>> = {}): SeedVariant => ({
  id, parent_exercise_id: parent, name, variant_type: type, difficulty_change: difficulty,
  catalog_source: BOOK_SOURCE, source_page: page, source_confidence: confidence, ...extra,
})

export const seedVariants: SeedVariant[] = [
  // ── Directas (recuadro VARIACIÓN) ──
  v('var_squat_sumo', E.squat, 'Sentadilla sumo', 'stance', 'similar', 64, 'direct', { stance_change: 'Pies muy abiertos y puntas hacia fuera; más aductores y glúteos.' }),
  v('var_deadlift_db', E.deadlift, 'Peso muerto con mancuernas', 'equipment', 'easier', 87, 'direct', { equipment_change: 'Mancuernas en vez de barra; más estabilizadores; útil para aprender.' }),
  v('var_rdl_rack', E.rdl, 'Peso muerto rumano desde rack', 'range', 'similar', 88, 'direct', { equipment_change: 'Barra apoyada en rack ajustado a la altura; agarre mixto o muñequeras con cargas altas.' }),
  v('var_leg_press_single', E.legPress, 'Prensa a una pierna', 'unilateral', 'harder', 79, 'direct', { unilateral_change: 'Una pierna por vez para corregir desequilibrios.' }),
  v('var_leg_press_stance', E.legPress, 'Prensa con pies altos / abiertos', 'stance', 'similar', 79, 'direct', { stance_change: 'Pies más altos = más glúteos; pies abiertos y hacia fuera = más aductores.' }),
  v('var_db_press_machine', E.dbShoulderPress, 'Press de hombros en máquina', 'equipment', 'easier', 125, 'direct', { equipment_change: 'Máquina guiada; menos estabilizadores (el libro lo considera menos efectivo).', stability_change: 'Menor demanda de estabilidad.' }),
  v('var_db_press_standing', E.dbShoulderPress, 'Press de hombros de pie / alterno', 'stability', 'harder', 125, 'direct', { stability_change: 'De pie exige más core; alterno permite más control.' }),
  v('var_pushup_ball', E.pushup, 'Lagartijas con manos en pelota', 'stability', 'harder', 120, 'direct', { variant_exercise_id: 'ex_ball_pushup', stability_change: 'Superficie inestable; más estabilizadores.' }),
  v('var_plank_superman', E.plank, 'Plancha superman', 'stability', 'harder', 174, 'direct', { stability_change: 'Extiende brazo y pierna opuestos.' }),
  v('var_plank_knees', E.plank, 'Plancha sobre rodillas', 'range', 'easier', 174, 'direct', { stance_change: 'Apoyo en rodillas en lugar de pies.' }),
  v('var_cable_row_one_arm', E.cableRow, 'Remo en polea a un brazo', 'unilateral', 'similar', 96, 'direct', { unilateral_change: 'Un brazo por vez para equilibrar lados.' }),
  v('var_calf_smith', E.calfStanding, 'Elevación de pantorrillas en Smith', 'equipment', 'easier', 84, 'direct', { equipment_change: 'Máquina Smith estabiliza el cuerpo.', stability_change: 'Menor demanda de equilibrio.' }),
  v('var_lateral_raise_prone', E.lateralRaise, 'Elevación lateral en prono', 'angle', 'similar', 133, 'direct', { stance_change: 'Boca abajo sobre banco inclinado; deltoides posterior.' }),
  v('var_scarecrow_prone', 'ex_scarecrow', 'Espantapájaros en prono', 'angle', 'similar', 135, 'direct', { stance_change: 'Boca abajo sobre banco.' }),
  v('var_prone_row_ball', 'ex_prone_row', 'Remo prono sobre pelota', 'stability', 'harder', 106, 'direct', { stability_change: 'Pecho sobre pelota de ejercicio; más estabilizadores.' }),
  v('var_military_seated', 'ex_military_press', 'Press militar sentado', 'stability', 'easier', 124, 'direct', { stability_change: 'Sentado; menos demanda de core.' }),
  v('var_upright_row_db', 'ex_upright_row', 'Remo vertical con mancuernas / polea', 'equipment', 'similar', 126, 'direct', { equipment_change: 'Mancuernas o polea en vez de barra.' }),
  v('var_close_grip_pushup', 'ex_close_grip_bench', 'Lagartijas con agarre cerrado', 'equipment', 'easier', 146, 'direct', { equipment_change: 'Peso corporal; manos juntas.' }),
  v('var_incline_fly_flat', 'ex_incline_fly', 'Aperturas planas', 'angle', 'similar', 114, 'direct', { stance_change: 'Banco plano.' }),
  v('var_crossover_low', 'ex_cable_crossover', 'Cruce de polea baja / intermedia', 'angle', 'similar', 116, 'direct', { stance_change: 'Poleas a distinta altura cambian la porción del pectoral.' }),
  v('var_pushup_elevated', 'ex_frame_pushup', 'Lagartija en marco elevado', 'angle', 'easier', 121, 'direct', { stance_change: 'Mayor elevación de manos = más fácil.' }),
  v('var_woodchop_low', 'ex_woodchop', 'Woodchop de polea baja', 'angle', 'similar', 179, 'direct', { stance_change: 'De abajo hacia arriba.' }),
  v('var_9090_twist', 'ex_9090_crunch', 'Crunch 90/90 con giro', 'range', 'harder', 167, 'direct', { stance_change: 'Añade rotación.' }),
  v('var_crunch_twist', 'ex_crunch', 'Crunch con giro', 'range', 'similar', 162, 'direct', { stance_change: 'Codo hacia la rodilla contraria.' }),

  // ── Derivadas (dos fichas del libro, misma mecánica) ──
  v('var_bench_db', E.bench, 'Press de banca con mancuernas', 'equipment', 'similar', 110, 'derived', { variant_exercise_id: 'ex_db_bench', equipment_change: 'Mancuernas; mayor rango de movimiento.' }),
  v('var_bench_incline', E.bench, 'Press inclinado con barra', 'angle', 'similar', 112, 'derived', { variant_exercise_id: 'ex_incline_bench', stance_change: 'Banco inclinado; más deltoides anterior.' }),
  v('var_incline_db_from_bb', 'ex_incline_bench', 'Press inclinado con mancuernas', 'equipment', 'similar', 113, 'derived', { variant_exercise_id: E.inclineDbPress, equipment_change: 'Mancuernas; mayor rango.' }),
  v('var_squat_front', E.squat, 'Sentadilla frontal', 'load_position', 'harder', 66, 'derived', { variant_exercise_id: 'ex_front_squat', grip_change: 'Barra al frente sobre los deltoides.' }),
  v('var_squat_hack', E.squat, 'Sentadilla hack con barra', 'load_position', 'similar', 67, 'derived', { variant_exercise_id: 'ex_hack_squat', grip_change: 'Barra detrás de las piernas.' }),
  v('var_bulgarian_bb', E.bulgarian, 'Sentadilla búlgara con barra', 'equipment', 'harder', 70, 'derived', { variant_exercise_id: 'ex_bulgarian_barbell', equipment_change: 'Barra en la espalda en vez de mancuernas.' }),
  v('var_split_squat_db', E.bulgarian, 'Sentadilla dividida con mancuernas (pie trasero en el suelo)', 'stance', 'easier', 68, 'derived', { variant_exercise_id: 'ex_db_split_squat', stance_change: 'Pie trasero en el suelo.' }),
  v('var_deadlift_sldl', E.deadlift, 'Peso muerto con piernas rectas', 'range', 'similar', 85, 'derived', { variant_exercise_id: 'ex_sldl', stance_change: 'Rodillas casi extendidas; más isquiotibiales.' }),
  v('var_pullup_assisted_chin', E.assistedPullup, 'Dominada sin asistencia', 'equipment', 'harder', 94, 'derived', { variant_exercise_id: 'ex_chin_up', equipment_change: 'Sin máquina de asistencia.' }),
  v('var_cable_row_standing', E.cableRow, 'Remo en polea de pie', 'stability', 'harder', 98, 'derived', { variant_exercise_id: 'ex_standing_cable_row', stability_change: 'De pie; más core.' }),
  v('var_military_db', 'ex_military_press', 'Press de hombros con mancuernas', 'equipment', 'similar', 125, 'derived', { variant_exercise_id: E.dbShoulderPress, equipment_change: 'Mancuernas; no hay que esquivar la cara.' }),
  v('var_pushdown_overhead', E.tricepsPushdown, 'Extensión de tríceps sobre la cabeza', 'angle', 'similar', 148, 'derived', { variant_exercise_id: E.overheadTriceps, stance_change: 'Brazos sobre la cabeza; más cabeza larga.' }),
  v('var_curl_hammer', 'ex_barbell_curl', 'Curl martillo', 'grip', 'similar', 150, 'derived', { variant_exercise_id: E.hammerCurl, grip_change: 'Agarre neutro; más braquial y braquiorradial.' }),
  v('var_plank_side', E.plank, 'Plancha lateral', 'angle', 'similar', 175, 'derived', { variant_exercise_id: 'ex_side_plank', stance_change: 'De lado; anti-flexión lateral.' }),
  v('var_bench_dip_bar', 'ex_bench_dip', 'Fondos en barras', 'equipment', 'harder', 141, 'derived', { variant_exercise_id: 'ex_bar_dip', equipment_change: 'Barras paralelas; todo el peso corporal.' }),
  v('var_ext_rotation_cable', 'ex_db_external_rotation', 'Rotación externa en polea', 'equipment', 'similar', 136, 'derived', { variant_exercise_id: 'ex_cable_external_rotation', equipment_change: 'Polea en vez de mancuerna; tensión constante.' }),
]
