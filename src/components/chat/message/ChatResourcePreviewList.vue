<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import WorkspaceFilePreviewDialog from '../WorkspaceFilePreviewDialog.vue'
import {
  chatResourceIcon,
  chatResourceLabel,
  type ChatResourceRef,
} from '@/utils/chatResources'

const props = defineProps<{ resources: ChatResourceRef[] }>()
const selected = ref<ChatResourceRef | null>(null)
let trigger: HTMLElement | null = null

const visibleResources = computed(() => props.resources.filter(item => item?.url))

const open = (resource: ChatResourceRef, event: MouseEvent) => {
  trigger = event.currentTarget as HTMLElement | null
  selected.value = resource
}

const close = async () => {
  selected.value = null
  await nextTick()
  trigger?.focus()
}

const sizeLabel = (bytes?: number) => {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div v-if="visibleResources.length" class="chat-resource-list" aria-label="对话资源">
    <button
      v-for="(resource, index) in visibleResources"
      :key="`${resource.url}-${index}`"
      type="button"
      class="chat-resource-card"
      :title="`查看 ${chatResourceLabel(resource)}`"
      :aria-label="`查看资源 ${chatResourceLabel(resource)}`"
      @click="open(resource, $event)"
    >
      <img
        v-if="resource.kind === 'image'"
        :src="resource.url"
        :alt="chatResourceLabel(resource)"
        class="chat-resource-thumb"
        loading="lazy"
      />
      <span v-else class="chat-resource-icon" aria-hidden="true">{{ chatResourceIcon(resource.kind) }}</span>
      <span class="chat-resource-meta">
        <strong>{{ chatResourceLabel(resource) }}</strong>
        <small>{{ resource.kind }}<template v-if="sizeLabel(resource.bytes)"> · {{ sizeLabel(resource.bytes) }}</template></small>
      </span>
    </button>
  </div>

  <WorkspaceFilePreviewDialog
    :open="!!selected"
    :path="selected ? chatResourceLabel(selected) : ''"
    :display-name="selected ? chatResourceLabel(selected) : ''"
    :size="selected?.bytes || 0"
    :source-url="selected?.url || ''"
    @close="close"
  />
</template>

<style scoped>
.chat-resource-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.2rem 0 0.55rem;
}
.chat-resource-card {
  display: flex;
  min-width: 12rem;
  max-width: min(22rem, 100%);
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgb(228 228 231);
  border-radius: 0.7rem;
  background: rgb(250 250 250 / 0.86);
  padding: 0.35rem 0.5rem;
  text-align: left;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.chat-resource-card:hover,
.chat-resource-card:focus-visible {
  border-color: rgb(129 140 248);
  background: rgb(238 242 255 / 0.8);
  outline: none;
}
.chat-resource-thumb {
  width: 3.4rem;
  height: 3.4rem;
  flex: none;
  border-radius: 0.5rem;
  object-fit: cover;
  background: rgb(244 244 245);
}
.chat-resource-icon {
  display: inline-flex;
  width: 3.4rem;
  height: 3.4rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgb(244 244 245);
  font-size: 1.45rem;
}
.chat-resource-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}
.chat-resource-meta strong,
.chat-resource-meta small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-resource-meta strong {
  color: rgb(63 63 70);
  font-size: 0.72rem;
  font-weight: 600;
}
.chat-resource-meta small {
  color: rgb(113 113 122);
  font-size: 0.63rem;
  text-transform: lowercase;
}
.dark .chat-resource-card {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27 / 0.74);
}
.dark .chat-resource-card:hover,
.dark .chat-resource-card:focus-visible {
  border-color: rgb(129 140 248);
  background: rgb(30 27 75 / 0.6);
}
.dark .chat-resource-thumb,
.dark .chat-resource-icon {
  background: rgb(39 39 42);
}
.dark .chat-resource-meta strong {
  color: rgb(228 228 231);
}
.dark .chat-resource-meta small {
  color: rgb(161 161 170);
}
</style>
