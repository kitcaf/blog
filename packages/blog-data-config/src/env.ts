/**
 * 读入上下文配置
 * 方式一：自建服务器
 * 方式二：GitHub Actions
 * 都可以读到上下文的配置变量
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BlogDataEnv } from './types.js'

const DEFAULT_ENV_FILES = ['.env', '.env.local']
const envAssignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/

const stripInlineComment = (value: string): string => {
  const trimmedValue = value.trim()

  if (trimmedValue.startsWith('"') || trimmedValue.startsWith("'")) {
    return trimmedValue
  }

  const commentIndex = trimmedValue.indexOf(' #')
  return commentIndex === -1 ? trimmedValue : trimmedValue.slice(0, commentIndex).trimEnd()
}

const unquoteEnvValue = (value: string): string => {
  const strippedValue = stripInlineComment(value)
  const firstCharacter = strippedValue.at(0)
  const lastCharacter = strippedValue.at(-1)

  if (
    strippedValue.length >= 2 &&
    ((firstCharacter === '"' && lastCharacter === '"') ||
      (firstCharacter === "'" && lastCharacter === "'"))
  ) {
    return strippedValue.slice(1, -1)
  }

  return strippedValue
}

const parseEnvFile = (filePath: string): Record<string, string> => {
  const parsedEnv: Record<string, string> = {}
  const fileContent = readFileSync(filePath, 'utf8')

  for (const line of fileContent.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue
    }

    const match = envAssignmentPattern.exec(line)
    if (!match) {
      continue
    }

    const [, key, value] = match
    if (!key || value === undefined) {
      continue
    }

    parsedEnv[key] = unquoteEnvValue(value)
  }

  return parsedEnv
}

export const readBlogDataEnv = (rootDir: string): BlogDataEnv => {
  const fileEnv: Record<string, string> = {}

  for (const relativeEnvPath of DEFAULT_ENV_FILES) {
    const absoluteEnvPath = path.resolve(rootDir, relativeEnvPath)

    if (existsSync(absoluteEnvPath)) {
      Object.assign(fileEnv, parseEnvFile(absoluteEnvPath))
    }
  }

  return { ...fileEnv, ...process.env }
}
