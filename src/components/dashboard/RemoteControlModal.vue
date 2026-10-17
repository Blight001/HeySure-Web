<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl, type RcMode, type RcQualityPreset } from '@/composables/useRemoteControl'
import RemoteControlChrome from './RemoteControlChrome.vue'
import RemoteControlSurface from './RemoteControlSurface.vue'
import RemoteControllerPanel from './RemoteControllerPanel.vue'
import type { RwmSurfacePreference } from '@/types/rwm'
import type { RwmTransport } from '@/composables/useRemoteWebMirror'
import { normalizeRemoteCapabilities, remoteControlAvailability, type RemoteControlSurface as RemoteControlSurfaceKind } from '@/utils/remoteControlCapabilities'
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
const RemoteWebMirrorPane = defineAsyncComponent(() => import('./RemoteWebMirrorPane.vue'))

const isDesktopLike = computed(() => isDesktopLikeMode(props.mode))
const modeLabel = computed(() => remoteModeLabel(props.mode))
const panelRef = ref<HTMLElement | null>(null)
const surfaceRef = ref<{ resetZoom: () => void } | null>(null)
const panelConstraints = computed(() => panelConstraintsStyle(isDesktopLike.value))
const availability = computed(() => remoteControlAvailability(props.mode, props.capabilities))
const screenAvailable = computed(() => availability.value.screenAvailable)
const controllerAvailable = computed(() => availability.value.controllerAvailable)
const customControllerAvailable = computed(() => availability.value.customControllerAvailable)
const sessionAvailable = computed(() => availability.value.sessionAvailable)
const terminalAvailable = computed(() => availability.value.terminalAvailable)
const activeSurface = ref<RemoteControlSurfaceKind>(availability.value.initialSurface)
const normalizedCapabilities = computed(() => normalizeRemoteCapabilities(props.capabilities))
const webMirrorAvailable = computed(() => screenAvailable.value && normalizedCapabilities.value.has('remote_web_mirror'))
const savedSurface = window.localStorage.getItem('heysure.remoteControl.webSurface')
const surfacePreference = ref<RwmSurfacePreference>(savedSurface === 'dom' || savedSurface === 'video' ? savedSurface : 'auto')
const webFallbackReason = ref('')
const webAttemptKey = ref(0)

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
  getSessionId,
  sendControlJson,
  sendFastJson,
  controllerFastReady,
  sendWebStateJson,
  setRemoteChannelHandlers,
} = useRemoteControl()
const rwmTransport: RwmTransport = { getSessionId, sendControlJson, sendWebStateJson, setRemoteChannelHandlers }

const QUALITY_STORAGE_KEY = 'heysure.remoteControl.desktopQuality'
const savedQuality = window.localStorage.getItem(QUALITY_STORAGE_KEY)
const qualityPreset = ref<RcQualityPreset>(
  savedQuality === 'smooth' || savedQuality === 'clear' ? savedQuality : 'balanced',
)
watch(qualityPreset, (preset) => {
  window.localStorage.setItem(QUALITY_STORAGE_KEY, preset)
  setQualityPreset(preset)
})
watch(surfacePreference, (preference) => {
  window.localStorage.setItem('heysure.remoteControl.webSurface', preference)
  webFallbackReason.value = ''
  webAttemptKey.value += 1
})
const renderWebMirror = computed(() => webMirrorAvailable.value
  && surfacePreference.value !== 'video'
  && !webFallbackReason.value)
const retryWebMirror = () => {
  webFallbackReason.value = ''
  webAttemptKey.value += 1
}

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
  if (props.deviceId && sessionAvailable.value) start(props.deviceId, {
    qualityPreset: qualityPreset.value,
    requestWebMirror: webMirrorAvailable.value,
  })
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
            <div class="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <button v-if="screenAvailable" type="button" class="rounded-md px-3 py-1 text-xs transition-colors" :class="activeSurface === 'screen' ? 'bg-indigo-500/20 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-800'" @click="activeSurface = 'screen'">远控</button>
              <button v-if="customControllerAvailable" type="button" class="rounded-md px-3 py-1 text-xs transition-colors" :class="activeSurface === 'controller' ? 'bg-indigo-500/20 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-800'" @click="activeSurface = 'controller'">遥控器</button>
              <button v-if="terminalAvailable" type="button" class="rounded-md px-3 py-1 text-xs transition-colors" :class="activeSurface === 'terminal' ? 'bg-emerald-500/20 text-emerald-200' : 'text-zinc-400 hover:bg-zinc-800'" @click="activeSurface = 'terminal'">终端</button>
              <label v-if="activeSurface === 'screen' && webMirrorAvailable" class="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
                显示
                <select v-model="surfacePreference" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200">
                  <option value="auto">自动</option><option value="dom">网页原生</option><option value="video">视频流</option>
                </select>
              </label>
              <div v-if="activeSurface === 'screen' && webFallbackReason" class="flex w-full items-center justify-between gap-3 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                <span class="truncate">{{ webFallbackReason }}</span>
                <button type="button" class="shrink-0 rounded border border-amber-400/40 px-2 py-0.5 hover:bg-amber-400/10" @click="retryWebMirror">重试网页原生</button>
              </div>
            </div>
          </template>
          <RemoteControlSurface
            v-if="screenAvailable && activeSurface === 'screen' && !renderWebMirror"
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
          <RemoteWebMirrorPane
            v-else-if="screenAvailable && activeSurface === 'screen' && renderWebMirror"
            :key="webAttemptKey"
            :transport="rwmTransport"
            @fallback="webFallbackReason = $event"
          />
          <div v-else-if="customControllerAvailable && activeSurface === 'controller'" class="flex min-h-24 flex-1 items-center justify-center bg-zinc-950/50 px-6 py-8 text-center">
            <div>
              <div class="mb-2 text-sm font-medium" :class="controlReady ? 'text-emerald-300' : status === 'error' ? 'text-rose-300' : 'text-amber-300'">
                {{ controlReady ? 'DataChannel 遥控已连接' : statusText }}
              </div>
              <p class="text-xs text-zinc-500">此设备使用纯数据通道，不需要屏幕视频轨。</p>
            </div>
          </div>
          <RemoteTerminalPane v-else-if="terminalAvailable && activeSurface === 'terminal'" :device-id="deviceId" />
        </RemoteControlChrome>
        <RemoteControllerPanel
          v-if="controllerAvailable && ((screenAvailable && activeSurface === 'screen' && !isMaximized) || (customControllerAvailable && activeSurface === 'controller'))"
          :mode="mode"
          :capabilities="capabilities"
          :disabled="!controlReady"
          :default-expanded="customControllerAvailable"
          :send-input="sendInput"
          :send-browser-command="sendBrowserCommand"
          :send-control-json="sendControlJson"
          :send-fast-json="sendFastJson"
          :controller-fast-ready="controllerFastReady"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./remoteControl.css"></style>
