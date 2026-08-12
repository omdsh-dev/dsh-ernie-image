/**
 * Settings namespace `ernie-image`: generation defaults the tools fall back
 * to (size preset, prompt-enhancement flag, inference steps, guidance scale)
 * and the gallery panel switch. Defaults resolve through the schemastery
 * schema; the user document layers on top.
 * @module
 */

import z from '@deepseek-ai/schemastery'

/** The seven size presets the ERNIE-Image-Turbo endpoint accepts. */
export const ERNIE_IMAGE_SIZES = [
  '1024x1024',
  '1376x768',
  '1264x848',
  '1200x896',
  '896x1200',
  '848x1264',
  '768x1376',
] as const

/** One accepted size preset. */
export type ErnieImageSize = typeof ERNIE_IMAGE_SIZES[number]

/** Resolved section of the `ernie-image` settings namespace. */
export interface ErnieImageConfig {
  /** Default size preset tools use when a call names none. */
  size: ErnieImageSize
  /** Whether prompt enhancement (use_pe) is on by default. */
  usePe: boolean
  /** Default inference steps (4-20). */
  steps: number
  /** Default guidance scale (1.0-7.5). */
  guidance: number
  /** Gallery panel switch. */
  panel: { enabled: boolean }
}

/** Schemastery schema: schema defaults below the user document layer. */
export const ErnieImageConfigSchema = z.object({
  size: z.union(ERNIE_IMAGE_SIZES.map(size => z.const(size))).default('1024x1024'),
  usePe: z.boolean().default(true),
  steps: z.number().min(4).max(20).default(8),
  guidance: z.number().min(1).max(7.5).default(1.0),
  panel: z.object({
    enabled: z.boolean().default(true),
  }),
}) as unknown as z<ErnieImageConfig>

/** Namespace name (lowercase kebab-case, per the settings service contract). */
export const ERNIE_IMAGE_NAMESPACE = 'ernie-image'
