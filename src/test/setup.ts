import 'fake-indexeddb/auto'
// jest-dom se importa en los tests de UI (entorno jsdom)
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'

// Base de datos limpia en cada test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
