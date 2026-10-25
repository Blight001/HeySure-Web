import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callMcpTool,
  cancelMcpJob,
  createMcpJob,
  getMcpJob,
  listMcpTools,
  runInheritanceMcpTest,
} from '../mcp'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('MCP API scope propagation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends ai_config_id for direct calls so endpoint tools use the AI scope', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ ok: true }))
    vi.stubGlobal('fetch', fetch)

    await callMcpTool({ tool: 'desktop_screenshot', arguments: {}, ai_config_id: 42 })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      tool: 'desktop_screenshot',
      arguments: {},
      ai_config_id: 42,
    })
  })

  it('scopes tool discovery with the same AI config query parameter', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ tools: [] }))
    vi.stubGlobal('fetch', fetch)

    await listMcpTools({ aiConfigId: 42 })

    expect(fetch.mock.calls[0][0]).toBe('/api/mcp/tools?ai_config_id=42')
  })

  it('preserves the AI scope for model-assisted endpoint tests', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ ok: true }))
    vi.stubGlobal('fetch', fetch)

    await runInheritanceMcpTest({
      model_preset_id: 'preset',
      tool: 'desktop_screenshot',
      device_id: 'desktop-1',
      ai_config_id: 42,
    })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      device_id: 'desktop-1',
      ai_config_id: 42,
    })
  })

  it('supports polling and cancelling persisted endpoint jobs', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ job_id: 'atask_1', status: 'pending' }))
      .mockResolvedValueOnce(response({ job_id: 'atask_1', status: 'completed' }))
      .mockResolvedValueOnce(response({ job_id: 'atask_1', status: 'cancelled' }))
    vi.stubGlobal('fetch', fetch)

    await createMcpJob({ tool: 'run_command', ai_config_id: 42, arguments: { command: 'echo ok' } })
    await getMcpJob('atask_1')
    await cancelMcpJob('atask_1')

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      '/api/mcp/jobs',
      '/api/mcp/jobs/atask_1',
      '/api/mcp/jobs/atask_1/cancel',
    ])
  })
})
