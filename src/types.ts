export type ViewId =
  | "home"
  | "outline"
  | "characters"
  | "world"
  | "plot"
  | "memory"
  | "seasoning"
  | "ideas"
  | "trash"
  | "settings";

export type ChapterStatus = "draft" | "revising" | "done";

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  targetWords: number;
  status: ChapterStatus;
  generationStatus?: "pending" | "generating" | "done" | "error";
  workflowStage?: "drafting" | "reviewing" | "revising";
  qualityScore?: number;
  qualityNotes?: string[];
  memory?: string;
  aiRevisionBackup?: {
    content: string;
    status: ChapterStatus;
    qualityScore?: number;
    qualityNotes?: string[];
    createdAt: number;
  };
  createdAt: number;
  updatedAt: number;
}

export type QualityMode = "draft" | "standard";

export interface AiNovelRequest {
  idea: string;
  genre: string;
  chapterCount: number;
  wordsPerChapter: number;
  style: string;
  constraints: string;
  providerId: string;
  qualityMode: QualityMode;
}

export interface AiNovelPlan {
  title: string;
  genre: string;
  synopsis: string;
  characters: Array<{
    name: string;
    role: string;
    description: string;
    motivation: string;
    conflict: string;
    tags: string[];
  }>;
  world: Array<{ title: string; category: string; content: string }>;
  plot: Array<{ title: string; category: string; content: string }>;
  chapters: Array<{
    title: string;
    summary: string;
    goal?: string;
    obstacle?: string;
    cost?: string;
    strand?: "Quest" | "Fire" | "Constellation";
    hook?: string;
  }>;
}

export interface GenerationState {
  prompt: string;
  style: string;
  constraints: string;
  providerId: string;
  qualityMode: QualityMode;
  totalChapters: number;
  wordsPerChapter: number;
  currentChapterIndex: number;
  status: "generating" | "paused" | "completed" | "error";
  error?: string;
  startedAt: number;
}

export interface AiMemoryEntry {
  id: string;
  chapterId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface AiOperation {
  id: string;
  chapterId: string;
  chapterTitle: string;
  action: "replace" | "insert" | "restore";
  prompt: string;
  beforeContent: string;
  afterContent: string;
  providerId: string;
  model: string;
  tokens: number;
  createdAt: number;
}

export interface AiUsageRecord {
  id: string;
  date: string;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  words: number;
  source: "plan" | "generation" | "chat" | "revision" | "review" | "lore" | "toolkit";
  chapterId?: string;
}

export interface ImportedBookLore {
  title?: string
  genre?: string
  synopsis?: string
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
  memories: Array<{
    title: string
    content: string
    category: MemoryCategory
    pinned?: boolean
  }>
  chapterSummaries?: Array<{ index: number; summary: string }>
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  motivation: string;
  conflict: string;
  tags: string[];
  updatedAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: string;
  updatedAt: number;
  /** 识别点可选关联到某条场景说明。 */
  linkId?: string;
}

export type MemoryCategory =
  | "canon"
  | "character"
  | "timeline"
  | "foreshadowing"
  | "style"
  | "chapter";

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  pinned: boolean;
  sourceChapterId?: string;
  updatedAt: number;
}

export interface TrashItem {
  id: string;
  kind:
    | "chapter"
    | "character"
    | "world"
    | "plot"
    | "idea"
    | "memory"
    | "seasoningScene"
    | "seasoningSignal"
    | "seasoningRule"
    | "project";
  title: string;
  deletedAt: number;
  payload: unknown;
}

export interface NovelProject {
  id: string;
  title: string;
  genre: string;
  synopsis: string;
  coverColor: string;
  createdAt: number;
  updatedAt: number;
  /** 作品创建来源；旧存档可缺省。 */
  origin?: "manual" | "ai" | "imported" | "sequel";
  chapters: Chapter[];
  characters: Character[];
  worldNotes: NoteItem[];
  plotNotes: NoteItem[];
  ideas: NoteItem[];
  memories: MemoryItem[];
  /** 加料：场景说明 */
  seasoningScenes: NoteItem[];
  /** 加料：文本识别点与关键字 */
  seasoningSignals: NoteItem[];
  /** 加料：加料规范 */
  seasoningRules: NoteItem[];
  trash: TrashItem[];
  aiMemory: AiMemoryEntry[];
  aiOperations: AiOperation[];
  aiUsage: AiUsageRecord[];
  generation?: GenerationState;
}

export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  /** 可选前缀，会插在该服务商每次系统提示之前。 */
  breakArmorPrompt?: string;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  fontFamily: "serif" | "sans";
  fontSize: number;
  activeProviderId: string;
  providers: AiProvider[];
}

export interface AppData {
  version: 1;
  projects: NovelProject[];
  activeProjectId: string | null;
  settings: AppSettings;
  aiUsage: AiUsageRecord[];
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}
