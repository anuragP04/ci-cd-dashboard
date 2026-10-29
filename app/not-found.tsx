import { getProjects } from '@/lib/config'

export default function NotFound() {
  return (
    <main className="wrap">
      <header className="head">
        <h1>Delivery</h1>
      </header>
      <div className="panel">
        <div className="idle">
          No such project. Configured projects:{' '}
          {getProjects().map((p) => p.key).join(', ') || 'none'}.
        </div>
      </div>
    </main>
  )
}
