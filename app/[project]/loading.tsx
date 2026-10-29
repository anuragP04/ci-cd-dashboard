export default function Loading() {
  return (
    <main className="wrap">
      <header className="head">
        <h1>Delivery</h1>
        <span className="stamp">loading…</span>
      </header>
      {['Right now', 'Release matrix', 'Open pull requests'].map(
        (title) => (
          <section className="panel" key={title}>
            <div className="panel-head">
              <h2>{title}</h2>
            </div>
            <div className="idle">Fetching from GitHub…</div>
          </section>
        ),
      )}
    </main>
  )
}
