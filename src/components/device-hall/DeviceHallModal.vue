<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getDeviceHallCatalog, type DeviceHallProduct, type DeviceReleaseTarget } from '@/api/deviceHall'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{ show: boolean; loggedIn?: boolean; initialProductId?: string }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'login'): void }>()

const loading = ref(false)
const error = ref('')
const products = ref<DeviceHallProduct[]>([])
const selected = ref<DeviceHallProduct | null>(null)
const copied = ref(false)

const serverAddress = computed(() => window.location.origin)
const selectedTarget = computed(() => selected.value?.targets?.[0] || null)

const formatBytes = (value?: number | null) => {
  if (!value) return ''
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${Math.ceil(value / 1024)} KB`
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const catalog = await getDeviceHallCatalog()
    products.value = Array.isArray(catalog.products) ? catalog.products : []
    selected.value = products.value.find(product => product.id === props.initialProductId) || products.value[0] || null
  } catch (cause: any) {
    error.value = cause?.message || '暂时无法获取设备发行信息'
  } finally {
    loading.value = false
  }
}

const choose = (product: DeviceHallProduct) => {
  selected.value = product
}

const beginDownload = (target: DeviceReleaseTarget | null) => {
  if (!target?.available || !target.download_url) return
  window.location.assign(target.download_url)
}

const copyServerAddress = async () => {
  try {
    await navigator.clipboard.writeText(serverAddress.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    window.prompt('复制服务器地址', serverAddress.value)
  }
}

const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.show) emit('close')
}

watch(() => props.show, (show) => {
  if (show) {
    document.addEventListener('keydown', closeOnEscape)
    void load()
  } else {
    document.removeEventListener('keydown', closeOnEscape)
  }
}, { immediate: true })

onBeforeUnmount(() => document.removeEventListener('keydown', closeOnEscape))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6" @click.self="emit('close')">
        <section class="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-zinc-700/70 bg-zinc-950 text-zinc-100 shadow-2xl shadow-indigo-950/40">
          <header class="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-7">
            <div>
              <div class="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-400">Device Hall</div>
              <h2 class="text-2xl font-bold tracking-tight">设备大厅</h2>
              <p class="mt-1 text-sm text-zinc-400">下载官方设备端，登录同一 HeySure 账号后自动连接当前服务器。</p>
            </div>
            <button class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label="关闭设备大厅" @click="emit('close')">
              <AppIcon name="close" class="h-5 w-5" />
            </button>
          </header>

          <div v-if="loading" class="flex min-h-80 items-center justify-center text-sm text-zinc-400">正在同步服务器发行目录…</div>
          <div v-else-if="error" class="flex min-h-80 flex-col items-center justify-center gap-4 px-6 text-center">
            <p class="text-sm text-red-300">{{ error }}</p>
            <button class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500" @click="load">重新加载</button>
          </div>
          <div v-else class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_1fr] lg:overflow-hidden">
            <aside class="space-y-2 border-b border-zinc-800 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <button
                v-for="product in products"
                :key="product.id"
                class="w-full rounded-2xl border p-4 text-left transition"
                :class="selected?.id === product.id ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'"
                @click="choose(product)"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="font-semibold text-zinc-100">{{ product.name }}</span>
                  <span class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{{ product.device_type }}</span>
                </div>
                <p class="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">{{ product.summary }}</p>
              </button>
            </aside>

            <main v-if="selected" class="min-h-0 space-y-6 p-5 sm:p-7 lg:overflow-y-auto">
              <div>
                <h3 class="text-2xl font-bold">{{ selected.name }}</h3>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{{ selected.summary }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <span v-for="capability in selected.capabilities" :key="capability" class="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">{{ capability }}</span>
                </div>
              </div>

              <div v-if="selectedTarget" class="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <div class="font-semibold">{{ selectedTarget.label }}</div>
                    <div class="mt-1 text-xs text-zinc-500">稳定版 v{{ selectedTarget.version }}<span v-if="formatBytes(selectedTarget.size_bytes)"> · {{ formatBytes(selectedTarget.size_bytes) }}</span></div>
                  </div>
                  <button
                    class="rounded-xl px-5 py-2.5 text-sm font-semibold transition"
                    :class="selectedTarget.available ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'"
                    :disabled="!selectedTarget.available"
                    @click="beginDownload(selectedTarget)"
                  >
                    {{ selectedTarget.available ? '下载设备' : '等待服务器发布' }}
                  </button>
                </div>
                <p v-if="selectedTarget.release_notes" class="mt-4 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-400">{{ selectedTarget.release_notes }}</p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <div class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h4 class="font-semibold">安装与登录</h4>
                  <ol class="mt-3 space-y-3 text-sm text-zinc-400">
                    <li v-for="(step, index) in selectedTarget?.install_steps" :key="step" class="flex gap-3">
                      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-bold text-indigo-300">{{ index + 1 }}</span>
                      <span class="pt-0.5 leading-5">{{ step }}</span>
                    </li>
                  </ol>
                </div>
                <div class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h4 class="font-semibold">自动对接当前服务器</h4>
                  <p class="mt-3 text-sm leading-6 text-zinc-400">设备首次登录时使用下面的服务器地址。登录成功后，设备会从同一服务器检查稳定版更新，并保留已有设备绑定。</p>
                  <div class="mt-3 flex items-center gap-2 rounded-xl bg-black/30 p-3">
                    <code class="min-w-0 flex-1 overflow-x-auto text-xs text-emerald-300">{{ serverAddress }}</code>
                    <button class="shrink-0 text-xs font-semibold text-cyan-300 hover:text-cyan-200" @click="copyServerAddress">{{ copied ? '已复制' : '复制' }}</button>
                  </div>
                  <button v-if="!loggedIn" class="mt-4 text-sm font-semibold text-indigo-300 hover:text-indigo-200" @click="emit('login')">先登录或注册网页账号 →</button>
                  <p v-else class="mt-4 text-xs text-emerald-400">当前网页账号已登录，可在设备端使用同一账号。</p>
                </div>
              </div>
            </main>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
