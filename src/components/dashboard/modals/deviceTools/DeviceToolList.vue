<script setup lang="ts">
import type {
  DeviceDynamicTool,
  DeviceToolStat,
  DeviceToolType,
  PermissionDecision,
} from '@/api/deviceTools'
import { ratePct } from './deviceToolDraft'

defineProps<{
  loading: boolean
  tools: DeviceDynamicTool[]
  filteredTools: DeviceDynamicTool[]
  statsByTool: Record<string, DeviceToolStat>
  currentTabLabel: string
  deviceType: DeviceToolType
  policyOpen: boolean
  policyTags: string[]
  policy: Record<string, PermissionDecision | ''>
  policySaving: boolean
}>()

const listQuery = defineModel<string>('listQuery', { default: '' })

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'edit', tool: DeviceDynamicTool): void
  (e: 'remove', tool: DeviceDynamicTool): void
  (e: 'toggle', tool: DeviceDynamicTool): void
  (e: 'approve', tool: DeviceDynamicTool): void
  (e: 'toggle-policy'): void
  (e: 'save-policy'): void
}>()
</script>

<template>
  <div v-if="loading" class="text-xs text-zinc-500 py-6 text-center">加载中…</div>
  <template v-else>
    <div class="mb-2 flex justify-between items-center gap-2">
      <input
        v-model="listQuery"
        type="search"
        placeholder="搜索工具…"
        class="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
      />
      <button type="button" class="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500" @click="emit('create')">+ 新建</button>
    </div>
    <div v-if="!tools.length" class="text-xs text-zinc-400 py-6 text-center">还没有动态工具。连接一台{{ currentTabLabel }}设备后，可点「新建」组合其已上报能力。</div>
    <div v-else-if="!filteredTools.length" class="text-xs text-zinc-400 py-6 text-center">没有匹配的工具</div>
    <div class="space-y-1.5">
      <div
        v-for="tool in filteredTools"
        :key="tool.name"
        class="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 flex items-center gap-3"
      >
        <div class="min-w-0 flex-1">
          <div class="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ tool.name }}</div>
          <div class="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{{ tool.description }}</div>
        </div>
        <span
          v-if="statsByTool[tool.name]?.total"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded"
          :class="(statsByTool[tool.name].failures || 0) > 0
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'"
          :title="`调用 ${statsByTool[tool.name].total} 次，失败 ${statsByTool[tool.name].failures} 次`"
        >失败 {{ statsByTool[tool.name].failures }}/{{ statsByTool[tool.name].total }}（{{ ratePct(statsByTool[tool.name]) }}%）</span>
        <span
          v-if="tool.status === 'draft'"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          title="AI 提交的草稿，批准后才会下发到设备"
        >待批准</span>
        <button
          v-if="tool.status === 'draft'"
          type="button"
          class="text-[11px] text-emerald-600 dark:text-emerald-300 hover:underline shrink-0"
          @click="emit('approve', tool)"
        >批准</button>
        <label class="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer shrink-0">
          <input type="checkbox" class="h-3.5 w-3.5 accent-indigo-500" :checked="tool.enabled" @change="emit('toggle', tool)" />
          启用
        </label>
        <button type="button" class="text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline shrink-0" @click="emit('edit', tool)">编辑</button>
        <button type="button" class="text-[11px] text-rose-600 dark:text-rose-300 hover:underline shrink-0" @click="emit('remove', tool)">删除</button>
      </div>
    </div>

    <div v-if="deviceType === 'desktop'" class="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button type="button" class="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300" @click="emit('toggle-policy')">
        <span>权限策略（允许 / 拒绝）</span>
        <span class="text-zinc-400">{{ policyOpen ? '收起' : '展开' }}</span>
      </button>
      <div v-if="policyOpen" class="border-t border-zinc-200 dark:border-zinc-700 p-2">
        <div class="grid grid-cols-2 gap-x-3 gap-y-1">
          <label v-for="tag in policyTags" :key="tag" class="flex items-center gap-1.5">
            <span class="flex-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 truncate" :title="tag">{{ tag }}</span>
            <select v-model="policy[tag]" class="rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-1 py-0.5 text-[10px]">
              <option value="">默认</option>
              <option value="allow">允许</option>
              <option value="deny">拒绝</option>
            </select>
          </label>
        </div>
        <div class="mt-2 flex justify-end">
          <button type="button" class="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-60" :disabled="policySaving" @click="emit('save-policy')">{{ policySaving ? '保存中…' : '保存策略并下发' }}</button>
        </div>
      </div>
    </div>
  </template>
</template>
