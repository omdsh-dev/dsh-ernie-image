/**
 * The two model-facing tools: `ernie_generate_image` (prompt → durable
 * session attachments + on-disk PNGs) and `ernie_image_test` (connection
 * probe). Both resolve the credential per operation and answer unconfigured
 * calls with the settings-card guidance instead of a raw auth failure.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { ErnieImageConfig } from './config.ts'
import { ERNIE_IMAGE_SIZES } from './config.ts'
import { ERNIE_IMAGE_API_KEY, UNCONFIGURED_MESSAGE } from './credentials.ts'
import { ERNIE_MODEL, ErnieApiError, generateImages, randomSeed, type GeneratedImage } from './ernie.ts'
import { attachmentName, ernieDataDir, fileName, savePngToDisk } from './image-store.ts'

/** Tool-level generation input after defaults fill. */
export interface GenerationCall {
  prompt: string
  size: ErnieImageConfig['size']
  n: number
  seed: number | undefined
  usePe: boolean
  steps: number
  guidance: number
}

/** One produced image: the attachment, the disk copy, and provenance. */
export interface ProducedImage {
  index: number
  attachment: ImageAttachmentRef
  path: string
  fileName: string
  seed: number | null
  revisedPrompt: string | null
  /** Decoded PNG bytes; kept so callers (RPC gallery) can base64 them. */
  data: Uint8Array
}

/**
 * The JSON-safe projection a tool result carries: the byte-carrying shape
 * above minus `data`, with the attachment narrowed to plain fields and
 * `revisedPrompt` as a nullable string, so the whole value satisfies the
 * tool registry's JsonValue contract.
 */
export interface ProducedImageView {
  index: number
  attachment: {
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name: string
  }
  path: string
  fileName: string
  seed: number | null
  revisedPrompt: string | null
}

/** Narrow one produced image to its JSON-safe tool view. */
export function toImageView(image: ProducedImage): ProducedImageView {
  return {
    index: image.index,
    attachment: {
      attachmentId: String(image.attachment.attachmentId),
      mediaType: image.attachment.mediaType,
      bytes: image.attachment.bytes,
      width: image.attachment.width,
      height: image.attachment.height,
      name: image.attachment.name ?? image.fileName,
    },
    path: image.path,
    fileName: image.fileName,
    seed: image.seed,
    revisedPrompt: image.revisedPrompt,
  }
}

/**
 * Trust-boundary cast: the shapes passed through here are plain JSON by
 * construction (no undefined members, no byte carriers), which the tool
 * registry's JsonValue contract refuses to infer from interfaces.
 */
function asJson<T extends object>(value: T): JsonValue {
  return value as unknown as JsonValue
}

/**
 * Resolve credential + defaults, run one generation, and persist every
 * image both as a durable session attachment and as an on-disk PNG.
 * @param ctx - host context.
 * @param getConfig - current settings snapshot reader.
 * @param call - generation parameters.
 * @param signal - cancellation.
 */
export async function produceImages(
  ctx: Context, getConfig: () => ErnieImageConfig, call: GenerationCall, signal: AbortSignal,
): Promise<ProducedImage[]> {
  const credential = await ctx.credentials.resolve(ERNIE_IMAGE_API_KEY)
  if (credential === undefined) throw new Error(UNCONFIGURED_MESSAGE)
  const config = getConfig()
  const n = call.n
  const usePe = call.usePe
  const seed = call.seed
  const steps = call.steps
  const guidance = call.guidance

  const generated = await generateImages(credential.value, {
    prompt: call.prompt,
    size: call.size,
    n,
    ...(seed === undefined ? {} : { seed }),
    usePe,
    steps,
    guidance,
  }, signal)

  const stem = `${ERNIE_MODEL.replaceAll('-', '').toLowerCase()}-${new Date().toISOString().replaceAll(/[:.]/g, '')}`
  const produced: ProducedImage[] = []
  for (const [index, image] of generated.entries()) {
    produced.push(await persistOne(ctx, image, index, seed, stem))
  }
  return produced
}

/** Persist one decoded image: attachment first (validation), then disk. */
async function persistOne(
  ctx: Context, image: GeneratedImage, index: number, seed: number | undefined, stem: string,
): Promise<ProducedImage> {
  const name = attachmentName(stem, index)
  const ref = await ctx.attachments.saveImage({ data: image.data, mediaType: 'image/png', name })
  const path = savePngToDisk(ernieDataDir(ctx), image.data, `${stem}-${index}${seed === undefined ? '' : `-s${seed}`}`)
  return {
    index,
    attachment: ref,
    path,
    fileName: fileName(path),
    seed: seed ?? null,
    revisedPrompt: image.revisedPrompt ?? null,
    data: image.data,
  }
}

/** Context services this module's tools depend on. */
type ErnieContext = Context

/**
 * `ernie_generate_image` — prompt-to-image through ERNIE-Image-Turbo.
 * Every image is registered as a durable session attachment (the agent can
 * keep reading it) and written to disk under `$DSH_HOME/ernie-image/`.
 */
export function defineGenerateImageTool(ctx: ErnieContext, getConfig: () => ErnieImageConfig) {
  return defineTool({
    name: 'ernie_generate_image',
    description: '用百度 ERNIE-Image-Turbo 文生图：按 prompt 生成图片，落盘并注册为会话附件（agent 可继续读图）。seed 相同+参数相同可复现同一张图；换 seed 出变体。',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: '图像描述（中文或英文皆可）；越具体效果越好',
      },
      size: {
        type: 'string',
        enum: ERNIE_IMAGE_SIZES,
        description: '尺寸预设，缺省用设置里的默认值',
      },
      n: {
        type: 'integer',
        description: '一次生成的图片数，1-4，缺省 1',
      },
      seed: {
        type: 'integer',
        description: '随机种子（正整数）。同 seed 同参数可复现同一张图；缺省随机',
      },
      usePe: {
        type: 'boolean',
        description: '是否开启 prompt 增强（use_pe），缺省跟随设置默认（默认开）',
      },
      steps: {
        type: 'integer',
        description: '推理步数 4-20，缺省跟随设置默认（默认 8）',
      },
      guidance: {
        type: 'number',
        description: '引导系数 1.0-7.5，缺省跟随设置默认',
      },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as { images?: ProducedImageView[]; seed?: number | null; size?: string }
        const images = v.images ?? []
        const blocks: ContentBlock[] = []
        for (const image of images) {
          blocks.push({ type: 'image', attachment: image.attachment as unknown as ImageAttachmentRef })
        }
        const lines = [
          `已生成 ${images.length} 张图（${ERNIE_MODEL}，尺寸 ${v.size ?? '—'}，seed ${v.seed === null || v.seed === undefined ? '随机' : v.seed}）。`,
          ...images.map(image => `第 ${image.index + 1} 张：${image.path}（附件 ${image.attachment.attachmentId}，${image.attachment.width}×${image.attachment.height}）`),
          '图片已注册为会话附件，可直接读取继续处理；文件也保存在磁盘路径上。',
        ]
        blocks.push({ type: 'text', text: lines.join('\n') })
        return blocks
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const call = args as Partial<GenerationCall> & { prompt?: string }
      if (typeof call.prompt !== 'string' || call.prompt.trim() === '') {
        throw new Error('prompt 不能为空')
      }
      const config = getConfig()
      const size = call.size ?? config.size
      const n = clampInt(call.n ?? 1, 1, 4)
      const usePe = call.usePe ?? config.usePe
      const steps = clampInt(call.steps ?? config.steps, 4, 20)
      const guidance = clampFloat(call.guidance ?? config.guidance, 1, 7.5)
      const seed = call.seed === undefined ? randomSeed() : clampInt(call.seed, 1, 2_147_483_647)
      const images = await produceImages(ctx, getConfig, {
        prompt: call.prompt.trim(), size, n, seed, usePe, steps, guidance,
      }, AbortSignal.timeout(120_000))
      return asJson({
        model: ERNIE_MODEL,
        prompt: call.prompt.trim(),
        size,
        n,
        seed,
        usePe,
        steps,
        guidance,
        images: images.map(toImageView),
      })
    },
  })
}

/**
 * `ernie_image_test` — minimal connection probe (n=1, tiny prompt). Never
 * throws on credential absence: it reports the structured state instead, so
 * the agent can tell the user exactly what to configure.
 */
export function defineTestImageTool(ctx: ErnieContext, getConfig: () => ErnieImageConfig) {
  return defineTool({
    name: 'ernie_image_test',
    description: '测试 ERNIE 文生图连接：发一个最小生成请求（n=1、小 prompt）确认密钥和网络可用。未配置密钥时返回配置指引。',
    parameters: {},
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as {
          ok?: boolean
          message?: string
          latencyMs?: number
          bytes?: number
          error?: { status?: number | null; code?: string | null; message?: string }
        }
        if (v.ok === true) {
          return [{ type: 'text', text: `ERNIE 文生图连接正常：${v.latencyMs ?? '—'}ms 生成一张测试图（${v.bytes ?? '—'} 字节）` }]
        }
        const detail = v.error === undefined
          ? v.message ?? '未知错误'
          : `[${v.error.status ?? '—'}/${v.error.code ?? '—'}] ${v.error.message ?? '未知错误'}`
        return [{ type: 'text', text: `ERNIE 文生图连接不可用：${detail}` }]
      },
    },
    timeoutMs: 90_000,
    isConcurrencySafe: () => true,
    async execute() {
      const started = Date.now()
      const credential = await ctx.credentials.resolve(ERNIE_IMAGE_API_KEY)
      if (credential === undefined) {
        return asJson({ ok: false, configured: false, message: UNCONFIGURED_MESSAGE })
      }
      try {
        const [image] = await generateImages(credential.value, {
          prompt: 'a small red circle on white background',
          size: '1024x1024',
          n: 1,
          usePe: false,
          steps: 4,
          guidance: 1.0,
        }, AbortSignal.timeout(90_000))
        const bytes = image.data.byteLength
        return asJson({ ok: true, configured: true, latencyMs: Date.now() - started, bytes })
      } catch (error) {
        return asJson({
          ok: false,
          configured: true,
          latencyMs: Date.now() - started,
          error: error instanceof ErnieApiError
            ? { status: error.status ?? null, code: error.apiCode ?? null, message: error.detail }
            : { status: null, code: null, message: error instanceof Error ? error.message : String(error) },
        })
      }
    },
  })
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
