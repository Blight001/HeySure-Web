<script setup lang="ts">
import type { WorkflowCard } from '@/api/workflowCards'
import { boundMcpDeviceIds } from './automationDefinition'
import type { DeviceLike } from './automationTypes'

const props = defineProps<{
  card: WorkflowCard | null
  runDeviceId: string
  runInputText: string
  devices: DeviceLike[]
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'update:runDeviceId', value: string): void
  (e: 'update:runInputText', value: string): void
  (e: 'close'): void
  (e: 'start'): void
}>()

const deviceIds = (card: WorkflowCard) => card.definition.contractDeviceIds?.length
  ? card.definition.contractDeviceIds
  : boundMcpDeviceIds(card.definition)
</script>

<template>
  <div
    v-if="card"
    class="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
      <div class="flex justify-between">
        <div class="text-sm font-semibold">运行 {{ card.name }}</div>
        <button @click="emit('close')">✕</button>
      </div>
      <div class="mt-3 rounded border border-indigo-200 bg-indigo-50 p-2 text-[10px] text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
        每个 MCP 节点使用自己绑定的设备；无 MCP 节点的卡片无需设备。下方覆盖项仅替换卡片默认设备。
      </div>
      <label v-if="deviceIds(card).length" class="mt-3 block text-[10px] text-zinc-500">
        可选默认设备覆盖
        <select
          :value="runDeviceId"
          class="mt-1 w-full rounded border p-2 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"
          @change="emit('update:runDeviceId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">不覆盖</option>
          <option v-for="deviceId in deviceIds(card)" :key="deviceId" :value="deviceId">
            {{ props.devices.find(item => item.id === deviceId)?.name || '未命名设备' }} · {{ deviceId }}
          </option>
        </select>
      </label>
      <label class="mt-3 block text-[10px] text-zinc-500">
        运行输入
        <textarea
          :value="runInputText"
          rows="10"
          class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950"
          @input="emit('update:runInputText', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <div class="mt-3 flex justify-end gap-2">
        <button class="rounded border px-3 py-1.5 text-xs" @click="emit('close')">取消</button>
        <button :disabled="busy" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" @click="emit('start')">启动</button>
      </div>
    </div>
  </div>
</template>
