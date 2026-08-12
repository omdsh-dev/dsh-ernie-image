/**
 * Client RPC helpers for the `/ernie-image` channel.
 * @module
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

/** Call one `/ernie-image` endpoint; non-ok results throw with the error message. */
export async function callRpc<T = unknown>(
  connection: ConnectionHandle, endpoint: string, payload?: unknown, signal?: AbortSignal,
): Promise<T> {
  const result = await connection.rpc.call('/ernie-image', endpoint, payload ?? {}, signal)
  if (!result.ok) throw new Error(`ERNIE 文生图 RPC ${endpoint} 失败：${result.error.message}`)
  return result.value as T
}
