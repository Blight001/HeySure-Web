<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { fetchWorkspaceFileBlob, readWorkspaceFile, type WorkspaceFileKind } from '@/api/workspace'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import ZoomableImage from './ZoomableImage.vue'

type PreviewKind = WorkspaceFileKind | 'audio' | 'document'

const props = withDefaults(defineProps<{
  open: boolean
  path: string
  displayName?: string
  size?: number
  sourceUrl?: string
}>(), {
  displayName: '',
  size: 0,
  sourceUrl: '',
})

const emit = defineEmits<{ (e: 'close'): void }>()
const dialog = ref<HTMLElement | null>(null)
const content = ref('')
const kind = ref<PreviewKind>('text')
const fileSize = ref(0)
const binary = ref(false)
const tooLarge = ref(false)
const loading = ref(false)
const downloading = ref(false)
const error = ref('')
const mediaUrl = ref('')
const popupZIndex = usePopupZIndex(computed(() => props.open))
let loadEpoch = 0

const title = computed(() => props.displayName || props.path.split('/').pop() || '文件')
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'csv', 'tsv', 'log', 'ini', 'conf', 'toml', 'js', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'html', 'py', 'sh', 'ps1', 'bat', 'sql'])

const previewKindForBlob = (blob: Blob): PreviewKind => {
  const mime = String(blob.type || '').toLowerCase()
  const extension = title.value.split('.').pop()?.toLowerCase() || ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'document'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'binary'
}

const fetchSourceBlob = async (path: string) => {
  if (!props.sourceUrl) return fetchWorkspaceFileBlob(path)
  const response = await fetch(props.sourceUrl)
  if (!response.ok) throw new Error(`文件加载失败（HTTP ${response.status}）`)
  return response.blob()
}

const formatSize = (bytes: number) => {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const clearMediaUrl = () => {
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
  mediaUrl.value = ''
}

const resetPreview = () => {
  content.value = ''
  kind.value = 'text'
  fileSize.value = Number(props.size || 0)
  binary.value = false
  tooLarge.value = false
  error.value = ''
  clearMediaUrl()
}

const loadPreview = async () => {
  const path = String(props.path || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!props.open || !path) return
  const epoch = ++loadEpoch
  resetPreview()
  loading.value = true
  await nextTick()
  dialog.value?.focus()
  try {
    if (props.sourceUrl) {
      const blob = await fetchSourceBlob(path)
      if (epoch !== loadEpoch) return
      fileSize.value = blob.size || Number(props.size || 0)
      kind.value = previewKindForBlob(blob)
      binary.value = kind.value === 'binary'
      tooLarge.value = blob.size > 1024 * 1024 && kind.value === 'text'
      if (kind.value === 'text' && !tooLarge.value) content.value = await blob.text()
      else if (kind.value !== 'binary' && !tooLarge.value) mediaUrl.value = URL.createObjectURL(blob)
      return
    }
    const result = await readWorkspaceFile(path)
    if (epoch !== loadEpoch) return
    fileSize.value = Number(result.size || props.size || 0)
    binary.value = !!result.binary
    tooLarge.value = !!result.too_large
    kind.value = result.kind === 'image' || result.kind === 'video'
      ? result.kind
      : (result.binary ? 'binary' : (result.kind || 'text'))
    if (kind.value === 'image' || kind.value === 'video') {
      const blob = await fetchWorkspaceFileBlob(path)
      if (epoch !== loadEpoch) return
      fileSize.value = blob.size || fileSize.value
      mediaUrl.value = URL.createObjectURL(blob)
    } else {
      content.value = result.content || ''
    }
  } catch (reason: any) {
    if (epoch === loadEpoch) error.value = String(reason?.message || '读取文件失败')
  } finally {
    if (epoch === loadEpoch) loading.value = false
  }
}

const download = async () => {
  if (!props.path) return
  downloading.value = true
  try {
    const blob = await fetchSourceBlob(props.path)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = title.value
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  } finally {
    downloading.value = false
  }
}

watch(() => [props.open, props.path, props.sourceUrl] as const, () => {
  if (props.open) void loadPreview()
  else {
    loadEpoch += 1
    resetPreview()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  loadEpoch += 1
  clearMediaUrl()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      :style="{ zIndex: popupZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-3 sm:p-6"
      @click.self="emit('close')"
    >
      <div
        ref="dialog"
        class="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        :aria-label="`预览 ${title}`"
        tabindex="-1"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <header class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ title }}</div>
            <div class="mt-0.5 truncate text-[10px] text-zinc-400">
              <template v-if="fileSize || size">{{ formatSize(fileSize || size) }} · </template>{{ path }}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button class="rounded-lg px-2.5 py-1.5 text-xs font-normal text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" :disabled="downloading" @click="download">
              {{ downloading ? '下载中…' : '下载' }}
            </button>
            <button class="flex h-8 w-8 items-center justify-center rounded-lg text-xl font-normal text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="关闭文件预览" @click="emit('close')">×</button>
          </div>
        </header>
        <div class="custom-scrollbar min-h-[20rem] flex-1 overflow-auto bg-zinc-50/60 p-3 dark:bg-zinc-950/40">
          <div v-if="loading" class="p-12 text-center text-xs text-zinc-400">文件加载中…</div>
          <div v-else-if="error" class="p-12 text-center text-xs text-rose-500">{{ error }}</div>
          <div v-else-if="kind === 'image'" class="h-[min(70vh,46rem)] min-h-[20rem] overflow-hidden rounded-xl bg-zinc-950">
            <ZoomableImage v-if="mediaUrl" :src="mediaUrl" :alt="title" />
          </div>
          <div v-else-if="kind === 'video'" class="flex min-h-[20rem] items-center justify-center bg-zinc-950">
            <video v-if="mediaUrl" :src="mediaUrl" class="max-h-[70vh] max-w-full" controls preload="metadata" />
          </div>
          <div v-else-if="kind === 'audio'" class="flex min-h-[20rem] items-center justify-center">
            <audio v-if="mediaUrl" :src="mediaUrl" class="w-full max-w-xl" controls />
          </div>
          <iframe v-else-if="kind === 'document'" :src="mediaUrl" class="min-h-[70vh] w-full rounded-lg border-0 bg-white" :title="title"></iframe>
          <div v-else-if="binary || tooLarge || kind === 'binary'" class="p-12 text-center text-xs text-zinc-400">
            {{ tooLarge ? '文件过大（> 1 MB），无法在线查看。' : '这是二进制文件，无法在线查看。' }}
            <div class="mt-3"><button class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-normal text-white hover:bg-indigo-700" @click="download">下载文件</button></div>
          </div>
          <pre v-else class="min-h-[20rem] whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed text-zinc-100">{{ content }}</pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>
