<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { FileEntry } from '@/api/admin'
import AppIcon from '@/components/common/AppIcon.vue'
import { ADMIN_DEFAULT_FILE_PATH } from '@/constants/admin'
import {
  buildDataBreadcrumbs,
  formatFileSize,
  formatOptionalDateTime,
  joinDataPath,
} from '@/utils/adminFormat'

const { alert, confirm, prompt } = useMessage()

const DEFAULT_FILE_PATH = ADMIN_DEFAULT_FILE_PATH
const filePath = ref(DEFAULT_FILE_PATH)
const fileEntries = ref<FileEntry[]>([])
const filesLoading = ref(false)
const editingFile = ref<string | null>(null)
const fileContent = ref('')
const fileOriginal = ref('')
const fileLoading = ref(false)
const fileSaving = ref(false)
const fileBinary = ref(false)
const fileTooLarge = ref(false)
const fileKind = ref<'text' | 'image' | 'binary'>('text')
const fileImageUrl = ref('')
const fileDownloading = ref(false)
const fileSelected = ref<Set<string>>(new Set())
const fileBatchBusy = ref(false)

const joinPath = joinDataPath
const fileBreadcrumbs = computed(() => buildDataBreadcrumbs(filePath.value))
const fmtSize = formatFileSize
const fmtTime = formatOptionalDateTime
const fileDirty = computed(() => fileContent.value !== fileOriginal.value)
const fileAllSelected = computed(() =>
  fileEntries.value.length > 0 && fileSelected.value.size === fileEntries.value.length,
)

const closeFile = () => {
  editingFile.value = null
  fileContent.value = ''
  fileOriginal.value = ''
  fileBinary.value = false
  fileTooLarge.value = false
  fileKind.value = 'text'
  if (fileImageUrl.value) {
    URL.revokeObjectURL(fileImageUrl.value)
    fileImageUrl.value = ''
  }
}

const loadFiles = async (path = filePath.value, silent = false) => {
  if (!silent) filesLoading.value = true
  try {
    const res = await adminApi.listFiles(path)
    if (res.path !== filePath.value) fileSelected.value = new Set()
    filePath.value = res.path
    fileEntries.value = res.entries
    const live = new Set(res.entries.map(e => e.path))
    fileSelected.value = new Set([...fileSelected.value].filter(p => live.has(p)))
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    filesLoading.value = false
  }
}

const openFile = async (entry: FileEntry) => {
  closeFile()
  fileLoading.value = true
  editingFile.value = entry.path
  try {
    if (entry.kind === 'image') {
      fileKind.value = 'image'
      const blob = await adminApi.fetchFileBlob(entry.path)
      fileImageUrl.value = URL.createObjectURL(blob)
      return
    }
    const res = await adminApi.readFile(entry.path)
    fileBinary.value = res.binary
    fileTooLarge.value = res.too_large
    fileContent.value = res.content
    fileOriginal.value = res.content
    fileKind.value = res.binary ? 'binary' : 'text'
  } catch (err) {
    editingFile.value = null
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    fileLoading.value = false
  }
}

const openEntry = (entry: FileEntry) => {
  if (entry.is_dir) void loadFiles(entry.path)
  else void openFile(entry)
}

const downloadFile = async (path: string, name: string) => {
  fileDownloading.value = true
  try {
    const blob = await adminApi.fetchFileBlob(path)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    fileDownloading.value = false
  }
}

const toggleSelect = (path: string) => {
  const next = new Set(fileSelected.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  fileSelected.value = next
}

const toggleSelectAll = () => {
  fileSelected.value = fileAllSelected.value
    ? new Set()
    : new Set(fileEntries.value.map(e => e.path))
}

const batchDelete = async () => {
  const paths = [...fileSelected.value]
  if (!paths.length) return
  const ok = await confirm({
    message: `确认删除选中的 ${paths.length} 项？文件夹内的所有内容也会一并删除，此操作不可恢复。`,
    type: 'warning',
    confirmText: '删除',
  })
  if (!ok) return
  fileBatchBusy.value = true
  try {
    const res = await adminApi.batchDeleteFiles(paths)
    if (editingFile.value !== null && res.deleted.includes(editingFile.value)) closeFile()
    fileSelected.value = new Set()
    await loadFiles()
    if (res.errors.length) {
      await alert({
        message: `已删除 ${res.deleted.length} 项，${res.errors.length} 项失败：` +
          res.errors.map(e => `${e.path}（${e.error}）`).join('；'),
        type: 'warning',
      })
    }
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    fileBatchBusy.value = false
  }
}

const saveFile = async () => {
  if (editingFile.value === null) return
  fileSaving.value = true
  try {
    await adminApi.writeFile(editingFile.value, fileContent.value)
    fileOriginal.value = fileContent.value
    await alert({ message: '已保存', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    fileSaving.value = false
  }
}

const newFile = async () => {
  const name = await prompt({
    title: '新建文件',
    message: `在 ${filePath.value ? 'data/' + filePath.value : 'data'} 下创建文件`,
    placeholder: '文件名，如 notes.txt',
  })
  if (name === null) return
  const trimmed = name.trim()
  if (!trimmed) return
  const path = joinPath(filePath.value, trimmed)
  try {
    await adminApi.writeFile(path, '')
    await loadFiles()
    const entry = fileEntries.value.find(e => e.path === path)
    if (entry) await openFile(entry)
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const newFolder = async () => {
  const name = await prompt({
    title: '新建文件夹',
    message: `在 ${filePath.value ? 'data/' + filePath.value : 'data'} 下创建文件夹`,
    placeholder: '文件夹名',
  })
  if (name === null) return
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    await adminApi.makeDir(joinPath(filePath.value, trimmed))
    await loadFiles()
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const renameEntry = async (entry: FileEntry) => {
  const name = await prompt({
    title: '重命名',
    message: `重命名「${entry.name}」`,
    placeholder: '新名称',
    defaultValue: entry.name,
  })
  if (name === null) return
  const trimmed = name.trim()
  if (!trimmed || trimmed === entry.name) return
  try {
    await adminApi.renameFile(entry.path, joinPath(filePath.value, trimmed))
    if (editingFile.value === entry.path) closeFile()
    await loadFiles()
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const deleteEntry = async (entry: FileEntry) => {
  const ok = await confirm({
    message: `确认删除${entry.is_dir ? '文件夹' : '文件'}「${entry.name}」？${entry.is_dir ? '其中所有内容将一并删除，' : ''}此操作不可恢复。`,
    type: 'warning',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await adminApi.deleteFile(entry.path)
    if (editingFile.value === entry.path) closeFile()
    await loadFiles()
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

defineExpose({
  onSwitch: () => {
    if (!fileEntries.value.length && editingFile.value === null) {
      void loadFiles(filePath.value || DEFAULT_FILE_PATH)
    }
  },
})

onUnmounted(() => {
  if (fileImageUrl.value) URL.revokeObjectURL(fileImageUrl.value)
})
</script>

<template>
  <div class="flex-1 overflow-hidden p-3 sm:p-5 min-h-0">
    <div v-if="editingFile !== null" class="h-full flex flex-col min-h-0">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
            @click="closeFile"
          >← 返回</button>
          <span class="text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate" :title="editingFile">data/{{ editingFile }}</span>
          <span v-if="fileDirty" class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">未保存</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400 disabled:opacity-50"
            :disabled="fileDownloading"
            @click="downloadFile(editingFile, editingFile.split('/').pop() || 'file')"
          >{{ fileDownloading ? '下载中…' : '↓ 下载' }}</button>
          <button
            v-if="fileKind === 'text' && !fileTooLarge"
            class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="fileSaving || !fileDirty"
            @click="saveFile"
          >{{ fileSaving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
      <div v-if="fileLoading" class="text-center text-zinc-400 py-12 text-sm">加载中…</div>
      <div v-else-if="fileKind === 'image'" class="flex-1 min-h-[360px] flex items-center justify-center bg-zinc-100/60 dark:bg-zinc-950/60 rounded-xl p-4 overflow-auto">
        <img v-if="fileImageUrl" :src="fileImageUrl" :alt="editingFile" class="max-w-full max-h-full object-contain" />
        <span v-else class="text-zinc-400 text-sm">无法预览此图片</span>
      </div>
      <div v-else-if="fileKind === 'binary' || fileTooLarge" class="text-center text-zinc-400 py-12 text-sm">
        {{ fileTooLarge ? '文件过大（> 1 MB），无法在线编辑。' : '这是二进制文件，无法在线编辑。' }}
        <div class="mt-3">
          <button
            class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="fileDownloading"
            @click="downloadFile(editingFile, editingFile.split('/').pop() || 'file')"
          >↓ 下载文件</button>
        </div>
      </div>
      <textarea
        v-else
        v-model="fileContent"
        spellcheck="false"
        class="w-full flex-1 min-h-[360px] bg-zinc-950 text-zinc-100 rounded-xl p-3 font-mono text-[12px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      ></textarea>
    </div>

    <div v-else class="h-full flex flex-col min-h-0">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 flex-wrap min-w-0">
          <template v-for="(crumb, i) in fileBreadcrumbs" :key="crumb.path">
            <button
              class="hover:text-indigo-600 dark:hover:text-indigo-300"
              :class="i === fileBreadcrumbs.length - 1 ? 'font-semibold text-zinc-700 dark:text-zinc-200' : ''"
              @click="loadFiles(crumb.path)"
            >{{ crumb.name }}</button>
            <span v-if="i < fileBreadcrumbs.length - 1" class="text-zinc-300 dark:text-zinc-600">/</span>
          </template>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" @click="newFile">＋ 文件</button>
          <button class="text-xs px-2 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800/60 dark:text-indigo-300 dark:hover:bg-indigo-900/20" @click="newFolder">＋ 文件夹</button>
          <button
            class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
            :disabled="filesLoading"
            @click="loadFiles()"
          >{{ filesLoading ? '刷新中…' : '↻ 刷新' }}</button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="fileSelected.size" class="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/60">
          <span class="text-xs text-indigo-700 dark:text-indigo-300">已选中 {{ fileSelected.size }} 项</span>
          <div class="flex items-center gap-2">
            <button class="text-xs px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400" @click="fileSelected = new Set()">取消选择</button>
            <button
              class="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="fileBatchBusy"
              @click="batchDelete"
            >{{ fileBatchBusy ? '删除中…' : '批量删除' }}</button>
          </div>
        </div>
      </Transition>

      <div class="border border-zinc-200 rounded-xl overflow-auto dark:border-zinc-800 flex-1 min-h-[360px]">
        <table class="w-full text-xs">
          <thead class="bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400 sticky top-0 z-10">
            <tr>
              <th class="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  class="accent-indigo-500 align-middle"
                  :checked="fileAllSelected"
                  :disabled="!fileEntries.length"
                  title="全选 / 取消全选"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="text-left px-3 py-2 font-medium">名称</th>
              <th class="text-left px-3 py-2 font-medium hidden sm:table-cell">大小</th>
              <th class="text-left px-3 py-2 font-medium hidden md:table-cell">修改时间</th>
              <th class="text-right px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!fileEntries.length && !filesLoading">
              <td colspan="5" class="px-3 py-8 text-center text-zinc-400">此文件夹为空</td>
            </tr>
            <tr
              v-for="entry in fileEntries"
              :key="entry.path"
              class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 active:bg-zinc-100 dark:active:bg-zinc-700 cursor-default select-none"
              :class="fileSelected.has(entry.path) ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''"
              @click="openEntry(entry)"
              @dblclick="openEntry(entry)"
            >
              <td class="px-3 py-2.5 sm:py-2" @click.stop>
                <input
                  type="checkbox"
                  class="accent-indigo-500 align-middle"
                  :checked="fileSelected.has(entry.path)"
                  @click.stop
                  @dblclick.stop
                  @change.stop="toggleSelect(entry.path)"
                />
              </td>
              <td class="px-3 py-2.5 sm:py-2 cursor-pointer active:bg-zinc-100 dark:active:bg-zinc-700">
                <div class="flex items-center gap-2 text-left min-w-0">
                  <AppIcon :name="entry.is_dir ? 'folder' : entry.kind === 'image' ? 'image' : 'file'" class="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  <span class="text-zinc-700 dark:text-zinc-200 truncate" :title="entry.name">{{ entry.name }}</span>
                </div>
              </td>
              <td class="px-3 py-2 text-zinc-400 hidden sm:table-cell">{{ entry.is_dir ? '—' : fmtSize(entry.size) }}</td>
              <td class="px-3 py-2 text-zinc-400 hidden md:table-cell whitespace-nowrap">{{ fmtTime(entry.modified) }}</td>
              <td class="px-3 py-2.5 sm:py-2 text-right whitespace-nowrap" @click.stop>
                <button
                  v-if="!entry.is_dir"
                  class="text-[11px] px-2 py-1 rounded-lg text-zinc-500 hover:text-indigo-600 dark:text-zinc-400"
                  @dblclick.stop
                  @click.stop="downloadFile(entry.path, entry.name)"
                >下载</button>
                <button
                  class="text-[11px] px-2 py-1 rounded-lg text-zinc-500 hover:text-indigo-600 dark:text-zinc-400"
                  @dblclick.stop
                  @click.stop="renameEntry(entry)"
                >重命名</button>
                <button
                  class="text-[11px] px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  @dblclick.stop
                  @click.stop="deleteEntry(entry)"
                >删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[11px] text-zinc-400">浏览的是服务器 <code class="font-mono">server/data</code> 目录。点击文件名或图标即可打开文件夹/查看文件（文本可在线编辑上限 1MB，图片可预览，其它可下载）；勾选多项可批量删除。</p>
    </div>
  </div>
</template>
