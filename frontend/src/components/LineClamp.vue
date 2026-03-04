<script setup lang="ts">
/**
 * LineClamp — 多行截断组件
 *
 * Props
 *   lines   : number — 最多显示几行，超出显示省略号（默认 2）
 *   tag     : string — 渲染的 HTML 标签（默认 'span'）
 *
 * 直接透传所有 class / style / attrs 给根元素，
 * 使用者只需套上这个组件，无需重复写截断 CSS。
 */
withDefaults(
  defineProps<{
    lines?: number
    tag?: string
  }>(),
  {
    lines: 2,
    tag: 'span',
  }
)
</script>

<template>
  <component
    :is="tag"
    class="line-clamp-root"
    :style="{
      '--lc-lines': lines,
      display: '-webkit-box',
      '-webkit-line-clamp': lines,
      '-webkit-box-orient': 'vertical',
      overflow: 'hidden',
    }"
  >
    <slot />
  </component>
</template>

<style scoped>
.line-clamp-root {
  /* 标准属性（Chrome 114+ / Firefox 68+ 已支持） */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  -webkit-line-clamp: var(--lc-lines, 2);
  line-clamp: var(--lc-lines, 2);
  /* 保留必要的换行行为 */
  word-break: break-word;
}
</style>
