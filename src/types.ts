export type ViewId = 'outline' | 'characters' | 'world' | 'plot' | 'memory' | 'ideas' | 'trash' | 'settings'

export type ChapterStatus = 'draft' | 'revising' | 'done'

export interface Chapter {
  id: string
  title: string
  summary: string
  content: string
  targetWords: number
  status: ChapterStatus
  generationStatus?: 'pending' | 'generating' | 'done' | 'error'
  workflowStage?: 'drafting' | 'reviewing' | 'revising' | 'auditing'
  qualityScore?: number
  qualityNotes?: string[]
  memory?: string
  aiRevisionBackup?: {
    content: string
    status: ChapterStatus
    qualityScore?: number
    qualityNotes?: string[]
    createdAt: number
  }
  createdAt: number
  updatedAt: number
}

export type QualityMode = 'draft' | 'standard' | 'fanqie'

export interface AiNovelRequest {
  idea: string
  genre: string
  chapterCount: number
  wordsPerChapter: number
  style: string
  constraints: string
  providerId: string
  qualityMode: QualityMode
}

export interface AiNovelPlan {
  title: string
  genre: string
  synopsis: string
  characters: Array<{
    name: string
    role: string
    description: string
    motivation: string
    conflict: string
    tags: string[]
  }>
  world: Array<{ title: string; category: string; content: string }>
  plot: Array<{ title: string; category: string; content: string }>
  chapters: Array<{
    title: string
    summary: string
    goal?: string
    obstacle?: string
    cost?: string
    strand?: 'Quest' | 'Fire' | 'Constellation'
    hook?: string
  }>
}

export interface GenerationState {
  prompt: string
  style: string
  constraints: string
  providerId: string
  qualityMode: QualityMode
  totalChapters: number
  wordsPerChapter: number
  currentChapterIndex: number
  status: 'generating' | 'paused' | 'completed' | 'error'
  error?: string
  startedAt: number
}

export interface Character {
  id: string
  name: string
  role: string
  description: string
  motivation: string
  conflict: string
  tags: string[]
  updatedAt: number
}

export interface NoteItem {
  id: string
  title: string
  content: string
  category: string
  updatedAt: number
}

export type MemoryCategory = 'canon' | 'character' | 'timeline' | 'foreshadowing' | 'style' | 'chapter'

export interface MemoryItem {
  id: string
  title: string
  content: string
  category: MemoryCategory
  pinned: boolean
  sourceChapterId?: string
  updatedAt: number
}

export interface TrashItem {
  id: string
  kind: 'chapter' | 'character' | 'world' | 'plot' | 'idea' | 'memory' | 'project'
  title: string
  deletedAt: number
  payload: unknown
}

export interface NovelProject {
  id: string
  title: string
  genre: string
  synopsis: string
  coverColor: string
  createdAt: number
  updatedAt: number
  chapters: Chapter[]
  characters: Character[]
  worldNotes: NoteItem[]
  plotNotes: NoteItem[]
  ideas: NoteItem[]
  memories: MemoryItem[]
  trash: TrashItem[]
  generation?: GenerationState
}

export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontFamily: 'serif' | 'sans'
  fontSize: number
  activeProviderId: string
  providers: AiProvider[]
}

export interface AppData {
  version: 1
  projects: NovelProject[]
  activeProjectId: string | null
  settings: AppSettings
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}
