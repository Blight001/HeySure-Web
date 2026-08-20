<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getAdminDeviceReleaseCatalog,
  uploadDeviceRelease,
  withdrawDeviceRelease,
} from '@/api/deviceHall'
import type {
  DeviceHallCatalog,
  DeviceHallProduct,
  DeviceReleaseTarget,
} from '@/api/deviceHall'
import { useMessage } from '@/composables/useMessage'

const { alert, confirm } = useMessage()
const catalog = ref<DeviceHallCatalog | null>(null)
const loading = ref(false)
const busy = ref(false)
const progress = ref(0)
const errorText = ref('')
const successText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const form = ref({
  productId: '',
  targetId: '',
  version: '',
  releaseNotes: '',
  mandatory: false,
})

interface ReleaseRow {
  product: DeviceHallProduct
  target: DeviceReleaseTarget
}

const rows = computed<ReleaseRow[]>(() =>
  (catalog.value?.products || []).flatMap((product) =>
    product.targets.map((target) => ({ product, target })),
  ),
)

const selectedProduct = computed(() =>
  catalog.value?.products.find((item) => item.id === form.value.productId) || null,
)

const selectedTarget = computed(() =>
  selectedProduct.value?.targets.find((item) => item.id === form.value.targetId) || null,
)

const formatBytes = (value?: number | null) => {
  if (!value) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`
}

const formatTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

const shortSha = (value?: string) => value ? `${value.slice(0, 12)}…` : '—'

const selectProduct = () => {
  form.value.targetId = selectedProduct.value?.targets[0]?.id || ''
  fillCurrentVersion()
}

const fillCurrentVersion = () => {
  form.value.version = selectedTarget.value?.version || ''
  form.value.releaseNotes = selectedTarget.value?.release_notes || ''
  form.value.mandatory = !!selectedTarget.value?.mandatory
}

const initialiseSelection = () => {
  if (!selectedProduct.value) form.value.productId = catalog.value?.products[0]?.id || ''
  if (!selectedTarget.value) form.value.targetId = selectedProduct.value?.targets[0]?.id || ''
  if (!form.value.version) fillCurrentVersion()
}

const loadCatalog = async () => {
  loading.value = true
  errorText.value = ''
  try {
    catalog.value = await getAdminDeviceReleaseCatalog()
    initialiseSelection()
  } catch (error) {
    errorText.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

const chooseFile = (event: Event) => {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] || null
}

const resetFile = () => {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const publish = async () => {
  errorText.value = ''
  successText.value = ''
  if (!form.value.productId || !form.value.targetId || !form.value.version.trim() || !selectedFile.value) {
    errorText.value = '请选择软件、目标和安装文件，并填写版本号。'
    return
  }
  busy.value = true
  progress.value = 0
  try {
    await uploadDeviceRelease({
      productId: form.value.productId,
      targetId: form.value.targetId,
      version: form.value.version.trim(),
      releaseNotes: form.value.releaseNotes.trim(),
      mandatory: form.value.mandatory,
      file: selectedFile.value,
    }, (value) => { progress.value = value })
    progress.value = 100
    successText.value = `${selectedFile.value.name} 已发布，在线设备将收到更新提示。`
    resetFile()
    await loadCatalog()
  } catch (error) {
    errorText.value = (error as Error).message
  } finally {
    busy.value = false
  }
}

const withdraw = async (row: ReleaseRow) => {
  const accepted = await confirm({
    message: `确定撤回 ${row.product.name} ${row.target.version}？撤回后设备将无法下载该版本。`,
    type: 'warning',
  })
  if (!accepted) return
  busy.value = true
  errorText.value = ''
  try {
    await withdrawDeviceRelease(row.product.id, row.target.id)
    successText.value = `${row.product.name} 的安装包已撤回。`
    await loadCatalog()
  } catch (error) {
    errorText.value = (error as Error).message
    await alert({ message: errorText.value, type: 'error' })
  } finally {
    busy.value = false
  }
}

defineExpose({ onSwitch: loadCatalog })
onMounted(loadCatalog)
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-100">设备软件版本</h3>
        <p class="mt-1 text-xs text-zinc-400">集中发布安装包；设备发现新版本后询问用户是否打开服务器下载链接。</p>
      </div>
      <button class="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-50" :disabled="loading" @click="loadCatalog">
        {{ loading ? '刷新中…' : '↻ 刷新' }}
      </button>
    </div>

    <div v-if="errorText" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">{{ errorText }}</div>
    <div v-if="successText" class="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{{ successText }}</div>

    <section class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div v-if="!rows.length && !loading" class="p-4 text-xs text-zinc-400">暂无设备软件目标。</div>
      <div v-for="row in rows" :key="`${row.product.id}:${row.target.id}`" class="border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800">
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ row.product.name }}</span>
              <span class="rounded-full px-2 py-0.5 text-[10px]" :class="row.target.available ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'">
                {{ row.target.available ? '已有安装包' : '未发布' }}
              </span>
            </div>
            <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ row.target.label }} · v{{ row.target.version }}</div>
            <div class="mt-2 grid gap-x-5 gap-y-1 text-[11px] text-zinc-400 sm:grid-cols-2">
              <span>文件：{{ row.target.filename || '—' }}</span>
              <span>大小：{{ formatBytes(row.target.size_bytes) }}</span>
              <span :title="row.target.sha256 || ''">SHA-256：{{ shortSha(row.target.sha256) }}</span>
              <span>发布时间：{{ formatTime(row.target.released_at || row.target.published_at) }}</span>
            </div>
          </div>
          <button v-if="row.target.available" class="shrink-0 text-xs text-red-500 hover:text-red-600 disabled:opacity-50" :disabled="busy" @click="withdraw(row)">撤回安装包</button>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">上传并发布</h4>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-zinc-500">软件
          <select v-model="form.productId" class="mt-1 w-full acrylic-input rounded-lg px-3 py-2 text-sm dark:bg-zinc-800" @change="selectProduct">
            <option v-for="product in catalog?.products || []" :key="product.id" :value="product.id">{{ product.name }}</option>
          </select>
        </label>
        <label class="text-xs text-zinc-500">目标平台
          <select v-model="form.targetId" class="mt-1 w-full acrylic-input rounded-lg px-3 py-2 text-sm dark:bg-zinc-800" @change="fillCurrentVersion">
            <option v-for="target in selectedProduct?.targets || []" :key="target.id" :value="target.id">{{ target.label }}</option>
          </select>
        </label>
        <label class="text-xs text-zinc-500">版本号
          <input v-model="form.version" maxlength="64" placeholder="例如 1.2.0" class="mt-1 w-full acrylic-input rounded-lg px-3 py-2 text-sm dark:bg-zinc-800" />
        </label>
        <label class="text-xs text-zinc-500">安装文件
          <input ref="fileInput" type="file" class="mt-1 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-300" @change="chooseFile" />
        </label>
      </div>
      <label class="mt-3 block text-xs text-zinc-500">更新说明
        <textarea v-model="form.releaseNotes" rows="4" maxlength="10000" class="mt-1 w-full acrylic-input rounded-lg px-3 py-2 text-sm dark:bg-zinc-800" placeholder="向用户说明本次变化和注意事项"></textarea>
      </label>
      <label class="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <input v-model="form.mandatory" type="checkbox" class="accent-indigo-600" /> 标记为重要更新（仍由用户决定是否下载）
      </label>

      <div v-if="busy" class="mt-3">
        <div class="mb-1 flex justify-between text-[11px] text-zinc-400"><span>上传并发布中…</span><span>{{ progress }}%</span></div>
        <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div class="h-full bg-indigo-500 transition-all" :style="{ width: `${progress}%` }"></div></div>
      </div>
      <div class="mt-4 flex justify-end">
        <button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="busy || loading" @click="publish">
          {{ busy ? '发布中…' : '上传并发布' }}
        </button>
      </div>
    </section>
  </div>
</template>
