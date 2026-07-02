<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { fetchWorkspaceFileBlob, readWorkspaceFile, type WorkspaceFileKind } from '@/api/workspace'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

interface Props {
  isOpen: boolean
  allFiles: string[]
  selectedFiles: string[]
  currentPath: string
  selectableFileRoot?: string
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
const normalizedSelectableRoot = computed(() =>
  String(props.selectableFileRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
const previewPath = ref('')
const previewContent = ref('')
const previewKind = ref<WorkspaceFileKind>('text')
const previewSize = ref(0)
const previewBinary = ref(false)
const previewTooLarge = ref(false)
const previewLoading = ref(false)
const previewError = ref('')
const previewMediaUrl = ref('')
const previewDownloading = ref(false)
let fileClickTimer: number | null = null

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'])

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

const fileExt = (path: string) => {
  const name = String(path || '').split('/').pop() || ''
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

const looksLikeImage = (path: string) => IMAGE_EXTS.has(fileExt(path))
const looksLikeVideo = (path: string) => VIDEO_EXTS.has(fileExt(path))

const fmtSize = (bytes: number) => {
  const n = Number(bytes || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const clearPreviewMedia = () => {
  if (previewMediaUrl.value) {
    URL.revokeObjectURL(previewMediaUrl.value)
    previewMediaUrl.value = ''
  }
}

const closePreview = () => {
  previewPath.value = ''
  previewContent.value = ''
  previewKind.value = 'text'
  previewSize.value = 0
  previewBinary.value = false
  previewTooLarge.value = false
  previewError.value = ''
  clearPreviewMedia()
}

const openPreview = async (path: string) => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return
  closePreview()
  previewPath.value = normalized
  previewLoading.value = true
  try {
    if (looksLikeImage(normalized)) {
      previewKind.value = 'image'
      const blob = await fetchWorkspaceFileBlob(normalized)
      previewSize.value = blob.size
      previewMediaUrl.value = URL.createObjectURL(blob)
      return
    }
    if (looksLikeVideo(normalized)) {
      previewKind.value = 'video'
      const blob = await fetchWorkspaceFileBlob(normalized)
      previewSize.value = blob.size
      previewMediaUrl.value = URL.createObjectURL(blob)
      return
    }
    const res = await readWorkspaceFile(normalized)
    previewContent.value = res.content || ''
    previewKind.value = res.binary ? 'binary' : (res.kind === 'image' || res.kind === 'video' ? res.kind : 'text')
    previewSize.value = Number(res.size || 0)
    previewBinary.value = !!res.binary
    previewTooLarge.value = !!res.too_large
  } catch (error: any) {
    previewError.value = String(error?.message || '读取文件失败')
  } finally {
    previewLoading.value = false
  }
}

const downloadPreview = async () => {
  if (!previewPath.value) return
  previewDownloading.value = true
  try {
    const blob = await fetchWorkspaceFileBlob(previewPath.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = previewPath.value.split('/').pop() || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } finally {
    previewDownloading.value = false
  }
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
  void openPreview(path)
}

onBeforeUnmount(() => {
  clearFileClickTimer()
  clearPreviewMedia()
})

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
    class="absolute bottom-full left-0 z-[100] mb-2 flex max-h-[460px] flex-col overflow-hidden rounded-2xl acrylic-modal shadow-2xl shadow-zinc-900/10 dark:shadow-black/40"
    :class="previewPath ? 'w-[min(42rem,calc(100vw-2rem))]' : 'w-80'"
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

    <!-- 文件预览：双击文件打开，行为与管理员文件查看保持一致（图片预览 / 文本查看 / 二进制下载） -->
    <div v-if="previewPath" class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <div class="flex min-w-0 items-center gap-2">
          <button
            class="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400"
            @click="closePreview"
          >
            返回
          </button>
          <span class="min-w-0 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300" :title="previewPath">{{ previewPath }}</span>
          <span v-if="previewSize" class="shrink-0 text-[10px] text-zinc-400">{{ fmtSize(previewSize) }}</span>
        </div>
        <button
          class="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-indigo-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-900/20"
          :disabled="previewDownloading"
          @click="downloadPreview"
        >
          {{ previewDownloading ? '下载中…' : '下载' }}
        </button>
      </div>

      <div class="custom-scrollbar min-h-0 flex-1 overflow-auto p-2">
        <div v-if="previewLoading" class="p-8 text-center text-[12px] text-zinc-400">加载中…</div>
        <div v-else-if="previewError" class="p-8 text-center text-[12px] text-rose-500">{{ previewError }}</div>
        <div v-else-if="previewKind === 'image'" class="flex min-h-[320px] items-center justify-center rounded-xl bg-zinc-100/60 p-3 dark:bg-zinc-950/60">
          <img v-if="previewMediaUrl" :src="previewMediaUrl" :alt="previewPath" class="max-h-[360px] max-w-full object-contain" />
          <span v-else class="text-[12px] text-zinc-400">无法预览此图片</span>
        </div>
        <div v-else-if="previewKind === 'video'" class="flex min-h-[320px] items-center justify-center rounded-xl bg-zinc-950 p-3">
          <video
            v-if="previewMediaUrl"
            :src="previewMediaUrl"
            controls
            preload="metadata"
            class="max-h-[360px] max-w-full rounded-lg"
          />
          <span v-else class="text-[12px] text-zinc-400">无法预览此视频</span>
        </div>
        <div v-else-if="previewBinary || previewTooLarge || previewKind === 'binary'" class="p-8 text-center text-[12px] text-zinc-400">
          {{ previewTooLarge ? '文件过大（> 1 MB），无法在线查看。' : '这是二进制文件，无法在线查看。' }}
          <div class="mt-3">
            <button
              class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              :disabled="previewDownloading"
              @click="downloadPreview"
            >
              下载文件
            </button>
          </div>
        </div>
        <pre
          v-else
          class="min-h-[320px] whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100"
        >{{ previewContent }}</pre>
      </div>
    </div>

    <!-- 文件目录 -->
    <div v-else class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
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
        <label
          v-for="group in toolGroupList"
          :key="group.groupKey"
          class="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"
        >
          <input
            type="checkbox"
            :checked="isGroupChecked(group.groupKey)"
            @change="emit('toggleToolGroup', group.groupKey)"
            class="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800/60"
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
</template>
