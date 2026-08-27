import type { AiNovelPlan, AiNovelRequest, AppData, Chapter, NovelProject } from './types'

export const uid = () => crypto.randomUUID()

export const now = () => Date.now()

export const createChapter = (index = 1): Chapter => ({
  id: uid(),
  title: `第${index}章`,
  summary: '',
  content: '',
  targetWords: 2500,
  status: 'draft',
  createdAt: now(),
  updatedAt: now(),
})

export const createProject = (title: string, genre: string, synopsis: string): NovelProject => ({
  id: uid(),
  title: title.trim() || '未命名小说',
  genre: genre.trim() || '未分类',
  synopsis: synopsis.trim(),
  coverColor: ['#2f8f75', '#c36b4b', '#58779b', '#75618c'][Math.floor(Math.random() * 4)],
  createdAt: now(),
  updatedAt: now(),
  chapters: [createChapter()],
  characters: [],
  worldNotes: [],
  plotNotes: [],
  ideas: [],
  memories: [],
  trash: [],
  aiMemory: [],
  aiOperations: [],
  aiUsage: [],
})

export const createAiProject = (plan: AiNovelPlan, request: AiNovelRequest): NovelProject => {
  const timestamp = now()
  return {
    id: uid(),
    title: plan.title.trim() || 'AI 生成小说',
    genre: plan.genre.trim() || request.genre || '未分类',
    synopsis: plan.synopsis.trim(),
    coverColor: ['#2f8f75', '#c36b4b', '#58779b', '#75618c'][Math.floor(Math.random() * 4)],
    createdAt: timestamp,
    updatedAt: timestamp,
    chapters: plan.chapters.slice(0, request.chapterCount).map((chapter, index) => ({
      id: uid(),
      title: chapter.title.trim() || `第${index + 1}章`,
      summary: [
        chapter.summary.trim(),
        chapter.goal ? `目标：${chapter.goal}` : '',
        chapter.obstacle ? `阻力：${chapter.obstacle}` : '',
        chapter.cost ? `代价：${chapter.cost}` : '',
        chapter.strand ? `主线类型：${chapter.strand}` : '',
        chapter.hook ? `章末钩子：${chapter.hook}` : '',
      ].filter(Boolean).join('\n'),
      content: '',
      targetWords: request.wordsPerChapter,
      status: 'draft',
      generationStatus: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    characters: plan.characters.map((character) => ({
      id: uid(),
      name: character.name || '未命名角色',
      role: character.role || '',
      description: character.description || '',
      motivation: character.motivation || '',
      conflict: character.conflict || '',
      tags: Array.isArray(character.tags) ? character.tags : [],
      updatedAt: timestamp,
    })),
    worldNotes: plan.world.map((item) => ({
      id: uid(), title: item.title, category: item.category || '规则', content: item.content, updatedAt: timestamp,
    })),
    plotNotes: plan.plot.map((item) => ({
      id: uid(), title: item.title, category: item.category || '主线', content: item.content, updatedAt: timestamp,
    })),
    ideas: [{ id: uid(), title: '原始创意', category: '点子', content: request.idea, updatedAt: timestamp }],
    memories: [{
      id: uid(),
      title: '作品核心',
      content: plan.synopsis,
      category: 'canon',
      pinned: true,
      updatedAt: timestamp,
    }],
    trash: [],
    aiMemory: [],
    aiOperations: [],
    aiUsage: [],
    generation: {
      prompt: request.idea,
      style: request.style,
      constraints: request.constraints,
      providerId: request.providerId,
      qualityMode: request.qualityMode,
      totalChapters: request.chapterCount,
      wordsPerChapter: request.wordsPerChapter,
      currentChapterIndex: 0,
      status: 'generating',
      startedAt: timestamp,
    },
  }
}

export const defaultData: AppData = {
  version: 1,
  projects: [],
  activeProjectId: null,
  aiUsage: [],
  settings: {
    theme: 'light',
    fontFamily: 'serif',
    fontSize: 18,
    activeProviderId: 'deepseek',
    providers: [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        enabled: true,
      },
      {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiKey: '',
        model: 'gpt-4.1-mini',
        enabled: true,
      },
      {
        id: 'kimi',
        name: 'Kimi',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiKey: '',
        model: 'kimi-k2.6',
        enabled: true,
      },
    ],
  },
}

export const countWords = (text: string) => {
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const words = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return chinese + words
}
