/**
 * Utilidades de foto en el navegador (Fase 8.8). Todo local: lectura del archivo, miniatura con canvas,
 * object URLs que se revocan. Nunca se sube nada a ningún sitio.
 */
export const THUMB_MAX = 320

export async function readImage(file: Blob): Promise<{ width: number; height: number; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(file)
  return { width: bitmap.width, height: bitmap.height, bitmap }
}

export async function makeThumb(bitmap: ImageBitmap, max = THUMB_MAX): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo crear la miniatura'))), 'image/jpeg', 0.8))
}
