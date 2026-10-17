<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { applyJoystickDeadZone } from '@/utils/remoteControllerValue'

const props = withDefaults(defineProps<{ label: string; disabled?: boolean; deadZone?: number }>(), { deadZone: 0 })
const emit = defineEmits<{
  (e: 'start', value: { x: number; y: number }): void
  (e: 'update', value: { x: number; y: number }): void
  (e: 'end', value: { x: number; y: number }): void
}>()
const padRef = ref<HTMLElement | null>(null)
const active = ref(false)
const point = ref({ x: 0, y: 0 })

const valueFromEvent = (event: PointerEvent) => {
  const rect = padRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
  const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))
  return applyJoystickDeadZone({ x, y }, props.deadZone)
}
const start = (event: PointerEvent) => {
  active.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  point.value = valueFromEvent(event)
  emit('start', point.value)
}
const update = (event: PointerEvent) => {
  if (!active.value) return
  point.value = valueFromEvent(event)
  emit('update', point.value)
}
const end = () => {
  if (!active.value) return
  active.value = false
  point.value = { x: 0, y: 0 }
  emit('end', point.value)
}
onBeforeUnmount(end)
</script>

<template>
  <div class="text-center text-xs text-zinc-400">
    <div
      ref="padRef"
      class="relative mx-auto mb-1 aspect-square w-28 touch-none rounded-full border border-zinc-700 bg-zinc-800"
      :class="disabled ? 'pointer-events-none opacity-40' : ''"
      @pointerdown="start" @pointermove="update" @pointerup="end" @pointercancel="end" @lostpointercapture="end"
    >
      <span class="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500 shadow-lg" :style="{ left: `${50 + point.x * 30}%`, top: `${50 + point.y * 30}%` }"></span>
    </div>
    {{ label }}
  </div>
</template>
