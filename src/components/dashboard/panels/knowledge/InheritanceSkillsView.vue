<script setup lang="ts">
import {
  deviceDisplayLabel,
  formatImplementationCode,
  formatTime,
  hasImplementation,
  isServerInheritanceDevice,
  toolParameters,
} from '@/composables/knowledge/knowledgeFormat'
import type { KnowledgePanelApi } from '@/composables/knowledge/types'
import { getMcpToolZhLabel } from '@/utils/mcpTools'

defineProps<{ kb: KnowledgePanelApi }>()
const emit = defineEmits<{
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
}>()
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-indigo-700 dark:text-indigo-300">传承技能 MCP</div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="shrink-0 rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          @click.stop.prevent="emit('view-all-mcp')"
        >
          查看全部 MCP
        </button>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          @click.stop.prevent="emit('manage-device-tools')"
        >
          管理设备动态 MCP
        </button>
      </div>
    </div>
    <div v-if="kb.propertyEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
      {{ kb.propertyEditNotice }}
    </div>
    <div v-if="kb.propertyEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
      {{ kb.propertyEditError }}
    </div>
    <div
      v-if="!kb.inheritanceDevices.length"
      class="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-10 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-500"
    >
      暂无 MCP 工具。
    </div>
    <div v-if="kb.filteredInheritanceToolTabs.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="传承技能工具栏目">
      <div class="flex min-w-max items-end gap-1 px-1">
        <button
          v-for="item in kb.filteredInheritanceToolTabs"
          :key="item.key"
          type="button"
          role="tab"
          class="min-w-[10rem] whitespace-nowrap rounded-t-xl border border-b-0 px-4 py-2.5 text-left transition-colors"
          :class="kb.selectedInheritanceToolTab?.key === item.key
            ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
            : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
          :aria-selected="kb.selectedInheritanceToolTab?.key === item.key"
          @click="kb.selectInheritanceToolTab(item.key)"
        >
          <span class="block text-xs font-semibold">{{ getMcpToolZhLabel(item.tool.name) }}</span>
          <span class="mt-0.5 block max-w-[13rem] truncate text-[10px] opacity-70">{{ deviceDisplayLabel(item.device) }}</span>
        </button>
      </div>
    </div>
    <section
      v-for="device in kb.filteredInheritanceDevices"
      :key="`${device.device_type}-${device.device_id}`"
      v-show="kb.selectedInheritanceToolTab?.device.device_id === device.device_id && kb.selectedInheritanceToolTab?.device.device_type === device.device_type"
      class="min-h-[30rem] overflow-hidden rounded-b-xl border border-t-0 border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-800/40"
    >
      <header class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {{ deviceDisplayLabel(device) }}
            </div>
            <div class="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
              <template v-if="device.device_id === 'toolbox' || device.device_id === 'library'">内置服务端固定</template>
              <template v-else>设备号：{{ device.device_id || '未提供' }}</template>
              <template v-if="device.updated_at"> · {{ formatTime(device.updated_at) }}</template>
            </div>
          </div>
          <span class="shrink-0 rounded bg-white/75 px-2 py-1 text-[10px] text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">{{ device.tool_count }} 个 MCP</span>
        </div>
      </header>
      <div class="space-y-3 bg-white/75 p-3 dark:bg-zinc-900/40">
        <div v-if="!device.tools.length" class="px-3 py-6 text-center text-xs text-zinc-400">
          该设备暂未上报 MCP 工具
        </div>
        <article
          v-for="tool in device.tools"
          :key="`${device.device_id}-${tool.name}`"
          v-show="kb.selectedInheritanceToolTab?.tool.name === tool.name"
          class="min-h-[24rem] rounded-xl border border-zinc-100 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-950/35"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ getMcpToolZhLabel(tool.name) }}</h4>
              <code class="mt-0.5 block break-all text-[11px] text-indigo-600 dark:text-indigo-300">{{ tool.name }}</code>
            </div>
            <button
              v-if="!isServerInheritanceDevice(device)"
              type="button"
              class="shrink-0 whitespace-nowrap rounded-lg border border-emerald-200 bg-white/75 px-2.5 py-1.5 text-[11px] text-emerald-700 transition-colors hover:bg-emerald-50 active:bg-emerald-100 dark:border-emerald-900/60 dark:bg-zinc-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              @click="kb.openMcpTestModal(device, tool)"
            >
              测试 MCP
            </button>
            <span v-else class="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">服务端内置</span>
          </div>

          <div class="mt-3">
            <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">工具描述</div>
            <p class="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
              {{ tool.description || '（无描述）' }}
              <span v-if="tool.destructive" class="ml-1 text-amber-600 dark:text-amber-300">可能产生写入/变更</span>
            </p>
          </div>

          <div class="mt-3">
            <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">参数详情</div>
            <div v-if="toolParameters(tool).length" class="overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-700">
              <div
                v-for="param in toolParameters(tool)"
                :key="`${device.device_id}-${tool.name}-${param.name}`"
                class="grid grid-cols-1 gap-1.5 border-b border-zinc-100 px-3 py-2 text-[11px] last:border-b-0 dark:border-zinc-700 sm:grid-cols-[minmax(8rem,12rem)_5rem_4rem_1fr]"
              >
                <code class="break-all font-semibold text-zinc-700 dark:text-zinc-200">{{ param.name }}</code>
                <span class="text-zinc-500 dark:text-zinc-400">{{ param.type || 'any' }}</span>
                <span :class="param.required ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-400 dark:text-zinc-500'">{{ param.required ? '必填' : '可选' }}</span>
                <span class="text-zinc-600 dark:text-zinc-300">{{ param.description || '（无描述）' }}</span>
              </div>
            </div>
            <div v-else class="text-[11px] text-zinc-400 dark:text-zinc-500">无参数</div>
          </div>

          <div class="mt-3">
            <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">底层实现</div>
            <pre v-if="hasImplementation(tool)" class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 font-mono text-[10px] leading-relaxed text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-200">{{ formatImplementationCode(tool.implementation) }}</pre>
            <div v-else class="text-[11px] text-zinc-400 dark:text-zinc-500">未提供实现信息</div>
          </div>
        </article>

        <div
          v-if="isServerInheritanceDevice(device) && kb.selectedInheritanceServerCategory"
          class="border-t border-zinc-100 pt-4 dark:border-zinc-800"
        >
          <div class="mb-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            编辑服务端工具说明（保存后同步工具目录与 mcp.describe+tool）。工具箱与图书管理工具共享此编辑。
          </div>
          <div class="space-y-2">
            <section
              v-for="category in kb.inheritanceServerCategories"
              :key="category.namespace"
              v-show="category.namespace === kb.selectedInheritanceServerCategory?.namespace"
              class="overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/40"
            >
              <header class="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div class="flex items-center justify-between gap-3">
                  <div class="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">工具总栏目：{{ category.namespace }}</div>
                  <div class="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>{{ category.count }} 个工具</span>
                    <button
                      v-if="kb.editingPropertyCategory !== category.namespace"
                      type="button"
                      class="rounded border border-indigo-200 bg-white/75 px-2 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      @click="kb.startEditPropertyCategory(category)"
                    >
                      编辑
                    </button>
                  </div>
                </div>
              </header>
              <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <div
                  v-for="tool in category.tools"
                  :key="tool.name"
                  v-show="tool.name === kb.selectedInheritanceToolTab?.tool.name"
                  class="px-3 py-3"
                >
                  <div class="grid grid-cols-1 gap-2 md:grid-cols-[13rem_1fr]">
                    <div>
                      <div class="mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">调用工具</div>
                      <code class="break-all text-[11px] text-indigo-600 dark:text-indigo-300">{{ tool.name }}</code>
                    </div>
                    <div>
                      <div class="mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">工具描述</div>
                      <textarea
                        v-if="kb.editingPropertyCategory === category.namespace"
                        :value="kb.propertyDraftToolDescription(tool.name)"
                        rows="3"
                        class="w-full resize-y rounded border border-zinc-200 bg-white/75 p-2 text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
                        @input="kb.updateDraftToolDescription(tool.name, ($event.target as HTMLTextAreaElement).value)"
                      />
                      <div v-else class="text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                        {{ tool.description || '（无描述）' }}
                        <span v-if="tool.destructive" class="ml-1 text-amber-600 dark:text-amber-300">可能产生写入/变更</span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-2">
                    <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">参数说明</div>
                    <div v-if="toolParameters(tool).length" class="overflow-hidden rounded border border-zinc-100 dark:border-zinc-700">
                      <div
                        v-for="param in toolParameters(tool)"
                        :key="`${tool.name}-${param.name}`"
                        class="grid grid-cols-1 gap-2 border-b border-zinc-100 px-2 py-1.5 text-[11px] last:border-b-0 dark:border-zinc-700 md:grid-cols-[11rem_6rem_4rem_1fr]"
                      >
                        <code class="break-all text-zinc-700 dark:text-zinc-200">{{ param.name }}</code>
                        <span class="text-zinc-500 dark:text-zinc-400">{{ param.type || 'any' }}</span>
                        <span :class="param.required ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-400 dark:text-zinc-500'">
                          {{ param.required ? '必填' : '可选' }}
                        </span>
                        <textarea
                          v-if="kb.editingPropertyCategory === category.namespace"
                          :value="kb.propertyDraftParamDescription(tool.name, param.name)"
                          rows="2"
                          class="w-full resize-y rounded border border-zinc-200 bg-white/75 px-2 py-1 text-[11px] leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
                          @input="kb.updateDraftParamDescription(tool.name, param.name, ($event.target as HTMLTextAreaElement).value)"
                        />
                        <span v-else class="text-zinc-600 dark:text-zinc-300">{{ param.description || '（无描述）' }}</span>
                      </div>
                    </div>
                    <div v-else class="text-[11px] text-zinc-500 dark:text-zinc-400">无参数</div>
                  </div>
                </div>
                <div v-if="kb.editingPropertyCategory === category.namespace" class="flex justify-end gap-2 px-3 py-3">
                  <button
                    type="button"
                    class="rounded border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    :disabled="kb.savingPropertyCategory === category.namespace"
                    @click="kb.cancelEditPropertyCategory"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="kb.savingPropertyCategory === category.namespace"
                    @click="kb.savePropertyCategory(category)"
                  >
                    {{ kb.savingPropertyCategory === category.namespace ? '保存中…' : '保存' }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
    <div v-if="kb.inheritanceDevices.length && kb.filteredInheritanceDevices.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
      <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的设备或 MCP</div>
      <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="kb.detailQuery = ''">清空搜索条件</button>
    </div>
  </div>
</template>
