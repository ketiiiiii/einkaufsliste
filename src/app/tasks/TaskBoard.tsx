"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type ColorToken = "amber" | "orange" | "emerald" | "teal" | "sky" | "indigo" | "rose" | "violet";

type Todo = { id: string; text: string; done: boolean };
type Comment = { id: string; text: string; createdAt: string; image?: string };

export type CrossConnection = {
  id: string;
  fromPhaseId: string;
  fromTaskId: string;
  toPhaseId: string;
  toTaskId: string;
};

export type TaskCard = {
  id: string;
  title: string;
  note?: string;
  x: number;
  y: number;
  color: ColorToken;
  duration?: number; // Durchlaufzeit in Tagen, default 1
  todos?: Todo[];
  comments?: Comment[];
  subBoard?: BoardState; // nested sub-board for drill-in
  productName?: string;
  variantLabel?: string;
};

export type TaskConnection = {
  id: string;
  from: string;
  to: string;
};

export type VariantTab = {
  id: string;
  label: string;
  tasks: TaskCard[];
  connections: TaskConnection[];
};

export type BoardState = {
  tasks: TaskCard[];
  connections: TaskConnection[];
  crossConnections?: CrossConnection[];
  planName?: string;
  planVariants?: string[];
  planId?: string;
  variantTabs?: VariantTab[];
  activeVariantId?: string | null;
};

// Keep alias for compatibility
type PersistedBoard = BoardState;

const CARD_WIDTH = 224;
const CARD_HEIGHT = 140;
const CARD_HALF_WIDTH = CARD_WIDTH / 2;
const CARD_HALF_HEIGHT = CARD_HEIGHT / 2;
const CARD_ANCHOR_INSET = 8;
const HOURLY_RATE = 220;
const HOURS_PER_DAY = 8;
const formatChf = (chf: number) => {
  const n = Math.round(chf);
  // manual apostrophe-thousands separator (CH style), no locale API
  const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u2019");
  return "CHF\u00a0" + s;
};
const COLORS: Record<ColorToken, { bg: string; border: string; text: string; label: string }> = {
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900",   label: "Gelb" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-900",  label: "Orange" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", label: "Grün" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-900",    label: "Türkis" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-900",     label: "Blau" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-900",  label: "Indigo" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-900",    label: "Rot" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-900",  label: "Lila" },
};

const paletteOrder: ColorToken[] = ["amber", "orange", "emerald", "teal", "sky", "indigo", "rose", "violet"];

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
  ES: Map<string, number>;
  EF: Map<string, number>;
};

function computeCriticalPath(tasks: TaskCard[], connections: TaskConnection[]): CriticalPathResult {
  const empty: CriticalPathResult = {
    criticalTaskIds: new Set(),
    criticalConnectionIds: new Set(),
    projectDuration: 0,
    hasCycle: false,
    ES: new Map(),
    EF: new Map(),
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

  return { criticalTaskIds, criticalConnectionIds, projectDuration, hasCycle: false, ES, EF };
}

type CrossPickerState = {
  taskId: string;
  direction: "in" | "out";
  selectedPhaseId: string | null;
};

type TaskBoardProps = {
  initialState?: BoardState;
  onStateChange?: (state: BoardState) => void;
  onDrillIn?: (taskId: string, taskTitle: string) => void;
  externalBoard?: BoardState | null;
  onExternalBoardConsumed?: () => void;
  /** "phase" = top-level phase board; "task" = task board inside a phase */
  level?: "phase" | "task";
  /** Full root board — available only at direct phase level for cross-phase picker */
  rootBoard?: BoardState;
  /** Phase task id we're currently viewing */
  currentPhaseId?: string;
  /** All cross-phase dependencies (stored at root board level) */
  crossConnections?: CrossConnection[];
  onCrossConnectionsChange?: (conns: CrossConnection[]) => void;
  /** Navigate to a different phase by id (from cross-connection chip) */
  onNavigateToPhase?: (phaseId: string, phaseTitle: string) => void;
  /** Breadcrumb-Slot — wird direkt über dem Board-Canvas gerendert */
  breadcrumbSlot?: ReactNode;
  /** Variant-Slot — wird unterhalb der Projektkosten gerendert */
  variantSlot?: ReactNode;
};

export function TaskBoard({ initialState, onStateChange, onDrillIn, externalBoard, onExternalBoardConsumed, level = "task", rootBoard, currentPhaseId, crossConnections, onCrossConnectionsChange, onNavigateToPhase, breadcrumbSlot, variantSlot }: TaskBoardProps = {}) {
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
  // track whether the last pointer interaction was a drag — prevents click-to-drill on drag
  const wasMovedRef = useRef(false);

  const [tasks, setTasks] = useState<TaskCard[]>(initialState?.tasks ?? []);
  const [connections, setConnections] = useState<TaskConnection[]>(initialState?.connections ?? []);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftColor, setDraftColor] = useState<ColorToken>(paletteOrder[0]);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "table" | "gantt">("board");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [draftTodo, setDraftTodo] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [draftCommentImage, setDraftCommentImage] = useState<string | null>(null);
  const [crossPicker, setCrossPicker] = useState<CrossPickerState | null>(null);

  // Load external board (from wizard)
  useEffect(() => {
    if (!externalBoard) return;
    startTransition(() => {
      setTasks(externalBoard.tasks as TaskCard[]);
      setConnections(externalBoard.connections);
      setLinkSource(null);
    });
    onExternalBoardConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalBoard]);

  // Notify parent of state changes so they can persist to DB
  // Skip on first mount — initialState already came from rootBoard, no need to echo it back
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    onStateChange?.({ tasks, connections });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, connections]);

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
        wasMovedRef.current = drag.moved;
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
    // ignore if the interaction was actually a drag
    if (wasMovedRef.current) {
      wasMovedRef.current = false;
      return;
    }
    // link mode: connect two cards
    if (linkSource && linkSource !== taskId) {
      const sourceId = linkSource;
      setConnections((prev) => {
        const exists = prev.some(
          (connection) =>
            (connection.from === sourceId && connection.to === taskId) ||
            (connection.from === taskId && connection.to === sourceId)
        );
        if (exists) return prev;
        return [...prev, { id: newId(), from: sourceId, to: taskId }];
      });
      setLinkSource(null);
      return;
    }
    // at phase level (and not in link mode): click drills into the phase
    if (!linkSource && level === "phase") {
      onDrillIn?.(taskId, tasks.find((t) => t.id === taskId)?.title ?? "");
    }
  };

  const handleLinkButtonClick = (taskId: string) => {
    setLinkSource((prev) => (prev === taskId ? null : taskId));
  };

  const handleReset = () => {
    setTasks([]);
    setConnections([]);
    setLinkSource(null);
    setDraftTitle("");
    setDraftNote("");
    setDraftColor(paletteOrder[0]);
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
    <div className="space-y-4">
      <form
        onSubmit={handleAddTask}
        className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
      >
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder={level === "phase" ? "Phase Titel…" : "Task Titel…"}
          required
          className="min-w-0 flex-1 rounded-xl border border-transparent px-2.5 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-300 focus:bg-zinc-50"
        />
        <div className="h-5 w-px shrink-0 bg-zinc-100" />
        <input
          type="text"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder={level === "phase" ? "Beschreibung…" : "Notiz…"}
          className="hidden min-w-0 w-44 rounded-xl border border-transparent px-2.5 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-300 focus:bg-zinc-50 sm:block"
        />
        <div className="h-5 w-px shrink-0 bg-zinc-100" />
        {/* Compact color dots */}
        <div className="flex shrink-0 items-center gap-1.5" title="Farbe wählen">
          {paletteOrder.map((color) => {
            const DOT_COLORS: Record<string, string> = {
              amber: "#f59e0b", orange: "#f97316", emerald: "#10b981", teal: "#14b8a6",
              sky: "#0ea5e9", indigo: "#6366f1", rose: "#f43f5e", violet: "#8b5cf6",
            };
            const isActive = draftColor === color;
            return (
              <button
                key={color}
                type="button"
                title={COLORS[color].label}
                onClick={() => setDraftColor(color)}
                className={`rounded-full transition ${isActive ? "ring-2 ring-offset-1 ring-zinc-700 scale-125" : "opacity-60 hover:opacity-100 hover:scale-110"}`}
                style={{ width: 14, height: 14, background: DOT_COLORS[color] }}
              />
            );
          })}
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
        >
          {level === "phase" ? "Phase anlegen" : "Task anlegen"}
        </button>
      </form>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              view === "board" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              view === "table" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Tabelle
          </button>
          <button
            type="button"
            onClick={() => setView("gantt")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              view === "gantt" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Gantt
          </button>
        </div>
        {view === "board" && (
          <>
            <button
              type="button"
              onClick={handleAutoLayout}
              disabled={connections.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Tasks automatisch nach Prozessfluss anordnen"
            >
              ⬡ Auto-Layout
            </button>
            <span className="hidden text-xs text-zinc-400 sm:inline">
              {linkSource ? "Klick auf Zielkarte verbindet" : "Drag = verschieben · ⌃ = verlinken"}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="ml-auto rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50 transition"
        >
          Reset Board
        </button>
      </div>

      {/* Info row: critical path + costs — compact single line */}
      {view === "board" && (criticalPath.projectDuration > 0 || tasks.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-zinc-500">
          {!criticalPath.hasCycle && criticalPath.projectDuration > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              <span className="font-semibold text-orange-700">Kritischer Weg</span>
              <span>Projektdauer: <strong className="text-zinc-700">{criticalPath.projectDuration} Tage</strong></span>
              <span className="hidden text-zinc-300 sm:inline">·</span>
              <span className="hidden text-zinc-400 sm:inline">Orangene Knoten &amp; Kanten = kein Zeitpuffer</span>
            </span>
          )}
          {tasks.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-zinc-600">Projektkosten</span>
              <span className="tabular-nums">
                {tasks.reduce((s, t) => s + (t.duration ?? 1), 0)} Tage × {HOURS_PER_DAY}h × CHF {HOURLY_RATE} ={" "}
                <strong className="text-zinc-800">{formatChf(totalPrice)}</strong>
              </span>
            </span>
          )}
        </div>
      )}

      {/* Variant-Slot — unterhalb der Projektkosten */}
      {variantSlot}

      {/* Board view */}
      {view === "board" && (
        <>
          {linkSource ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white/70 px-3 py-1.5 text-xs text-zinc-600">
              Verbinde ab{" "}
              <span className="font-semibold">{tasks.find((t) => t.id === linkSource)?.title ?? ""}</span> — Klick auf Zielkarte oder Reset zum Abbrechen.
            </div>
          ) : null}

          {breadcrumbSlot}

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
                  className={`absolute w-[240px] rounded-2xl border p-3 text-sm shadow-md transition-shadow ${color.bg} ${color.border} ${color.text} ${
                    level === "phase" ? "cursor-pointer" : "cursor-grab"
                  } ${
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
                    <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">{task.title}</h3>
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
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDrillIn?.(task.id, task.title); }}
                        className={`inline-flex h-7 items-center justify-center rounded-full border text-xs transition ${
                          level === "phase"
                            ? "gap-1 border-zinc-300 bg-white/80 px-2 font-semibold text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                            : task.subBoard?.tasks?.length
                            ? "w-7 border-zinc-400 bg-zinc-50 text-zinc-700 font-semibold"
                            : "w-7 border-transparent text-zinc-400 hover:border-zinc-300 hover:text-zinc-700"
                        }`}
                        aria-label={level === "phase" ? "Tasks dieser Phase öffnen" : "Sub-Board öffnen"}
                        title={level === "phase" ? "Tasks öffnen" : task.subBoard?.tasks?.length ? `Sub-Board (${task.subBoard.tasks.length} Tasks)` : "Reinzoomen / Sub-Board anlegen"}
                      >
                        {level === "phase" ? (
                          <>Tasks <span className="opacity-70">→</span></>
                        ) : (
                          "⬎"
                        )}
                      </button>
                    </div>
                  </div>
                  {task.note ? <p className="mt-1 text-xs text-zinc-600">{task.note}</p> : null}
                  {level === "phase" && (task.productName || task.variantLabel) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {task.productName && (
                        <span className="inline-block rounded-full bg-black/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                          {task.productName}
                        </span>
                      )}
                      {task.variantLabel && (
                        <span className="inline-block rounded-full bg-black/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                          ⬡ {task.variantLabel}
                        </span>
                      )}
                    </div>
                  )}
                  {level === "task" && (() => {
                    const phaseCard = rootBoard?.tasks.find((t) => t.id === currentPhaseId);
                    if (!phaseCard) return null;
                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="inline-block rounded-full bg-black/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                          📍 {phaseCard.title}
                        </span>
                        {phaseCard.productName && (
                          <span className="inline-block rounded-full bg-black/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                            {phaseCard.productName}
                          </span>
                        )}
                        {phaseCard.variantLabel && (
                          <span className="inline-block rounded-full bg-black/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                            ⬡ {phaseCard.variantLabel}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {level === "task" && rootBoard !== undefined && (() => {
                    const incomingCross = (crossConnections ?? []).filter(
                      (c) => c.toPhaseId === currentPhaseId && c.toTaskId === task.id
                    );
                    const outgoingCross = (crossConnections ?? []).filter(
                      (c) => c.fromPhaseId === currentPhaseId && c.fromTaskId === task.id
                    );
                    const getPhaseTitle = (phaseId: string) =>
                      rootBoard.tasks.find((t) => t.id === phaseId)?.title ?? "?";
                    const getTaskTitle = (phaseId: string, taskId: string) =>
                      rootBoard.tasks.find((t) => t.id === phaseId)?.subBoard?.tasks.find((t) => t.id === taskId)?.title ?? "?";
                    const otherPhases = rootBoard.tasks.filter((t) => t.id !== currentPhaseId);
                    return (
                      <>
                        {(incomingCross.length > 0 || outgoingCross.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                            {incomingCross.map((c) => (
                              <span key={c.id} className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); onNavigateToPhase?.(c.fromPhaseId, getPhaseTitle(c.fromPhaseId)); }}
                                  className="hover:underline"
                                  title={`Phase öffnen: ${getPhaseTitle(c.fromPhaseId)}`}
                                >
                                  ↙ {getPhaseTitle(c.fromPhaseId)}: {getTaskTitle(c.fromPhaseId, c.fromTaskId)}
                                </button>
                                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCrossConnectionsChange?.((crossConnections ?? []).filter((x) => x.id !== c.id)); }} className="ml-0.5 text-[10px] opacity-60 hover:opacity-100">×</button>
                              </span>
                            ))}
                            {outgoingCross.map((c) => (
                              <span key={c.id} className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); onNavigateToPhase?.(c.toPhaseId, getPhaseTitle(c.toPhaseId)); }}
                                  className="hover:underline"
                                  title={`Phase öffnen: ${getPhaseTitle(c.toPhaseId)}`}
                                >
                                  ↗ {getPhaseTitle(c.toPhaseId)}: {getTaskTitle(c.toPhaseId, c.toTaskId)}
                                </button>
                                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCrossConnectionsChange?.((crossConnections ?? []).filter((x) => x.id !== c.id)); }} className="ml-0.5 text-[10px] opacity-60 hover:opacity-100">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                        {otherPhases.length > 0 && (
                          <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setCrossPicker({ taskId: task.id, direction: "in", selectedPhaseId: null }); }}
                              className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 transition hover:bg-sky-100"
                              title="Eingang: dieser Task hängt ab von einem Task in einer anderen Phase"
                            >
                              ↙ Eingang
                            </button>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setCrossPicker({ taskId: task.id, direction: "out", selectedPhaseId: null }); }}
                              className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 transition hover:bg-violet-100"
                              title="Ausgang: dieser Task greift in einen Task einer anderen Phase"
                            >
                              ↗ Ausgang
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
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

            {/* Ghost cards for cross-phase connections */}
            {level === "task" && rootBoard !== undefined && (() => {
              const ghostMap = new Map<string, {
                x: number; y: number;
                phaseId: string; phaseTitle: string; taskTitle: string;
                direction: "in" | "out";
              }>();
              (crossConnections ?? []).forEach((c) => {
                if (c.fromPhaseId === currentPhaseId) {
                  const localTask = tasks.find((t) => t.id === c.fromTaskId);
                  if (!localTask) return;
                  const k = `${c.toPhaseId}:${c.toTaskId}`;
                  if (ghostMap.has(k)) return;
                  const phaseTitle = rootBoard.tasks.find((t) => t.id === c.toPhaseId)?.title ?? "?";
                  const taskTitle = rootBoard.tasks.find((t) => t.id === c.toPhaseId)?.subBoard?.tasks.find((t) => t.id === c.toTaskId)?.title ?? "?";
                  ghostMap.set(k, { x: localTask.x + 250, y: localTask.y, phaseId: c.toPhaseId, phaseTitle, taskTitle, direction: "out" });
                } else if (c.toPhaseId === currentPhaseId) {
                  const localTask = tasks.find((t) => t.id === c.toTaskId);
                  if (!localTask) return;
                  const k = `${c.fromPhaseId}:${c.fromTaskId}`;
                  if (ghostMap.has(k)) return;
                  const phaseTitle = rootBoard.tasks.find((t) => t.id === c.fromPhaseId)?.title ?? "?";
                  const taskTitle = rootBoard.tasks.find((t) => t.id === c.fromPhaseId)?.subBoard?.tasks.find((t) => t.id === c.fromTaskId)?.title ?? "?";
                  ghostMap.set(k, { x: localTask.x - 240, y: localTask.y, phaseId: c.fromPhaseId, phaseTitle, taskTitle, direction: "in" });
                }
              });
              return Array.from(ghostMap.entries()).map(([key, g]) => (
                <button
                  key={key}
                  type="button"
                  className="absolute w-[200px] rounded-2xl border-2 border-dashed border-zinc-300 bg-white/70 px-3 py-2.5 text-left shadow-sm backdrop-blur-sm transition hover:border-zinc-500 hover:bg-white hover:shadow-md"
                  style={{ transform: `translate(${g.x}px, ${g.y}px)` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavigateToPhase?.(g.phaseId, g.phaseTitle); }}
                  title={`Phase "${g.phaseTitle}" öffnen`}
                >
                  <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                    {g.direction === "in" ? "↙ Eingang aus" : "↗ Ausgang in"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{g.phaseTitle}</p>
                  <p className="text-sm font-semibold text-zinc-800">{g.taskTitle}</p>
                  <p className="mt-1.5 text-[10px] font-medium text-zinc-400 group-hover:text-zinc-600">Phase öffnen →</p>
                </button>
              ));
            })()}
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
        <div className="overflow-x-auto rounded-lg border border-zinc-100">
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

      {/* Gantt view */}
      {view === "gantt" && (() => {
        if (tasks.length === 0) {
          return (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
              Noch keine Tasks angelegt.
            </div>
          );
        }
        const ROW_H = 36;
        const LABEL_W = 180;
        const DAY_W = 36;
        const HEADER_H = 32;
        const PAD = 12;

        // Determine ES/EF for each task — fall back to sequential if no connections
        const efMap = new Map<string, number>();
        const esMap = new Map<string, number>();
        if (connections.length > 0 && !criticalPath.hasCycle && criticalPath.ES.size > 0) {
          for (const t of tasks) {
            esMap.set(t.id, criticalPath.ES.get(t.id) ?? 0);
            efMap.set(t.id, criticalPath.EF.get(t.id) ?? (criticalPath.ES.get(t.id) ?? 0) + (t.duration ?? 1));
          }
        } else {
          // No connections: show tasks in order, stacked sequentially
          let cursor = 0;
          for (const t of tasks) {
            esMap.set(t.id, cursor);
            efMap.set(t.id, cursor + (t.duration ?? 1));
            cursor += (t.duration ?? 1);
          }
        }

        const maxDay = Math.max(...tasks.map((t) => efMap.get(t.id) ?? 1), 1);
        const svgW = LABEL_W + maxDay * DAY_W + PAD * 2;
        const svgH = HEADER_H + tasks.length * ROW_H + PAD;

        // Bar color map
        const GANTT_COLORS: Record<string, string> = {
          amber: "#fbbf24", sky: "#38bdf8", rose: "#fb7185",
          emerald: "#34d399", violet: "#a78bfa", zinc: "#a1a1aa",
          orange: "#fb923c", teal: "#2dd4bf",
        };

        const taskIndex = new Map(tasks.map((t, i) => [t.id, i]));

        return (
          <div className="overflow-x-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
            <svg
              width={svgW}
              height={svgH}
              className="block font-sans text-xs"
              style={{ minWidth: svgW }}
            >
              {/* Row backgrounds */}
              {tasks.map((t, i) => (
                <rect
                  key={t.id + "-bg"}
                  x={0}
                  y={HEADER_H + i * ROW_H}
                  width={svgW}
                  height={ROW_H}
                  fill={i % 2 === 0 ? "#f9f9fb" : "#ffffff"}
                />
              ))}

              {/* Day grid lines + headers */}
              {Array.from({ length: maxDay + 1 }, (_, d) => (
                <g key={"day-" + d}>
                  <line
                    x1={LABEL_W + d * DAY_W}
                    y1={HEADER_H}
                    x2={LABEL_W + d * DAY_W}
                    y2={svgH - PAD}
                    stroke="#e4e4e7"
                    strokeWidth={1}
                  />
                  {d < maxDay && (
                    <text
                      x={LABEL_W + d * DAY_W + DAY_W / 2}
                      y={HEADER_H - 8}
                      textAnchor="middle"
                      fill="#a1a1aa"
                      fontSize={10}
                    >
                      {d + 1}
                    </text>
                  )}
                </g>
              ))}

              {/* Dependency arrows */}
              {connections.map((c) => {
                const fi = taskIndex.get(c.from);
                const ti = taskIndex.get(c.to);
                if (fi === undefined || ti === undefined) return null;
                const isCritical =
                  criticalPath.criticalConnectionIds.has(c.id);
                const x1 = LABEL_W + (efMap.get(c.from) ?? 0) * DAY_W;
                const y1 = HEADER_H + fi * ROW_H + ROW_H / 2;
                const x2 = LABEL_W + (esMap.get(c.to) ?? 0) * DAY_W;
                const y2 = HEADER_H + ti * ROW_H + ROW_H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={c.id}
                    d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke={isCritical ? "#f97316" : "#cbd5e1"}
                    strokeWidth={isCritical ? 2 : 1.5}
                    strokeDasharray={isCritical ? undefined : "4 3"}
                    markerEnd={`url(#gantt-arrow-${isCritical ? "crit" : "norm"})`}
                  />
                );
              })}

              {/* Arrow markers */}
              <defs>
                <marker id="gantt-arrow-norm" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#cbd5e1" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#f97316" />
                </marker>
              </defs>

              {/* Bars + labels */}
              {tasks.map((t, i) => {
                const es = esMap.get(t.id) ?? 0;
                const ef = efMap.get(t.id) ?? es + 1;
                const barX = LABEL_W + es * DAY_W + 2;
                const barW = Math.max((ef - es) * DAY_W - 4, 4);
                const barY = HEADER_H + i * ROW_H + 6;
                const barH = ROW_H - 12;
                const isCrit = criticalPath.criticalTaskIds.has(t.id);
                const col = GANTT_COLORS[t.color] ?? "#a1a1aa";

                return (
                  <g key={t.id}>
                    {/* Row label */}
                    <text
                      x={8}
                      y={HEADER_H + i * ROW_H + ROW_H / 2 + 4}
                      fill={isCrit ? "#c2410c" : "#3f3f46"}
                      fontSize={11}
                      fontWeight={isCrit ? "700" : "500"}
                      className="select-none"
                    >
                      {isCrit && "● "}
                      {t.title.length > 18 ? t.title.slice(0, 17) + "…" : t.title}
                    </text>

                    {/* Bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barH}
                      rx={4}
                      fill={col}
                      opacity={isCrit ? 0.9 : 0.55}
                    />

                    {/* Duration label on bar */}
                    {barW > 28 && (
                      <text
                        x={barX + barW / 2}
                        y={barY + barH / 2 + 4}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={10}
                        fontWeight="600"
                        className="select-none"
                      >
                        {t.duration ?? 1}d
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Header separator */}
              <line x1={0} y1={HEADER_H} x2={svgW} y2={HEADER_H} stroke="#e4e4e7" strokeWidth={1} />
              <text x={8} y={HEADER_H - 8} fill="#a1a1aa" fontSize={10} fontWeight="600">TASK</text>
              <text x={LABEL_W + 4} y={HEADER_H - 8} fill="#a1a1aa" fontSize={10} fontWeight="600">TAG</text>
            </svg>
          </div>
        );
      })()}

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

      {/* Cross-connection picker */}
      {crossPicker !== null && rootBoard !== undefined && (() => {
        const otherPhases = rootBoard.tasks.filter((t) => t.id !== currentPhaseId);
        const selectedPhase = crossPicker.selectedPhaseId
          ? rootBoard.tasks.find((t) => t.id === crossPicker.selectedPhaseId)
          : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setCrossPicker(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">
                  {crossPicker.direction === "in" ? "↙ Eingang: hängt ab von..." : "↗ Ausgang: greift in..."}
                </h3>
                <button type="button" onClick={() => setCrossPicker(null)} className="text-zinc-400 hover:text-zinc-700">×</button>
              </div>
              {!crossPicker.selectedPhaseId ? (
                <>
                  <p className="mb-2 text-xs text-zinc-400">Phase wählen:</p>
                  <ul className="space-y-1">
                    {otherPhases.map((phase) => (
                      <li key={phase.id}>
                        <button
                          type="button"
                          onClick={() => setCrossPicker((prev) => prev ? { ...prev, selectedPhaseId: phase.id } : null)}
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                        >
                          {phase.title}
                          <span className="ml-auto text-zinc-300">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCrossPicker((prev) => prev ? { ...prev, selectedPhaseId: null } : null)}
                    className="mb-3 text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    ← zurück
                  </button>
                  <p className="mb-1 text-xs font-semibold text-zinc-700">{selectedPhase?.title}</p>
                  <p className="mb-2 text-xs text-zinc-400">Task wählen:</p>
                  {(selectedPhase?.subBoard?.tasks ?? []).length === 0 ? (
                    <p className="text-sm italic text-zinc-400">Keine Tasks in dieser Phase.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(selectedPhase?.subBoard?.tasks ?? []).map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const newConn: CrossConnection = {
                                id: newId(),
                                fromPhaseId: crossPicker.direction === "in" ? crossPicker.selectedPhaseId! : currentPhaseId!,
                                fromTaskId: crossPicker.direction === "in" ? t.id : crossPicker.taskId,
                                toPhaseId: crossPicker.direction === "in" ? currentPhaseId! : crossPicker.selectedPhaseId!,
                                toTaskId: crossPicker.direction === "in" ? crossPicker.taskId : t.id,
                              };
                              onCrossConnectionsChange?.([...(crossConnections ?? []), newConn]);
                              setCrossPicker(null);
                            }}
                            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-800 transition hover:bg-zinc-50"
                          >
                            {t.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
