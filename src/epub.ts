import JSZip from 'jszip'
import {
  estimateWordsFast,
  type TxtChapterSlice,
} from './txt'

export interface EpubParseResult {
  title: string
  chapters: TxtChapterSlice[]
}

const yieldToMain = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 48 })
      return
    }
    window.setTimeout(resolve, 0)
  })

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/gi, '&')

const htmlToPlainText = (html: string) => {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const withBreaks = withoutNoise
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(
      /<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|nav|aside)>/gi,
      '\n',
    )
    .replace(/<li\b[^>]*>/gi, '· ')
  const stripped = withBreaks.replace(/<[^>]+>/g, '')
  return decodeXmlEntities(stripped)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const dirname = (path: string) => {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '' : path.slice(0, index)
}

const joinPath = (base: string, relative: string) => {
  const cleaned = relative.replace(/\\/g, '/').split('#')[0].trim()
  if (!cleaned) return base
  if (cleaned.startsWith('/')) return cleaned.replace(/^\/+/, '')
  const stack = base ? base.split('/').filter(Boolean) : []
  for (const part of cleaned.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

const findZipEntry = (zip: JSZip, path: string) => {
  const normalized = path.replace(/^\/+/, '')
  const direct = zip.file(normalized)
  if (direct) return direct
  const lower = normalized.toLowerCase()
  const match = Object.keys(zip.files).find(
    (name) => !zip.files[name].dir && name.replace(/^\/+/, '').toLowerCase() === lower,
  )
  return match ? zip.file(match) : null
}

const readZipText = async (zip: JSZip, path: string) => {
  const entry = findZipEntry(zip, path)
  if (!entry) throw new Error(`EPUB 缺少文件：${path}`)
  return entry.async('string')
}

const parseXml = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('EPUB 内部 XML 解析失败')
  return doc
}

const textOf = (node: Element | null | undefined) =>
  decodeXmlEntities((node?.textContent || '').replace(/\s+/g, ' ').trim())

const attr = (node: Element | null | undefined, name: string) =>
  node?.getAttribute(name)?.trim() || ''

const localName = (node: Element) =>
  (node.localName || node.nodeName).toLowerCase()

const queryAll = (root: ParentNode, names: string[]) => {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  return [...root.querySelectorAll('*')].filter((node) =>
    wanted.has(localName(node as Element)),
  ) as Element[]
}

const queryOne = (root: ParentNode, names: string[]) =>
  queryAll(root, names)[0] ?? null

const extractTitleFromHtml = (html: string, fallback: string) => {
  const heading =
    html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    ''
  const cleaned = decodeXmlEntities(heading.replace(/<[^>]+>/g, '')).trim()
  return cleaned || fallback
}

const isLikelyNavOrCover = (mediaType: string, href: string, properties: string) => {
  const lowerHref = href.toLowerCase()
  const props = properties.toLowerCase()
  if (props.includes('nav') || props.includes('cover-image')) return true
  if (mediaType.includes('image')) return true
  if (/nav\.x?html?$/i.test(lowerHref) || /toc\.x?html?$/i.test(lowerHref)) return true
  return false
}

const readNavTitles = async (
  zip: JSZip,
  opfDir: string,
  navHref: string,
): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  try {
    const html = await readZipText(zip, joinPath(opfDir, navHref))
    const doc = parseXml(html.includes('<html') ? html : `<root>${html}</root>`)
    const anchors = [...doc.querySelectorAll('a[href]')]
    for (const anchor of anchors) {
      const href = attr(anchor, 'href')
      if (!href) continue
      const path = joinPath(dirname(joinPath(opfDir, navHref)), href)
      const title = textOf(anchor)
      if (title) map.set(path.toLowerCase(), title)
    }
  } catch {
    // nav 可选，失败时回退到正文标题
  }
  return map
}

const readNcxTitles = async (
  zip: JSZip,
  opfDir: string,
  ncxHref: string,
): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  try {
    const xml = await readZipText(zip, joinPath(opfDir, ncxHref))
    const doc = parseXml(xml)
    const points = queryAll(doc, ['navPoint', 'navpoint'])
    for (const point of points) {
      const label = textOf(queryOne(point, ['text']))
      const src = attr(queryOne(point, ['content']), 'src')
      if (!label || !src) continue
      const path = joinPath(opfDir, src)
      map.set(path.toLowerCase(), label)
    }
  } catch {
    // NCX 可选
  }
  return map
}

/**
 * 解析本地 EPUB：按 spine 阅读顺序抽出纯文本章节。
 */
export const parseEpubFile = async (
  file: File,
  options?: {
    signal?: AbortSignal
    onProgress?: (ratio: number) => void
  },
): Promise<EpubParseResult> => {
  const { signal, onProgress } = options ?? {}
  assertNotAborted(signal)
  onProgress?.(0.02)

  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  assertNotAborted(signal)
  onProgress?.(0.08)

  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  const container = parseXml(containerXml)
  const rootfile = queryOne(container, ['rootfile'])
  const opfPath = attr(rootfile, 'full-path')
  if (!opfPath) throw new Error('EPUB 缺少 OPF 路径（container.xml）')

  const opfXml = await readZipText(zip, opfPath)
  const opf = parseXml(opfXml)
  const opfDir = dirname(opfPath)
  onProgress?.(0.14)

  const metadata = queryOne(opf, ['metadata'])
  const bookTitle =
    textOf(queryOne(metadata ?? opf, ['title'])) ||
    file.name.replace(/\.epub$/i, '').trim() ||
    '导入小说'

  const manifestItems = queryAll(opf, ['item'])
  const manifest = new Map<
    string,
    { href: string; mediaType: string; properties: string }
  >()
  let navHref = ''
  let ncxHref = ''
  for (const item of manifestItems) {
    const id = attr(item, 'id')
    const href = attr(item, 'href')
    const mediaType = attr(item, 'media-type')
    const properties = attr(item, 'properties')
    if (!id || !href) continue
    manifest.set(id, { href, mediaType, properties })
    if (properties.toLowerCase().includes('nav')) navHref = href
    if (mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(href)) {
      ncxHref = href
    }
  }

  const spineRefs = queryAll(queryOne(opf, ['spine']) ?? opf, ['itemref'])
    .map((item) => attr(item, 'idref'))
    .filter(Boolean)

  if (!spineRefs.length) throw new Error('EPUB 缺少阅读顺序（spine）')

  const titleByPath = new Map<string, string>()
  if (navHref) {
    const navTitles = await readNavTitles(zip, opfDir, navHref)
    navTitles.forEach((value, key) => titleByPath.set(key, value))
  }
  if (ncxHref) {
    const ncxTitles = await readNcxTitles(zip, opfDir, ncxHref)
    ncxTitles.forEach((value, key) => {
      if (!titleByPath.has(key)) titleByPath.set(key, value)
    })
  }

  const chapters: TxtChapterSlice[] = []
  const total = spineRefs.length
  for (let index = 0; index < spineRefs.length; index += 1) {
    assertNotAborted(signal)
    const idref = spineRefs[index]
    const item = manifest.get(idref)
    if (!item) continue

    const mediaType = (item.mediaType || '').toLowerCase()
    const isHtml =
      mediaType.includes('html') ||
      mediaType.includes('xml') ||
      /\.x?html?$/i.test(item.href)
    if (!isHtml) continue
    if (isLikelyNavOrCover(mediaType, item.href, item.properties) && total > 2) {
      continue
    }

    const fullPath = joinPath(opfDir, item.href)
    let html = ''
    try {
      html = await readZipText(zip, fullPath)
    } catch {
      continue
    }

    const content = htmlToPlainText(html)
    if (!content || content.length < 8) continue

    // 跳过几乎只有“目录/contents”字样的导航页
    if (
      content.length < 120 &&
      /^(目录|contents|table of contents|cover|封面)/i.test(content)
    ) {
      continue
    }

    const pathKey = fullPath.toLowerCase()
    const pathKeyNoHash = pathKey.split('#')[0]
    const titled =
      titleByPath.get(pathKey) ||
      titleByPath.get(pathKeyNoHash) ||
      extractTitleFromHtml(html, `第${chapters.length + 1}章`)

    chapters.push({
      title: titled,
      content,
      words: estimateWordsFast(content),
    })

    onProgress?.(0.14 + (0.84 * (index + 1)) / total)
    if (index % 4 === 3) await yieldToMain()
  }

  if (!chapters.length) throw new Error('未从 EPUB 中解析到可用章节正文')

  onProgress?.(1)
  return { title: bookTitle, chapters }
}

export const isEpubFileName = (fileName: string) =>
  /\.epub$/i.test(fileName.trim())

export const isTxtFileName = (fileName: string) =>
  /\.txt$/i.test(fileName.trim()) || !fileName.includes('.')
