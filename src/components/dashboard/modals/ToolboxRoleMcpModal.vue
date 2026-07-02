<script setup lang="ts">
import { computed } from 'vue'
import { getMcpToolZhLabel, groupMcpToolsBySource } from '@/utils/mcpTools'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import type { McpRoleMeta } from '@/types'

interface Props {
  show: boolean
  // The role tier this AI belongs to (digital_member_member / _manager / assistant_admin).
  role: string
  // The AI member name, shown only as context for the operator.
  aiName?: string
  mcpRoleMeta: McpRoleMeta
  roleMcpPermissions: Record<string, string[]>
  // Restrict the editable tools to the toolbox capability set (the 12 toolbox
  // tools). Library-bound governance tools and the introspection tool are not
  // part of the toolbox, so they are hidden here even though the role ceiling
  // technically spans the whole registry.
  toolboxTools?: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-role-tool', payload: { role: string; tool: string; checked: boolean }): void
  (e: 'close'): void
  (e: 'save'): void
}>()

const zIndex = usePopupZIndex(() => props.show)

const roleLabel = computed(() => props.mcpRoleMeta?.labels?.[props.role] || props.role)
const optionTools = computed(() => {
  const base = props.mcpRoleMeta?.options?.[props.role] || props.mcpRoleMeta?.defaults?.[props.role] || []
  const filter = props.toolboxTools
  if (filter && filter.length) {
    const allow = new Set(filter)
    return base.filter(tool => allow.has(tool))
  }
  return base
})
const sourceGroups = computed(() => groupMcpToolsBySource(optionTools.value))
const selectedCount = computed(() => (props.roleMcpPermissions?.[props.role] || []).length)

const isToolChecked = (tool: string) =>
  (props.roleMcpPermissions?.[props.role] || []).includes(tool)
const allChecked = computed(() => {
  const options = optionTools.value
  return options.length > 0 && options.every(tool => isToolChecked(tool))
})
const toolsAllChecked = (tools: string[]) =>
  tools.length > 0 && tools.every(tool => isToolChecked(tool))

const onToolChange = (tool: string, event: Event) => {
  const target = event.target as HTMLInputElement | null
  emit('toggle-role-tool', { role: props.role, tool, checked: !!target?.checked })
}
const onToolsChange = (tools: string[], event: Event) => {
  const target = event.target as HTMLInputElement | null
  const checked = !!target?.checked
  const optionSet = new Set(optionTools.value)
  tools
    .filter(tool => optionSet.has(tool))
    .forEach(tool => emit('toggle-role-tool', { role: props.role, tool, checked }))
}
// Header "全选" toggles every visible (toolbox-scoped) tool one by one, so it
// never touches the hidden library/governance tools in the saved policy.
const onAllChange = (event: Event) => onToolsChange(optionTools.value, event)

const onSave = () => {
  emit('save')
  emit('close')
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="show"
      :style="{ zIndex }"
      class="fixed inset-0 bg-black/45 flex items-center justify-center p-4 backdrop-blur-sm"
      @click="emit('close')"
    >
      <div
        class="acrylic-modal rounded-2xl shadow-2xl w-[760px] max-w-[94vw] max-h-[84vh] flex flex-col dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800"
        @click.stop
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div class="min-w-0">
            <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">MCP 角色权限 · {{ roleLabel }}</h3>
            <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span v-if="aiName">来自 AI「{{ aiName }}」 · </span>已选 {{ selectedCount }} / 可用 {{ optionTools.length }}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <input type="checkbox" :checked="allChecked" @change="onAllChange" />
              <span>全选</span>
            </label>
            <button @click="emit('close')" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="px-5 pt-3">
          <p class="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            该权限按「角色档位」生效：保存后会影响**所有**同档位（{{ roleLabel }}）的 AI 成员，而非仅当前这一个。各 AI 保存自身配置时会自动收敛到所属档位允许的工具。
          </p>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="space-y-3">
            <details
              v-for="source in sourceGroups"
              :key="`mcp-source-${source.source}`"
              open
              class="rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-700 dark:bg-zinc-950/60"
            >
              <summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-between gap-3">
                <span>{{ source.title }}</span>
                <span class="flex items-center gap-3">
                  <span class="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                    {{ source.tools.filter(tool => isToolChecked(tool)).length }} / {{ source.tools.length }}
                  </span>
                  <span class="flex items-center gap-1 text-[10px] font-normal text-zinc-500 dark:text-zinc-400" @click.stop>
                    <input
                      type="checkbox"
                      :checked="toolsAllChecked(source.tools)"
                      @click.stop
                      @change.stop="onToolsChange(source.tools, $event)"
                    />
                    <span>全选</span>
                  </span>
                </span>
              </summary>
              <div class="px-2 pb-2">
                <details
                  v-for="parent in source.parentGroups"
                  :key="`${source.source}-mcp-parent-${parent.title}`"
                  class="mb-2 rounded-lg border border-zinc-200 bg-zinc-50/70 last:mb-0 dark:border-zinc-700 dark:bg-zinc-800/40"
                >
                  <summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-between gap-3">
                    <span>{{ parent.title }}</span>
                    <span class="flex items-center gap-3">
                      <span class="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                        {{ parent.tools.filter(tool => isToolChecked(tool)).length }} / {{ parent.tools.length }}
                      </span>
                      <span class="flex items-center gap-1 text-[10px] font-normal text-zinc-500 dark:text-zinc-400" @click.stop>
                        <input
                          type="checkbox"
                          :checked="toolsAllChecked(parent.tools)"
                          @click.stop
                          @change.stop="onToolsChange(parent.tools, $event)"
                        />
                        <span>全选</span>
                      </span>
                    </span>
                  </summary>
                  <div class="space-y-2 px-2 pb-2">
                    <div
                      v-if="parent.groups.length === 1"
                      class="grid grid-cols-1 md:grid-cols-2 gap-2"
                    >
                      <label
                        v-for="tool in parent.groups[0].tools"
                        :key="`${source.source}-${tool}`"
                        class="text-xs text-zinc-600 dark:text-zinc-300 flex items-start gap-2"
                      >
                        <input
                          type="checkbox"
                          class="mt-0.5"
                          :checked="isToolChecked(tool)"
                          @change="onToolChange(tool, $event)"
                        />
                        <span class="min-w-0">
                          <span class="block">{{ getMcpToolZhLabel(tool) }}</span>
                          <span class="block font-mono text-[10px] text-zinc-400 dark:text-zinc-500 break-all">{{ tool }}</span>
                        </span>
                      </label>
                    </div>
                    <details
                      v-else
                      v-for="group in parent.groups"
                      :key="`${source.source}-${parent.title}-${group.tag}`"
                      class="rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-700 dark:bg-zinc-900/60"
                    >
                      <summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-between gap-3">
                        <span>{{ group.tag }}</span>
                        <span class="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                          {{ group.tools.filter(tool => isToolChecked(tool)).length }} / {{ group.tools.length }}
                        </span>
                      </summary>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 px-2 pb-2">
                        <label
                          v-for="tool in group.tools"
                          :key="`${source.source}-${tool}`"
                          class="text-xs text-zinc-600 dark:text-zinc-300 flex items-start gap-2"
                        >
                          <input
                            type="checkbox"
                            class="mt-0.5"
                            :checked="isToolChecked(tool)"
                            @change="onToolChange(tool, $event)"
                          />
                          <span class="min-w-0">
                            <span class="block">{{ getMcpToolZhLabel(tool) }}</span>
                            <span class="block font-mono text-[10px] text-zinc-400 dark:text-zinc-500 break-all">{{ tool }}</span>
                          </span>
                        </label>
                      </div>
                    </details>
                  </div>
                </details>
              </div>
            </details>
            <div v-if="optionTools.length === 0" class="text-[11px] text-zinc-500 dark:text-zinc-400">该角色暂无可分配的工具</div>
          </div>
        </div>

        <div class="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
          <button @click="emit('close')" class="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all">取消</button>
          <button @click="onSave" class="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all">保存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
