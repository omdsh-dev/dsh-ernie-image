/**
 * ERNIE-Image-Turbo API client: the one place the HTTP endpoint is touched.
 * Host-side Node code (global fetch, Buffer), response_format=b64_json so
 * every result is decoded and validated before it reaches any consumer.
 * @module
 */

import { randomInt } from 'node:crypto'
import type { ErnieImageSize } from './config.ts'

export const ERNIE_ENDPOINT = 'https://aistudio.baidu.com/llm/lmapi/v3/images/generations'
export const ERNIE_MODEL = 'ERNIE-Image-Turbo'

/** Parameters one generation call carries. */
export interface GenerateRequest {
  prompt: string
  size: ErnieImageSize
  n: number
  /** Omitted when absent so the endpoint rolls its own. */
  seed?: number
  usePe: boolean
  steps: number
  guidance: number
}

/** One decoded image plus the metadata the endpoint reports for it. */
export interface GeneratedImage {
  /** Decoded PNG bytes. */
  data: Uint8Array
  /** The endpoint's revised prompt (present when use_pe ran). */
  revisedPrompt?: string
}

/**
 * Structured API failure: HTTP status plus whatever code/message the
 * endpoint reported, so tool results stay actionable.
 */
export class ErnieApiError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly apiCode: string | undefined,
    readonly detail: string,
  ) {
    super(`ERNIE-Image API error${status === undefined ? '' : ` (HTTP ${status})`}${apiCode === undefined ? '' : ` [${apiCode}]`}: ${detail}`)
  }
}

/**
 * Call the image generations endpoint once.
 * @param token - the credential value, resolved per operation by the caller.
 * @param request - generation parameters.
 * @param signal - cancellation (timeout + agent abort).
 * @returns the decoded images in endpoint order.
 */
export async function generateImages(
  token: string, request: GenerateRequest, signal: AbortSignal,
): Promise<GeneratedImage[]> {
  const body: Record<string, unknown> = {
    model: ERNIE_MODEL,
    prompt: request.prompt,
    n: request.n,
    response_format: 'b64_json',
    size: request.size,
    num_inference_steps: request.steps,
    guidance_scale: request.guidance,
  }
  if (request.seed !== undefined) body.seed = request.seed
  if (request.usePe) body.use_pe = true

  let response: Response
  try {
    response = await fetch(ERNIE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        // The AI Studio gateway rejects requests without a Date header
        // (curl adds one implicitly; undici's fetch does not).
        'Date': new Date().toUTCString(),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ErnieApiError(undefined, 'ABORTED', '请求被取消或超时')
    }
    throw new ErnieApiError(undefined, 'NETWORK', error instanceof Error ? error.message : String(error))
  }

  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const err = (payload ?? {}) as Record<string, unknown>
    const apiError = err.error as Record<string, unknown> | undefined
    throw new ErnieApiError(
      response.status,
      (apiError?.code ?? err.error_code) as string | undefined,
      (apiError?.message ?? err.error_msg ?? text.slice(0, 300)) as string,
    )
  }

  const ok = payload as { data?: Array<{ b64_json?: string; revised_prompt?: string }> } | undefined
  if (ok === undefined || !Array.isArray(ok.data) || ok.data.length === 0) {
    throw new ErnieApiError(response.status, 'EMPTY_DATA', `响应缺少图像数据：${text.slice(0, 200)}`)
  }

  const images: GeneratedImage[] = []
  for (const item of ok.data) {
    if (typeof item.b64_json !== 'string' || item.b64_json.length === 0) {
      throw new ErnieApiError(response.status, 'BAD_IMAGE', '响应图像数据为空或不是 base64')
    }
    images.push({
      data: Buffer.from(item.b64_json, 'base64'),
      ...(typeof item.revised_prompt === 'string' ? { revisedPrompt: item.revised_prompt } : {}),
    })
  }
  return images
}

/** One-shot random seed for variant generation (positive 31-bit). */
export function randomSeed(): number {
  return randomInt(1, 2_147_483_647)
}
