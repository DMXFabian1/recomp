import { createContext, useContext } from 'react'
import type { BootResult } from '@app/bootstrap'

export const AppContext = createContext<BootResult | null>(null)

/** Acceso al Storage y al resultado del arranque desde la UI. Nunca expone Dexie. */
export function useApp(): BootResult {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp fuera de AppContext')
  return ctx
}
