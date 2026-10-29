import { notFound } from 'next/navigation'
import { getProject, getProjects } from '@/lib/config'
import { getCachedProjectData } from '@/lib/data'
import ActivityStrip from '@/components/ActivityStrip'
import ReleaseMatrix from '@/components/ReleaseMatrix'
import PullRequestQueue from '@/components/PullRequestQueue'
import RefreshButton from '@/components/RefreshButton'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ project: string }>
}) {
  const { project: key } = await params
  const project = getProject(key)
  if (!project) notFound()

  const data = await getCachedProjectData(project)
  const busy = new Set(data.active.map((r) => r.repo))
  const idle = project.repos.map((r) => r.name).filter((n) => !busy.has(n))

  return (
    <main className="wrap">
      <header className="head">
        <h1>Delivery</h1>
        <nav className="tabs">
          {getProjects().map((p) => (
            <a key={p.key} href={`/${p.key}`} className={`tab${p.key === key ? ' on' : ''}`}>
              {p.name}
            </a>
          ))}
        </nav>
        <RefreshButton projectKey={key} fetchedAt={data.fetchedAt} />
      </header>

      {data.warnings.length > 0 && (
        <div className="warn">
          <b>Config or access problems</b>
          <ul>
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <ActivityStrip runs={data.active} idle={idle} />
      <ReleaseMatrix project={project} rows={data.rows} />
      <PullRequestQueue pulls={data.pulls} />
    </main>
  )
}
