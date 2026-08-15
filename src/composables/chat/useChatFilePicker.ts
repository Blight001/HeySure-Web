import { computed } from 'vue'
import type { ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
import type { ChatMention } from '@/utils/chatMentions'
import {
  isSelectableFilePath as isPathUnderRoot,
  normalizeSelectionPath,
  toAiWorkspacePath as toWorkspaceRelativePath,
} from '@/utils/chatWorkspacePaths'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const togglePathInSelection = (selected: string[], fullPath: string) => {
  const next = [...selected]
  const idx = next.indexOf(fullPath)
  if (idx > -1) next.splice(idx, 1)
  else next.push(fullPath)
  return next
}

const resolveTogglePath = (
  file: string,
  currentPath: string,
  allFiles: string[],
) => {
  let fullPath = normalizeSelectionPath(file)
  if (!fullPath.includes('/') && currentPath) fullPath = normalizeSelectionPath(`${currentPath}/${fullPath}`)
  if (!fullPath.endsWith('/') && allFiles.includes(`${fullPath}/`)) fullPath = `${fullPath}/`
  return fullPath
}

const addChatMention = (
  state: ChatWorkspaceState,
  toAiWorkspacePath: (path: string) => string,
  mention: ChatMention,
) => {
  const normalizedMention = mention.type === 'file'
    ? {
        ...mention,
        reference: toAiWorkspacePath(mention.reference),
        detail: toAiWorkspacePath(mention.reference),
      }
    : mention
  const key = `${normalizedMention.type}:${normalizedMention.reference}`
  state.chatMentions.value = [
    ...state.chatMentions.value.filter(item => `${item.type}:${item.reference}` !== key),
    normalizedMention,
  ]
}

export const useChatFilePicker = (
  props: ChatInterfaceProps,
  emit: ChatInterfaceEmitFn,
  state: ChatWorkspaceState,
) => {
  const normalizedAllFiles = computed(() => props.allFiles.map(file => file.replace(/\\/g, '/')))
  const normalizedSelectedFiles = computed(() => props.selectedFiles.map(file => file.replace(/\\/g, '/')))
  const normalizedSelectableFileRoot = computed(() =>
    String(props.selectableFileRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
  const isSelectableFilePath = (path: string) => isPathUnderRoot(path, normalizedSelectableFileRoot.value)
  const toAiWorkspacePath = (path: string) => toWorkspaceRelativePath(path, normalizedSelectableFileRoot.value)
  return {
    currentPath: state.currentPath,
    isFileSelectorOpen: state.isFileSelectorOpen,
    normalizedAllFiles,
    normalizedSelectedFiles,
    isSelectableFilePath,
    toAiWorkspacePath,
    normalizeSelectionPath,
    navigateTo: (folder: string) => {
      emit('refreshFiles')
      state.currentPath.value = state.currentPath.value === '' ? folder : `${state.currentPath.value}/${folder}`
    },
    navigateBack: () => {
      emit('refreshFiles')
      const parts = state.currentPath.value.split('/')
      state.currentPath.value = parts.length <= 1 ? '' : parts.slice(0, -1).join('/')
    },
    navigatePath: (path: string) => {
      emit('refreshFiles')
      state.currentPath.value = normalizeSelectionPath(path).replace(/\/+$/g, '')
    },
    toggleFileSelection: (file: string) => {
      const fullPath = resolveTogglePath(file, state.currentPath.value, normalizedAllFiles.value)
      if (!isSelectableFilePath(fullPath)) return
      const selected = normalizedSelectedFiles.value.map(path => normalizeSelectionPath(path))
      emit('update:selectedFiles', togglePathInSelection(selected, fullPath))
    },
    handleRefreshFiles: () => emit('refreshFiles'),
    handleToggleFileSelector: () => {
      const nextOpen = !state.isFileSelectorOpen.value
      state.isFileSelectorOpen.value = nextOpen
      if (nextOpen && props.allFiles.length === 0) emit('refreshFiles')
    },
    addChatMention: (mention: ChatMention) => addChatMention(state, toAiWorkspacePath, mention),
  }
}

export type ChatFilePickerApi = ReturnType<typeof useChatFilePicker>
