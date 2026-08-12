/**
 * On-disk image store: generated PNGs land under
 * `$DSH_HOME/ernie-image/<YYYY-MM-DD>/` so users can find and reuse files
 * outside the session log. The attachment store is the durable source for
 * the agent; these files are the human-facing copy.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/**
 * Base directory for generated images (`$DSH_HOME/ernie-image`), resolved
 * from the root-provided `dshHomePath` resolver with a bare fallback for
 * non-standard deployments.
 */
export function ernieDataDir(ctx: Context): string {
  const home = ctx.get('dshHomePath') as undefined | ((...segments: string[]) => string)
  if (home !== undefined) return home('ernie-image')
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ernie-image')
}

/**
 * Persist one PNG under the plugin data directory.
 * @param dataDir - base directory from {@link ernieDataDir}.
 * @param data - decoded PNG bytes.
 * @param stem - filename stem (timestamp and index are appended).
 * @returns the absolute path written.
 */
export function savePngToDisk(dataDir: string, data: Uint8Array, stem: string): string {
  const day = new Date().toISOString().slice(0, 10)
  const dir = join(dataDir, day)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${stem}-${Date.now()}.png`)
  writeFileSync(file, data)
  return file
}

/** Human-friendly attachment display name for one generated image. */
export function attachmentName(stem: string, index: number): string {
  return `${stem}-${index}.png`
}

/** Last path segment, for compact tool output. */
export function fileName(path: string): string {
  return basename(path)
}
