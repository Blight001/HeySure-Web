<script setup lang="ts">
import type { McpToolBubbleSections } from '@/utils/mcpFormat'

defineProps<{
  sections: McpToolBubbleSections
  idx: number
  copiedTarget: string
}>()

defineEmits<{
  (e: 'copy', text: string, target: string, event: Event): void
}>()
</script>

<template>
  <div class="mcp-detail-doc max-h-96 overflow-y-auto pr-8 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
    <template v-if="sections.command">
      <div class="mcp-command-card">
        <div class="mcp-command-meta">
          <span v-if="sections.command.cwd" class="mcp-command-cwd" :title="sections.command.cwd">
            {{ sections.command.cwd }}
          </span>
          <span v-if="sections.command.timeoutSeconds" class="mcp-command-timeout">
            超时 {{ sections.command.timeoutSeconds }}s
          </span>
        </div>
        <div class="mcp-command-code-wrap">
          <span class="mcp-command-prompt" aria-hidden="true">$</span>
          <pre class="mcp-command-code">{{ sections.command.command }}</pre>
          <button
            type="button"
            class="mcp-command-copy"
            :title="copiedTarget === `mcp-command-${idx}` ? '已复制' : '复制命令'"
            @click.stop.prevent="$emit('copy', sections.command?.command || '', `mcp-command-${idx}`, $event)"
          >
            {{ copiedTarget === `mcp-command-${idx}` ? '已复制' : '复制' }}
          </button>
        </div>
      </div>

      <div class="mcp-result-card" :class="sections.command.success === false ? 'mcp-result-card-error' : ''">
        <div class="mcp-result-heading">
          <span>{{ sections.command.success === false ? '执行失败' : '执行完成' }}</span>
          <span v-if="sections.command.exitCode !== null" class="mcp-result-code">
            退出码 {{ sections.command.exitCode }}
          </span>
          <span v-if="sections.command.timedOut" class="mcp-result-code">已超时</span>
        </div>
        <p v-if="sections.command.summary" class="mcp-result-summary">{{ sections.command.summary }}</p>
        <pre v-if="sections.command.stdout" class="mcp-output">{{ sections.command.stdout }}</pre>
        <pre v-if="sections.command.stderr" class="mcp-output mcp-output-error">{{ sections.command.stderr }}</pre>
        <p
          v-if="!sections.command.summary && !sections.command.stdout && !sections.command.stderr"
          class="mcp-result-empty"
        >命令未返回文本输出</p>
      </div>

      <details class="mcp-raw-details">
        <summary>查看原始调用数据</summary>
        <div class="mcp-detail-line">参数</div>
        <pre class="mcp-detail-body">{{ sections.params }}</pre>
        <div class="mcp-detail-line">结果</div>
        <pre class="mcp-detail-body">{{ sections.result }}</pre>
      </details>
    </template>
    <template v-else>
      <template v-if="sections.params">
        <div class="mcp-detail-line">参数</div>
        <pre class="mcp-detail-body mcp-json-body">{{ sections.params }}</pre>
      </template>
      <template v-if="sections.result">
        <div class="mcp-detail-line">结果</div>
        <pre class="mcp-detail-body mcp-json-body">{{ sections.result }}</pre>
      </template>
    </template>
    <template v-if="sections.error">
      <div class="mcp-detail-line mcp-detail-line-error">错误</div>
      <pre class="mcp-detail-body mcp-detail-body-error">{{ sections.error }}</pre>
    </template>
  </div>
</template>

<style scoped>
.mcp-detail-doc {
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-command-card,
.mcp-result-card {
  overflow: hidden;
  margin-bottom: 0.5rem;
  border: 1px solid rgb(228 228 231);
  border-radius: 8px;
  background: rgb(250 250 250);
}

.mcp-command-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  border-bottom: 1px solid rgb(228 228 231);
  color: rgb(113 113 122);
}

.mcp-command-cwd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.mcp-command-cwd::before {
  content: '目录  ';
  color: rgb(161 161 170);
}

.mcp-command-timeout {
  flex: none;
  margin-left: auto;
  color: rgb(161 161 170);
}

.mcp-command-code-wrap {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.55rem 3.25rem 0.55rem 0.6rem;
  background: rgb(24 24 27);
}

.mcp-command-prompt {
  flex: none;
  color: rgb(74 222 128);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}

.mcp-command-code,
.mcp-output {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.mcp-command-code {
  color: rgb(244 244 245);
}

.mcp-command-copy {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid rgb(82 82 91);
  border-radius: 5px;
  color: rgb(161 161 170);
  background: rgb(39 39 42);
}

.mcp-command-copy:hover {
  color: white;
  border-color: rgb(113 113 122);
}

.mcp-result-card {
  padding: 0.5rem 0.6rem;
  border-color: rgb(187 247 208);
  background: rgb(240 253 244);
}

.mcp-result-card-error {
  border-color: rgb(254 205 211);
  background: rgb(255 241 242);
}

.mcp-result-heading {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(21 128 61);
  font-weight: 700;
}

.mcp-result-card-error .mcp-result-heading {
  color: rgb(190 18 60);
}

.mcp-result-code {
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.7);
  color: rgb(113 113 122);
  font-size: 10px;
  font-weight: 500;
}

.mcp-result-summary,
.mcp-result-empty {
  margin: 0.25rem 0 0;
  color: rgb(82 82 91);
}

.mcp-output {
  max-height: 16rem;
  overflow: auto;
  margin-top: 0.4rem;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.75);
  color: rgb(63 63 70);
}

.mcp-output-error {
  color: rgb(190 18 60);
}

.mcp-raw-details {
  margin-top: 0.25rem;
}

.mcp-raw-details > summary {
  width: fit-content;
  cursor: pointer;
  color: rgb(113 113 122);
  user-select: none;
}

.mcp-raw-details[open] > summary {
  margin-bottom: 0.35rem;
}

.mcp-json-body {
  padding: 0.4rem 0.5rem;
  border: 1px solid rgb(228 228 231);
  border-radius: 6px;
  background: rgb(250 250 250);
}

.dark .mcp-command-card,
.dark .mcp-result-card,
.dark .mcp-json-body {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27 / 0.72);
}

.dark .mcp-command-meta {
  border-color: rgb(63 63 70);
}

.dark .mcp-result-card {
  border-color: rgb(20 83 45);
  background: rgb(20 83 45 / 0.18);
}

.dark .mcp-result-card-error {
  border-color: rgb(136 19 55);
  background: rgb(136 19 55 / 0.16);
}

.dark .mcp-result-heading {
  color: rgb(74 222 128);
}

.dark .mcp-result-card-error .mcp-result-heading,
.dark .mcp-output-error {
  color: rgb(251 113 133);
}

.dark .mcp-result-code,
.dark .mcp-output {
  background: rgb(9 9 11 / 0.65);
}

.dark .mcp-result-summary,
.dark .mcp-result-empty,
.dark .mcp-output {
  color: rgb(161 161 170);
}

.mcp-detail-line {
  margin: 0;
  font-weight: 500;
  color: rgb(82 82 91);
}

.mcp-detail-line-error {
  color: rgb(190 18 60);
}

.dark .mcp-detail-line {
  color: rgb(212 212 216);
}

.dark .mcp-detail-line-error {
  color: rgb(251 113 133);
}

.mcp-detail-body {
  margin: 0 0 0.35rem;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-detail-body-error {
  color: rgb(190 18 60);
}

.dark .mcp-detail-body {
  color: rgb(161 161 170);
}

.dark .mcp-detail-body-error {
  color: rgb(251 113 133);
}
</style>
