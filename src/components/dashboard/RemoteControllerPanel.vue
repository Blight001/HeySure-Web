<script setup lang="ts">
import { computed, ref } from 'vue'
import { REMOTE_CONTROLLER_PRESETS } from '@/constants/remoteControllers'
import type { RcMode } from '@/composables/useRemoteControl'
import type { RemoteControllerButton, RemoteControllerCommand } from '@/types/remoteController'

const props = defineProps<{ mode: RcMode; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'command', command: RemoteControllerCommand): void }>()
const expanded = ref(false)
const activePresetId = ref('direction')
const availablePresets = computed(() => REMOTE_CONTROLLER_PRESETS.filter(item => item.modes.includes(props.mode)))
const activePreset = computed(() => availablePresets.value.find(item => item.id === activePresetId.value) || availablePresets.value[0])
const buttonClass = (button: RemoteControllerButton) => button.tone === 'primary'
  ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30'
  : button.tone === 'danger'
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
    : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
</script>

<template>
  <div class="border-t border-zinc-800 bg-zinc-950/85">
    <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/70" @click="expanded = !expanded">
      <span>预设控制器</span><span>{{ expanded ? '收起' : '展开' }}⌄</span>
    </button>
    <div v-if="expanded" class="border-t border-zinc-800 p-3">
      <div class="mb-3 flex gap-1 overflow-x-auto">
        <button
          v-for="preset in availablePresets"
          :key="preset.id"
          type="button"
          class="shrink-0 rounded-full border px-3 py-1 text-xs transition-colors"
          :class="preset.id === activePreset?.id ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'"
          @click="activePresetId = preset.id"
        >{{ preset.label }}</button>
      </div>
      <div v-for="section in activePreset?.sections || []" :key="section.id" class="mx-auto max-w-md">
        <div v-if="section.kind === 'dpad'" class="mx-auto grid w-48 grid-cols-3 gap-2">
          <span></span><button :disabled="disabled" class="remote-preset-button" :class="buttonClass(section.buttons[0])" @click="emit('command', section.buttons[0].command)">{{ section.buttons[0].label }}</button><span></span>
          <button :disabled="disabled" class="remote-preset-button" :class="buttonClass(section.buttons[1])" @click="emit('command', section.buttons[1].command)">{{ section.buttons[1].label }}</button>
          <button :disabled="disabled" class="remote-preset-button" :class="buttonClass(section.buttons[2])" @click="emit('command', section.buttons[2].command)">{{ section.buttons[2].label }}</button>
          <button :disabled="disabled" class="remote-preset-button" :class="buttonClass(section.buttons[3])" @click="emit('command', section.buttons[3].command)">{{ section.buttons[3].label }}</button>
          <span></span><button :disabled="disabled" class="remote-preset-button" :class="buttonClass(section.buttons[4])" @click="emit('command', section.buttons[4].command)">{{ section.buttons[4].label }}</button><span></span>
        </div>
        <div v-else class="mt-2 grid gap-2" :class="section.columns === 3 ? 'grid-cols-3' : 'grid-cols-2'">
          <button v-for="button in section.buttons" :key="button.id" :disabled="disabled" class="remote-preset-button" :class="buttonClass(button)" @click="emit('command', button.command)">{{ button.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remote-preset-button {
  min-height: 2.5rem;
  border-width: 1px;
  border-radius: .65rem;
  padding: .45rem .6rem;
  font-size: .75rem;
  transition: background-color .15s, opacity .15s;
}
.remote-preset-button:disabled { opacity: .4; cursor: not-allowed; }
</style>
