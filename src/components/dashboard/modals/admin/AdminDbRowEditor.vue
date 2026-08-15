<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { DbColumn, DbValue } from '@/api/admin'
import AppIcon from '@/components/common/AppIcon.vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'

export interface DbEditorState {
  mode: 'insert' | 'update'
  pk: Record<string, DbValue> | null
  values: Record<string, string>
}

const props = defineProps<{
  editor: DbEditorState | null
  table: string
  columns: DbColumn[]
  primaryKey: string[]
  isOwner: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const { alert } = useMessage()
const dbSaving = ref(false)
const zIndex = usePopupZIndex(() => !!props.editor)

const dbColIsPk = (name: string) => props.primaryKey.includes(name)

const saveDbRow = async () => {
  if (!props.editor || !props.table) return
  dbSaving.value = true
  try {
    if (props.editor.mode === 'insert') {
      await adminApi.insertDbRow(props.table, props.editor.values)
      await alert({ message: '已插入', type: 'success' })
    } else {
      const pk = props.editor.pk || {}
      const values: Record<string, string> = {}
      for (const [k, v] of Object.entries(props.editor.values)) {
        if (!dbColIsPk(k)) values[k] = v
      }
      await adminApi.updateDbRow(props.table, pk, values)
      await alert({ message: '已更新', type: 'success' })
    }
    emit('saved')
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    dbSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="editor"
        :style="{ zIndex }"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
        @click="emit('close')"
      >
        <div
          class="acrylic-modal rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-100">
              {{ editor.mode === 'insert' ? '新增行' : (isOwner ? '编辑行' : '查看行') }} · <span class="font-mono">{{ table }}</span>
            </h3>
            <button class="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center" @click="emit('close')">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5 space-y-3">
            <div v-for="c in columns" :key="c.name">
              <label class="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                <span class="font-mono">{{ c.name }}</span>
                <AppIcon v-if="c.primary_key" name="key" class="w-3 h-3 text-amber-500" title="主键" />
                <span class="text-[10px] text-zinc-400 font-normal">{{ c.py_type }}{{ c.nullable ? ' · 可空' : '' }}</span>
              </label>
              <textarea
                v-if="c.py_type === 'str'"
                v-model="editor.values[c.name]"
                rows="1"
                spellcheck="false"
                :disabled="!isOwner || (editor.mode === 'update' && c.primary_key)"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-1.5 text-zinc-700 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200 dark:disabled:bg-zinc-800/50"
              ></textarea>
              <select
                v-else-if="c.py_type === 'bool'"
                v-model="editor.values[c.name]"
                :disabled="!isOwner || (editor.mode === 'update' && c.primary_key)"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-1.5 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200"
              >
                <option value="">（空）</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
              <input
                v-else
                v-model="editor.values[c.name]"
                type="text"
                :placeholder="editor.mode === 'insert' && c.primary_key ? '留空自动生成' : ''"
                :disabled="!isOwner || (editor.mode === 'update' && c.primary_key)"
                class="w-full text-xs acrylic-input rounded-lg px-2.5 py-1.5 text-zinc-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200 dark:disabled:bg-zinc-800/50"
              />
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <button class="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400" @click="emit('close')">{{ isOwner ? '取消' : '关闭' }}</button>
            <button
              v-if="isOwner"
              class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              :disabled="dbSaving"
              @click="saveDbRow"
            >{{ dbSaving ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
