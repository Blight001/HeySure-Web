<script setup lang="ts">
import { reactive, ref, watchEffect } from 'vue'
import type { CreateMaintenanceTaskInput, MaintenanceSeverity } from '@/api/maintenance'

const emit = defineEmits<{ (e: 'submit', input: CreateMaintenanceTaskInput): void; (e: 'cancel'): void }>()
const props = defineProps<{
  members: { id: number; name: string }[]
  devices: { id: string; name: string; boundAiConfigIds: number[] }[]
}>()
const submitting = ref(false)
const form = reactive<CreateMaintenanceTaskInput>({ maintainer_ai_config_id: 0, device_id: '', title: '', description: '', severity: 'medium', acceptance_criteria: '', affected_repo: '' })
const severities: { value: MaintenanceSeverity; label: string }[] = [
  { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'critical', label: '紧急' },
]
const availableDevices = () => props.devices.filter(item => !form.maintainer_ai_config_id || item.boundAiConfigIds.includes(form.maintainer_ai_config_id))
watchEffect(() => {
  if (!form.maintainer_ai_config_id && props.members.length) form.maintainer_ai_config_id = props.members[0].id
  const match = availableDevices()[0]
  if (!availableDevices().some(item => item.id === form.device_id)) form.device_id = match?.id || ''
})

const submit = () => {
  if (!form.maintainer_ai_config_id || !form.device_id || !form.title.trim() || !form.description.trim() || submitting.value) return
  emit('submit', { ...form, title: form.title.trim(), description: form.description.trim() })
}
</script>

<template>
  <form class="space-y-4 p-4" @submit.prevent="submit">
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block"><span class="text-xs font-semibold">维护成员</span><select v-model.number="form.maintainer_ai_config_id" required class="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><option :value="0" disabled>选择成员</option><option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option></select></label>
      <label class="block"><span class="text-xs font-semibold">Codex 设备</span><select v-model="form.device_id" required class="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><option value="" disabled>选择已绑定设备</option><option v-for="device in availableDevices()" :key="device.id" :value="device.id">{{ device.name }}</option></select></label>
    </div>
    <label class="block"><span class="text-xs font-semibold">标题</span><input v-model="form.title" required class="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" placeholder="简要描述需要维护的问题" /></label>
    <label class="block"><span class="text-xs font-semibold">问题与上下文</span><textarea v-model="form.description" required rows="5" class="mt-1 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" placeholder="现象、复现方式、相关成员或任务…"></textarea></label>
    <label class="block"><span class="text-xs font-semibold">验收标准</span><textarea v-model="form.acceptance_criteria" rows="3" class="mt-1 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" placeholder="怎样算修复完成？"></textarea></label>
    <label class="block"><span class="text-xs font-semibold">影响仓库</span><input v-model="form.affected_repo" class="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" placeholder="例如 deploy/server、deploy/web 或 device" /></label>
    <div><span class="text-xs font-semibold">严重程度</span><div class="mt-2 flex gap-2"><button v-for="item in severities" :key="item.value" type="button" class="rounded-lg border px-3 py-1.5 text-xs" :class="form.severity === item.value ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30' : 'border-zinc-300 dark:border-zinc-700'" @click="form.severity = item.value">{{ item.label }}</button></div></div>
    <p v-if="!members.length || !devices.length" class="text-xs text-amber-600">请先将在线的 codex-maintainer 设备绑定到维护成员。</p>
    <div class="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"><button type="button" class="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700" @click="emit('cancel')">取消</button><button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" :disabled="!form.maintainer_ai_config_id || !form.device_id || !form.title.trim() || !form.description.trim()">创建工单</button></div>
  </form>
</template>
