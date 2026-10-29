import raw from '@/config/projects.json'
import type { Config, ProjectConfig } from './types'

const config = raw as Config

export function getProjects(): ProjectConfig[] {
  return config.projects
}

export function getProject(key: string): ProjectConfig | undefined {
  return config.projects.find((p) => p.key === key)
}
