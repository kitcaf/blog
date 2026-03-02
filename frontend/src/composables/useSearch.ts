import { ref } from 'vue'
import { useRouter } from 'vue-router'

export function useSearch() {
  const router = useRouter()
  const query = ref('')
  const isSearching = ref(false)

  const handleSearch = async () => {
    if (!query.value.trim()) {
      return
    }

    isSearching.value = true

    try {
      // 跳转到搜索结果页面
      await router.push({
        path: '/search',
        query: { q: query.value }
      })
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      isSearching.value = false
    }
  }

  const clearSearch = () => {
    query.value = ''
  }

  return {
    query,
    isSearching,
    handleSearch,
    clearSearch
  }
}
