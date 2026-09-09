import { createChapter, createProject, now } from './data'
import type { NovelProject } from './types'

export interface TxtChapterSlice {
  title: string
  content: string
  /** 预览 / targetWords 的快速估算；大书避免沉重正则。 */
  words?: number
}

/** 软提醒阈值（约 2MB）。 */
export const TXT_WARN_BYTES = 2 * 1024 * 1024
/** 强提醒阈值（约 8MB）。 */
export const TXT_HEAVY_BYTES = 8 * 1024 * 1024
/** 超过此大小需显式确认（约 15MB）。 */
export const TXT_CONFIRM_BYTES = 15 * 1024 * 1024

/** 常见中英文章节标题（行首）。 */
const CHAPTER_HEADING =
  /^(?:第\s*[0-9０-９一二三四五六七八九十百千万两零〇]+\s*[章节回部卷集]|Chapter\s+[0-9]+|CHAPTER\s+[0-9]+)(?:\s*[：:\-—–·.、]?\s*(.*))?$/u

const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

const yieldToMain = () => new Promise<void>((resolve) => {
  if (typeof requestIdleCallback === 'function') {
    const idle = requestIdleCallback(() => resolve(), { timeout: 48 })
    void idle
    return
  }
  window.setTimeout(resolve, 0)
})

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** 非空白字符长度——对中文网文够用，且远轻于正则字数统计。 */
export const estimateWordsFast = (text: string) => {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code > 32 && code !== 0x3000 && code !== 9 && code !== 10 && code !== 13) count += 1
  }
  return count
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const describeTxtFileRisk = (bytes: number) => {
  if (bytes >= TXT_CONFIRM_BYTES) {
    return {
      level: 'confirm' as const,
      message: `文件约 ${formatBytes(bytes)}，导入可能占用较多内存并短暂卡顿，建议确认后继续。`,
    }
  }
  if (bytes >= TXT_HEAVY_BYTES) {
    return {
      level: 'heavy' as const,
      message: `文件约 ${formatBytes(bytes)}，分章与保存可能需要几秒，请稍候。`,
    }
  }
  if (bytes >= TXT_WARN_BYTES) {
    return {
      level: 'warn' as const,
      message: `文件约 ${formatBytes(bytes)}，将异步分章以避免界面卡住。`,
    }
  }
  return {
    level: 'ok' as const,
    message: `文件约 ${formatBytes(bytes)}`,
  }
}

export const titleFromFileName = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '导入小说'

const finalizeChapters = (
  text: string,
  chapters: TxtChapterSlice[],
  foundHeading: boolean,
): TxtChapterSlice[] => {
  if (!foundHeading) {
    const content = text.trim()
    return content ? [{ title: '第1章', content, words: estimateWordsFast(content) }] : []
  }
  return chapters.filter((chapter) => chapter.title.trim() || chapter.content.trim())
}

export const splitTxtIntoChapters = (raw: string): TxtChapterSlice[] => {
  const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')
  const chapters: TxtChapterSlice[] = []
  let currentTitle = ''
  let buffer: string[] = []
  let foundHeading = false

  const flush = () => {
    const content = buffer.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
    if (!currentTitle && !content.trim()) {
      buffer = []
      return
    }
    chapters.push({
      title: currentTitle || `第${chapters.length + 1}章`,
      content,
      words: estimateWordsFast(content),
    })
    buffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed ? trimmed.match(CHAPTER_HEADING) : null
    if (match) {
      foundHeading = true
      flush()
      currentTitle = trimmed
      continue
    }
    buffer.push(line)
  }
  flush()

  return finalizeChapters(text, chapters, foundHeading)
}

/** 分块分章，并向主线程让出，避免大书卡死界面。 */
export const splitTxtIntoChaptersAsync = async (
  raw: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (ratio: number) => void
    chunkLines?: number
  },
): Promise<TxtChapterSlice[]> => {
  const { signal, onProgress, chunkLines = 2500 } = options ?? {}
  assertNotAborted(signal)

  const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  await yieldToMain()
  assertNotAborted(signal)

  const lines = text.split('\n')
  const chapters: TxtChapterSlice[] = []
  let currentTitle = ''
  let buffer: string[] = []
  let foundHeading = false
  let index = 0

  const flush = () => {
    const content = buffer.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
    if (!currentTitle && !content.trim()) {
      buffer = []
      return
    }
    chapters.push({
      title: currentTitle || `第${chapters.length + 1}章`,
      content,
      words: estimateWordsFast(content),
    })
    buffer = []
  }

  while (index < lines.length) {
    assertNotAborted(signal)
    const end = Math.min(index + chunkLines, lines.length)
    for (; index < end; index += 1) {
      const line = lines[index]
      const trimmed = line.trim()
      const match = trimmed ? trimmed.match(CHAPTER_HEADING) : null
      if (match) {
        foundHeading = true
        flush()
        currentTitle = trimmed
        continue
      }
      buffer.push(line)
    }
    onProgress?.(lines.length ? index / lines.length : 1)
    if (index < lines.length) await yieldToMain()
  }

  flush()
  onProgress?.(1)
  return finalizeChapters(text, chapters, foundHeading)
}

export const mergeChaptersToTxt = (project: NovelProject) =>
  project.chapters
    .map((chapter) => {
      const title = chapter.title.trim() || '未命名章节'
      const body = chapter.content.replace(/^\n+/, '').replace(/\n+$/, '')
      return body ? `${title}\n\n${body}` : title
    })
    .join('\n\n')

export const exportProjectAsTxt = (project: NovelProject) => {
  const blob = new Blob([mergeChaptersToTxt(project)], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `${project.title || '小说'}.txt`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
}

export const readTxtFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return new TextDecoder('utf-8').decode(buffer)
    }
  }
}

export const summarizeTxtChapters = (chapters: TxtChapterSlice[]) => ({
  chapterCount: chapters.length,
  totalWords: chapters.reduce((sum, chapter) => sum + (chapter.words ?? estimateWordsFast(chapter.content)), 0),
})

export const createProjectFromTxt = (
  title: string,
  chapters: TxtChapterSlice[],
  genre = '导入',
): NovelProject => {
  const timestamp = now()
  const project = createProject(title.trim() || '导入小说', genre.trim() || '导入', `从本地导入，共 ${chapters.length} 章`)
  const mapped = chapters.map((chapter, index) => {
    const words = chapter.words ?? estimateWordsFast(chapter.content)
    return {
      ...createChapter(index + 1),
      title: chapter.title.trim() || `第${index + 1}章`,
      content: chapter.content,
      targetWords: Math.max(words, 2500),
      status: (words > 0 ? 'done' : 'draft') as NovelProject['chapters'][number]['status'],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  project.chapters = mapped.length ? mapped : [createChapter(1)]
  project.updatedAt = timestamp
  project.origin = 'imported'
  return project
}

/** 分块构建项目，确认超大导入时不冻结标签页。 */
export const createProjectFromTxtAsync = async (
  title: string,
  chapters: TxtChapterSlice[],
  genre = '导入',
  options?: { signal?: AbortSignal; onProgress?: (ratio: number) => void },
): Promise<NovelProject> => {
  const { signal, onProgress } = options ?? {}
  assertNotAborted(signal)
  const timestamp = now()
  const project = createProject(title.trim() || '导入小说', genre.trim() || '导入', `从本地导入，共 ${chapters.length} 章`)
  if (!chapters.length) {
    project.chapters = [createChapter(1)]
    project.updatedAt = timestamp
    project.origin = 'imported'
    onProgress?.(1)
    return project
  }

  const mapped: NovelProject['chapters'] = []
  const batch = 24
  for (let index = 0; index < chapters.length; index += batch) {
    assertNotAborted(signal)
    const slice = chapters.slice(index, index + batch)
    for (const [offset, chapter] of slice.entries()) {
      const words = chapter.words ?? estimateWordsFast(chapter.content)
      mapped.push({
        ...createChapter(index + offset + 1),
        title: chapter.title.trim() || `第${index + offset + 1}章`,
        content: chapter.content,
        targetWords: Math.max(words, 2500),
        status: words > 0 ? 'done' : 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    onProgress?.(mapped.length / chapters.length)
    if (index + batch < chapters.length) await yieldToMain()
  }

  project.chapters = mapped
  project.updatedAt = timestamp
  project.origin = 'imported'
  onProgress?.(1)
  return project
}

export interface LoreSampleChapter {
  title: string
  content: string
}

const clipText = (text: string, max: number) => {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

/**
 * AI 设定提炼用的省 Token 抽样：
 * 完整目录 + 开篇若干章 + 稀疏中段 + 结尾。
 */
export const buildImportLoreSample = (
  chapters: LoreSampleChapter[],
  options?: { maxChars?: number; headChapters?: number; excerptChars?: number },
) => {
  const maxChars = options?.maxChars ?? 14000
  const headChapters = options?.headChapters ?? 3
  const excerptChars = options?.excerptChars ?? 2200
  const sparseExcerpt = Math.min(1200, excerptChars)

  const lines: string[] = []
  lines.push(`【目录 · 共 ${chapters.length} 章】`)
  chapters.forEach((chapter, index) => {
    lines.push(`${index + 1}. ${chapter.title.trim() || `第${index + 1}章`}`)
  })

  const picked = new Set<number>()
  const pushExcerpt = (index: number, budget: number, label: string) => {
    if (index < 0 || index >= chapters.length || picked.has(index)) return
    picked.add(index)
    const chapter = chapters[index]
    lines.push(`\n【${label} · 第${index + 1}章 ${chapter.title.trim() || ''}】`)
    lines.push(clipText(chapter.content, budget))
  }

  for (let index = 0; index < Math.min(headChapters, chapters.length); index += 1) {
    pushExcerpt(index, excerptChars, '开篇抽样')
  }

  if (chapters.length > headChapters + 1) {
    const stride = Math.max(4, Math.ceil(chapters.length / 8))
    for (let index = headChapters; index < chapters.length - 1; index += stride) {
      pushExcerpt(index, sparseExcerpt, '中段抽样')
    }
    pushExcerpt(chapters.length - 1, Math.min(1600, excerptChars), '结尾抽样')
  }

  let sample = lines.join('\n')
  if (sample.length > maxChars) {
    sample = `${sample.slice(0, maxChars)}\n…【抽样已截断，以控制 Token】`
  }

  return {
    sample,
    sampledChapterIndexes: [...picked].sort((a, b) => a - b),
    charCount: sample.length,
  }
}

export interface SelectedChapterForLore {
  index: number
  title: string
  content: string
}

/**
 * 按用户勾选章节构建抽样，供设定/工具箱使用。
 * 单章截断以控制 Token，同时尽量保持章节完整感。
 */
export const buildSelectedChaptersSample = (
  chapters: SelectedChapterForLore[],
  options?: {
    maxChars?: number
    perChapterChars?: number
    maxChapters?: number
    label?: string
  },
) => {
  const maxChapters = options?.maxChapters ?? 3
  const selected = chapters.slice(0, maxChapters)
  const maxChars = options?.maxChars ?? 22000
  const perChapterChars = options?.perChapterChars ?? 8000
  const lines: string[] = [
    options?.label ??
      `【指定章节 · 共 ${selected.length} 章，用于补充设定】`,
  ]

  for (const chapter of selected) {
    const title = chapter.title.trim() || `第${chapter.index + 1}章`
    lines.push(`\n【第${chapter.index + 1}章 ${title}】`)
    lines.push(clipText(chapter.content, perChapterChars))
  }

  let sample = lines.join('\n')
  if (sample.length > maxChars) {
    sample = `${sample.slice(0, maxChars)}\n…【抽样已截断，以控制 Token】`
  }

  return {
    sample,
    sampledChapterIndexes: selected.map((item) => item.index),
    charCount: sample.length,
  }
}
