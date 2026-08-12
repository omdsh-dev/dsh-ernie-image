/**
 * Credential references for the ERNIE-Image-Turbo endpoint. Configuration
 * carries references, never secrets: values live with the DSH credential
 * provider (env shadows the managed store read-only), and every API call
 * re-resolves the reference (the credentials doctrine: never cache across
 * operations).
 * @module
 */

import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** The AI Studio access token; same source as the paddle-ocr plugin's token. */
export const ERNIE_IMAGE_API_KEY = credentialRef('ERNIE_IMAGE_API_KEY')

/** Stable error message every unconfigured tool call returns. */
export const UNCONFIGURED_MESSAGE = 'ERNIE 文生图密钥未配置：请在 设置 → 插件配置 → ERNIE 文生图 卡片填写 AI Studio 访问令牌（可与 OCR 插件填同一个 aistudio token），或设置环境变量 ERNIE_IMAGE_API_KEY。令牌获取：https://aistudio.baidu.com/ （右上角头像 → 访问令牌 → 新建）'
