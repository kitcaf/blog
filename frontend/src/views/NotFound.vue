<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
    <div class="text-center">
      <h1 class="text-9xl font-bold text-gray-300 dark:text-gray-700">404</h1>
      <p class="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">页面未找到</p>
      <p class="mt-2 text-gray-600 dark:text-gray-400">抱歉，您访问的页面不存在</p>
      <button
        @click="goHome"
        class="mt-8 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
      >
        返回首页
      </button>
    </div>
  </div>
</template>
