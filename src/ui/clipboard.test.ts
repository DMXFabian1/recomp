/** Fase 8.10 — copiar al portapapeles y privacidad estática del código del reporte. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  it('escribe exactamente el texto recibido (texto plano)', async () => {
    const writeText = vi.fn(async (_t: string) => {})
    expect(await copyText('RECOMP COACH REPORT\nEND REPORT', { writeText })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('RECOMP COACH REPORT\nEND REPORT')
  })
  it('sin portapapeles o con error → false (la UI muestra el texto seleccionable)', async () => {
    expect(await copyText('x', undefined)).toBe(false)
    expect(await copyText('x', { writeText: async () => { throw new Error('denied') } })).toBe(false)
  })
})

describe('privacidad: el código de 8.10 no tiene red ni fotos', () => {
  const SRC = join(__dirname, '..')
  const files = [
    ...readdirSync(join(SRC, 'domain/report')).filter(f => !f.endsWith('.test.ts')).map(f => join(SRC, 'domain/report', f)),
    join(SRC, 'app/services/report.ts'), join(SRC, 'ui/components/CoachReportPanel.tsx'), join(SRC, 'ui/clipboard.ts'),
  ]
  const backupFiles = [
    ...readdirSync(join(SRC, 'domain/backup')).filter(f => !f.endsWith('.test.ts')).map(f => join(SRC, 'domain/backup', f)),
    join(SRC, 'app/services/backup.ts'), join(SRC, 'ui/components/DataPanel.tsx'),
  ]
  for (const f of backupFiles) {
    it(`8.11 ${f.slice(SRC.length + 1)}: sin red ni ejecución de contenido`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|https?:\/\//)
      expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|innerHTML|dangerouslySetInnerHTML/)
    })
  }
  for (const f of files) {
    it(f.slice(SRC.length + 1), () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|https?:\/\//)
      expect(src).not.toMatch(/progress_photos|savePhoto|getPhoto|listPhotos|FileReader|toDataURL|base64/)
    })
  }
})
