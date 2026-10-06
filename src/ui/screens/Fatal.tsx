/** Pantalla de error fatal de arranque (IndexedDB no disponible o migración fallida). */
export function Fatal({ message }: { message: string }) {
  return (
    <div className="shell">
      <main className="content">
        <div className="banner">{message}</div>
        <p className="muted">
          Abre la app instalada en la pantalla de inicio o revisa el espacio del navegador. Tus datos no se han
          modificado.
        </p>
      </main>
    </div>
  )
}
