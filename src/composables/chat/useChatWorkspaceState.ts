import { computed, ref } from 'vue'
import type { ExternalControlEvent } from '@/api/ai'
import type {
  ChatInterfaceProps,
  ChatMessage,
  ChatModelOption,
  ChatRunPhase,
  ChatRunStatus,
  SessionItem,
} from '@/types/chat'
import type { ChatMention } from '@/utils/chatMentions'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

const createMessageRefs = () => ({
  chatInput: ref(''),
  chatMentions: ref<ChatMention[]>([]),
  chatMessages: ref<ChatMessage[]>([]),
  currentSessionId: ref(''),
  sessionList: ref<SessionItem[]>([]),
  isTyping: ref(false),
  pendingQueue: ref<string[]>([]),
  shownRunErrorIds: ref(new Set<string>()),
  hasMoreHistory: ref(false),
  loadingOlder: ref(false),
})

const createRunRefs = () => ({
  currentRunId: ref(''),
  currentRunIsExternal: ref(false),
  currentRunStatus: ref<ChatRunStatus>('idle'),
  currentRunPhase: ref<ChatRunPhase>('idle'),
  currentMcpTool: ref(''),
  currentMcpArguments: ref(''),
  currentDeviceTaskId: ref(''),
  currentDeviceProgress: ref(''),
  taskPlanRefreshSignal: ref(0),
})

const createActionRefs = () => ({
  appliedEdits: ref(new Set<string>()),
  appliedSignatures: ref(new Set<string>()),
  undoActions: ref<Record<string, { tool: string; arguments: Record<string, any> }>>({}),
  actionResults: ref<Record<string, string>>({}),
  actionResultsBySignature: ref<Record<string, string>>({}),
})

const createPromptRefs = () => ({
  configuredFrontPrompt: ref(''),
  effectiveSystemPromptPreview: ref(''),
  frontPromptPreviewError: ref(''),
  frontPromptAvailableTools: ref<any[]>([]),
  frontPromptToolGroups: ref<McpCatalogToolGroup[]>([]),
  frontPromptToolScope: ref(''),
  frontPromptToolMcpEnabled: ref<boolean | null>(null),
  frontPromptToolSchemaError: ref(''),
  uncheckedMcpToolNames: ref<string[]>([]),
  externalControlMode: ref(false),
  externalControlEvents: ref<ExternalControlEvent[]>([]),
  externalControlError: ref(''),
  modelOptions: ref<ChatModelOption[]>([]),
  selectedModelId: ref(''),
  modelSwitching: ref(false),
})

const createPickerRefs = () => ({
  isFileSelectorOpen: ref(false),
  currentPath: ref(''),
})

const createDerivedState = (
  props: ChatInterfaceProps,
  run: ReturnType<typeof createRunRefs>,
  action: ReturnType<typeof createActionRefs>,
) => {
  const aiKindValue = computed(() => props.aiKind || 'assistant')
  const preferredInitialSessionId = computed(() => String(props.initialSessionId || '').trim())
  const chatCtx = computed(() => ({
    aiKind: aiKindValue.value,
    aiConfigId: props.aiConfigId,
  }))
  const isRunActive = computed(() => ['queued', 'running'].includes(run.currentRunStatus.value))
  const appliedEditsArray = computed(() => Array.from(action.appliedEdits.value))
  const appliedSignaturesArray = computed(() => Array.from(action.appliedSignatures.value))
  return {
    aiKindValue,
    preferredInitialSessionId,
    chatCtx,
    isRunActive,
    appliedEditsArray,
    appliedSignaturesArray,
  }
}

export const useChatWorkspaceState = (props: ChatInterfaceProps) => {
  const message = createMessageRefs()
  const run = createRunRefs()
  const action = createActionRefs()
  const prompt = createPromptRefs()
  const picker = createPickerRefs()
  const derived = createDerivedState(props, run, action)
  return { ...message, ...run, ...action, ...prompt, ...picker, ...derived }
}

export type ChatWorkspaceState = ReturnType<typeof useChatWorkspaceState>
