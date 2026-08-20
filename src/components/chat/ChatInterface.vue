<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useChatWorkspace } from '@/composables/chat/useChatWorkspace'
import type { ChatInterfaceProps } from '@/types/chat'
import { formatTokenCount } from '@/utils/formatTokenCount'
import { BLANK_SESSION_NAME } from '@/utils/chatSessionLabels'
import heySureLogo from '@/assets/logo/HeySure.png'
import ChatHeader from './ChatHeader.vue'
import ChatConversationView from './ChatConversationView.vue'
import ChatInput from './ChatInput.vue'
import FrontPromptPreview from './FrontPromptPreview.vue'
import { resolveRemoteScreenDevice } from '@/utils/chatRemoteScreen'

const ChatRemoteScreenBackdrop = defineAsyncComponent(() => import('./ChatRemoteScreenBackdrop.vue'))

const props = defineProps<ChatInterfaceProps>()
const { alert, confirm } = useMessage(() => props.embeddedDialogs ? (props.dialogHost || 'chat') : 'global')
const emit = defineEmits<{
  (e: 'update:selectedFiles', value: string[]): void
  (e: 'update:currentSessionId', value: string): void
  (e: 'taskPlanRefresh', value: number): void
  (e: 'refreshFiles'): void
  (e: 'totalChatTokensUpdate', value: number): void
  (e: 'open-settings'): void
  (e: 'modelChanged', payload: { aiConfigId: number; model: string; modelPresetId: string }): void
}>()

const {
  chatRootRef,
  chatScrollRef,
  currentSessionId,
  sessionList,
  loadChatHistory,
  createSessionFromButton,
  deleteSession,
  deleteSessions,
  renameSession,
  pendingQueue,
  frontPromptUsesPortal,
  openFrontPromptPopup,
  scheduleFrontPromptPopupClose,
  frontPromptButtonRef,
  frontPromptPopupOpen,
  toggleFrontPromptPopup,
  copyFrontPrompt,
  frontPromptCopied,
  frontPromptPopupTarget,
  frontPromptPopupRef,
  frontPromptPopupStyle,
  clearFrontPromptPopupClose,
  frontPromptBaseText,
  frontPromptPreviewError,
  frontPromptToolGroups,
  frontPromptAvailableTools,
  frontPromptToolMcpEnabled,
  frontPromptToolSchemaError,
  externalControlMode,
  externalControlError,
  isBlankConversation,
  recentNormalSessions,
  recentTaskSessions,
  chatMessages,
  configuredFrontPrompt,
  liveAssistantText,
  liveTargetText,
  liveThinkingText,
  currentRunPhase,
  isRunActive,
  runTimingText,
  currentMcpArguments,
  currentMcpDeviceId,
  timeTick,
  phaseEnterTs,
  appliedEditsArray,
  appliedSignaturesArray,
  actionResults,
  actionResultsBySignature,
  isTyping,
  isSubmitting,
  onConversationDelete,
  onConversationRecall,
  onConversationApply,
  onConversationRevert,
  stickToBottom,
  resumeFollowingLatest,
  chatInput,
  isFileSelectorOpen,
  currentPath,
  attachableToolGroups,
  selectedToolGroupKeys,
  selectedMcpToolNames,
  chatMentions,
  uploadedAttachments,
  uploadingCount,
  aiKindValue,
  modelOptions,
  selectedModelId,
  modelSwitching,
  toggleToolGroup,
  toggleMcpTool,
  handleChatSend,
  stopCurrentRun,
  handleToggleFileSelector,
  navigateTo,
  navigatePath,
  navigateBack,
  toggleFileSelection,
  clearAttachments,
  handleRefreshFiles,
  uploadLocalFiles,
  removeUploadedAttachment,
  switchConversationModel,
  addChatMention,
} = useChatWorkspace(props, emit, { alert, confirm })

const remoteScreenDevice = computed(() => resolveRemoteScreenDevice(
  props.remoteScreenDevices || [],
  currentMcpDeviceId.value,
  chatMessages.value,
))
</script>

<template>
  <div ref="chatRootRef" class="chat-viewport flex flex-col h-full gap-3">
    <div class="flex items-center justify-between gap-1 sm:gap-2">
      <div class="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
        <ChatHeader
          :currentSessionId="currentSessionId"
          :sessionList="sessionList"
          @change="loadChatHistory"
          @create="createSessionFromButton"
          @delete="deleteSession"
          @batch-delete="deleteSessions"
          @rename="renameSession"
        />
      </div>
      <div class="flex items-center gap-1 sm:gap-2 shrink-0">
        <span
          v-if="pendingQueue.length"
          class="shrink-0 text-[11px] tabular-nums text-amber-600 dark:text-amber-400"
          title="AI 正在生成，这些消息将于本轮结束后自动接上"
        >待发送 {{ pendingQueue.length }} 条</span>
        <div
          class="relative"
          :class="{ 'group/front-prompt': !frontPromptUsesPortal }"
          @mouseenter="props.floatingLayer ? openFrontPromptPopup() : undefined"
          @mouseleave="scheduleFrontPromptPopupClose"
        >
          <button
            ref="frontPromptButtonRef"
            class="shrink-0 text-xs px-2 py-1 rounded border border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/20"
            type="button"
            :aria-expanded="frontPromptUsesPortal ? frontPromptPopupOpen : undefined"
            @click.stop="toggleFrontPromptPopup"
          >
            前置 Prompt
          </button>
          <div
            v-if="!frontPromptUsesPortal"
            class="absolute right-0 top-full z-[120] hidden w-[min(42rem,calc(100vw-2rem))] pt-2 group-hover/front-prompt:block"
          >
            <div class="max-h-[70dvh] overflow-hidden rounded-lg acrylic-modal shadow-xl">
              <div class="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">前置 Prompt</div>
                <button
                  class="shrink-0 rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:border-violet-300 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-500 dark:hover:text-violet-300"
                  type="button"
                  @click.stop="copyFrontPrompt"
                >
                  {{ frontPromptCopied ? '已复制' : '复制' }}
                </button>
              </div>
              <div class="max-h-[calc(70dvh-3.5rem)] overflow-auto">
                <FrontPromptPreview
                  :prompt-text="frontPromptBaseText"
                  :prompt-error="frontPromptPreviewError"
                  :tool-groups="frontPromptToolGroups"
                  :available-tools="frontPromptAvailableTools"
                  :mcp-enabled="frontPromptToolMcpEnabled"
                  :tool-schema-error="frontPromptToolSchemaError"
                />
              </div>
            </div>
          </div>
        </div>
        <Teleport :to="frontPromptPopupTarget">
          <div
            v-if="frontPromptUsesPortal && frontPromptPopupOpen"
            ref="frontPromptPopupRef"
            :style="frontPromptPopupStyle"
            class="fixed pointer-events-auto flex flex-col overflow-hidden rounded-lg acrylic-modal shadow-xl"
            @mouseenter="clearFrontPromptPopupClose"
            @mouseleave="scheduleFrontPromptPopupClose"
          >
            <div class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
              <div class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">前置 Prompt</div>
              <button
                class="shrink-0 rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:border-violet-300 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-500 dark:hover:text-violet-300"
                type="button"
                @click.stop="copyFrontPrompt"
              >
                {{ frontPromptCopied ? '已复制' : '复制' }}
              </button>
            </div>
            <div class="min-h-0 flex-1 overflow-auto">
              <FrontPromptPreview
                :prompt-text="frontPromptBaseText"
                :prompt-error="frontPromptPreviewError"
                :tool-groups="frontPromptToolGroups"
                :available-tools="frontPromptAvailableTools"
                :mcp-enabled="frontPromptToolMcpEnabled"
                :tool-schema-error="frontPromptToolSchemaError"
              />
            </div>
          </div>
        </Teleport>
        <button
          class="shrink-0 text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
          @click="emit('open-settings')"
        >
          设置
        </button>
      </div>
    </div>

    <!-- 聊天内容区：消息 + 输入（任务流程已移到顶部标题边上，水平显示） -->
    <div class="relative flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <ChatRemoteScreenBackdrop
        v-if="remoteScreenDevice"
        class="z-0"
        :device-id="remoteScreenDevice.id"
      />
      <div ref="chatScrollRef" class="chat-scroll-viewport relative z-10 flex-1 overflow-y-auto">
        <!-- 空白对话欢迎页：logo + 最近对话 -->
        <div
          v-if="isBlankConversation"
          class="flex min-h-[300px] h-full flex-col items-center justify-center gap-5 px-4 py-8"
        >
          <img
            :src="heySureLogo"
            alt="HeySure"
            class="h-16 w-16 sm:h-20 sm:w-20 object-contain opacity-90 drop-shadow-sm"
          />
          <div class="text-center space-y-1">
            <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">开始一场新对话</div>
            <div class="text-xs text-zinc-400 dark:text-zinc-500">输入第一句话后会自动生成标题，也可稍后手动重命名</div>
          </div>

          <div
            v-if="recentNormalSessions.length > 0 || recentTaskSessions.length > 0"
            class="grid w-full max-w-2xl gap-4 sm:grid-cols-2"
          >
            <div class="space-y-2">
              <div class="px-1 text-[11px] font-semibold tracking-wide text-zinc-400 dark:text-zinc-500">
                最近普通对话
              </div>
              <div class="overflow-hidden rounded-xl border border-zinc-200/80 bg-white/50 divide-y divide-zinc-100 dark:border-zinc-700/60 dark:bg-zinc-900/30 dark:divide-zinc-800">
                <button
                  v-for="session in recentNormalSessions"
                  :key="session.id"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-700 transition-colors hover:bg-indigo-50/70 dark:text-zinc-200 dark:hover:bg-indigo-900/20"
                  @click="loadChatHistory(session.id)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ session.name || BLANK_SESSION_NAME }}</span>
                  <span class="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                    Token {{ formatTokenCount(session.totalTokens) }}
                  </span>
                </button>
                <div v-if="recentNormalSessions.length === 0" class="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
                  暂无普通对话
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <div class="px-1 text-[11px] font-semibold tracking-wide text-zinc-400 dark:text-zinc-500">
                最近任务对话
              </div>
              <div class="overflow-hidden rounded-xl border border-zinc-200/80 bg-white/50 divide-y divide-zinc-100 dark:border-zinc-700/60 dark:bg-zinc-900/30 dark:divide-zinc-800">
                <button
                  v-for="session in recentTaskSessions"
                  :key="session.id"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-700 transition-colors hover:bg-emerald-50/70 dark:text-zinc-200 dark:hover:bg-emerald-900/20"
                  @click="loadChatHistory(session.id)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ session.name || BLANK_SESSION_NAME }}</span>
                  <span class="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                    Token {{ formatTokenCount(session.totalTokens) }}
                  </span>
                </button>
                <div v-if="recentTaskSessions.length === 0" class="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
                  暂无任务对话
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-[11px] text-zinc-400 dark:text-zinc-500">
            暂无历史对话
          </div>
        </div>

        <ChatConversationView
          v-else
          :baseMessages="chatMessages"
          :sessionActive="!!currentSessionId"
          :frontPromptText="configuredFrontPrompt"
          :showFrontPrompt="false"
          :frontPromptPlaceholder="'（当前会话尚未记录系统提示词，发送首条消息后显示实际 Prompt）'"
          :mcpIcon="props.mcpIcon"
          :mcpDynamicRule="props.mcpDynamicRule"
          :aiConfigId="props.aiConfigId"
          :sessionId="currentSessionId"
          :liveText="liveAssistantText"
          :liveTargetText="liveTargetText"
          :liveThinking="liveThinkingText"
          :livePhase="currentRunPhase"
          :typingStatusText="isRunActive ? runTimingText : ''"
          :typingStatusDetails="currentRunPhase === 'waiting_mcp' ? currentMcpArguments : ''"
          :nowTimestamp="isRunActive ? timeTick : undefined"
          :liveSegmentStartedAt="currentRunPhase === 'generating' ? phaseEnterTs ?? undefined : undefined"
          :appliedEdits="appliedEditsArray"
          :appliedSignatures="appliedSignaturesArray"
          :actionResults="actionResults"
          :actionResultsBySignature="actionResultsBySignature"
          :isTyping="isTyping"
          :stripMarkdownSymbols="!!props.stripMarkdownSymbols"
          @delete="onConversationDelete"
          @recall="onConversationRecall"
          @apply="onConversationApply"
          @revert="onConversationRevert"
        />
      </div>

      <button
        v-if="!stickToBottom && !isBlankConversation"
        type="button"
        class="absolute bottom-20 left-1/2 z-40 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-lg backdrop-blur transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
        :aria-label="isRunActive ? '跟随最新消息' : '回到最新消息'"
        :title="isRunActive ? '跟随最新消息' : '回到最新消息'"
        @click="resumeFollowingLatest"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div v-if="externalControlMode" class="rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-2 text-center text-xs text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300">
        消息将进入外部控制器队列；本机 Codex 领取后，回复会回到当前对话。
        <span v-if="externalControlError" class="ml-1 text-rose-600 dark:text-rose-300">{{ externalControlError }}</span>
      </div>
      <ChatInput
        class="relative z-10"
        v-model="chatInput"
        :isTyping="isTyping"
        :isSubmitting="isSubmitting"
        :isFileSelectorOpen="isFileSelectorOpen"
        :allFiles="allFiles"
        :selectedFiles="selectedFiles"
        :currentPath="currentPath"
        :selectable-file-root="selectableFileRoot"
        :toolGroups="attachableToolGroups"
        :selectedToolGroups="selectedToolGroupKeys"
        :selectedToolNames="selectedMcpToolNames"
        :mentions="chatMentions"
        :uploadedAttachments="uploadedAttachments"
        :uploadingCount="uploadingCount"
        :modelOptions="aiKindValue === 'core' ? modelOptions : []"
        :selectedModelId="selectedModelId"
        :modelSwitching="modelSwitching"
        @toggleToolGroup="toggleToolGroup"
        @toggleTool="toggleMcpTool"
        @send="handleChatSend"
        @stop="stopCurrentRun"
        @toggleFileSelector="handleToggleFileSelector"
        @closeFileSelector="isFileSelectorOpen = false"
        @navigateTo="navigateTo"
        @navigatePath="navigatePath"
        @navigateBack="navigateBack"
        @toggleFile="toggleFileSelection"
        @clearFiles="clearAttachments"
        @refreshFiles="handleRefreshFiles"
        @uploadFiles="uploadLocalFiles"
        @removeUpload="removeUploadedAttachment"
        @selectModel="switchConversationModel"
        @addMention="addChatMention"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-viewport {
  box-sizing: border-box;
}

@media (max-width: 767px) {
  .chat-viewport {
    padding-bottom: var(--chat-keyboard-inset, 0px);
  }
}
</style>
