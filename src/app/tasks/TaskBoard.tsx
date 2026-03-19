"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type ColorToken = "amber" | "emerald" | "sky" | "rose" | "violet";

type Todo = { id: string; text: string; done: boolean };
type Comment = { id: string; text: string; createdAt: string; image?: string };

type TaskCard = {
  id: string;
  title: string;
  note?: string;
  x: number;
  y: number;
  color: ColorToken;
  duration?: number; // Durchlaufzeit in Tagen, default 1
  todos?: Todo[];
  comments?: Comment[];
};

type TaskConnection = {
  id: string;
  from: string;
  to: string;
};

type PersistedBoard = {
  tasks: TaskCard[];
  connections: TaskConnection[];
};

const CARD_WIDTH = 224;
const CARD_HEIGHT = 140;
const CARD_HALF_WIDTH = CARD_WIDTH / 2;
const CARD_HALF_HEIGHT = CARD_HEIGHT / 2;
const CARD_ANCHOR_INSET = 8;
const STORAGE_KEY = "task-board:v1";
const HOURLY_RATE = 220;
const HOURS_PER_DAY = 8;
const formatChf = (chf: number) => {
  const n = Math.round(chf);
  // manual apostrophe-thousands separator (CH style), no locale API
  const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u2019");
  return "CHF\u00a0" + s;
};
const COLORS: Record<ColorToken, { bg: string; border: string; text: string }> = {
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  sky: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-900" },
};

const paletteOrder: ColorToken[] = ["amber", "emerald", "sky", "rose", "violet"];

const fallbackBoard: PersistedBoard = {
  tasks: [
    {
      id: "t-plan",
      title: "Plan Einkauf",
      note: "Cluster Listen nach Ort",
      x: 80,
      y: 80,
      color: "amber",
    },
    {
      id: "t-check",
      title: "Check Vorrat",
      note: "Kuehlschrank + Lager",
      x: 360,
      y: 220,
      color: "emerald",
    },
    {
      id: "t-sync",
      title: "Liste sync",
      note: "WG fragen -> Items",
      x: 640,
      y: 100,
      color: "sky",
    },
  ],
  connections: [
    { id: "c1", from: "t-plan", to: "t-sync" },
    { id: "c2", from: "t-plan", to: "t-check" },
  ],
};

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Only clamp to a minimum of 12px from top/left — no upper bound so the board can grow freely.
const clampWithinBoard = (x: number, y: number) => ({
  x: Math.max(12, x),
  y: Math.max(12, y),
});

const computeAnchorPoint = (source: TaskCard, target: TaskCard) => {
  const centerX = source.x + CARD_HALF_WIDTH;
  const centerY = source.y + CARD_HALF_HEIGHT;
  const targetCenterX = target.x + CARD_HALF_WIDTH;
  const targetCenterY = target.y + CARD_HALF_HEIGHT;
  const dx = targetCenterX - centerX;
  const dy = targetCenterY - centerY;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const safeHalfWidth = Math.max(4, CARD_HALF_WIDTH - CARD_ANCHOR_INSET);
  const safeHalfHeight = Math.max(4, CARD_HALF_HEIGHT - CARD_ANCHOR_INSET);
  const limitX = Math.abs(ux) > 0 ? safeHalfWidth / Math.abs(ux) : Number.POSITIVE_INFINITY;
  const limitY = Math.abs(uy) > 0 ? safeHalfHeight / Math.abs(uy) : Number.POSITIVE_INFINITY;
  const travel = Math.min(limitX, limitY);
  return {
    x: centerX + ux * travel,
    y: centerY + uy * travel,
  };
};

// ─── Auto-Layout (topological sort → column / row placement) ─────────────────

function autoLayoutTasks(tasks: TaskCard[], connections: TaskConnection[]): TaskCard[] {
  const COL_GAP = 60;
  const ROW_GAP = 32;
  const PAD_X = 40;
  const PAD_Y = 40;

  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of ids) {
    successors.set(id, []);
    predecessors.set(id, []);
    inDegree.set(id, 0);
  }
  for (const c of connections) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    successors.get(c.from)!.push(c.to);
    predecessors.get(c.to)!.push(c.from);
    inDegree.set(c.to, (inDegree.get(c.to) ?? 0) + 1);
  }

  // Kahn's topological sort
  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const topoOrder: string[] = [];
  const deg = new Map(inDegree);
  while (queue.length > 0) {
    const node = queue.shift()!;
    topoOrder.push(node);
    for (const s of successors.get(node) ?? []) {
      const d = (deg.get(s) ?? 0) - 1;
      deg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  if (topoOrder.length !== ids.length) return tasks; // cycle → skip

  // Assign column = longest path from any root
  const col = new Map<string, number>();
  for (const id of topoOrder) {
    const preds = predecessors.get(id) ?? [];
    col.set(id, preds.length === 0 ? 0 : Math.max(...preds.map((p) => col.get(p) ?? 0)) + 1);
  }

  // Group by column, assign rows by order within column
  const colGroups = new Map<number, string[]>();
  for (const id of topoOrder) {
    const c = col.get(id) ?? 0;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c)!.push(id);
  }

  const posMap = new Map<string, { x: number; y: number }>();
  for (const [c, group] of colGroups) {
    group.forEach((id, row) => {
      posMap.set(id, {
        x: PAD_X + c * (CARD_WIDTH + COL_GAP),
        y: PAD_Y + row * (CARD_HEIGHT + ROW_GAP),
      });
    });
  }

  return tasks.map((t) => {
    const pos = posMap.get(t.id);
    return pos ? { ...t, ...pos } : t;
  });
}

// ─── Critical Path Method (CPM) ───────────────────────────────────────────────

type CriticalPathResult = {
  criticalTaskIds: Set<string>;
  criticalConnectionIds: Set<string>;
  projectDuration: number;
  hasCycle: boolean;
};

function computeCriticalPath(tasks: TaskCard[], connections: TaskConnection[]): CriticalPathResult {
  const empty: CriticalPathResult = {
    criticalTaskIds: new Set(),
    criticalConnectionIds: new Set(),
    projectDuration: 0,
    hasCycle: false,
  };
  if (tasks.length === 0 || connections.length === 0) return empty;

  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  const connectedIds = new Set<string>();
  for (const id of ids) {
    successors.set(id, []);
    predecessors.set(id, []);
    inDegree.set(id, 0);
  }
  for (const c of connections) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    successors.get(c.from)!.push(c.to);
    predecessors.get(c.to)!.push(c.from);
    inDegree.set(c.to, (inDegree.get(c.to) ?? 0) + 1);
    connectedIds.add(c.from);
    connectedIds.add(c.to);
  }

  // Topological sort
  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const topoOrder: string[] = [];
  const deg = new Map(inDegree);
  while (queue.length > 0) {
    const node = queue.shift()!;
    topoOrder.push(node);
    for (const s of successors.get(node) ?? []) {
      const d = (deg.get(s) ?? 0) - 1;
      deg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  if (topoOrder.length !== ids.length) return { ...empty, hasCycle: true };

  // Forward pass: ES / EF
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  for (const id of topoOrder) {
    const dur = tasks.find((t) => t.id === id)?.duration ?? 1;
    const preds = predecessors.get(id) ?? [];
    const es = preds.length === 0 ? 0 : Math.max(...preds.map((p) => EF.get(p) ?? 0));
    ES.set(id, es);
    EF.set(id, es + dur);
  }

  const projectDuration = EF.size === 0 ? 0 : Math.max(...EF.values());

  // Backward pass: LF / LS
  const LF = new Map<string, number>();
  const LS = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const dur = tasks.find((t) => t.id === id)?.duration ?? 1;
    const succs = successors.get(id) ?? [];
    const lf = succs.length === 0 ? projectDuration : Math.min(...succs.map((s) => LS.get(s) ?? projectDuration));
    LF.set(id, lf);
    LS.set(id, lf - dur);
  }

  // Float → critical tasks
  const criticalTaskIds = new Set<string>();
  for (const id of ids) {
    if (!connectedIds.has(id)) continue;
    const float = (LS.get(id) ?? 0) - (ES.get(id) ?? 0);
    if (Math.abs(float) < 0.001) criticalTaskIds.add(id);
  }

  // Critical connections: both endpoints critical AND EF[from] == ES[to]
  const criticalConnectionIds = new Set<string>();
  for (const c of connections) {
    if (
      criticalTaskIds.has(c.from) &&
      criticalTaskIds.has(c.to) &&
      Math.abs((EF.get(c.from) ?? 0) - (ES.get(c.to) ?? 0)) < 0.001
    ) {
      criticalConnectionIds.add(c.id);
    }
  }

  return { criticalTaskIds, criticalConnectionIds, projectDuration, hasCycle: false };
}

type ExternalBoard = {
  tasks: Array<TaskCard & { x: number; y: number }>;
  connections: TaskConnection[];
};

type TaskBoardProps = {
  externalBoard?: ExternalBoard | null;
  onExternalBoardConsumed?: () => void;
};

export function TaskBoard({ externalBoard, onExternalBoardConsumed }: TaskBoardProps = {}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const [tasks, setTasks] = useState<TaskCard[]>(fallbackBoard.tasks);
  const [connections, setConnections] = useState<TaskConnection[]>(fallbackBoard.connections);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftColor, setDraftColor] = useState<ColorToken>(paletteOrder[0]);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [draftTodo, setDraftTodo] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [draftCommentImage, setDraftCommentImage] = useState<string | null>(null);

  // Load external board (from wizard)
  useEffect(() => {
    if (!externalBoard) return;
    startTransition(() => {
      setTasks(externalBoard.tasks as TaskCard[]);
      setConnections(externalBoard.connections);
      setLinkSource(null);
    });
    onExternalBoardConsumed?.();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalBoard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        startTransition(() => setIsHydrated(true));
        return;
      }
      const parsed = JSON.parse(raw) as PersistedBoard;
      startTransition(() => {
        if (Array.isArray(parsed.tasks)) {
          setTasks(parsed.tasks);
        }
        if (Array.isArray(parsed.connections)) {
          setConnections(parsed.connections);
        }
        setIsHydrated(true);
      });
    } catch (error) {
      console.warn("Task board state invalid, fallback used", error);
      startTransition(() => setIsHydrated(true));
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    const payload: PersistedBoard = { tasks, connections };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [tasks, connections, isHydrated]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const board = boardRef.current;
      if (!board) return;

      if (!drag.moved) {
        const delta = Math.abs(event.clientX - drag.originX) + Math.abs(event.clientY - drag.originY);
        if (delta > 3) {
          drag.moved = true;
        }
      }

      if (!drag.moved) return;

      const rect = board.getBoundingClientRect();
      const nextPos = clampWithinBoard(
        event.clientX - rect.left - drag.offsetX,
        event.clientY - rect.top - drag.offsetY,
      );

      setTasks((prev) =>
        prev.map((task) =>
          task.id === drag.id
            ? {
                ...task,
                x: nextPos.x,
                y: nextPos.y,
              }
            : task
        )
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const connectionLines = useMemo(() => {
    return connections
      .map((connection) => {
        const from = tasks.find((task) => task.id === connection.from);
        const to = tasks.find((task) => task.id === connection.to);
        if (!from || !to) return null;
        const start = computeAnchorPoint(from, to);
        const end = computeAnchorPoint(to, from);
        return {
          id: connection.id,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
        };
      })
      .filter(Boolean) as Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>;
  }, [connections, tasks]);

  const handlePointerDown = (taskId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || linkSource) return;
    const board = boardRef.current;
    if (!board) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const rect = board.getBoundingClientRect();
    dragRef.current = {
      id: taskId,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left - task.x,
      offsetY: event.clientY - rect.top - task.y,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCardClick = (taskId: string) => {
    if (!linkSource || linkSource === taskId) return;
    const sourceId = linkSource;
    setConnections((prev) => {
      const exists = prev.some(
        (connection) =>
          (connection.from === sourceId && connection.to === taskId) ||
          (connection.from === taskId && connection.to === sourceId)
      );
      if (exists) {
        return prev;
      }
      return [...prev, { id: newId(), from: sourceId, to: taskId }];
    });
    setLinkSource(null);
  };

  const handleLinkButtonClick = (taskId: string) => {
    setLinkSource((prev) => (prev === taskId ? null : taskId));
  };

  const handleReset = () => {
    setTasks(fallbackBoard.tasks);
    setConnections(fallbackBoard.connections);
    setLinkSource(null);
    setDraftTitle("");
    setDraftNote("");
    setDraftColor(paletteOrder[0]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const boardDimensions = useMemo(() => {
    const PAD = 40;
    const MIN_W = 640;
    const MIN_H = 560;
    if (tasks.length === 0) return { width: MIN_W, height: MIN_H };
    const maxRight = Math.max(...tasks.map((t) => t.x + CARD_WIDTH)) + PAD;
    const maxBottom = Math.max(...tasks.map((t) => t.y + CARD_HEIGHT)) + PAD;
    return {
      width: Math.max(MIN_W, maxRight),
      height: Math.max(MIN_H, maxBottom),
    };
  }, [tasks]);

  const criticalPath = useMemo(() => computeCriticalPath(tasks, connections), [tasks, connections]);

  const totalPrice = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.duration ?? 1), 0) * HOURS_PER_DAY * HOURLY_RATE,
    [tasks]
  );

  const handleAutoLayout = () => {
    setTasks((prev) => autoLayoutTasks(prev, connections));
  };

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;

    const offset = (tasks.length % 5) * 28;
    const baseX = 48 + offset * 1.5;
    const baseY = 64 + offset * 0.8;
    const nextPos = clampWithinBoard(baseX, baseY);

    setTasks((prev) => [
      ...prev,
      {
        id: newId(),
        title,
        note: draftNote.trim() || undefined,
        x: nextPos.x,
        y: nextPos.y,
        color: draftColor,
      },
    ]);
    setDraftTitle("");
    setDraftNote("");
    setDraftColor((prev) => {
      const currentIndex = paletteOrder.indexOf(prev);
      const nextIndex = (currentIndex + 1) % paletteOrder.length;
      return paletteOrder[nextIndex];
    });
    setLinkSource(null);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAddTask}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end sm:gap-4"
      >
        <label className="flex-1 text-sm font-semibold text-zinc-700">
          Task Titel
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Neue Idee"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-base text-zinc-900 focus:border-zinc-400 focus:outline-none"
          />
        </label>
        <label className="flex-1 text-sm font-semibold text-zinc-700">
          Notiz (optional)
          <input
            type="text"
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            placeholder="Details..."
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-base text-zinc-900 focus:border-zinc-400 focus:outline-none"
          />
        </label>
        <div className="flex flex-1 flex-col gap-2 text-sm font-semibold text-zinc-700">
          Farbe
          <div className="flex flex-wrap gap-2">
            {paletteOrder.map((color) => {
              const palette = COLORS[color];
              const isActive = draftColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraftColor(color)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isActive ? `${palette.border} ${palette.text} ring-2 ring-zinc-900` : "border-zinc-200 text-zinc-600"
                  } ${palette.bg}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden />
                  {color}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="submit"
          className="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-base font-semibold text-white transition hover:bg-zinc-800 sm:mt-0"
        >
          Task anlegen
        </button>
      </form>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === "board" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === "table" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Tabelle
          </button>
        </div>
        {view === "board" && (
          <>
            <button
              type="button"
              onClick={handleAutoLayout}
              disabled={connections.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Tasks automatisch nach Prozessfluss anordnen"
            >
              ⬡ Auto-Layout
            </button>
            <span className="text-xs text-zinc-400">
              {linkSource ? "Klick auf Zielkarte verbindet" : "Drag = verschieben \u00b7 \u2301 = verlinken"}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          Reset Board
        </button>
      </div>

      {/* Critical path info strip */}
      {view === "board" && !criticalPath.hasCycle && criticalPath.projectDuration > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2 text-xs">
          <span className="font-semibold text-orange-800">Kritischer Weg</span>
          <span className="text-zinc-700">
            Projektdauer: <strong>{criticalPath.projectDuration} Tage</strong>
          </span>
          <span className="text-zinc-300">|</span>
          <span className="text-zinc-500">Orangene Knoten &amp; Kanten = kein Zeitpuffer</span>
        </div>
      )}

      {/* Price summary */}
      {view === "board" && tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2 text-xs">
          <span className="font-semibold text-zinc-700">Projektkosten</span>
          <span className="tabular-nums text-zinc-600">
            {tasks.reduce((s, t) => s + (t.duration ?? 1), 0)} Tage &times; {HOURS_PER_DAY}h &times; CHF {HOURLY_RATE} ={" "}
            <strong className="text-zinc-800">{formatChf(totalPrice)}</strong>
          </span>
        </div>
      )}

      {/* Board view */}
      {view === "board" && (
        <>
          {linkSource ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-4 py-2 text-sm text-zinc-700">
              Verbinde ab{" "}
              <span className="font-semibold">{tasks.find((t) => t.id === linkSource)?.title ?? ""}</span>. Klick auf Zielkarte oder Reset zum Abbrechen.
            </div>
          ) : null}

          <div
            ref={boardRef}
            className="relative rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-4 shadow-inner"
            style={{
              minWidth: "100%",
              width: boardDimensions.width,
              minHeight: boardDimensions.height,
              transition: "width 0.2s, min-height 0.2s",
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_rgba(24,24,27,0.04)_1px,_transparent_1px)] bg-[length:32px_32px]" aria-hidden />
            <svg className="pointer-events-none absolute inset-0" aria-hidden="true" width="100%" height="100%">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#a1a1aa" />
                </marker>
                <marker id="arrowhead-critical" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#f97316" />
                </marker>
              </defs>
              {connectionLines.map((line) => {
                const isCritical = criticalPath.criticalConnectionIds.has(line.id);
                return (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={isCritical ? "#f97316" : "#a1a1aa"}
                    strokeWidth={isCritical ? 2.5 : 2}
                    strokeLinecap="round"
                    markerEnd={isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
                    className="mix-blend-multiply"
                  />
                );
              })}
            </svg>
            {tasks.map((task) => {
              const color = COLORS[task.color];
              return (
                <article
                  key={task.id}
                  className={`absolute w-[224px] cursor-grab rounded-2xl border p-3 text-sm shadow-md transition-shadow ${color.bg} ${color.border} ${color.text} ${
                    linkSource === task.id
                      ? "ring-2 ring-zinc-900"
                      : criticalPath.criticalTaskIds.has(task.id)
                      ? "ring-2 ring-orange-400 shadow-orange-100"
                      : ""
                  }`}
                  style={{ transform: `translate(${task.x}px, ${task.y}px)` }}
                  onPointerDown={(event) => handlePointerDown(task.id, event)}
                  onClick={() => handleCardClick(task.id)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="flex-1 text-base font-semibold leading-snug">{task.title}</h3>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDetailTaskId(task.id); }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-xs text-zinc-400 transition hover:border-zinc-300 hover:text-zinc-700"
                        aria-label="Details öffnen"
                        title="Todos / Kommentare"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleLinkButtonClick(task.id);
                        }}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                          linkSource === task.id ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:border-zinc-300"
                        }`}
                        aria-label="Link-Modus fuer Task"
                        title="Link-Modus"
                      >
                        ⌁
                      </button>
                    </div>
                  </div>
                  {task.note ? <p className="mt-1 text-xs text-zinc-600">{task.note}</p> : null}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                    <label className="flex cursor-default items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={task.duration ?? 1}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setTasks((prev) =>
                            prev.map((t) => (t.id === task.id ? { ...t, duration: val } : t))
                          );
                        }}
                        className="w-9 rounded border border-zinc-300 bg-white/80 px-1 py-0.5 text-center text-[11px] font-semibold text-zinc-700 focus:border-zinc-400 focus:outline-none"
                        aria-label="Durchlaufzeit in Tagen"
                      />
                      <span className="uppercase tracking-wide">d</span>
                    </label>
                    <span className="font-semibold tabular-nums text-zinc-600">
                      {formatChf((task.duration ?? 1) * HOURS_PER_DAY * HOURLY_RATE)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          {connections.length ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Aktive Verbindungen</h3>
                <span className="text-xs uppercase tracking-wide text-zinc-500">{connections.length}</span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {connections.map((connection) => {
                  const fromTask = tasks.find((task) => task.id === connection.from);
                  const toTask = tasks.find((task) => task.id === connection.to);
                  return (
                    <li
                      key={connection.id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700"
                    >
                      <span className="max-w-[180px] truncate">
                        {(fromTask?.title ?? "Task").slice(0, 40)} → {(toTask?.title ?? "Task").slice(0, 40)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConnections((prev) => prev.filter((c) => c.id !== connection.id))
                        }
                        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 text-[10px] text-zinc-500 hover:bg-zinc-200"
                        aria-label="Verbindung loeschen"
                        title="Verbindung loeschen"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {/* Table view */}
      {view === "table" && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm text-zinc-700">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 text-left font-semibold">Farbe</th>
                <th className="px-4 py-3 text-left font-semibold">Titel</th>
                <th className="px-4 py-3 text-left font-semibold">Tage</th>
                <th className="px-4 py-3 text-left font-semibold">Notiz</th>
                <th className="px-4 py-3 text-left font-semibold">Prozessfluss</th>
                <th className="px-4 py-3 text-right font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Noch keine Tasks. Oben Task anlegen.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const color = COLORS[task.color];
                  const outgoing = connections.filter((c) => c.from === task.id);
                  const incoming = connections.filter((c) => c.to === task.id);
                  const hasLinks = outgoing.length > 0 || incoming.length > 0;
                  return (
                    <tr key={task.id} className="group hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color.bg} ${color.border} ${color.text}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
                          {task.color}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">
                        <div className="flex items-center gap-2">
                          {criticalPath.criticalTaskIds.has(task.id) && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" title="Kritischer Pfad" />
                          )}
                          {task.title}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={task.duration ?? 1}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setTasks((prev) =>
                              prev.map((t) => (t.id === task.id ? { ...t, duration: val } : t))
                            );
                          }}
                          className="w-12 rounded border border-zinc-200 px-1.5 py-1 text-center text-xs font-semibold text-zinc-700 focus:border-zinc-400 focus:outline-none"
                          aria-label="Durchlaufzeit in Tagen"
                        />
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{task.note ?? <span className="italic text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {!hasLinks ? (
                          <span className="italic text-zinc-300">keine</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {outgoing.map((c) => {
                              const target = tasks.find((t) => t.id === c.to);
                              return (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800"
                                  title={`Ausgehend zu: ${target?.title ?? ""}`}
                                >
                                  → {(target?.title ?? "?").slice(0, 28)}
                                  <button
                                    type="button"
                                    onClick={() => setConnections((prev) => prev.filter((x) => x.id !== c.id))}
                                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-200 text-[9px] text-sky-500 hover:bg-sky-100"
                                    aria-label="Verbindung loeschen"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                            {incoming.map((c) => {
                              const source = tasks.find((t) => t.id === c.from);
                              return (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-600"
                                  title={`Eingehend von: ${source?.title ?? ""}`}
                                >
                                  ← {(source?.title ?? "?").slice(0, 28)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setTasks((prev) => prev.filter((t) => t.id !== task.id));
                            setConnections((prev) => prev.filter((c) => c.from !== task.id && c.to !== task.id));
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 opacity-0 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                          aria-label="Task loeschen"
                          title="Task loeschen"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {detailTaskId !== null && (() => {
        const dt = tasks.find((t) => t.id === detailTaskId);
        if (!dt) return null;
        const closeModal = () => {
          setDetailTaskId(null);
          setDraftTodo("");
          setDraftComment("");
          setDraftCommentImage(null);
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={closeModal}
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">{dt.title}</h2>
                  {dt.note && <p className="mt-0.5 text-xs text-zinc-500">{dt.note}</p>}
                  <p className="mt-1 text-xs font-semibold text-zinc-600">
                    {formatChf((dt.duration ?? 1) * HOURS_PER_DAY * HOURLY_RATE)}
                    <span className="ml-1.5 font-normal text-zinc-400">
                      {(dt.duration ?? 1) * HOURS_PER_DAY} h &middot; {dt.duration ?? 1} d
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-sm text-zinc-500 hover:bg-zinc-100"
                  aria-label="Modal schliessen"
                >
                  &times;
                </button>
              </div>

              {/* Todos */}
              <div className="px-5 py-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Todos / Besorgungen</h3>
                {(dt.todos ?? []).length === 0 && (
                  <p className="mb-3 text-xs italic text-zinc-400">Noch keine Todos.</p>
                )}
                <ul className="mb-3 space-y-1.5">
                  {(dt.todos ?? []).map((todo) => (
                    <li key={todo.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={todo.done}
                        onChange={() =>
                          setTasks((prev) =>
                            prev.map((t) =>
                              t.id === detailTaskId
                                ? { ...t, todos: (t.todos ?? []).map((td) => td.id === todo.id ? { ...td, done: !td.done } : td) }
                                : t
                            )
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-zinc-700"
                      />
                      <span className={`flex-1 text-sm ${todo.done ? "line-through text-zinc-400" : "text-zinc-800"}`}>
                        {todo.text}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setTasks((prev) =>
                            prev.map((t) =>
                              t.id === detailTaskId
                                ? { ...t, todos: (t.todos ?? []).filter((td) => td.id !== todo.id) }
                                : t
                            )
                          )
                        }
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = draftTodo.trim();
                    if (!text) return;
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === detailTaskId
                          ? { ...t, todos: [...(t.todos ?? []), { id: newId(), text, done: false }] }
                          : t
                      )
                    );
                    setDraftTodo("");
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={draftTodo}
                    onChange={(e) => setDraftTodo(e.target.value)}
                    placeholder="Todo hinzufügen…"
                    className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
                  >
                    +
                  </button>
                </form>
              </div>

              {/* Comments */}
              <div className="border-t border-zinc-100 px-5 py-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Kommentare</h3>
                {(dt.comments ?? []).length === 0 && (
                  <p className="mb-3 text-xs italic text-zinc-400">Noch keine Kommentare.</p>
                )}
                <div className="mb-3 space-y-3">
                  {(dt.comments ?? []).map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-zinc-400">
                          {new Date(comment.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setTasks((prev) =>
                              prev.map((t) =>
                                t.id === detailTaskId
                                  ? { ...t, comments: (t.comments ?? []).filter((c) => c.id !== comment.id) }
                                  : t
                              )
                            )
                          }
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500"
                        >
                          &times;
                        </button>
                      </div>
                      {comment.image && (
                        <img
                          src={comment.image}
                          alt="Screenshot"
                          className="mt-2 max-h-64 w-full rounded-lg border border-zinc-100 object-contain"
                        />
                      )}
                      {comment.text && <p className="mt-1.5 whitespace-pre-wrap text-zinc-800">{comment.text}</p>}
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = draftComment.trim();
                    if (!text && !draftCommentImage) return;
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === detailTaskId
                          ? {
                              ...t,
                              comments: [
                                ...(t.comments ?? []),
                                { id: newId(), text, createdAt: new Date().toISOString(), image: draftCommentImage ?? undefined },
                              ],
                            }
                          : t
                      )
                    );
                    setDraftComment("");
                    setDraftCommentImage(null);
                  }}
                  className="space-y-2"
                >
                  {draftCommentImage && (
                    <div className="relative">
                      <img src={draftCommentImage} alt="Vorschau" className="max-h-40 w-full rounded-lg border border-zinc-200 object-contain" />
                      <button
                        type="button"
                        onClick={() => setDraftCommentImage(null)}
                        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800/70 text-xs text-white hover:bg-zinc-900"
                      >
                        &times;
                      </button>
                    </div>
                  )}
                  <textarea
                    value={draftComment}
                    onChange={(e) => setDraftComment(e.target.value)}
                    onPaste={(e) => {
                      for (const item of Array.from(e.clipboardData.items)) {
                        if (item.type.startsWith("image/")) {
                          e.preventDefault();
                          const file = item.getAsFile();
                          if (!file) continue;
                          const reader = new FileReader();
                          reader.onload = () => setDraftCommentImage(reader.result as string);
                          reader.readAsDataURL(file);
                          return;
                        }
                      }
                    }}
                    placeholder="Kommentar schreiben… oder Ctrl+V für Screenshot"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
                  >
                    Senden
                  </button>
                </form>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
