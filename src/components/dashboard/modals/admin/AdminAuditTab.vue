<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { AuditEntry } from '@/api/admin'
import { ADMIN_ACTION_LABELS } from '@/constants/admin'
import { formatOptionalDateTime } from '@/utils/adminFormat'

const { alert } = useMessage()

const auditEntries = ref<AuditEntry[]>([])
const auditLoading = ref(false)
const ACTION_LABELS = ADMIN_ACTION_LABELS
const fmtTime = formatOptionalDateTime

const loadAudit = async () => {
  auditLoading.value = true
  try {
    const res = await adminApi.listAudit(100)
    auditEntries.value = res.entries
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    auditLoading.value = false
  }
}

defineExpose({ tick: loadAudit, onSwitch: loadAudit })
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">操作审计日志</h3>
      <button
        class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
        :disabled="auditLoading"
        @click="loadAudit"
      >{{ auditLoading ? '刷新中…' : '↻ 刷新' }}</button>
    </div>
    <div class="border border-zinc-200 rounded-xl overflow-x-auto dark:border-zinc-800">
      <table class="w-full text-xs">
        <thead class="bg-zinc-50/60 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          <tr>
            <th class="text-left px-3 py-2 font-medium">时间</th>
            <th class="text-left px-3 py-2 font-medium">操作者</th>
            <th class="text-left px-3 py-2 font-medium">动作</th>
            <th class="text-left px-3 py-2 font-medium">详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!auditEntries.length">
            <td colspan="4" class="px-3 py-6 text-center text-zinc-400">暂无审计记录</td>
          </tr>
          <tr v-for="e in auditEntries" :key="e.id" class="border-t border-zinc-100 dark:border-zinc-800">
            <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ fmtTime(e.created_at) }}</td>
            <td class="px-3 py-2 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{{ e.actor_account || ('#' + e.actor_id) }}</td>
            <td class="px-3 py-2">
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300 whitespace-nowrap">
                {{ ACTION_LABELS[e.action] || e.action }}
              </span>
            </td>
            <td class="px-3 py-2 text-zinc-600 dark:text-zinc-300">
              {{ e.detail }}
              <span v-if="e.target_label" class="text-zinc-400">（{{ e.target_label }}）</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
