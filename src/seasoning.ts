import type { NovelProject, NoteItem } from "./types";

export type SeasoningHit = {
  id: string;
  signalId: string;
  signalTitle: string;
  matchedText: string;
  start: number;
  end: number;
  /** 含命中前后文的局部片段，供意见 / 局部改写 */
  excerpt: string;
  excerptStart: number;
  excerptEnd: number;
  sceneId?: string;
  /** manual = 正文拖选；signal = 识别点扫描 */
  source?: "manual" | "signal";
};

const QUOTED_NEEDLE =
  /[「『“"'`]([^「『“"'`」』”'`]{1,40})[」』”'`]|【([^】]{1,40})】/g;

const MIN_NEEDLE_LEN = 2;

/** 从识别点标题与内容抽取匹配关键字（优先引号内短语）。 */
export const extractSeasoningNeedles = (signal: NoteItem): string[] => {
  const found: string[] = [];
  const push = (raw: string) => {
    const value = raw.replace(/\s+/g, " ").trim();
    if (value.length < MIN_NEEDLE_LEN) return;
    if (found.some((item) => item === value)) return;
    found.push(value);
  };

  for (const source of [signal.title, signal.content]) {
    const text = String(source ?? "");
    QUOTED_NEEDLE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUOTED_NEEDLE.exec(text))) {
      push(match[1] || match[2] || "");
    }
  }

  push(signal.title);
  // 内容里用顿号/逗号拆短触发词
  for (const part of String(signal.content ?? "").split(/[,，、;；\n|/]+/)) {
    const trimmed = part.replace(/\s+/g, " ").trim();
    if (trimmed.length >= MIN_NEEDLE_LEN && trimmed.length <= 16) push(trimmed);
  }

  return found.sort((left, right) => right.length - left.length);
};

const buildExcerptWindow = (
  content: string,
  start: number,
  end: number,
  radius = 100,
) => {
  let excerptStart = Math.max(0, start - radius);
  let excerptEnd = Math.min(content.length, end + radius);
  while (excerptStart > 0 && !/\s/.test(content[excerptStart - 1] ?? "")) {
    excerptStart -= 1;
    if (start - excerptStart > radius + 40) break;
  }
  while (excerptEnd < content.length && !/\s/.test(content[excerptEnd] ?? "")) {
    excerptEnd += 1;
    if (excerptEnd - end > radius + 40) break;
  }
  return {
    excerpt: content.slice(excerptStart, excerptEnd),
    excerptStart,
    excerptEnd,
  };
};

/**
 * 按识别点关键字扫描正文，返回不重叠命中（长针优先）。
 */
export const findSeasoningHits = (
  content: string,
  signals: NoteItem[],
): SeasoningHit[] => {
  if (!content || !signals.length) return [];

  type Candidate = {
    signal: NoteItem;
    matchedText: string;
    start: number;
    end: number;
  };
  const candidates: Candidate[] = [];

  for (const signal of signals) {
    const needles = extractSeasoningNeedles(signal);
    for (const needle of needles) {
      let from = 0;
      while (from < content.length) {
        const index = content.indexOf(needle, from);
        if (index < 0) break;
        candidates.push({
          signal,
          matchedText: needle,
          start: index,
          end: index + needle.length,
        });
        from = index + Math.max(1, needle.length);
      }
    }
  }

  candidates.sort(
    (left, right) =>
      right.matchedText.length - left.matchedText.length ||
      left.start - right.start,
  );

  const occupied: Array<{ start: number; end: number }> = [];
  const hits: SeasoningHit[] = [];
  for (const candidate of candidates) {
    const overlaps = occupied.some(
      (span) => candidate.start < span.end && candidate.end > span.start,
    );
    if (overlaps) continue;
    occupied.push({ start: candidate.start, end: candidate.end });
    const window = buildExcerptWindow(content, candidate.start, candidate.end);
    hits.push({
      id: `${candidate.signal.id}:${candidate.start}:${candidate.end}`,
      signalId: candidate.signal.id,
      signalTitle: candidate.signal.title.trim() || "识别点",
      matchedText: candidate.matchedText,
      start: candidate.start,
      end: candidate.end,
      excerpt: window.excerpt,
      excerptStart: window.excerptStart,
      excerptEnd: window.excerptEnd,
      sceneId: candidate.signal.linkId,
      source: "signal",
    });
  }

  return hits.sort((left, right) => left.start - right.start);
};

/** 从正文容器内的当前选区解析起止下标。 */
export const getOffsetsInTextContainer = (
  container: HTMLElement,
): { start: number; end: number; text: string } | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = selection.toString();
  if (!text.trim()) return null;
  return { start, end: start + text.length, text };
};

/**
 * 用手动选区创建加料命中：改写范围即选中原文。
 */
export const createManualSeasoningHit = (
  content: string,
  start: number,
  end: number,
  options?: { sceneId?: string },
): SeasoningHit | null => {
  if (start < 0 || end <= start || end > content.length) return null;
  const matched = content.slice(start, end);
  if (!matched.trim()) return null;
  const label = matched.replace(/\s+/g, " ").trim().slice(0, 28) || "选中片段";
  return {
    id: `manual:${start}:${end}`,
    signalId: "",
    signalTitle: "手动选中",
    matchedText: label,
    start,
    end,
    excerpt: matched,
    excerptStart: start,
    excerptEnd: end,
    sceneId: options?.sceneId,
    source: "manual",
  };
};

/** 将正文按命中切成可渲染片段。 */
export const segmentContentByHits = (
  content: string,
  hits: SeasoningHit[],
): Array<
  | { type: "text"; text: string }
  | { type: "hit"; text: string; hit: SeasoningHit }
> => {
  if (!hits.length) return content ? [{ type: "text", text: content }] : [];
  const ordered = [...hits].sort((left, right) => left.start - right.start);
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "hit"; text: string; hit: SeasoningHit }
  > = [];
  let cursor = 0;
  for (const hit of ordered) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      parts.push({ type: "text", text: content.slice(cursor, hit.start) });
    }
    parts.push({
      type: "hit",
      text: content.slice(hit.start, hit.end),
      hit,
    });
    cursor = hit.end;
  }
  if (cursor < content.length) {
    parts.push({ type: "text", text: content.slice(cursor) });
  }
  return parts;
};

/** 用局部改写替换 excerpt 窗口；原文不匹配时抛错，避免静默剪错段。 */
export const applySeasoningHitRewrite = (
  content: string,
  hit: SeasoningHit,
  replacement: string,
) => {
  const clean = replacement.trim();
  if (!clean) return content;
  if (
    hit.excerptStart < 0 ||
    hit.excerptEnd > content.length ||
    hit.excerptStart >= hit.excerptEnd
  ) {
    throw new Error(`选区「${hit.matchedText}」位置无效，请重新选择后再写入`);
  }
  const current = content.slice(hit.excerptStart, hit.excerptEnd);
  if (current !== hit.excerpt) {
    throw new Error(
      `选区「${hit.matchedText}」原文已变化，请重新选择后再写入`,
    );
  }
  const before = content.slice(0, hit.excerptStart);
  const after = content.slice(hit.excerptEnd);
  return `${before}${clean}${after}`;
};

/** 多处局部改写：按选区从后往前应用，避免偏移错位。 */
export const applySeasoningHitRewrites = (
  content: string,
  items: Array<{ hit: SeasoningHit; replacement: string }>,
) => {
  const ordered = [...items].sort(
    (left, right) => right.hit.excerptStart - left.hit.excerptStart,
  );
  return ordered.reduce(
    (text, item) => applySeasoningHitRewrite(text, item.hit, item.replacement),
    content,
  );
};

export const SEASONING_TITLE_MARK = "（加料）";

/** 加料写回后给章节标题追加标识；已有则不重复。 */
export const withSeasoningChapterTitle = (title: string) => {
  const value = String(title ?? "");
  if (value.includes(SEASONING_TITLE_MARK)) return value;
  return `${value.trimEnd()}${SEASONING_TITLE_MARK}`;
};

/** 估算写入 AI 系统提示的设定体量（字符约数）。 */
export const estimateContextBudget = (project: NovelProject) => {
  const joinNotes = (items: NoteItem[] | undefined) =>
    (items ?? [])
      .map((item) => `${item.title}${item.category}${item.content}`)
      .join("");
  const characters = project.characters
    .map(
      (item) =>
        `${item.name}${item.role}${item.description}${item.motivation}${item.conflict}`,
    )
    .join("").length;
  const world = joinNotes(project.worldNotes).length;
  const plot = joinNotes(project.plotNotes).length;
  const outline = project.chapters
    .map((item) => `${item.title}${item.summary}`)
    .join("").length;
  const memoriesRaw = [...(project.memories ?? [])]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.updatedAt - left.updatedAt,
    )
    .map((item) => `[${item.category}]${item.title}${item.content}`);
  let memoryLength = 0;
  for (const line of memoriesRaw) {
    if (memoryLength + line.length > 7000) continue;
    memoryLength += line.length;
  }
  const seasoning =
    joinNotes(project.seasoningScenes).length +
    joinNotes(project.seasoningSignals).length +
    joinNotes(project.seasoningRules).length;
  const total = characters + world + plot + outline + memoryLength + seasoning;
  return {
    characters,
    world,
    plot,
    outline,
    memories: memoryLength,
    seasoning,
    total,
    level: total > 24000 ? "high" : total > 14000 ? "medium" : "low",
  } as const;
};

export const formatSeasoningLinkLabel = (
  signal: NoteItem,
  scenes: NoteItem[],
) => {
  if (!signal.linkId) return "";
  const scene = scenes.find((item) => item.id === signal.linkId);
  return scene ? `→ ${scene.title}` : "";
};
