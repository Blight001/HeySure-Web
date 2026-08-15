<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { User } from '@/types'
import AppIcon from '@/components/common/AppIcon.vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'

const props = defineProps<{
  show: boolean
  currentUser?: User | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const { alert, confirm } = useMessage()
const dbImportBusy = ref(false)
const dbImportResult = ref<adminApi.DbImportResult | null>(null)
const dbImportFile = ref<File | null>(null)
const dbImportForm = ref<{ account: string; password: string }>({ account: '', password: '' })
const zIndex = usePopupZIndex(() => props.show)

const closeDbImport = () => {
  if (dbImportBusy.value) return
  emit('close')
}

const onDbImportFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  dbImportFile.value = input.files?.[0] || null
}

const runDbImport = async () => {
  const f = dbImportForm.value
  if (!dbImportFile.value) {
    await alert({ message: '请选择要导入的备份文件', type: 'warning' })
    return
  }
  if (!f.account.trim() || !f.password) {
    await alert({ message: '请输入房主账号和密码', type: 'warning' })
    return
  }
  const ok = await confirm({
    message: '导入将清空并覆盖备份文件中包含的所有数据表，且不可恢复。请确认已做好当前数据的备份。确认继续？',
    type: 'warning',
    confirmText: '确认导入',
  })
  if (!ok) return
  dbImportBusy.value = true
  try {
    const res = await adminApi.importDatabase(dbImportFile.value, f.account.trim(), f.password)
    dbImportResult.value = res
    dbImportForm.value.password = ''
    emit('done')
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbImportBusy.value = false
  }
}

watch(() => props.show, (open) => {
  if (!open) return
  dbImportResult.value = null
  dbImportFile.value = null
  dbImportForm.value = { account: props.currentUser?.account || '', password: '' }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        :style="{ zIndex }"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
        @click="closeDbImport"
      >
        <div
          class="acrylic-modal rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><AppIcon name="upload" class="w-4 h-4" /> 导入数据库备份</h3>
            <button class="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center" @click="closeDbImport">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div class="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700 leading-relaxed dark:bg-amber-900/15 dark:border-amber-900/40 dark:text-amber-300">
              <AppIcon name="warning" class="w-3.5 h-3.5" /> 高风险操作：导入会<b>清空并覆盖</b>备份中包含的所有数据表（账号、对话、AI 配置、任务、知识等），<b>不可恢复</b>。请先用「导出备份」保存当前数据。
            </div>

            <div class="space-y-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">备份文件（.json）</span>
              <input
                type="file"
                accept="application/json,.json"
                class="w-full text-xs text-zinc-600 file:mr-2 file:text-xs file:px-2.5 file:py-1.5 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200 dark:text-zinc-300 dark:file:bg-amber-900/30 dark:file:text-amber-300"
                @change="onDbImportFileChange"
              />
              <div v-if="dbImportFile" class="text-[11px] text-zinc-400 font-mono truncate">已选择：{{ dbImportFile.name }}</div>
            </div>

            <div class="space-y-2 pt-1">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">房主身份确认</span>
              <input
                v-model="dbImportForm.account"
                type="text"
                autocomplete="off"
                placeholder="房主账号"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-2 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200"
              />
              <input
                v-model="dbImportForm.password"
                type="password"
                autocomplete="new-password"
                placeholder="房主密码"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-2 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200"
                @keyup.enter="runDbImport"
              />
            </div>

            <div
              v-if="dbImportResult"
              class="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-emerald-700 leading-relaxed dark:bg-emerald-900/15 dark:border-emerald-900/40 dark:text-emerald-300"
            >
              <AppIcon name="check" class="w-3.5 h-3.5" /> 导入完成：共写入 {{ dbImportResult.total }} 行，覆盖 {{ Object.keys(dbImportResult.imported).length }} 张表。
              <div v-if="dbImportResult.skipped_tables.length" class="mt-1 text-amber-600">
                跳过未知表：<span class="font-mono">{{ dbImportResult.skipped_tables.join('、') }}</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <button class="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400" :disabled="dbImportBusy" @click="closeDbImport">关闭</button>
            <button
              class="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              :disabled="dbImportBusy || !dbImportFile"
              @click="runDbImport"
            >{{ dbImportBusy ? '导入中…' : '确认导入' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
