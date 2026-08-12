/**
 * ERNIE 文生图生成面板: floating toggle + docked panel with prompt input,
 * size-preset chips, generation (with skeleton while busy), a gallery with
 * preview / download / same-seed rerun / new-seed variant, and "插入会话"
 * (sends the image as a session prompt attachment through ctx.sessions).
 * Config reads ride the plugin's `/ernie-image` RPC channel.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { callRpc } from './rpc.ts'
import {
  freshSeed, SIZE_PRESETS,
  type ErnieImageConfigView, type GalleryImage, type GalleryRun, type SessionsLike,
} from './constants.ts'
import css from './ErniePanel.module.css'

export interface ErniePanelProps {
  connection: ConnectionHandle
  sessions: SessionsLike
}

interface GenerateResponse {
  model: string
  prompt: string
  size: string
  seed: number | undefined
  usePe: boolean
  images: Array<{
    index: number
    attachment: { attachmentId: string; width: number; height: number; mediaType: string }
    path: string
    fileName: string
    seed: number | undefined
    revisedPrompt?: string
    base64: string
  }>
}

/** Skeleton illustration (same artwork as assets/generating-skeleton.svg). */
const GENERATING_ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" fill="none">'
  + '<rect x="20" y="20" width="600" height="360" rx="18" stroke="#8A8F98" stroke-width="3"/>'
  + '<g stroke="#8A8F98" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M20 300 q60 -90 120 -80 q60 10 90 -40 q30 -50 60 -30"/>'
  + '<circle cx="210" cy="150" r="28"/>'
  + '<path d="M480 320 l0 -110 M440 300 l80 0" stroke-dasharray="3 10" stroke-width="2.5" opacity="0.85"/>'
  + '<path d="M470 120 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z" fill="#7C4DFF" stroke="#7C4DFF" stroke-width="2"/>'
  + '<path d="M570 250 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#7C4DFF" stroke="#7C4DFF" stroke-width="2"/>'
  + '<path d="M150 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#7C4DFF" stroke="#7C4DFF" stroke-width="2"/>'
  + '</g>'
  + '<path d="M380 60 q10 0 10 10 q0 10 -10 10 q-10 0 -10 -10 q0 -10 10 -10" stroke="#7C4DFF" stroke-width="2.5" opacity="0.7"/>'
  + '<g opacity="0.35" stroke="#8A8F98" stroke-width="2.5" stroke-linecap="round">'
  + '<path d="M300 340 h150 M300 358 h110"/>'
  + '</g>'
  + '</svg>'

export function ErniePanel(props: ErniePanelProps) {
  const { connection } = props
  const sessionSnapshot = useSyncExternalStore(
    callback => props.sessions.list.subscribe(callback),
    () => props.sessions.list.getSnapshot(),
  )
  const currentSessionId = sessionSnapshot.current

  const [config, setConfig] = useState<ErnieImageConfigView | null>(null)
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<string>('1024x1024')
  const [count, setCount] = useState(1)
  const [usePe, setUsePe] = useState<boolean | undefined>(undefined)
  const [seedText, setSeedText] = useState('')
  const [steps, setSteps] = useState<string>('')
  const [guidance, setGuidance] = useState<string>('')
  const [runs, setRuns] = useState<GalleryRun[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ runKey: string; imageKey: string } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const refreshConfig = async (): Promise<void> => {
    try {
      const described = await callRpc<{ config: ErnieImageConfigView }>(connection, 'settings/describe')
      setConfig(described.config)
    } catch {
      // Config reads are advisory; the panel keeps its current defaults.
    }
  }
  useEffect(() => { void refreshConfig() }, [connection])

  // Seed the form from settings defaults once they are available.
  useEffect(() => {
    if (config === null) return
    setSize(current => (current === '1024x1024' && config.size !== current ? config.size : current))
    setUsePe(current => current === undefined ? config.usePe : current)
    setSteps(current => current === '' ? String(config.steps) : current)
    setGuidance(current => current === '' ? String(config.guidance) : current)
  }, [config])

  const toggleOpen = (): void => {
    void refreshConfig()
    setOpen(current => !current)
  }

  const generate = async (overrides: { seed?: number; usePe?: boolean } = {}): Promise<void> => {
    if (prompt.trim() === '') {
      setError('请先输入图像描述（prompt）')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const seed = overrides.seed ?? (seedText.trim() === '' ? freshSeed() : Number(seedText))
      const payload = {
        prompt: prompt.trim(),
        size,
        n: count,
        seed,
        usePe: overrides.usePe ?? usePe ?? config?.usePe ?? true,
        steps: steps.trim() === '' ? (config?.steps ?? 8) : Number(steps),
        guidance: guidance.trim() === '' ? (config?.guidance ?? 1.0) : Number(guidance),
      }
      const response = await callRpc<GenerateResponse>(connection, 'gallery/generate', payload)
      const runKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const images: GalleryImage[] = response.images.map(image => ({
        key: `${runKey}-${image.index}`,
        index: image.index,
        base64: image.base64,
        attachment: image.attachment,
        path: image.path,
        fileName: image.fileName,
        seed: response.seed,
        revisedPrompt: image.revisedPrompt,
      }))
      const run: GalleryRun = {
        key: runKey,
        prompt: response.prompt,
        size: response.size,
        seed: response.seed,
        usePe: payload.usePe,
        steps: payload.steps,
        guidance: payload.guidance,
        images,
      }
      setRuns(current => [...current, run])
      setSeedText(String(response.seed ?? seed))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const regenerateSameSeed = (run: GalleryRun): void => {
    setPrompt(run.prompt)
    setSize(run.size)
    setUsePe(run.usePe)
    setSteps(String(run.steps))
    setGuidance(String(run.guidance))
    setOpen(true)
    void generate({ seed: run.seed ?? freshSeed(), usePe: run.usePe })
  }

  const regenerateNewSeed = (run: GalleryRun): void => {
    setPrompt(run.prompt)
    setSize(run.size)
    setUsePe(run.usePe)
    setSteps(String(run.steps))
    setGuidance(String(run.guidance))
    setOpen(true)
    void generate({ seed: freshSeed(), usePe: run.usePe })
  }

  const download = (image: GalleryImage): void => {
    const blob = dataUrlToBlob(image.base64)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = image.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const insertIntoSession = async (image: GalleryImage, run: GalleryRun): Promise<void> => {
    setNotice(null)
    if (currentSessionId === undefined) {
      setNotice('当前没有打开的会话：先打开一个会话，再点「插入会话」。')
      return
    }
    const binding = props.sessions.binding(currentSessionId)
    if (binding === undefined) {
      setNotice('找不到当前会话的发送通道（会话可能尚未就绪）。')
      return
    }
    try {
      await binding.session.prompt([
        { type: 'text', text: `这是用 ERNIE 文生图生成的图片（prompt：${run.prompt}，尺寸 ${run.size}，seed ${run.seed ?? '随机'}）。请基于这张图继续。` },
        { type: 'image', mediaType: 'image/png', data: image.base64, name: image.fileName },
      ], 'queue')
      setNotice('图片已作为消息插入当前会话，agent 会基于它继续。')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  const openLightbox = (run: GalleryRun, image: GalleryImage): void => {
    setLightbox({ runKey: run.key, imageKey: image.key })
  }

  let lightboxRun: GalleryRun | undefined
  let lightboxImage: GalleryImage | undefined
  if (lightbox !== null) {
    lightboxRun = runs.find(run => run.key === lightbox.runKey)
    if (lightboxRun !== undefined) {
      lightboxImage = lightboxRun.images.find(image => image.key === lightbox.imageKey)
    }
  }

  // The panel switch in the settings card owns visibility.
  if (config !== null && config.panel.enabled === false) return null

  return (
    <>
      <button
        type="button"
        className={css.toggle}
        title="打开 ERNIE 文生图面板"
        onClick={toggleOpen}
      >
        <span aria-hidden="true">✨</span> 文生图
      </button>

      {open && (
        <div className={css.panel} ref={panelRef} role="dialog" aria-label="ERNIE 文生图生成面板">
          <header className={css.panelHeader}>
            <h3 className={css.panelTitle}>✨ ERNIE 文生图</h3>
            <button type="button" className={css.close} aria-label="关闭面板" onClick={() => setOpen(false)}>×</button>
          </header>

          <label className={css.promptLabel}>
            图像描述（prompt）
            <textarea
              className={css.prompt}
              rows={3}
              value={prompt}
              placeholder="例如：一只戴着宇航员头盔的橘猫，扁平插画风格，透明背景"
              onChange={event => setPrompt(event.target.value)}
            />
          </label>

          <div className={css.fieldLabel}>尺寸预设</div>
          <div className={css.chips}>
            {SIZE_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                className={size === preset.value ? `${css.chip} ${css.chipActive}` : css.chip}
                title={preset.label}
                onClick={() => setSize(preset.value)}
              >
                <span
                  className={css.chipFrame}
                  style={{
                    aspectRatio: `${preset.ratio[0]} / ${preset.ratio[1]}`,
                    width: preset.ratio[0] >= preset.ratio[1] ? '26px' : undefined,
                    height: preset.ratio[1] > preset.ratio[0] ? '26px' : undefined,
                  }}
                />
              </button>
            ))}
          </div>

          <div className={css.row}>
            <label className={css.inlineField}>
              张数
              <select value={count} onChange={event => setCount(Number(event.target.value))}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className={css.inlineField}>
              seed（留空随机）
              <input
                className={css.seed}
                type="number" min={1} value={seedText}
                placeholder="随机"
                onChange={event => setSeedText(event.target.value)}
              />
            </label>
          </div>

          <div className={css.row}>
            <label className={css.checkRow}>
              <input
                type="checkbox"
                checked={usePe ?? config?.usePe ?? true}
                onChange={event => setUsePe(event.target.checked)}
              />
              <span>prompt 增强</span>
            </label>
            <label className={css.inlineField}>
              步数
              <input
                type="number" min={4} max={20} value={steps}
                placeholder={String(config?.steps ?? 8)}
                onChange={event => setSteps(event.target.value)}
              />
            </label>
            <label className={css.inlineField}>
              引导
              <input
                type="number" min={1} max={7.5} step={0.1} value={guidance}
                placeholder={String(config?.guidance ?? 1.0)}
                onChange={event => setGuidance(event.target.value)}
              />
            </label>
          </div>

          <button type="button" className={css.generate} disabled={busy} onClick={() => void generate()}>
            {busy ? '生成中…（约 30 秒）' : '生成'}
          </button>

          {error !== null && <p className={css.error}>{error}</p>}
          {notice !== null && <p className={css.notice}>{notice}</p>}

          {busy && (
            <div className={css.skeleton}>
              <div className={css.skeletonArt} dangerouslySetInnerHTML={{ __html: GENERATING_ART }} />
              <div className={css.shimmer} />
              <p className={css.skeletonText}>画布上图像逐渐浮现…</p>
            </div>
          )}

          {runs.length > 0 && (
            <div className={css.gallery}>
              {runs.map(run => (
                <section key={run.key} className={css.runSection}>
                  <div className={css.runMeta}>
                    <span className={css.runPrompt} title={run.prompt}>{run.prompt}</span>
                    <span className={css.runSeed}>seed {run.seed ?? '—'} · {run.size}</span>
                  </div>
                  <div className={css.grid}>
                    {run.images.map(image => (
                      <button
                        key={image.key}
                        type="button"
                        className={css.thumb}
                        onClick={() => openLightbox(run, image)}
                      >
                        <img src={dataUrl(image.base64)} alt={`${run.prompt} #${image.index + 1}`} />
                      </button>
                    ))}
                  </div>
                  <div className={css.runActions}>
                    <button type="button" disabled={busy} onClick={() => void regenerateSameSeed(run)}>同 seed 重生成</button>
                    <button type="button" disabled={busy} onClick={() => void regenerateNewSeed(run)}>换 seed 出变体</button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {lightboxImage !== undefined && lightboxRun !== undefined && (
        <div className={css.lightbox} role="dialog" aria-label="图片预览" onClick={() => setLightbox(null)}>
          <div className={css.lightboxBody} onClick={event => event.stopPropagation()}>
            <img src={dataUrl(lightboxImage.base64)} alt={lightboxRun.prompt} />
            <div className={css.lightboxMeta}>
              <span>seed {lightboxRun.seed ?? '—'} · {lightboxRun.size} · {lightboxImage.attachment.width}×{lightboxImage.attachment.height}</span>
              {lightboxImage.revisedPrompt !== undefined && (
                <span className={css.revised} title={lightboxImage.revisedPrompt}>改写后 prompt：{lightboxImage.revisedPrompt}</span>
              )}
            </div>
            <div className={css.lightboxActions}>
              <button type="button" onClick={() => download(lightboxImage)}>下载</button>
              <button type="button" disabled={busy} onClick={() => void regenerateSameSeed(lightboxRun)}>同 seed 重生成</button>
              <button type="button" disabled={busy} onClick={() => void regenerateNewSeed(lightboxRun)}>换 seed 出变体</button>
              <button
                type="button" disabled={currentSessionId === undefined}
                onClick={() => void insertIntoSession(lightboxImage, lightboxRun)}
              >
                {currentSessionId === undefined ? '插入会话（无会话）' : '插入会话'}
              </button>
              <button type="button" className={css.ghost} onClick={() => setLightbox(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function dataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

function dataUrlToBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}
