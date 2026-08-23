<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api/http'
import {
  createRemoteControllerTemplate,
  deleteRemoteControllerTemplate,
  restoreRemoteControllerTemplate,
  updateRemoteControllerTemplate,
} from '@/api/remoteControllerTemplates'
import type { RemoteControllerAction, RemoteControllerControl, RemoteControllerKind, RemoteControllerTemplate } from '@/types/remoteController'
import { parseRemoteControllerTemplate, REMOTE_CONTROLLER_KEYS } from '@/utils/remoteControllerSchema'

const props = defineProps<{ templates: RemoteControllerTemplate[] }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()
const selectedId = ref('')
const editing = ref<RemoteControllerTemplate | null>(null)
const saving = ref(false)
const message = ref('')
const builtinIds = new Set(['direction', 'media', 'presentation', 'browser'])
const kinds: RemoteControllerKind[] = ['button', 'dpad', 'keypad', 'slider', 'joystick', 'textInput']
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const selected = computed(() => props.templates.find(item => item.id === selectedId.value))

const emitAction = (): RemoteControllerAction => ({ type: 'emit', event: 'custom.action' })
const newControl = (index: number): RemoteControllerControl => ({
  id: `button-${index + 1}`, kind: 'button', label: `按钮 ${index + 1}`, tone: 'default', action: emitAction(),
})
const blankTemplate = (): RemoteControllerTemplate => ({
  schema: 'remote_controller_template.v1', id: `custom-${Date.now().toString(36)}`, name: '新遥控器', revision: 1,
  builtin: false, deviceTypes: ['desktop'], requiredCapabilities: ['remote_control'],
  layout: { columns: 3, gap: 'sm' }, controls: [newControl(0)],
})

const editSelected = () => {
  if (selected.value) editing.value = clone(selected.value)
  message.value = ''
}
const createNew = () => {
  selectedId.value = ''
  editing.value = blankTemplate()
  message.value = ''
}
const normalizeControl = (control: RemoteControllerControl) => {
  if (control.kind !== 'button') control.action = emitAction()
  if (control.kind === 'slider') {
    control.min ??= 0
    control.max ??= 100
    control.step ??= 1
  } else {
    delete control.min; delete control.max; delete control.step
  }
  if (control.kind === 'joystick') control.deadZone ??= 0.1
  else delete control.deadZone
  if (control.kind === 'textInput') control.maxLength ??= 256
  else delete control.maxLength
}
const changeAction = (control: RemoteControllerControl, type: RemoteControllerAction['type']) => {
  control.action = type === 'key' ? { type, key: 'Enter' }
    : type === 'browser' ? { type, action: 'reload' } : emitAction()
}
const save = async () => {
  if (!editing.value || saving.value) return
  saving.value = true
  message.value = ''
  try {
    if (editing.value.controls.some(control => control.action.type === 'emit')
      && !editing.value.requiredCapabilities.includes('remote_controller_templates')) editing.value.requiredCapabilities.push('remote_controller_templates')
    const template = parseRemoteControllerTemplate(editing.value)
    const saved = selectedId.value
      ? await updateRemoteControllerTemplate(template)
      : await createRemoteControllerTemplate(template)
    selectedId.value = saved.id
    editing.value = clone(saved)
    message.value = '已保存'
    emit('changed')
  } catch (error) {
    message.value = error instanceof ApiError && error.status === 409
      ? '模板已被其他窗口更新，请保留当前编辑内容并刷新列表后再合并。'
      : error instanceof Error ? error.message : '保存失败'
  } finally { saving.value = false }
}
const remove = async () => {
  const template = selected.value
  if (!template || template.builtin || !window.confirm(`删除“${template.name}”？`)) return
  try {
    await deleteRemoteControllerTemplate(template.id, template.revision)
    selectedId.value = ''; editing.value = null; emit('changed')
  } catch (error) { message.value = error instanceof Error ? error.message : '删除失败' }
}
const restore = async () => {
  const template = selected.value
  if (!template || !builtinIds.has(template.id)) return
  try {
    const restored = await restoreRemoteControllerTemplate(template.id, template.revision)
    editing.value = clone(restored); emit('changed'); message.value = '已恢复内置版本'
  } catch (error) { message.value = error instanceof Error ? error.message : '恢复失败' }
}
watch(selected, editSelected)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-3" @click.self="emit('close')">
      <div class="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200">
        <header class="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h3 class="font-medium">遥控器模板管理</h3><button class="text-zinc-400" @click="emit('close')">✕</button>
        </header>
        <div class="grid min-h-0 flex-1 md:grid-cols-[15rem_1fr]">
          <aside class="overflow-y-auto border-b border-zinc-700 p-3 md:border-b-0 md:border-r">
            <button class="mb-3 w-full rounded bg-indigo-600 px-3 py-2 text-sm text-white" @click="createNew">新建模板</button>
            <button v-for="template in templates" :key="template.id" class="mb-1 w-full rounded px-3 py-2 text-left text-sm" :class="selectedId === template.id ? 'bg-zinc-700' : 'hover:bg-zinc-800'" @click="selectedId = template.id">
              {{ template.name }} <span class="text-xs text-zinc-500">v{{ template.revision }}</span>
            </button>
          </aside>
          <form v-if="editing" class="overflow-y-auto p-4" @submit.prevent="save">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-xs">ID<input v-model.trim="editing.id" :disabled="!!selectedId" required pattern="[a-z][a-z0-9_.-]{0,63}" class="field" /></label>
              <label class="text-xs">名称<input v-model.trim="editing.name" required maxlength="80" class="field" /></label>
              <label class="text-xs">列数<input v-model.number="editing.layout.columns" type="number" min="1" max="12" class="field" /></label>
              <label class="text-xs">间距<select v-model="editing.layout.gap" class="field"><option v-for="gap in ['xs','sm','md','lg']" :key="gap">{{ gap }}</option></select></label>
              <fieldset class="sm:col-span-2"><legend class="text-xs">设备类型</legend><label v-for="device in ['desktop','android','browser']" :key="device" class="mr-4 text-sm"><input v-model="editing.deviceTypes" type="checkbox" :value="device" /> {{ device }}</label></fieldset>
            </div>
            <div class="my-4 flex items-center justify-between"><h4 class="text-sm font-medium">控件</h4><button type="button" class="small-button" @click="editing.controls.push(newControl(editing.controls.length))">添加控件</button></div>
            <section v-for="(control, index) in editing.controls" :key="index" class="mb-3 rounded-lg border border-zinc-700 p-3">
              <div class="grid gap-2 sm:grid-cols-3">
                <label class="text-xs">控件 ID<input v-model.trim="control.id" class="field" /></label>
                <label class="text-xs">标签<input v-model.trim="control.label" maxlength="40" class="field" /></label>
                <label class="text-xs">类型<select v-model="control.kind" class="field" @change="normalizeControl(control)"><option v-for="kind in kinds" :key="kind">{{ kind }}</option></select></label>
                <label class="text-xs">动作<select :value="control.action.type" :disabled="control.kind !== 'button'" class="field" @change="changeAction(control, ($event.target as HTMLSelectElement).value as RemoteControllerAction['type'])"><option value="emit">emit</option><option value="key">key</option><option value="browser">browser</option></select></label>
                <label v-if="control.action.type === 'emit'" class="text-xs">事件<input v-model.trim="control.action.event" class="field" /></label>
                <label v-else-if="control.action.type === 'key'" class="text-xs">按键<select v-model="control.action.key" class="field"><option v-for="key in REMOTE_CONTROLLER_KEYS" :key="key">{{ key }}</option></select></label>
                <label v-else class="text-xs">浏览器动作<select v-model="control.action.action" class="field"><option>back</option><option>forward</option><option>reload</option></select></label>
                <template v-if="control.kind === 'slider'"><input v-model.number="control.min" type="number" class="field" aria-label="最小值" /><input v-model.number="control.max" type="number" class="field" aria-label="最大值" /><input v-model.number="control.step" type="number" min="0.0001" class="field" aria-label="步长" /></template>
                <label v-if="control.kind === 'joystick'" class="text-xs">死区<input v-model.number="control.deadZone" type="number" min="0" max="0.95" step="0.05" class="field" /></label>
                <label v-if="control.kind === 'textInput'" class="text-xs">最大长度<input v-model.number="control.maxLength" type="number" min="1" max="1024" class="field" /></label>
              </div>
              <button type="button" class="mt-2 text-xs text-rose-400" :disabled="editing.controls.length <= 1" @click="editing.controls.splice(index, 1)">移除控件</button>
            </section>
            <p v-if="message" class="mb-3 text-sm text-amber-300">{{ message }}</p>
            <footer class="flex flex-wrap justify-end gap-2">
              <button v-if="selected && !selected.builtin" type="button" class="small-button text-rose-300" @click="remove">删除</button>
              <button v-if="selected && builtinIds.has(selected.id)" type="button" class="small-button" @click="restore">恢复内置</button>
              <button type="submit" :disabled="saving" class="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{{ saving ? '保存中…' : '保存' }}</button>
            </footer>
          </form>
          <div v-else class="p-8 text-center text-sm text-zinc-500">选择模板或新建模板</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.field { margin-top:.25rem; width:100%; border:1px solid #3f3f46; border-radius:.375rem; background:#18181b; padding:.5rem; color:#f4f4f5; }
.small-button { border:1px solid #3f3f46; border-radius:.375rem; padding:.4rem .7rem; font-size:.75rem; }
</style>
