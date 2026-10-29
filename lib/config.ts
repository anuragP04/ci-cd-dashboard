import raw from '@/config/projects.json'
import type { Config, ProjectConfig } from './types'

// The JSON import is inferred as a union of per-repo literal shapes, which
// does not widen to Record<string, string>. Cast through unknown.
const config = raw as unknown as Config

export function getProjects(): ProjectConfig[] {
  return config.projects
}

export function getProject(key: string): ProjectConfig | undefined {
  return config.projects.find((p) => p.key === key)
}
