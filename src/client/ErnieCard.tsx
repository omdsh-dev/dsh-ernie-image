/**
 * ERNIE 文生图 settings card (inside 设置 → 插件配置): the API key — written
 * through the credentials domain, never into the settings section, so the
 * literal never rides a response — plus generation defaults and the
 * connection probe. Config reads/writes ride the plugin's own `/ernie-image`
 * RPC channel (the settings wire domain gates namespaces behind the host
 * api-proxy allowlist).
 */

import { useEffect, useState } from 'react'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { callRpc } from './rpc.ts'
import { ERNIE_API_KEY_REF, SIZE_PRESETS, type ErnieImageConfigView } from './constants.ts'
import css from './ErnieCard.module.css'

interface CredentialView {
  name: string
  configured: boolean
  source: string | null
  writable: boolean
}

interface DescribeState {
  config: ErnieImageConfigView
  credentials: CredentialView[]
}

interface ProbeResult {
  ok: boolean
  latencyMs: number
  bytes?: number
  error?: string
}

export interface ErnieCardProps {
  connection: ConnectionHandle
}

type CredentialsApi = Pick<IApiClient, 'credentials'>

export function ErnieCard(props: ErnieCardProps) {
  const { connection } = props
  const [state, setState] = useState<DescribeState | null>(null)
  const [credential, setCredential] = useState<CredentialView | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)

  const api = connection.api as unknown as CredentialsApi
  const config = state?.config

  const refreshDescribe = async (): Promise<void> => {
    try {
      const described = await callRpc<DescribeState>(connection, 'settings/describe')
      setState(described)
      const cred = described.credentials.find(candidate => candidate.name === ERNIE_API_KEY_REF)
      if (cred !== undefined) setCredential(cred)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  useEffect(() => { void refreshDescribe() }, [connection])

  const refreshCredential = async (): Promise<void> => {
    try {
      const response = await api.credentials.describe({ refs: [ERNIE_API_KEY_REF] })
      if (!response.result.ok) return
      const view = response.result.value.credentials[ERNIE_API_KEY_REF]
      setCredential({
        name: ERNIE_API_KEY_REF,
        configured: view?.configured ?? false,
        source: view?.source ?? null,
        writable: view?.writable ?? true,
      })
    } catch {
      // The card stays usable without this: the key control simply reports
      // the last state it knew, and a write still reaches the Host.
    }
  }
  useEffect(() => { void refreshCredential() }, [connection])

  const saveKey = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const value = draft.trim()
      if (value === '') {
        setNotice('密钥为空：输入令牌后保存，或点「清除密钥」移除已存令牌')
        return
      }
      try {
        await api.credentials.set({ ref: ERNIE_API_KEY_REF, value })
      } catch {
        // Refusals surface through the re-read below.
      }
      await refreshCredential()
      await refreshDescribe()
      setDraft('')
      setNotice('密钥已写入 DSH 凭据保险箱（不回传浏览器、不进设置文档）')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      try {
        await api.credentials.unset({ ref: ERNIE_API_KEY_REF })
      } catch {
        // Refusals surface through the re-read below.
      }
      await refreshCredential()
      await refreshDescribe()
      setDraft('')
      setNotice('密钥已清除')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const runProbe = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    setProbe(null)
    try {
      setProbe(await callRpc<ProbeResult>(connection, 'settings/probe'))
    } catch (error) {
      setProbe({ ok: false, latencyMs: 0, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const patchConfig = async (patch: Partial<ErnieImageConfigView>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const next = await callRpc<ErnieImageConfigView>(connection, 'settings/config', { patch })
      setState(current => current === null ? { config: next, credentials: [] } : { ...current, config: next })
      setNotice('默认参数已保存')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const setSize = (size: string): void => { void patchConfig({ size }) }
  const setUsePe = (usePe: boolean): void => { void patchConfig({ usePe }) }
  const setSteps = (text: string): void => {
    const value = Number(text)
    if (Number.isFinite(value)) void patchConfig({ steps: Math.min(20, Math.max(4, Math.trunc(value))) })
  }
  const setGuidance = (text: string): void => {
    const value = Number(text)
    if (Number.isFinite(value)) void patchConfig({ guidance: Math.min(7.5, Math.max(1, value)) })
  }
  const setPanelEnabled = (enabled: boolean): void => {
    if (config !== undefined) void patchConfig({ panel: { ...config.panel, enabled } })
  }

  return (
    <div className={css.card}>
      <header className={css.header}>
        <span className={css.logo} aria-hidden="true">✨</span>
        <div className={css.titleBlock}>
          <h3 className={css.title}>ERNIE 文生图</h3>
          <p className={css.subtitle}>百度 ERNIE-Image-Turbo 图像生成（dsh-ernie-image）</p>
        </div>
        {credential !== null && (
          <span className={credential.configured ? css.badgeOk : css.badgeOff}>
            {credential.configured
              ? `密钥已配置${credential.source !== null && credential.source !== undefined ? `（${credential.source}）` : ''}`
              : '密钥未配置'}
          </span>
        )}
      </header>

      <section className={css.group}>
        <h4 className={css.groupTitle}>密钥</h4>
        {credential === null
          ? <p className={css.hint}>读取密钥状态中…</p>
          : !credential.configured && (
            <p className={css.hint}>
              在 <a href="https://aistudio.baidu.com/" target="_blank" rel="noreferrer">aistudio.baidu.com</a> 登录后，
              右上角头像 → <strong>访问令牌</strong> → 新建，复制令牌填到下面。
              与 OCR 插件（paddle-ocr）用的是同一个 aistudio token，可以填同一个。
            </p>
          )}
        <div className={css.keyRow}>
          <input
            className={css.keyInput}
            type="password"
            value={draft}
            placeholder={credential?.configured === true ? '（已配置；输入新值可覆盖）' : '粘贴 AI Studio 访问令牌'}
            disabled={busy || credential?.writable === false}
            onChange={event => setDraft(event.target.value)}
          />
        </div>
        {credential?.writable === false && (
          <p className={css.hint}>密钥由环境变量提供（只读），此处不可修改。</p>
        )}
        <div className={css.actions}>
          <button type="button" disabled={busy || credential?.writable === false} onClick={() => void saveKey()}>保存密钥</button>
          <button type="button" className={css.ghost} disabled={busy || credential?.writable === false} onClick={() => void clearKey()}>清除密钥</button>
          <button type="button" disabled={busy} onClick={() => void runProbe()}>测试连接</button>
        </div>
        {probe !== null && (
          <p className={probe.ok ? css.probeOk : css.probeFail}>
            {probe.ok
              ? `连接正常：${probe.latencyMs}ms 生成一张测试图（${probe.bytes ?? '—'} 字节）`
              : `连接失败：${probe.error ?? '未知错误'}`}
          </p>
        )}
      </section>

      <section className={css.group}>
        <h4 className={css.groupTitle}>生成默认参数（工具调用缺省时使用）</h4>
        {config === undefined
          ? <p className={css.hint}>读取配置中…</p>
          : (
            <>
              <label className={css.field}>
                <span>默认尺寸</span>
                <select value={config.size} onChange={event => setSize(event.target.value)}>
                  {SIZE_PRESETS.map(preset => (
                    <option key={preset.value} value={preset.value}>{preset.value}（{preset.label}）</option>
                  ))}
                </select>
              </label>
              <label className={css.checkRow}>
                <input type="checkbox" checked={config.usePe} onChange={event => setUsePe(event.target.checked)} />
                <span>默认开启 prompt 增强（use_pe，改写 prompt 提升出图质量）</span>
              </label>
              <div className={css.fieldRow}>
                <label className={css.field}>
                  <span>推理步数（4-20）</span>
                  <input
                    type="number" min={4} max={20} step={1} value={config.steps}
                    onChange={event => setSteps(event.target.value)}
                  />
                </label>
                <label className={css.field}>
                  <span>引导系数（1.0-7.5）</span>
                  <input
                    type="number" min={1} max={7.5} step={0.1} value={config.guidance}
                    onChange={event => setGuidance(event.target.value)}
                  />
                </label>
              </div>
              <label className={css.checkRow}>
                <input
                  type="checkbox" checked={config.panel.enabled}
                  onChange={event => setPanelEnabled(event.target.checked)}
                />
                <span>显示右下角「✨ 文生图」生成画廊面板</span>
              </label>
            </>
          )}
      </section>

      {notice !== null && <p className={css.notice}>{notice}</p>}

      <footer className={css.footer}>
        dsh-ernie-image v0.1.0 · 数据源：百度 AI Studio ERNIE-Image-Turbo（需自备 aistudio 访问令牌）。
        生成图片会落盘到 $DSH_HOME/ernie-image/ 并注册为会话附件。
      </footer>
    </div>
  )
}
