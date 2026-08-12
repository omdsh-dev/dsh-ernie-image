/**
 * dsh-ernie-image client half: the settings card inside the plugin
 * configuration section (`settings.plugin.item`), and the floating
 * generation gallery panel. Both read/write the `ernie-image` config and
 * probe state through the plugin's own `/ernie-image` loopback RPC channel —
 * the settings wire domain gates namespaces behind the host api-proxy
 * allowlist, so a self-contained plugin serves its own configuration instead.
 * @module
 */

import { Component, createElement, type ErrorInfo, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ErnieCard } from './ErnieCard.tsx'
import { ErniePanel } from './ErniePanel.tsx'
import type { SessionsLike } from './constants.ts'

export const inject = ['slots', 'connection', 'sessions']

class PanelBoundary extends Component<{ children: ReactNode }, { error: string | undefined }> {
  state: { error: string | undefined } = { error: undefined }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dsh-ernie-image] generation panel render failed:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== undefined) {
      return createElement('div', { role: 'alert' }, '文生图面板加载失败：', this.state.error)
    }
    return this.props.children
  }
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const sessions = ctx.get('sessions') as unknown as SessionsLike

  // The plugin configuration section enumerates nothing itself; this card is
  // the plugin's contribution to 设置 → 插件配置.
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'ernie-image',
    order: 25,
    inject: () => ({ connection }),
  }, ErnieCard))

  ctx.effect(() => {
    let root: Root | undefined
    const host = document.createElement('div')
    host.setAttribute('data-dsh-ernie-panel', '')
    document.body.appendChild(host)
    root = createRoot(host)
    root.render(createElement(PanelBoundary, null, createElement(ErniePanel, { connection, sessions })))
    return () => {
      root?.unmount()
      host.remove()
    }
  }, 'dsh-ernie-image: panel controller mount')
}
