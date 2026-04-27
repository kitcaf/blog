<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  contributionCalendar,
  profile,
  type ContributionDay
} from '@/data/profile'

const TYPEWRITER_DELAY_MS = 400
const TYPEWRITER_SPEED_MS = 36
const CONTRIBUTION_LEVEL_THRESHOLDS = [4, 8, 12] as const

const displayText = ref(profile.fullText)
const isComplete = ref(true)
const typewriterTimer = ref<ReturnType<typeof setInterval> | null>(null)
const startTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const contributionWeeks = computed(() => contributionCalendar.weeks ?? [])
const hasContributionData = computed(() => contributionWeeks.value.length > 0)

const formatContributionTitle = (day: ContributionDay): string => {
  const label = day.contributionCount === 1 ? 'contribution' : 'contributions'
  return `${day.date}: ${day.contributionCount} ${label}`
}

const getContributionLevel = (count: number): number => {
  if (count <= 0) {
    return 0
  }

  const thresholdIndex = CONTRIBUTION_LEVEL_THRESHOLDS.findIndex((threshold) => count < threshold)
  return thresholdIndex === -1 ? 4 : thresholdIndex + 1
}

const clearTypewriterTimers = (): void => {
  if (typewriterTimer.value) {
    clearInterval(typewriterTimer.value)
    typewriterTimer.value = null
  }

  if (startTimer.value) {
    clearTimeout(startTimer.value)
    startTimer.value = null
  }
}

const typeWriter = (text: string): void => {
  let nextCharacterIndex = 0
  displayText.value = ''
  isComplete.value = false

  typewriterTimer.value = setInterval(() => {
    if (nextCharacterIndex >= text.length) {
      clearTypewriterTimers()
      isComplete.value = true
      return
    }

    displayText.value += text.charAt(nextCharacterIndex)
    nextCharacterIndex += 1
  }, TYPEWRITER_SPEED_MS)
}

onMounted(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    return
  }

  startTimer.value = setTimeout(() => {
    typeWriter(profile.fullText)
  }, TYPEWRITER_DELAY_MS)
})

onBeforeUnmount(clearTypewriterTimers)
</script>

<template>
  <main class="w-full pb-24 animate-in fade-in duration-1000">
    <section class="mx-auto max-w-3xl border-b border-[var(--color-fg-lightest)] pb-12 text-center">
      <h1 class="text-3xl leading-relaxed text-[var(--color-fg-deep)] md:text-4xl">
        {{ displayText }}
        <span
          class="ml-1 inline-block h-[1.2em] w-[2px] align-middle bg-[var(--color-fg-lightest)] transition-opacity duration-100"
          :class="{ 'animate-pulse': isComplete, 'opacity-100': !isComplete }"
        ></span>
      </h1>

      <p class="mx-auto mt-6 max-w-xl text-sm font-light leading-6 text-[var(--color-fg-light)]">
        {{ profile.bio }}
      </p>

      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <a
          v-for="link in profile.links"
          :key="link.url"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-[var(--color-fg-deep)] underline decoration-[var(--color-fg-lightest)] underline-offset-4 transition-colors hover:text-[var(--color-fg-deeper)]"
        >
          {{ link.label }}
        </a>
      </div>
    </section>

    <section class="mx-auto max-w-3xl pt-10">
      <div class="mb-6 text-center">
        <div>
          <h2 class="text-lg text-[var(--color-fg-deep)]">
            GitHub Contributions
          </h2>
          <p class="mt-1 text-sm text-[var(--color-fg-light)]">
            {{ contributionCalendar.totalContributions.toLocaleString() }} contributions in the last year
          </p>
        </div>
      </div>

      <div v-if="hasContributionData" class="overflow-x-auto pb-2">
        <div class="contribution-weeks" aria-label="GitHub contribution calendar">
          <div
            v-for="(week, weekIndex) in contributionWeeks"
            :key="weekIndex"
            class="contribution-week"
          >
            <span
              v-for="day in week.contributionDays"
              :key="day.date"
              class="contribution-day"
              :data-level="getContributionLevel(day.contributionCount)"
              :title="formatContributionTitle(day)"
            ></span>
          </div>
        </div>
      </div>

      <div v-else class="border-t border-[var(--color-fg-lightest)] py-8 text-sm font-light text-[var(--color-fg-light)]">
        Contribution data is unavailable right now.
      </div>
    </section>
  </main>
</template>

<style scoped>
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

.animate-pulse {
  animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.contribution-weeks {
  display: flex;
  min-width: max-content;
  gap: 3px;
}

.contribution-week {
  display: grid;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
}

.contribution-day {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--color-fg-lightest);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.04);
}

.contribution-day[data-level="1"] {
  background: #9be9a8;
}

.contribution-day[data-level="2"] {
  background: #40c463;
}

.contribution-day[data-level="3"] {
  background: #30a14e;
}

.contribution-day[data-level="4"] {
  background: #216e39;
}

:global(.dark) .contribution-day {
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.05);
}
</style>
