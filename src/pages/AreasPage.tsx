import { areas } from '../data/areas'
import { AreaCard } from '../components/AreaCard'

export function AreasPage() {
  return (
    <div className="app-shell">
      <main className="page page--home">
        <header className="page-header">
          <h1 className="page-title">Greenkeeper</h1>
          <p className="page-subtitle">Meine Flächen</p>
        </header>

        <section aria-labelledby="areas-heading">
          <h2 id="areas-heading" className="section-title">
            Flächen
          </h2>
          <div className="card-grid">
            {areas.map((area) => (
              <AreaCard key={area.id} area={area} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
