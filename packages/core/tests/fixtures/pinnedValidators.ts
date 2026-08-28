import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const valibotRoot = findPackageRoot('valibot')
const zodRoot = findPackageRoot('zod')

export const valibotVersion: string = readVersion(valibotRoot)
export const zodVersion: string = readVersion(zodRoot)

export async function loadValibot() {
  return await import(/* @vite-ignore */ pathToFileURL(resolve(valibotRoot, 'dist/index.mjs')).href)
}

export async function loadZod() {
  return (await import(/* @vite-ignore */ pathToFileURL(resolve(zodRoot, 'index.js')).href)).z
}

function readVersion(root: string): string {
  return (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version
}

function findPackageRoot(packageName: string): string {
  const workspaceRoots = [process.cwd(), resolve(process.cwd(), '../..')]
  const candidates = workspaceRoots.flatMap(root => [
    resolve(root, 'playgrounds/nuxt/node_modules', packageName),
    resolve(root, 'playgrounds/nuxt/.output/server/node_modules', packageName),
  ])
  const packageRoot = candidates.find(candidate => existsSync(resolve(candidate, 'package.json')))
  if (!packageRoot) {
    throw new Error(`Cannot find pinned ${packageName} package in the Nuxt playground`)
  }
  return packageRoot
}
