<script lang="ts">
export type { AppIconName } from '@/assets/icons'
</script>

<script setup lang="ts">
/**
 * 单色图标统一出口 — 形状定义见 `@/assets/icons.ts`。
 *
 * 全部图标继承 currentColor（跟随文字颜色与主题切换），
 * 随 JS 包内联渲染，无网络请求；尺寸由调用方的宽高工具类控制。
 */
import { APP_ICONS, type AppIconName } from '@/assets/icons'

defineProps<{
  name: AppIconName
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="inline-block shrink-0 align-[-0.125em]"
    v-html="APP_ICONS[name]"
  />
</template>
