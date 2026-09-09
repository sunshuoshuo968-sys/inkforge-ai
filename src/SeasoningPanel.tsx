import {
  Check,
  FlaskConical,
  LoaderCircle,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { countWords, now, uid } from "./data";
import {
  estimateContextBudget,
  formatSeasoningLinkLabel,
  type SeasoningDraft,
} from "./seasoning";
import type {
  AppData,
  NoteItem,
  NovelProject,
  TrashItem,
} from "./types";

type SeasoningTab = "scenes" | "signals" | "rules";

const seasoningTabConfig: Record<
  SeasoningTab,
  {
    key: "seasoningScenes" | "seasoningSignals" | "seasoningRules";
    trashKind: TrashItem["kind"];
    label: string;
    empty: string;
    add: string;
    categories: string[];
    hint: string;
  }
> = {
  scenes: {
    key: "seasoningScenes",
    trashKind: "seasoningScene",
    label: "场景说明",
    empty: "描述可复用的加料场景：氛围、感官、人物站位与推进节奏",
    add: "新建场景说明",
    categories: ["开场", "冲突", "日常", "高潮", "收束", "其他"],
    hint: "写清：场合、在场人物、情绪基调、必须出现的感官细节。",
  },
  signals: {
    key: "seasoningSignals",
    trashKind: "seasoningSignal",
    label: "识别点与关键字",
    empty: "记录正文里一旦出现就应触发加料的识别点与关键字",
    add: "新建识别点",
    categories: ["识别点", "关键字", "意象", "触发词", "其他"],
    hint: "例如：出现「夜雨」就补潮湿气味；可关联一条场景说明。",
  },
  rules: {
    key: "seasoningRules",
    trashKind: "seasoningRule",
    label: "加料规范",
    empty: "约定加料密度、禁止项与优先增强方向",
    add: "新建加料规范",
    categories: ["必须", "禁止", "偏好", "密度", "其他"],
    hint: "例如：每千字至少一处生理反应；禁止说明书式情绪词；对白加料不超过两句。",
  },
};

const defaultChapterIndexes = (
  chapters: NovelProject["chapters"],
  selectedChapterId: string | null,
) => {
  if (!chapters.length) return [] as number[];
  const selectedIndex = Math.max(
    0,
    chapters.findIndex((item) => item.id === selectedChapterId),
  );
  const picks = new Set<number>();
  for (const index of [selectedIndex, selectedIndex - 1, selectedIndex + 1]) {
    if (index >= 0 && index < chapters.length) picks.add(index);
    if (picks.size >= 3) break;
  }
  for (let index = 0; index < chapters.length && picks.size < 3; index += 1) {
    picks.add(index);
  }
  return [...picks].sort((a, b) => a - b);
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SeasoningView({
  project,
  selectedChapterId,
  providers,
  activeProviderId,
  onUpdate,
  onToast,
  onOpenOutline,
  onExtractLore,
  onDraftSeasoning,
  onApplySeasoning,
}: {
  project: NovelProject;
  selectedChapterId: string | null;
  providers: AppData["settings"]["providers"];
  activeProviderId: string;
  onUpdate: (updater: (project: NovelProject) => NovelProject) => void;
  onToast: (message: string) => void;
  onOpenOutline: () => void;
  onExtractLore: () => Promise<void>;
  onDraftSeasoning: (
    chapterIndexes: number[],
    signal: AbortSignal,
    onProgress?: (message: string) => void,
  ) => Promise<SeasoningDraft[]>;
  onApplySeasoning: (
    drafts: SeasoningDraft[],
    signal: AbortSignal,
    onProgress?: (message: string) => void,
  ) => Promise<{
    draftCount: number;
    capturedCharacters: number;
    capturedMemories: number;
    captureError: string;
  }>;
}) {
  const [tab, setTab] = useState<SeasoningTab>("scenes");
  const config = seasoningTabConfig[tab];
  const notes = project[config.key] ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(
    notes[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [drafts, setDrafts] = useState<SeasoningDraft[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const provider =
    providers.find((item) => item.id === activeProviderId) ?? providers[0];
  const budget = estimateContextBudget(project);

  useEffect(() => {
    const list = project[seasoningTabConfig[tab].key] ?? [];
    setSelectedId((current) =>
      current && list.some((item) => item.id === current)
        ? current
        : (list[0]?.id ?? null),
    );
  }, [tab, project]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const selected = notes.find((item) => item.id === selectedId) ?? null;
  const visible = notes.filter((item) =>
    `${item.title}${item.content}${item.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const totalCount =
    (project.seasoningScenes?.length ?? 0) +
    (project.seasoningSignals?.length ?? 0) +
    (project.seasoningRules?.length ?? 0);
  const loreSparse =
    !project.characters.length &&
    !project.worldNotes.length &&
    !project.plotNotes.length;

  const add = () => {
    const note: NoteItem = {
      id: uid(),
      title: config.add,
      content: "",
      category: config.categories[0],
      updatedAt: now(),
    };
    onUpdate((current) => ({
      ...current,
      [config.key]: [note, ...(current[config.key] ?? [])],
    }));
    setSelectedId(note.id);
  };
  const patch = (value: Partial<NoteItem>) => {
    if (!selected) return;
    onUpdate((current) => ({
      ...current,
      [config.key]: (current[config.key] ?? []).map((item) =>
        item.id === selected.id
          ? { ...item, ...value, updatedAt: now() }
          : item,
      ),
    }));
  };
  const remove = () => {
    if (!selected) return;
    onUpdate((current) => ({
      ...current,
      [config.key]: (current[config.key] ?? []).filter(
        (item) => item.id !== selected.id,
      ),
      trash: [
        {
          id: uid(),
          kind: config.trashKind,
          title: selected.title,
          deletedAt: now(),
          payload: selected,
        },
        ...current.trash,
      ],
    }));
    setSelectedId(notes.find((item) => item.id !== selected.id)?.id ?? null);
  };

  const cancelBusy = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress("");
  };

  const openSeasonDialog = () => {
    if (!provider?.apiKey.trim()) {
      onToast(`请先在设置中填写 ${provider?.name ?? "AI"} API Key`);
      return;
    }
    if (!totalCount) {
      onToast("请先填写至少一条场景说明、识别点或加料规范");
      return;
    }
    setDrafts(null);
    setPreviewId(null);
    setPickOpen(true);
  };

  return (
    <div className="seasoning-layout">
      {(loreSparse || !totalCount) &&
      (project.origin === "imported" || project.origin === "sequel") ? (
        <div className="seasoning-guide">
          <strong>导入书建议先补齐设定再加料</strong>
          <p>
            {loreSparse
              ? "角色 / 世界观 / 情节仍为空。可先在大纲导出菜单用「作品工具箱」提炼设定，或手动补角色卡。"
              : "加料资料还是空的。先写几条场景说明、识别点或规范，再选章加料。"}
          </p>
          <div className="seasoning-guide-actions">
            {loreSparse ? (
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => {
                  onOpenOutline();
                  void onExtractLore().catch((reason) =>
                    onToast(
                      reason instanceof Error ? reason.message : "提炼失败",
                    ),
                  );
                }}
              >
                AI 提炼设定
              </button>
            ) : null}
            {!totalCount ? (
              <button
                type="button"
                className="secondary-button compact"
                onClick={add}
              >
                新建一条{config.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="seasoning-tabs" role="tablist" aria-label="加料分类">
        {(Object.keys(seasoningTabConfig) as SeasoningTab[]).map((item) => {
          const meta = seasoningTabConfig[item];
          const count = project[meta.key]?.length ?? 0;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`seasoning-tab ${tab === item ? "active" : ""}`}
              onClick={() => {
                setTab(item);
                setQuery("");
              }}
            >
              <strong>{meta.label}</strong>
              <small>{count}</small>
            </button>
          );
        })}
      </div>

      <div className="seasoning-toolbar">
        <div>
          <p>
            选中最多 3 章生成加料稿，确认后才写入；与「保剧情润色」不同，这里会跟场景/关键字/规范增强细节。
          </p>
          <small
            className={`context-budget context-budget-${budget.level}`}
            title={`角色 ${budget.characters} · 世界 ${budget.world} · 情节 ${budget.plot} · 大纲 ${budget.outline} · 记忆 ${budget.memories} · 加料 ${budget.seasoning}`}
          >
            设定上下文约 {budget.total.toLocaleString()} 字
            {budget.level === "high"
              ? "（偏高，建议精简或只留置顶记忆）"
              : budget.level === "medium"
                ? "（适中）"
                : "（轻松）"}
          </small>
        </div>
        <div className="seasoning-toolbar-actions">
          {busy ? (
            <button
              type="button"
              className="secondary-button compact"
              onClick={cancelBusy}
            >
              <Square size={14} />
              取消
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button compact"
            disabled={busy}
            onClick={openSeasonDialog}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FlaskConical size={16} />
            )}
            {busy ? progress || "处理中…" : "选章加料"}
          </button>
        </div>
      </div>

      <div className="library-layout">
        <section className="library-index">
          <div className="section-heading">
            <div>
              <h1>{config.label}</h1>
              <p>
                加料共 {totalCount} 条 · {config.hint}
              </p>
            </div>
            <button className="primary-button compact" onClick={add}>
              <Plus size={17} />
              {config.add}
            </button>
          </div>
          <label className="library-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${config.label}`}
            />
          </label>
          <div className="library-list">
            {visible.length ? (
              visible.map((item) => (
                <button
                  key={item.id}
                  className={`library-row ${selectedId === item.id ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="note-glyph">
                    <FlaskConical size={18} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.category}
                      {tab === "signals"
                        ? formatSeasoningLinkLabel(
                            item,
                            project.seasoningScenes ?? [],
                          )
                        : ""}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <div className="library-empty">
                <FlaskConical size={40} />
                <p>{config.empty}</p>
                <button className="secondary-button" onClick={add}>
                  {config.add}
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="record-pane">
          {selected ? (
            <div className="record-editor">
              <div className="record-editor-head">
                <strong>{config.label}</strong>
                <button
                  className="icon-button danger-hover"
                  onClick={remove}
                  aria-label="删除"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="record-fields">
                <Field label="标题">
                  <input
                    value={selected.title}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </Field>
                <Field label="分类">
                  <select
                    value={selected.category}
                    onChange={(event) =>
                      patch({ category: event.target.value })
                    }
                  >
                    {config.categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                {tab === "signals" ? (
                  <Field label="关联场景说明">
                    <select
                      value={selected.linkId ?? ""}
                      onChange={(event) =>
                        patch({
                          linkId: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">不关联</option>
                      {(project.seasoningScenes ?? []).map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="内容">
                  <textarea
                    className="large-textarea"
                    value={selected.content}
                    onChange={(event) =>
                      patch({ content: event.target.value })
                    }
                    placeholder={config.hint}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="select-hint">选择一条记录进行编辑</div>
          )}
        </section>
      </div>

      {pickOpen ? (
        <SeasoningApplyDialog
          project={project}
          selectedChapterId={selectedChapterId}
          busy={busy}
          progress={progress}
          drafts={drafts}
          previewId={previewId}
          onPreview={setPreviewId}
          onClose={() => {
            if (busy) return;
            setPickOpen(false);
            setDrafts(null);
          }}
          onCancel={cancelBusy}
          onGenerate={async (chapterIndexes) => {
            const controller = new AbortController();
            abortRef.current = controller;
            setBusy(true);
            setProgress("准备生成加料稿…");
            setDrafts(null);
            try {
              const next = await onDraftSeasoning(
                chapterIndexes,
                controller.signal,
                setProgress,
              );
              setDrafts(next);
              setPreviewId(next[0]?.chapterId ?? null);
            } catch (reason) {
              if (!(reason instanceof DOMException && reason.name === "AbortError"))
                onToast(reason instanceof Error ? reason.message : "加料失败");
            } finally {
              setBusy(false);
              setProgress("");
              abortRef.current = null;
            }
          }}
          onConfirm={async () => {
            if (!drafts?.length) return;
            const controller = new AbortController();
            abortRef.current = controller;
            setBusy(true);
            setProgress("正在写入并记录设定…");
            try {
              const result = await onApplySeasoning(
                drafts,
                controller.signal,
                setProgress,
              );
              setPickOpen(false);
              setDrafts(null);
              if (result.captureError) {
                onToast(
                  `已写入 ${result.draftCount} 章，但角色/时间线记录失败：${result.captureError}`,
                );
              } else {
                onToast(
                  `已确认 ${result.draftCount} 章加料，记录角色 ${result.capturedCharacters} · 时间线 ${result.capturedMemories}`,
                );
              }
            } catch (reason) {
              if (!(reason instanceof DOMException && reason.name === "AbortError"))
                onToast(reason instanceof Error ? reason.message : "写入失败");
            } finally {
              setBusy(false);
              setProgress("");
              abortRef.current = null;
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SeasoningApplyDialog({
  project,
  selectedChapterId,
  busy,
  progress,
  drafts,
  previewId,
  onPreview,
  onClose,
  onCancel,
  onGenerate,
  onConfirm,
}: {
  project: NovelProject;
  selectedChapterId: string | null;
  busy: boolean;
  progress: string;
  drafts: SeasoningDraft[] | null;
  previewId: string | null;
  onPreview: (id: string | null) => void;
  onClose: () => void;
  onCancel: () => void;
  onGenerate: (chapterIndexes: number[]) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>(() =>
    defaultChapterIndexes(project.chapters, selectedChapterId),
  );
  const [query, setQuery] = useState("");
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
  const preview =
    drafts?.find((item) => item.chapterId === previewId) ?? drafts?.[0] ?? null;
  const toggle = (index: number) => {
    setSelected((current) => {
      if (current.includes(index))
        return current.filter((item) => item !== index);
      if (current.length >= 3) return current;
      return [...current, index].sort((left, right) => left - right);
    });
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`dialog supplement-lore-dialog ${drafts ? "seasoning-review-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-head">
          <div>
            <span className="dialog-icon">
              <FlaskConical size={19} />
            </span>
            <span>
              <h2>{drafts ? "确认加料稿" : "选章加料"}</h2>
              <p>
                {drafts
                  ? "核对后再写入正文；与保剧情润色不同，加料会跟规范增强细节"
                  : "最多选 3 章，先生成加料稿再确认"}
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
        <div className="dialog-body">
          {busy && progress ? (
            <p className="import-txt-warning warn">{progress}</p>
          ) : null}
          {!drafts ? (
            <>
              <p className="import-txt-warning warn">
                生成阶段不会改原文章。确认写入后才会替换，并自动记录角色与时间线。
              </p>
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
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      className={`supplement-chapter-row ${checked ? "selected" : ""}`}
                      disabled={busy || (!checked && selected.length >= 3)}
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
                          {countWords(chapter.content).toLocaleString()} 字
                          {chapter.content.trim() ? "" : " · 无正文"}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <small className="supplement-lore-meta">
                已选 {selected.length}/3 章
              </small>
            </>
          ) : (
            <div className="seasoning-review">
              <div className="seasoning-review-list">
                {drafts.map((draft) => (
                  <button
                    key={draft.chapterId}
                    type="button"
                    className={`seasoning-review-item ${preview?.chapterId === draft.chapterId ? "active" : ""}`}
                    onClick={() => onPreview(draft.chapterId)}
                  >
                    <strong>
                      第{draft.chapterIndex + 1}章 · {draft.chapterTitle}
                    </strong>
                    <small>
                      {countWords(draft.before).toLocaleString()} →{" "}
                      {countWords(draft.after).toLocaleString()} 字
                    </small>
                    {draft.warning ? (
                      <em className="seasoning-review-warn">{draft.warning}</em>
                    ) : null}
                  </button>
                ))}
              </div>
              {preview ? (
                <div className="seasoning-review-diff">
                  {preview.warning ? (
                    <p className="import-txt-warning confirm">{preview.warning}</p>
                  ) : null}
                  <div className="seasoning-diff-grid">
                    <section>
                      <h3>原文</h3>
                      <pre>{preview.before}</pre>
                    </section>
                    <section>
                      <h3>加料稿</h3>
                      <pre>{preview.after}</pre>
                    </section>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          {busy ? (
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
            >
              <Square size={16} />
              取消任务
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {drafts ? "放弃" : "关闭"}
            </button>
          )}
          {!drafts ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy || selected.length < 1}
              onClick={() => void onGenerate(selected)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FlaskConical size={17} />
              )}
              {busy ? "生成中…" : "生成加料稿"}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              {busy ? "写入中…" : "确认写入正文"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
