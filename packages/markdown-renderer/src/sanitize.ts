import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options as SanitizeOptions } from 'rehype-sanitize'

const languageClassPattern = /^language-[A-Za-z0-9_#+.-]+$/
const shikiTokenStylePattern = /^(?:--shiki-(?:light|dark):#[0-9A-Fa-f]{3,8})(?:;--shiki-(?:light|dark):#[0-9A-Fa-f]{3,8})*$/
const languageNamePattern = /^[a-z0-9_#+.-]+$/

export const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ['target', '_blank'],
      ['rel', 'noreferrer noopener']
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', languageClassPattern]
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      ['className', 'shiki', 'shiki-themes', 'github-light', 'github-dark', 'markdown-code-block', languageClassPattern],
      ['dataLanguage', languageNamePattern],
      ['tabIndex', '0', 0]
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', 'line'],
      ['style', shikiTokenStylePattern]
    ]
  }
} as SanitizeOptions

export const rehypeSafeMarkdownHtml = [
  rehypeSanitize,
  sanitizeSchema
] as const
