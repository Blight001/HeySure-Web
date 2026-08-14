<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'
import WorkspaceFilePreviewDialog from './WorkspaceFilePreviewDialog.vue'

interface Props {
  isOpen: boolean
  allFiles: string[]
  selectedFiles: string[]
  currentPath: string
  selectableFileRoot?: string
  /** 可附带到本轮消息的 MCP 工具组（图书馆设备 / 工具箱 / 端侧设备） */
  toolGroups?: McpCatalogToolGroup[]
  /** 已勾选的工具组 groupKey 列表 */
  selectedToolGroups?: string[]
  selectedToolNames?: string[]
  modelOptions?: Array<{ id: string; name: string; model: string }>
  selectedModelId?: string
  modelSwitching?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'navigate', path: string): void
  (e: 'navigatePath', path: string): void
  (e: 'navigateBack'): void
  (e: 'toggle', file: string): void
  (e: 'clear'): void
  (e: 'refresh'): void
  (e: 'pickLocalFiles'): void
  (e: 'toggleToolGroup', groupKey: string): void
  (e: 'toggleTool', toolName: string): void
  (e: 'selectModel', modelId: string): void
}>()

const isHiddenSandboxPath = (path: string) => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.some(part => part === '_admins' || part === '.sandbox_home' || part === '.sandbox_tmp' || part.startsWith('.sandbox'))
}

const normalizedAllFiles = computed(() => props.allFiles
  .map(file => file.replace(/\\/g, '/'))
  .filter(file => !isHiddenSandboxPath(file)))
const normalizedSelectedFiles = computed(() => props.selectedFiles.map(file => file.replace(/\\/g, '/')))
const normalizedSelectableRoot = computed(() =>
  String(props.selectableFileRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
const previewPath = ref('')
const expandedToolGroups = ref<string[]>([])
let fileClickTimer: number | null = null

const currentFolderItems = computed(() => {
  const items = new Set<string>()
  const folders = new Set<string>()

  normalizedAllFiles.value.forEach(file => {
    const isDir = file.endsWith('/')
    const cleanPath = isDir ? file.slice(0, -1) : file

    if (props.currentPath === '') {
      const parts = cleanPath.split('/')
      if (parts.length > 1 || isDir) folders.add(parts[0])
      else if (parts[0]) items.add(parts[0])
    } else {
      if (cleanPath.startsWith(props.currentPath + '/')) {
        const relative = cleanPath.slice(props.currentPath.length + 1)
        if (!relative) return
        const parts = relative.split('/')
        if (parts.length > 1 || isDir) folders.add(parts[0])
        else if (parts[0]) items.add(parts[0])
      }
    }
  })

  return {
    folders: Array.from(folders).sort(),
    files: Array.from(items).sort()
  }
})

const itemPath = (name: string, folder = false) => {
  const base = props.currentPath === '' ? name : `${props.currentPath}/${name}`
  return folder ? `${base}/` : base
}

const navigateTo = (folder: string) => {
  emit('navigate', folder)
}

const isItemSelected = (name: string, folder = false) =>
  normalizedSelectedFiles.value.includes(itemPath(name, folder))

const isItemSelectable = (name: string, folder = false) => {
  const root = normalizedSelectableRoot.value
  if (!root) return true
  const fullPath = itemPath(name, folder).replace(/\/+$/g, '')
  return fullPath === root || fullPath.startsWith(`${root}/`)
}

const disabledItemTitle = (name: string, folder = false) =>
  isItemSelectable(name, folder)
    ? (folder ? '选择文件夹' : '选择文件，双击预览')
    : (folder ? '当前 AI 不能附加此文件夹' : '当前 AI 不能附加此文件；可双击预览')

const closePreview = () => {
  previewPath.value = ''
}

const openPreview = (path: string) => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return
  previewPath.value = normalized
}

const clearFileClickTimer = () => {
  if (fileClickTimer !== null) {
    window.clearTimeout(fileClickTimer)
    fileClickTimer = null
  }
}

const toggleFile = (path: string) => {
  emit('toggle', path)
}

const handleFileClick = (event: MouseEvent, path: string) => {
  if (event.detail > 1) {
    clearFileClickTimer()
    return
  }
  clearFileClickTimer()
  fileClickTimer = window.setTimeout(() => {
    fileClickTimer = null
    toggleFile(path)
  }, 280)
}

const handleFileDblClick = (path: string) => {
  clearFileClickTimer()
  openPreview(path)
}

onBeforeUnmount(() => {
  clearFileClickTimer()
})

const pathBreadcrumbs = computed(() => {
  let path = ''
  return String(props.currentPath || '').split('/').filter(Boolean).map(label => {
    path = path ? `${path}/${label}` : label
    return { label, path }
  })
})

const toolGroupList = computed(() =>
  (props.toolGroups || []).filter(group => group.groupKey && group.tools.length > 0))

const isGroupChecked = (group: McpCatalogToolGroup) =>
  !group.disabled && group.tools.length > 0
    && group.tools.every(tool => (props.selectedToolNames || []).includes(tool.name))

const isGroupPartiallyChecked = (group: McpCatalogToolGroup) => {
  if (group.disabled || !group.tools.length) return false
  const selected = group.tools.filter(tool => (props.selectedToolNames || []).includes(tool.name)).length
  return selected > 0 && selected < group.tools.length
}

const isToolChecked = (name: string) => (props.selectedToolNames || []).includes(name)

const toggleToolGroupExpanded = (groupKey: string) => {
  const next = [...expandedToolGroups.value]
  const index = next.indexOf(groupKey)
  if (index >= 0) next.splice(index, 1)
  else next.push(groupKey)
  expandedToolGroups.value = next
}

const groupKindLabel = (group: McpCatalogToolGroup) =>
  group.groupKind === 'device' ? '端侧' : '工作区'

const groupTitle = (group: McpCatalogToolGroup) =>
  group.disabled ? (group.disabledReason || '当前不可勾选该组工具') : ''

const handleModelChange = (event: Event) => {
  const modelId = (event.target as HTMLSelectElement).value
  if (modelId && modelId !== props.selectedModelId) emit('selectModel', modelId)
}
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute bottom-full left-0 z-[100] mb-2 flex max-h-[460px] w-80 flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-900/10 dark:shadow-black/40"
  >
    <!-- 模型切换固定在加号面板顶部，位于工作区根目录导航上方。 -->
    <div
      v-if="(modelOptions?.length || 0) > 0"
      class="shrink-0 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800"
    >
      <label class="flex items-center gap-2">
        <span class="shrink-0 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">当前模型</span>
        <select
          class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-700 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          :value="selectedModelId"
          :disabled="modelSwitching"
          :title="modelSwitching ? '正在切换模型' : '切换当前会话使用的模型'"
          @change="handleModelChange"
        >
          <option v-for="option in modelOptions" :key="option.id" :value="option.id">
            {{ option.name || option.model }}
          </option>
        </select>
        <span v-if="modelSwitching" class="shrink-0 text-[10px] text-indigo-500">切换中…</span>
      </label>
    </div>

    <div class="shrink-0 border-b border-zinc-100 p-1.5 dark:border-zinc-800">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"
        title="从本机上传图片或文件，也可以直接拖放或粘贴到输入框"
        @click="emit('pickLocalFiles')"
      >
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7">
            <path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.125 4.125 0 0 1-5.834-5.834l9.04-9.04a2.625 2.625 0 0 1 3.713 3.713l-9.04 9.04a1.125 1.125 0 0 1-1.591-1.591l8.293-8.293" />
          </svg>
        </span>
        <span class="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">上传文件</span>
      </button>
    </div>

    <!-- 固定标题：进入子目录时也不被路径导航替换。 -->
    <div class="flex shrink-0 items-center gap-1.5 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        <button
          type="button"
          class="truncate text-[12px] font-semibold text-zinc-600 dark:text-zinc-300"
          :class="currentPath ? 'hover:text-indigo-600 dark:hover:text-indigo-300' : 'cursor-default'"
          @click="currentPath && emit('navigatePath', '')"
        >工作区根目录</button>
    </div>

    <!-- 子目录导航单独占一行，不覆盖固定标题和上传入口。 -->
    <div
      v-if="currentPath"
      class="flex shrink-0 items-center gap-1.5 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800"
    >
      <button
        @click="emit('navigateBack')"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        title="返回上级"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <nav class="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] text-zinc-500 dark:text-zinc-400" :title="currentPath">
        <template v-for="(crumb, index) in pathBreadcrumbs" :key="crumb.path">
          <span v-if="index > 0" class="shrink-0 text-zinc-300 dark:text-zinc-600">/</span>
          <button
            v-if="index < pathBreadcrumbs.length - 1"
            type="button"
            class="min-w-0 truncate font-mono hover:text-indigo-600 dark:hover:text-indigo-300"
            @click="emit('navigatePath', crumb.path)"
          >{{ crumb.label }}</button>
          <span v-else class="min-w-0 truncate font-mono text-zinc-700 dark:text-zinc-200">{{ crumb.label }}</span>
        </template>
      </nav>
    </div>

    <!-- 文件目录 -->
    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
      <div
        v-if="currentFolderItems.folders.length === 0 && currentFolderItems.files.length === 0"
        class="p-5 text-center text-[11px] text-zinc-400"
      >
        空文件夹
      </div>

      <!-- Folders -->
      <div
        v-for="folder in currentFolderItems.folders"
        :key="'f-' + folder"
        @click="navigateTo(folder)"
        class="group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"
        :title="disabledItemTitle(folder, true)"
      >
        <input
          type="checkbox"
          :checked="isItemSelected(folder, true)"
          :disabled="!isItemSelectable(folder, true)"
          @click.stop
          @change="isItemSelectable(folder, true) && emit('toggle', itemPath(folder, true))"
          class="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-800/60"
          :class="isItemSelectable(folder, true) ? 'cursor-pointer' : 'cursor-not-allowed'"
        >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
        </svg>
        <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-700 group-hover:text-indigo-600 dark:text-zinc-300 dark:group-hover:text-indigo-300">{{ folder }}</span>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <!-- Files -->
      <div
        v-for="file in currentFolderItems.files"
        :key="'fi-' + file"
        role="button"
        tabindex="0"
        class="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors"
        :class="isItemSelectable(file)
          ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
          : 'cursor-default opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'"
        :title="disabledItemTitle(file)"
        @click="isItemSelectable(file) && handleFileClick($event, itemPath(file))"
        @dblclick.prevent="handleFileDblClick(itemPath(file))"
        @keydown.enter.prevent="isItemSelectable(file) && toggleFile(itemPath(file))"
        @keydown.space.prevent="isItemSelectable(file) && toggleFile(itemPath(file))"
      >
        <input
          type="checkbox"
          :checked="isItemSelected(file)"
          :disabled="!isItemSelectable(file)"
          @click.stop
          @dblclick.stop
          @change="isItemSelectable(file) && toggleFile(itemPath(file))"
          class="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-800/60"
          :class="isItemSelectable(file) ? 'cursor-pointer' : 'cursor-not-allowed'"
        >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-200">{{ file }}</span>
      </div>
    </div>

    <!-- 工具调用：勾选后本轮消息附带该组 MCP 工具说明 -->
    <div v-if="!previewPath && toolGroupList.length > 0" class="shrink-0 border-t border-zinc-100 dark:border-zinc-800">
      <div class="flex items-baseline gap-1.5 px-3 pb-1 pt-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">工具调用</span>
        <span class="truncate text-[10px] text-zinc-400 dark:text-zinc-500">勾选后本轮消息附带该组 MCP 说明</span>
      </div>
      <div class="custom-scrollbar max-h-36 overflow-y-auto px-1.5 pb-1.5">
        <div
          v-for="group in toolGroupList"
          :key="group.groupKey"
          class="rounded-xl transition-colors"
          :class="group.disabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20'"
          :title="groupTitle(group)"
        >
          <div class="flex items-center gap-2 px-2 py-1.5">
            <input
              type="checkbox"
              :checked="isGroupChecked(group)"
              :indeterminate="isGroupPartiallyChecked(group)"
              :disabled="group.disabled"
              @change="!group.disabled && emit('toggleToolGroup', group.groupKey)"
              class="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-800/60"
              :class="group.disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
            >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              :disabled="group.disabled"
              @click="!group.disabled && toggleToolGroupExpanded(group.groupKey)"
            >
              <svg class="h-3 w-3 shrink-0 text-zinc-400 transition-transform" :class="expandedToolGroups.includes(group.groupKey) ? 'rotate-90' : ''" viewBox="0 0 20 20" fill="currentColor"><path d="m7 5 5 5-5 5V5Z" /></svg>
              <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{{ group.groupLabel }}</span>
            </button>
            <span v-if="group.disabled" class="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">不可用</span>
            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" :class="group.groupKind === 'device' ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300'">{{ groupKindLabel(group) }}</span>
            <span class="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{{ group.tools.filter(tool => isToolChecked(tool.name)).length }}/{{ group.tools.length }}</span>
          </div>
          <div v-if="expandedToolGroups.includes(group.groupKey) && !group.disabled" class="space-y-0.5 px-2 pb-1.5 pl-7">
            <label v-for="tool in group.tools" :key="tool.name" class="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-white/70 dark:hover:bg-zinc-900/50" :title="tool.description || tool.name">
              <input type="checkbox" :checked="isToolChecked(tool.name)" class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800/60" @change="emit('toggleTool', tool.name)">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-mono text-[10px] font-medium text-zinc-700 dark:text-zinc-200">{{ tool.name }}</span>
                <span v-if="tool.description" class="block truncate text-[9px] text-zinc-400 dark:text-zinc-500">{{ tool.description }}</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：统计 + 操作 -->
    <div v-if="!previewPath" class="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
      <span class="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
        已选 {{ selectedFiles.length }} 个路径<template v-if="toolGroupList.length > 0"> · {{ (selectedToolGroups || []).length }} 组工具</template>
      </span>
      <div class="flex gap-1">
        <button
          @click="emit('refresh')"
          class="rounded-lg px-2 py-1 text-[10px] font-medium text-indigo-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20"
        >
          刷新
        </button>
        <button
          @click="emit('clear')"
          class="rounded-lg px-2 py-1 text-[10px] font-medium text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"
        >
          清空
        </button>
      </div>
    </div>
  </div>
  <WorkspaceFilePreviewDialog
    :open="!!previewPath"
    :path="previewPath"
    @close="closePreview"
  />
</template>
