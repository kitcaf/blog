import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubDarkTheme from 'shiki/themes/github-dark.mjs'
import githubLightTheme from 'shiki/themes/github-light.mjs'
import type { HighlighterCore, LanguageRegistration } from 'shiki/types'
import {
  appendClassName,
  ensureProperties,
  isHtmlElementNode,
  isHtmlRootNode,
  normalizeHtmlProperties
} from './hast.js'
import type { HtmlElementNode, HtmlRootNode } from './hast.js'

const LIGHT_THEME = 'github-light'
const DARK_THEME = 'github-dark'
const PLAIN_TEXT_LANGUAGE = 'text'
const LANGUAGE_CLASS_PREFIX = 'language-'
const MARKDOWN_CODE_BLOCK_CLASS = 'markdown-code-block'
const languageNamePattern = /^[a-z0-9_#+.-]+$/

type LanguageLoader = () => Promise<LanguageRegistration[]>

const languageByName = new Map<string, string>()
const languageLoaders: Record<string, LanguageLoader> = {
  bash: () => import('shiki/langs/bash.mjs').then((module) => module.default),
  css: () => import('shiki/langs/css.mjs').then((module) => module.default),
  html: () => import('shiki/langs/html.mjs').then((module) => module.default),
  javascript: () => import('shiki/langs/javascript.mjs').then((module) => module.default),
  json: () => import('shiki/langs/json.mjs').then((module) => module.default),
  jsonc: () => import('shiki/langs/jsonc.mjs').then((module) => module.default),
  jsx: () => import('shiki/langs/jsx.mjs').then((module) => module.default),
  markdown: () => import('shiki/langs/markdown.mjs').then((module) => module.default),
  shellscript: () => import('shiki/langs/shellscript.mjs').then((module) => module.default),
  tsx: () => import('shiki/langs/tsx.mjs').then((module) => module.default),
  typescript: () => import('shiki/langs/typescript.mjs').then((module) => module.default),
  vue: () => import('shiki/langs/vue.mjs').then((module) => module.default),
  yaml: () => import('shiki/langs/yaml.mjs').then((module) => module.default)
}

const languageAliases: Record<string, string> = {
  cjs: 'javascript',
  js: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  plaintext: PLAIN_TEXT_LANGUAGE,
  plain: PLAIN_TEXT_LANGUAGE,
  sh: 'shellscript',
  shell: 'shellscript',
  ts: 'typescript',
  txt: PLAIN_TEXT_LANGUAGE,
  yml: 'yaml',
  zsh: 'shellscript'
}

const loadedLanguages = new Set<string>([PLAIN_TEXT_LANGUAGE])
const warnedLanguages = new Set<string>()

for (const languageName of Object.keys(languageLoaders)) {
  languageByName.set(languageName, languageName)
}

for (const [alias, languageName] of Object.entries(languageAliases)) {
  languageByName.set(alias, languageName)
}

let highlighterPromise: Promise<HighlighterCore> | undefined

export interface HighlightCodeOptions {
  code: string
  language?: string
}

export interface HighlightedCode {
  node: HtmlElementNode
  language?: string
  highlightedLanguage: string
}

export const highlightCode = async ({ code, language }: HighlightCodeOptions): Promise<HighlightedCode> => {
  const highlighter = await getHighlighter()
  const requestedLanguage = normalizeLanguageName(language)
  const highlightedLanguage = await resolveHighlighterLanguage(highlighter, requestedLanguage)

  try {
    return {
      node: createHighlightedCodeNode(highlighter, code, highlightedLanguage, requestedLanguage),
      language: requestedLanguage,
      highlightedLanguage
    }
  } catch (error) {
    if (highlightedLanguage === PLAIN_TEXT_LANGUAGE) {
      throw error
    }

    warnOnce(
      highlightedLanguage,
      `Failed to highlight language "${highlightedLanguage}". Falling back to plain text.`
    )

    return {
      node: createHighlightedCodeNode(highlighter, code, PLAIN_TEXT_LANGUAGE, requestedLanguage),
      language: requestedLanguage,
      highlightedLanguage: PLAIN_TEXT_LANGUAGE
    }
  }
}

const getHighlighter = (): Promise<HighlighterCore> => {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLightTheme, githubDarkTheme],
    langs: [],
    engine: createJavaScriptRegexEngine()
  })

  return highlighterPromise
}

const resolveHighlighterLanguage = async (
  highlighter: HighlighterCore,
  requestedLanguage: string | undefined
): Promise<string> => {
  if (!requestedLanguage) {
    return PLAIN_TEXT_LANGUAGE
  }

  const bundledLanguage = languageByName.get(requestedLanguage)

  if (!bundledLanguage) {
    warnOnce(
      requestedLanguage,
      `Unknown language "${requestedLanguage}". Falling back to plain text.`
    )

    return PLAIN_TEXT_LANGUAGE
  }

  const languageLoader = languageLoaders[bundledLanguage]

  if (!languageLoader) {
    return PLAIN_TEXT_LANGUAGE
  }

  if (!loadedLanguages.has(bundledLanguage)) {
    try {
      await highlighter.loadLanguage(await languageLoader())
      loadedLanguages.add(bundledLanguage)
    } catch {
      warnOnce(
        bundledLanguage,
        `Unable to load language "${bundledLanguage}". Falling back to plain text.`
      )

      return PLAIN_TEXT_LANGUAGE
    }
  }

  return bundledLanguage
}

const createHighlightedCodeNode = (
  highlighter: HighlighterCore,
  code: string,
  language: string,
  requestedLanguage: string | undefined
): HtmlElementNode => {
  const highlightedRoot = highlighter.codeToHast(code, {
    lang: language,
    rootStyle: false,
    themes: {
      light: LIGHT_THEME,
      dark: DARK_THEME
    },
    defaultColor: false,
    mergeSameStyleTokens: true
  }) as HtmlRootNode

  normalizeHtmlProperties(highlightedRoot)

  const preElement = getPreElement(highlightedRoot)

  appendClassName(preElement, MARKDOWN_CODE_BLOCK_CLASS)

  if (requestedLanguage) {
    const properties = ensureProperties(preElement)

    properties.dataLanguage = requestedLanguage
    appendClassName(preElement, `${LANGUAGE_CLASS_PREFIX}${requestedLanguage}`)
  }

  return preElement
}

const getPreElement = (root: HtmlRootNode): HtmlElementNode => {
  if (!isHtmlRootNode(root)) {
    throw new Error('Shiki returned an invalid syntax highlight tree.')
  }

  const preElement = root.children.find((child) => {
    return isHtmlElementNode(child) && child.tagName === 'pre'
  })

  if (!isHtmlElementNode(preElement)) {
    throw new Error('Shiki did not return a code block root element.')
  }

  return preElement
}

const normalizeLanguageName = (language: string | undefined): string | undefined => {
  const languageName = language?.trim().split(/\s+/)[0]?.toLowerCase()

  if (!languageName || !languageNamePattern.test(languageName)) {
    return undefined
  }

  return languageName
}

const warnOnce = (key: string, message: string): void => {
  if (warnedLanguages.has(key)) {
    return
  }

  warnedLanguages.add(key)
  console.warn(`[markdown-renderer] ${message}`)
}
