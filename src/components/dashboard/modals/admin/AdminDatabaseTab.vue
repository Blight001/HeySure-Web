<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useBreakpoint } from '@/composables/useBreakpoint'
import * as adminApi from '@/api/admin'
import type { DbColumn, DbTableMeta, DbValue } from '@/api/admin'
import type { User } from '@/types'
import AppIcon from '@/components/common/AppIcon.vue'
import { ADMIN_DB_PAGE_SIZE } from '@/constants/admin'
import { dbValuePreview, dbValueToString } from '@/utils/adminFormat'
import AdminDbRowEditor, { type DbEditorState } from './AdminDbRowEditor.vue'
import AdminDbCleanupDialog from './AdminDbCleanupDialog.vue'
import AdminDbImportDialog from './AdminDbImportDialog.vue'

const props = defineProps<{
  currentUser?: User | null
}>()

const { alert, confirm } = useMessage()
const { isMobile } = useBreakpoint()
const isOwner = computed(() => props.currentUser?.role === 'owner')

const dbTables = ref<DbTableMeta[]>([])
const dbTablesLoading = ref(false)
const dbActiveTable = ref('')
const dbColumns = ref<DbColumn[]>([])
const dbPrimaryKey = ref<string[]>([])
const dbRows = ref<Record<string, DbValue>[]>([])
const dbRowsLoading = ref(false)
const dbTotal = ref(0)
const dbOffset = ref(0)
const dbSearch = ref('')
const DB_PAGE_SIZE = ADMIN_DB_PAGE_SIZE
const dbEditor = ref<DbEditorState | null>(null)
const dbCleanupOpen = ref(false)
const dbImportOpen = ref(false)
const dbExportBusy = ref(false)
const dbExportIncludeMedia = ref(true)

const dbValueToStr = dbValueToString
const dbCellPreview = dbValuePreview
const dbPageStart = computed(() => (dbTotal.value === 0 ? 0 : dbOffset.value + 1))
const dbPageEnd = computed(() => Math.min(dbOffset.value + DB_PAGE_SIZE, dbTotal.value))

const loadDbTables = async () => {
  dbTablesLoading.value = true
  try {
    const res = await adminApi.listDbTables()
    dbTables.value = res.tables
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbTablesLoading.value = false
  }
}

const loadDbRows = async () => {
  if (!dbActiveTable.value) return
  dbRowsLoading.value = true
  try {
    const res = await adminApi.listDbRows(dbActiveTable.value, DB_PAGE_SIZE, dbOffset.value, dbSearch.value.trim())
    dbColumns.value = res.columns
    dbPrimaryKey.value = res.primary_key
    dbRows.value = res.rows
    dbTotal.value = res.total
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbRowsLoading.value = false
  }
}

const selectDbTable = (name: string) => {
  if (name === dbActiveTable.value) return
  dbActiveTable.value = name
  dbOffset.value = 0
  dbSearch.value = ''
  dbEditor.value = null
  void loadDbRows()
}

const dbSearchSubmit = () => {
  dbOffset.value = 0
  void loadDbRows()
}

const dbNextPage = () => {
  if (dbOffset.value + DB_PAGE_SIZE >= dbTotal.value) return
  dbOffset.value += DB_PAGE_SIZE
  void loadDbRows()
}

const dbPrevPage = () => {
  if (dbOffset.value <= 0) return
  dbOffset.value = Math.max(0, dbOffset.value - DB_PAGE_SIZE)
  void loadDbRows()
}

const rowPk = (row: Record<string, DbValue>): Record<string, DbValue> => {
  const pk: Record<string, DbValue> = {}
  for (const k of dbPrimaryKey.value) pk[k] = row[k]
  return pk
}

const openDbInsert = () => {
  const values: Record<string, string> = {}
  for (const c of dbColumns.value) values[c.name] = ''
  dbEditor.value = { mode: 'insert', pk: null, values }
}

const openDbEdit = (row: Record<string, DbValue>) => {
  const values: Record<string, string> = {}
  for (const c of dbColumns.value) values[c.name] = dbValueToStr(row[c.name])
  dbEditor.value = { mode: 'update', pk: rowPk(row), values }
}

const closeDbEditor = () => { dbEditor.value = null }

const onEditorSaved = async () => {
  dbEditor.value = null
  await Promise.all([loadDbRows(), loadDbTables()])
}

const deleteDbRow = async (row: Record<string, DbValue>) => {
  const pk = rowPk(row)
  const label = Object.entries(pk).map(([k, v]) => `${k}=${v}`).join(', ')
  const ok = await confirm({
    message: `确认从表「${dbActiveTable.value}」删除该行（${label}）？此操作不可恢复。`,
    type: 'warning',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await adminApi.deleteDbRow(dbActiveTable.value, pk)
    await Promise.all([loadDbRows(), loadDbTables()])
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const runDbExport = async () => {
  if (dbExportBusy.value) return
  dbExportBusy.value = true
  try {
    await adminApi.exportDatabase(dbExportIncludeMedia.value)
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbExportBusy.value = false
  }
}

const onDbMutated = async () => {
  await Promise.all([loadDbTables(), dbActiveTable.value ? loadDbRows() : Promise.resolve()])
}

defineExpose({
  onSwitch: () => {
    if (!dbTables.value.length) void loadDbTables()
  },
})
</script>

<template>
  <div class="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0 h-full">
    <div
      class="border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 flex flex-col min-h-0 lg:w-44 lg:shrink-0 lg:max-h-none lg:flex-none"
      :class="isMobile
        ? (dbActiveTable ? 'shrink-0 basis-[min(34vh,280px)] max-h-[min(34vh,280px)]' : 'flex-1')
        : ''"
    >
      <div class="flex-1 overflow-y-auto p-2 min-h-0">
        <div class="flex items-center justify-between px-1 py-1.5">
          <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">数据表</span>
          <button
            class="text-[11px] px-1 text-zinc-400 hover:text-indigo-600 active:text-indigo-700"
            :disabled="dbTablesLoading"
            @click="loadDbTables"
          >↻</button>
        </div>
        <button
          v-for="t in dbTables"
          :key="t.name"
          class="w-full text-left px-3 py-2 lg:py-1.5 rounded-lg text-xs lg:text-[11px] flex items-center justify-between gap-1 transition-colors touch-manipulation active:bg-zinc-100 dark:active:bg-zinc-700"
          :class="dbActiveTable === t.name
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
          @click="selectDbTable(t.name)"
        >
          <span class="truncate font-mono" :title="t.name">{{ t.name }}</span>
          <span class="text-[10px] text-zinc-400 shrink-0">{{ t.row_count < 0 ? '?' : t.row_count }}</span>
        </button>
        <div v-if="!dbTables.length && !dbTablesLoading" class="text-center text-zinc-400 py-6 text-xs">暂无数据表</div>
      </div>
      <div v-if="isOwner" class="shrink-0 p-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
        <button
          class="w-full text-xs px-2 py-2 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 dark:border-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900/20 flex items-center justify-center gap-1 disabled:opacity-50"
          :disabled="dbExportBusy"
          @click="runDbExport"
        ><template v-if="dbExportBusy">导出中…</template><template v-else><AppIcon name="download" class="w-3.5 h-3.5" /> 导出备份</template></button>
        <label class="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
          <input v-model="dbExportIncludeMedia" type="checkbox" class="accent-indigo-600" />
          含媒体文件
        </label>
        <button
          class="w-full text-xs px-2 py-2 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 hover:border-amber-300 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/20 flex items-center justify-center gap-1"
          @click="dbImportOpen = true"
        ><AppIcon name="upload" class="w-3.5 h-3.5" /> 导入备份</button>
        <button
          class="w-full text-xs px-2 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center justify-center gap-1"
          @click="dbCleanupOpen = true"
        ><AppIcon name="broom" class="w-3.5 h-3.5" /> 清理数据库</button>
      </div>
    </div>

    <div class="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <div v-if="!dbActiveTable" class="flex-1 flex items-center justify-center text-sm text-zinc-400">
        请选择数据表
      </div>
      <template v-else>
        <div class="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-semibold font-mono text-zinc-700 dark:text-zinc-200 truncate">{{ dbActiveTable }}</span>
            <span class="text-[11px] text-zinc-400">共 {{ dbTotal }} 行</span>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="dbSearch"
              type="text"
              placeholder="搜索…"
              class="text-xs acrylic-input rounded-lg px-2 py-1 text-zinc-600 w-20 sm:w-28 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300"
              @keyup.enter="dbSearchSubmit"
            />
            <button class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400" @click="dbSearchSubmit">搜索</button>
            <button
              v-if="isOwner"
              class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              @click="openDbInsert"
            >＋ 新增</button>
            <button class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400" :disabled="dbRowsLoading" @click="loadDbRows">{{ dbRowsLoading ? '…' : '↻' }}</button>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          <table class="text-[10px] sm:text-xs border-collapse w-full">
            <thead class="bg-zinc-50 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 sticky top-0 z-10">
              <tr>
                <th class="text-left px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-zinc-50 dark:bg-zinc-800/60">操作</th>
                <th
                  v-for="c in dbColumns"
                  :key="c.name"
                  class="text-left px-3 py-2 font-medium whitespace-nowrap"
                  :title="c.type"
                >
                  {{ c.name }}
                  <AppIcon v-if="c.primary_key" name="key" class="w-3 h-3 text-amber-500" title="主键" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!dbRows.length && !dbRowsLoading">
                <td :colspan="dbColumns.length + 1" class="px-3 py-8 text-center text-zinc-400">暂无数据</td>
              </tr>
              <tr
                v-for="(row, i) in dbRows"
                :key="i"
                class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <td class="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-white dark:bg-zinc-900">
                  <button class="text-[11px] px-1.5 py-1 rounded text-zinc-500 hover:text-indigo-600 dark:text-zinc-400" @click="openDbEdit(row)">{{ isOwner ? '编辑' : '查看' }}</button>
                  <button v-if="isOwner" class="text-[11px] px-1.5 py-1 rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" @click="deleteDbRow(row)">删除</button>
                </td>
                <td
                  v-for="c in dbColumns"
                  :key="c.name"
                  class="px-3 py-1.5 whitespace-nowrap max-w-[140px] sm:max-w-[200px] lg:max-w-[260px] truncate"
                  :class="row[c.name] === null ? 'text-zinc-300 italic dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300'"
                  :title="dbValueToStr(row[c.name])"
                >{{ row[c.name] === null ? 'NULL' : dbCellPreview(row[c.name]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{{ dbPageStart }}–{{ dbPageEnd }} / {{ dbTotal }}</span>
          <div class="flex items-center gap-2">
            <button class="px-2 py-1 rounded-lg border border-zinc-200 disabled:opacity-40 hover:border-indigo-200 dark:border-zinc-700" :disabled="dbOffset <= 0" @click="dbPrevPage">上一页</button>
            <button class="px-2 py-1 rounded-lg border border-zinc-200 disabled:opacity-40 hover:border-indigo-200 dark:border-zinc-700" :disabled="dbOffset + DB_PAGE_SIZE >= dbTotal" @click="dbNextPage">下一页</button>
          </div>
        </div>
      </template>
    </div>

    <AdminDbRowEditor
      :editor="dbEditor"
      :table="dbActiveTable"
      :columns="dbColumns"
      :primary-key="dbPrimaryKey"
      :is-owner="isOwner"
      @close="closeDbEditor"
      @saved="onEditorSaved"
    />
    <AdminDbCleanupDialog
      :show="dbCleanupOpen"
      :current-user="currentUser"
      @close="dbCleanupOpen = false"
      @done="onDbMutated"
    />
    <AdminDbImportDialog
      :show="dbImportOpen"
      :current-user="currentUser"
      @close="dbImportOpen = false"
      @done="onDbMutated"
    />
  </div>
</template>
