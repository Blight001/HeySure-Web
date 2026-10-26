import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkspaceFileBlob, listWorkspaceFiles, readWorkspaceFile } from '../workspace'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('workspace API scope propagation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the complete curated listing for the active AI workspace', async () => {
    const fetch = vi.fn().mockResolvedValue(response(['src/', 'src/main.py']))
    vi.stubGlobal('fetch', fetch)

    await listWorkspaceFiles(42)

    expect(fetch.mock.calls[0][0]).toBe('/api/chat/files?ai_config_id=42&max_depth=32&max_entries=2000')
  })

  it('keeps previews and downloads in the same AI workspace scope', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ path: 'notes.md', content: 'hello', size: 5, binary: false, too_large: false }))
      .mockResolvedValueOnce(new Response('hello', { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await readWorkspaceFile('notes.md', 42)
    await fetchWorkspaceFileBlob('notes.md', 42)

    expect(fetch.mock.calls[0][0]).toBe('/api/chat/files/read?path=notes.md&ai_config_id=42')
    expect(fetch.mock.calls[1][0]).toBe('/api/chat/files/raw?path=notes.md&ai_config_id=42')
  })
})
