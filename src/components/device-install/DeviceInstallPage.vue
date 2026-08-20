<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getDeviceHallCatalog, type DeviceHallProduct, type DeviceReleaseTarget } from '@/api/deviceHall'
import aiFreeIconUrl from '@/assets/device-install/ai-free.png'
import androidIconUrl from '@/assets/device-install/android.png'
import chromeIconUrl from '@/assets/device-install/chrome.png'
import linuxIconUrl from '@/assets/device-install/linux.png'
import windowsIconUrl from '@/assets/device-install/windows.png'
import logoUrl from '@/assets/logo/HeySure.png'
import AmbientBackground from '@/components/common/AmbientBackground.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{ loggedIn?: boolean; initialProductId?: string }>()
const emit = defineEmits<{ (event: 'back'): void; (event: 'login'): void }>()

const loading = ref(false)
const error = ref('')
const products = ref<DeviceHallProduct[]>([])
const selected = ref<DeviceHallProduct | null>(null)
const copied = ref(false)

const serverAddress = computed(() => window.location.origin)
const selectedTarget = computed(() => selected.value?.targets?.[0] || null)
const releaseNotes = computed(() => selectedTarget.value?.release_notes?.replace(/设备大厅/g, '设备安装') || '')

const PRODUCT_ICONS: Record<string, string> = {
  'windows-desktop': windowsIconUrl,
  'linux-agent': linuxIconUrl,
  'chrome-extension': chromeIconUrl,
  'android-device': androidIconUrl,
  'ai-free-app': aiFreeIconUrl,
}

const productIcon = (product: DeviceHallProduct) => PRODUCT_ICONS[product.id] || logoUrl

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
    selected.value = products.value.find(product => product.id === props.initialProductId)
      || products.value[0]
      || null
  } catch (cause: any) {
    error.value = cause?.message || '暂时无法获取设备发行信息'
  } finally {
    loading.value = false
  }
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

onMounted(() => { void load() })
</script>

<template>
  <div class="relative isolate flex h-app-viewport flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div class="app-background-glow pointer-events-none absolute inset-0"></div>
    <div class="pointer-events-none absolute inset-0 opacity-60">
      <div class="app-background-orb app-background-orb-left"></div>
      <div class="app-background-orb app-background-orb-right"></div>
    </div>
    <AmbientBackground />

    <header class="glass relative z-20 shrink-0 border-b border-zinc-200/60 dark:border-zinc-800/60">
      <div class="flex h-14 items-center justify-between gap-4 px-3 sm:px-5">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-white/70 hover:text-indigo-700 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-indigo-300"
          @click="emit('back')"
        >
          <span class="text-base leading-none" aria-hidden="true">←</span>
          返回控制台
        </button>
        <div class="flex items-center gap-2 pr-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          <img :src="logoUrl" alt="HeySure" class="h-7 w-7 object-contain" />
          <span>安装设备</span>
        </div>
      </div>
    </header>

    <main class="relative z-[1] flex min-h-0 flex-1 flex-col lg:flex-row">
      <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        正在同步服务器发行目录…
      </div>
      <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p class="text-sm text-rose-600 dark:text-rose-300">{{ error }}</p>
        <button class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500" @click="load">
          重新加载
        </button>
      </div>
      <template v-else>
        <aside class="shrink-0 border-b border-zinc-200/70 bg-white/55 dark:border-zinc-800 dark:bg-zinc-950/60 lg:h-full lg:w-72 lg:border-b-0 lg:border-r">
          <div class="hidden h-12 items-center justify-between border-b border-zinc-200/60 px-4 lg:flex dark:border-zinc-800">
            <span class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">设备端应用</span>
            <span class="text-[10px] text-zinc-400">{{ products.length }} 项</span>
          </div>
          <nav class="device-app-nav flex gap-2 overflow-x-auto p-2 lg:block lg:h-[calc(100%-3rem)] lg:space-y-1 lg:overflow-y-auto lg:p-2.5">
          <button
            v-for="product in products"
            :key="product.id"
            type="button"
            class="group flex min-w-[210px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors lg:min-w-0 lg:w-full"
            :class="selected?.id === product.id
              ? 'border-indigo-200 bg-indigo-50/90 text-indigo-950 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100'
              : 'border-transparent text-zinc-700 hover:border-zinc-200 hover:bg-white/80 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80'"
            @click="selected = product"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-950/90 ring-1 ring-zinc-200/70 dark:ring-zinc-700/80">
              <img :src="productIcon(product)" alt="" aria-hidden="true" class="h-full w-full object-contain" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-semibold">{{ product.name }}</span>
              <span class="mt-1 block truncate text-[10px] uppercase tracking-wide text-zinc-400">{{ product.device_type }}</span>
            </span>
            <AppIcon name="chevron" class="hidden h-3.5 w-3.5 text-zinc-300 lg:block dark:text-zinc-600" />
          </button>
          </nav>
        </aside>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <section v-if="selected" class="mx-auto w-full max-w-5xl px-4 py-5 sm:px-7 sm:py-7">
            <div class="flex flex-col justify-between gap-5 border-b border-zinc-200/70 pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-start">
              <div class="flex min-w-0 gap-3.5">
                <span class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-950/90 ring-1 ring-zinc-200/70 dark:ring-zinc-700/80">
                  <img :src="productIcon(selected)" alt="" aria-hidden="true" class="h-full w-full object-contain" />
                </span>
                <div class="min-w-0 pt-0.5">
                  <h1 class="text-xl font-bold tracking-tight">{{ selected.name }}</h1>
                  <p class="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ selected.summary }}</p>
                </div>
              </div>
              <button
                class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                :class="selectedTarget?.available ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500' : 'cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'"
                :disabled="!selectedTarget?.available"
                @click="beginDownload(selectedTarget)"
              >
                <AppIcon name="download" class="h-4 w-4" />
                {{ selectedTarget?.available ? '下载并安装' : '等待服务器发布' }}
              </button>
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              <span v-for="capability in selected.capabilities" :key="capability" class="rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">{{ capability }}</span>
            </div>

            <div v-if="selectedTarget" class="mt-5 grid gap-3 rounded-xl border border-zinc-200/80 bg-white/55 p-4 dark:border-zinc-800 dark:bg-zinc-900/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <div class="text-sm font-semibold">{{ selectedTarget.label }}</div>
                <div class="mt-1 text-xs text-zinc-500">稳定版 v{{ selectedTarget.version }}<span v-if="formatBytes(selectedTarget.size_bytes)"> · {{ formatBytes(selectedTarget.size_bytes) }}</span></div>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Stable channel</span>
              <p v-if="releaseNotes" class="border-t border-zinc-200/70 pt-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:col-span-2">{{ releaseNotes }}</p>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <article class="rounded-xl border border-zinc-200/80 bg-white/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div class="flex items-center gap-2">
                  <AppIcon name="check" class="h-4 w-4 text-indigo-500" />
                  <h2 class="text-sm font-semibold">安装与登录</h2>
                </div>
                <ol class="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <li v-for="(step, index) in selectedTarget?.install_steps" :key="step" class="flex gap-3">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{{ index + 1 }}</span>
                    <span class="pt-0.5 leading-5">{{ step }}</span>
                  </li>
                </ol>
              </article>
              <article class="rounded-xl border border-zinc-200/80 bg-white/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div class="flex items-center gap-2">
                  <AppIcon name="terminal" class="h-4 w-4 text-emerald-500" />
                  <h2 class="text-sm font-semibold">连接当前服务器</h2>
                </div>
                <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">首次登录时使用下面的服务器地址。连接成功后，设备会保留已有绑定并检查稳定版更新。</p>
                <div class="mt-3 flex items-center gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-black/25">
                  <code class="min-w-0 flex-1 overflow-x-auto text-xs text-emerald-700 dark:text-emerald-300">{{ serverAddress }}</code>
                  <button class="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200" @click="copyServerAddress">{{ copied ? '已复制' : '复制' }}</button>
                </div>
                <button v-if="!loggedIn" class="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200" @click="emit('login')">登录或注册网页账号 →</button>
                <p v-else class="mt-4 text-xs text-emerald-600 dark:text-emerald-400">当前网页账号已登录，可在设备端使用同一账号。</p>
              </article>
            </div>
          </section>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.device-app-nav {
  scrollbar-width: none;
}

.device-app-nav::-webkit-scrollbar {
  display: none;
}
</style>
