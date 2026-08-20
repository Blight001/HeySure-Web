<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import logoUrl from '@/assets/logo/HeySure.png'
import AppIcon from '@/components/common/AppIcon.vue'
import AmbientBackground from '@/components/common/AmbientBackground.vue'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { User } from '@/types'

const GlobalNotificationLayer = defineAsyncComponent(() => import('@/components/common/GlobalNotificationLayer.vue'))

defineProps<{
  agentCount: number
  globalGeneration: number
  isAdminUser: boolean
  currentUser?: User | null
  userMenuOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'background-click'): void
  (e: 'open-admin'): void
  (e: 'open-maintenance'): void
  (e: 'open-settings'): void
  (e: 'open-device-hall'): void
  (e: 'toggle-user-menu'): void
  (e: 'update-profile'): void
  (e: 'logout'): void
  (e: 'login'): void
}>()
</script>

<template>
  <div
    class="relative isolate h-app-viewport flex flex-col bg-zinc-50/60 text-zinc-900 overflow-hidden overflow-x-hidden font-sans dark:bg-zinc-950/60 dark:text-zinc-100 bg-gradient-to-br from-zinc-50 via-zinc-100 to-indigo-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/20 animate-gradient"
    @click="emit('background-click')"
  >
    <div class="app-background-glow pointer-events-none absolute inset-0"></div>
    <div class="pointer-events-none absolute inset-0 opacity-60">
      <div class="app-background-orb app-background-orb-left"></div>
      <div class="app-background-orb app-background-orb-right"></div>
    </div>
    <AmbientBackground />

    <div class="relative z-[1] flex h-full flex-col">
      <header class="glass border-b border-zinc-200/50 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 flex justify-between items-center shadow-sm z-10 h-14 sm:h-16 shrink-0 dark:border-zinc-800/50 backdrop-blur-md">
        <div class="flex items-center gap-2 md:gap-4 overflow-hidden">
          <img :src="logoUrl" alt="HeySure Logo" class="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 object-contain hover:scale-110 active:scale-95 transition-transform duration-300 shrink-0" />
          <div class="overflow-hidden">
            <h1 class="text-sm sm:text-base md:text-lg font-bold text-zinc-900 tracking-tight dark:text-zinc-100 truncate">HeySure<span class="hidden sm:inline">-数字社会控制台</span> <span class="text-zinc-400 font-normal ml-2 dark:text-zinc-500 hidden lg:inline">HeySure-Digital Society Console</span></h1>
            <p class="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 truncate">进化引擎已启动</p>
          </div>
        </div>
        <div class="flex gap-1.5 sm:gap-2 md:gap-4 text-sm items-center relative shrink-0">
          <div class="hidden sm:flex flex-col items-end">
            <span class="text-xs text-zinc-400 uppercase font-semibold">AI成员</span>
            <span class="text-lg font-bold text-indigo-600 leading-none">{{ agentCount }}</span>
          </div>
          <div class="hidden sm:block w-px h-8 bg-zinc-200 dark:bg-zinc-700/70"></div>
          <div class="hidden sm:flex flex-col items-end">
            <span class="text-xs text-zinc-400 uppercase font-semibold">文明代数</span>
            <span class="text-lg font-bold text-emerald-600 leading-none">Gen {{ globalGeneration }}</span>
          </div>
          <button
            class="ml-1 hidden h-8 items-center gap-1.5 rounded-full border border-cyan-200/70 bg-white/60 px-2.5 text-cyan-700 shadow-sm transition-colors hover:bg-cyan-50 dark:border-cyan-700/60 dark:bg-zinc-800/60 dark:text-cyan-300 dark:hover:bg-cyan-950/40 md:flex md:h-9 md:px-3"
            title="下载并连接新设备"
            @click.stop="emit('open-device-hall')"
          >
            <AppIcon name="download" class="h-4 w-4" /><span class="hidden text-xs font-semibold xl:inline">设备大厅</span>
          </button>
          <button
            class="ml-1 sm:ml-2 flex h-8 items-center gap-1.5 rounded-full border border-indigo-200/70 bg-white/60 px-2.5 text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50 dark:border-indigo-700/60 dark:bg-zinc-800/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40 md:h-9 md:px-3"
            title="项目维护中心"
            @click.stop="emit('open-maintenance')"
          >
            <span class="font-mono text-sm">⌘</span><span class="hidden text-xs font-semibold lg:inline">维护中心</span>
          </button>
          <button
            v-if="isAdminUser"
            class="ml-1 sm:ml-2 w-8 h-8 md:w-9 md:h-9 rounded-full border border-amber-200/70 bg-white/60 backdrop-blur-sm text-amber-600 active:bg-amber-100 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/70 transition-colors dark:bg-zinc-800/60 dark:border-amber-700/60 dark:text-amber-300 dark:hover:text-amber-200 shadow-sm hover:shadow-md flex items-center justify-center"
            title="管理员控制台"
            @click.stop="emit('open-admin')"
          >
            <AppIcon name="shield" class="w-4 h-4 md:w-[18px] md:h-[18px]" />
          </button>
          <GlobalNotificationLayer />
          <button
            class="ml-1 sm:ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors active:bg-zinc-100 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800 dark:hover:text-indigo-300 md:h-9 md:w-9"
            title="系统设置"
            @click.stop="emit('open-settings')"
          >
            <AppIcon name="gear" class="w-4 h-4 md:w-[18px] md:h-[18px]" />
          </button>

          <div class="ml-1.5 sm:ml-2 md:ml-4 flex items-center gap-2 sm:gap-3 pl-2 md:pl-4 border-l border-zinc-200 dark:border-zinc-700 relative">
            <template v-if="currentUser">
              <button class="flex items-center gap-2 hover:bg-zinc-50 active:bg-zinc-100 p-1 rounded-lg transition-colors dark:hover:bg-zinc-800" @click.stop="emit('toggle-user-menu')">
                <img
                  :src="resolveAvatarUrl(currentUser.avatar) || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.name"
                  class="w-7 h-7 md:w-8 md:h-8 rounded-full border border-zinc-200 bg-zinc-50/60 object-cover"
                />
                <div class="hidden md:flex flex-col items-start text-left">
                  <span class="text-sm font-bold text-zinc-700 dark:text-zinc-200 leading-none mb-1">{{ currentUser.name }}</span>
                  <span class="text-[10px] text-zinc-400 leading-none">ID: {{ currentUser.account }}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-zinc-400 ml-1 transition-transform duration-200 hidden md:block" :class="{ 'rotate-180': userMenuOpen }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <Transition name="fade">
                <div v-if="userMenuOpen" class="absolute right-0 top-12 w-48 acrylic-modal rounded-xl shadow-lg py-1 z-50" @click.stop>
                  <button @click="emit('update-profile')" class="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-white/60 flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-zinc-800/70">
                    <AppIcon name="pen" class="w-4 h-4" /> 修改资料
                  </button>
                  <div class="h-px bg-zinc-100/60 my-1 dark:bg-zinc-800/60"></div>
                  <button @click="emit('logout')" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 dark:text-red-400 dark:hover:bg-red-900/20">
                    <AppIcon name="exit" class="w-4 h-4" /> 退出登录
                  </button>
                </div>
              </Transition>
            </template>
            <button v-else @click="emit('login')" class="text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors dark:text-indigo-400 dark:hover:bg-indigo-900/20">
              登录 / 注册
            </button>
          </div>
        </div>
      </header>

      <slot />
    </div>
  </div>
</template>
