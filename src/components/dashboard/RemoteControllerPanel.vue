<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RcBrowserCommand, RcInput, RcMode } from '@/composables/useRemoteControl'
import { useRemoteControllerTransport } from '@/composables/useRemoteControllerTransport'
import { listRemoteControllerTemplates } from '@/api/remoteControllerTemplates'
import { BUILTIN_REMOTE_CONTROLLER_TEMPLATES } from '@/constants/remoteControllers'
import type { RemoteControllerControl, RemoteControllerTemplate } from '@/types/remoteController'
import RemoteJoystickControl from './RemoteJoystickControl.vue'

const props = defineProps<{
  mode: RcMode
  capabilities?: string[]
  disabled?: boolean
  defaultExpanded?: boolean
  sendInput: (input: RcInput) => void
  sendBrowserCommand: (command: RcBrowserCommand) => void
  sendControlJson: (payload: unknown, maxBufferedAmount?: number) => boolean
  sendFastJson: (payload: unknown) => boolean
  controllerFastReady: boolean
}>()
const RemoteControllerManagerModal = defineAsyncComponent(() => import('./RemoteControllerManagerModal.vue'))
const expanded = ref(props.defaultExpanded === true)
const managerOpen = ref(false)
const activeTemplateId = ref(props.mode === 'custom' ? 'jibotarm' : 'direction')
const serverTemplates = ref<RemoteControllerTemplate[]>([])
const loadWarning = ref('')
const transport = useRemoteControllerTransport(props.mode, props)
const activeContinuous = new Set<string>()
const capabilitySet = computed(() => new Set((props.capabilities || []).map(item => item.replace('.', '_'))))

const templates = computed(() => {
  const merged = new Map(BUILTIN_REMOTE_CONTROLLER_TEMPLATES.map(item => [item.id, item]))
  for (const item of serverTemplates.value) merged.set(item.id, item)
  return [...merged.values()].filter(item => item.deviceTypes.includes(props.mode)
    && item.requiredCapabilities.every(capability => capability === 'remote_control' || capability === 'remote.control'
      || capabilitySet.value.has(capability.replace('.', '_')))
    && (!item.controls.some(control => control.action.type === 'emit') || capabilitySet.value.has('remote_controller_templates')))
})
const activeTemplate = computed(() => templates.value.find(item => item.id === activeTemplateId.value) || templates.value[0])
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${activeTemplate.value?.layout.columns || 2}, minmax(0, 1fr))` }))
const toneClass = (control: RemoteControllerControl) => control.tone === 'primary'
  ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-100'
  : control.tone === 'danger'
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
    : 'border-zinc-700 bg-zinc-800 text-zinc-200'
const reloadTemplates = async () => {
  try {
    serverTemplates.value = await listRemoteControllerTemplates(props.mode)
    loadWarning.value = ''
  } catch {
    loadWarning.value = '服务器模板暂不可用，正在使用内置离线模板'
  }
}
const trigger = (control: RemoteControllerControl, value?: unknown) => {
  if (activeTemplate.value) transport.trigger(activeTemplate.value, control, value)
}
const continuous = (control: RemoteControllerControl, phase: 'start' | 'update' | 'end', value: unknown) => {
  const template = activeTemplate.value
  if (!template) return
  const key = `${template.id}:${control.id}`
  if (phase === 'start') activeContinuous.add(key)
  else if (phase === 'update' && !activeContinuous.has(key)) {
    activeContinuous.add(key)
    transport.sendContinuous(template, control, 'start', value)
  } else if (phase === 'end') {
    if (!activeContinuous.delete(key)) return
  }
  transport.sendContinuous(template, control, phase, value)
}
const releaseContinuous = () => {
  activeContinuous.clear()
  transport.releaseAllContinuous()
}
const submitText = (event: Event, control: RemoteControllerControl) => {
  const form = event.currentTarget as HTMLFormElement
  const input = form.elements.namedItem('value') as HTMLInputElement | null
  trigger(control, input?.value || '')
  form.reset()
}

onMounted(() => { void reloadTemplates() })
watch(expanded, (value, previous) => { if (previous && !value) releaseContinuous() })
watch(activeTemplateId, (_value, previous) => { if (previous) releaseContinuous() })
watch(() => props.disabled, (value, previous) => { if (value && !previous) releaseContinuous() })
onBeforeUnmount(() => { releaseContinuous(); transport.dispose() })
</script>

<template>
  <div class="border-t border-zinc-800 bg-zinc-950/85">
    <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/70" @click="expanded = !expanded">
      <span>预设控制器</span><span>{{ expanded ? '收起' : '展开' }}⌄</span>
    </button>
    <div v-if="expanded" class="border-t border-zinc-800 p-3">
      <div class="mb-3 flex items-center gap-1 overflow-x-auto">
        <button v-for="template in templates" :key="template.id" type="button" class="shrink-0 rounded-full border px-3 py-1 text-xs" :class="template.id === activeTemplate?.id ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700 text-zinc-400'" @click="activeTemplateId = template.id">{{ template.name }}</button>
        <button type="button" class="ml-auto shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400" @click="managerOpen = true">管理</button>
      </div>
      <p v-if="loadWarning" class="mb-2 text-xs text-amber-400">{{ loadWarning }}</p>
      <div v-if="activeTemplate" class="grid gap-2" :style="gridStyle">
        <template v-for="control in activeTemplate.controls" :key="control.id">
          <button v-if="control.kind === 'button'" type="button" :disabled="disabled" class="min-h-10 rounded-lg border px-2 py-2 text-xs disabled:opacity-40" :class="toneClass(control)" @click="trigger(control)">{{ control.label }}</button>
          <div v-else-if="control.kind === 'dpad'" class="col-span-full grid grid-cols-3 gap-1">
            <span></span><button :disabled="disabled" class="remote-control-key" @click="trigger(control, 'up')">↑</button><span></span>
            <button :disabled="disabled" class="remote-control-key" @click="trigger(control, 'left')">←</button><button :disabled="disabled" class="remote-control-key" @click="trigger(control, 'confirm')">确定</button><button :disabled="disabled" class="remote-control-key" @click="trigger(control, 'right')">→</button>
            <span></span><button :disabled="disabled" class="remote-control-key" @click="trigger(control, 'down')">↓</button><span></span>
          </div>
          <input v-else-if="control.kind === 'slider'" type="range" :min="control.min ?? 0" :max="control.max ?? 100" :step="control.step ?? 1" :disabled="disabled" :aria-label="control.label" @pointerdown="continuous(control, 'start', Number(($event.target as HTMLInputElement).value))" @input="continuous(control, 'update', Number(($event.target as HTMLInputElement).value))" @change="continuous(control, 'end', Number(($event.target as HTMLInputElement).value))" @blur="continuous(control, 'end', Number(($event.target as HTMLInputElement).value))" />
          <RemoteJoystickControl v-else-if="control.kind === 'joystick'" :label="control.label" :dead-zone="control.deadZone" :disabled="disabled" @start="continuous(control, 'start', $event)" @update="continuous(control, 'update', $event)" @end="continuous(control, 'end', $event)" />
          <form v-else-if="control.kind === 'textInput'" class="flex gap-1" @submit.prevent="submitText($event, control)">
            <input name="value" type="text" :disabled="disabled" :maxlength="control.maxLength || 1024" :placeholder="control.label" class="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-white" /><button :disabled="disabled" class="rounded bg-indigo-600 px-2 text-xs text-white">发送</button>
          </form>
          <div v-else class="grid grid-cols-3 gap-1"><button v-for="key in 9" :key="key" :disabled="disabled" class="remote-control-key" @click="trigger(control, String(key))">{{ key }}</button></div>
        </template>
      </div>
    </div>
    <RemoteControllerManagerModal v-if="managerOpen" :templates="serverTemplates" @close="managerOpen = false" @changed="reloadTemplates" />
  </div>
</template>

<style scoped>
.remote-control-key { min-height:2.25rem; border:1px solid #3f3f46; border-radius:.5rem; background:#27272a; color:#e4e4e7; font-size:.75rem; }
</style>
