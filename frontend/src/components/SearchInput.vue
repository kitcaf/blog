<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSearch } from '@/composables/useSearch'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  variant?: 'large' | 'small'
}>(), {
  variant: 'large'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'search': []
}>()

const isFocused = ref(false)

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const { isSearchFocused } = useSearch()

const handleFocus = () => {
  isFocused.value = true
  isSearchFocused.value = true
}

const handleBlur = () => {
  isFocused.value = false
  isSearchFocused.value = false
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
      :class="[
        'w-full font-light bg-transparent text-[var(--color-fg-deep)] focus:outline-none border-b transition-all duration-300',
        variant === 'large' 
          ? 'pb-4 text-4xl md:text-5xl placeholder-[var(--color-fg-light)] border-[var(--color-fg-lightest)] focus:border-[var(--color-fg-light)]' 
          : 'pb-2 text-xl md:text-2xl placeholder-[var(--color-fg-lighter)] border-transparent focus:border-[var(--color-fg-lightest)]'
      ]"
    />
  </div>
</template>
