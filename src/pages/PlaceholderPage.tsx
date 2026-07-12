interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="surface-card placeholder-panel">
      <h1 style={{ marginTop: 0, letterSpacing: '-0.03em' }}>{title}</h1>
      <p>Dieser Bereich ist im ersten Meilenstein noch nicht umgesetzt.</p>
    </div>
  )
}
