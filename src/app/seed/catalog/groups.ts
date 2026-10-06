/**
 * Grupos de sustitución. Cada miembro lleva motivo, equipo propio, complejidad, estabilidad y lateralidad.
 * El orden de sustitución lo calcula domain/catalog/equipment.ts (calidad → compatible → lateralidad → complejidad).
 * functional_rating NO interviene (ajuste 2 del diseño aprobado).
 */
import type { EquipmentItem, ExerciseSubstitutionGroup, MovementPattern, Muscle, SubstitutionMember } from '@domain/entities'
import { SEED_IDS } from '../ids'

const E = SEED_IDS.exercises
type SeedGroup = Omit<ExerciseSubstitutionGroup, 'created_at' | 'updated_at' | 'source'>

const m = (exercise_id: string, quality: SubstitutionMember['quality'], reason: string, equipment: EquipmentItem[],
  complexity: 1 | 2 | 3, stability: 1 | 2 | 3, unilateral = false): SubstitutionMember =>
  ({ exercise_id, quality, reason, equipment, complexity, stability, unilateral })

const g = (id: string, name: string, movement_patterns: MovementPattern[], primary_muscles: Muscle[],
  members: SubstitutionMember[], source_confidence: 'derived' | 'manual' = 'derived'): SeedGroup =>
  ({ id, name, movement_patterns, primary_muscles, members, source_confidence })

export const seedGroups: SeedGroup[] = [
  g('sg_squat', 'Sentadilla (rodilla dominante bilateral)', ['squat'], ['quadriceps', 'glutes'], [
    m(E.squat, 'high', 'Patrón de referencia del grupo.', ['olympic_barbell', 'rack'], 3, 2),
    m('ex_front_squat', 'high', 'Mismo patrón; carga al frente exige más torso.', ['olympic_barbell', 'rack'], 3, 2),
    m('ex_hack_squat', 'medium', 'Mismo patrón con la barra detrás; menor carga posible.', ['olympic_barbell'], 2, 2),
    m(E.gobletSquat, 'medium', 'Mismo patrón con kettlebell; carga limitada (versión casa).', ['kettlebell'], 1, 2),
    m(E.legPress, 'medium', 'Rodilla dominante guiado; sin demanda de estabilidad ni de espalda baja.', ['leg_press'], 1, 1),
    m(E.legExtension, 'low', 'Solo extensión de rodilla; no cubre cadera.', ['machine'], 1, 1),
  ]),
  g('sg_hinge', 'Bisagra de cadera', ['hinge'], ['hamstrings', 'glutes', 'erector_spinae'], [
    m(E.deadlift, 'high', 'Patrón de referencia del grupo.', ['olympic_barbell'], 3, 2),
    m(E.rdl, 'high', 'Bisagra pura; menos cuádriceps.', ['olympic_barbell'], 3, 2),
    m('ex_sldl', 'high', 'Bisagra con rodillas casi rectas.', ['olympic_barbell'], 3, 2),
    m('ex_good_morning', 'medium', 'Bisagra con barra en la espalda; carga menor.', ['olympic_barbell', 'rack'], 3, 2),
    m(E.kbSwing, 'medium', 'Bisagra balística con kettlebell (versión casa).', ['kettlebell'], 2, 2),
    m(E.hipThrust, 'medium', 'Extensión de cadera con espalda descargada; no es bisagra de pie.', ['olympic_barbell', 'bench'], 2, 1),
    m('ex_back_extension', 'low', 'Extensión de cadera/espalda en máquina; carga baja.', ['machine'], 1, 1),
    m(E.legCurl, 'low', 'Solo flexión de rodilla; cubre isquiotibiales, no cadera.', ['machine'], 1, 1),
  ]),
  g('sg_single_leg', 'Unilateral de pierna', ['lunge', 'step'], ['quadriceps', 'glutes', 'hamstrings'], [
    m(E.bulgarian, 'high', 'Referencia: pie trasero elevado con mancuernas.', ['dumbbells', 'bench'], 2, 3, true),
    m('ex_bulgarian_barbell', 'high', 'Misma mecánica con barra.', ['olympic_barbell', 'bench'], 3, 3, true),
    m('ex_db_split_squat', 'high', 'Pie trasero en el suelo; más fácil.', ['dumbbells'], 1, 2, true),
    m('ex_forward_lunge', 'medium', 'Estocada dinámica con mancuernas.', ['dumbbells'], 2, 2, true),
    m('ex_barbell_lunge', 'medium', 'Estocada con barra.', ['olympic_barbell'], 3, 3, true),
    m('ex_step_up', 'medium', 'Subida a banco; rodilla dominante.', ['olympic_barbell', 'bench'], 2, 2, true),
    m('ex_lateral_lunge', 'low', 'Plano frontal; distinto énfasis (aductores).', ['dumbbells'], 2, 2, true),
  ]),
  g('sg_horizontal_push', 'Empuje horizontal', ['horizontal_push'], ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], [
    m(E.bench, 'high', 'Referencia del grupo (key lift).', ['olympic_barbell', 'bench', 'rack'], 2, 2),
    m('ex_db_bench', 'high', 'Mismo patrón con mancuernas.', ['dumbbells', 'bench'], 2, 2),
    m('ex_incline_bench', 'high', 'Mismo patrón inclinado.', ['olympic_barbell', 'incline_bench', 'rack'], 2, 2),
    m(E.inclineDbPress, 'high', 'Inclinado con mancuernas.', ['dumbbells', 'incline_bench'], 2, 2),
    m(E.machineChestPress, 'medium', 'Guiado; menos estabilidad.', ['machine'], 1, 1),
    m('ex_close_grip_bench', 'medium', 'Agarre cerrado; más tríceps.', ['olympic_barbell', 'bench', 'rack'], 2, 2),
    m(E.pushup, 'medium', 'Peso corporal; carga limitada (versión casa).', ['bodyweight'], 1, 2),
    m('ex_incline_fly', 'low', 'Aislamiento de pectoral; no sustituye un press.', ['dumbbells', 'incline_bench'], 1, 1),
    m('ex_machine_fly', 'low', 'Aislamiento en máquina.', ['machine'], 1, 1),
  ]),
  g('sg_vertical_push', 'Empuje vertical', ['vertical_push'], ['deltoid_anterior', 'triceps_brachii'], [
    m(E.dbShoulderPress, 'high', 'Referencia del programa.', ['dumbbells', 'bench'], 2, 2),
    m('ex_military_press', 'high', 'Con barra, de pie.', ['olympic_barbell', 'rack'], 2, 2),
    m('ex_bar_dip', 'medium', 'Empuje vertical descendente; peso corporal.', ['dip_station'], 2, 2),
    m('ex_bench_dip', 'low', 'Fondos en banco; carga limitada.', ['bench'], 1, 1),
    m(E.lateralRaise, 'low', 'Aislamiento de deltoides; no es un press.', ['dumbbells'], 1, 1),
  ]),
  g('sg_horizontal_pull', 'Tracción horizontal', ['horizontal_pull'], ['latissimus_dorsi', 'trapezius', 'rhomboids'], [
    m(E.chestRow, 'high', 'Referencia del programa (key lift), pecho apoyado en máquina.', ['machine'], 1, 1),
    m('ex_prone_row', 'high', 'Pecho apoyado en banco inclinado con mancuernas; misma función, otro ejercicio.', ['dumbbells', 'incline_bench'], 1, 1),
    m(E.cableRow, 'high', 'Remo sentado en polea.', ['cable'], 1, 1),
    m('ex_one_arm_row', 'high', 'Remo a un brazo con mancuerna y apoyo.', ['dumbbells', 'bench'], 1, 2, true),
    m(E.kbRow, 'medium', 'Remo a un brazo con kettlebell (versión casa).', ['kettlebell'], 1, 2, true),
    m('ex_bent_over_row', 'medium', 'Remo inclinado libre; exige espalda baja.', ['olympic_barbell'], 3, 3),
    m('ex_standing_cable_row', 'medium', 'Polea de pie; más core.', ['cable'], 2, 2),
    m('ex_rear_lateral_raise', 'low', 'Aislamiento de deltoides posterior.', ['dumbbells'], 1, 1),
  ]),
  g('sg_vertical_pull', 'Tracción vertical', ['vertical_pull'], ['latissimus_dorsi', 'biceps_brachii', 'teres_major'], [
    m(E.assistedPullup, 'high', 'Referencia del programa.', ['assisted_pullup_machine'], 2, 2),
    m('ex_chin_up', 'high', 'Sin asistencia; requiere fuerza relativa.', ['pull_up_bar'], 2, 2),
    m(E.latPulldown, 'high', 'Polea; carga ajustable.', ['cable'], 1, 1),
    m('ex_pullover', 'low', 'Dorsal en arco; distinta mecánica.', ['olympic_barbell', 'bench'], 2, 2),
    m('ex_straight_arm_pulldown', 'low', 'Aislamiento de dorsal.', ['cable'], 1, 1),
  ]),
  g('sg_rear_delt', 'Deltoides posterior y manguito', ['horizontal_pull', 'shoulder_rotation'], ['deltoid_posterior', 'rotator_cuff'], [
    m(E.facePull, 'high', 'Referencia del programa.', ['cable'], 1, 1),
    m('ex_rear_lateral_raise', 'high', 'Elevación posterior con mancuernas.', ['dumbbells'], 1, 1),
    m('ex_cable_external_rotation', 'medium', 'Rotación externa en polea.', ['cable'], 1, 1, true),
    m('ex_db_external_rotation', 'medium', 'Rotación externa con mancuerna.', ['dumbbells'], 1, 1, true),
    m('ex_scarecrow', 'low', 'Rotación de manguito con poca carga.', ['dumbbells'], 1, 1),
  ], 'manual'),
  g('sg_lateral_delt', 'Deltoides medial', ['shoulder_abduction'], ['deltoid_medial', 'deltoid_anterior'], [
    m(E.lateralRaise, 'high', 'Referencia del programa.', ['dumbbells'], 1, 1),
    m('ex_upright_row', 'medium', 'Remo vertical; compuesto.', ['olympic_barbell'], 2, 1),
    m('ex_front_raise', 'low', 'Deltoides anterior.', ['dumbbells'], 1, 1),
  ]),
  g('sg_triceps', 'Extensión de codo', ['elbow_extension'], ['triceps_brachii'], [
    m(E.tricepsPushdown, 'high', 'Referencia del programa.', ['cable'], 1, 1),
    m(E.overheadTriceps, 'high', 'Sobre la cabeza con mancuerna.', ['dumbbells'], 1, 1),
    m('ex_barbell_triceps_extension', 'medium', 'Con barra.', ['olympic_barbell'], 2, 1),
    m('ex_db_triceps_extension', 'medium', 'Con mancuerna.', ['dumbbells'], 1, 1),
    m('ex_prone_triceps_extension', 'medium', 'En prono con barra.', ['olympic_barbell', 'bench'], 2, 1),
    m('ex_triceps_kickback', 'low', 'Carga muy limitada.', ['dumbbells'], 1, 1, true),
    m('ex_bench_dip', 'medium', 'Fondos en banco; compuesto.', ['bench'], 1, 1),
  ]),
  g('sg_biceps', 'Flexión de codo', ['elbow_flexion'], ['biceps_brachii', 'brachialis'], [
    m(E.dbCurl, 'high', 'Referencia del programa.', ['dumbbells'], 1, 1),
    m(E.hammerCurl, 'high', 'Agarre neutro.', ['dumbbells'], 1, 1),
    m('ex_barbell_curl', 'high', 'Con barra.', ['olympic_barbell'], 1, 1),
    m('ex_cable_curl', 'medium', 'En polea.', ['cable'], 1, 1),
    m('ex_incline_curl', 'medium', 'Inclinado; más estiramiento.', ['dumbbells', 'incline_bench'], 1, 1),
    m('ex_preacher_curl', 'medium', 'Predicador.', ['olympic_barbell', 'other'], 1, 1),
    m('ex_concentration_curl', 'low', 'Unilateral; carga baja.', ['dumbbells'], 1, 1, true),
    m('ex_reverse_curl', 'low', 'Pronación; más braquiorradial.', ['olympic_barbell'], 1, 1),
  ]),
  g('sg_calf', 'Flexión plantar', ['ankle_plantarflexion'], ['gastrocnemius', 'soleus'], [
    m(E.calfStanding, 'high', 'Referencia del programa (de pie).', ['olympic_barbell', 'rack'], 1, 2),
    m(E.calfSeated, 'high', 'Sentado; sóleo.', ['machine'], 1, 1),
  ]),
  g('sg_anti_extension', 'Core anti-extensión / flexión', ['anti_extension', 'spinal_flexion'], ['rectus_abdominis', 'obliques_external'], [
    m(E.plank, 'high', 'Referencia del programa (isométrico).', ['bodyweight'], 1, 2),
    m(E.cableCrunch, 'high', 'Flexión cargada en polea.', ['cable'], 1, 1),
    m('ex_v_leg_raise', 'medium', 'Elevación de piernas.', ['bodyweight'], 2, 2),
    m('ex_ball_jackknife', 'medium', 'Con pelota.', ['stability_ball'], 2, 3),
    m('ex_crunch', 'medium', 'Crunch básico.', ['bodyweight'], 1, 1),
    m('ex_reverse_crunch', 'medium', 'Crunch inverso.', ['bodyweight'], 1, 1),
    m('ex_sit_up', 'low', 'Más flexores de cadera.', ['bodyweight'], 1, 1),
  ]),
  g('sg_lateral_core', 'Core lateral / rotación', ['anti_lateral_flexion', 'lateral_flexion', 'rotation'], ['obliques_external', 'obliques_internal'], [
    m('ex_side_plank', 'high', 'Isométrico lateral.', ['bodyweight'], 1, 2, true),
    m('ex_suitcase_deadlift', 'high', 'Carga asimétrica de pie.', ['dumbbells'], 2, 2, true),
    m('ex_woodchop', 'medium', 'Rotación en polea.', ['cable'], 2, 2, true),
    m('ex_lateral_bend', 'medium', 'Flexión lateral con mancuerna.', ['dumbbells'], 1, 1, true),
    m('ex_ball_twist', 'low', 'Rotación con pelota.', ['stability_ball'], 2, 3),
  ]),
]
