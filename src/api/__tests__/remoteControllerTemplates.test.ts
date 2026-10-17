import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRemoteControllerTemplate, deleteRemoteControllerTemplate,
  listRemoteControllerTemplates, restoreRemoteControllerTemplate, updateRemoteControllerTemplate,
} from '../remoteControllerTemplates'
import { BUILTIN_REMOTE_CONTROLLER_TEMPLATES } from '@/constants/remoteControllers'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

describe('remote controller mutation DTOs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('excludes response-only fields from create and update', async () => {
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const fetch = vi.fn().mockImplementation(async () => response(template))
    vi.stubGlobal('fetch', fetch)
    await createRemoteControllerTemplate({ ...template, builtin: false })
    let body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toHaveProperty('id', 'direction')
    expect(body).not.toHaveProperty('revision')
    expect(body).not.toHaveProperty('builtin')
    await updateRemoteControllerTemplate(template)
    body = JSON.parse(fetch.mock.calls[1][1].body)
    expect(body).toHaveProperty('expectedRevision', 1)
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('revision')
  })

  it('uses expectedRevision in delete query and restore body', async () => {
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const fetch = vi.fn().mockResolvedValueOnce(response({ deleted: true })).mockResolvedValueOnce(response(template))
    vi.stubGlobal('fetch', fetch)
    await deleteRemoteControllerTemplate('direction', 3)
    expect(fetch.mock.calls[0][0]).toContain('expectedRevision=3')
    await restoreRemoteControllerTemplate('direction', 4)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ expectedRevision: 4 })
  })

  it('lists from the canonical endpoint without cache-busting query fields', async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      schema: 'remote_controller_template.v1', items: BUILTIN_REMOTE_CONTROLLER_TEMPLATES, total: 5, defaultsRevision: 1,
    }))
    vi.stubGlobal('fetch', fetch)
    expect(await listRemoteControllerTemplates()).toHaveLength(5)
    expect(fetch.mock.calls[0][0]).toBe('/api/remote-controller-templates')
  })

  it('queries custom templates with the canonical deviceType filter', async () => {
    const arm = BUILTIN_REMOTE_CONTROLLER_TEMPLATES.find(item => item.id === 'jibotarm')!
    const fetch = vi.fn().mockResolvedValue(response({
      schema: 'remote_controller_template.v1', items: [arm], total: 1, defaultsRevision: 1,
    }))
    vi.stubGlobal('fetch', fetch)
    expect(await listRemoteControllerTemplates('custom')).toEqual([arm])
    expect(fetch.mock.calls[0][0]).toBe('/api/remote-controller-templates?deviceType=custom')
  })
})
