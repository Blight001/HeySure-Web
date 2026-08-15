import type { ActionBlock, InlineContent } from '@/utils/chatParser'
import type * as chatApi from '@/api/chat'
import type { ChatMention } from '@/utils/chatMentions'

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  think?: string
  tags?: string
  created_at?: number
  session_id?: string
  session_name?: string
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  system_prompt?: string
  finish_reason?: string
  latency?: number
  blocks?: ActionBlock[]
  inlineContent?: InlineContent[]
  display_text?: string
  attachments?: chatApi.ChatAttachment[]
}

export interface PendingUploadAttachment extends chatApi.ChatAttachment {
  client_id: string
  preview_url?: string
  status: 'uploading' | 'ready'
}

export interface SessionItem {
  id: string
  name: string
  totalTokens?: number
  createdAt?: number | string | null
}

export interface PersistedBlockState {
  applied?: boolean
  result?: string
}

export interface PersistedMessageActionState {
  blocks?: Record<string, PersistedBlockState>
  signatures?: Record<string, PersistedBlockState>
}

export interface ChatModelOption {
  id: string
  name: string
  model: string
}

export interface StoredChatDraft {
  content: string
  mentions: ChatMention[]
  updatedAt: number
}

export type ChatRunStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error' | 'stopped'
export type ChatRunPhase = 'idle' | 'generating' | 'waiting_mcp'

export interface ChatInterfaceProps {
  aiConfigId?: number
  aiKind?: 'assistant' | 'core'
  currentUserId?: number
  initialSessionId?: string
  mcpIcon?: string
  mcpDynamicRule?: string
  mcpCatalogRefreshKey?: string | number
  floatingLayer?: boolean
  embeddedDialogs?: boolean
  dialogHost?: string
  stripMarkdownSymbols?: boolean
  selectedFiles: string[]
  allFiles: string[]
  selectableFileRoot?: string
}

export type ChatInterfaceEmitFn = {
  (e: 'update:selectedFiles', value: string[]): void
  (e: 'update:currentSessionId', value: string): void
  (e: 'taskPlanRefresh', value: number): void
  (e: 'refreshFiles'): void
  (e: 'totalChatTokensUpdate', value: number): void
  (e: 'open-settings'): void
  (e: 'modelChanged', payload: { aiConfigId: number; model: string; modelPresetId: string }): void
}

export interface ChatDialogFns {
  alert: (options: { message: string; type?: 'info' | 'success' | 'warning' | 'error' }) => Promise<void>
  confirm: (options: { message: string; type?: 'info' | 'success' | 'warning' | 'error' }) => Promise<boolean>
}
