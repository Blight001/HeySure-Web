<script setup lang="ts">
import { computed, ref } from 'vue'
import type { McpToolParamRow } from '@/types'
import { nextPopupZIndex } from '@/composables/usePopupZIndex'

export interface McpScopeToolListItem {
  name: string
  label: string
  description: string
  params: McpToolParamRow[]
  destructive?: boolean
}

type DetailColumn = 'tool' | 'risk' | 'description' | 'params'

interface DetailCard {
  item: McpScopeToolListItem
  column: DetailColumn
  left: number
  top: number
  width: number
  zIndex: number
}

const props = withDefaults(defineProps<{
  tools: McpScopeToolListItem[]
  selected: Set<string>
  disabled?: boolean
  showTest?: boolean
}>(), {
  disabled: false,
  showTest: true,
})

const emit = defineEmits<{
  (e: 'toggle', tool: string): void
  (e: 'toggle-all'): void
  (e: 'test', tool: string): void
}>()

const hoverCard = ref<DetailCard | null>(null)
const pinnedCard = ref<DetailCard | null>(null)

const allSelected = computed(() =>
  props.tools.length > 0 && props.tools.every(tool => props.selected.has(tool.name)),
)
const someSelected = computed(() =>
  !allSelected.value && props.tools.some(tool => props.selected.has(tool.name)),
)

const cardPosition = (
  event: MouseEvent,
  item: McpScopeToolListItem,
  column: DetailColumn,
): DetailCard => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = Math.min(420, Math.max(240, rect.width))
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
  return {
    item,
    column,
    left,
    top: rect.bottom + 6,
    width,
    zIndex: nextPopupZIndex(),
  }
}

const showHover = (event: MouseEvent, item: McpScopeToolListItem, column: DetailColumn) => {
  if (pinnedCard.value?.item.name === item.name && pinnedCard.value.column === column) return
  hoverCard.value = cardPosition(event, item, column)
}

const pinDetails = (event: MouseEvent, item: McpScopeToolListItem, column: DetailColumn) => {
  hoverCard.value = null
  pinnedCard.value = cardPosition(event, item, column)
}

const columnTitle = (column: DetailColumn) => ({
  tool: '工具名称',
  risk: '权限类型',
  description: '功能说明',
  params: '调用参数',
}[column])

const paramsSummary = (item: McpScopeToolListItem) => {
  if (!item.params.length) return '无参数'
  return `${item.params.length} 个 · ${item.params.map(param => param.name).join('、')}`
}
</script>

<template>
  <div
    class="overflow-auto rounded-xl border border-zinc-200 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/30"
    @scroll="hoverCard = null"
  >
    <table class="w-full min-w-[760px] table-fixed border-collapse text-left">
      <colgroup>
        <col class="w-11" />
        <col class="w-[23%]" />
        <col class="w-24" />
        <col />
        <col class="w-[24%]" />
        <col v-if="showTest" class="w-16" />
      </colgroup>
      <thead class="sticky top-0 z-[1] bg-zinc-100/95 text-[10px] text-zinc-500 backdrop-blur dark:bg-zinc-800/95 dark:text-zinc-400">
        <tr>
          <th class="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <input
              type="checkbox"
              aria-label="全选或全不选 MCP 工具"
              class="block h-3.5 w-3.5 accent-indigo-500"
              :checked="allSelected"
              :indeterminate="someSelected"
              :disabled="disabled || tools.length === 0"
              @change="emit('toggle-all')"
            />
          </th>
          <th class="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-700">工具</th>
          <th class="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-700">类型</th>
          <th class="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-700">功能说明</th>
          <th class="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-700">参数</th>
          <th v-if="showTest" class="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-700">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in tools"
          :key="item.name"
          class="border-b border-zinc-200/80 text-[10px] transition-colors last:border-b-0 dark:border-zinc-700/80"
          :class="selected.has(item.name)
            ? 'bg-indigo-50/70 text-zinc-700 dark:bg-indigo-950/20 dark:text-zinc-200'
            : 'text-zinc-500 hover:bg-zinc-50/80 dark:text-zinc-400 dark:hover:bg-zinc-800/40'"
        >
          <td class="px-3 py-2">
            <input
              type="checkbox"
              :aria-label="`${selected.has(item.name) ? '取消' : '勾选'} ${item.label}`"
              class="block h-3.5 w-3.5 accent-indigo-500"
              :checked="selected.has(item.name)"
              :disabled="disabled"
              @change="emit('toggle', item.name)"
            />
          </td>
          <td
            class="cursor-pointer px-3 py-2"
            @mouseenter="showHover($event, item, 'tool')"
            @mouseleave="hoverCard = null"
            @click="pinDetails($event, item, 'tool')"
          >
            <div class="truncate font-medium text-zinc-700 dark:text-zinc-200">
              {{ item.label }} <span class="font-mono font-normal text-zinc-400">· {{ item.name }}</span>
            </div>
          </td>
          <td
            class="cursor-pointer px-3 py-2"
            @mouseenter="showHover($event, item, 'risk')"
            @mouseleave="hoverCard = null"
            @click="pinDetails($event, item, 'risk')"
          >
            <span
              class="inline-block max-w-full truncate rounded px-1.5 py-0.5"
              :class="item.destructive
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'"
            >
              {{ item.destructive ? '写入/变更' : '常规调用' }}
            </span>
          </td>
          <td
            class="cursor-pointer px-3 py-2"
            @mouseenter="showHover($event, item, 'description')"
            @mouseleave="hoverCard = null"
            @click="pinDetails($event, item, 'description')"
          >
            <div class="truncate">{{ item.description }}</div>
          </td>
          <td
            class="cursor-pointer px-3 py-2"
            @mouseenter="showHover($event, item, 'params')"
            @mouseleave="hoverCard = null"
            @click="pinDetails($event, item, 'params')"
          >
            <div class="truncate font-mono">{{ paramsSummary(item) }}</div>
          </td>
          <td v-if="showTest" class="px-3 py-2">
            <button
              type="button"
              class="rounded border border-emerald-200 px-1.5 py-0.5 text-[9px] text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              @click="emit('test', item.name)"
            >
              测试
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <Teleport to="body">
      <div
        v-if="hoverCard"
        :style="{
          left: `${hoverCard.left}px`,
          top: `${hoverCard.top}px`,
          width: `${hoverCard.width}px`,
          zIndex: hoverCard.zIndex,
        }"
        class="pointer-events-none fixed rounded-lg border border-zinc-200 bg-white/95 p-3 text-[10px] text-zinc-600 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300"
      >
        <div class="mb-1 font-medium text-zinc-800 dark:text-zinc-100">{{ columnTitle(hoverCard.column) }}</div>
        <div v-if="hoverCard.column === 'tool'" class="break-words">
          {{ hoverCard.item.label }} <span class="font-mono text-zinc-400">({{ hoverCard.item.name }})</span>
        </div>
        <div v-else-if="hoverCard.column === 'risk'">
          {{ hoverCard.item.destructive ? '允许此工具执行写入或状态变更操作。' : '常规工具调用，不标记为写入或变更操作。' }}
        </div>
        <div v-else-if="hoverCard.column === 'description'" class="whitespace-normal leading-relaxed">
          {{ hoverCard.item.description }}
        </div>
        <div v-else-if="!hoverCard.item.params.length">无参数</div>
        <div v-else class="space-y-1.5">
          <div v-for="param in hoverCard.item.params" :key="param.name">
            <span class="font-mono font-medium text-zinc-800 dark:text-zinc-100">{{ param.name }}</span>
            · {{ param.type }} · {{ param.required ? '必填' : '选填' }}
            <span v-if="param.description">：{{ param.description }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="pinnedCard"
        :style="{
          left: `${pinnedCard.left}px`,
          top: `${pinnedCard.top}px`,
          width: `${pinnedCard.width}px`,
          zIndex: pinnedCard.zIndex,
        }"
        class="fixed max-h-[55vh] overflow-y-auto rounded-xl border border-indigo-200 bg-white p-3 text-[10px] text-zinc-600 shadow-2xl dark:border-indigo-800 dark:bg-zinc-900 dark:text-zinc-300"
        @click.stop
      >
        <div class="mb-2 flex items-start justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-700">
          <div class="min-w-0">
            <div class="truncate font-medium text-zinc-800 dark:text-zinc-100">{{ pinnedCard.item.label }}</div>
            <div class="truncate font-mono text-[9px] text-zinc-400">{{ pinnedCard.item.name }}</div>
          </div>
          <button
            type="button"
            aria-label="关闭详情"
            class="shrink-0 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            @click="pinnedCard = null"
          >
            ×
          </button>
        </div>
        <div class="mb-2">
          <div class="mb-0.5 font-medium text-zinc-500 dark:text-zinc-400">功能说明</div>
          <div class="leading-relaxed">{{ pinnedCard.item.description }}</div>
        </div>
        <div class="mb-2">
          <div class="mb-0.5 font-medium text-zinc-500 dark:text-zinc-400">权限类型</div>
          <div>{{ pinnedCard.item.destructive ? '写入/变更' : '常规调用' }}</div>
        </div>
        <div>
          <div class="mb-1 font-medium text-zinc-500 dark:text-zinc-400">调用参数</div>
          <div v-if="!pinnedCard.item.params.length">无参数</div>
          <div v-else class="space-y-1.5">
            <div v-for="param in pinnedCard.item.params" :key="param.name">
              <span class="font-mono font-medium text-zinc-800 dark:text-zinc-100">{{ param.name }}</span>
              · {{ param.type }} · {{ param.required ? '必填' : '选填' }}
              <span v-if="param.description">：{{ param.description }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
