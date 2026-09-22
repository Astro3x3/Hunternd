/**
 * Node ESM loader hook that resolves bundler-style extensionless imports.
 *
 * The app's source uses `from '../data/monsters'` because Vite resolves that,
 * but plain Node requires the extension. This hook retries failed resolutions
 * with `.js` / `.jsx` / `/index.js` so the headless sim test can import the
 * real gameplay modules without touching them.
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const CANDIDATES = ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    // Only retry for relative/absolute paths that simply lack an extension.
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error

    for (const ext of CANDIDATES) {
      try {
        return await nextResolve(specifier + ext, context)
      } catch {
        /* try the next candidate */
      }
    }
    throw error
  }
}

// Self-register when loaded via --import.
register(pathToFileURL(import.meta.filename))
