/**
 * dsh-ernie-image host half: ERNIE-Image-Turbo text-to-image integration.
 * Registers the `ernie-image` settings namespace, the two model-facing tools
 * (`ernie_generate_image`, `ernie_image_test`), and the `/ernie-image` RPC
 * channel consumed by the settings card and the gallery panel.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { ERNIE_IMAGE_NAMESPACE, ErnieImageConfigSchema, type ErnieImageConfig } from './config.ts'
import { registerErnieRpc } from './rpc.ts'
import { defineGenerateImageTool, defineTestImageTool } from './tools.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-ernie-image'

/** Services required by this plugin. */
export const inject = ['tools', 'credentials', 'settings', 'connection', 'attachments']

export function apply(ctx: Context): void {
  const scope = ctx.settings.register(
    settingsNamespace(ERNIE_IMAGE_NAMESPACE),
    ErnieImageConfigSchema,
    { applies: 'live' },
  )
  const getConfig = (): ErnieImageConfig => scope.get()

  ctx.effect(() => {
    const disposeGenerate = ctx.tools.register(defineGenerateImageTool(ctx, getConfig))
    const disposeTest = ctx.tools.register(defineTestImageTool(ctx, getConfig))
    return () => {
      disposeGenerate()
      disposeTest()
    }
  }, 'dsh-ernie-image: tool registrations')

  ctx.effect(() => registerErnieRpc(ctx, scope), 'dsh-ernie-image: RPC channel')
}
