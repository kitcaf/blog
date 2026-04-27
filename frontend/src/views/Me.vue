<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  contributionCalendar,
  profile,
  type ContributionDay
} from '@/data/profile'

const TYPEWRITER_DELAY_MS = 400
const TYPEWRITER_SPEED_MS = 36
const CONTRIBUTION_LEVEL_COUNT = 4
const MAX_CONTRIBUTION_ANIMATION_DELAY_MS = 420

const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short' })
const updatedAtFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric'
})

const displayText = ref(profile.fullText)
const isComplete = ref(true)
const typewriterTimer = ref<ReturnType<typeof setInterval> | null>(null)
const startTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const contributionWeeks = computed(() => contributionCalendar.weeks ?? [])
const hasContributionData = computed(() => contributionWeeks.value.length > 0)
const contributionDays = computed(() => {
  return contributionWeeks.value.flatMap((week) => week.contributionDays)
})
const activeContributionDays = computed(() => {
  return contributionDays.value.filter((day) => day.contributionCount > 0).length
})
const maxContributionCount = computed(() => {
  return Math.max(0, ...contributionDays.value.map((day) => day.contributionCount))
})

const updatedAtLabel = computed(() => {
  if (!contributionCalendar.updatedAt) {
    return 'Not synced yet'
  }

  const updatedAt = new Date(contributionCalendar.updatedAt)

  if (Number.isNaN(updatedAt.getTime())) {
    return 'Recently synced'
  }

  return `Updated ${updatedAtFormatter.format(updatedAt)}`
})

const contributionMonths = computed(() => {
  const monthStarts: Array<{
    key: string
    label: string
    weekIndex: number
  }> = []

  contributionWeeks.value.forEach((week, weekIndex) => {
    const firstDay = week.contributionDays[0]

    if (!firstDay) {
      return
    }

    const date = new Date(`${firstDay.date}T00:00:00`)

    if (Number.isNaN(date.getTime())) {
      return
    }

    const key = `${date.getFullYear()}-${date.getMonth()}`
    const previousMonth = monthStarts[monthStarts.length - 1]

    if (previousMonth?.key === key) {
      return
    }

    monthStarts.push({
      key,
      label: monthFormatter.format(date),
      weekIndex
    })
  })

  return monthStarts.map((month, index) => {
    const nextMonth = monthStarts[index + 1]

    return {
      ...month,
      span: (nextMonth?.weekIndex ?? contributionWeeks.value.length) - month.weekIndex
    }
  })
})

const formatContributionTitle = (day: ContributionDay): string => {
  const label = day.contributionCount === 1 ? 'contribution' : 'contributions'
  return `${day.date}: ${day.contributionCount} ${label}`
}

const getContributionLevel = (count: number): number => {
  if (count <= 0) {
    return 0
  }

  const maxCount = maxContributionCount.value

  if (maxCount <= 0) {
    return 0
  }

  const relativeLevel = Math.ceil((count / maxCount) * CONTRIBUTION_LEVEL_COUNT)
  return Math.min(CONTRIBUTION_LEVEL_COUNT, Math.max(1, relativeLevel))
}

const getContributionAnimationDelay = (weekIndex: number): string => {
  const delay = Math.min(weekIndex * 8, MAX_CONTRIBUTION_ANIMATION_DELAY_MS)
  return `${delay}ms`
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
  <main class="me-page w-full pb-24 animate-in fade-in duration-1000">
    <section class="mx-auto max-w-4xl border-b border-[var(--color-fg-lightest)] pb-14 text-center">
      <h1 class="mx-auto max-w-4xl text-3xl leading-relaxed text-[var(--color-fg-deep)] md:text-4xl">
        {{ displayText }}
        <span
          class="ml-1 inline-block h-[1.2em] w-[2px] align-middle bg-[var(--color-fg-lightest)] transition-opacity duration-100"
          :class="{ 'animate-pulse': isComplete, 'opacity-100': !isComplete }"
        ></span>
      </h1>

      <p class="mx-auto mt-6 max-w-xl text-sm font-light leading-6 text-[var(--color-fg-light)]">
        {{ profile.bio }}
      </p>

      <div class="mt-7 flex flex-wrap justify-center gap-3">
        <a
          v-for="link in profile.links"
          :key="link.url"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-[var(--color-fg-deep)] underline decoration-[var(--color-fg-lightest)] underline-offset-4 transition-colors hover:text-[var(--color-fg-deeper)] hover:decoration-[var(--color-fg)]"
        >
          {{ link.label }}
        </a>
      </div>
    </section>

    <section class="contribution-section mx-auto pt-12">
      <div class="contribution-heading">
        <p class="contribution-kicker">
          Activity
        </p>
        <h2 class="text-2xl text-[var(--color-fg-deep)]">
          GitHub Contributions
        </h2>
        <p class="mt-2 text-sm font-light leading-6 text-[var(--color-fg-light)]">
          A year of small commits, experiments, and finished edges.
        </p>
      </div>

      <dl class="contribution-summary" aria-label="GitHub contribution summary">
        <div>
          <dt>Total</dt>
          <dd>{{ contributionCalendar.totalContributions.toLocaleString() }}</dd>
        </div>
        <div>
          <dt>Active days</dt>
          <dd>{{ activeContributionDays }}</dd>
        </div>
        <div>
          <dt>Peak day</dt>
          <dd>{{ maxContributionCount }}</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>{{ updatedAtLabel }}</dd>
        </div>
      </dl>

      <div v-if="hasContributionData" class="contribution-viewport">
        <div
          class="contribution-chart"
          aria-label="GitHub contribution calendar"
          :style="{ '--week-count': String(contributionWeeks.length) }"
        >
          <div class="contribution-months" aria-hidden="true">
            <span
              v-for="month in contributionMonths"
              :key="month.key"
              :style="{ gridColumn: `${month.weekIndex + 1} / span ${month.span}` }"
            >
              {{ month.label }}
            </span>
          </div>

          <div class="contribution-weeks">
            <div
              v-for="(week, weekIndex) in contributionWeeks"
              :key="weekIndex"
              class="contribution-week"
              :style="{ '--week-delay': getContributionAnimationDelay(weekIndex) }"
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

          <div class="contribution-legend" aria-hidden="true">
            <span>Less</span>
            <span class="legend-dot" data-level="0"></span>
            <span class="legend-dot" data-level="1"></span>
            <span class="legend-dot" data-level="2"></span>
            <span class="legend-dot" data-level="3"></span>
            <span class="legend-dot" data-level="4"></span>
            <span>More</span>
          </div>
        </div>
      </div>

      <div v-else class="contribution-empty">
        Contribution data is unavailable right now.
      </div>
    </section>
  </main>
</template>

<style scoped>
.me-page {
  --contribution-cell-width: 10px;
  --contribution-row-height: 14px;
  --contribution-gap: 4px;
  --activity-empty: rgb(238 238 238 / 0.9);
  --activity-level-1: #d8d8d8;
  --activity-level-2: #a9a9a9;
  --activity-level-3: #6f6f6f;
  --activity-level-4: #171717;
  --activity-ring: rgb(0 0 0 / 0.05);
}

:global(.dark) .me-page {
  --activity-empty: rgb(255 255 255 / 0.06);
  --activity-level-1: #3f3f46;
  --activity-level-2: #71717a;
  --activity-level-3: #d4d4d8;
  --activity-level-4: #ffffff;
  --activity-ring: rgb(255 255 255 / 0.06);
}

.contribution-section {
  width: min(100%, 68rem);
}

.contribution-heading {
  text-align: center;
}

.contribution-kicker {
  margin-bottom: 0.65rem;
  color: var(--color-fg-light);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.contribution-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 2rem auto 2.25rem;
  max-width: 45rem;
  border-top: 1px solid var(--color-fg-lightest);
  border-bottom: 1px solid var(--color-fg-lightest);
}

.contribution-summary div {
  padding: 1rem 0.75rem;
  text-align: center;
}

.contribution-summary dt {
  color: var(--color-fg-light);
  font-size: 0.72rem;
}

.contribution-summary dd {
  margin-top: 0.35rem;
  color: var(--color-fg-deep);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.contribution-viewport {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  padding: 0 0 0.5rem;
}

.contribution-chart {
  width: max-content;
  min-width: max-content;
}

.contribution-months {
  display: grid;
  grid-template-columns: repeat(var(--week-count), var(--contribution-cell-width));
  column-gap: var(--contribution-gap);
  margin-bottom: 0.75rem;
  color: var(--color-fg-lighter);
  font-size: 0.68rem;
}

.contribution-months span {
  overflow: hidden;
  white-space: nowrap;
}

.contribution-weeks {
  display: flex;
  gap: var(--contribution-gap);
  align-items: center;
}

.contribution-week {
  display: grid;
  grid-template-rows: repeat(7, var(--contribution-row-height));
  gap: var(--contribution-gap);
  align-items: center;
}

.contribution-day,
.legend-dot {
  width: var(--contribution-cell-width);
  border-radius: 999px;
  background: var(--activity-empty);
  box-shadow: inset 0 0 0 1px var(--activity-ring);
}

.contribution-day {
  height: var(--activity-height, 8px);
  justify-self: center;
  opacity: 0;
  transform: translateY(4px);
  animation: contribution-rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  animation-delay: var(--week-delay);
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease,
    transform 180ms ease;
}

.contribution-day:hover {
  box-shadow: inset 0 0 0 1px var(--activity-ring), 0 8px 18px rgb(0 0 0 / 0.12);
  transform: translateY(-2px) scale(1.12);
}

.contribution-day[data-level="0"],
.legend-dot[data-level="0"] {
  --activity-height: 8px;
  background: var(--activity-empty);
}

.contribution-day[data-level="1"],
.legend-dot[data-level="1"] {
  --activity-height: 9px;
  background: var(--activity-level-1);
}

.contribution-day[data-level="2"],
.legend-dot[data-level="2"] {
  --activity-height: 11px;
  background: var(--activity-level-2);
}

.contribution-day[data-level="3"],
.legend-dot[data-level="3"] {
  --activity-height: 13px;
  background: var(--activity-level-3);
}

.contribution-day[data-level="4"],
.legend-dot[data-level="4"] {
  --activity-height: 14px;
  background: var(--activity-level-4);
}

.contribution-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.38rem;
  margin-top: 1rem;
  color: var(--color-fg-lighter);
  font-size: 0.72rem;
}

.legend-dot {
  height: 8px;
}

.legend-dot[data-level="1"] {
  height: 9px;
}

.legend-dot[data-level="2"] {
  height: 10px;
}

.legend-dot[data-level="3"] {
  height: 11px;
}

.legend-dot[data-level="4"] {
  height: 12px;
}

.contribution-empty {
  border-top: 1px solid var(--color-fg-lightest);
  padding: 2rem 0;
  text-align: center;
  color: var(--color-fg-light);
  font-size: 0.875rem;
  font-weight: 300;
}

@keyframes contribution-rise {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

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

@media (max-width: 900px) {
  .contribution-viewport {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .contribution-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .contribution-day {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
</style>
