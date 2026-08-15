<script setup lang="ts">
defineProps<{
  label: string
  duration?: string
  ariaLabel?: string
  spacingClass?: string
}>()
</script>

<template>
  <div class="task-boundary" :class="spacingClass" :aria-label="ariaLabel || label">
    <span class="task-boundary-wave"></span>
    <strong>{{ label }}</strong>
    <span v-if="duration" class="task-boundary-duration">{{ duration }}</span>
    <span class="task-boundary-wave"></span>
  </div>
</template>

<style scoped>
.task-boundary {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  color: rgb(113 113 122);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.task-boundary strong {
  flex: none;
  font-weight: 700;
  color: rgb(63 63 70);
}

.task-boundary-wave {
  height: 7px;
  flex: 1;
  min-width: 2rem;
  opacity: 0.45;
  background: radial-gradient(circle at 4px -1px, transparent 4px, currentColor 4.5px, transparent 5px) 0 0 / 10px 7px repeat-x;
}

.dark .task-boundary {
  color: rgb(113 113 122);
}

.dark .task-boundary strong {
  color: rgb(212 212 216);
}
</style>
