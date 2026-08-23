<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl, type RcMode, type RcQualityPreset } from '@/composables/useRemoteControl'
import RemoteControlChrome from './RemoteControlChrome.vue'
import RemoteControlSurface from './RemoteControlSurface.vue'
import RemoteControllerPanel from './RemoteControllerPanel.vue'
import { dispatchRemoteControllerAction } from '@/utils/remoteControllerAction'
import type { RemoteControllerCommand } from '@/types/remoteController'
import {
  fitPanelToOrientation,
  isDesktopLikeMode,
  isRemotePortrait,
  panelConstraintsStyle,
  remoteAspectStyle,
  remoteModeLabel,
  remoteStatusText,
} from './remoteControlPanel'

const props = withDefaults(defineProps<{
  deviceId: string
  deviceName?: string
  mode?: RcMode
  capabilities?: string[]
}>(), { mode: 'android' })
const emit = defineEmits<{ (e: 'close'): void }>()
const RemoteTerminalPane = defineAsyncComponent(() => import('./RemoteTerminalPane.vue'))

const isDesktopLike = computed(() => isDesktopLikeMode(props.mode))
const modeLabel = computed(() => remoteModeLabel(props.mode))
const panelRef = ref<HTMLElement | null>(null)
const surfaceRef = ref<{ resetZoom: () => void } | null>(null)
const panelConstraints = computed(() => panelConstraintsStyle(isDesktopLike.value))
const activeSurface = ref<'screen' | 'terminal'>('screen')
const normalizedCapabilities = computed(() => new Set((props.capabilities || []).map(item => item.toLowerCase().replace('.', '_'))))
const terminalAvailable = computed(() => props.mode === 'desktop' && (
  normalizedCapabilities.value.size === 0 || normalizedCapabilities.value.has('remote_terminal')
))

const {
  status,
  errorMessage,
  deviceWidth,
  deviceHeight,
  remoteStream,
  controlReady,
  connectionState,
  browserState,
  start,
  stop,
  sendInput,
  sendBrowserCommand,
  setQualityPreset,
} = useRemoteControl()

const QUALITY_STORAGE_KEY = 'heysure.remoteControl.desktopQuality'
const savedQuality = window.localStorage.getItem(QUALITY_STORAGE_KEY)
const qualityPreset = ref<RcQualityPreset>(
  savedQuality === 'smooth' || savedQuality === 'clear' ? savedQuality : 'balanced',
)
watch(qualityPreset, (preset) => {
  window.localStorage.setItem(QUALITY_STORAGE_KEY, preset)
  setQualityPreset(preset)
})

const isBrowser = computed(() => props.mode === 'browser')
const addressInput = ref('')
const addressFocused = ref(false)
const typing = ref('')
const isMaximized = ref(false)
const videoNaturalWidth = ref(0)
const videoNaturalHeight = ref(0)
const activeTab = computed(() => browserState.value?.tabs.find(t => t.active) || null)
const pageUncontrollable = computed(() =>
  isBrowser.value && status.value === 'streaming' && browserState.value?.controllable === false)

watch(activeTab, (tab) => {
  if (!addressFocused.value) addressInput.value = tab?.url || ''
})

const submitAddress = () => sendBrowserCommand({ action: 'navigate', url: addressInput.value })
const navBack = () => sendBrowserCommand({ action: 'back' })
const navForward = () => sendBrowserCommand({ action: 'forward' })
const navReload = () => sendBrowserCommand({ action: 'reload' })
const switchTab = (tabId: number) => sendBrowserCommand({ action: 'switch-tab', tabId })
const closeTab = (tabId: number) => sendBrowserCommand({ action: 'close-tab', tabId })
const newTab = () => sendBrowserCommand({ action: 'new-tab' })
const onFaviconError = (event: Event) => { (event.target as HTMLElement).style.visibility = 'hidden' }
const sendKey = (key: 'back' | 'home' | 'recents') => sendInput({ type: 'key', key })
const sendText = () => {
  const text = typing.value
  if (!text) return
  sendInput({ type: 'text', text })
  typing.value = ''
}
const sendControllerCommand = (command: RemoteControllerCommand) => {
  dispatchRemoteControllerAction(command, props.mode, sendInput, sendBrowserCommand)
}

const effectiveWidth = computed(() => deviceWidth.value || videoNaturalWidth.value)
const effectiveHeight = computed(() => deviceHeight.value || videoNaturalHeight.value)
const isPortrait = computed(() => isRemotePortrait(effectiveWidth.value, effectiveHeight.value, isDesktopLike.value))
const aspectStyle = computed(() => remoteAspectStyle(effectiveWidth.value, effectiveHeight.value, isDesktopLike.value))
const statusText = computed(() => remoteStatusText(status.value, errorMessage.value))

const onNaturalSize = (size: { width: number; height: number }) => {
  videoNaturalWidth.value = size.width
  videoNaturalHeight.value = size.height
}

const close = () => {
  stop()
  emit('close')
}

const fitPanel = () => fitPanelToOrientation({
  el: panelRef.value,
  isMaximized: isMaximized.value,
  isDesktopLike: isDesktopLike.value,
  width: effectiveWidth.value,
  height: effectiveHeight.value,
  isPortrait: isPortrait.value,
})

watch([effectiveWidth, effectiveHeight], () => {
  if (!isDesktopLike.value && !isMaximized.value) fitPanel()
})

const toggleMaximize = () => {
  isMaximized.value = !isMaximized.value
  if (!isMaximized.value) surfaceRef.value?.resetZoom()
}

const onViewportResize = () => {
  if (!isMaximized.value) fitPanel()
}

onMounted(() => {
  fitPanel()
  window.addEventListener('resize', onViewportResize)
  window.addEventListener('orientationchange', onViewportResize)
  window.visualViewport?.addEventListener('resize', onViewportResize)
  if (props.deviceId) start(props.deviceId, { qualityPreset: qualityPreset.value })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
  window.removeEventListener('orientationchange', onViewportResize)
  window.visualViewport?.removeEventListener('resize', onViewportResize)
  stop()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[120] flex items-center justify-center modal-overlay p-2 sm:p-4" @click.self="close">
      <div
        ref="panelRef"
        class="flex flex-col rounded-2xl border border-zinc-700/70 bg-zinc-900/80 backdrop-blur-xl shadow-2xl overflow-hidden resize"
        :class="{ 'rc-panel-maximized': isMaximized }"
        :style="panelConstraints"
        @click.stop
      >
        <RemoteControlChrome
          :is-maximized="isMaximized"
          :is-desktop-like="isDesktopLike"
          :is-browser="isBrowser"
          :mode-label="modeLabel"
          :device-name="deviceName"
          :device-id="deviceId"
          :status="status"
          :status-text="statusText"
          :quality-preset="qualityPreset"
          :browser-state="browserState"
          :address-input="addressInput"
          :typing="typing"
          :mode="mode"
          :active-surface="activeSurface"
          @update:quality-preset="qualityPreset = $event"
          @update:address-input="addressInput = $event"
          @update:typing="typing = $event"
          @toggle-maximize="toggleMaximize"
          @close="close"
          @switch-tab="switchTab"
          @close-tab="closeTab"
          @new-tab="newTab"
          @nav-back="navBack"
          @nav-forward="navForward"
          @nav-reload="navReload"
          @submit-address="submitAddress"
          @address-focus="addressFocused = $event"
          @favicon-error="onFaviconError"
          @send-text="sendText"
          @send-key="sendKey"
        >
          <template #navigation>
            <div class="flex items-center gap-1 border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <button type="button" class="rounded-md px-3 py-1 text-xs transition-colors" :class="activeSurface === 'screen' ? 'bg-indigo-500/20 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-800'" @click="activeSurface = 'screen'">画面</button>
              <button v-if="terminalAvailable" type="button" class="rounded-md px-3 py-1 text-xs transition-colors" :class="activeSurface === 'terminal' ? 'bg-emerald-500/20 text-emerald-200' : 'text-zinc-400 hover:bg-zinc-800'" @click="activeSurface = 'terminal'">终端</button>
            </div>
          </template>
          <RemoteControlSurface
            v-if="activeSurface === 'screen'"
            ref="surfaceRef"
            :is-maximized="isMaximized"
            :is-desktop-like="isDesktopLike"
            :mode="mode"
            :status="status"
            :error-message="errorMessage"
            :control-ready="controlReady"
            :connection-state="connectionState"
            :page-uncontrollable="pageUncontrollable"
            :aspect-style="aspectStyle"
            :device-width="deviceWidth"
            :device-height="deviceHeight"
            :remote-stream="remoteStream"
            :send-input="sendInput"
            @update:is-maximized="isMaximized = $event"
            @natural-size="onNaturalSize"
            @close="close"
          />
          <RemoteTerminalPane v-else-if="terminalAvailable" :device-id="deviceId" />
        </RemoteControlChrome>
        <RemoteControllerPanel
          v-if="activeSurface === 'screen' && !isMaximized"
          :mode="mode"
          :disabled="!controlReady"
          @command="sendControllerCommand"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./remoteControl.css"></style>
