<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { DbCleanupCategory, DbCleanupResult } from '@/api/admin'
import type { User } from '@/types'
import AppIcon from '@/components/common/AppIcon.vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { ADMIN_CLEANUP_CATEGORIES } from '@/constants/admin'

const props = defineProps<{
  show: boolean
  currentUser?: User | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const { alert, confirm } = useMessage()
const CLEANUP_CATEGORIES = ADMIN_CLEANUP_CATEGORIES
const dbCleanupBusy = ref(false)
const dbCleanupResult = ref<DbCleanupResult | null>(null)
const dbCleanupForm = ref<{
  account: string
  password: string
  categories: Record<DbCleanupCategory, boolean>
  dropUnusedTables: boolean
}>({
  account: '',
  password: '',
  categories: { conversations: true, tasks: true, ai_messages: false, knowledge: false, projects: false },
  dropUnusedTables: true,
})

const zIndex = usePopupZIndex(() => props.show)

const dbCleanupSelectedCategories = computed(
  () => CLEANUP_CATEGORIES.filter(c => dbCleanupForm.value.categories[c.key]).map(c => c.key),
)

const dbCleanupHasSelection = computed(
  () => dbCleanupSelectedCategories.value.length > 0 || dbCleanupForm.value.dropUnusedTables,
)

const closeDbCleanup = () => {
  if (dbCleanupBusy.value) return
  emit('close')
}

const runDbCleanup = async () => {
  const f = dbCleanupForm.value
  if (!f.account.trim() || !f.password) {
    await alert({ message: '请输入房主账号和密码', type: 'warning' })
    return
  }
  if (!dbCleanupHasSelection.value) {
    await alert({ message: '请至少选择一项清理内容', type: 'warning' })
    return
  }
  const ok = await confirm({
    message: '此操作将永久清空所选类别的记录并删除无用数据表，且不可恢复。确认继续？',
    type: 'warning',
    confirmText: '确认清理',
  })
  if (!ok) return
  dbCleanupBusy.value = true
  try {
    const res = await adminApi.cleanupDatabase({
      account: f.account.trim(),
      password: f.password,
      categories: dbCleanupSelectedCategories.value,
      drop_unused_tables: f.dropUnusedTables,
    })
    dbCleanupResult.value = res
    dbCleanupForm.value.password = ''
    emit('done')
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbCleanupBusy.value = false
  }
}

watch(() => props.show, (open) => {
  if (!open) return
  dbCleanupResult.value = null
  dbCleanupForm.value = {
    account: props.currentUser?.account || '',
    password: '',
    categories: { conversations: true, tasks: true, ai_messages: false, knowledge: false, projects: false },
    dropUnusedTables: true,
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        :style="{ zIndex }"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
        @click="closeDbCleanup"
      >
        <div
          class="acrylic-modal rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5"><AppIcon name="broom" class="w-4 h-4" /> 清理数据库</h3>
            <button class="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center" @click="closeDbCleanup">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div class="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-700 leading-relaxed dark:bg-red-900/15 dark:border-red-900/40 dark:text-red-300">
              <AppIcon name="warning" class="w-3.5 h-3.5" /> 高风险操作：将永久清空所选记录并删除数据库中已无任何模型引用的无用数据表，<b>不可恢复</b>。请先确认已做好备份。
            </div>

            <div class="space-y-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">清空所有用户的记录</span>
              <label
                v-for="cat in CLEANUP_CATEGORIES"
                :key="cat.key"
                class="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                <input v-model="dbCleanupForm.categories[cat.key]" type="checkbox" class="mt-0.5 accent-red-600" />
                <span><b>{{ cat.label }}</b><span class="text-zinc-400 font-mono"> · {{ cat.desc }}</span></span>
              </label>
            </div>

            <div class="space-y-2 pt-1">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">数据表维护</span>
              <label class="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer">
                <input v-model="dbCleanupForm.dropUnusedTables" type="checkbox" class="mt-0.5 accent-red-600" />
                <span>删除<b>无用数据表</b>（不再被任何模型映射的遗留表）</span>
              </label>
            </div>

            <div class="space-y-2 pt-1">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">房主身份确认</span>
              <input
                v-model="dbCleanupForm.account"
                type="text"
                autocomplete="off"
                placeholder="房主账号"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-2 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200"
              />
              <input
                v-model="dbCleanupForm.password"
                type="password"
                autocomplete="new-password"
                placeholder="房主密码"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-2 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200"
                @keyup.enter="runDbCleanup"
              />
            </div>

            <div
              v-if="dbCleanupResult"
              class="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-emerald-700 leading-relaxed dark:bg-emerald-900/15 dark:border-emerald-900/40 dark:text-emerald-300"
            >
              <AppIcon name="check" class="w-3.5 h-3.5" /> 清理完成：共删除 {{ dbCleanupResult.total_deleted }} 条记录。
              <div v-if="Object.keys(dbCleanupResult.cleared).length" class="mt-1 font-mono text-[11px]">
                <div v-for="(n, name) in dbCleanupResult.cleared" :key="name">{{ name }}：{{ n }} 行</div>
              </div>
              <div v-if="dbCleanupResult.dropped_tables.length" class="mt-1">
                已删除无用表：<span class="font-mono">{{ dbCleanupResult.dropped_tables.join('、') }}</span>
              </div>
              <div v-else-if="dbCleanupForm.dropUnusedTables" class="mt-1 text-emerald-600/80">未发现无用数据表。</div>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <button class="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400" :disabled="dbCleanupBusy" @click="closeDbCleanup">关闭</button>
            <button
              class="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="dbCleanupBusy || !dbCleanupHasSelection"
              @click="runDbCleanup"
            >{{ dbCleanupBusy ? '清理中…' : '确认清理' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
