<script setup lang="ts">
import { computed } from 'vue'
import MarkdownText from './MarkdownText.vue'
import { stripPromptSection, type McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

interface PromptTool {
  name?: string
  description?: string
  destructive?: boolean
  mcpSource?: string
}

const props = defineProps<{
  promptText: string
  promptError?: string
  toolGroups?: McpCatalogToolGroup[]
  availableTools?: PromptTool[]
  mcpEnabled?: boolean | null
  toolSchemaError?: string
}>()

const promptBody = computed(() => {
  return stripPromptSection(
    stripPromptSection(String(props.promptText || ''), '动态 MCP 说明'),
    '可用MCP工具',
  ) || '运行时 Prompt 预览加载中或暂不可用'
})

const displayGroups = computed<McpCatalogToolGroup[]>(() => {
  const groups = Array.isArray(props.toolGroups) ? props.toolGroups : []
  if (groups.length > 0) return groups

  const tools = Array.isArray(props.availableTools) ? props.availableTools : []
  const workspaceTools = tools.filter(tool => (tool.mcpSource || 'server') === 'server')
  const deviceTools = tools.filter(tool => (tool.mcpSource || 'server') !== 'server')
  return [
    {
      groupKey: 'workspace:fallback',
      groupLabel: '工作区 MCP',
      groupKind: 'workspace',
      tools: workspaceTools.map(tool => ({
        name: String(tool.name || ''),
        description: String(tool.description || ''),
        destructive: !!tool.destructive,
      })),
    },
    {
      groupKey: 'device:fallback',
      groupLabel: '端侧设备 MCP',
      groupKind: 'device',
      tools: deviceTools.map(tool => ({
        name: String(tool.name || ''),
        description: String(tool.description || ''),
        destructive: !!tool.destructive,
      })),
    },
  ]
})

const visibleGroups = computed(() => displayGroups.value.filter(group => {
  return group.tools.length > 0 || group.groupKey === 'device:none'
}))

const groupTone = (group: McpCatalogToolGroup, index: number) => {
  if (group.groupKind === 'device') return `front-prompt-mcp-card--device-${index % 3}`
  return `front-prompt-mcp-card--workspace-${index % 2}`
}
</script>

<template>
  <div class="front-prompt-preview">
    <section class="front-prompt-section front-prompt-section--body">
      <div class="front-prompt-section-label">
        <span class="front-prompt-section-dot front-prompt-section-dot--prompt"></span>
        Prompt 正文
      </div>
      <MarkdownText :text="promptBody" />
      <div v-if="props.promptError" class="front-prompt-error">
        Prompt 预览加载失败：{{ props.promptError }}
      </div>
    </section>

    <section class="front-prompt-section front-prompt-section--mcp">
      <div class="front-prompt-mcp-heading">
        <div class="front-prompt-section-label">
          <span class="front-prompt-section-dot front-prompt-section-dot--mcp"></span>
          动态 MCP
        </div>
        <span class="front-prompt-mcp-count">
          {{ visibleGroups.reduce((total, group) => total + group.tools.length, 0) }} 个工具
        </span>
      </div>

      <div v-if="props.mcpEnabled === false" class="front-prompt-mcp-state front-prompt-mcp-state--disabled">
        当前 AI 未启用 MCP
      </div>
      <div v-else-if="props.toolSchemaError" class="front-prompt-mcp-state front-prompt-mcp-state--error">
        工具目录加载失败：{{ props.toolSchemaError }}
      </div>
      <div v-else-if="visibleGroups.length === 0" class="front-prompt-mcp-state">
        当前没有可用的动态 MCP 工具
      </div>
      <div v-else class="front-prompt-mcp-grid">
        <article
          v-for="(group, index) in visibleGroups"
          :key="group.groupKey || `${group.groupLabel}-${index}`"
          class="front-prompt-mcp-card"
          :class="groupTone(group, index)"
        >
          <div class="front-prompt-mcp-card-header">
            <span class="front-prompt-mcp-group-name" :title="group.groupLabel">{{ group.groupLabel }}</span>
            <span class="front-prompt-mcp-group-count">{{ group.tools.length }}</span>
          </div>
          <div v-if="group.tools.length > 0" class="front-prompt-tool-list">
            <div v-for="tool in group.tools" :key="tool.name" class="front-prompt-tool-row">
              <div class="front-prompt-tool-name" :title="tool.name">
                {{ tool.name }}<span v-if="tool.destructive" class="front-prompt-tool-risk" title="可能产生副作用">!</span>
              </div>
              <div v-if="tool.description" class="front-prompt-tool-description" :title="tool.description">
                {{ tool.description }}
              </div>
            </div>
          </div>
          <div v-else class="front-prompt-mcp-empty">
            {{ group.groupKey === 'device:none' ? '当前无在线端侧设备' : '当前无可用工具' }}
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.front-prompt-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  color: rgb(63 63 70);
  font-size: 12px;
}

.dark .front-prompt-preview {
  color: rgb(212 212 216);
}

.front-prompt-section {
  min-width: 0;
  border: 1px solid;
  border-radius: 12px;
  padding: 12px;
}

.front-prompt-section--body {
  border-color: rgba(139, 92, 246, 0.22);
  background: rgba(245, 243, 255, 0.7);
}

.front-prompt-section--mcp {
  border-color: rgba(14, 165, 233, 0.22);
  background: rgba(240, 249, 255, 0.72);
}

.dark .front-prompt-section--body {
  border-color: rgba(167, 139, 250, 0.28);
  background: rgba(76, 29, 149, 0.12);
}

.dark .front-prompt-section--mcp {
  border-color: rgba(56, 189, 248, 0.25);
  background: rgba(12, 74, 110, 0.13);
}

.front-prompt-section-label,
.front-prompt-mcp-heading,
.front-prompt-mcp-card-header {
  display: flex;
  align-items: center;
}

.front-prompt-section-label {
  gap: 7px;
  margin-bottom: 10px;
  color: rgb(63 63 70);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.dark .front-prompt-section-label {
  color: rgb(228 228 231);
}

.front-prompt-section-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 999px;
}

.front-prompt-section-dot--prompt {
  background: rgb(139 92 246);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14);
}

.front-prompt-section-dot--mcp {
  background: rgb(14 165 233);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14);
}

.front-prompt-section--body :deep(.markdown-text) {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.front-prompt-section--body :deep(.md-code) {
  max-width: 100%;
  overflow-x: auto;
}

.front-prompt-error {
  margin-top: 10px;
  border: 1px solid rgba(244, 63, 94, 0.22);
  border-radius: 8px;
  background: rgba(255, 228, 230, 0.72);
  padding: 8px 10px;
  color: rgb(190 18 60);
  font-size: 11px;
}

.dark .front-prompt-error {
  border-color: rgba(251, 113, 133, 0.28);
  background: rgba(136, 19, 55, 0.16);
  color: rgb(253 164 175);
}

.front-prompt-mcp-heading {
  justify-content: space-between;
  gap: 12px;
}

.front-prompt-mcp-heading .front-prompt-section-label {
  margin-bottom: 0;
}

.front-prompt-mcp-count,
.front-prompt-mcp-group-count {
  flex: none;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.front-prompt-mcp-count {
  background: rgba(14, 165, 233, 0.12);
  padding: 3px 8px;
  color: rgb(3 105 161);
}

.dark .front-prompt-mcp-count {
  color: rgb(125 211 252);
}

.front-prompt-mcp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 9px;
  margin-top: 10px;
}

.front-prompt-mcp-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid;
  border-left-width: 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}

.front-prompt-mcp-card--workspace-0 {
  border-color: rgba(99, 102, 241, 0.3);
  border-left-color: rgb(99 102 241);
  background: rgba(238, 242, 255, 0.78);
}

.front-prompt-mcp-card--workspace-1 {
  border-color: rgba(168, 85, 247, 0.3);
  border-left-color: rgb(168 85 247);
  background: rgba(250, 245, 255, 0.78);
}

.front-prompt-mcp-card--device-0 {
  border-color: rgba(16, 185, 129, 0.3);
  border-left-color: rgb(16 185 129);
  background: rgba(236, 253, 245, 0.8);
}

.front-prompt-mcp-card--device-1 {
  border-color: rgba(245, 158, 11, 0.3);
  border-left-color: rgb(245 158 11);
  background: rgba(255, 251, 235, 0.8);
}

.front-prompt-mcp-card--device-2 {
  border-color: rgba(6, 182, 212, 0.3);
  border-left-color: rgb(6 182 212);
  background: rgba(236, 254, 255, 0.8);
}

.dark .front-prompt-mcp-card {
  background: rgba(24, 24, 27, 0.62);
}

.front-prompt-mcp-card-header {
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgba(161, 161, 170, 0.18);
  padding: 8px 9px;
}

.front-prompt-mcp-group-name {
  min-width: 0;
  overflow: hidden;
  color: rgb(39 39 42);
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .front-prompt-mcp-group-name {
  color: rgb(244 244 245);
}

.front-prompt-mcp-group-count {
  background: rgba(113, 113, 122, 0.12);
  padding: 2px 7px;
  color: rgb(82 82 91);
}

.dark .front-prompt-mcp-group-count {
  color: rgb(212 212 216);
}

.front-prompt-tool-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px;
}

.front-prompt-tool-row {
  min-width: 0;
  border-radius: 7px;
  padding: 6px 7px;
}

.front-prompt-tool-row:hover {
  background: rgba(255, 255, 255, 0.62);
}

.dark .front-prompt-tool-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.front-prompt-tool-name {
  overflow: hidden;
  color: rgb(24 24 27);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .front-prompt-tool-name {
  color: rgb(244 244 245);
}

.front-prompt-tool-risk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 5px;
  border-radius: 999px;
  background: rgb(244 63 94);
  color: white;
  font-family: sans-serif;
  font-size: 9px;
}

.front-prompt-tool-description {
  margin-top: 2px;
  overflow: hidden;
  color: rgb(82 82 91);
  font-size: 10px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .front-prompt-tool-description {
  color: rgb(161 161 170);
}

.front-prompt-mcp-empty,
.front-prompt-mcp-state {
  color: rgb(113 113 122);
  font-size: 11px;
}

.front-prompt-mcp-empty {
  padding: 12px 9px;
}

.front-prompt-mcp-state {
  margin-top: 10px;
  border: 1px dashed rgba(113, 113, 122, 0.3);
  border-radius: 9px;
  padding: 10px;
  text-align: center;
}

.front-prompt-mcp-state--disabled {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(254, 243, 199, 0.55);
  color: rgb(180 83 9);
}

.front-prompt-mcp-state--error {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(255, 228, 230, 0.55);
  color: rgb(190 18 60);
}

.dark .front-prompt-mcp-state--disabled {
  background: rgba(120, 53, 15, 0.18);
  color: rgb(253 230 138);
}

.dark .front-prompt-mcp-state--error {
  background: rgba(136, 19, 55, 0.18);
  color: rgb(253 164 175);
}
</style>
