import { listCodexEventsForChatSession, listCodexModels } from '@/api/codex'
import type { CodexEventPayload, CodexModelsPayload } from '@/composables/useChatRunStream'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

export const appendCodexEvent = (state: ChatWorkspaceState, payload: CodexEventPayload) => {
  const sessionId = String(payload?.sessionId || '')
  if (!sessionId) return
  const currentRun = state.currentRunId.value
  if (currentRun && sessionId !== currentRun && sessionId !== state.currentSessionId.value) return
  const events = state.codexEvents.value
  const sequence = Number(payload.sequence)
  if (Number.isFinite(sequence) && events.some(event => event.sessionId === sessionId && event.sequence === sequence)) return
  state.codexEvents.value = [...events, {
    sessionId,
    sequence: Number.isFinite(sequence) ? sequence : undefined,
    type: String(payload.type || 'event'),
    payload: payload.payload,
    receivedAt: Date.now(),
  }].slice(-200)
}

export const refreshCodexModels = async (state: ChatWorkspaceState, _payload: CodexModelsPayload) => {
  try {
    const result = await listCodexModels()
    const rows = Array.isArray(result?.models) ? result.models : []
    const presets = state.modelOptions.value.filter(option => option.source !== 'codex')
    const codex = rows.filter(row => row?.id && row?.deviceId).map(row => ({
      id: `codex:${row.deviceId}:${row.id}`,
      model: String(row.id),
      name: String(row.displayName || row.name || row.id),
      source: 'codex' as const,
      provider: row.provider || 'codex',
      deviceId: String(row.deviceId),
      deviceName: String(row.deviceName || row.deviceId),
      devicePlatform: row.devicePlatform,
      online: row.online,
    }))
    state.modelOptions.value = [...presets, ...codex]
  } catch {
    // A transient catalog refresh failure must not interrupt an active run.
  }
}

export const loadCodexEvents = async (state: ChatWorkspaceState, chatSessionId: string) => {
  const sid = String(chatSessionId || '').trim()
  if (!sid) return
  try {
    const result = await listCodexEventsForChatSession(sid)
    if (state.currentSessionId.value !== sid) return
    state.codexEvents.value = (Array.isArray(result?.events) ? result.events : []).slice(-200).map(event => ({
      sessionId: String(event.sessionId || ''),
      sequence: Number.isFinite(Number(event.sequence)) ? Number(event.sequence) : undefined,
      type: String(event.type || 'event'),
      payload: event.payload,
      receivedAt: Number(event.createdAt || Date.now()),
    }))
  } catch {
    // Codex is optional; an unavailable history endpoint must not break chat.
  }
}
