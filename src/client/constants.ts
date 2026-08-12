/**
 * Client-side constants: the seven size presets with display ratios and the
 * credential reference the settings card addresses. Mirrors the host
 * config; a client package must not import Host code.
 * @module
 */

export const ERNIE_RPC_CHANNEL = '/ernie-image'

/** Credential reference the ERNIE provider resolves. */
export const ERNIE_API_KEY_REF = 'ERNIE_IMAGE_API_KEY'

export interface SizePreset {
  value: string
  /** Display ratio for the chip's aspect frame. */
  ratio: [number, number]
  label: string
}

/** The seven size presets the endpoint accepts, in display order. */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { value: '1024x1024', ratio: [1, 1], label: '1:1 方图' },
  { value: '1376x768', ratio: [16, 9], label: '16:9 横图' },
  { value: '1264x848', ratio: [3, 2], label: '3:2 横图' },
  { value: '1200x896', ratio: [7, 5], label: '7:5 横图' },
  { value: '896x1200', ratio: [5, 7], label: '5:7 竖图' },
  { value: '848x1264', ratio: [3, 4], label: '3:4 竖图' },
  { value: '768x1376', ratio: [9, 16], label: '9:16 竖图' },
]

/** Client view of the `ernie-image` settings namespace. */
export interface ErnieImageConfigView {
  size: string
  usePe: boolean
  steps: number
  guidance: number
  panel: { enabled: boolean }
}

/** One generated image as the gallery renders it. */
export interface GalleryImage {
  key: string
  index: number
  base64: string
  attachment: { attachmentId: string; width: number; height: number; mediaType: string }
  path: string
  fileName: string
  seed: number | undefined
  revisedPrompt?: string
}

/** One generation run: the prompt/params used plus its images. */
export interface GalleryRun {
  key: string
  prompt: string
  size: string
  seed: number | undefined
  usePe: boolean
  steps: number
  guidance: number
  images: GalleryImage[]
}

/** Fresh random seed the client owns so regeneration can reuse it. */
export function freshSeed(): number {
  return Math.floor(Math.random() * 2_147_483_646) + 1
}

/** The `sessions` client service, narrowed to what this plugin touches. */
export interface SessionsLike {
  list: {
    getSnapshot(): { current?: string }
    subscribe(listener: () => void): () => void
  }
  binding(id: string): { session: SessionPromptLike } | undefined
}

export interface SessionPromptLike {
  prompt(content: PromptPart[], mode: 'queue' | 'steer'): Promise<unknown>
}

export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/png'; data: string; name?: string }
