import { redirect } from 'next/navigation'
import { getProjects } from '@/lib/config'

export default function Home() {
  const first = getProjects()[0]
  if (!first) return <div className="wrap">No projects configured.</div>
  redirect(`/${first.key}`)
}
