<script setup lang="ts">
import { computed } from 'vue'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

interface Props {
  isOpen: boolean
  allFiles: string[]
  selectedFiles: string[]
  currentPath: string
  /** 可附带到本轮消息的 MCP 工具组（工坊 / 工具箱 / 端侧设备） */
  toolGroups?: McpCatalogToolGroup[]
  /** 已勾选的工具组 groupKey 列表 */
  selectedToolGroups?: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'navigate', path: string): void
  (e: 'navigateBack'): void
  (e: 'toggle', file: string): void
  (e: 'clear'): void
  (e: 'refresh'): void
  (e: 'toggleToolGroup', groupKey: string): void
}>()

const isHiddenSandboxPath = (path: string) => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.some(part => part === '_admins' || part === '.sandbox_home' || part === '.sandbox_tmp' || part.startsWith('.sandbox'))
}

const normalizedAllFiles = computed(() => props.allFiles
  .map(file => file.replace(/\\/g, '/'))
  .filter(file => !isHiddenSandboxPath(file)))
const normalizedSelectedFiles = computed(() => props.selectedFiles.map(file => file.replace(/\\/g, '/')))

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

const navigateTo = (folder: string) => {
  emit('navigate', folder)
}

const isFileSelected = (file: string) => {
  const fullPath = props.currentPath === '' ? file : `${props.currentPath}/${file}`
  return normalizedSelectedFiles.value.includes(fullPath)
}

const toolGroupList = computed(() =>
  (props.toolGroups || []).filter(group => group.groupKey && group.tools.length > 0))

const isGroupChecked = (groupKey: string) =>
  (props.selectedToolGroups || []).includes(groupKey)

const groupKindLabel = (group: McpCatalogToolGroup) =>
  group.groupKind === 'device' ? '端侧' : '工作区'
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute bottom-full left-0 z-[100] mb-2 flex max-h-[460px] w-80 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-2xl shadow-zinc-900/10 backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-black/40"
  >
    <!-- 头部：路径导航 -->
    <div class="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
      <div class="flex min-w-0 items-center gap-1.5">
        <button
          v-if="currentPath"
          @click="emit('navigateBack')"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="返回上级"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        <span class="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{{ currentPath || '工作区根目录' }}</span>
      </div>
      <button
        @click="emit('close')"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        title="关闭"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
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
      <label
        v-for="file in currentFolderItems.files"
        :key="'fi-' + file"
        class="group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <input
          type="checkbox"
          :checked="isFileSelected(file)"
          @change="emit('toggle', file)"
          class="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
        >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-200">{{ file }}</span>
      </label>
    </div>

    <!-- 工具调用：勾选后本轮消息附带该组 MCP 工具说明 -->
    <div v-if="toolGroupList.length > 0" class="shrink-0 border-t border-zinc-100 dark:border-zinc-800">
      <div class="flex items-baseline gap-1.5 px-3 pb-1 pt-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">工具调用</span>
        <span class="truncate text-[10px] text-zinc-400 dark:text-zinc-500">勾选后本轮消息附带该组 MCP 说明</span>
      </div>
      <div class="custom-scrollbar max-h-36 overflow-y-auto px-1.5 pb-1.5">
        <label
          v-for="group in toolGroupList"
          :key="group.groupKey"
          class="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"
        >
          <input
            type="checkbox"
            :checked="isGroupChecked(group.groupKey)"
            @change="emit('toggleToolGroup', group.groupKey)"
            class="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
          >
          <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{{ group.groupLabel }}</span>
          <span
            class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
            :class="group.groupKind === 'device'
              ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
              : 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300'"
          >{{ groupKindLabel(group) }}</span>
          <span class="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{{ group.tools.length }} 个工具</span>
        </label>
      </div>
    </div>

    <!-- 底部：统计 + 操作 -->
    <div class="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
      <span class="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
        已选 {{ selectedFiles.length }} 个文件<template v-if="toolGroupList.length > 0"> · {{ (selectedToolGroups || []).length }} 组工具</template>
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
</template>
