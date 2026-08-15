<script setup lang="ts">
import type { RcBrowserState, RcQualityPreset, RcStatus } from '@/composables/useRemoteControl'

defineProps<{
  isMaximized: boolean
  isDesktopLike: boolean
  isBrowser: boolean
  modeLabel: string
  deviceName?: string
  deviceId: string
  status: RcStatus
  statusText: string
  qualityPreset: RcQualityPreset
  browserState: RcBrowserState | null
  addressInput: string
  typing: string
  mode: string
}>()

const emit = defineEmits<{
  (e: 'update:qualityPreset', value: RcQualityPreset): void
  (e: 'update:addressInput', value: string): void
  (e: 'update:typing', value: string): void
  (e: 'toggle-maximize'): void
  (e: 'close'): void
  (e: 'switch-tab', id: number): void
  (e: 'close-tab', id: number): void
  (e: 'new-tab'): void
  (e: 'nav-back'): void
  (e: 'nav-forward'): void
  (e: 'nav-reload'): void
  (e: 'submit-address'): void
  (e: 'address-focus', focused: boolean): void
  (e: 'favicon-error', event: Event): void
  (e: 'send-text'): void
  (e: 'send-key', key: 'back' | 'home' | 'recents'): void
}>()
</script>

<template>
  <div v-if="!isMaximized" class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
    <div class="min-w-0">
      <div class="text-sm font-semibold text-zinc-100 truncate">远程控制{{ modeLabel }} · {{ deviceName || deviceId }}</div>
      <div class="text-xs mt-0.5 flex items-center gap-1.5" :class="status === 'streaming' ? 'text-emerald-400' : status === 'error' ? 'text-rose-400' : 'text-amber-400'">
        <span class="inline-block w-1.5 h-1.5 rounded-full" :class="status === 'streaming' ? 'bg-emerald-400 animate-pulse' : status === 'error' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse'"></span>
        {{ statusText }}
      </div>
    </div>
    <div class="flex items-center gap-1 shrink-0">
      <label v-if="mode === 'desktop'" class="mr-1 flex items-center gap-1.5 text-xs text-zinc-400">
        <span class="hidden sm:inline">画面</span>
        <select :value="qualityPreset" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500" title="流畅度与画质；切换后立即生效" @change="emit('update:qualityPreset', ($event.target as HTMLSelectElement).value as RcQualityPreset)">
          <option value="smooth">流畅优先</option>
          <option value="balanced">平衡</option>
          <option value="clear">清晰优先</option>
        </select>
      </label>
      <button class="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" :title="isMaximized ? '退出全屏' : '全屏控制'" @click="emit('toggle-maximize')">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
      <button class="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-lg leading-none" title="关闭" @click="emit('close')">✕</button>
    </div>
  </div>

  <div v-if="isBrowser && !isMaximized" class="border-b border-zinc-800 bg-zinc-950/60">
    <div class="flex items-end gap-1 px-2 pt-2 overflow-x-auto rc-tabstrip">
      <button
        v-for="tab in browserState?.tabs || []"
        :key="tab.id"
        class="group flex items-center gap-1.5 min-w-[120px] max-w-[200px] px-2 py-1.5 rounded-t-lg border border-b-0 text-xs transition-colors"
        :class="tab.active ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-900/60 border-transparent text-zinc-400 hover:bg-zinc-800/60'"
        :title="tab.title"
        @click="emit('switch-tab', tab.id)"
      >
        <img v-if="tab.favIconUrl" :src="tab.favIconUrl" class="w-3.5 h-3.5 shrink-0 rounded-sm" alt="" @error="emit('favicon-error', $event)" />
        <span class="flex-1 truncate text-left">{{ tab.title || '新标签页' }}</span>
        <span class="grid h-4 w-4 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-600 hover:text-white" title="关闭标签页" @click.stop="emit('close-tab', tab.id)">✕</span>
      </button>
      <button class="mb-0.5 h-7 w-7 shrink-0 rounded text-base leading-none text-zinc-400 hover:bg-zinc-800 hover:text-white" title="新建标签页" @click="emit('new-tab')">＋</button>
    </div>
    <div class="flex items-center gap-1.5 px-2 py-1.5">
      <button class="rc-toolbtn" title="后退" :disabled="status !== 'streaming'" @click="emit('nav-back')">‹</button>
      <button class="rc-toolbtn" title="前进" :disabled="status !== 'streaming'" @click="emit('nav-forward')">›</button>
      <button class="rc-toolbtn" title="刷新" :disabled="status !== 'streaming'" @click="emit('nav-reload')">⟳</button>
      <input
        :value="addressInput"
        type="text"
        placeholder="搜索或输入网址"
        class="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
        :disabled="status !== 'streaming'"
        @focus="emit('address-focus', true)"
        @blur="emit('address-focus', false)"
        @input="emit('update:addressInput', ($event.target as HTMLInputElement).value)"
        @keyup.enter="($event.target as HTMLInputElement).blur(); emit('submit-address')"
        @keydown.stop
      />
    </div>
  </div>

  <slot />

  <div v-if="!isDesktopLike && !isMaximized" class="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
    <input :value="typing" type="text" placeholder="向聚焦输入框发送文本…" class="flex-1 min-w-0 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500" :disabled="status !== 'streaming'" @input="emit('update:typing', ($event.target as HTMLInputElement).value)" @keyup.enter="emit('send-text')" @keydown.stop />
    <button class="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 transition-colors" :disabled="status !== 'streaming' || !typing" @click="emit('send-text')">发送</button>
  </div>
  <div v-if="!isDesktopLike && !isMaximized" class="grid grid-cols-3 gap-2 px-3 py-3 border-t border-zinc-800">
    <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="emit('send-key', 'back')">返回</button>
    <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="emit('send-key', 'home')">主页</button>
    <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="emit('send-key', 'recents')">最近</button>
  </div>
  <div v-else-if="!isMaximized" class="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
    左键点击/拖拽 · 右键、中键 · 滚轮滚动 · 点击画面后直接用键盘输入（支持 Ctrl/Alt 组合键与中文输入法）
  </div>
</template>

<style scoped src="./remoteControl.css"></style>
