<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import type { User } from '@/types'
import heySureLogo from '@/assets/logo/HeySure.png'
import { getInitialUiPreferences } from '@/utils/uiPreferences'

const GodDashboard = defineAsyncComponent(() => import('@/components/dashboard/GodDashboard.vue'))
const HomePage = defineAsyncComponent(() => import('@/components/home/HomePage.vue'))
const LoginModal = defineAsyncComponent(() => import('@/components/common/LoginModal.vue'))
const ProfileModal = defineAsyncComponent(() => import('@/components/common/ProfileModal.vue'))
const MessageDialog = defineAsyncComponent(() => import('@/components/common/MessageDialog.vue'))
const HostRescueModal = defineAsyncComponent(() => import('@/components/home/HostRescueModal.vue'))
const DeviceInstallPage = defineAsyncComponent(() => import('@/components/device-install/DeviceInstallPage.vue'))

const { user, handleLoginSuccess, updateUser, logout } = useAuth()
const initialUiPreferences = getInitialUiPreferences()
const isDarkStartup = initialUiPreferences.themeMode === 'dark'

const showLogin = ref(false)
const showHostRescue = ref(false)
const adminLoginRequested = ref(false)
const openAdminOnDashboard = ref(false)
const showProfile = ref(false)
const showDeviceInstall = ref(false)
const deviceInstallProductId = ref('')
const deviceInstallNavigationPushed = ref(false)
const showSplash = ref(true)
const revealContent = ref(false)
// 登录成功 / 会话恢复后需等待控制台数据就绪，避免直接显示空白界面
const dashboardLoading = ref(false)
const startupProgress = ref(42)
const startupDetail = ref('正在恢复登录状态与用户偏好')
const startupElapsed = ref('0.0')

const showStartupOverlay = computed(() => showSplash.value || dashboardLoading.value)

// 内容揭示分三段：未揭示（模糊下移隐藏）→ 揭示过渡中 → 完成。
// 完成后必须移除 transform/filter/transition 类：blur(0)/translate(0) 也会让
// 整个应用长期驻留在独立合成层，移动端白白占用 GPU 内存与合成开销。
const revealClass = computed(() => {
  if (!revealContent.value)
    return 'pointer-events-none select-none opacity-0 translate-y-2 blur-[2px] transition-[opacity,transform,filter] duration-700 ease-out'
  if (showSplash.value)
    return 'opacity-100 translate-y-0 blur-0 transition-[opacity,transform,filter] duration-700 ease-out'
  return ''
})
const startupHint = computed(() => startupDetail.value)

const updateStartup = (progress: number, detail: string) => {
  startupProgress.value = Math.max(startupProgress.value, progress)
  startupDetail.value = detail
  window.__HEYSURE_STARTUP__?.update(startupProgress.value, detail)
}

let revealTimer: number | undefined
let preloadRemovalTimer: number | undefined
let startupFallbackTimer: number | undefined
let dashboardLoadingFallbackTimer: number | undefined
let removeLoadListener: (() => void) | undefined
let startupElapsedTimer: number | undefined

const startDashboardLoading = () => {
  dashboardLoading.value = true
  updateStartup(68, '正在加载控制台代码与成员数据')
  if (dashboardLoadingFallbackTimer !== undefined) {
    window.clearTimeout(dashboardLoadingFallbackTimer)
  }
  // 兜底：即使控制台未上报就绪，也在超时后撤下遮罩，避免永久卡住
  dashboardLoadingFallbackTimer = window.setTimeout(() => {
    dashboardLoading.value = false
  }, 8000)
}

const onDashboardReady = () => {
  updateStartup(100, '控制台数据加载完成，即将进入')
  dashboardLoading.value = false
  if (dashboardLoadingFallbackTimer !== undefined) {
    window.clearTimeout(dashboardLoadingFallbackTimer)
    dashboardLoadingFallbackTimer = undefined
  }
}

const hideStaticPreload = () => {
  const preload = document.getElementById('startup-preload')
  if (!preload) return
  window.__HEYSURE_STARTUP__?.stop()
  preload.classList.add('is-hidden')
  preloadRemovalTimer = window.setTimeout(() => {
    preload.remove()
  }, 420)
}

const revealApp = () => {
  if (revealContent.value) return
  revealContent.value = true
  revealTimer = window.setTimeout(() => {
    showSplash.value = false
  }, 650)
}

const onLoginSuccess = (userData: User, token: string) => {
  openAdminOnDashboard.value = adminLoginRequested.value
  handleLoginSuccess(userData, token)
  adminLoginRequested.value = false
  showLogin.value = false
}

const openLogin = (adminOnly = false) => {
  adminLoginRequested.value = adminOnly
  showLogin.value = true
}

const closeLogin = () => {
  adminLoginRequested.value = false
  showLogin.value = false
}

const handleLogout = () => {
  openAdminOnDashboard.value = false
  void logout()
}

const syncDeviceInstallFromLocation = () => {
  const query = new URLSearchParams(window.location.search)
  const wasOpen = showDeviceInstall.value
  showDeviceInstall.value = query.get('install-device') === '1' || query.get('device-hall') === '1'
  deviceInstallProductId.value = query.get('product') || ''
  if (wasOpen && !showDeviceInstall.value && user.value) startDashboardLoading()
}

const openDeviceInstall = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('device-hall')
  url.searchParams.set('install-device', '1')
  window.history.pushState({ heysureView: 'install-device' }, '', `${url.pathname}${url.search}${url.hash}`)
  deviceInstallNavigationPushed.value = true
  syncDeviceInstallFromLocation()
}

const closeDeviceInstall = () => {
  if (deviceInstallNavigationPushed.value) {
    window.history.back()
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('install-device')
  url.searchParams.delete('device-hall')
  url.searchParams.delete('product')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  syncDeviceInstallFromLocation()
}

const handleDeviceInstallPopState = () => {
  deviceInstallNavigationPushed.value = false
  syncDeviceInstallFromLocation()
}

const loginFromDeviceInstall = () => {
  closeDeviceInstall()
  openLogin()
}

// 登录态从无到有时拉起加载遮罩，登出时立即撤下
watch(
  () => !!user.value,
  (loggedIn) => {
    if (loggedIn && !showDeviceInstall.value) startDashboardLoading()
    else onDashboardReady()
  },
)

const onUpdateSuccess = (userData: User) => {
  updateUser(userData)
  showProfile.value = false
}

onMounted(() => {
  const startupQuery = new URLSearchParams(window.location.search)
  if (startupQuery.get('device-hall') === '1') {
    const url = new URL(window.location.href)
    url.searchParams.delete('device-hall')
    url.searchParams.set('install-device', '1')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  syncDeviceInstallFromLocation()
  window.addEventListener('popstate', handleDeviceInstallPopState)
  const startedAt = window.__HEYSURE_STARTUP__?.startedAt ?? performance.now()
  startupElapsedTimer = window.setInterval(() => {
    startupElapsed.value = ((performance.now() - startedAt) / 1000).toFixed(1)
  }, 100)
  updateStartup(52, user.value ? '登录状态已恢复，正在准备控制台' : '登录状态检查完成，正在准备首页')
  if (user.value && !showDeviceInstall.value) startDashboardLoading()

  startupFallbackTimer = window.setTimeout(() => {
    hideStaticPreload()
    revealApp()
  }, 2500)

  requestAnimationFrame(() => {
    hideStaticPreload()
  })

  if (document.readyState === 'complete') {
    updateStartup(user.value ? 76 : 100, user.value ? '静态资源已就绪，正在请求项目、成员、设备与知识数据' : '首页资源加载完成，即将进入')
    requestAnimationFrame(() => {
      revealApp()
    })
    return
  }

  const handleLoad = () => {
    updateStartup(user.value ? 76 : 100, user.value ? '静态资源已就绪，正在请求项目、成员、设备与知识数据' : '首页资源加载完成，即将进入')
    revealApp()
  }

  window.addEventListener('load', handleLoad, { once: true })
  removeLoadListener = () => {
    window.removeEventListener('load', handleLoad)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleDeviceInstallPopState)
  removeLoadListener?.()
  if (revealTimer !== undefined) {
    window.clearTimeout(revealTimer)
  }
  if (preloadRemovalTimer !== undefined) {
    window.clearTimeout(preloadRemovalTimer)
  }
  if (startupFallbackTimer !== undefined) {
    window.clearTimeout(startupFallbackTimer)
  }
  if (dashboardLoadingFallbackTimer !== undefined) {
    window.clearTimeout(dashboardLoadingFallbackTimer)
  }
  if (startupElapsedTimer !== undefined) {
    window.clearInterval(startupElapsedTimer)
  }
})
</script>

<template>
  <div class="relative min-h-app-viewport overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-indigo-50 text-zinc-900 antialiased dark:from-[#07080f] dark:via-[#0a0c1a] dark:to-[#0c0f22] dark:text-zinc-100">
    <div class="app-background-glow pointer-events-none absolute inset-0"></div>
    <div class="pointer-events-none absolute inset-0 opacity-60">
      <div class="app-background-orb app-background-orb-left"></div>
      <div class="app-background-orb app-background-orb-right"></div>
    </div>

    <div
      class="relative z-[1] min-h-app-viewport"
      :class="revealClass"
    >
      <DeviceInstallPage
        v-if="showDeviceInstall"
        :logged-in="!!user"
        :initial-product-id="deviceInstallProductId"
        @back="closeDeviceInstall"
        @login="loginFromDeviceInstall"
      />
      <template v-else>
        <HomePage
          v-if="!user"
          @login="openLogin()"
          @register="openLogin()"
          @admin="showHostRescue = true"
        />
        <GodDashboard
          v-else
          :current-user="user"
          :open-admin-on-mount="openAdminOnDashboard"
          @login="openLogin()"
          @logout="handleLogout"
          @update-profile="showProfile = true"
          @refresh-user="updateUser"
          @ready="onDashboardReady"
          @install-device="openDeviceInstall"
        />
      </template>
    </div>

    <LoginModal
      :show="showLogin"
      :admin-only="adminLoginRequested"
      @close="closeLogin"
      @login-success="onLoginSuccess"
    />

    <ProfileModal
      v-if="user"
      :show="showProfile"
      :user="user"
      @close="showProfile = false"
      @update-success="onUpdateSuccess"
      @password-changed="handleLogout"
    />

    <HostRescueModal
      :show="showHostRescue"
      @close="showHostRescue = false"
      @open-admin="openLogin(true)"
    />

    <MessageDialog />

    <Transition name="startup-splash">
      <div
        v-if="showStartupOverlay"
        class="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        :class="isDarkStartup
          ? 'space-backdrop text-zinc-100'
          : 'bg-gradient-to-br from-zinc-50 via-white to-indigo-50 text-zinc-900'"
      >
        <div class="startup-orb startup-orb-left pointer-events-none"></div>
        <div class="startup-orb startup-orb-right pointer-events-none"></div>
        <div class="relative w-full max-w-lg px-6">
          <div
            class="rounded-3xl px-8 py-10 text-center shadow-2xl backdrop-blur-xl"
            :class="isDarkStartup
              ? 'border border-zinc-800/70 bg-zinc-900/70 shadow-zinc-950/70'
              : 'border border-white/70 bg-white/80 shadow-indigo-100/70'"
          >
            <div
              class="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl shadow-lg"
              :class="isDarkStartup
                ? 'border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 to-indigo-700/20 shadow-indigo-950/40'
                : 'border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-indigo-100 shadow-indigo-200/70'"
            >
              <img
                :src="heySureLogo"
                alt="HeySure logo"
                class="h-12 w-12 object-contain"
              />
            </div>

            <div class="mt-6 space-y-3">
              <div
                class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wide"
                :class="isDarkStartup
                  ? 'border border-zinc-700/60 bg-zinc-950/60 text-zinc-400'
                  : 'border border-zinc-200/80 bg-white/90 text-zinc-500'"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                AI Agent · 数字社会操作系统
              </div>
              <h1 class="text-3xl font-bold tracking-tight sm:text-4xl" :class="isDarkStartup ? 'text-zinc-50' : 'text-zinc-900'">
                HeySure
              </h1>
              <p class="text-sm leading-relaxed sm:text-base" :class="isDarkStartup ? 'text-zinc-400' : 'text-zinc-500'">
                让 AI 成为可治理、可协作的数字成员
              </p>
            </div>

            <div class="mt-8">
              <div
                class="h-1 overflow-hidden rounded-full"
                :class="isDarkStartup ? 'bg-zinc-800/80' : 'bg-zinc-200/80'"
                role="progressbar"
                aria-label="网页加载进度"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="startupProgress"
              >
                <div
                  class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.45)] transition-[width] duration-500 ease-out"
                  :style="{ width: `${startupProgress}%` }"
                ></div>
              </div>
              <div class="mt-3 flex items-start justify-between gap-4 text-left text-xs" :class="isDarkStartup ? 'text-zinc-400' : 'text-zinc-500'">
                <span>{{ startupHint }}</span>
                <span class="shrink-0 tabular-nums">{{ startupProgress }}% · {{ startupElapsed }}s</span>
              </div>
              <p class="mt-2 text-left text-[11px]" :class="isDarkStartup ? 'text-zinc-600' : 'text-zinc-400'">
                当前说明停留时间较长，通常就是对应加载阶段较慢
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
