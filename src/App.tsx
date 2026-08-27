import {
  ArchiveRestore,
  Bell,
  BookMarked,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleUserRound,
  Download,
  Eye,
  EyeOff,
  Feather,
  FilePenLine,
  FilePlus2,
  FileText,
  Globe2,
  GripHorizontal,
  Heart,
  Import,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Minimize2,
  Moon,
  Pause,
  PenLine,
  Pin,
  Play,
  Plus,
  Redo2,
  Replace,
  RotateCcw,
  ScanText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Swords,
  Trash2,
  Undo2,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { completeChat, generateNovelPlan, streamChat } from './ai'
import { countWords, createAiProject, createChapter, createProject, defaultData, now, uid } from './data'
import { exportData, loadData, parseImport, saveData } from './storage'
import type {
  AiMessage,
  AiNovelPlan,
  AiNovelRequest,
  AppData,
  Character,
  Chapter,
  MemoryCategory,
  MemoryItem,
  NoteItem,
  NovelProject,
  TrashItem,
  ViewId,
} from './types'
import { buildChapterTakeoverPrompt, buildDraftPrompt, buildFanqiePrompt, buildReviewPrompt, buildRevisionPrompt, writingWorkflows } from './workflows'

const viewMeta: Record<ViewId, { label: string; icon: typeof BookOpenText }> = {
  outline: { label: '大纲', icon: BookOpenText },
  characters: { label: '角色', icon: UsersRound },
  world: { label: '世界观', icon: Globe2 },
  plot: { label: '情节', icon: BrainCircuit },
  memory: { label: '时间线', icon: BookMarked },
  ideas: { label: '灵感', icon: Lightbulb },
  trash: { label: '回收站', icon: Trash2 },
  settings: { label: '设置', icon: Settings },
}

const noteConfig = {
  world: {
    title: '世界观',
    empty: '从一条规则、一座城市或一个时代开始',
    add: '新建设定',
    categories: ['地点', '规则', '历史', '势力', '物件'],
  },
  plot: {
    title: '情节',
    empty: '记录主线、支线、伏笔和关键转折',
    add: '新建情节',
    categories: ['主线', '支线', '伏笔', '转折', '结局'],
  },
  ideas: {
    title: '灵感',
    empty: '随手记下一句对白、一个场景或一个念头',
    add: '记录灵感',
    categories: ['场景', '对白', '点子', '素材', '待整理'],
  },
} as const

const workflowStageLabels: Record<NonNullable<Chapter['workflowStage']>, string> = {
  drafting: '正在起草正文',
  reviewing: '正在审读章节',
  revising: '正在执行修订',
  auditing: '正在进行发布终审',
}

const memoryCategoryLabels: Record<MemoryCategory, string> = {
  canon: '设定事实',
  character: '人物关系',
  timeline: '时间线',
  foreshadowing: '伏笔',
  style: '文风约束',
  chapter: '章节摘要',
}

function App() {
  const [data, setData] = useState<AppData>(defaultData)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewId>('outline')
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [aiCreateOpen, setAiCreateOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const dataRef = useRef(data)
  const generationAbortRef = useRef<AbortController | null>(null)
  const generationRunningRef = useRef(false)

  useEffect(() => {
    loadData()
      .then((stored) => {
        const normalized: AppData = {
          ...stored,
          settings: {
            ...stored.settings,
            providers: [
              ...stored.settings.providers.map((provider) => provider.id === 'kimi' && provider.model === 'moonshot-v1-8k'
                ? {
                    ...provider,
                    baseUrl: provider.baseUrl.replace(/\/+$/, '') === 'https://api.moonshot.cn'
                      ? 'https://api.moonshot.cn/v1'
                      : provider.baseUrl,
                    model: 'kimi-k2.6',
                  }
                : provider),
              ...defaultData.settings.providers.filter((provider) => (
                !stored.settings.providers.some((storedProvider) => storedProvider.id === provider.id)
              )),
            ],
          },
          projects: stored.projects.map((project) => project.generation?.status === 'generating' ? {
            ...project,
            memories: project.memories ?? [],
            generation: { ...project.generation, status: 'paused' },
            chapters: project.chapters.map((chapter) => chapter.generationStatus === 'generating'
              ? { ...chapter, generationStatus: 'pending', workflowStage: undefined }
              : chapter),
          } : { ...project, memories: project.memories ?? [] }),
        }
        dataRef.current = normalized
        setData(normalized)
        const active = normalized.projects.find((project) => project.id === normalized.activeProjectId)
        setSelectedChapterId(active?.chapters[0]?.id ?? null)
      })
      .catch(() => setToast('读取本地数据失败，已创建空白工作区'))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    if (!ready) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveData(data).catch(() => setToast('自动保存失败，请导出备份'))
    }, 500)
    return () => window.clearTimeout(saveTimer.current)
  }, [data, ready])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = data.settings.theme
    root.style.setProperty('--editor-font-size', `${data.settings.fontSize}px`)
    root.dataset.editorFont = data.settings.fontFamily
  }, [data.settings.theme, data.settings.fontFamily, data.settings.fontSize])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const activeProject = useMemo(
    () => data.projects.find((project) => project.id === data.activeProjectId) ?? null,
    [data.projects, data.activeProjectId],
  )

  useEffect(() => {
    if (!activeProject) {
      setSelectedChapterId(null)
      return
    }
    if (!activeProject.chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(activeProject.chapters[0]?.id ?? null)
    }
  }, [activeProject, selectedChapterId])

  const replaceData = useCallback((updater: (current: AppData) => AppData) => {
    const next = updater(dataRef.current)
    dataRef.current = next
    setData(next)
  }, [])

  const updateProject = useCallback((projectId: string, updater: (project: NovelProject) => NovelProject) => {
    replaceData((current) => ({
      ...current,
      projects: current.projects.map((project) => (
        project.id === projectId ? { ...updater(project), updatedAt: now() } : project
      )),
    }))
  }, [replaceData])

  const streamChapterStage = useCallback(async (
    project: NovelProject,
    chapterIndex: number,
    prompt: string,
    stage: Chapter['workflowStage'],
    signal: AbortSignal,
  ) => {
    const provider = dataRef.current.settings.providers.find((item) => item.id === project.generation?.providerId)
    if (!provider) throw new Error('生成所用的 AI 提供商已不存在')
    let output = ''
    let lastPaint = 0
    await streamChat({
      provider,
      project,
      chapterTitle: project.chapters[chapterIndex].title,
      chapterContent: project.chapters[chapterIndex].content,
      messages: [{ role: 'user', content: prompt }],
      signal,
      onChunk: (chunk) => {
        output += chunk
        const tick = performance.now()
        if (tick - lastPaint < 80) return
        lastPaint = tick
        updateProject(project.id, (current) => ({
          ...current,
          chapters: current.chapters.map((chapter, index) => index === chapterIndex
            ? { ...chapter, content: output, workflowStage: stage, updatedAt: now() }
            : chapter),
        }))
      },
    })
    updateProject(project.id, (current) => ({
      ...current,
      chapters: current.chapters.map((chapter, index) => index === chapterIndex
        ? { ...chapter, content: output, workflowStage: stage, updatedAt: now() }
        : chapter),
    }))
    return output
  }, [updateProject])

  const runGeneration = useCallback(async (projectId: string) => {
    if (generationRunningRef.current) return
    generationRunningRef.current = true
    const controller = new AbortController()
    generationAbortRef.current = controller
    let activeChapterIndex = -1
    try {
      while (!controller.signal.aborted) {
        let project = dataRef.current.projects.find((item) => item.id === projectId)
        if (!project?.generation || project.generation.status !== 'generating') break
        const chapterIndex = project.chapters.findIndex((chapter) => (
          chapter.generationStatus === 'pending' || chapter.generationStatus === 'error' || chapter.generationStatus === 'generating'
        ))
        if (chapterIndex < 0) {
          updateProject(projectId, (current) => ({
            ...current,
            generation: current.generation ? {
              ...current.generation,
              currentChapterIndex: current.chapters.length,
              status: 'completed',
              error: undefined,
            } : undefined,
          }))
          setToast(`《${project.title}》全书初稿已生成`)
          break
        }

        activeChapterIndex = chapterIndex
        updateProject(projectId, (current) => ({
          ...current,
          generation: current.generation ? { ...current.generation, currentChapterIndex: chapterIndex, error: undefined } : undefined,
          chapters: current.chapters.map((chapter, index) => index === chapterIndex ? {
            ...chapter,
            content: '',
            generationStatus: 'generating',
            workflowStage: 'drafting',
            qualityNotes: undefined,
          } : chapter),
        }))
        if (dataRef.current.activeProjectId === projectId) setSelectedChapterId(project.chapters[chapterIndex].id)

        project = dataRef.current.projects.find((item) => item.id === projectId)!
        let content = await streamChapterStage(project, chapterIndex, buildDraftPrompt(project, chapterIndex), 'drafting', controller.signal)
        const mode = project.generation!.qualityMode
        let review = ''

        if (mode === 'standard' || mode === 'fanqie') {
          updateProject(projectId, (current) => ({
            ...current,
            chapters: current.chapters.map((chapter, index) => index === chapterIndex ? { ...chapter, workflowStage: 'reviewing' } : chapter),
          }))
          project = dataRef.current.projects.find((item) => item.id === projectId)!
          const provider = dataRef.current.settings.providers.find((item) => item.id === project!.generation?.providerId)
          if (!provider) throw new Error('生成所用的 AI 提供商已不存在')
          review = await completeChat({ provider, project: project!, prompt: buildReviewPrompt(project!, chapterIndex, content), signal: controller.signal })
          const score = Number(review.match(/(?:综合分数|综合评分)[：:\s]*(\d{1,3})/)?.[1] || 0) || undefined
          updateProject(projectId, (current) => ({
            ...current,
            chapters: current.chapters.map((chapter, index) => index === chapterIndex ? {
              ...chapter,
              workflowStage: 'revising',
              qualityScore: score,
              qualityNotes: [review.slice(0, 500)],
            } : chapter),
          }))
          project = dataRef.current.projects.find((item) => item.id === projectId)!
          content = await streamChapterStage(project, chapterIndex, buildRevisionPrompt(project, chapterIndex, content, review), 'revising', controller.signal)
        }

        if (mode === 'fanqie') {
          project = dataRef.current.projects.find((item) => item.id === projectId)!
          content = await streamChapterStage(project, chapterIndex, buildFanqiePrompt(project, chapterIndex, content), 'auditing', controller.signal)
        }

        updateProject(projectId, (current) => {
          const chapter = current.chapters[chapterIndex]
          const existingMemory = current.memories.find((item) => item.sourceChapterId === chapter.id)
          const generatedMemory = chapter.memory?.trim() || `${chapter.summary}\n章节结尾：${content.slice(-400)}`
          const chapterMemory = {
            id: existingMemory?.id ?? uid(),
            title: `第${chapterIndex + 1}章记忆 · ${chapter.title}`,
            content: existingMemory?.pinned ? existingMemory.content : generatedMemory,
            category: 'chapter' as const,
            pinned: existingMemory?.pinned ?? false,
            sourceChapterId: chapter.id,
            updatedAt: now(),
          }
          return {
            ...current,
            generation: current.generation ? { ...current.generation, currentChapterIndex: chapterIndex + 1 } : undefined,
            chapters: current.chapters.map((item, index) => index === chapterIndex ? {
              ...item,
              content,
              generationStatus: 'done',
              workflowStage: undefined,
              status: 'revising',
              updatedAt: now(),
            } : item),
            memories: existingMemory
              ? current.memories.map((item) => item.id === existingMemory.id ? chapterMemory : item)
              : [chapterMemory, ...current.memories],
          }
        })
      }
    } catch (error) {
      const aborted = controller.signal.aborted
      updateProject(projectId, (current) => ({
        ...current,
        generation: current.generation ? {
          ...current.generation,
          status: aborted ? 'paused' : 'error',
          error: aborted ? undefined : error instanceof Error ? error.message : '生成失败',
        } : undefined,
        chapters: current.chapters.map((chapter, index) => index === activeChapterIndex ? {
          ...chapter,
          generationStatus: aborted ? 'pending' : 'error',
          workflowStage: undefined,
        } : chapter),
      }))
    } finally {
      generationRunningRef.current = false
      generationAbortRef.current = null
    }
  }, [streamChapterStage, updateProject])

  useEffect(() => {
    const job = data.projects.find((project) => project.generation?.status === 'generating')
    if (job && !generationRunningRef.current) void runGeneration(job.id)
  }, [data.projects, runGeneration])

  const switchProject = (projectId: string) => {
    const project = data.projects.find((item) => item.id === projectId)
    replaceData((current) => ({ ...current, activeProjectId: projectId }))
    setSelectedChapterId(project?.chapters[0]?.id ?? null)
    setView('outline')
  }

  const createNovel = (title: string, genre: string, synopsis: string) => {
    const project = createProject(title, genre, synopsis)
    replaceData((current) => ({
      ...current,
      projects: [project, ...current.projects],
      activeProjectId: project.id,
    }))
    setSelectedChapterId(project.chapters[0].id)
    setView('outline')
    setNewProjectOpen(false)
  }

  const createNovelFromAi = (plan: AiNovelPlan, request: AiNovelRequest) => {
    const project = createAiProject(plan, request)
    replaceData((current) => ({
      ...current,
      projects: [project, ...current.projects],
      activeProjectId: project.id,
    }))
    setSelectedChapterId(project.chapters[0]?.id ?? null)
    setView('outline')
    setAiCreateOpen(false)
    setToast('大纲已完成，开始逐章生成')
  }

  const pauseGeneration = (projectId: string) => {
    generationAbortRef.current?.abort()
    updateProject(projectId, (project) => ({
      ...project,
      generation: project.generation ? { ...project.generation, status: 'paused', error: undefined } : undefined,
    }))
  }

  const resumeGeneration = (projectId: string) => {
    updateProject(projectId, (project) => ({
      ...project,
      generation: project.generation ? { ...project.generation, status: 'generating', error: undefined } : undefined,
      chapters: project.chapters.map((chapter) => chapter.generationStatus === 'error'
        ? { ...chapter, generationStatus: 'pending' }
        : chapter),
    }))
  }

  const selectView = (next: ViewId) => {
    setView(next)
    if (next !== 'outline') setAiOpen(false)
    setMobileNavOpen(false)
  }

  if (!ready) {
    return (
      <div className="loading-screen">
        <span className="brand-mark"><BookOpenText size={24} /></span>
        <LoaderCircle className="spin" size={22} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeView={view}
        activeProject={activeProject}
        projects={data.projects}
        mobileOpen={mobileNavOpen}
        theme={data.settings.theme}
        onSelectView={selectView}
        onSwitchProject={switchProject}
        onAiCreate={() => setAiCreateOpen(true)}
        onCloseMobile={() => setMobileNavOpen(false)}
        onToggleTheme={() => setData((current) => {
          const resolvedDark = current.settings.theme === 'dark'
            || (current.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          return {
            ...current,
            settings: {
              ...current.settings,
              theme: resolvedDark ? 'light' : 'dark',
            },
          }
        })}
      />

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="打开导航">
            <Menu size={21} />
          </button>
          <div className="topbar-title">
            <span>{viewMeta[view].label}</span>
            {activeProject ? <span className="project-breadcrumb">/ {activeProject.title}</span> : null}
          </div>
          <div className="topbar-actions">
            <button
              className={`icon-button ${aiOpen ? 'active' : ''}`}
              onClick={() => activeProject && view === 'outline' && setAiOpen((open) => !open)}
              disabled={!activeProject || view !== 'outline'}
              aria-label={aiOpen ? '关闭章节 AI 助手' : '打开章节 AI 助手'}
              title={aiOpen ? '关闭章节 AI 助手' : '打开章节 AI 助手'}
              aria-haspopup="dialog"
              aria-expanded={aiOpen}
              aria-controls="chapter-ai-panel"
            ><Feather size={19} /></button>
            <button className="icon-button" aria-label="通知" title="通知"><Bell size={19} /></button>
            <button className="ink-avatar" aria-label="个人中心" title="个人中心">墨</button>
          </div>
        </header>

        <div className="content-area">
          {view !== 'settings' && !activeProject ? (
            <EmptyWorkspace onAiCreate={() => setAiCreateOpen(true)} onManualCreate={() => setNewProjectOpen(true)} />
          ) : null}
          {view === 'outline' && activeProject ? (
            <OutlineEditor
              project={activeProject}
              selectedChapterId={selectedChapterId}
              onSelectChapter={setSelectedChapterId}
              onUpdate={(updater) => updateProject(activeProject.id, updater)}
              aiOpen={aiOpen}
              onToggleAi={() => setAiOpen((open) => !open)}
              onToast={setToast}
              onPause={() => pauseGeneration(activeProject.id)}
              onResume={() => resumeGeneration(activeProject.id)}
            />
          ) : null}
          {view === 'characters' && activeProject ? (
            <CharactersView
              project={activeProject}
              onUpdate={(updater) => updateProject(activeProject.id, updater)}
            />
          ) : null}
          {(view === 'world' || view === 'plot' || view === 'ideas') && activeProject ? (
            <NotesView
              kind={view}
              project={activeProject}
              onUpdate={(updater) => updateProject(activeProject.id, updater)}
            />
          ) : null}
          {view === 'memory' && activeProject ? (
            <MemoryView
              project={activeProject}
              onUpdate={(updater) => updateProject(activeProject.id, updater)}
            />
          ) : null}
          {view === 'trash' && activeProject ? (
            <TrashView
              project={activeProject}
              onUpdate={(updater) => updateProject(activeProject.id, updater)}
            />
          ) : null}
          {view === 'settings' ? (
            <SettingsView
              data={data}
              activeProject={activeProject}
              onToast={setToast}
              onChange={(value) => replaceData(typeof value === 'function' ? value : () => value)}
              onImport={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  const imported = await parseImport(file)
                  dataRef.current = imported
                  setData(imported)
                  setToast('备份已导入')
                } catch (error) {
                  setToast(error instanceof Error ? error.message : '导入失败')
                }
                event.target.value = ''
              }}
              onDeleteProject={(project) => {
                const trash: TrashItem = {
                  id: uid(),
                  kind: 'project',
                  title: project.title,
                  deletedAt: now(),
                  payload: project,
                }
                setData((current) => {
                  const projects = current.projects.filter((item) => item.id !== project.id)
                  const replacement = projects[0]?.id ?? null
                  return { ...current, projects, activeProjectId: replacement }
                })
                try {
                  localStorage.setItem('mogu-last-deleted-project', JSON.stringify(trash))
                } catch {
                  // Deletion still succeeds when the browser blocks localStorage.
                }
                setView('outline')
                setToast('小说已移除，可通过最近删除恢复')
              }}
              onRestoreProject={() => {
                try {
                  const raw = localStorage.getItem('mogu-last-deleted-project')
                  if (!raw) return setToast('没有可恢复的小说')
                  const trash = JSON.parse(raw) as TrashItem
                  const project = trash.payload as NovelProject
                  setData((current) => ({
                    ...current,
                    projects: [project, ...current.projects.filter((item) => item.id !== project.id)],
                    activeProjectId: project.id,
                  }))
                  localStorage.removeItem('mogu-last-deleted-project')
                  setToast('小说已恢复')
                } catch {
                  setToast('恢复失败')
                }
              }}
            />
          ) : null}
        </div>
      </main>

      {aiOpen && activeProject ? (
        <AiPanel
          key={`${activeProject.id}:${selectedChapterId ?? 'none'}`}
          data={data}
          project={activeProject}
          chapter={activeProject.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null}
          onClose={() => setAiOpen(false)}
          onInsert={(chapterId, text) => {
            updateProject(activeProject.id, (project) => ({
              ...project,
              chapters: project.chapters.map((chapter) => chapter.id === chapterId
                ? { ...chapter, content: `${chapter.content}${chapter.content ? '\n\n' : ''}${text.trim()}`, updatedAt: now() }
                : chapter),
            }))
            setToast('已插入章节末尾')
          }}
          onReplace={(chapterId, text) => {
            const timestamp = now()
            updateProject(activeProject.id, (project) => ({
              ...project,
              chapters: project.chapters.map((chapter) => chapter.id === chapterId ? {
                ...chapter,
                content: text.trim(),
                status: 'revising',
                workflowStage: undefined,
                qualityScore: undefined,
                qualityNotes: undefined,
                aiRevisionBackup: chapter.aiRevisionBackup ?? {
                  content: chapter.content,
                  status: chapter.status,
                  qualityScore: chapter.qualityScore,
                  qualityNotes: chapter.qualityNotes,
                  createdAt: timestamp,
                },
                updatedAt: timestamp,
              } : chapter),
            }))
            setToast('AI 修改已应用，可随时恢复原文')
          }}
          onRestore={(chapterId) => {
            const timestamp = now()
            updateProject(activeProject.id, (project) => ({
              ...project,
              chapters: project.chapters.map((chapter) => chapter.id === chapterId && chapter.aiRevisionBackup ? {
                ...chapter,
                content: chapter.aiRevisionBackup.content,
                status: chapter.aiRevisionBackup.status,
                qualityScore: chapter.aiRevisionBackup.qualityScore,
                qualityNotes: chapter.aiRevisionBackup.qualityNotes,
                workflowStage: undefined,
                aiRevisionBackup: undefined,
                updatedAt: timestamp,
              } : chapter),
            }))
            setToast('已恢复 AI 修改前的正文')
          }}
        />
      ) : null}

      {newProjectOpen ? (
        <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreate={createNovel} />
      ) : null}
      {aiCreateOpen ? (
        <AiCreateDialog
          data={data}
          onClose={() => setAiCreateOpen(false)}
          onCreate={createNovelFromAi}
          onOpenSettings={() => { setAiCreateOpen(false); setView('settings') }}
          onManual={() => { setAiCreateOpen(false); setNewProjectOpen(true) }}
        />
      ) : null}
      {toast ? <div className="toast"><Check size={16} />{toast}</div> : null}
    </div>
  )
}

interface SidebarProps {
  activeView: ViewId
  activeProject: NovelProject | null
  projects: NovelProject[]
  mobileOpen: boolean
  theme: string
  onSelectView: (view: ViewId) => void
  onSwitchProject: (id: string) => void
  onAiCreate: () => void
  onCloseMobile: () => void
  onToggleTheme: () => void
}

function Sidebar(props: SidebarProps) {
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = () => setSystemDark(media.matches)
    syncSystemTheme()
    media.addEventListener('change', syncSystemTheme)
    return () => media.removeEventListener('change', syncSystemTheme)
  }, [])
  const navigationViews: ViewId[] = ['outline', 'characters', 'world', 'plot', 'memory', 'ideas', 'trash']
  const resolvedDark = props.theme === 'dark' || (props.theme === 'system' && systemDark)
  return (
    <>
      {props.mobileOpen ? <button className="nav-scrim" onClick={props.onCloseMobile} aria-label="关闭导航" /> : null}
      <aside className={`sidebar ${props.mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <img className="brand-art" src="/mogou-logo-transparent-enhanced.png" alt="墨构 MOGOU STUDIO" />
          <button className="icon-button close-mobile" onClick={props.onCloseMobile} aria-label="关闭导航"><X size={19} /></button>
        </div>

        <button className="new-project-button" onClick={props.onAiCreate} aria-label="AI 一键创作">
          <Sparkles size={19} />
          <span>AI 智创作</span>
        </button>

        <div className="favorites-menu">
          <button className="nav-button favorites-button" onClick={() => setFavoritesOpen((open) => !open)} aria-expanded={favoritesOpen}>
            <Heart size={19} /><span>我的关注</span>
          </button>
          {favoritesOpen ? (
            <div className="favorites-popover">
              {props.projects.length ? props.projects.map((project) => (
                <button
                  key={project.id}
                  className={project.id === props.activeProject?.id ? 'active' : ''}
                  onClick={() => { props.onSwitchProject(project.id); setFavoritesOpen(false) }}
                ><i style={{ background: project.coverColor }} /><span>{project.title}</span></button>
              )) : <button onClick={() => { props.onAiCreate(); setFavoritesOpen(false) }}><Plus size={15} /><span>创建第一部小说</span></button>}
            </div>
          ) : null}
        </div>

        <nav className="main-nav" aria-label="主导航">
          <div className="sidebar-landscape" aria-hidden="true" />
          {navigationViews.map((item) => <NavButton key={item} view={item} active={props.activeView === item} onClick={props.onSelectView} />)}
        </nav>

        <div className="sidebar-footer">
          <button className={`nav-button ${props.activeView === 'settings' ? 'active' : ''}`} onClick={() => props.onSelectView('settings')}>
            <Settings size={19} /><span>设置</span>
          </button>
          <button className="icon-button" onClick={props.onToggleTheme} aria-label="切换主题" title="切换主题">
            {resolvedDark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </aside>
    </>
  )
}

function NavButton({ view, active, onClick }: { view: ViewId; active: boolean; onClick: (view: ViewId) => void }) {
  const meta = viewMeta[view]
  const Icon = meta.icon
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={() => onClick(view)}>
      <Icon size={19} /><span>{meta.label}</span>
    </button>
  )
}

function EmptyWorkspace({ onAiCreate, onManualCreate }: { onAiCreate: () => void; onManualCreate: () => void }) {
  return (
    <div className="empty-workspace premium-landing">
      <div className="landing-noise" aria-hidden="true" />
      <div className="landing-orb landing-orb-one" aria-hidden="true" />
      <div className="landing-orb landing-orb-two" aria-hidden="true" />
      <div className="landing-shell">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><span className="eyebrow-pulse" />MOGOU CREATIVE OS <span className="eyebrow-divider" />为长期创作而生</div>
            <div className="landing-mantra">把一个想法交给 AI</div>
            <h1>让灵感，<br /><em>长成一部作品。</em></h1>
            <p className="landing-lede">墨构把散落的灵感、复杂的设定与漫长的写作，收束成一条可持续的创作轨道。你负责想象，AI 负责让故事始终向前。</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={onAiCreate}><span className="landing-button-icon"><Sparkles size={17} /></span>AI 一键创作<span className="landing-button-arrow">↗</span></button>
              <button className="landing-secondary" onClick={onManualCreate}><span className="landing-play"><Play size={14} fill="currentColor" /></span>从空白开始</button>
            </div>
            <div className="landing-trust-row">
              <span><Check size={13} />本地优先</span>
              <span><ShieldCheck size={13} />你的故事只属于你</span>
              <span><Feather size={13} />支持长篇连载</span>
            </div>
          </div>

          <div className="landing-stage" aria-label="墨构工作台预览">
            <div className="stage-glow" aria-hidden="true" />
            <div className="stage-window">
              <div className="stage-window-bar"><span className="stage-dots"><i /><i /><i /></span><span className="stage-window-title">雾城来信 · 创作中</span><span className="stage-live"><span />LIVE</span></div>
              <div className="stage-workspace">
                <div className="stage-rail">
                  <div className="stage-brand-mark"><Feather size={14} /></div>
                  <span className="stage-rail-item active"><BookOpenText size={14} /></span>
                  <span className="stage-rail-item"><UsersRound size={14} /></span>
                  <span className="stage-rail-item"><Globe2 size={14} /></span>
                  <span className="stage-rail-item"><BrainCircuit size={14} /></span>
                  <span className="stage-rail-item"><BookMarked size={14} /></span>
                </div>
                <div className="stage-chapters">
                  <div className="stage-chapter-head"><span>章节</span><small>12 / 36</small></div>
                  <div className="stage-search"><span />搜索章节</div>
                  <div className="stage-chapter-row active"><b>01</b><span><strong>潮汐后的来信</strong><small>已完成 · 2,486 字</small></span><i /></div>
                  <div className="stage-chapter-row"><b>02</b><span><strong>没有寄件人的包裹</strong><small>已完成 · 2,713 字</small></span><i /></div>
                  <div className="stage-chapter-row"><b>03</b><span><strong>凌晨四点的回声</strong><small>正在修订</small></span><i className="working" /></div>
                </div>
                <div className="stage-editor">
                  <div className="stage-editor-top"><span>第 03 章</span><span className="stage-saved"><Check size={11} />已保存</span></div>
                  <h3>凌晨四点的回声</h3>
                  <div className="stage-rule" />
                  <div className="stage-copy"><p>四点十七分，雾城的灯同时熄灭。</p><p>林默站在旧邮局门口，手里的信封没有寄件人，只有一行被雨水晕开的地址。</p><p>他知道这座城市正在隐瞒什么。就像它隐瞒了母亲最后一通电话。</p><span className="stage-caret" /></div>
                  <div className="stage-editor-foot"><span>本章进度 <b>68%</b></span><span className="stage-progress"><i /></span><span>1,704 / 2,500 字</span></div>
                </div>
                <div className="stage-insight">
                  <div className="insight-label"><Sparkles size={12} />章节 AI</div>
                  <strong>叙事状态</strong>
                  <div className="insight-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                  <div className="insight-score"><span>张力指数</span><b>86</b><small>+12%</small></div>
                  <div className="insight-note"><span />伏笔回收提醒<small>第 01 章 · 旧邮戳</small></div>
                </div>
              </div>
              <div className="stage-status"><span><span className="status-online" />AI 正在理解你的故事</span><span>标准成稿流程 · 3 个阶段</span><span className="stage-status-action">查看工作流 ↗</span></div>
            </div>
            <div className="stage-caption"><span>一个能记住上下文的创作伙伴</span><span>实时预览</span></div>
          </div>
        </section>

        <section className="landing-proof" aria-label="产品能力数据">
          <div className="proof-intro"><span className="proof-kicker">THE LONG GAME</span><strong>写得更远，<br />也写得更像你。</strong></div>
          <div className="proof-stat"><b>10×</b><span>更快搭建完整世界观</span></div>
          <div className="proof-stat"><b>100%</b><span>上下文与设定可追溯</span></div>
          <div className="proof-stat"><b>∞</b><span>属于你的故事可能性</span></div>
        </section>

        <section className="landing-features">
          <div className="landing-section-heading"><div><span className="section-kicker">A BETTER WAY TO WRITE</span><h2>不是替你写，<br /><em>而是让你写得更好。</em></h2></div><p>从第一句灵感到最后一次修订，墨构把创作中最耗心力的部分变成清晰、可掌控的系统。</p></div>
          <div className="feature-grid">
            <article className="feature-card feature-card-large"><div className="feature-index">01</div><div className="feature-icon"><Sparkles size={20} /></div><h3>一键生成整部小说</h3><p>输入一个念头，自动展开人物弧光、世界规则、章节钩子与完整初稿。不是随机拼接，而是一条有因果的故事线。</p><span className="feature-link">从创意到大纲 <b>↗</b></span></article>
            <article className="feature-card"><div className="feature-index">02</div><div className="feature-icon"><BookMarked size={20} /></div><h3>记得住的故事大脑</h3><p>角色、时间线、伏笔和设定集中沉淀，写到长篇后半程也不会丢掉最初的那束光。</p><span className="feature-link">查看记忆系统 <b>↗</b></span></article>
            <article className="feature-card"><div className="feature-index">03</div><div className="feature-icon"><ListChecks size={20} /></div><h3>每一章都值得发布</h3><p>写作、审读、修订、终审四段质量流程，让灵感落地时依然有节奏、有张力、有完成度。</p><span className="feature-link">了解质量流程 <b>↗</b></span></article>
          </div>
        </section>

        <section className="landing-workflow">
          <div className="workflow-copy"><span className="section-kicker">FROM IDEA TO INK</span><h2>把创作变成<br /><em>一条可走的路。</em></h2><p>你不需要一次想清楚整本书。墨构会在每一个关键节点，给你足够的方向，也留下足够的自由。</p><button className="workflow-link" onClick={onAiCreate}>开始你的第一章 <span>↗</span></button></div>
          <div className="workflow-steps">
            <div className="workflow-step active"><span className="workflow-number">01</span><div><strong>种下一个念头</strong><p>一句话、一幅画面，或一个挥之不去的问题。</p></div><Sparkles size={17} /></div>
            <div className="workflow-line" />
            <div className="workflow-step"><span className="workflow-number">02</span><div><strong>长出一座世界</strong><p>人物、规则、关系与命运开始彼此咬合。</p></div><Globe2 size={17} /></div>
            <div className="workflow-line" />
            <div className="workflow-step"><span className="workflow-number">03</span><div><strong>留下你的笔迹</strong><p>AI 扩展可能性，你决定故事最终的方向。</p></div><Feather size={17} /></div>
          </div>
        </section>

        <footer className="landing-footer"><span><Feather size={14} />墨构 MOGOU STUDIO</span><span>AI 小说创作工作台 · v0.1</span><span>Made for stories that stay with you.</span></footer>
      </div>
    </div>
  )
}

interface OutlineEditorProps {
  project: NovelProject
  selectedChapterId: string | null
  onSelectChapter: (id: string) => void
  onUpdate: (updater: (project: NovelProject) => NovelProject) => void
  aiOpen: boolean
  onToggleAi: () => void
  onToast: (message: string) => void
  onPause: () => void
  onResume: () => void
}

function OutlineEditor({ project, selectedChapterId, onSelectChapter, onUpdate, aiOpen, onToggleAi, onToast, onPause, onResume }: OutlineEditorProps) {
  const [query, setQuery] = useState('')
  const [chapterSettingsOpen, setChapterSettingsOpen] = useState(false)
  const [chapterSearchOpen, setChapterSearchOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const chapter = project.chapters.find((item) => item.id === selectedChapterId) ?? null
  const filteredChapters = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return project.chapters
    return project.chapters.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(keyword))
  }, [project.chapters, query])
  const totalWords = project.chapters.reduce((sum, item) => sum + countWords(item.content), 0)
  const patchChapter = (patch: Partial<Chapter>) => {
    if (!chapter) return
    onUpdate((current) => ({
      ...current,
      chapters: current.chapters.map((item) => item.id === chapter.id
        ? { ...item, ...patch, updatedAt: now() }
        : item),
    }))
  }

  const deleteChapter = () => {
    if (!chapter) return
    if (project.chapters.length === 1) return onToast('至少保留一个章节')
    const index = project.chapters.findIndex((item) => item.id === chapter.id)
    const next = project.chapters[index + 1] ?? project.chapters[index - 1]
    onUpdate((current) => ({
      ...current,
      chapters: current.chapters.filter((item) => item.id !== chapter.id),
      trash: [{
        id: uid(), kind: 'chapter', title: chapter.title, deletedAt: now(), payload: chapter,
      }, ...current.trash],
    }))
    onSelectChapter(next.id)
  }

  const exportChapter = () => {
    if (!chapter) return
    const blob = new Blob([`${chapter.title}\n\n${chapter.content}`], { type: 'text/plain;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${project.title}-${chapter.title}.txt`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 0)
    onToast('本章已导出')
  }

  return (
    <>
      <div className="editor-workspace">
        <GenerationBanner project={project} onPause={onPause} onResume={onResume} />
        <div className="editor-main">
          <aside className="chapter-panel">
            <div className="chapter-panel-head">
              <strong>章节</strong>
              <div className="chapter-panel-actions">
                <button className="icon-button small" disabled aria-label="撤销章节操作"><Undo2 size={16} /></button>
                <button
                  className="icon-button small"
                  onClick={() => {
                    const next = createChapter(project.chapters.length + 1)
                    onUpdate((current) => ({ ...current, chapters: [...current.chapters, next] }))
                    onSelectChapter(next.id)
                  }}
                  aria-label="新建章节"
                  title="新建章节"
                ><Plus size={18} /></button>
                <button className={`icon-button small ${chapterSearchOpen ? 'active' : ''}`} onClick={() => setChapterSearchOpen((open) => !open)} aria-label="筛选章节" title="筛选章节"><SlidersHorizontal size={17} /></button>
              </div>
            </div>
            {chapterSearchOpen ? <label className="chapter-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索章节" /></label> : null}
            <div className="chapter-preface" title={project.synopsis || '作品序章'}>
              <BookOpenText size={16} /><span>序 · 引子</span><small>·</small>
            </div>
            <div className="chapter-list">
              {filteredChapters.map((item, index) => (
                <button key={item.id} className={`chapter-row ${item.id === chapter?.id ? 'active' : ''}`} onClick={() => onSelectChapter(item.id)}>
                  <span className="chapter-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="chapter-info">
                    <strong>{item.title}</strong>
                    <small>{countWords(item.content).toLocaleString()} 字</small>
                  </span>
                  {item.generationStatus === 'generating' ? <LoaderCircle className="spin chapter-generating" size={13} /> : (
                    <span className={`status-dot ${item.generationStatus === 'done' ? 'done' : item.status}`} />
                  )}
                </button>
              ))}
            </div>
            <div className="chapter-legend">
              <span>总字数&nbsp; {totalWords.toLocaleString()}</span>
              <i />
              <span>章节数&nbsp; {project.chapters.length}</span>
            </div>
          </aside>

          {chapter ? (
            <section className="writing-pane">
              <div className="writing-toolbar">
                <div className="history-buttons">
                  <button className="icon-button small" disabled aria-label="撤销" title="使用 Ctrl+Z 撤销"><Undo2 size={17} /></button>
                  <button className="icon-button small" disabled aria-label="重做" title="使用 Ctrl+Shift+Z 重做"><Redo2 size={17} /></button>
                </div>
                <div className="writing-meta">
                  <span className="saved-state"><Check size={14} />已自动保存</span>
                  <button className={`secondary-button compact mode-button edit-mode-button ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}><PenLine size={14} />编辑模式</button>
                  <button className={`secondary-button compact mode-button preview-mode-button ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}><Eye size={14} />预览模式</button>
                  <details className="chapter-action-menu">
                    <summary className="secondary-button compact"><Download size={14} />导出<ChevronDown size={13} /></summary>
                    <div>
                      <button onClick={exportChapter}><Download size={14} />导出本章</button>
                      <button onClick={onToggleAi}><MessageSquareText size={14} />打开 AI 助手</button>
                      <button onClick={() => setChapterSettingsOpen(true)}><SlidersHorizontal size={14} />章节设置</button>
                      <button className="danger" onClick={deleteChapter}><Trash2 size={14} />移到回收站</button>
                    </div>
                  </details>
                  <button className="icon-button small" disabled aria-label="恢复上一步"><Undo2 size={17} /></button>
                </div>
              </div>
              <div className="paper">
                <span className="paper-decoration paper-bamboo-art" aria-hidden="true" />
                <span className="paper-decoration paper-pavilion-art" aria-hidden="true" />
                <span className="paper-decoration paper-mist-art" aria-hidden="true" />
                <input className="chapter-title-input" value={chapter.title} onChange={(event) => patchChapter({ title: event.target.value })} readOnly={previewMode} aria-label="章节标题" />
                {chapter.generationStatus === 'generating' ? (
                  <div className="live-manuscript" aria-live="polite">
                    <div className="live-generation-strip">
                      <span><span className="live-sigil">☯</span>{chapter.workflowStage ? workflowStageLabels[chapter.workflowStage] : 'AI 正在生成'}</span>
                      <small>{countWords(chapter.content).toLocaleString()} 字</small>
                    </div>
                    <div className="live-manuscript-copy">
                      {chapter.content || <span className="live-placeholder">正在组织开篇场景与人物行动</span>}
                      <i className="streaming-caret" />
                    </div>
                  </div>
                ) : previewMode ? (
                  <div className="manuscript manuscript-preview">{chapter.content || <span className="live-placeholder">本章暂无正文</span>}</div>
                ) : (
                  <textarea
                    className="manuscript"
                    value={chapter.content}
                    onChange={(event) => patchChapter({ content: event.target.value })}
                    placeholder="从这里开始写作……"
                    spellCheck={false}
                  />
                )}
              </div>
              <footer className="editor-statusbar">
                <span>本章 {countWords(chapter.content).toLocaleString()} 字</span>
                <i />
                <span>预计 {Math.max(1, Math.ceil(countWords(chapter.content) / 450))} 分钟</span>
                <i />
                <button className="status-target-button" onClick={() => setChapterSettingsOpen(true)} aria-label="章节设置">{chapter.content.length.toLocaleString()} 字符</button>
              </footer>
              {!aiOpen ? (
                <button className="chapter-ai-trigger" onClick={onToggleAi} aria-label="打开章节 AI 助手" title="打开章节 AI 助手" aria-haspopup="dialog" aria-expanded={aiOpen} aria-controls="chapter-ai-panel">
                  <AiMark className="ai-launcher-mark" /><span>问 AI</span>
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
      {chapterSettingsOpen && chapter ? (
        <ChapterSettingsDialog
          chapter={chapter}
          onClose={() => setChapterSettingsOpen(false)}
          onSave={(value) => {
            onUpdate((current) => {
              const existingMemory = current.memories.find((item) => item.sourceChapterId === chapter.id)
              const memoryContent = value.memory?.trim()
              let memories = current.memories
              if (memoryContent) {
                const memory: MemoryItem = {
                  id: existingMemory?.id ?? uid(),
                  title: `${value.title} · 本章事实`,
                  content: memoryContent,
                  category: 'chapter',
                  pinned: true,
                  sourceChapterId: chapter.id,
                  updatedAt: now(),
                }
                memories = existingMemory
                  ? current.memories.map((item) => item.id === existingMemory.id ? memory : item)
                  : [memory, ...current.memories]
              }
              return {
                ...current,
                memories,
                chapters: current.chapters.map((item) => item.id === chapter.id ? { ...item, ...value, updatedAt: now() } : item),
              }
            })
            setChapterSettingsOpen(false)
            onToast('章节设置已保存')
          }}
        />
      ) : null}
    </>
  )
}

function ChapterSettingsDialog({ chapter, onClose, onSave }: { chapter: Chapter; onClose: () => void; onSave: (chapter: Chapter) => void }) {
  const [draft, setDraft] = useState(chapter)
  const targets = [1500, 2000, 2500, 3000, 4000]
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="dialog chapter-settings-dialog" onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
        <div className="dialog-head">
          <div><span className="dialog-icon"><SlidersHorizontal size={19} /></span><span><h2>章节设置</h2><p>独立控制本章篇幅、章纲和长期记忆</p></span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        </div>
        <div className="dialog-body">
          <div className="create-form-grid">
            <Field label="章节标题"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="章节状态"><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Chapter['status'] }))}><option value="draft">草稿</option><option value="revising">修订中</option><option value="done">已完成</option></select></Field>
          </div>
          <Field label="目标字数">
            <div className="word-target-control">
              <input type="number" min="500" max="10000" step="100" value={draft.targetWords} onChange={(event) => setDraft((current) => ({ ...current, targetWords: Math.min(10000, Math.max(500, Number(event.target.value) || 500)) }))} />
              <div className="word-target-presets">
                {targets.map((target) => <button type="button" key={target} className={draft.targetWords === target ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, targetWords: target }))}>{target}</button>)}
              </div>
            </div>
          </Field>
          <Field label="本章章纲"><textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} rows={6} /></Field>
          <Field label="本章需要记住的事实" hint="保存后会置顶进入书籍记忆库">
            <textarea value={draft.memory ?? ''} onChange={(event) => setDraft((current) => ({ ...current, memory: event.target.value }))} rows={4} placeholder="例如：林安左臂伤口已经结痂；韩尧第一次得知污染源来自研究所。" />
          </Field>
        </div>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button"><Check size={16} />保存章节设置</button></div>
      </form>
    </div>
  )
}

function GenerationBanner({ project, onPause, onResume }: { project: NovelProject; onPause: () => void; onResume: () => void }) {
  const generation = project.generation
  const done = project.chapters.filter((chapter) => chapter.generationStatus === 'done').length
  const progress = generation ? Math.round((done / Math.max(1, generation.totalChapters)) * 100) : 0
  const active = generation ? project.chapters[generation.currentChapterIndex] : undefined
  const stage = active?.workflowStage ? workflowStageLabels[active.workflowStage] : '等待继续'
  const modeLabel = generation?.qualityMode === 'fanqie' ? '番茄发布版' : generation?.qualityMode === 'standard' ? '标准成稿' : '快速初稿'
  const status = generation?.status ?? 'idle'
  const statusLabel = status === 'generating'
    ? `${stage} · 第 ${generation!.currentChapterIndex + 1} / ${generation!.totalChapters} 章`
    : status === 'error'
      ? '生成遇到问题'
      : status === 'completed'
        ? '全书初稿已生成'
        : status === 'paused'
          ? '草稿已保存'
          : '草稿已保存'

  return (
    <div className={`editor-status-row generation-banner ${status}`} aria-live="polite">
      <div className="book-status">
        <span className="generation-icon"><BookOpenText size={18} /></span>
        <span><strong>{project.title}</strong><small>{statusLabel}</small></span>
      </div>
      <div className="generation-copy">
        <div className="generation-progress"><span style={{ width: `${progress}%` }} /></div>
        <small>{generation ? modeLabel : `${project.chapters.length} 章 · ${project.genre}`}{generation?.error ? ` · ${generation.error}` : ''}</small>
      </div>
      {status === 'generating' ? (
        <button className="generation-action secondary-button compact" onClick={onPause}><Pause size={14} />暂停</button>
      ) : status === 'paused' || status === 'error' ? (
        <button className="generation-action primary-button compact" onClick={onResume}><Play size={14} />继续</button>
      ) : status === 'completed' ? (
        <span className="generation-finished"><Check size={15} />已完成</span>
      ) : null}
    </div>
  )
}

function CharactersView({ project, onUpdate }: { project: NovelProject; onUpdate: (updater: (project: NovelProject) => NovelProject) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(project.characters[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const selected = project.characters.find((item) => item.id === selectedId) ?? null
  const visible = project.characters.filter((item) => `${item.name}${item.role}${item.tags.join('')}`.toLowerCase().includes(query.toLowerCase()))

  const addCharacter = () => {
    const character: Character = {
      id: uid(), name: '新角色', role: '', description: '', motivation: '', conflict: '', tags: [], updatedAt: now(),
    }
    onUpdate((current) => ({ ...current, characters: [character, ...current.characters] }))
    setSelectedId(character.id)
  }
  const patch = (value: Partial<Character>) => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      characters: current.characters.map((item) => item.id === selected.id ? { ...item, ...value, updatedAt: now() } : item),
    }))
  }
  const remove = () => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      characters: current.characters.filter((item) => item.id !== selected.id),
      trash: [{ id: uid(), kind: 'character', title: selected.name, deletedAt: now(), payload: selected }, ...current.trash],
    }))
    setSelectedId(project.characters.find((item) => item.id !== selected.id)?.id ?? null)
  }

  return (
    <LibraryLayout
      title="角色"
      description={`${project.characters.length} 位角色`}
      query={query}
      onQuery={setQuery}
      addLabel="新建角色"
      onAdd={addCharacter}
      list={visible.length ? visible.map((character) => (
        <button key={character.id} className={`library-row ${selectedId === character.id ? 'active' : ''}`} onClick={() => setSelectedId(character.id)}>
          <span className="avatar"><UserRound size={20} /></span>
          <span><strong>{character.name}</strong><small>{character.role || '未设置角色定位'}</small></span>
        </button>
      )) : <LibraryEmpty icon={<UsersRound size={40} />} text="还没有角色" onAdd={addCharacter} />}
      editor={selected ? (
        <RecordEditor title="角色档案" onDelete={remove}>
          <Field label="姓名"><input value={selected.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
          <Field label="角色定位"><input value={selected.role} onChange={(event) => patch({ role: event.target.value })} placeholder="主角、对手、导师……" /></Field>
          <Field label="人物小传"><textarea value={selected.description} onChange={(event) => patch({ description: event.target.value })} rows={5} placeholder="经历、性格与外在特征" /></Field>
          <Field label="核心欲望"><textarea value={selected.motivation} onChange={(event) => patch({ motivation: event.target.value })} rows={3} placeholder="他/她最想得到什么？" /></Field>
          <Field label="内外冲突"><textarea value={selected.conflict} onChange={(event) => patch({ conflict: event.target.value })} rows={3} placeholder="什么阻挡了这个角色？" /></Field>
          <Field label="标签"><input value={selected.tags.join('，')} onChange={(event) => patch({ tags: event.target.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) })} placeholder="冷静，秘密身份，成长型" /></Field>
        </RecordEditor>
      ) : null}
    />
  )
}

type NoteKind = 'world' | 'plot' | 'ideas'

function NotesView({ kind, project, onUpdate }: { kind: NoteKind; project: NovelProject; onUpdate: (updater: (project: NovelProject) => NovelProject) => void }) {
  const key = kind === 'world' ? 'worldNotes' : kind === 'plot' ? 'plotNotes' : 'ideas'
  const notes = project[key]
  const config = noteConfig[kind]
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const selected = notes.find((item) => item.id === selectedId) ?? null
  const visible = notes.filter((item) => `${item.title}${item.content}${item.category}`.toLowerCase().includes(query.toLowerCase()))

  const add = () => {
    const note: NoteItem = { id: uid(), title: config.add, content: '', category: config.categories[0], updatedAt: now() }
    onUpdate((current) => ({ ...current, [key]: [note, ...current[key]] }))
    setSelectedId(note.id)
  }
  const patch = (value: Partial<NoteItem>) => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      [key]: current[key].map((item) => item.id === selected.id ? { ...item, ...value, updatedAt: now() } : item),
    }))
  }
  const remove = () => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      [key]: current[key].filter((item) => item.id !== selected.id),
      trash: [{ id: uid(), kind: kind === 'ideas' ? 'idea' : kind, title: selected.title, deletedAt: now(), payload: selected }, ...current.trash],
    }))
    setSelectedId(notes.find((item) => item.id !== selected.id)?.id ?? null)
  }

  return (
    <LibraryLayout
      title={config.title}
      description={`${notes.length} 条记录`}
      query={query}
      onQuery={setQuery}
      addLabel={config.add}
      onAdd={add}
      list={visible.length ? visible.map((item) => (
        <button key={item.id} className={`library-row ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
          <span className="note-glyph"><FileText size={18} /></span>
          <span><strong>{item.title}</strong><small>{item.category}</small></span>
        </button>
      )) : <LibraryEmpty icon={<FileText size={40} />} text={config.empty} onAdd={add} />}
      editor={selected ? (
        <RecordEditor title={config.title} onDelete={remove}>
          <Field label="标题"><input value={selected.title} onChange={(event) => patch({ title: event.target.value })} /></Field>
          <Field label="分类">
            <select value={selected.category} onChange={(event) => patch({ category: event.target.value })}>
              {config.categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="内容"><textarea className="large-textarea" value={selected.content} onChange={(event) => patch({ content: event.target.value })} placeholder="写下具体内容……" /></Field>
        </RecordEditor>
      ) : null}
    />
  )
}

function MemoryView({ project, onUpdate }: { project: NovelProject; onUpdate: (updater: (project: NovelProject) => NovelProject) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(project.memories[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const selected = project.memories.find((item) => item.id === selectedId) ?? null
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return [...project.memories]
      .filter((item) => !keyword || `${item.title}${item.content}${memoryCategoryLabels[item.category]}`.toLowerCase().includes(keyword))
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt)
  }, [project.memories, query])

  const add = () => {
    const memory: MemoryItem = {
      id: uid(), title: '新记忆', content: '', category: 'canon', pinned: true, updatedAt: now(),
    }
    onUpdate((current) => ({ ...current, memories: [memory, ...current.memories] }))
    setSelectedId(memory.id)
  }
  const patch = (value: Partial<MemoryItem>) => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      memories: current.memories.map((item) => item.id === selected.id ? { ...item, ...value, updatedAt: now() } : item),
    }))
  }
  const remove = () => {
    if (!selected) return
    onUpdate((current) => ({
      ...current,
      memories: current.memories.filter((item) => item.id !== selected.id),
      trash: [{ id: uid(), kind: 'memory', title: selected.title, deletedAt: now(), payload: selected }, ...current.trash],
    }))
    setSelectedId(project.memories.find((item) => item.id !== selected.id)?.id ?? null)
  }

  return (
    <LibraryLayout
      title="记忆库"
      description={`${project.memories.length} 条记忆 · ${project.memories.filter((item) => item.pinned).length} 条置顶`}
      query={query}
      onQuery={setQuery}
      addLabel="添加记忆"
      onAdd={add}
      list={visible.length ? visible.map((memory) => (
        <button key={memory.id} className={`library-row memory-row ${selectedId === memory.id ? 'active' : ''}`} onClick={() => setSelectedId(memory.id)}>
          <span className="memory-glyph"><BookMarked size={18} /></span>
          <span><strong>{memory.title}</strong><small>{memoryCategoryLabels[memory.category]}</small></span>
          {memory.pinned ? <Pin className="memory-pin" size={13} /> : null}
        </button>
      )) : <LibraryEmpty icon={<BookMarked size={40} />} text="还没有长期记忆" onAdd={add} />}
      editor={selected ? (
        <RecordEditor title="长期记忆" onDelete={remove}>
          <Field label="标题"><input value={selected.title} onChange={(event) => patch({ title: event.target.value })} /></Field>
          <Field label="类型">
            <select value={selected.category} onChange={(event) => patch({ category: event.target.value as MemoryCategory })}>
              {Object.entries(memoryCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="记忆内容"><textarea className="large-textarea" value={selected.content} onChange={(event) => patch({ content: event.target.value })} placeholder="AI 在后续规划、写作和审稿时会参考这条信息。" /></Field>
          <label className="toggle-row"><span><strong>优先记忆</strong><small>置顶后优先进入 AI 上下文，自动章节更新不会覆盖</small></span><input type="checkbox" checked={selected.pinned} onChange={(event) => patch({ pinned: event.target.checked })} /></label>
        </RecordEditor>
      ) : null}
    />
  )
}

interface LibraryLayoutProps {
  title: string
  description: string
  query: string
  onQuery: (value: string) => void
  addLabel: string
  onAdd: () => void
  list: ReactNode
  editor: ReactNode
}

function LibraryLayout(props: LibraryLayoutProps) {
  return (
    <div className="library-layout">
      <section className="library-index">
        <div className="section-heading">
          <div><h1>{props.title}</h1><p>{props.description}</p></div>
          <button className="primary-button compact" onClick={props.onAdd}><Plus size={17} />{props.addLabel}</button>
        </div>
        <label className="library-search"><Search size={16} /><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder={`搜索${props.title}`} /></label>
        <div className="library-list">{props.list}</div>
      </section>
      <section className="record-pane">{props.editor ?? <div className="select-hint">选择一条记录进行编辑</div>}</section>
    </div>
  )
}

function LibraryEmpty({ icon, text, onAdd }: { icon: ReactNode; text: string; onAdd: () => void }) {
  return <div className="library-empty"><span>{icon}</span><p>{text}</p><button className="text-button" onClick={onAdd}><Plus size={16} />立即创建</button></div>
}

function RecordEditor({ title, onDelete, children }: { title: string; onDelete: () => void; children: ReactNode }) {
  return (
    <div className="record-editor">
      <div className="record-editor-head"><strong>{title}</strong><button className="icon-button danger-hover" onClick={onDelete} aria-label="移到回收站"><Trash2 size={18} /></button></div>
      <div className="record-fields">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}{hint ? <small>{hint}</small> : null}</span>{children}</label>
}

function TrashView({ project, onUpdate }: { project: NovelProject; onUpdate: (updater: (project: NovelProject) => NovelProject) => void }) {
  const restore = (trash: TrashItem) => {
    onUpdate((current) => {
      const base = { ...current, trash: current.trash.filter((item) => item.id !== trash.id) }
      if (trash.kind === 'chapter') return { ...base, chapters: [...current.chapters, trash.payload as Chapter] }
      if (trash.kind === 'character') return { ...base, characters: [...current.characters, trash.payload as Character] }
      if (trash.kind === 'world') return { ...base, worldNotes: [...current.worldNotes, trash.payload as NoteItem] }
      if (trash.kind === 'plot') return { ...base, plotNotes: [...current.plotNotes, trash.payload as NoteItem] }
      if (trash.kind === 'idea') return { ...base, ideas: [...current.ideas, trash.payload as NoteItem] }
      if (trash.kind === 'memory') return { ...base, memories: [...current.memories, trash.payload as MemoryItem] }
      return base
    })
  }

  return (
    <div className="page-scroll narrow-page">
      <div className="section-heading page-heading"><div><h1>回收站</h1><p>删除的内容保留在当前小说中</p></div>
        {project.trash.length ? <button className="secondary-button danger" onClick={() => onUpdate((current) => ({ ...current, trash: [] }))}><Trash2 size={16} />清空回收站</button> : null}
      </div>
      {project.trash.length ? (
        <div className="trash-list">
          {project.trash.map((item) => (
            <div className="trash-row" key={item.id}>
              <span className="trash-icon"><Trash2 size={18} /></span>
              <span className="trash-info"><strong>{item.title}</strong><small>{trashKindLabel(item.kind)} · {new Date(item.deletedAt).toLocaleString('zh-CN')}</small></span>
              <button className="secondary-button compact" onClick={() => restore(item)}><ArchiveRestore size={16} />恢复</button>
              <button className="icon-button danger-hover" onClick={() => onUpdate((current) => ({ ...current, trash: current.trash.filter((trash) => trash.id !== item.id) }))} aria-label="永久删除"><X size={17} /></button>
            </div>
          ))}
        </div>
      ) : <div className="standalone-empty"><Trash2 size={42} /><h2>回收站是空的</h2><p>移除的章节和资料会暂存在这里。</p></div>}
    </div>
  )
}

const trashKindLabel = (kind: TrashItem['kind']) => ({
  chapter: '章节', character: '角色', world: '世界观', plot: '情节', idea: '灵感', memory: '记忆', project: '小说',
}[kind])

interface SettingsViewProps {
  data: AppData
  activeProject: NovelProject | null
  onToast: (message: string) => void
  onChange: (data: AppData | ((data: AppData) => AppData)) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onDeleteProject: (project: NovelProject) => void
  onRestoreProject: () => void
}

function SettingsView({ data, activeProject, onToast, onChange, onImport, onDeleteProject, onRestoreProject }: SettingsViewProps) {
  const patchSettings = (value: Partial<AppData['settings']>) => onChange((current) => ({ ...current, settings: { ...current.settings, ...value } }))
  const [draftProviderId, setDraftProviderId] = useState(data.settings.activeProviderId)
  const [draftProviders, setDraftProviders] = useState(() => data.settings.providers.map((provider) => ({ ...provider })))
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    const nextProviderId = data.settings.providers.some((provider) => provider.id === data.settings.activeProviderId)
      ? data.settings.activeProviderId
      : data.settings.providers[0]?.id ?? ''
    setDraftProviderId(nextProviderId)
    setDraftProviders(data.settings.providers.map((provider) => ({ ...provider })))
  }, [data.settings.activeProviderId, data.settings.providers])

  useEffect(() => { setShowApiKey(false) }, [draftProviderId])

  const draftProvider = draftProviders.find((provider) => provider.id === draftProviderId) ?? draftProviders[0]
  const currentProvider = data.settings.providers.find((provider) => provider.id === data.settings.activeProviderId) ?? data.settings.providers[0]
  const modelSettingsDirty = draftProviderId !== data.settings.activeProviderId
    || JSON.stringify(draftProviders) !== JSON.stringify(data.settings.providers)
  const modelSettingsValid = Boolean(draftProvider?.baseUrl.trim() && draftProvider.model.trim())

  const patchDraftProvider = (id: string, value: Partial<AppData['settings']['providers'][number]>) => {
    setDraftProviders((providers) => providers.map((provider) => provider.id === id ? { ...provider, ...value } : provider))
  }

  const resetModelSettings = () => {
    setDraftProviderId(data.settings.activeProviderId)
    setDraftProviders(data.settings.providers.map((provider) => ({ ...provider })))
    setShowApiKey(false)
  }

  const applyModelSettings = () => {
    if (!draftProvider || !modelSettingsDirty || !modelSettingsValid) return
    patchSettings({ activeProviderId: draftProvider.id, providers: draftProviders })
    onToast(`${draftProvider.name} 模型配置已应用`)
  }

  return (
    <div className="page-scroll settings-page">
      <div className="page-heading"><h1>设置</h1><p>密钥和创作数据仅保存在当前浏览器。</p></div>
      <SettingsSection title="AI 模型" description="选择默认模型，并填写对应服务商的访问凭证。">
        <div className="provider-choice-grid" role="radiogroup" aria-label="默认提供商">
          {draftProviders.map((provider) => {
            const selected = provider.id === draftProvider?.id
            const current = provider.id === currentProvider?.id
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${provider.name} · ${provider.model}`}
                className={`provider-choice ${selected ? 'selected' : ''} ${current ? 'current' : ''}`}
                key={provider.id}
                onClick={() => setDraftProviderId(provider.id)}
              >
                <ProviderMark id={provider.id} />
                <span className="provider-choice-copy"><strong>{provider.name}</strong><small>{provider.model}</small></span>
                <span className="provider-choice-state">
                  {selected ? <Check size={13} /> : null}
                  {current ? '当前使用' : selected ? '待确认' : provider.apiKey ? '已配置' : '未配置'}
                </span>
              </button>
            )
          })}
        </div>

        {draftProvider ? (
          <div className="provider-config">
            <div className="provider-config-head">
              <div><ProviderMark id={draftProvider.id} /><span><strong>{draftProvider.name} 配置</strong><small>{draftProvider.model}</small></span></div>
              <span className={`provider-key-state ${draftProvider.apiKey ? 'configured' : ''}`}><ShieldCheck size={14} />{draftProvider.apiKey ? '密钥已配置' : '密钥未配置'}</span>
            </div>
            <div className="provider-config-grid">
              <Field label="接口地址"><input value={draftProvider.baseUrl} onChange={(event) => patchDraftProvider(draftProvider.id, { baseUrl: event.target.value })} /></Field>
              <Field label="模型"><input value={draftProvider.model} onChange={(event) => patchDraftProvider(draftProvider.id, { model: event.target.value })} /></Field>
              <div className="field">
                <span id="provider-api-key-label">API Key<small>仅保存在当前浏览器</small></span>
                <div className="secret-input">
                  <input aria-labelledby="provider-api-key-label" type={showApiKey ? 'text' : 'password'} autoComplete="off" value={draftProvider.apiKey} onChange={(event) => patchDraftProvider(draftProvider.id, { apiKey: event.target.value })} placeholder="sk-••••••••" />
                  <button type="button" className="icon-button small" onClick={() => setShowApiKey((visible) => !visible)} aria-label={showApiKey ? '隐藏密钥' : '显示密钥'} title={showApiKey ? '隐藏密钥' : '显示密钥'}>
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="model-settings-actions">
          <span className={`model-settings-state ${modelSettingsDirty ? 'dirty' : ''}`} aria-live="polite">
            {modelSettingsDirty
              ? modelSettingsValid ? `将应用 ${draftProvider?.name ?? '所选模型'} 的新配置` : '请补全接口地址和模型名称'
              : <><Check size={14} />当前配置已应用</>}
          </span>
          <div>
            <button type="button" className="secondary-button" onClick={resetModelSettings} disabled={!modelSettingsDirty}><RotateCcw size={15} />撤销更改</button>
            <button type="button" className="primary-button model-confirm-button" onClick={applyModelSettings} disabled={!modelSettingsDirty || !modelSettingsValid}><Check size={16} />确定并应用</button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="小说 Skills" description="已内置到 AI 生成和质量流水线，可在一键创作时选择执行深度。">
        <div className="workflow-skill-list">
          {writingWorkflows.map((workflow, index) => (
            <div className="workflow-skill" key={workflow.id}>
              <span className="workflow-order">{index + 1}</span>
              <span><strong>{workflow.name}</strong><small>{workflow.source} · {workflow.description}</small></span>
              <span className="installed-badge"><Check size={12} />已安装</span>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="写作偏好" description="调整正文编辑区的阅读与输入体验。">
        <div className="settings-grid">
          <Field label="界面主题"><select value={data.settings.theme} onChange={(event) => patchSettings({ theme: event.target.value as AppData['settings']['theme'] })}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></Field>
          <Field label="正文字体"><select value={data.settings.fontFamily} onChange={(event) => patchSettings({ fontFamily: event.target.value as 'serif' | 'sans' })}><option value="serif">宋体 / 衬线</option><option value="sans">黑体 / 无衬线</option></select></Field>
          <Field label={`字号 · ${data.settings.fontSize}px`}><input type="range" min="15" max="24" value={data.settings.fontSize} onChange={(event) => patchSettings({ fontSize: Number(event.target.value) })} /></Field>
        </div>
      </SettingsSection>

      <SettingsSection title="本地数据" description="定期导出 JSON 备份，以便迁移浏览器或设备。">
        <div className="data-actions">
          <button className="secondary-button" onClick={() => exportData(data)}><Download size={17} />导出全部数据</button>
          <label className="secondary-button file-button"><Import size={17} />导入备份<input type="file" accept="application/json" onChange={onImport} /></label>
          <button className="secondary-button" onClick={onRestoreProject}><RotateCcw size={17} />恢复最近删除的小说</button>
        </div>
      </SettingsSection>

      {activeProject ? (
        <SettingsSection title="危险操作" description="删除小说后将从工作区移除，请先导出备份。" danger>
          <button className="secondary-button danger" onClick={() => {
            if (window.confirm(`确定删除《${activeProject.title}》吗？`)) onDeleteProject(activeProject)
          }}><Trash2 size={17} />删除当前小说</button>
        </SettingsSection>
      ) : null}
    </div>
  )
}

function SettingsSection({ title, description, children, danger = false }: { title: string; description: string; children: ReactNode; danger?: boolean }) {
  return <section className={`settings-section ${danger ? 'danger-section' : ''}`}><div className="settings-section-title"><h2>{title}</h2><p>{description}</p></div><div className="settings-section-body">{children}</div></section>
}

function ProviderMark({ id }: { id: string }) {
  const label = id === 'deepseek' ? 'DS' : id === 'openai' ? 'OA' : id === 'kimi' ? 'K' : 'AI'
  return <span className={`provider-logo provider-${id}`}>{label}</span>
}

function AiMark({ className = '' }: { className?: string }) {
  return (
    <span className={`ai-mark ${className}`} aria-hidden="true">
      <Feather className="ai-mark-feather" size={18} />
      <Sparkles className="ai-mark-spark" size={9} />
    </span>
  )
}

interface AiPanelProps {
  data: AppData
  project: NovelProject
  chapter: Chapter | null
  onClose: () => void
  onInsert: (chapterId: string, text: string) => void
  onReplace: (chapterId: string, text: string) => void
  onRestore: (chapterId: string) => void
}

type AiPanelMode = 'auto' | 'takeover'
type AiTurnIntent = 'chat' | 'takeover' | 'append'
type AiPanelPosition = { left: number; top: number }
type AiQuickAction = { label: string; prompt: string; icon: LucideIcon; intent: AiTurnIntent }

const AI_PANEL_VIEWPORT_GAP = 12
const AI_GREETING_PATTERN = /^(?:你好|您好|嗨|哈喽|hello|hi|在吗|早上好|下午好|晚上好|谢谢|多谢|感谢|好的|好呀|知道了|明白了|再见)[\s，,。.!！?？~～]*$/i
const AI_CONSULTATION_PATTERN = /(?:怎么|如何|为什么|哪里|哪些|是否|要不要|能否|可以吗|行吗|好吗|你觉得|建议|分析|评价|看法|有什么问题|需要改吗|[?？])/
const AI_ADVICE_ONLY_PATTERN = /(?:先别|不要|暂时别|无需).{0,10}(?:修改|改写|重写|替换|改正文|动正文).{0,16}(?:只|先).*(?:建议|分析|告诉|指出|讨论)/
const AI_APPEND_PATTERN = /(?:续写|接着写|往下写|补写后续)/
const AI_EDIT_ACTION_PATTERN = /(?:修改|改写|重写|润色|优化|调整|删减|压缩|精简|扩写|补写|替换|强化|增强|弱化|增加|减少|删除|修订|重构|提升|收紧|加快|放慢|改成|换成|改(?:一下|一遍|一版|下|得|为)|写(?:得|成))/
const AI_EXPLICIT_EDIT_PATTERN = /(?:^|[，,。；;！!\s])(?:请|帮我|替我|给我|直接|马上|麻烦|把|将|我想(?:要)?|我希望|需要)?\s*(?:修改|改写|重写|润色|优化|调整|删减|压缩|精简|扩写|补写|替换|强化|增强|弱化|增加|减少|删除|修订|重构|提升|收紧|加快|放慢|改成|换成|改(?:一下|一遍|一版|下|得|为)|写(?:得|成))/
const AI_EDIT_TARGET_PATTERN = /(?:本章|这章|这一章|章节|正文|原文|开头|结尾|章末|段落|这段|对白|对话|节奏|文风|视角|冲突|情节|场景|人物|氛围|钩子|字数|内容)/
const AI_SHORT_DIRECTIVE_PATTERN = /(?:更|再|少一些|多一些|快一点|慢一点|紧凑一点|有张力一点|突出|加强|收紧)/

const resolveAiTurnIntent = (prompt: string): AiTurnIntent => {
  const value = prompt.trim()
  if (!value || AI_GREETING_PATTERN.test(value) || AI_ADVICE_ONLY_PATTERN.test(value)) return 'chat'
  const consultation = AI_CONSULTATION_PATTERN.test(value)
  if (consultation && !AI_EXPLICIT_EDIT_PATTERN.test(value)) return 'chat'
  if (AI_APPEND_PATTERN.test(value)) return 'append'
  if (AI_EXPLICIT_EDIT_PATTERN.test(value) || (!consultation && AI_EDIT_ACTION_PATTERN.test(value))) return 'takeover'
  if (!consultation && AI_EDIT_TARGET_PATTERN.test(value) && AI_SHORT_DIRECTIVE_PATTERN.test(value)) return 'takeover'
  return 'chat'
}

const clampAiPanelPosition = (left: number, top: number, width: number, height: number): AiPanelPosition => ({
  left: Math.min(Math.max(AI_PANEL_VIEWPORT_GAP, left), Math.max(AI_PANEL_VIEWPORT_GAP, window.innerWidth - width - AI_PANEL_VIEWPORT_GAP)),
  top: Math.min(Math.max(AI_PANEL_VIEWPORT_GAP, top), Math.max(AI_PANEL_VIEWPORT_GAP, window.innerHeight - height - AI_PANEL_VIEWPORT_GAP)),
})

const normalizeAiChapter = (value: string) => value
  .trim()
  .replace(/^```(?:text|markdown)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim()

function AiPanel({ data, project, chapter, onClose, onInsert, onReplace, onRestore }: AiPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AiPanelMode>('auto')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseIntent, setResponseIntent] = useState<AiTurnIntent | null>(null)
  const [responseChapterId, setResponseChapterId] = useState<string | null>(null)
  const [revisionSourceContent, setRevisionSourceContent] = useState('')
  const [revisionSourceUpdatedAt, setRevisionSourceUpdatedAt] = useState(0)
  const [responseComplete, setResponseComplete] = useState(false)
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<AiPanelPosition | null>(null)
  const [panelDragging, setPanelDragging] = useState(false)
  const [desktopPanel, setDesktopPanel] = useState(() => window.matchMedia('(min-width: 641px)').matches)
  const abortRef = useRef<AbortController | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const panelDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const provider = data.settings.providers.find((item) => item.id === data.settings.activeProviderId) ?? data.settings.providers[0]
  const chapterLocked = chapter?.generationStatus === 'generating' || project.generation?.status === 'generating'

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 641px)')
    const syncPanelMode = () => {
      setDesktopPanel(media.matches)
      if (!media.matches) {
        panelDragRef.current = null
        setPanelDragging(false)
      }
    }
    syncPanelMode()
    media.addEventListener('change', syncPanelMode)
    return () => media.removeEventListener('change', syncPanelMode)
  }, [])
  useEffect(() => {
    const keepPanelInViewport = () => {
      setPanelPosition((current) => {
        if (!current || !desktopPanel || !panelRef.current) return current
        const box = panelRef.current.getBoundingClientRect()
        return clampAiPanelPosition(current.left, current.top, box.width, box.height)
      })
    }
    keepPanelInViewport()
    window.addEventListener('resize', keepPanelInViewport)
    return () => window.removeEventListener('resize', keepPanelInViewport)
  }, [desktopPanel])
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !streaming) onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, streaming])
  useEffect(() => {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    setStreaming(false)
    setError('')
    setResponseText('')
    setResponseIntent(null)
    setResponseChapterId(null)
    setRevisionSourceContent('')
    setRevisionSourceUpdatedAt(0)
    setResponseComplete(false)
    setReplaceConfirmOpen(false)
  }, [project.id, chapter?.id])

  const send = async (prompt = input, intentOverride?: AiTurnIntent) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || streaming || !provider) return
    const turnIntent = intentOverride ?? (mode === 'takeover' ? 'takeover' : resolveAiTurnIntent(cleanPrompt))
    if (turnIntent !== 'chat' && !chapter) return setError('请先选择要修改的章节')
    if (turnIntent !== 'chat' && chapterLocked) return setError('全书生成期间不能修改章节，请先暂停生成任务')
    const userMessage: AiMessage = { role: 'user', content: cleanPrompt }
    const nextMessages = [...messages, userMessage]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setResponseText('')
    setResponseIntent(turnIntent)
    setResponseChapterId(chapter?.id ?? null)
    setRevisionSourceContent(chapter?.content ?? '')
    setRevisionSourceUpdatedAt(chapter?.updatedAt ?? 0)
    setResponseComplete(false)
    setReplaceConfirmOpen(false)
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    let answer = ''
    try {
      const requestMessages: AiMessage[] = turnIntent === 'takeover' && chapter
        ? [...messages, { role: 'user', content: buildChapterTakeoverPrompt(project, chapter.id, cleanPrompt) }]
        : nextMessages
      await streamChat({
        provider,
        project,
        chapterTitle: chapter?.title,
        chapterContent: chapter?.content,
        chapterContextLimit: turnIntent === 'takeover' ? 1200 : 6000,
        interactionMode: turnIntent === 'chat' ? 'chat' : 'revision',
        messages: requestMessages,
        signal: controller.signal,
        onChunk: (chunk) => {
          answer += chunk
          setResponseText(answer)
          setMessages([...nextMessages, { role: 'assistant', content: answer }])
        },
      })
      setResponseComplete(Boolean(answer.trim()))
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'AI 请求失败')
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const quickActions: AiQuickAction[] = mode === 'takeover' ? [
    { label: '整体润色', prompt: '保留所有剧情事件和信息，只优化语言、段落节奏、动作与对白，让正文更自然有张力。', icon: Feather, intent: 'takeover' },
    { label: '强化冲突', prompt: '不改变本章事件结果，强化人物目标、阻力、对话博弈和情绪递进。', icon: Swords, intent: 'takeover' },
    { label: '改写开篇', prompt: '重点重写本章开头，让前 300 字更快进入冲突，同时完成整章必要的衔接修订。', icon: FilePenLine, intent: 'takeover' },
    { label: '压缩冗余', prompt: '删除重复说明、空泛心理和同构句，保留有效信息并让整章节奏更紧凑。', icon: Minimize2, intent: 'takeover' },
  ] : [
    { label: '续写正文', prompt: '请根据现有正文自然续写约800字，延续当前叙事视角、节奏和文风，直接输出正文。', icon: PenLine, intent: 'append' },
    { label: '润色建议', prompt: '请审阅当前章节，指出最值得优先修改的语言和节奏问题。', icon: ListChecks, intent: 'chat' },
    { label: '扩写场景', prompt: '找出当前章节最值得扩写的场景，说明应补足的感官、动作和人物反应。', icon: ScanText, intent: 'chat' },
    { label: '检查一致性', prompt: '结合角色、世界观和情节资料，检查当前章节的设定与人物行为是否存在矛盾。', icon: ShieldCheck, intent: 'chat' },
  ]
  const normalizedResponse = normalizeAiChapter(responseText)
  const responseMatchesChapter = Boolean(chapter && responseChapterId === chapter.id)
  const responseStale = Boolean(
    responseIntent === 'takeover'
    && chapter
    && responseMatchesChapter
    && chapter.content.trim() !== normalizedResponse
    && (chapter.content !== revisionSourceContent || chapter.updatedAt !== revisionSourceUpdatedAt),
  )
  const responseApplied = Boolean(chapter && normalizedResponse && chapter.content.trim() === normalizedResponse)
  const takeoverReady = responseIntent === 'takeover' && responseComplete && responseMatchesChapter && Boolean(normalizedResponse)
  const appendReady = responseIntent === 'append' && responseComplete && responseMatchesChapter && Boolean(normalizedResponse)
  const draftIntent = mode === 'takeover' ? 'takeover' : resolveAiTurnIntent(input)
  const visibleIntent = streaming && responseIntent ? responseIntent : draftIntent

  const applyTakeover = () => {
    if (!chapter || !takeoverReady || responseStale || responseApplied) return
    onReplace(chapter.id, normalizedResponse)
    setReplaceConfirmOpen(false)
  }

  const startPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!desktopPanel || !event.isPrimary || event.button !== 0 || !panelRef.current) return
    const target = event.target as HTMLElement
    if (target.closest('button:not(.ai-panel-drag-handle), input, textarea, select, a')) return
    const box = panelRef.current.getBoundingClientRect()
    panelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    }
    setPanelPosition({ left: box.left, top: box.top })
    setPanelDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const movePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPanelPosition(clampAiPanelPosition(
      drag.left + event.clientX - drag.startX,
      drag.top + event.clientY - drag.startY,
      drag.width,
      drag.height,
    ))
    event.preventDefault()
  }

  const stopPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panelDragRef.current?.pointerId !== event.pointerId) return
    panelDragRef.current = null
    setPanelDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const movePanelWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!desktopPanel || !panelRef.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    const distance = event.shiftKey ? 48 : 16
    const box = panelRef.current.getBoundingClientRect()
    const horizontal = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0
    const vertical = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0
    setPanelPosition(clampAiPanelPosition(box.left + horizontal, box.top + vertical, box.width, box.height))
    event.preventDefault()
  }

  return (
    <>
      <button className="ai-panel-scrim" onClick={onClose} aria-label="关闭章节 AI 助手" />
      <aside
        ref={panelRef}
        className={`ai-panel ${panelDragging ? 'dragging' : ''}`}
        id="chapter-ai-panel"
        role="dialog"
        aria-modal={!desktopPanel}
        aria-label="章节 AI 助手"
        data-draggable={desktopPanel}
        style={desktopPanel && panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto', bottom: 'auto' } : undefined}
      >
      <div
        className="ai-panel-head"
        onPointerDown={startPanelDrag}
        onPointerMove={movePanel}
        onPointerUp={stopPanelDrag}
        onPointerCancel={stopPanelDrag}
        onLostPointerCapture={() => { panelDragRef.current = null; setPanelDragging(false) }}
      >
        <div className="ai-panel-identity"><AiMark className="ai-panel-mark" /><span><strong>章节 AI 助手</strong><small>{chapter?.title ?? '未选择章节'} · {provider?.name}</small></span></div>
        <button type="button" className="ai-panel-drag-handle" onKeyDown={movePanelWithKeyboard} aria-label="拖动 AI 面板" title="拖动 AI 面板"><GripHorizontal size={19} /></button>
        <button className="icon-button" onClick={onClose} aria-label="关闭章节 AI 助手"><X size={19} /></button>
      </div>
      <div className="ai-mode-tabs" role="tablist" aria-label="AI 工作方式">
        <button type="button" role="tab" aria-selected={mode === 'auto'} className={mode === 'auto' ? 'active' : ''} onClick={() => { setMode('auto'); setReplaceConfirmOpen(false); setError('') }}><MessageSquareText size={15} />智能对话</button>
        <button type="button" role="tab" aria-selected={mode === 'takeover'} className={mode === 'takeover' ? 'active' : ''} onClick={() => { setMode('takeover'); setReplaceConfirmOpen(false); setError('') }}><FilePenLine size={15} />接管本章</button>
      </div>
      <div className="ai-chapter-context">
        <span><BookOpenText size={14} />{chapter?.title ?? '未选择章节'}</span>
        <small>{chapter ? `${countWords(chapter.content).toLocaleString()} 字` : '无正文'}</small>
      </div>
      <div className="quick-actions">
        {quickActions.map(({ label, prompt, icon: Icon, intent }) => <button key={label} disabled={streaming} onClick={() => void send(prompt, intent)}><Icon size={15} />{label}</button>)}
      </div>
      <div className="ai-messages">
        {!messages.length ? (
          <div className="ai-welcome"><AiMark className="ai-welcome-mark" /><h3>{mode === 'takeover' ? '等待修改要求' : '和当前章节聊聊'}</h3><p>{chapter?.title ?? '请选择章节'}</p></div>
        ) : messages.map((message, index) => (
          <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
            <span className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : <CircleUserRound size={16} />}</span>
            <div>{message.content || <span className="typing"><i /><i /><i /></span>}</div>
          </div>
        ))}
        {error ? <div className="ai-error" role="alert">{error}</div> : null}
        <div ref={messageEndRef} />
      </div>

      {!streaming && (takeoverReady || appendReady) ? (
        <div className="ai-result-actions" role="status">
          <span>{takeoverReady ? `${countWords(normalizedResponse).toLocaleString()} 字修订候选稿 · 尚未写入` : `${countWords(normalizedResponse).toLocaleString()} 字续写`}</span>
          {appendReady && chapter ? <button type="button" className="secondary-button compact" onClick={() => onInsert(chapter.id, normalizedResponse)}><FilePlus2 size={15} />追加到正文</button> : null}
          {takeoverReady && responseStale ? <em>正文已变化，请重新生成候选稿</em> : null}
          {takeoverReady && responseApplied ? <em className="applied"><Check size={13} />{chapter?.aiRevisionBackup ? '本版本已应用' : '候选稿与正文相同'}</em> : null}
          {takeoverReady && !responseStale && !responseApplied ? <button type="button" className="primary-button compact" onClick={() => setReplaceConfirmOpen(true)}><Replace size={15} />预览并替换</button> : null}
        </div>
      ) : null}

      {replaceConfirmOpen && chapter ? (
        <div className="ai-takeover-confirm" role="alert">
          <div><ShieldCheck size={18} /><span><strong>确认替换《{chapter.title}》</strong><small>当前正文会保留为可恢复版本</small></span></div>
          <div><button type="button" className="secondary-button compact" onClick={() => setReplaceConfirmOpen(false)}>取消</button><button type="button" className="primary-button compact" onClick={applyTakeover} disabled={responseStale}>确认替换</button></div>
        </div>
      ) : null}

      {chapter?.aiRevisionBackup ? (
        <div className="ai-restore-bar"><span><RotateCcw size={14} />保留有 AI 修改前版本</span><button type="button" onClick={() => onRestore(chapter.id)}>恢复原文</button></div>
      ) : null}

      <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <textarea autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder={mode === 'takeover' ? '说明这一章要怎么改……' : '和 AI 对话，或直接说修改要求……'} rows={3} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
        }} />
        <div><span className={`ai-intent-state ${visibleIntent}`}>
          {visibleIntent === 'takeover' ? <FilePenLine size={12} /> : visibleIntent === 'append' ? <PenLine size={12} /> : <MessageSquareText size={12} />}
          {visibleIntent === 'takeover' ? '生成修改稿' : visibleIntent === 'append' ? '生成续写' : '聊天回复'}
        </span>{streaming ? (
          <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()} aria-label="停止生成"><Square size={14} fill="currentColor" /></button>
        ) : <button type="submit" className="send-button" disabled={!input.trim()} aria-label="发送"><Send size={16} /></button>}</div>
      </form>
      </aside>
    </>
  )
}

function AiCreateDialog({
  data,
  onClose,
  onCreate,
  onOpenSettings,
  onManual,
}: {
  data: AppData
  onClose: () => void
  onCreate: (plan: AiNovelPlan, request: AiNovelRequest) => void
  onOpenSettings: () => void
  onManual: () => void
}) {
  const [request, setRequest] = useState<AiNovelRequest>({
    idea: '',
    genre: '都市悬疑',
    chapterCount: 10,
    wordsPerChapter: 2500,
    style: '画面感强，节奏紧凑，对话自然',
    constraints: '',
    providerId: data.settings.activeProviderId,
    qualityMode: 'standard',
  })
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const provider = data.settings.providers.find((item) => item.id === request.providerId)

  useEffect(() => () => abortRef.current?.abort(), [])
  const patch = <K extends keyof AiNovelRequest>(key: K, value: AiNovelRequest[K]) => setRequest((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!request.idea.trim() || !provider || planning) return
    if (!provider.apiKey.trim()) return setError(`请先填写 ${provider.name} API Key`)
    setPlanning(true)
    setError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const plan = await generateNovelPlan(provider, request, controller.signal)
      onCreate(plan, request)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '生成大纲失败')
    } finally {
      setPlanning(false)
      abortRef.current = null
    }
  }

  const qualityModes: Array<{ id: AiNovelRequest['qualityMode']; name: string; caption: string; stages: string }> = [
    { id: 'draft', name: '快速初稿', caption: '每章 1 次生成', stages: '大纲规划 → 分章写作' },
    { id: 'standard', name: '标准成稿', caption: '每章约 3 次调用', stages: '写作 → 审稿 → 系统修订' },
    { id: 'fanqie', name: '番茄发布版', caption: '每章约 4 次调用', stages: '写作 → 审稿 → 修订 → 番茄终审' },
  ]

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !planning) onClose() }}>
      <form className="dialog ai-create-dialog" onSubmit={(event) => void submit(event)}>
        <div className="dialog-head ai-create-head">
          <div><span className="dialog-icon"><Sparkles size={20} /></span><span><h2>AI 一键创作</h2><p>从一个想法生成设定、大纲和全书正文</p></span></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={planning} aria-label="关闭"><X size={19} /></button>
        </div>
        <div className="dialog-body ai-create-body">
          <Field label="核心创意">
            <textarea autoFocus value={request.idea} onChange={(event) => patch('idea', event.target.value)} rows={5} placeholder="例如：一个专门替死者投递遗书的快递员，收到了一封写给自己的信……" />
          </Field>

          <div className="create-form-grid">
            <Field label="题材">
              <select value={request.genre} onChange={(event) => patch('genre', event.target.value)}>
                {['都市悬疑', '玄幻修仙', '现代言情', '古代言情', '科幻未来', '历史架空', '规则怪谈', '现实题材'].map((genre) => <option key={genre}>{genre}</option>)}
              </select>
            </Field>
            <Field label="AI 模型">
              <select value={request.providerId} onChange={(event) => patch('providerId', event.target.value)}>
                {data.settings.providers.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.model}</option>)}
              </select>
            </Field>
            <Field label="章节数">
              <input type="number" min="3" max="100" value={request.chapterCount} onChange={(event) => patch('chapterCount', Math.min(100, Math.max(3, Number(event.target.value) || 3)))} />
            </Field>
            <Field label="每章目标字数">
              <input type="number" min="1000" max="5000" step="100" value={request.wordsPerChapter} onChange={(event) => patch('wordsPerChapter', Math.min(5000, Math.max(1000, Number(event.target.value) || 1000)))} />
            </Field>
          </div>

          <Field label="文风">
            <input value={request.style} onChange={(event) => patch('style', event.target.value)} placeholder="叙事视角、节奏、语言气质" />
          </Field>
          <Field label="额外约束">
            <textarea value={request.constraints} onChange={(event) => patch('constraints', event.target.value)} rows={2} placeholder="主角限制、感情线、结局方向、禁止内容……" />
          </Field>

          <fieldset className="quality-fieldset">
            <legend>质量流程</legend>
            <div className="quality-options">
              {qualityModes.map((mode) => (
                <label className={`quality-option ${request.qualityMode === mode.id ? 'active' : ''}`} key={mode.id}>
                  <input type="radio" name="quality" value={mode.id} checked={request.qualityMode === mode.id} onChange={() => patch('qualityMode', mode.id)} />
                  <span><strong>{mode.name}</strong><small>{mode.caption}</small><em>{mode.stages}</em></span>
                  <i>{request.qualityMode === mode.id ? <Check size={13} /> : null}</i>
                </label>
              ))}
            </div>
          </fieldset>

          {!provider?.apiKey ? <div className="api-key-notice"><ShieldCheck size={16} /><span>当前模型尚未配置 API Key</span><button type="button" onClick={onOpenSettings}>前往设置</button></div> : null}
          {error ? <div className="ai-error create-error">{error}</div> : null}
        </div>
        <div className="dialog-actions ai-create-actions">
          <button type="button" className="text-button" onClick={onManual} disabled={planning}>手动创建空白项目</button>
          <span />
          <button type="button" className="secondary-button" onClick={onClose} disabled={planning}>取消</button>
          <button type="submit" className="primary-button generate-book-button" disabled={!request.idea.trim() || planning || !provider?.apiKey}>
            {planning ? <><LoaderCircle className="spin" size={17} />正在规划全书</> : <><Sparkles size={17} />生成整部小说</>}
          </button>
        </div>
      </form>
    </div>
  )
}

function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, genre: string, synopsis: string) => void }) {
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim()) onCreate(title, genre, synopsis)
  }
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="dialog" onSubmit={submit}>
        <div className="dialog-head"><div><span className="dialog-icon"><BookOpenText size={20} /></span><span><h2>开始一部新小说</h2><p>随时可以在设置中修改这些信息</p></span></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></div>
        <div className="dialog-body">
          <Field label="小说名称"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：雾城来信" /></Field>
          <Field label="作品类型"><input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="悬疑、都市、科幻……" /></Field>
          <Field label="一句话简介"><textarea value={synopsis} onChange={(event) => setSynopsis(event.target.value)} rows={3} placeholder="主角是谁，他/她想要什么，又将面对什么？" /></Field>
        </div>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!title.trim()}><Plus size={17} />创建小说</button></div>
      </form>
    </div>
  )
}

export default App
