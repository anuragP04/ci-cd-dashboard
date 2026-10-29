function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="skel">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-line" key={i}>
          <span className="shim row w-lg" />
          <span className="shim row w-sm" />
          <span className="shim row w-sm" />
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
        <h1>Delivery</h1>
        <span className="stamp">
          <span className="spinner" />
          loading
        </span>
      </header>
      {[
        { title: 'Right now', rows: 2 },
        { title: 'Release matrix', rows: 6 },
        { title: 'Open pull requests', rows: 5 },
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
