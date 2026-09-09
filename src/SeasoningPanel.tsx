import {
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  LoaderCircle,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { now, uid } from "./data";
import {
  applySeasoningHitRewrite,
  createManualSeasoningHit,
  estimateContextBudget,
  formatSeasoningLinkLabel,
  getOffsetsInTextContainer,
  segmentContentByHits,
  type SeasoningHit,
} from "./seasoning";
import type {
  AppData,
  Chapter,
  NoteItem,
  NovelProject,
  TrashItem,
} from "./types";

type SeasoningTab = "scenes" | "signals" | "rules";
type WorkspaceMode = "annotate" | "library";

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
  onSelectChapter,
  onExtractLore,
  onAdviseHit,
  onRewriteHit,
  onCaptureHitLore,
}: {
  project: NovelProject;
  selectedChapterId: string | null;
  providers: AppData["settings"]["providers"];
  activeProviderId: string;
  onUpdate: (updater: (project: NovelProject) => NovelProject) => void;
  onToast: (message: string) => void;
  onOpenOutline: () => void;
  onSelectChapter: (id: string) => void;
  onExtractLore: () => Promise<void>;
  onAdviseHit: (
    chapter: Chapter,
    hit: SeasoningHit,
    authorDraft: string,
    signal: AbortSignal,
    onChunk?: (chunk: string) => void,
  ) => Promise<string>;
  onRewriteHit: (
    chapter: Chapter,
    hit: SeasoningHit,
    advice: string | undefined,
    signal: AbortSignal,
    onChunk?: (chunk: string) => void,
  ) => Promise<string>;
  onCaptureHitLore: (
    chapter: Chapter,
    signal: AbortSignal,
    onProgress?: (message: string) => void,
  ) => Promise<{ characterCount: number; memoryCount: number }>;
}) {
  const [mode, setMode] = useState<WorkspaceMode>("annotate");
  const [tab, setTab] = useState<SeasoningTab>("scenes");
  const config = seasoningTabConfig[tab];
  const notes = project[config.key] ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(
    notes[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [manualHits, setManualHits] = useState<SeasoningHit[]>([]);
  const [activeHitId, setActiveHitId] = useState<string | null>(null);
  const [pickedSceneId, setPickedSceneId] = useState("");
  const [draftByHit, setDraftByHit] = useState<Record<string, string>>({});
  const [adviceByHit, setAdviceByHit] = useState<Record<string, string>>({});
  const [rewritePreview, setRewritePreview] = useState<{
    hitId: string;
    before: string;
    after: string;
  } | null>(null);
  const [busy, setBusy] = useState<"advise" | "rewrite" | "capture" | null>(
    null,
  );
  const [progress, setProgress] = useState("");
  const [captureOffer, setCaptureOffer] = useState<{
    chapterId: string;
    chapterTitle: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const provider =
    providers.find((item) => item.id === activeProviderId) ?? providers[0];
  const budget = estimateContextBudget(project);

  const chapterIndex = Math.max(
    0,
    project.chapters.findIndex((item) => item.id === selectedChapterId),
  );
  const chapter =
    project.chapters.find((item) => item.id === selectedChapterId) ??
    project.chapters[0] ??
    null;
  const resolvedIndex = chapter
    ? project.chapters.findIndex((item) => item.id === chapter.id)
    : -1;
  const previousChapter =
    resolvedIndex > 0 ? project.chapters[resolvedIndex - 1] : null;
  const nextChapter =
    resolvedIndex >= 0 && resolvedIndex < project.chapters.length - 1
      ? project.chapters[resolvedIndex + 1]
      : null;

  const goChapter = (id: string) => {
    if (busy) {
      onToast("请先取消当前任务再切换章节");
      return;
    }
    onSelectChapter(id);
  };

  const displayHits = useMemo(() => {
    if (!chapter?.content) return [] as SeasoningHit[];
    return manualHits
      .filter((hit) => {
        if (hit.excerptStart < 0 || hit.excerptEnd > chapter.content.length)
          return false;
        return (
          chapter.content.slice(hit.excerptStart, hit.excerptEnd) === hit.excerpt
        );
      })
      .map((hit) =>
        hit.id === activeHitId
          ? { ...hit, sceneId: pickedSceneId || undefined }
          : hit,
      );
  }, [manualHits, chapter?.content, activeHitId, pickedSceneId]);

  const segments = useMemo(
    () =>
      chapter?.content
        ? segmentContentByHits(chapter.content, displayHits)
        : [],
    [chapter?.content, displayHits],
  );

  const activeHit =
    displayHits.find((item) => item.id === activeHitId) ??
    displayHits[displayHits.length - 1] ??
    null;

  useEffect(() => {
    if (!displayHits.length) {
      setActiveHitId(null);
      return;
    }
    setActiveHitId((current) =>
      current && displayHits.some((item) => item.id === current)
        ? current
        : displayHits[displayHits.length - 1].id,
    );
  }, [displayHits]);

  useEffect(() => {
    setDraftByHit({});
    setAdviceByHit({});
    setRewritePreview(null);
    setCaptureOffer(null);
    setManualHits([]);
    setActiveHitId(null);
    setPickedSceneId("");
  }, [chapter?.id]);

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

  useEffect(() => {
    if (!activeHitId || !readerRef.current) return;
    const mark = readerRef.current.querySelector(
      `[data-hit-id="${CSS.escape(activeHitId)}"]`,
    );
    mark?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeHitId]);

  useEffect(() => {
    if (!activeHit) return;
    setPickedSceneId(activeHit.sceneId ?? "");
  }, [activeHit?.id]);

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

  const linkedScene = activeHit?.sceneId
    ? (project.seasoningScenes ?? []).find(
        (item) => item.id === activeHit.sceneId,
      )
    : null;
  const activeAdvice = activeHit ? adviceByHit[activeHit.id] ?? "" : "";
  const activeDraft = activeHit ? draftByHit[activeHit.id] ?? "" : "";
  const executableAdvice = activeAdvice.trim() || activeDraft.trim();

  const setActiveDraft = (value: string) => {
    if (!activeHit) return;
    setDraftByHit((current) => ({ ...current, [activeHit.id]: value }));
  };

  const setActiveAdvice = (value: string) => {
    if (!activeHit) return;
    setAdviceByHit((current) => ({ ...current, [activeHit.id]: value }));
  };

  const captureSelection = () => {
    if (!chapter?.content || !readerRef.current || busy) return;
    const offsets = getOffsetsInTextContainer(readerRef.current);
    if (!offsets) return;
    let start = offsets.start;
    let end = offsets.end;
    if (chapter.content.slice(start, end) !== offsets.text) {
      const nearby = chapter.content.indexOf(
        offsets.text,
        Math.max(0, start - 40),
      );
      if (nearby < 0) return;
      start = nearby;
      end = nearby + offsets.text.length;
    }
    if (end - start > 4000) {
      onToast("选区过长，请缩短后再加料（建议不超过约 4000 字）");
      return;
    }
    const hit = createManualSeasoningHit(chapter.content, start, end, {
      sceneId: pickedSceneId || undefined,
    });
    if (!hit) return;
    setManualHits((current) => {
      const withoutOverlap = current.filter(
        (item) => item.end <= hit.start || item.start >= hit.end,
      );
      return [...withoutOverlap.filter((item) => item.id !== hit.id), hit];
    });
    setActiveHitId(hit.id);
    setRewritePreview(null);
    window.getSelection()?.removeAllRanges();
  };

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
    setMode("library");
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
    setBusy(null);
    setProgress("");
  };

  const selectHit = (hitId: string) => {
    setActiveHitId(hitId);
    setRewritePreview((current) =>
      current?.hitId === hitId ? current : null,
    );
  };

  const runAdvise = async () => {
    if (!chapter || !activeHit) return;
    if (!provider?.apiKey.trim()) {
      onToast(`请先在设置中填写 ${provider?.name ?? "AI"} API Key`);
      return;
    }
    if (!activeDraft.trim()) {
      onToast("请先填写你的加料说明");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("advise");
    setProgress("正在润色你的加料说明…");
    setAdviceByHit((current) => ({ ...current, [activeHit.id]: "" }));
    setRewritePreview(null);
    try {
      const advice = await onAdviseHit(
        chapter,
        activeHit,
        activeDraft,
        controller.signal,
        (chunk) => {
          setAdviceByHit((current) => ({
            ...current,
            [activeHit.id]: `${current[activeHit.id] ?? ""}${chunk}`,
          }));
        },
      );
      setAdviceByHit((current) => ({ ...current, [activeHit.id]: advice }));
      onToast("已润色加料说明，可再编辑后执行改写");
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        onToast(reason instanceof Error ? reason.message : "润色说明失败");
      }
    } finally {
      setBusy(null);
      setProgress("");
      abortRef.current = null;
    }
  };

  const runRewrite = async () => {
    if (!chapter || !activeHit) return;
    if (!provider?.apiKey.trim()) {
      onToast(`请先在设置中填写 ${provider?.name ?? "AI"} API Key`);
      return;
    }
    if (!executableAdvice) {
      onToast("请先填写加料说明，或先让 AI 润色后再改写");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("rewrite");
    setProgress("正在按说明改写选区…");
    setRewritePreview({
      hitId: activeHit.id,
      before: activeHit.excerpt,
      after: "",
    });
    try {
      const after = await onRewriteHit(
        chapter,
        activeHit,
        executableAdvice,
        controller.signal,
        (chunk) => {
          setRewritePreview((current) =>
            current?.hitId === activeHit.id
              ? { ...current, after: `${current.after}${chunk}` }
              : current,
          );
        },
      );
      setRewritePreview({
        hitId: activeHit.id,
        before: activeHit.excerpt,
        after,
      });
      onToast("局部改写已就绪，确认后写入");
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        onToast(reason instanceof Error ? reason.message : "局部改写失败");
      }
      setRewritePreview(null);
    } finally {
      setBusy(null);
      setProgress("");
      abortRef.current = null;
    }
  };

  const applyRewrite = () => {
    if (!chapter || !activeHit || !rewritePreview?.after.trim()) return;
    if (rewritePreview.hitId !== activeHit.id) return;
    const nextContent = applySeasoningHitRewrite(
      chapter.content,
      activeHit,
      rewritePreview.after,
    );
    onUpdate((current) => ({
      ...current,
      chapters: current.chapters.map((item) =>
        item.id === chapter.id
          ? { ...item, content: nextContent, updatedAt: now() }
          : item,
      ),
      updatedAt: now(),
    }));
    setRewritePreview(null);
    setManualHits([]);
    setActiveHitId(null);
    setCaptureOffer({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
    });
    onToast("已写入局部加料，可选择是否补充设定");
  };

  const dismissCaptureOffer = () => setCaptureOffer(null);

  const runCaptureLore = async () => {
    if (!chapter || captureOffer?.chapterId !== chapter.id) return;
    if (!provider?.apiKey.trim()) {
      onToast(`请先在设置中填写 ${provider?.name ?? "AI"} API Key`);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("capture");
    setProgress("正在补充角色与时间线…");
    try {
      const result = await onCaptureHitLore(
        chapter,
        controller.signal,
        setProgress,
      );
      setCaptureOffer(null);
      if (result.characterCount || result.memoryCount) {
        onToast(
          `已补充设定：角色 ${result.characterCount} · 时间线/关系 ${result.memoryCount}`,
        );
      } else {
        onToast("未发现需要新增的角色或时间线，已跳过写入");
      }
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        onToast(reason instanceof Error ? reason.message : "补充设定失败");
      }
    } finally {
      setBusy(null);
      setProgress("");
      abortRef.current = null;
    }
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
              : "可先在资料库写场景说明与加料规范（可选），再到选区页拖选正文加料。"}
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

      <div className="seasoning-toolbar">
        <div>
          <p>
            在正文中拖选片段，先写你的加料说明，再让 AI 润色，确认后按说明改写；场景/规范可选。
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
          <div className="seasoning-mode-tabs" role="tablist" aria-label="加料工作区">
            <button
              type="button"
              className={mode === "annotate" ? "active" : ""}
              onClick={() => setMode("annotate")}
            >
              选区加料
            </button>
            <button
              type="button"
              className={mode === "library" ? "active" : ""}
              onClick={() => setMode("library")}
            >
              资料库
            </button>
          </div>
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
        </div>
      </div>

      {mode === "annotate" ? (
        <div className="seasoning-annotate">
          <div className="seasoning-annotate-head">
            <div>
              <strong>
                {chapter
                  ? `第${(resolvedIndex >= 0 ? resolvedIndex : chapterIndex) + 1}章 · ${chapter.title}`
                  : "未选择章节"}
              </strong>
              <small>
                {chapter?.content.trim()
                  ? `已选 ${displayHits.length} 处 · ${resolvedIndex + 1} / ${project.chapters.length}`
                  : "请先在大纲选中有正文的章节"}
              </small>
            </div>
            <div className="seasoning-annotate-actions">
              <button
                type="button"
                className="icon-button small"
                disabled={!previousChapter || Boolean(busy)}
                aria-label="上一章"
                title={
                  previousChapter
                    ? `上一章：${previousChapter.title}`
                    : "已是第一章"
                }
                onClick={() =>
                  previousChapter && goChapter(previousChapter.id)
                }
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-button small"
                disabled={!nextChapter || Boolean(busy)}
                aria-label="下一章"
                title={
                  nextChapter ? `下一章：${nextChapter.title}` : "已是最后一章"
                }
                onClick={() => nextChapter && goChapter(nextChapter.id)}
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="secondary-button compact"
                disabled={Boolean(busy)}
                onClick={onOpenOutline}
              >
                打开大纲
              </button>
              {!chapter?.content.trim() ? null : (
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={Boolean(busy) || !displayHits.length}
                  onClick={() => {
                    setManualHits([]);
                    setActiveHitId(null);
                    setRewritePreview(null);
                    onToast("已清空本次选区");
                  }}
                >
                  清空选区
                </button>
              )}
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => {
                  setTab("scenes");
                  setMode("library");
                }}
              >
                编辑场景/规范
              </button>
            </div>
          </div>

          {!chapter?.content.trim() ? (
            <div className="seasoning-annotate-empty">
              <p>当前章节没有正文，无法选区加料。请到大纲选择或写入章节内容。</p>
              <button
                type="button"
                className="secondary-button compact"
                onClick={onOpenOutline}
              >
                打开大纲
              </button>
            </div>
          ) : (
            <div className="seasoning-annotate-body">
              <aside className="seasoning-hit-list" aria-label="选区列表">
                {displayHits.length ? (
                  displayHits.map((hit, index) => (
                    <button
                      key={hit.id}
                      type="button"
                      className={`seasoning-hit-item ${activeHit?.id === hit.id ? "active" : ""}`}
                      onClick={() => selectHit(hit.id)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>「{hit.matchedText}」</strong>
                      <small>
                        {hit.excerpt.length.toLocaleString()} 字 · 手动选中
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="seasoning-hit-empty">
                    在中间正文拖选一段文字，选区会出现在这里。
                  </div>
                )}
              </aside>

              <div className="seasoning-reader-wrap">
                <div
                  ref={readerRef}
                  className="seasoning-reader"
                  aria-label="章节正文，拖选后加料"
                  onMouseUp={captureSelection}
                >
                  {segments.map((part, index) =>
                    part.type === "hit" ? (
                      <mark
                        key={`${part.hit.id}-${index}`}
                        data-hit-id={part.hit.id}
                        className={`seasoning-hit-mark ${activeHit?.id === part.hit.id ? "active" : ""}`}
                        onClick={(event) => {
                          event.preventDefault();
                          selectHit(part.hit.id);
                        }}
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={`text-${index}`}>{part.text}</span>
                    ),
                  )}
                </div>
              </div>

              <aside className="seasoning-advice-panel" aria-label="加料意见">
                {activeHit ? (
                  <>
                    <div className="seasoning-advice-head">
                      <strong>选中「{activeHit.matchedText}」</strong>
                      <small>
                        {activeHit.excerpt.length.toLocaleString()} 字选区
                      </small>
                    </div>
                    <label className="seasoning-scene-picker">
                      <span>选用场景说明（可选）</span>
                      <select
                        value={pickedSceneId}
                        disabled={Boolean(busy)}
                        onChange={(event) =>
                          setPickedSceneId(event.target.value)
                        }
                      >
                        <option value="">不指定场景</option>
                        {(project.seasoningScenes ?? []).map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {linkedScene ? (
                      <div className="seasoning-advice-scene">
                        <span>场景摘要</span>
                        <strong>{linkedScene.title}</strong>
                        <p>{linkedScene.content || "（无内容）"}</p>
                      </div>
                    ) : (
                      <p className="seasoning-advice-hint">
                        未指定场景也可以；先写清你想怎么加料即可。
                      </p>
                    )}
                    <div className="seasoning-advice-excerpt">
                      <span>选中原文</span>
                      <pre>{activeHit.excerpt}</pre>
                    </div>
                    <label className="seasoning-draft-field">
                      <span>我的加料说明</span>
                      <textarea
                        value={activeDraft}
                        disabled={Boolean(busy)}
                        onChange={(event) => setActiveDraft(event.target.value)}
                        placeholder="先写你想怎么加：例如补潮湿气味、手心发紧、雨声压住对话……"
                      />
                    </label>
                    <div className="seasoning-advice-actions">
                      <button
                        type="button"
                        className="primary-button compact"
                        disabled={Boolean(busy) || !activeDraft.trim()}
                        onClick={() => void runAdvise()}
                      >
                        {busy === "advise" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <FlaskConical size={15} />
                        )}
                        {busy === "advise" ? "润色中…" : "AI 润色说明"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={Boolean(busy) || !executableAdvice}
                        onClick={() => void runRewrite()}
                      >
                        {busy === "rewrite" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Check size={15} />
                        )}
                        按说明改写此处
                      </button>
                    </div>
                    {busy && progress ? (
                      <p className="import-txt-warning warn">{progress}</p>
                    ) : null}
                    <label className="seasoning-draft-field">
                      <span>润色后的执行说明（可再改）</span>
                      <textarea
                        value={activeAdvice}
                        disabled={Boolean(busy)}
                        onChange={(event) => setActiveAdvice(event.target.value)}
                        placeholder="点「AI 润色说明」后会出现可执行指令；也可把你的说明润色结果贴到这里再改写。"
                      />
                    </label>
                    {rewritePreview?.hitId === activeHit.id ? (
                      <div className="seasoning-local-diff">
                        <span>局部改写预览</span>
                        <div className="seasoning-diff-grid">
                          <section>
                            <h3>原文</h3>
                            <pre>{rewritePreview.before}</pre>
                          </section>
                          <section>
                            <h3>改写</h3>
                            <pre>
                              {rewritePreview.after ||
                                (busy === "rewrite" ? "生成中…" : "")}
                            </pre>
                          </section>
                        </div>
                        <div className="seasoning-advice-actions">
                          <button
                            type="button"
                            className="secondary-button compact"
                            disabled={Boolean(busy)}
                            onClick={() => setRewritePreview(null)}
                          >
                            放弃
                          </button>
                          <button
                            type="button"
                            className="primary-button compact"
                            disabled={
                              Boolean(busy) || !rewritePreview.after.trim()
                            }
                            onClick={applyRewrite}
                          >
                            <Check size={15} />
                            写入正文
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {captureOffer?.chapterId === chapter?.id ? (
                      <div className="seasoning-capture-offer">
                        <strong>是否补充设定？</strong>
                        <p>
                          正文已写入《{captureOffer.chapterTitle}
                          》。可根据本次加料内容抽取角色资料与时间线记忆；不需要可跳过。
                        </p>
                        {busy === "capture" && progress ? (
                          <p className="import-txt-warning warn">{progress}</p>
                        ) : null}
                        <div className="seasoning-advice-actions">
                          <button
                            type="button"
                            className="secondary-button compact"
                            disabled={busy === "capture"}
                            onClick={dismissCaptureOffer}
                          >
                            暂不补充
                          </button>
                          <button
                            type="button"
                            className="primary-button compact"
                            disabled={Boolean(busy)}
                            onClick={() => void runCaptureLore()}
                          >
                            {busy === "capture" ? (
                              <LoaderCircle className="spin" size={15} />
                            ) : (
                              <Check size={15} />
                            )}
                            {busy === "capture"
                              ? "补充中…"
                              : "补充角色与时间线"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="seasoning-advice-empty">
                    在正文拖选一段文字后，先写加料说明，再润色并改写。
                    {captureOffer?.chapterId === chapter?.id ? (
                      <div className="seasoning-capture-offer" style={{ marginTop: 12, textAlign: "left" }}>
                        <strong>是否补充设定？</strong>
                        <p>
                          正文已写入《{captureOffer.chapterTitle}
                          》。可继续补充角色与时间线。
                        </p>
                        <div className="seasoning-advice-actions">
                          <button
                            type="button"
                            className="secondary-button compact"
                            disabled={busy === "capture"}
                            onClick={dismissCaptureOffer}
                          >
                            暂不补充
                          </button>
                          <button
                            type="button"
                            className="primary-button compact"
                            disabled={Boolean(busy)}
                            onClick={() => void runCaptureLore()}
                          >
                            {busy === "capture" ? (
                              <LoaderCircle className="spin" size={15} />
                            ) : (
                              <Check size={15} />
                            )}
                            {busy === "capture"
                              ? "补充中…"
                              : "补充角色与时间线"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      ) : (
        <>
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
                        onChange={(event) =>
                          patch({ title: event.target.value })
                        }
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
        </>
      )}
    </div>
  );
}
