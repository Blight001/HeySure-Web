<script setup lang="ts">
import type { DeviceToolFailure, DeviceToolStat, DeviceToolVersion } from '@/api/deviceTools'
import {
  actionLabel,
  DESKTOP_KINDS,
  ratePct,
  type Draft,
} from './deviceToolDraft'

defineProps<{
  draft: Draft
  isDesktop: boolean
  isJsMode: boolean
  isRuntimeMode: boolean
  availableTools: { name: string; description: string }[]
  saving: boolean
  versionsOpen: boolean
  versionsLoading: boolean
  versions: DeviceToolVersion[]
  failuresOpen: boolean
  failuresLoading: boolean
  failures: DeviceToolFailure[]
  statsByTool: Record<string, DeviceToolStat>
  fmtTime: (ts: number) => string
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'save'): void
  (e: 'add-param'): void
  (e: 'remove-param', index: number): void
  (e: 'desktop-kind'): void
  (e: 'add-step'): void
  (e: 'remove-step', index: number): void
  (e: 'move-step', index: number, delta: number): void
  (e: 'add-arg', stepIndex: number): void
  (e: 'remove-arg', stepIndex: number, argIndex: number): void
  (e: 'toggle-versions'): void
  (e: 'restore', versionId: number): void
  (e: 'toggle-failures'): void
}>()
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-1 gap-2">
      <label class="block">
        <span class="text-[11px] text-zinc-500">工具名</span>
        <input
          v-model="draft.name"
          :disabled="!!draft.original"
          placeholder="custom.collect_page"
          class="mt-0.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs font-mono disabled:opacity-60"
        />
      </label>
      <label class="block">
        <span class="text-[11px] text-zinc-500">工具说明（AI 看到的描述）</span>
        <textarea v-model="draft.description" rows="2" class="mt-0.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs" />
      </label>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">入参（input_schema）</span>
        <button type="button" class="text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline" @click="emit('add-param')">+ 参数</button>
      </div>
      <div v-if="!draft.params.length" class="text-[10px] text-zinc-400">无参数</div>
      <div v-for="(p, i) in draft.params" :key="i" class="mb-1 flex items-center gap-1.5">
        <input v-model="p.name" placeholder="参数名" class="w-28 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
        <select v-model="p.type" class="rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-1.5 py-1 text-[11px]">
          <option>string</option><option>number</option><option>boolean</option><option>object</option><option>array</option>
        </select>
        <input v-model="p.description" placeholder="说明" class="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px]" />
        <label class="flex items-center gap-1 text-[10px] text-zinc-500"><input type="checkbox" v-model="p.required" class="h-3 w-3 accent-indigo-500" />必填</label>
        <button type="button" class="text-rose-500 text-xs px-1" @click="emit('remove-param', i)">✕</button>
      </div>
    </div>

    <div v-if="isDesktop">
      <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">实现方式</span>
      <div class="mt-1 flex flex-wrap gap-1">
        <button
          v-for="k in DESKTOP_KINDS"
          :key="k.key"
          type="button"
          class="rounded-lg px-2.5 py-1 text-[11px] font-medium border"
          :class="draft.desktopKind === k.key
            ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'"
          @click="draft.desktopKind = k.key; emit('desktop-kind')"
        >{{ k.label }}</button>
      </div>
    </div>

    <div v-if="isJsMode">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">实现代码（JS · 在设备上执行）</span>
      </div>
      <textarea
        v-model="draft.js"
        rows="10"
        spellcheck="false"
        class="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-950/50 px-2.5 py-2 text-[11px] font-mono leading-relaxed"
      />
      <details class="mt-1">
        <summary class="text-[10px] text-indigo-600 dark:text-indigo-300 cursor-pointer">可用能力（{{ availableTools.length }}）</summary>
        <div class="mt-1 flex flex-wrap gap-1">
          <code v-for="t in availableTools" :key="t.name" class="rounded bg-zinc-100/60 dark:bg-zinc-800/60 px-1 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">{{ t.name }}</code>
        </div>
      </details>
    </div>

    <div v-else-if="isRuntimeMode">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">实现源码（{{ draft.desktopKind }} · 在设备上执行）</span>
      </div>
      <textarea
        v-model="draft.source"
        rows="10"
        spellcheck="false"
        class="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-950/50 px-2.5 py-2 text-[11px] font-mono leading-relaxed"
      />
      <label class="mt-2 block">
        <span class="text-[11px] text-zinc-500">权限标签（逗号分隔，可留空）</span>
        <input
          v-model="draft.permissions"
          placeholder="如 shell.write, filesystem.read, network"
          class="mt-0.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-[11px] font-mono"
        />
      </label>
    </div>

    <div v-else>
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">程序步骤（顺序执行）</span>
        <button type="button" class="text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline" @click="emit('add-step')">+ 步骤</button>
      </div>
      <div v-for="(step, i) in draft.steps" :key="i" class="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50/60 dark:bg-zinc-800/40">
        <div class="flex items-center gap-1.5 mb-1.5">
          <span class="text-[10px] text-zinc-400 w-4">{{ i + 1 }}</span>
          <select v-model="step.op" class="rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-1.5 py-1 text-[11px]">
            <option value="call">call 调用工具</option>
            <option value="set">set 设变量</option>
            <option value="return">return 返回</option>
          </select>
          <div class="ml-auto flex items-center gap-1">
            <button type="button" class="text-[11px] text-zinc-400 hover:text-zinc-600 px-1" @click="emit('move-step', i, -1)">↑</button>
            <button type="button" class="text-[11px] text-zinc-400 hover:text-zinc-600 px-1" @click="emit('move-step', i, 1)">↓</button>
            <button type="button" class="text-rose-500 text-xs px-1" @click="emit('remove-step', i)">✕</button>
          </div>
        </div>

        <div v-if="step.op === 'call'" class="space-y-1.5 pl-5">
          <div class="flex items-center gap-1.5">
            <input
              v-model="step.tool"
              list="device-tool-targets"
              placeholder="目标工具，如 builtin:keyboard.type"
              class="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono"
            />
            <input v-model="step.save_as" placeholder="存到 vars.（可选）" class="w-32 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
          </div>
          <div v-for="(a, ai) in step.args" :key="ai" class="flex items-center gap-1.5">
            <input v-model="a.key" placeholder="参数名" class="w-28 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
            <input v-model="a.value" placeholder="值或模板，如 ${args.text}" class="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
            <button type="button" class="text-rose-500 text-xs px-1" @click="emit('remove-arg', i, ai)">✕</button>
          </div>
          <button type="button" class="text-[10px] text-indigo-600 dark:text-indigo-300 hover:underline" @click="emit('add-arg', i)">+ 参数</button>
        </div>

        <div v-else-if="step.op === 'set'" class="flex items-center gap-1.5 pl-5">
          <input v-model="step.name" placeholder="变量名" class="w-32 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
          <input v-model="step.value" placeholder="值或模板" class="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
        </div>

        <div v-else class="pl-5">
          <input v-model="step.value" placeholder="返回值或模板，如 ${vars.result}" class="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[11px] font-mono" />
        </div>
      </div>
      <datalist id="device-tool-targets">
        <option v-for="t in availableTools" :key="t.name" :value="`builtin:${t.name}`">{{ t.description }}</option>
        <option v-for="t in availableTools" :key="`raw-${t.name}`" :value="t.name" />
      </datalist>
    </div>

    <div v-if="draft.original" class="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button type="button" class="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300" @click="emit('toggle-versions')">
        <span>历史版本（改坏了可回滚）</span>
        <span class="text-zinc-400">{{ versionsOpen ? '收起' : '展开' }}</span>
      </button>
      <div v-if="versionsOpen" class="border-t border-zinc-200 dark:border-zinc-700 p-2 space-y-1 max-h-44 overflow-auto">
        <div v-if="versionsLoading" class="text-[10px] text-zinc-400 py-2 text-center">加载中…</div>
        <div v-else-if="!versions.length" class="text-[10px] text-zinc-400 py-2 text-center">暂无历史版本</div>
        <div
          v-for="v in versions"
          :key="v.version_id"
          class="flex items-center gap-2 rounded border border-zinc-100 dark:border-zinc-800 px-2 py-1"
        >
          <span class="text-[10px] px-1 rounded" :class="v.action === 'delete' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-zinc-100/60 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300'">{{ actionLabel(v.action) }}</span>
          <span class="text-[10px] text-zinc-500">{{ v.actor === 'ai' ? 'AI' : '网页' }}</span>
          <span class="text-[10px] text-zinc-400 flex-1 truncate">{{ fmtTime(v.created_at) }} · {{ v.revision.slice(0, 8) }}</span>
          <button type="button" class="text-[10px] text-indigo-600 dark:text-indigo-300 hover:underline shrink-0" @click="emit('restore', v.version_id)">还原</button>
        </div>
      </div>
    </div>

    <div v-if="draft.original" class="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button type="button" class="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300" @click="emit('toggle-failures')">
        <span>
          失败记录
          <span v-if="statsByTool[draft.original]?.total" class="text-zinc-400">
            （{{ statsByTool[draft.original].failures }}/{{ statsByTool[draft.original].total }} · {{ ratePct(statsByTool[draft.original]) }}%）
          </span>
        </span>
        <span class="text-zinc-400">{{ failuresOpen ? '收起' : '展开' }}</span>
      </button>
      <div v-if="failuresOpen" class="border-t border-zinc-200 dark:border-zinc-700 p-2 space-y-1 max-h-44 overflow-auto">
        <div v-if="failuresLoading" class="text-[10px] text-zinc-400 py-2 text-center">加载中…</div>
        <div v-else-if="!failures.length" class="text-[10px] text-zinc-400 py-2 text-center">暂无失败记录</div>
        <div
          v-for="(f, i) in failures"
          :key="i"
          class="rounded border border-zinc-100 dark:border-zinc-800 px-2 py-1"
        >
          <div class="text-[10px] text-rose-600 dark:text-rose-300 break-words">{{ f.error || '失败' }}</div>
          <div class="mt-0.5 text-[10px] text-zinc-400">
            {{ fmtTime(f.created_at) }} · 会话 <span class="font-mono">{{ f.session_id || '—' }}</span>
            <span v-if="f.message_id"> · 消息 #{{ f.message_id }}</span>
            <span v-if="f.ai_config_id"> · AI #{{ f.ai_config_id }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <button type="button" class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="emit('cancel')">取消</button>
      <button type="button" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-60" :disabled="saving" @click="emit('save')">{{ saving ? '保存中…' : '保存并下发' }}</button>
    </div>
  </div>
</template>
