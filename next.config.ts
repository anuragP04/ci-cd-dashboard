import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Pin the workspace root. Without this, a stray package-lock.json in a parent
  // directory makes Turbopack walk up and infer the home directory as the root.
  turbopack: { root: path.resolve(process.cwd()) },
}

export default nextConfig
