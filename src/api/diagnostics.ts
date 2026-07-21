import { post } from './http'

export interface ModelProbeInput {
  name: string
  model: string
  base_url: string
  api_key: string
  provider?: 'auto' | 'openai' | 'anthropic'
  prompt?: string
}

export interface ModelProbeResult {
  name: string
  model: string
  base_url?: string
  ok: boolean
  latency_ms?: number
  reply?: string
  detail?: string
}

export const probeModelConfig = (payload: ModelProbeInput) =>
  post<ModelProbeResult>('/api/diagnostics/model-probe', payload, {
    fallbackError: '模型连接测试失败',
  })
