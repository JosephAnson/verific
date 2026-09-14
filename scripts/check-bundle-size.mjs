import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

// Measure all public core exports together, leaving the application's Vue external.
const budget = 12000
const result = await build({
  entryPoints: [fileURLToPath(new URL('../packages/core/dist/main.js', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['vue'],
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
})
const bytes = gzipSync(result.outputFiles[0].contents, { level: 9 }).byteLength
console.log(`Core: ${bytes} bytes minified + gzip (budget ${budget} bytes; Vue excluded).`)
if (bytes > budget)
  throw new Error(`Core exceeds its gzip budget by ${bytes - budget} bytes.`)
