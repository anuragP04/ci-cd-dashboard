function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="skel">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-line" key={i}>
          <span className="shim row w-lg" />
          <span className="shim row w-md" />
          <span className="shim row w-sm" />
        </div>
      ))}
    </div>
  )
}

export default function Loading() {
  return (
    <main className="wrap">
      <header className="head">
        <h1>
          <span className="back">← back</span>
        </h1>
        <span className="stamp">
          <span className="spinner" />
          loading
        </span>
      </header>
      {[
        { title: 'Pull requests', rows: 4 },
        { title: 'Pipeline', rows: 1 },
        { title: 'Recent activity', rows: 3 },
      ].map((p) => (
        <section className="panel" key={p.title}>
          <div className="panel-head">
            <h2>{p.title}</h2>
          </div>
          <Skeleton rows={p.rows} />
        </section>
      ))}
    </main>
  )
}
