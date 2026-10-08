/**
 * Copiar texto plano — Fase 8.10. API estándar del navegador (Clipboard API). Sin red.
 * Devuelve false si el portapapeles no está disponible o falla; la UI muestra entonces el texto seleccionable.
 */
export interface ClipboardLike { writeText(text: string): Promise<void> }

export async function copyText(text: string, clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard): Promise<boolean> {
  if (!clipboard || typeof clipboard.writeText !== 'function') return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
