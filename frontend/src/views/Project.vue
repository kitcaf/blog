<script setup lang="ts">
import { projects as projectsData } from '@/data/projects'

interface Project {
  id: string
  repo: string
  name: string
  description: string
  stars: number
  forks: number
  language: string | null
  updatedAt: string | null
  repoUrl: string
  homepage: string | null
  topics: string[]
  coverUrl: string
  featured: boolean
  order: number
}

const projects = projectsData as Project[]

const formatCount = (value: number): string => {
  return new Intl.NumberFormat('en', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value)
}

const formatUpdatedDate = (updatedAt: string | null): string => {
  if (!updatedAt) {
    return 'Unknown'
  }

  return updatedAt.slice(0, 10)
}
</script>

<template>
  <Transition name="content-fade" appear>
    <main style="view-transition-name: project-content" class="w-full pb-24">
      <div v-if="projects.length > 0" class="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        <a v-for="project in projects" :key="project.id" :href="project.repoUrl" target="_blank"
          rel="noopener noreferrer" class="group flex min-w-0 flex-col">
          <div
            class="relative mb-5 aspect-[16/9] overflow-hidden rounded-lg border border-[var(--color-fg-lightest)] bg-[var(--color-fg-lightest)]/20">
            <img :src="project.coverUrl" :alt="`${project.name} preview`"
              class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" loading="lazy">
            <div class="absolute inset-0 rounded-lg ring-1 ring-inset ring-black/5"></div>
          </div>

          <div class="mb-3 flex min-w-0 items-start justify-between gap-4">
            <div class="min-w-0">
              <h2
                class="truncate text-xl text-[var(--color-fg-deep)] transition-colors duration-300 group-hover:text-[var(--color-fg-deeper)]">
                {{ project.name }}
              </h2>
              <p class="mt-1 truncate text-xs text-[var(--color-fg-light)]">
                {{ project.repo }}
              </p>
            </div>
            <span v-if="project.language"
              class="shrink-0 rounded-full border border-[var(--color-fg-lightest)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-fg)]">
              {{ project.language }}
            </span>
          </div>

          <p class="mb-5 line-clamp-3 min-h-[4.5rem] text-sm font-light leading-6 text-[var(--color-fg-light)]">
            {{ project.description }}
          </p>

          <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-fg-lighter)]">
            <span class="tabular-nums">{{ formatCount(project.stars) }} stars</span>
            <span class="tabular-nums">{{ formatCount(project.forks) }} forks</span>
            <span>Updated {{ formatUpdatedDate(project.updatedAt) }}</span>
          </div>

          <div v-if="project.topics.length > 0" class="mt-4 flex flex-wrap gap-2">
            <span v-for="topic in project.topics.slice(0, 4)" :key="topic"
              class="rounded-full bg-[var(--color-fg-lightest)]/40 px-2 py-1 text-[10px] text-[var(--color-fg-light)]">
              {{ topic }}
            </span>
          </div>
        </a>
      </div>

      <div v-else class="py-24 text-center text-sm font-light text-[var(--color-fg-light)]">
        More projects coming soon.
      </div>
    </main>
  </Transition>
</template>

<style scoped>
.content-fade-enter-active {
  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
</style>
