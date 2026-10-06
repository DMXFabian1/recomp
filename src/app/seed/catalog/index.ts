/**
 * Catálogo v2 (Fase 8.2). `seedCatalogExercises` reemplaza la lista v1 de 30 ejercicios con el catálogo
 * completo (113): los 30 del programa conservan sus ids; 104 provienen del libro y 9 son manuales.
 */
import { bookExercises, type SeedExercise } from './book-exercises'
import { manualExercises } from './manual-exercises'

export { bookExercises, manualExercises }
export { seedVariants } from './variants'
export { seedGroups } from './groups'
export { seedWarmups } from './warmups'
export { seedGoals } from './goals'
export type { SeedExercise }

export const seedCatalogExercises: SeedExercise[] = [...bookExercises, ...manualExercises]

/** Perfiles de equipamiento iniciales (Settings). `home` = lo que Dany tiene en casa; `gym` = todo. */
export const seedEquipmentProfiles = {
  home: { name: 'Casa', items: ['olympic_barbell', 'rack', 'bench', 'kettlebell', 'bodyweight'] as const, max_load_kg: 24 },
  gym: { name: 'Gimnasio', items: [
    'olympic_barbell', 'rack', 'bench', 'incline_bench', 'dumbbells', 'kettlebell', 'cable', 'machine', 'leg_press',
    'pull_up_bar', 'assisted_pullup_machine', 'dip_station', 'bodyweight', 'resistance_band', 'stability_ball', 'smith_machine', 'other',
  ] as const },
}
