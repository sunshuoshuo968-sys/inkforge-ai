import type {
  AiNovelPlan,
  AiNovelRequest,
  AppData,
  Chapter,
  ImportedBookLore,
  MemoryCategory,
  NoteItem,
  NovelProject,
} from "./types";

export const uid = () => crypto.randomUUID();

export const now = () => Date.now();

export const createChapter = (index = 1): Chapter => ({
  id: uid(),
  title: `第${index}章`,
  summary: "",
  content: "",
  targetWords: 2500,
  status: "draft",
  createdAt: now(),
  updatedAt: now(),
});

export const createProject = (
  title: string,
  genre: string,
  synopsis: string,
): NovelProject => ({
  id: uid(),
  title: title.trim() || "未命名小说",
  genre: genre.trim() || "未分类",
  synopsis: synopsis.trim(),
  coverColor: ["#2f8f75", "#c36b4b", "#58779b", "#75618c"][
    Math.floor(Math.random() * 4)
  ],
  createdAt: now(),
  updatedAt: now(),
  origin: "manual",
  chapters: [createChapter()],
  characters: [],
  worldNotes: [],
  plotNotes: [],
  ideas: [],
  memories: [],
  seasoningScenes: [],
  seasoningSignals: [],
  seasoningRules: [],
  trash: [],
  aiMemory: [],
  aiOperations: [],
  aiUsage: [],
});

export const createAiProject = (
  plan: AiNovelPlan,
  request: AiNovelRequest,
): NovelProject => {
  const timestamp = now();
  return {
    id: uid(),
    title: plan.title.trim() || "AI 生成小说",
    genre: plan.genre.trim() || request.genre || "未分类",
    synopsis: plan.synopsis.trim(),
    coverColor: ["#2f8f75", "#c36b4b", "#58779b", "#75618c"][
      Math.floor(Math.random() * 4)
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    origin: "ai",
    chapters: plan.chapters
      .slice(0, request.chapterCount)
      .map((chapter, index) => ({
        id: uid(),
        title: chapter.title.trim() || `第${index + 1}章`,
        summary: [
          chapter.summary.trim(),
          chapter.goal ? `目标：${chapter.goal}` : "",
          chapter.obstacle ? `阻力：${chapter.obstacle}` : "",
          chapter.cost ? `代价：${chapter.cost}` : "",
          chapter.strand ? `主线类型：${chapter.strand}` : "",
          chapter.hook ? `章末钩子：${chapter.hook}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        content: "",
        targetWords: request.wordsPerChapter,
        status: "draft",
        generationStatus: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    characters: plan.characters.map((character) => ({
      id: uid(),
      name: character.name || "未命名角色",
      role: character.role || "",
      description: character.description || "",
      motivation: character.motivation || "",
      conflict: character.conflict || "",
      tags: Array.isArray(character.tags) ? character.tags : [],
      updatedAt: timestamp,
    })),
    worldNotes: plan.world.map((item) => ({
      id: uid(),
      title: item.title,
      category: item.category || "规则",
      content: item.content,
      updatedAt: timestamp,
    })),
    plotNotes: plan.plot.map((item) => ({
      id: uid(),
      title: item.title,
      category: item.category || "主线",
      content: item.content,
      updatedAt: timestamp,
    })),
    ideas: [
      {
        id: uid(),
        title: "原始创意",
        category: "点子",
        content: request.idea,
        updatedAt: timestamp,
      },
    ],
    memories: [
      {
        id: uid(),
        title: "作品核心",
        content: plan.synopsis,
        category: "canon",
        pinned: true,
        updatedAt: timestamp,
      },
    ],
    seasoningScenes: [],
    seasoningSignals: [],
    seasoningRules: [],
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
      status: "generating",
      startedAt: timestamp,
    },
  };
};

export const defaultData: AppData = {
  version: 1,
  projects: [],
  activeProjectId: null,
  aiUsage: [],
  settings: {
    theme: "light",
    fontFamily: "serif",
    fontSize: 18,
    activeProviderId: "deepseek",
    providers: [
      {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "",
        model: "deepseek-chat",
        enabled: true,
        breakArmorPrompt: "",
      },
      {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com",
        apiKey: "",
        model: "gpt-4.1-mini",
        enabled: true,
        breakArmorPrompt: "",
      },
      {
        id: "kimi",
        name: "Kimi",
        baseUrl: "https://api.moonshot.cn/v1",
        apiKey: "",
        model: "kimi-k2.6",
        enabled: true,
        breakArmorPrompt: "",
      },
    ],
  },
};

export const countWords = (text: string) => {
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return chinese + words;
};

const memoryCategories: MemoryCategory[] = [
  "canon",
  "character",
  "timeline",
  "foreshadowing",
  "style",
  "chapter",
];

const normalizeMemoryCategory = (value: unknown): MemoryCategory =>
  memoryCategories.includes(value as MemoryCategory)
    ? (value as MemoryCategory)
    : "canon";

/** 将 AI 提炼的设定合并进导入作品（保留章节正文）。 */
export const applyImportedLore = (
  project: NovelProject,
  lore: ImportedBookLore,
  options?: { replaceExisting?: boolean },
): NovelProject => {
  const timestamp = now();
  const replace = options?.replaceExisting ?? true;
  const characters = lore.characters.map((character) => ({
    id: uid(),
    name: character.name?.trim() || "未命名角色",
    role: character.role || "",
    description: character.description || "",
    motivation: character.motivation || "",
    conflict: character.conflict || "",
    tags: Array.isArray(character.tags) ? character.tags : [],
    updatedAt: timestamp,
  }));
  const worldNotes = lore.world.map((item) => ({
    id: uid(),
    title: item.title?.trim() || "未命名设定",
    category: item.category || "规则",
    content: item.content || "",
    updatedAt: timestamp,
  }));
  const plotNotes = lore.plot.map((item) => ({
    id: uid(),
    title: item.title?.trim() || "未命名情节",
    category: item.category || "主线",
    content: item.content || "",
    updatedAt: timestamp,
  }));
  const memories = lore.memories.map((item) => ({
    id: uid(),
    title: item.title?.trim() || "记忆",
    content: item.content || "",
    category: normalizeMemoryCategory(item.category),
    pinned: Boolean(item.pinned ?? item.category === "canon"),
    updatedAt: timestamp,
  }));

  const summaryMap = new Map(
    (lore.chapterSummaries ?? [])
      .filter((item) => Number.isFinite(item.index))
      .map((item) => [
        Math.max(0, Math.floor(item.index) - 1),
        item.summary.trim(),
      ]),
  );

  return {
    ...project,
    title: lore.title?.trim() || project.title,
    genre: lore.genre?.trim() || project.genre,
    synopsis: lore.synopsis?.trim() || project.synopsis,
    updatedAt: timestamp,
    characters: replace ? characters : [...characters, ...project.characters],
    worldNotes: replace ? worldNotes : [...worldNotes, ...project.worldNotes],
    plotNotes: replace ? plotNotes : [...plotNotes, ...project.plotNotes],
    memories: replace ? memories : [...memories, ...project.memories],
    chapters: project.chapters.map((chapter, index) => {
      const summary = summaryMap.get(index);
      if (!summary) return chapter;
      return { ...chapter, summary, updatedAt: timestamp };
    }),
    ideas: [
      {
        id: uid(),
        title: "AI 提炼说明",
        category: "点子",
        content: `已根据目录与正文抽样提炼设定（角色 ${characters.length}、世界观 ${worldNotes.length}、情节 ${plotNotes.length}、记忆 ${memories.length}）。可在对应页面继续修订。`,
        updatedAt: timestamp,
      },
      ...project.ideas,
    ],
  };
};

const mergeText = (existing: string, incoming: string) => {
  const left = existing.trim();
  const right = incoming.trim();
  if (!right) return left;
  if (!left) return right;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}\n${right}`;
};

const normalizeMatchKey = (value: string) => value.trim().toLowerCase();

/** 将按章解析的设定增量合并进现有设定（按姓名/标题富化，记忆追加）。 */
export const supplementProjectLore = (
  project: NovelProject,
  lore: ImportedBookLore,
  options?: { chapterIndexes?: number[]; skipIdeaNote?: boolean },
): NovelProject => {
  const timestamp = now();
  const chapterIndexes = options?.chapterIndexes ?? [];
  const skipIdeaNote = options?.skipIdeaNote ?? false;

  let characters = [...project.characters];
  for (const incoming of lore.characters) {
    const name = incoming.name?.trim() || "未命名角色";
    const key = normalizeMatchKey(name);
    const index = characters.findIndex(
      (item) => normalizeMatchKey(item.name) === key,
    );
    if (index >= 0) {
      const current = characters[index];
      characters[index] = {
        ...current,
        role: incoming.role?.trim() || current.role,
        description: mergeText(current.description, incoming.description || ""),
        motivation: mergeText(current.motivation, incoming.motivation || ""),
        conflict: mergeText(current.conflict, incoming.conflict || ""),
        tags: Array.from(
          new Set([
            ...current.tags,
            ...(Array.isArray(incoming.tags) ? incoming.tags.map(String) : []),
          ]),
        ),
        updatedAt: timestamp,
      };
    } else {
      characters = [
        {
          id: uid(),
          name,
          role: incoming.role || "",
          description: incoming.description || "",
          motivation: incoming.motivation || "",
          conflict: incoming.conflict || "",
          tags: Array.isArray(incoming.tags) ? incoming.tags.map(String) : [],
          updatedAt: timestamp,
        },
        ...characters,
      ];
    }
  }

  const mergeNotes = (
    existing: NoteItem[],
    incoming: Array<{ title: string; category: string; content: string }>,
  ) => {
    let notes = [...existing];
    for (const item of incoming) {
      const title = item.title?.trim() || "未命名";
      const key = normalizeMatchKey(title);
      const index = notes.findIndex(
        (note) => normalizeMatchKey(note.title) === key,
      );
      if (index >= 0) {
        const current = notes[index];
        notes[index] = {
          ...current,
          category: item.category?.trim() || current.category,
          content: mergeText(current.content, item.content || ""),
          updatedAt: timestamp,
        };
      } else {
        notes = [
          {
            id: uid(),
            title,
            category: item.category || "规则",
            content: item.content || "",
            updatedAt: timestamp,
          },
          ...notes,
        ];
      }
    }
    return notes;
  };

  const worldNotes = mergeNotes(project.worldNotes, lore.world);
  const plotNotes = mergeNotes(
    project.plotNotes,
    lore.plot.map((item) => ({
      ...item,
      category: item.category || "主线",
    })),
  );

  let memories = [...project.memories];
  for (const item of lore.memories) {
    const title = item.title?.trim() || "记忆";
    const content = item.content?.trim() || "";
    if (!content) continue;
    const category = normalizeMemoryCategory(item.category);
    const duplicate = memories.some(
      (memory) =>
        normalizeMatchKey(memory.title) === normalizeMatchKey(title) &&
        memory.category === category &&
        (memory.content.includes(content) || content.includes(memory.content)),
    );
    if (duplicate) continue;
    memories = [
      {
        id: uid(),
        title,
        content,
        category,
        pinned: Boolean(item.pinned ?? category === "canon"),
        updatedAt: timestamp,
      },
      ...memories,
    ];
  }

  const summaryMap = new Map(
    (lore.chapterSummaries ?? [])
      .filter((item) => Number.isFinite(item.index))
      .map((item) => [
        Math.max(0, Math.floor(item.index) - 1),
        item.summary.trim(),
      ]),
  );

  const chapterLabel =
    chapterIndexes.length > 0
      ? chapterIndexes.map((index) => `第${index + 1}章`).join("、")
      : "指定章节";

  return {
    ...project,
    title: project.title.trim() ? project.title : lore.title?.trim() || project.title,
    genre: project.genre.trim() ? project.genre : lore.genre?.trim() || project.genre,
    synopsis: project.synopsis.trim()
      ? project.synopsis
      : lore.synopsis?.trim() || project.synopsis,
    updatedAt: timestamp,
    characters,
    worldNotes,
    plotNotes,
    memories,
    chapters: project.chapters.map((chapter, index) => {
      const summary = summaryMap.get(index);
      if (!summary) return chapter;
      return {
        ...chapter,
        summary: chapter.summary.trim()
          ? mergeText(chapter.summary, summary)
          : summary,
        updatedAt: timestamp,
      };
    }),
    ideas: skipIdeaNote
      ? project.ideas
      : [
          {
            id: uid(),
            title: "三章补充设定",
            category: "点子",
            content: `已根据${chapterLabel}解析并补充设定（本批角色 ${lore.characters.length}、世界观 ${lore.world.length}、情节 ${lore.plot.length}、记忆 ${lore.memories.length}）。同名条目已合并增强，可在对应页面继续修订。`,
            updatedAt: timestamp,
          },
          ...project.ideas,
        ],
  };
};

export const appendIdeaReport = (
  project: NovelProject,
  title: string,
  content: string,
  category = "工具报告",
): NovelProject => {
  const timestamp = now();
  return {
    ...project,
    updatedAt: timestamp,
    ideas: [
      {
        id: uid(),
        title,
        category,
        content: content.trim(),
        updatedAt: timestamp,
      },
      ...project.ideas,
    ],
  };
};

export const applyChapterSummaries = (
  project: NovelProject,
  summaries: Array<{ index: number; summary: string }>,
  options?: { replace?: boolean },
): NovelProject => {
  const timestamp = now();
  const replace = options?.replace ?? true;
  const map = new Map(
    summaries
      .filter((item) => Number.isFinite(item.index) && item.summary.trim())
      .map((item) => [
        Math.max(0, Math.floor(item.index) - 1),
        item.summary.trim(),
      ]),
  );
  if (!map.size) return project;
  return {
    ...project,
    updatedAt: timestamp,
    chapters: project.chapters.map((chapter, index) => {
      const summary = map.get(index);
      if (!summary) return chapter;
      return {
        ...chapter,
        summary: replace
          ? summary
          : chapter.summary.trim()
            ? mergeText(chapter.summary, summary)
            : summary,
        updatedAt: timestamp,
      };
    }),
  };
};

export const applyStyleFingerprint = (
  project: NovelProject,
  fingerprint: string,
): NovelProject => {
  const content = fingerprint.trim();
  if (!content) return project;
  const timestamp = now();
  const existing = project.memories.find(
    (item) =>
      item.category === "style" &&
      (item.title.includes("文风指纹") || item.pinned),
  );
  const memory = {
    id: existing?.id ?? uid(),
    title: "文风指纹",
    content: existing ? mergeText(existing.content, content) : content,
    category: "style" as const,
    pinned: true,
    updatedAt: timestamp,
  };
  return {
    ...project,
    updatedAt: timestamp,
    memories: existing
      ? project.memories.map((item) =>
          item.id === existing.id ? memory : item,
        )
      : [memory, ...project.memories],
  };
};

export const applyTimelineAndArcs = (
  project: NovelProject,
  payload: {
    memories?: ImportedBookLore["memories"];
    plot?: ImportedBookLore["plot"];
  },
): NovelProject =>
  supplementProjectLore(
    project,
    {
      characters: [],
      world: [],
      plot: payload.plot ?? [],
      memories: payload.memories ?? [],
    },
    {},
  );

export const applyGapFills = (
  project: NovelProject,
  lore: ImportedBookLore,
): NovelProject => supplementProjectLore(project, lore, {});

export const applyChapterDigests = (
  project: NovelProject,
  digests: Array<{ index: number; title: string; content: string }>,
): NovelProject => {
  const timestamp = now();
  let memories = [...project.memories];
  for (const digest of digests) {
    const chapterIndex = Math.max(0, Math.floor(digest.index) - 1);
    const chapter = project.chapters[chapterIndex];
    if (!chapter || !digest.content.trim()) continue;
    const existing = memories.find(
      (item) =>
        item.sourceChapterId === chapter.id && item.category === "chapter",
    );
    const memory = {
      id: existing?.id ?? uid(),
      title:
        digest.title.trim() ||
        `第${chapterIndex + 1}章沉淀 · ${chapter.title}`,
      content: digest.content.trim(),
      category: "chapter" as const,
      pinned: existing?.pinned ?? false,
      sourceChapterId: chapter.id,
      updatedAt: timestamp,
    };
    memories = existing
      ? memories.map((item) => (item.id === existing.id ? memory : item))
      : [memory, ...memories];
  }
  return { ...project, updatedAt: timestamp, memories };
};

/** 追加空章节，写入续写大纲生成的标题与章纲。 */
export const appendContinueOutlineChapters = (
  project: NovelProject,
  outline: Array<{ title: string; summary: string }>,
  options?: { targetWords?: number },
): NovelProject => {
  const chapters = outline
    .map((item) => ({
      title: item.title.trim(),
      summary: item.summary.trim(),
    }))
    .filter((item) => item.summary);
  if (!chapters.length) return project;
  const timestamp = now();
  const targetWords =
    options?.targetWords ||
    project.chapters.at(-1)?.targetWords ||
    2500;
  const start = project.chapters.length;
  const appended = chapters.map((item, offset) => ({
    ...createChapter(start + offset + 1),
    title: item.title || `第${start + offset + 1}章`,
    summary: item.summary,
    targetWords,
    status: "draft" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  return {
    ...project,
    updatedAt: timestamp,
    chapters: [...project.chapters, ...appended],
  };
};

/** 复制设定创建续作项目，不复制前作正文。 */
export const createSequelProject = (source: NovelProject): NovelProject => {
  const timestamp = now();
  const baseTitle = source.title.replace(/（续）$/, "").trim() || "未命名小说";
  return {
    id: uid(),
    title: `${baseTitle}（续）`,
    genre: source.genre,
    synopsis: source.synopsis
      ? `${source.synopsis}\n\n（续作：继承前作设定，正文待开写）`
      : "续作：继承前作设定，正文待开写",
    coverColor: source.coverColor,
    createdAt: timestamp,
    updatedAt: timestamp,
    origin: "sequel",
    chapters: [
      {
        ...createChapter(1),
        title: "续·第一章",
        summary: "承接前作结局，开启新的冲突。",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    characters: source.characters.map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    worldNotes: source.worldNotes.map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    plotNotes: source.plotNotes.map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    ideas: [
      {
        id: uid(),
        title: "续作说明",
        category: "点子",
        content: `由《${source.title}》创建续作，已继承角色 ${source.characters.length}、世界观 ${source.worldNotes.length}、情节 ${source.plotNotes.length}、记忆 ${source.memories.length}。不含前作正文。`,
        updatedAt: timestamp,
      },
    ],
    memories: source.memories.map((item) => ({
      ...item,
      id: uid(),
      sourceChapterId: undefined,
      updatedAt: timestamp,
    })),
    seasoningScenes: (source.seasoningScenes ?? []).map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    seasoningSignals: (source.seasoningSignals ?? []).map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    seasoningRules: (source.seasoningRules ?? []).map((item) => ({
      ...item,
      id: uid(),
      updatedAt: timestamp,
    })),
    trash: [],
    aiMemory: [],
    aiOperations: [],
    aiUsage: [],
  };
};
