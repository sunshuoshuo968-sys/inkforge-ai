import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeBookChapters,
  pickBookFiles,
  type BookChapters,
  type TxtChapterSlice,
} from '../txt'

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })

const chapter = (title: string, content = '正文'): TxtChapterSlice => ({
  title,
  content,
  words: content.length,
})

test('pickBookFiles 过滤非书文件，并按文件名排序', () => {
  const picked = pickBookFiles([
    file('第三卷.txt'),
    file('readme.md'),
    file('第一卷.txt'),
    file('data.json'),
    file('第二卷.epub'),
    file('无扩展名'),
  ])
  assert.deepEqual(
    picked.map((item) => item.name),
    ['第二卷.epub', '第三卷.txt', '第一卷.txt', '无扩展名'],
  )
})

test('pickBookFiles 排序按中文数字顺序稳定', () => {
  const picked = pickBookFiles([
    file('第10章.txt'),
    file('第2章.txt'),
    file('第1章.txt'),
  ])
  assert.deepEqual(
    picked.map((item) => item.name),
    ['第1章.txt', '第2章.txt', '第10章.txt'],
  )
})

test('mergeBookChapters 单书保持标题原样', () => {
  const books: BookChapters[] = [
    { title: '独行', chapters: [chapter('第1章'), chapter('第2章')] },
  ]
  const merged = mergeBookChapters(books)
  assert.deepEqual(
    merged.map((item) => item.title),
    ['第1章', '第2章'],
  )
})

test('mergeBookChapters 多书加书名前缀以消歧义', () => {
  const books: BookChapters[] = [
    { title: '甲', chapters: [chapter('第1章'), chapter('第2章')] },
    { title: '乙', chapters: [chapter('第1章')] },
  ]
  const merged = mergeBookChapters(books)
  assert.deepEqual(
    merged.map((item) => item.title),
    ['【甲】第1章', '【甲】第2章', '【乙】第1章'],
  )
})

test('mergeBookChapters 跳过空书', () => {
  const books: BookChapters[] = [
    { title: '空书', chapters: [] },
    { title: '甲', chapters: [chapter('第1章')] },
  ]
  const merged = mergeBookChapters(books)
  // 过滤空书后只剩一本，视为单书，标题不加前缀
  assert.deepEqual(
    merged.map((item) => item.title),
    ['第1章'],
  )
})

test('mergeBookChapters 全空返回空数组', () => {
  assert.deepEqual(mergeBookChapters([{ title: '空', chapters: [] }]), [])
})
