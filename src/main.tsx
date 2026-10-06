import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { bootstrap, type BootResult } from '@app/bootstrap'
import { isAppError } from '@domain/errors'
import { AppContext } from '@ui/AppContext'
import App from './App'
import { Fatal } from '@ui/screens/Fatal'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Actualizaciones del service worker: la nueva versión espera; se ofrece [ACTUALIZAR].
const updateSW = registerSW({
  onNeedRefresh() {
    // Fase 8.1: confirmación mínima; la UI definitiva llega con la pantalla MÁS.
    if (window.confirm('Nueva versión disponible. ¿Actualizar ahora?')) void updateSW(true)
  },
})

bootstrap()
  .then((boot: BootResult) => {
    root.render(
      <StrictMode>
        <AppContext.Provider value={boot}>
          <App />
        </AppContext.Provider>
      </StrictMode>,
    )
  })
  .catch((e: unknown) => {
    const message = isAppError(e)
      ? e.message
      : 'No se pueden guardar datos en este navegador.'
    console.error(e)
    root.render(<Fatal message={message} />)
  })
