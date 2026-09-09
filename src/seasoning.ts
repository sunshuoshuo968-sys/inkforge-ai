import { countWords } from "./data";
import type { NovelProject, NoteItem } from "./types";

export type SeasoningDraft = {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  before: string;
  after: string;
  tokens: number;
  warning?: string;
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
  const total =
    characters + world + plot + outline + memoryLength + seasoning;
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

const pickAnchors = (text: string, count = 3) => {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 24) return [] as string[];
  const step = Math.max(12, Math.floor(compact.length / (count + 1)));
  const anchors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.min(compact.length - 12, step * (i + 1));
    if (start < 0) continue;
    const slice = compact.slice(start, start + 12);
    if (slice.length >= 8) anchors.push(slice);
  }
  return [...new Set(anchors)];
};

/** 轻量抽检，避免加料稿悄然改写剧情。 */
export const assessSeasoningDraft = (before: string, after: string) => {
  const beforeWords = Math.max(1, countWords(before));
  const afterWords = countWords(after);
  const ratio = afterWords / beforeWords;
  const anchors = pickAnchors(before);
  const missing = anchors.filter((item) => !after.replace(/\s+/g, "").includes(item));
  const warnings: string[] = [];
  if (ratio < 0.7) warnings.push(`字数偏少（${Math.round(ratio * 100)}%）`);
  if (ratio > 2.8) warnings.push(`字数膨胀（${Math.round(ratio * 100)}%）`);
  if (missing.length >= 2) warnings.push("原文关键片段保留较少，请人工核对剧情");
  return {
    beforeWords,
    afterWords,
    ratio,
    missingCount: missing.length,
    warning: warnings.join("；") || undefined,
  };
};

export const formatSeasoningLinkLabel = (
  signal: NoteItem,
  scenes: NoteItem[],
) => {
  if (!signal.linkId) return "";
  const scene = scenes.find((item) => item.id === signal.linkId);
  return scene ? `→ ${scene.title}` : "";
};
