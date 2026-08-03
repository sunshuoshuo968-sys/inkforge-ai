import { defaultData } from './data'
import type { AppData } from './types'

const DATABASE = 'mogu-novel-studio'
const STORE = 'app-state'
const KEY = 'primary'

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE)
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export const loadData = async (): Promise<AppData> => {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    request.onsuccess = () => resolve(request.result ? request.result as AppData : structuredClone(defaultData))
    request.onerror = () => reject(request.error)
  })
}

export const saveData = async (data: AppData): Promise<void> => {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(data, KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export const exportData = (data: AppData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `墨构备份-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export const parseImport = async (file: File): Promise<AppData> => {
  const data = JSON.parse(await file.text()) as Partial<AppData>
  if (data.version !== 1 || !Array.isArray(data.projects) || !data.settings) {
    throw new Error('备份文件格式不正确')
  }
  return data as AppData
}
