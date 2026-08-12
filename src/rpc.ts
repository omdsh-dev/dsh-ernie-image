/**
 * `/ernie-image` RPC channel (loopback): settings-page transports (credential
 * writes, config patches, connection probe) and the gallery generation
 * endpoint consumed by the browser panel.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { transportError } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { ErnieImageConfig } from './config.ts'
import { ERNIE_IMAGE_API_KEY, UNCONFIGURED_MESSAGE } from './credentials.ts'
import { ErnieApiError } from './ernie.ts'
import { produceImages, type GenerationCall } from './tools.ts'

export const ERNIE_RPC_CHANNEL = '/ernie-image'

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

/** Settings-page credential view: state only, never a value. */
interface CredentialView {
  name: string
  configured: boolean
  source: string | null
  writable: boolean
}

/** Gallery generate payload (client → host). */
interface GalleryGeneratePayload {
  prompt: string
  size: ErnieImageConfig['size']
  n: number
  seed?: number
  usePe: boolean
  steps: number
  guidance: number
}

export function registerErnieRpc(
  ctx: Context, scope: SettingsScope<ErnieImageConfig>,
): () => void {
  const handle = ctx.connection.rpc.handle(ERNIE_RPC_CHANNEL, async (endpoint, payload, signal) => {
    try {
      switch (endpoint) {
        case 'settings/describe': return ok(await describeState(ctx, scope))
        case 'settings/credentials': return ok(await writeCredentials(ctx, payload))
        case 'settings/config': return ok(await updateConfig(scope, payload))
        case 'settings/probe': return ok(await probe(ctx))
        case 'gallery/generate': return ok(await galleryGenerate(ctx, scope, payload, signal))
        default: return transportError<unknown>(new Error(`ERNIE 文生图 RPC 未知端点: ${endpoint}`))
      }
    } catch (error) {
      return transportError<unknown>(error)
    }
  }, { authority: 'loopback' })
  return () => { void handle() }
}

async function describeState(ctx: Context, scope: SettingsScope<ErnieImageConfig>) {
  const info = await ctx.credentials.describe(ERNIE_IMAGE_API_KEY)
  const credentials: CredentialView[] = [{
    name: ERNIE_IMAGE_API_KEY,
    configured: info.configured,
    source: info.source ?? null,
    writable: info.writable,
  }]
  return { config: scope.get(), credentials }
}

async function writeCredentials(ctx: Context, payload: unknown): Promise<{ saved: boolean }> {
  const patch = (payload ?? {}) as { value?: string }
  if (patch.value === undefined) return { saved: false }
  if (patch.value === '') {
    await ctx.credentials.unset(ERNIE_IMAGE_API_KEY)
  } else {
    await ctx.credentials.set(ERNIE_IMAGE_API_KEY, patch.value)
  }
  return { saved: true }
}

async function updateConfig(scope: SettingsScope<ErnieImageConfig>, payload: unknown): Promise<ErnieImageConfig> {
  const patch = (payload ?? {}) as { patch?: Partial<ErnieImageConfig> }
  await scope.update(patch.patch ?? {})
  return scope.get()
}

/** Minimal connection probe: the same n=1 request the test tool performs. */
async function probe(ctx: Context) {
  const started = Date.now()
  const credential = await ctx.credentials.resolve(ERNIE_IMAGE_API_KEY)
  if (credential === undefined) {
    return { ok: false, latencyMs: Date.now() - started, error: UNCONFIGURED_MESSAGE }
  }
  try {
    const [image] = await produceImages(ctx, () => scopeDefault(), {
      prompt: 'a small red circle on white background',
      size: '1024x1024',
      n: 1,
      seed: undefined,
      usePe: false,
      steps: 4,
      guidance: 1.0,
    }, AbortSignal.timeout(90_000))
    return { ok: true, latencyMs: Date.now() - started, bytes: image.data.byteLength }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof ErnieApiError
        ? `HTTP ${error.status ?? '—'} [${error.apiCode ?? '—'}] ${error.detail}`
        : error instanceof Error ? error.message : String(error),
    }
  }
}

/** Fallback config for the probe (settings-independent minimal call). */
function scopeDefault(): ErnieImageConfig {
  return { size: '1024x1024', usePe: true, steps: 8, guidance: 1.0, panel: { enabled: true } }
}

async function galleryGenerate(
  ctx: Context, scope: SettingsScope<ErnieImageConfig>, payload: unknown, signal: AbortSignal | undefined,
) {
  const input = (payload ?? {}) as Partial<GalleryGeneratePayload>
  if (typeof input.prompt !== 'string' || input.prompt.trim() === '') {
    throw new Error('prompt 不能为空')
  }
  const config = scope.get()
  const call: GenerationCall = {
    prompt: input.prompt.trim(),
    size: input.size ?? config.size,
    n: Math.min(4, Math.max(1, Math.trunc(input.n ?? 1))),
    seed: input.seed,
    usePe: input.usePe ?? config.usePe,
    steps: Math.min(20, Math.max(4, Math.trunc(input.steps ?? config.steps))),
    guidance: Math.min(7.5, Math.max(1, input.guidance ?? config.guidance)),
  }
  const images = await produceImages(ctx, () => scope.get(), call, signalTimeout(signal, 120_000))
  return {
    model: 'ERNIE-Image-Turbo',
    prompt: call.prompt,
    size: call.size,
    seed: call.seed,
    usePe: call.usePe,
    images: images.map(image => ({
      index: image.index,
      attachment: image.attachment,
      path: image.path,
      fileName: image.fileName,
      seed: image.seed,
      revisedPrompt: image.revisedPrompt,
      base64: Buffer.from(image.data).toString('base64'),
    })),
  }
}

function signalTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  if (signal !== undefined) return AbortSignal.any([signal, AbortSignal.timeout(ms)])
  return AbortSignal.timeout(ms)
}
