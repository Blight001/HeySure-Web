import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listWorkspaceFiles } from '@/api/workspace'
import { useAiWorkspaceFiles } from '../dashboard/useAiWorkspaceFiles'

vi.mock('@/api/workspace', () => ({
  listWorkspaceFiles: vi.fn(),
}))

describe('useAiWorkspaceFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps files scoped by AI config and preserves the legacy fallback', async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(['docs/guide.md'])
    const state = useAiWorkspaceFiles(() => ['legacy.txt'])

    expect(state.filesFor(null)).toEqual(['legacy.txt'])
    expect(state.filesFor({ aiConfigId: 42 } as never)).toEqual([])

    await state.load(42)

    expect(listWorkspaceFiles).toHaveBeenCalledWith(42)
    expect(state.filesFor({ aiConfigId: 42 } as never)).toEqual(['docs/guide.md'])
  })

  it('does not issue duplicate loads while one request is pending', async () => {
    let resolve: (files: string[]) => void = () => undefined
    vi.mocked(listWorkspaceFiles).mockImplementation(
      () => new Promise<string[]>(done => { resolve = done }),
    )
    const state = useAiWorkspaceFiles(() => [])

    const first = state.load(7)
    const second = state.load(7)
    resolve(['one.txt'])
    await Promise.all([first, second])

    expect(listWorkspaceFiles).toHaveBeenCalledTimes(1)
    expect(state.filesFor({ aiConfigId: 7 } as never)).toEqual(['one.txt'])
  })
})
