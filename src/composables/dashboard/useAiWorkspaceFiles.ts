import { ref } from 'vue'
import { listWorkspaceFiles } from '@/api/workspace'
import type { Agent } from '@/types'

type WorkspaceFileFallback = () => string[]

export const useAiWorkspaceFiles = (fallbackFiles: WorkspaceFileFallback) => {
  const filesByConfig = ref<Record<string, string[]>>({})
  const loading = new Set<number>()

  const filesFor = (agent: Agent | null) => {
    const configId = Number(agent?.aiConfigId || 0)
    if (!Number.isFinite(configId) || configId <= 0) return fallbackFiles()
    return filesByConfig.value[String(configId)] || []
  }

  const load = async (aiConfigId: number, force = false) => {
    if (!Number.isFinite(aiConfigId) || aiConfigId <= 0) return
    const key = String(aiConfigId)
    if (!force && filesByConfig.value[key]) return
    if (loading.has(aiConfigId)) return
    loading.add(aiConfigId)
    try {
      const files = await listWorkspaceFiles(aiConfigId)
      filesByConfig.value = { ...filesByConfig.value, [key]: files }
    } catch (error) {
      console.error('Failed to load AI workspace files:', error)
    } finally {
      loading.delete(aiConfigId)
    }
  }

  const refresh = (aiConfigId: number | null | undefined) => {
    void load(Number(aiConfigId || 0), true)
  }

  return { filesByConfig, filesFor, load, refresh }
}
