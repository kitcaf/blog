<script setup lang="ts">
import { ref, onMounted } from 'vue'

/**
 * Me Page
 * Features a typewriter effect for a personal welcome message
 */

const fullText = "Welcome to my digital garden. I'm a developer, a dreamer, and a chronic builder of things."
const displayText = ref('')
const isComplete = ref(false)

const typeWriter = (text: string, speed: number = 50) => {
  let i = 0
  const timer = setInterval(() => {
    if (i < text.length) {
      displayText.value += text.charAt(i)
      i++
    } else {
      clearInterval(timer)
      isComplete.value = true
    }
  }, speed)
}

onMounted(() => {
  // Start typing after a short delay for better entrance feel
  setTimeout(() => {
    typeWriter(fullText)
  }, 500)
})
</script>

<template>
  <main class="flex-1 flex items-center justify-center px-8 pb-32 animate-in fade-in duration-1000">
      <div class="max-w-2xl text-center">
        <h1 
          class="text-3xl md:text-4xl text-[var(--color-fg-deep)] leading-relaxed inline"
        >
          {{ displayText }}
          <!-- Blinking Cursor -->
          <span 
            class="inline-block w-[2px] h-[1.2em] bg-[var(--color-fg-lightest)] ml-1 align-middle transition-opacity duration-100"
            :class="{ 'animate-pulse': isComplete, 'opacity-100': !isComplete }"
          ></span>
        </h1>
      </div>
  </main>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.animate-pulse {
  animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
