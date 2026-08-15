import { watch } from 'vue'
import type { ChatInterfaceProps, StoredChatDraft } from '@/types/chat'
import { activeChatMentions } from '@/utils/chatMentions'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const CHAT_DRAFT_STORAGE_PREFIX = 'heysure:chat-draft:v1'

interface DraftFlag {
  restoring: boolean
  preserveForSessionId: string
}

const draftStorageKey = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  sessionId = state.currentSessionId.value,
) => [
  CHAT_DRAFT_STORAGE_PREFIX,
  String(props.currentUserId || 'anonymous'),
  state.aiKindValue.value,
  String(props.aiConfigId || 'default'),
  sessionId || '__new__',
].join(':')

const readChatDraft = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  sessionId: string,
): StoredChatDraft | null => {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(props, state, sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredChatDraft>
    if (typeof parsed.content !== 'string') return null
    return {
      content: parsed.content,
      mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
      updatedAt: Number(parsed.updatedAt || 0),
    }
  } catch {
    return null
  }
}

const writeChatDraft = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  flag: DraftFlag,
  sessionId = state.currentSessionId.value,
) => {
  if (flag.restoring) return
  const content = state.chatInput.value
  const mentions = activeChatMentions(content, state.chatMentions.value)
  const key = draftStorageKey(props, state, sessionId)
  try {
    if (!content) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify({ content, mentions, updatedAt: Date.now() }))
  } catch {
    // 浏览器禁用或存储空间不足时不影响正常聊天。
  }
}

const restoreChatDraft = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  flag: DraftFlag,
  sessionId: string,
) => {
  const draft = readChatDraft(props, state, sessionId)
  flag.restoring = true
  state.chatInput.value = draft?.content || ''
  state.chatMentions.value = draft?.mentions || []
  queueMicrotask(() => { flag.restoring = false })
}

const removeChatDraft = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  sessionId: string,
) => {
  try { window.localStorage.removeItem(draftStorageKey(props, state, sessionId)) } catch { /* no-op */ }
}

export const useChatDrafts = (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  const flag: DraftFlag = { restoring: false, preserveForSessionId: '' }
  watch(state.chatInput, () => writeChatDraft(props, state, flag))
  watch(state.chatMentions, () => writeChatDraft(props, state, flag), { deep: true })
  return {
    writeChatDraft: (sessionId?: string) => writeChatDraft(props, state, flag, sessionId),
    restoreChatDraft: (sessionId: string) => restoreChatDraft(props, state, flag, sessionId),
    removeChatDraft: (sessionId: string) => removeChatDraft(props, state, sessionId),
    markPreserveDraft: (sessionId: string) => { flag.preserveForSessionId = sessionId },
    takePreservedDraftSession: (sessionId: string) => {
      if (flag.preserveForSessionId !== sessionId) return false
      flag.preserveForSessionId = ''
      return true
    },
  }
}

export type ChatDraftsApi = ReturnType<typeof useChatDrafts>
