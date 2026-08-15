<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import { listWorldActorMeta, setWorldActorMeta, type WorldActorAppearance } from '@/api/world'
import { appearanceSkinUrl, DEFAULT_APPEARANCE, MEMBER_SKIN_OPTIONS } from './aiConfigSkins'

const props = defineProps<{
  editingConfigId: number
  roleGroup?: string
}>()

const appearanceDraft = ref<WorldActorAppearance>({ ...DEFAULT_APPEARANCE })
const appearanceLoading = ref(false)
const appearanceSaving = ref(false)
const appearanceError = ref('')
const appearanceNotice = ref('')

const appearancePreviewStyle = computed<CSSProperties>(() => ({
  backgroundImage: `url(${appearanceSkinUrl(props.roleGroup, appearanceDraft.value, props.editingConfigId)})`,
  backgroundPosition: '0 0',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '256px auto',
  imageRendering: 'pixelated',
  transform: `scale(${appearanceDraft.value.scale})`,
}))

const loadAppearance = async () => {
  appearanceNotice.value = ''
  appearanceError.value = ''
  appearanceDraft.value = { ...DEFAULT_APPEARANCE }
  if (!props.editingConfigId) return
  appearanceLoading.value = true
  try {
    const data = await listWorldActorMeta()
    const current = (data.items || []).find(item => Number(item.ai_config_id) === props.editingConfigId)
    if (current) {
      appearanceDraft.value = {
        skin: current.skin || '',
        tint: current.tint || '',
        scale: Number(current.scale) || 1,
        aura: current.aura || '',
      }
    }
  } catch (err: any) {
    appearanceError.value = err?.message || '人物外观加载失败'
  } finally {
    appearanceLoading.value = false
  }
}

const saveAppearance = async () => {
  if (!props.editingConfigId) return
  appearanceSaving.value = true
  appearanceError.value = ''
  appearanceNotice.value = ''
  try {
    const saved = await setWorldActorMeta(props.editingConfigId, appearanceDraft.value)
    appearanceDraft.value = {
      skin: saved.skin || '',
      tint: saved.tint || '',
      scale: Number(saved.scale) || 1,
      aura: saved.aura || '',
    }
    appearanceNotice.value = '人物外观已保存，社会显示会自动同步。'
  } catch (err: any) {
    appearanceError.value = err?.message || '外观保存失败'
  } finally {
    appearanceSaving.value = false
  }
}

const resetAppearanceDraft = () => {
  appearanceDraft.value = { ...DEFAULT_APPEARANCE }
  appearanceError.value = ''
  appearanceNotice.value = '已恢复默认预览，点击保存后生效。'
}

watch(() => props.editingConfigId, () => { void loadAppearance() }, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <div v-if="appearanceLoading" class="py-10 text-center text-xs text-zinc-400">人物外观加载中…</div>
    <template v-else>
      <div class="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-b from-sky-100 to-emerald-100 dark:border-zinc-700 dark:from-slate-900 dark:to-emerald-950/70">
        <div class="relative flex h-32 w-28 items-end justify-center">
          <div
            v-if="appearanceDraft.aura"
            class="absolute bottom-4 h-20 w-20 rounded-full opacity-60 blur-xl"
            :style="{ backgroundColor: appearanceDraft.aura }"
          ></div>
          <div class="relative h-24 w-16 origin-bottom transition-transform duration-200" :style="appearancePreviewStyle">
            <div
              v-if="appearanceDraft.tint"
              class="absolute inset-0 opacity-35 mix-blend-color"
              :style="{ backgroundColor: appearanceDraft.tint }"
            ></div>
          </div>
        </div>
      </div>

      <div>
        <div class="mb-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">人物皮肤</div>
        <div v-if="roleGroup === 'assistant_admin'" class="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
          该角色使用固定身份皮肤，可继续调整调色、体型和光环。
        </div>
        <div v-else class="grid grid-cols-5 gap-2">
          <button
            v-for="skin in MEMBER_SKIN_OPTIONS"
            :key="skin.key || 'default'"
            type="button"
            class="rounded-lg border px-2 py-2 text-[11px] transition-colors"
            :class="appearanceDraft.skin === skin.key
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:border-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-200'
              : 'border-zinc-200 bg-white/70 text-zinc-500 hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400'"
            @click="appearanceDraft.skin = skin.key"
          >
            {{ skin.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <div class="mb-2 flex items-center justify-between">
            <label class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">人物调色</label>
            <button type="button" class="text-[10px] text-zinc-400 hover:text-indigo-500" @click="appearanceDraft.tint = ''">无调色</button>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="appearanceDraft.tint" type="color" class="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-1 dark:border-zinc-700" />
            <input v-model.trim="appearanceDraft.tint" maxlength="7" placeholder="#RRGGBB" class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/70 px-2 py-2 text-xs uppercase dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100" />
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <div class="mb-2 flex items-center justify-between">
            <label class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">光环颜色</label>
            <button type="button" class="text-[10px] text-zinc-400 hover:text-indigo-500" @click="appearanceDraft.aura = ''">无光环</button>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="appearanceDraft.aura" type="color" class="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-1 dark:border-zinc-700" />
            <input v-model.trim="appearanceDraft.aura" maxlength="7" placeholder="#RRGGBB" class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/70 px-2 py-2 text-xs uppercase dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100" />
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <div class="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
          <span>人物体型</span>
          <span>{{ Number(appearanceDraft.scale).toFixed(2) }}×</span>
        </div>
        <input v-model.number="appearanceDraft.scale" type="range" min="0.7" max="1.4" step="0.05" class="w-full accent-indigo-600" />
      </div>

      <div v-if="appearanceError" class="text-xs text-rose-500">{{ appearanceError }}</div>
      <div v-if="appearanceNotice" class="text-xs text-emerald-600 dark:text-emerald-400">{{ appearanceNotice }}</div>
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" @click="resetAppearanceDraft">恢复默认</button>
        <button type="button" :disabled="appearanceSaving" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" @click="saveAppearance">
          {{ appearanceSaving ? '保存中…' : '保存人物外观' }}
        </button>
      </div>
    </template>
  </div>
</template>
