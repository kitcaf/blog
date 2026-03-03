<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BlogHeader from '@/components/BlogHeader.vue'

/**
 * Blog Detail Page
 * Features View Transition API for smooth title movement from index page
 */

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

// In a real app, this would be a fetch based on route.params.id
const post = ref({
  id,
  title: 'agent的未来是什么',
  date: '2025.10.24',
  author: 'xjj',
  tags: ['AGENT', 'AI'],
  content: `
    <p>AI Agent 的发展正在进入一个新的篇章。从最初的简单脚本到现在的复杂多步推理，我们正见证着从工具到助手的深刻变革。</p>
    <p>在这个过程中，交互模式的演进、底层模型的推理能力以及对长上下文的处理能力，共同构成了 Agent 的核心竞争力。</p>
    <p>本文将从技术演进、应用场景以及未来挑战三个维度，深度探讨 AI Agent 的发展趋势及其对软件工程领域的影响。</p>
  `
})

const goBack = () => {
  router.back()
}

onMounted(() => {
  // Simulate data fetching or other side effects
})
</script>

<template>
  <div
    class="min-h-screen bg-[var(--color-bg)] font-sans selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-fg)]">
    <div class="max-w-6xl mx-auto px-8 pt-16">
      
      <!-- Shared Header -->
      <BlogHeader />

      <main class="max-w-3xl mx-auto pb-24">
        
        <!-- Back Button Area -->
        <button 
          @click="goBack"
          class="flex items-center gap-2 text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)] transition-colors mb-12 group"
        >
          <span class="group-hover:-translate-x-1 transition-transform inline-block">←</span>
          <span class="text-xs font-medium tracking-tight uppercase">Back to Timeline</span>
        </button>

        <!-- Meta Info - Grey-themed as per requirements -->
        <div class="flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-lighter)] mb-6">
          <time class="tabular-nums">{{ post.date }}</time>
          <span class="w-1 h-1 rounded-full bg-[var(--color-fg-lightest)]"></span>
          <span>By {{ post.author }}</span>
        </div>

        <!-- Blog Title with Transition Support -->
        <h1 
          :style="{ 'view-transition-name': `post-title-${id}` }"
          class="text-4xl md:text-5xl font-serif italic text-[var(--color-fg-deeper)] leading-tight mb-16"
        >
          {{ post.title }}
        </h1>

        <!-- Content Area -->
        <article class="prose prose-neutral dark:prose-invert max-w-none">
          <div class="text-[var(--color-fg-deep)] leading-relaxed font-light text-lg space-y-8" v-html="post.content"></div>
        </article>
      </main>
    </div>
  </div>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

/* Custom styles for rendered HTML content */
:deep(p) {
  margin-bottom: 2rem;
}
</style>
