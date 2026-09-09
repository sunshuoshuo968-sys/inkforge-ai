import {
  BookMarked,
  Check,
  Feather,
  FilePenLine,
  GitBranch,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  ScanText,
  Search,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { countWords } from "./data";
import type { ImportedBookLore, NovelProject } from "./types";

export type ToolkitToolId =
  | "extract"
  | "backfill"
  | "audit"
  | "style"
  | "continue"
  | "continueOutline"
  | "timeline"
  | "polish"
  | "polishBridge"
  | "weakRewrite"
  | "gaps"
  | "drift"
  | "digest"
  | "supplement"
  | "sequel";

export type ToolkitResult = {
  title: string;
  text: string;
  fills?: ImportedBookLore;
  driftFixes?: Array<{ index: number; summary: string }>;
  draft?: {
    chapterId: string;
    chapterTitle: string;
    before: string;
    after: string;
    prompt: string;
  };
};

type ToolDef = {
  id: ToolkitToolId;
  label: string;
  blurb: string;
  icon: LucideIcon;
  maxChapters: number;
  minChapters: number;
  needsChapters: boolean;
};

const TOOLS: ToolDef[] = [
  {
    id: "extract",
    label: "AI 提炼设定",
    blurb: "抽样全书目录与片段，覆盖式提炼角色/世界/情节/记忆。导入书建议先做。",
    icon: Sparkles,
    maxChapters: 0,
    minChapters: 0,
    needsChapters: false,
  },
  {
    id: "backfill",
    label: "章纲回填",
    blurb: "从正文生成章纲，写入大纲。最多 8 章。",
    icon: ListChecks,
    maxChapters: 8,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "audit",
    label: "一致性审计",
    blurb: "对照设定找出人设/时间线矛盾，写入灵感。",
    icon: ScanText,
    maxChapters: 8,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "style",
    label: "文风指纹",
    blurb: "提炼口吻与节奏，写入置顶文风记忆。最多 3 章。",
    icon: Feather,
    maxChapters: 3,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "continue",
    label: "续写下一章",
    blurb: "承接末章（或当前末章）生成新章正文。",
    icon: WandSparkles,
    maxChapters: 1,
    minChapters: 0,
    needsChapters: false,
  },
  {
    id: "continueOutline",
    label: "续写大纲",
    blurb: "依据设定与末章，规划后续多章标题+章纲（不写正文）。",
    icon: ListOrdered,
    maxChapters: 0,
    minChapters: 0,
    needsChapters: false,
  },
  {
    id: "timeline",
    label: "人物时间线",
    blurb: "抽取时间线节点与情节弧，补充记忆/情节。",
    icon: GitBranch,
    maxChapters: 3,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "polish",
    label: "保剧情润色",
    blurb: "单章去腔收紧、提升可读性；不跟「加料」规范。要按场景/关键字增强请用左侧加料页。",
    icon: Sparkles,
    maxChapters: 1,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "polishBridge",
    label: "三章桥接润色",
    blurb: "上一/当前/下一章衔接润色，保剧情不跟加料规范。",
    icon: BookMarked,
    maxChapters: 1,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "weakRewrite",
    label: "薄弱章重写",
    blurb: "锁定上下章约束重写本章。需确认后替换。",
    icon: FilePenLine,
    maxChapters: 1,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "gaps",
    label: "设定缺口",
    blurb: "正文有设定无 / 设定有正文未见，可一键补全。",
    icon: Search,
    maxChapters: 3,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "drift",
    label: "大纲漂移",
    blurb: "检测章纲与正文不一致，可一键纠正章纲。",
    icon: ListChecks,
    maxChapters: 8,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "digest",
    label: "阅读沉淀",
    blurb: "把已读章节沉淀为章节记忆。最多 8 章。",
    icon: BookMarked,
    maxChapters: 8,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "supplement",
    label: "三章补充设定",
    blurb: "指定最多三章增量补充角色/世界/情节/记忆。",
    icon: Sparkles,
    maxChapters: 3,
    minChapters: 1,
    needsChapters: true,
  },
  {
    id: "sequel",
    label: "创建续作",
    blurb: "继承设定新建续作项目，不含前作正文。",
    icon: GitBranch,
    maxChapters: 0,
    minChapters: 0,
    needsChapters: false,
  },
];

const defaultIndexes = (
  chapters: NovelProject["chapters"],
  selectedChapterId: string | null,
  max: number,
) => {
  if (!chapters.length || max <= 0) return [] as number[];
  const selectedIndex = Math.max(
    0,
    chapters.findIndex((item) => item.id === selectedChapterId),
  );
  const picks = new Set<number>();
  for (const index of [selectedIndex, selectedIndex - 1, selectedIndex + 1]) {
    if (index >= 0 && index < chapters.length) picks.add(index);
    if (picks.size >= max) break;
  }
  for (let index = 0; index < chapters.length && picks.size < max; index += 1) {
    picks.add(index);
  }
  return [...picks].sort((a, b) => a - b);
};

export function ImportedBookToolkitDialog({
  project,
  selectedChapterId,
  busy,
  result,
  onClose,
  onExecute,
  onApplyFills,
  onApplyDriftFixes,
  onConfirmDraft,
  onCreateSequel,
}: {
  project: NovelProject;
  selectedChapterId: string | null;
  busy: boolean;
  result: ToolkitResult | null;
  onClose: () => void;
  onExecute: (
    tool: ToolkitToolId,
    chapterIndexes: number[],
    options?: {
      notes?: string;
      chapterCount?: number;
      restrictCast?: boolean;
      characterIds?: string[];
      plotIds?: string[];
    },
  ) => Promise<void>;
  onApplyFills: () => void;
  onApplyDriftFixes: () => void;
  onConfirmDraft: () => void;
  onCreateSequel: () => void;
}) {
  const [toolId, setToolId] = useState<ToolkitToolId>(() => {
    if (project.origin === "sequel") return "continue";
    if (project.origin === "imported") return "extract";
    return "continue";
  });
  const tool = TOOLS.find((item) => item.id === toolId) ?? TOOLS[0];
  const [selected, setSelected] = useState<number[]>(() =>
    defaultIndexes(project.chapters, selectedChapterId, tool.maxChapters || 3),
  );
  const [query, setQuery] = useState("");
  const [continueNotesOpen, setContinueNotesOpen] = useState(false);
  const [continueNotes, setContinueNotes] = useState("");
  const [continueCharacterIds, setContinueCharacterIds] = useState<string[]>(
    [],
  );
  const [continuePlotIds, setContinuePlotIds] = useState<string[]>([]);
  const [outlinePlanOpen, setOutlinePlanOpen] = useState(false);
  const [outlineNotes, setOutlineNotes] = useState("");
  const [outlineCount, setOutlineCount] = useState(5);

  const toggleContinueId = (
    id: string,
    kind: "character" | "plot",
  ) => {
    const setter =
      kind === "character" ? setContinueCharacterIds : setContinuePlotIds;
    setter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return project.chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(({ chapter }) =>
        keyword
          ? `${chapter.title} ${chapter.summary}`
              .toLowerCase()
              .includes(keyword)
          : true,
      );
  }, [project.chapters, query]);

  const selectTool = (id: ToolkitToolId) => {
    const next = TOOLS.find((item) => item.id === id) ?? TOOLS[0];
    setToolId(id);
    setSelected(
      defaultIndexes(
        project.chapters,
        selectedChapterId,
        next.maxChapters || 0,
      ),
    );
  };

  const toggle = (index: number) => {
    if (!tool.needsChapters) return;
    setSelected((current) => {
      if (tool.maxChapters === 1) return [index];
      if (current.includes(index))
        return current.filter((item) => item !== index);
      if (current.length >= tool.maxChapters) return current;
      return [...current, index].sort((a, b) => a - b);
    });
  };

  const canRun =
    !busy &&
    (tool.id === "sequel" ||
      tool.id === "continue" ||
      tool.id === "continueOutline" ||
      tool.id === "extract" ||
      selected.length >= tool.minChapters);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dialog toolkit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="作品工具箱"
      >
        <div className="dialog-head">
          <div>
            <span className="dialog-icon">
              <WandSparkles size={19} />
            </span>
            <span>
              <h2>作品工具箱</h2>
              <p>
                面向已有正文：回填、审计、续写、沉淀与续作
                {project.origin ? ` · ${project.origin}` : ""}
              </p>
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
          >
            <X size={19} />
          </button>
        </div>
        <div className="toolkit-layout">
          <aside className="toolkit-nav">
            {TOOLS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`toolkit-nav-item ${toolId === item.id ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => selectTool(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>
          <div className="toolkit-main">
            <p className="toolkit-blurb">{tool.blurb}</p>
            {tool.needsChapters ? (
              <>
                <label className="chapter-search">
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索章节"
                    disabled={busy}
                  />
                </label>
                <div className="supplement-chapter-list">
                  {filtered.map(({ chapter, index }) => {
                    const checked = selected.includes(index);
                    const words = countWords(chapter.content);
                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        className={`supplement-chapter-row ${checked ? "selected" : ""}`}
                        disabled={
                          busy ||
                          (!checked &&
                            tool.maxChapters > 1 &&
                            selected.length >= tool.maxChapters)
                        }
                        onClick={() => toggle(index)}
                      >
                        <span className="supplement-chapter-check">
                          {checked ? <Check size={14} /> : null}
                        </span>
                        <span className="chapter-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="chapter-info">
                          <strong>{chapter.title}</strong>
                          <small>
                            {words.toLocaleString()} 字
                            {chapter.content.trim() ? "" : " · 无正文"}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <small className="supplement-lore-meta">
                  已选 {selected.length}/{tool.maxChapters} 章
                </small>
              </>
            ) : tool.id === "continue" ? (
              <p className="import-txt-warning warn">
                将在全书末章之后新建一章并流式续写；点「执行」后可勾选角色/情节并补充条件。
              </p>
            ) : tool.id === "continueOutline" ? (
              <p className="import-txt-warning warn">
                将依据设定、近章章纲与末章结尾，追加后续多章空正文大纲；点「执行」可设定章数与补充条件。
              </p>
            ) : tool.id === "extract" ? (
              <p className="import-txt-warning warn">
                将抽样目录与开篇/中段/结尾正文提炼设定。若已有角色/世界观/情节，会先确认是否覆盖。
              </p>
            ) : (
              <p className="import-txt-warning warn">
                将复制角色、世界观、情节与记忆到新项目《
                {project.title.replace(/（续）$/, "")}（续）》，不含正文。
              </p>
            )}
            {result ? (
              <div className="toolkit-result">
                <strong>{result.title}</strong>
                <pre>{result.text}</pre>
                <div className="toolkit-result-actions">
                  {result.fills ? (
                    <button
                      type="button"
                      className="secondary-button compact"
                      disabled={busy}
                      onClick={onApplyFills}
                    >
                      应用设定补全
                    </button>
                  ) : null}
                  {result.driftFixes?.length ? (
                    <button
                      type="button"
                      className="secondary-button compact"
                      disabled={busy}
                      onClick={onApplyDriftFixes}
                    >
                      用正文纠正章纲
                    </button>
                  ) : null}
                  {result.draft ? (
                    <button
                      type="button"
                      className="primary-button compact"
                      disabled={busy}
                      onClick={onConfirmDraft}
                    >
                      确认替换正文
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            关闭
          </button>
          {tool.id === "sequel" ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={onCreateSequel}
            >
              <GitBranch size={17} />
              创建续作项目
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!canRun}
              onClick={() => {
                if (toolId === "continue") {
                  setContinueNotesOpen(true);
                  return;
                }
                if (toolId === "continueOutline") {
                  setOutlinePlanOpen(true);
                  return;
                }
                void onExecute(toolId, selected);
              }}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {busy ? "执行中…" : "执行"}
            </button>
          )}
        </div>
      </div>
      {continueNotesOpen ? (
        <div
          className="dialog-backdrop continue-notes-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setContinueNotesOpen(false);
            }
          }}
        >
          <div
            className="dialog continue-notes-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="续写补充条件"
          >
            <div className="dialog-head">
              <div>
                <span className="dialog-icon">
                  <Feather size={19} />
                </span>
                <span>
                  <h2>续写下一章</h2>
                  <p>
                    可勾选本章要用的角色与情节；勾选设计模式下未选角色不会注入设定。
                  </p>
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setContinueNotesOpen(false)}
                disabled={busy}
                aria-label="关闭"
              >
                <X size={19} />
              </button>
            </div>
            <div className="continue-notes-body">
              <div className="continue-cast-block">
                <div className="continue-cast-head">
                  <span>
                    本章角色
                    <small>未勾选则不带角色卡</small>
                  </span>
                  <div className="continue-cast-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !project.characters.length}
                      onClick={() =>
                        setContinueCharacterIds(
                          project.characters.map((item) => item.id),
                        )
                      }
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !continueCharacterIds.length}
                      onClick={() => setContinueCharacterIds([])}
                    >
                      清空
                    </button>
                  </div>
                </div>
                {project.characters.length ? (
                  <div className="continue-cast-list">
                    {project.characters.map((character) => {
                      const checked = continueCharacterIds.includes(
                        character.id,
                      );
                      return (
                        <button
                          key={character.id}
                          type="button"
                          className={`continue-cast-chip ${checked ? "active" : ""}`}
                          disabled={busy}
                          onClick={() =>
                            toggleContinueId(character.id, "character")
                          }
                        >
                          {checked ? <Check size={13} /> : null}
                          {character.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="continue-cast-empty">暂无角色卡</p>
                )}
              </div>
              <div className="continue-cast-block">
                <div className="continue-cast-head">
                  <span>
                    本章情节
                    <small>未勾选则不带情节条目</small>
                  </span>
                  <div className="continue-cast-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !project.plotNotes.length}
                      onClick={() =>
                        setContinuePlotIds(
                          project.plotNotes.map((item) => item.id),
                        )
                      }
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !continuePlotIds.length}
                      onClick={() => setContinuePlotIds([])}
                    >
                      清空
                    </button>
                  </div>
                </div>
                {project.plotNotes.length ? (
                  <div className="continue-cast-list">
                    {project.plotNotes.map((plot) => {
                      const checked = continuePlotIds.includes(plot.id);
                      return (
                        <button
                          key={plot.id}
                          type="button"
                          className={`continue-cast-chip ${checked ? "active" : ""}`}
                          disabled={busy}
                          onClick={() => toggleContinueId(plot.id, "plot")}
                        >
                          {checked ? <Check size={13} /> : null}
                          {plot.title}
                          {plot.category ? (
                            <em>{plot.category}</em>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="continue-cast-empty">暂无情节条目</p>
                )}
              </div>
              <label className="field">
                <span>
                  补充条件
                  <small>情节走向、禁忌、目标字数等</small>
                </span>
                <textarea
                  value={continueNotes}
                  onChange={(event) => setContinueNotes(event.target.value)}
                  rows={5}
                  disabled={busy}
                  placeholder={
                    "例如：\n· 本章让主角发现关键线索，但不要揭晓真相\n· 仅勾选角色可在场，禁止另开新重要角色\n· 节奏偏慢，侧重对话与氛围"
                  }
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setContinueNotesOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setContinueNotesOpen(false);
                  void onExecute("continue", selected);
                }}
              >
                直接续写
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  const notes = continueNotes.trim();
                  setContinueNotesOpen(false);
                  void onExecute("continue", selected, {
                    restrictCast: true,
                    characterIds: continueCharacterIds,
                    plotIds: continuePlotIds,
                    ...(notes ? { notes } : {}),
                  });
                }}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {continueNotes.trim() ||
                continueCharacterIds.length ||
                continuePlotIds.length
                  ? "按设计续写"
                  : "开始续写"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {outlinePlanOpen ? (
        <div
          className="dialog-backdrop continue-notes-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setOutlinePlanOpen(false);
            }
          }}
        >
          <div
            className="dialog continue-notes-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="续写大纲规划"
          >
            <div className="dialog-head">
              <div>
                <span className="dialog-icon">
                  <ListOrdered size={19} />
                </span>
                <span>
                  <h2>续写大纲</h2>
                  <p>规划后续章纲并追加为空章节；不写正文。</p>
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOutlinePlanOpen(false)}
                disabled={busy}
                aria-label="关闭"
              >
                <X size={19} />
              </button>
            </div>
            <div className="continue-notes-body">
              <label className="field">
                <span>
                  规划章数
                  <small>3–12 章</small>
                </span>
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={outlineCount}
                  disabled={busy}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setOutlineCount(
                      Number.isFinite(next)
                        ? Math.min(12, Math.max(3, Math.floor(next)))
                        : 5,
                    );
                  }}
                />
              </label>
              <label className="field">
                <span>
                  补充条件
                  <small>可选：主线方向、禁忌、阶段高潮等</small>
                </span>
                <textarea
                  value={outlineNotes}
                  onChange={(event) => setOutlineNotes(event.target.value)}
                  rows={6}
                  disabled={busy}
                  placeholder={
                    "例如：\n· 接下来 5 章围绕夺宝线，暂不揭晓幕后黑手\n· 保持双女主张力，禁止早死\n· 第 3 章安排一次公开打脸"
                  }
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setOutlinePlanOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  const notes = outlineNotes.trim();
                  const chapterCount = Math.min(
                    12,
                    Math.max(3, Math.floor(outlineCount) || 5),
                  );
                  setOutlinePlanOpen(false);
                  void onExecute("continueOutline", selected, {
                    chapterCount,
                    ...(notes ? { notes } : {}),
                  });
                }}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                生成续写大纲
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
