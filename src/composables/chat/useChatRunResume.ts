import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type { ChatRunControlDeps } from './useChatRunControl'

export const resumeChatRun = async (
  deps: ChatRunControlDeps,
  runId: string,
  onStarted: (runId: string) => void,
) => {
  if (!runId || !deps.state.isConversationPaused.value || !getAuthToken()) return
  try {
    const resumed = await chatApi.resumeRun(runId)
    deps.state.currentRunId.value = resumed.run_id
    deps.state.currentRunIsExternal.value = false
    deps.state.isConversationPaused.value = false
    deps.state.currentRunStatus.value = 'queued'
    deps.state.currentRunPhase.value = 'generating'
    deps.state.isTyping.value = true
    deps.timers.startRunTimers()
    onStarted(resumed.run_id)
  } catch (err: any) {
    await deps.dialogs.alert({ message: `继续失败: ${String(err?.message || '未知错误')}`, type: 'error' })
  }
}
