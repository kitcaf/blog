import { useHead } from '@unhead/vue'
import { toValue, type MaybeRefOrGetter } from 'vue'
import { siteConfig } from '@/config/site'

interface SeoOptions {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  path: MaybeRefOrGetter<string>
  type?: MaybeRefOrGetter<'article' | 'website'>
}

const normalizePath = (path: string) => {
  return path.startsWith('/') ? path : `/${path}`
}

export const getCanonicalUrl = (path: string) => {
  return `${siteConfig.url}${normalizePath(path)}`
}

export const useSeo = (options: SeoOptions) => {
  useHead(() => {
    const title = toValue(options.title)
    const description = toValue(options.description)
    const canonicalUrl = getCanonicalUrl(toValue(options.path))
    const type = toValue(options.type ?? 'website')

    return {
      title,
      meta: [
        { name: 'description', content: description },
        { property: 'og:type', content: type },
        { property: 'og:site_name', content: siteConfig.name },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonicalUrl }
      ],
      link: [
        { rel: 'canonical', href: canonicalUrl }
      ]
    }
  })
}
