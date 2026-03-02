<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'search': []
}>()

const isFocused = ref(false)

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const handleFocus = () => {
  isFocused.value = true
}

const handleBlur = () => {
  isFocused.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    emit('search')
  }
}
</script>

<template>
  <div class="w-full relative">
    <input
      v-model="inputValue"
      type="text"
      :placeholder="placeholder || 'Search or command...'"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
      class="w-full pb-4 text-4xl md:text-5xl font-light bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none border-b border-slate-200 dark:border-slate-800 transition-colors duration-300"
    />
  </div>
</template>
