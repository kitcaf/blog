<script setup lang="ts">
import { ref, onMounted } from 'vue'

/**
 * Project Showcase Page
 * Features a grid of projects with GIF previews and GitHub stats
 */

const isLoading = ref(true)

interface Project {
  id: string
  name: string
  description: string
  icon: string
  gif: string
  repoUrl: string
  stars: number
}

const projects = ref<Project[]>([
  {
    id: '1',
    name: 'Gemini CLI',
    description: 'An interactive CLI agent that helps you manage your codebase with ease and precision. Supports multi-model switching and context-aware commands.',
    icon: '🤖',
    gif: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxxT1Z5fO7e/giphy.gif',
    repoUrl: 'https://github.com/google/gemini-cli',
    stars: 1250
  },
  {
    id: '2',
    name: 'Vue Flow Engine',
    description: 'A lightweight, high-performance node-based editor engine built for Vue 3. Perfect for building visual workflow builders.',
    icon: '⚡',
    gif: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l41lTfuxmQJ7q6vG8/giphy.gif',
    repoUrl: 'https://github.com/vuejs/core',
    stars: 840
  },
  {
    id: '3',
    name: 'Serif UI Kit',
    description: 'A design system focused on typography and white space, bringing the elegance of print design to the digital world.',
    icon: '🖋️',
    gif: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif',
    repoUrl: 'https://github.com/tailwindlabs/tailwindcss',
    stars: 420
  }
])

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 150)
})
</script>

<template>
  <Transition name="content-fade" appear>
    <div v-if="!isLoading" style="view-transition-name: project-content" class="w-full">
          <!-- Grid Layout: 3 columns on desktop -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
            <a 
              v-for="project in projects" 
              :key="project.id"
              :href="project.repoUrl"
              target="_blank"
              class="group flex flex-col"
            >
              <!-- Project Preview GIF -->
              <div class="relative aspect-video overflow-hidden rounded-2xl bg-[var(--color-fg-lightest)]/30 mb-6 border border-[var(--color-fg-lightest)]/50">
                <img 
                  :src="project.gif" 
                  :alt="project.name"
                  class="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                />
                <div class="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-2xl"></div>
              </div>

              <!-- Icon + Project Name -->
              <div class="flex items-center gap-3 mb-3">
                <span class="text-xl">{{ project.icon }}</span>
                <h3 class="text-xl font-serif italic text-[var(--color-fg-deep)] group-hover:text-[var(--color-fg-deeper)] transition-colors duration-300">
                  {{ project.name }}
                </h3>
              </div>

              <!-- Short Description (Line Clamp) -->
              <p class="text-sm text-[var(--color-fg-light)] font-light leading-relaxed mb-6 line-clamp-2 h-10">
                {{ project.description }}
              </p>

              <!-- Footer: GitHub + Stars -->
              <div class="flex items-center gap-4 mt-auto">
                <div class="flex items-center gap-1.5 text-[var(--color-fg-lighter)] group-hover:text-[var(--color-fg-light)] transition-colors duration-300">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                  </svg>
                  <span class="text-[10px] uppercase tracking-wider tabular-nums">{{ project.stars.toLocaleString() }}</span>
                </div>
                
                <span class="text-[var(--color-fg-lightest)] text-xs group-hover:translate-x-1 transition-transform duration-300">→</span>
              </div>
            </a>
          </div>

          <!-- Empty State -->
          <div v-if="projects.length === 0" class="py-24 text-center text-[var(--color-fg-light)] font-light italic">
            More projects coming soon.
          </div>
        </div>
  </Transition>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

.content-fade-enter-active {
  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
</style>
