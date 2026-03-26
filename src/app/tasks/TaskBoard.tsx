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
  duration?: number; // Durchlaufzeit, Einheit via unit
  unit?: "h" | "d"; // "d"=Tage (default), "h"=Stunden
  iterations?: number; // Anzahl Wiederholungen (iteratives Vorgehen), default 1
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
  lag?: number;        // Wartezeit nach dem Vorgänger (Einheit: lagUnit)
  lagUnit?: "h" | "d"; // default "h"
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

// --- Duration helpers ---
const toHours = (duration: number, unit?: "h" | "d") =>
  unit === "h" ? duration : duration * HOURS_PER_DAY;
/** Effective hours including iterations (for CPM, Gantt, cost) */
const effectiveHours = (t: { duration?: number; unit?: "h" | "d"; iterations?: number }) =>
  toHours(t.duration ?? 1, t.unit) * Math.max(1, t.iterations ?? 1);
const lagToHours = (lag: number | undefined, lagUnit?: "h" | "d") =>
  lag ? (lagUnit === "d" ? lag * HOURS_PER_DAY : lag) : 0;
const fmtDuration = (hours: number) => {
  if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) return `${hours / HOURS_PER_DAY}d`;
  if (hours >= HOURS_PER_DAY) return `${(hours / HOURS_PER_DAY).toFixed(1)}d`;
  return `${hours}h`;
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

  // Connection lookup for lag access
  const connLookup = new Map<string, TaskConnection>();
  for (const c of connections) connLookup.set(`${c.from}:${c.to}`, c);

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

  // Forward pass: ES / EF (in hours)
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  for (const id of topoOrder) {
    const task = tasks.find((t) => t.id === id)!;
    const dur = effectiveHours(task);
    const preds = predecessors.get(id) ?? [];
    const es = preds.length === 0 ? 0 : Math.max(...preds.map((p) => {
      const conn = connLookup.get(`${p}:${id}`);
      return (EF.get(p) ?? 0) + lagToHours(conn?.lag, conn?.lagUnit);
    }));
    ES.set(id, es);
    EF.set(id, es + dur);
  }

  const projectDuration = EF.size === 0 ? 0 : Math.max(...EF.values());

  // Backward pass: LF / LS (in hours)
  const LF = new Map<string, number>();
  const LS = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const task = tasks.find((t) => t.id === id)!;
    const dur = effectiveHours(task);
    const succs = successors.get(id) ?? [];
    const lf = succs.length === 0 ? projectDuration : Math.min(...succs.map((s) => {
      const conn = connLookup.get(`${id}:${s}`);
      return (LS.get(s) ?? projectDuration) - lagToHours(conn?.lag, conn?.lagUnit);
    }));
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

  // Critical connections: both endpoints critical AND EF[from] + lag == ES[to]
  const criticalConnectionIds = new Set<string>();
  for (const c of connections) {
    const conn = connLookup.get(`${c.from}:${c.to}`) ?? c;
    if (
      criticalTaskIds.has(c.from) &&
      criticalTaskIds.has(c.to) &&
      Math.abs((EF.get(c.from) ?? 0) + lagToHours(conn.lag, conn.lagUnit) - (ES.get(c.to) ?? 0)) < 0.001
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
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editColor, setEditColor] = useState<ColorToken>(paletteOrder[0]);
  const [ganttAllLevels, setGanttAllLevels] = useState(false);
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Set<string>>(new Set());

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

  // Sync edit state when detail modal opens (only when detailTaskId changes)
  useEffect(() => {
    if (detailTaskId === null) return;
    const task = tasks.find((t) => t.id === detailTaskId);
    if (!task) return;
    setEditTitle(task.title);
    setEditNote(task.note ?? "");
    setEditColor(task.color);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTaskId]);

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
    () => tasks.reduce((sum, t) => sum + effectiveHours(t), 0) * HOURLY_RATE,
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
        {view === "gantt" && level === "phase" && (
          <button
            type="button"
            onClick={() => setGanttAllLevels((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
              ganttAllLevels
                ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {ganttAllLevels ? "⊟ Nur Phasen" : "⊞ Alle Ebenen"}
          </button>
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
              <span>Projektdauer: <strong className="text-zinc-700">{fmtDuration(criticalPath.projectDuration)}</strong></span>
              <span className="hidden text-zinc-300 sm:inline">·</span>
              <span className="hidden text-zinc-400 sm:inline">Orangene Knoten &amp; Kanten = kein Zeitpuffer</span>
            </span>
          )}
          {tasks.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-zinc-600">Projektkosten</span>
              <span className="tabular-nums">
                {fmtDuration(tasks.reduce((s, t) => s + effectiveHours(t), 0))} × CHF {HOURLY_RATE} ={" "}
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
              const iters = Math.max(1, task.iterations ?? 1);
              const isIterative = iters > 1;
              return (
                <div
                  key={task.id}
                  className="absolute"
                  style={{ transform: `translate(${task.x}px, ${task.y}px)` }}
                >
                  {/* Stapel-Effekt: Schattenebenen für iterative Kacheln */}
                  {isIterative && (
                    <>
                      <div className={`absolute w-[240px] rounded-2xl border ${color.border} ${color.bg} opacity-40`} style={{ top: 8, left: 8, height: CARD_HEIGHT }} aria-hidden />
                      {iters >= 3 && <div className={`absolute w-[240px] rounded-2xl border ${color.border} ${color.bg} opacity-25`} style={{ top: 16, left: 16, height: CARD_HEIGHT }} aria-hidden />}
                    </>
                  )}
                <article
                  className={`relative w-[240px] rounded-2xl border p-3 text-sm shadow-md transition-shadow ${color.bg} ${color.border} ${color.text} ${
                    level === "phase" ? "cursor-pointer" : "cursor-grab"
                  } ${
                    linkSource === task.id
                      ? "ring-2 ring-zinc-900"
                      : criticalPath.criticalTaskIds.has(task.id)
                      ? "ring-2 ring-orange-400 shadow-orange-100"
                      : ""
                  }`}
                  onPointerDown={(event) => handlePointerDown(task.id, event)}
                  onClick={() => handleCardClick(task.id)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold leading-snug line-clamp-2">{task.title}</h3>
                      {isIterative && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-black/[0.09] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
                          ↺ {iters}× iterativ
                        </span>
                      )}
                    </div>
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
                  {/* Inline task list (phase level only) */}
                  {level === "phase" && (task.subBoard?.tasks?.length ?? 0) > 0 && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPhaseIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          });
                        }}
                        className="text-[10px] font-semibold opacity-60 hover:opacity-100 transition"
                      >
                        {expandedPhaseIds.has(task.id) ? "▲ einklappen" : `▼ ${task.subBoard!.tasks.length} Tasks`}
                      </button>
                      {expandedPhaseIds.has(task.id) && (
                        <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
                          {task.subBoard!.tasks.map((st) => (
                            <li key={st.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-black/[0.07]">
                              <span className="flex-1 truncate">{st.title}</span>
                              {st.duration !== undefined && (
                                <span className="shrink-0 opacity-50">{fmtDuration(toHours(st.duration, st.unit))}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                    <div className="flex cursor-default items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0.01}
                        step={0.1}
                        max={9999}
                        value={task.duration ?? 1}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                          setTasks((prev) =>
                            prev.map((t) => (t.id === task.id ? { ...t, duration: val } : t))
                          );
                        }}
                        className="w-10 rounded border border-zinc-300 bg-white/80 px-1 py-0.5 text-center text-[11px] font-semibold text-zinc-700 focus:border-zinc-400 focus:outline-none"
                        aria-label="Durchlaufzeit"
                      />
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, unit: t.unit === "h" ? "d" : "h" } : t)); }}
                        className="rounded border border-zinc-300 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                        title="Einheit wechseln (Stunden / Tage)"
                      >
                        {task.unit === "h" ? "h" : "d"}
                      </button>
                    </div>
                    <span className="font-semibold tabular-nums text-zinc-600">
                      {formatChf(effectiveHours(task) * HOURLY_RATE)}
                    </span>
                  </div>
                </article>
                </div>
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
              <ul className="mt-3 flex flex-col gap-2">
                {connections.map((connection) => {
                  const fromTask = tasks.find((task) => task.id === connection.from);
                  const toTask = tasks.find((task) => task.id === connection.to);
                  return (
                    <li
                      key={connection.id}
                      className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-700">
                        {(fromTask?.title ?? "Task").slice(0, 28)} → {(toTask?.title ?? "Task").slice(0, 28)}
                      </span>
                      {/* Lag input */}
                      <span className="flex shrink-0 items-center gap-1 text-zinc-500">
                        <span className="text-[10px] uppercase tracking-wide">+Lag</span>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={connection.lag ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setConnections((prev) =>
                              prev.map((c) => c.id === connection.id ? { ...c, lag: val } : c)
                            );
                          }}
                          className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-center text-xs font-semibold text-zinc-700 focus:border-zinc-400 focus:outline-none"
                          aria-label="Lag / Wartezeit"
                        />
                        <button
                          type="button"
                          onClick={() => setConnections((prev) => prev.map((c) => c.id === connection.id ? { ...c, lagUnit: c.lagUnit === "d" ? "h" : "d" } : c))}
                          className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 hover:border-zinc-400 hover:text-zinc-800"
                          title="Lag-Einheit wechseln"
                        >
                          {connection.lagUnit === "d" ? "d" : "h"}
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConnections((prev) => prev.filter((c) => c.id !== connection.id))
                        }
                        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] text-zinc-500 hover:bg-zinc-200"
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
                <th className="px-4 py-3 text-left font-semibold">Dauer</th>
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
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0.01}
                            step={0.1}
                            max={9999}
                            value={task.duration ?? 1}
                            onChange={(e) => {
                              const val = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                              setTasks((prev) =>
                                prev.map((t) => (t.id === task.id ? { ...t, duration: val } : t))
                              );
                            }}
                            className="w-12 rounded border border-zinc-200 px-1.5 py-1 text-center text-xs font-semibold text-zinc-700 focus:border-zinc-400 focus:outline-none"
                            aria-label="Durchlaufzeit"
                          />
                          <button
                            type="button"
                            onClick={() => setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, unit: t.unit === "h" ? "d" : "h" } : t))}
                            className="rounded border border-zinc-200 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 hover:border-zinc-400 hover:text-zinc-800"
                            title="Einheit wechseln"
                          >
                            {task.unit === "h" ? "h" : "d"}
                          </button>
                        </div>
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
        const HR_W = 18; // pixels per hour
        const HEADER_H = 40;
        const PAD = 12;

        // Normalize all durations to hours; ES/EF are already in hours after CPM update
        const efMap = new Map<string, number>();
        const esMap = new Map<string, number>();
        if (connections.length > 0 && !criticalPath.hasCycle && criticalPath.ES.size > 0) {
          for (const t of tasks) {
            esMap.set(t.id, criticalPath.ES.get(t.id) ?? 0);
            efMap.set(t.id, criticalPath.EF.get(t.id) ?? (criticalPath.ES.get(t.id) ?? 0) + effectiveHours(t));
          }
        } else {
          let cursor = 0;
          for (const t of tasks) {
            const dur = effectiveHours(t);
            esMap.set(t.id, cursor);
            efMap.set(t.id, cursor + dur);
            cursor += dur;
          }
        }

        // Sort tasks by earliest start
        const sortedGanttTasks = [...tasks].sort((a, b) => (esMap.get(a.id) ?? 0) - (esMap.get(b.id) ?? 0));

        // Build flat gantt rows (optionally including sub-tasks of phases)
        type GanttRow = { id: string; title: string; color: ColorToken; duration: number; unit?: "h" | "d"; iterations?: number; indent: number; absoluteES: number; absoluteEF: number; isCritical: boolean; };
        let ganttRows: GanttRow[];
        if (ganttAllLevels && level === "phase") {
          ganttRows = [];
          for (const phase of sortedGanttTasks) {
            const phaseES = esMap.get(phase.id) ?? 0;
            const phaseEF = efMap.get(phase.id) ?? phaseES + effectiveHours(phase);
            ganttRows.push({ id: phase.id, title: phase.title, color: phase.color, duration: phase.duration ?? 1, unit: phase.unit, iterations: phase.iterations, indent: 0, absoluteES: phaseES, absoluteEF: phaseEF, isCritical: criticalPath.criticalTaskIds.has(phase.id) });
            if (phase.subBoard?.tasks?.length) {
              const subCPM = computeCriticalPath(phase.subBoard.tasks, phase.subBoard.connections ?? []);
              const subES = new Map<string, number>();
              const subEF = new Map<string, number>();
              if (!subCPM.hasCycle && subCPM.ES.size > 0) {
                for (const st of phase.subBoard.tasks) { subES.set(st.id, subCPM.ES.get(st.id) ?? 0); subEF.set(st.id, subCPM.EF.get(st.id) ?? 0); }
              } else {
                let cur = 0;
                for (const st of phase.subBoard.tasks) { const d = effectiveHours(st); subES.set(st.id, cur); subEF.set(st.id, cur + d); cur += d; }
              }
              const sortedSubs = [...phase.subBoard.tasks].sort((a, b) => (subES.get(a.id) ?? 0) - (subES.get(b.id) ?? 0));
              for (const st of sortedSubs) {
                ganttRows.push({ id: `${phase.id}:${st.id}`, title: st.title, color: st.color, duration: st.duration ?? 1, unit: st.unit, iterations: st.iterations, indent: 1, absoluteES: phaseES + (subES.get(st.id) ?? 0), absoluteEF: phaseES + (subEF.get(st.id) ?? effectiveHours(st)), isCritical: subCPM.criticalTaskIds.has(st.id) });
              }
            }
          }
        } else {
          ganttRows = sortedGanttTasks.map((t) => ({ id: t.id, title: t.title, color: t.color, duration: t.duration ?? 1, unit: t.unit, iterations: t.iterations, indent: 0, absoluteES: esMap.get(t.id) ?? 0, absoluteEF: efMap.get(t.id) ?? (esMap.get(t.id) ?? 0) + effectiveHours(t), isCritical: criticalPath.criticalTaskIds.has(t.id) }));
        }

        const maxHours = Math.max(...ganttRows.map((r) => r.absoluteEF), 1);
        const svgW = LABEL_W + maxHours * HR_W + PAD * 2;
        const svgH = HEADER_H + ganttRows.length * ROW_H + PAD;

        const GANTT_COLORS: Record<string, string> = {
          amber: "#fbbf24", sky: "#38bdf8", rose: "#fb7185",
          emerald: "#34d399", violet: "#a78bfa", zinc: "#a1a1aa",
          orange: "#fb923c", teal: "#2dd4bf", indigo: "#818cf8",
        };

        // Row index by id (for dependency arrows)
        const rowIndex = new Map(ganttRows.map((r, i) => [r.id, i]));

        // Build tick marks: every 8h = 1 day; also every 1h if total ≤ 24h
        const dayTicks: number[] = [];
        for (let h = 0; h <= maxHours; h += HOURS_PER_DAY) dayTicks.push(h);
        const showHourTicks = maxHours <= 48;

        return (
          <div className="overflow-x-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
            <svg
              width={svgW}
              height={svgH}
              className="block font-sans text-xs"
              style={{ minWidth: svgW }}
            >
              {/* Row backgrounds */}
              {ganttRows.map((r, i) => (
                <rect
                  key={r.id + "-bg"}
                  x={0}
                  y={HEADER_H + i * ROW_H}
                  width={svgW}
                  height={ROW_H}
                  fill={r.indent > 0 ? "#fafafa" : i % 2 === 0 ? "#f9f9fb" : "#ffffff"}
                />
              ))}

              {/* Day column shading (every other day) */}
              {dayTicks.map((h, di) =>
                di % 2 === 1 ? (
                  <rect
                    key={"dayshade-" + di}
                    x={LABEL_W + h * HR_W}
                    y={HEADER_H}
                    width={Math.min(HOURS_PER_DAY * HR_W, (maxHours - h) * HR_W)}
                    height={ganttRows.length * ROW_H}
                    fill="rgba(0,0,0,0.018)"
                  />
                ) : null
              )}

              {/* Hour grid lines (light) + day lines (medium) */}
              {showHourTicks && Array.from({ length: maxHours + 1 }, (_, h) => (
                h % HOURS_PER_DAY !== 0 && (
                  <line
                    key={"hline-" + h}
                    x1={LABEL_W + h * HR_W} y1={HEADER_H}
                    x2={LABEL_W + h * HR_W} y2={svgH - PAD}
                    stroke="#f0f0f2" strokeWidth={1}
                  />
                )
              ))}
              {dayTicks.map((h) => (
                <line
                  key={"dline-" + h}
                  x1={LABEL_W + h * HR_W} y1={HEADER_H - 10}
                  x2={LABEL_W + h * HR_W} y2={svgH - PAD}
                  stroke="#e4e4e7" strokeWidth={1}
                />
              ))}

              {/* Day headers */}
              {dayTicks.map((h, di) => {
                const next = dayTicks[di + 1] ?? maxHours;
                return (
                  <text
                    key={"dlabel-" + di}
                    x={LABEL_W + h * HR_W + (next - h) * HR_W / 2}
                    y={HEADER_H - 20}
                    textAnchor="middle"
                    fill="#71717a"
                    fontSize={10}
                    fontWeight="600"
                  >
                    {di === 0 ? "Tag 1" : `Tag ${di + 1}`}
                  </text>
                );
              })}

              {/* Hour sub-labels */}
              {showHourTicks && Array.from({ length: maxHours + 1 }, (_, h) => (
                h % HOURS_PER_DAY !== 0 && (
                  <text
                    key={"hlabel-" + h}
                    x={LABEL_W + h * HR_W}
                    y={HEADER_H - 6}
                    textAnchor="middle"
                    fill="#d4d4d8"
                    fontSize={8}
                  >
                    {h % HOURS_PER_DAY}h
                  </text>
                )
              ))}

              {/* Arrow markers */}
              <defs>
                <marker id="gantt-arrow-norm" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#cbd5e1" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#f97316" />
                </marker>
              </defs>

              {/* Dependency arrows (current board level only) */}
              {connections.map((c) => {
                const fi = rowIndex.get(c.from);
                const ti = rowIndex.get(c.to);
                if (fi === undefined || ti === undefined) return null;
                const isCritical = criticalPath.criticalConnectionIds.has(c.id);
                const lagH = lagToHours(c.lag, c.lagUnit);
                const fromRow = ganttRows[fi];
                const toRow = ganttRows[ti];
                const x1 = LABEL_W + fromRow.absoluteEF * HR_W;
                const y1 = HEADER_H + fi * ROW_H + ROW_H / 2;
                const xLagEnd = LABEL_W + toRow.absoluteES * HR_W;
                const y2 = HEADER_H + ti * ROW_H + ROW_H / 2;
                const mx = (x1 + xLagEnd) / 2;
                return (
                  <g key={c.id}>
                    {lagH > 0 && (
                      <rect
                        x={x1}
                        y={HEADER_H + Math.min(fi, ti) * ROW_H}
                        width={lagH * HR_W}
                        height={Math.abs(fi - ti) * ROW_H + ROW_H}
                        fill={isCritical ? "rgba(249,115,22,0.08)" : "rgba(203,213,225,0.2)"}
                        rx={2}
                      />
                    )}
                    <path
                      d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${xLagEnd},${y2}`}
                      fill="none"
                      stroke={isCritical ? "#f97316" : "#cbd5e1"}
                      strokeWidth={isCritical ? 2 : 1.5}
                      strokeDasharray={isCritical ? undefined : "4 3"}
                      markerEnd={`url(#gantt-arrow-${isCritical ? "crit" : "norm"})`}
                    />
                    {lagH > 0 && (
                      <text
                        x={x1 + (lagH * HR_W) / 2}
                        y={HEADER_H + Math.min(fi, ti) * ROW_H + 10}
                        textAnchor="middle"
                        fill={isCritical ? "#f97316" : "#94a3b8"}
                        fontSize={8}
                        fontWeight="600"
                      >
                        +{fmtDuration(lagH)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Bars + labels */}
              {ganttRows.map((row, i) => {
                const barX = LABEL_W + row.absoluteES * HR_W + 2;
                const barW = Math.max((row.absoluteEF - row.absoluteES) * HR_W - 4, 4);
                const barY = HEADER_H + i * ROW_H + 6;
                const barH = ROW_H - 12;
                const col = GANTT_COLORS[row.color] ?? "#a1a1aa";
                const durH = toHours(row.duration, row.unit);
                const iters = Math.max(1, row.iterations ?? 1);
                const singleBarW = iters > 1 ? Math.max((barW - (iters - 1) * 3) / iters, 2) : barW;
                const labelX = row.indent > 0 ? 18 : 8;
                const maxChars = row.indent > 0 ? 22 : 18;
                return (
                  <g key={row.id}>
                    {row.indent > 0 && (
                      <line x1={14} y1={HEADER_H + (i - 0.5) * ROW_H} x2={14} y2={HEADER_H + i * ROW_H + ROW_H / 2} stroke="#d4d4d8" strokeWidth={1} />
                    )}
                    <text
                      x={labelX}
                      y={HEADER_H + i * ROW_H + ROW_H / 2 + 4}
                      fill={row.isCritical ? "#c2410c" : row.indent > 0 ? "#71717a" : "#3f3f46"}
                      fontSize={row.indent > 0 ? 9 : 11}
                      fontWeight={row.isCritical ? "700" : row.indent > 0 ? "400" : "500"}
                      className="select-none"
                    >
                      {row.isCritical && row.indent === 0 ? "● " : ""}{row.title.length > maxChars ? row.title.slice(0, maxChars - 1) + "…" : row.title}
                    </text>
                    {iters > 1 ? (
                      // Iterative: N segmented bars
                      <>
                        {Array.from({ length: iters }, (_, si) => {
                          const segX = barX + si * (singleBarW + 3);
                          return (
                            <rect
                              key={si}
                              x={segX} y={barY}
                              width={singleBarW} height={barH}
                              rx={3}
                              fill={col}
                              opacity={row.isCritical ? 0.9 - si * 0.06 : 0.55 - si * 0.05}
                            />
                          );
                        })}
                        {/* ↺ Nx label centered over all segments */}
                        {barW > 32 && (
                          <text
                            x={barX + barW / 2}
                            y={barY + barH / 2 + 4}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize={9}
                            fontWeight="700"
                            className="select-none"
                          >
                            ↺ {iters}× {fmtDuration(durH)}
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        <rect x={barX} y={barY} width={barW} height={barH} rx={4} fill={col} opacity={row.isCritical ? 0.9 : row.indent > 0 ? 0.4 : 0.55} />
                        {barW > 24 && (
                          <text
                            x={barX + barW / 2}
                            y={barY + barH / 2 + 4}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize={9}
                            fontWeight="600"
                            className="select-none"
                          >
                            {fmtDuration(durH)}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {/* Header separator */}
              <line x1={0} y1={HEADER_H} x2={svgW} y2={HEADER_H} stroke="#e4e4e7" strokeWidth={1} />
              <text x={8} y={HEADER_H - 22} fill="#a1a1aa" fontSize={10} fontWeight="600">TASK</text>
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
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => {
                      setEditTitle(e.target.value);
                      setTasks((prev) => prev.map((t) => t.id === detailTaskId ? { ...t, title: e.target.value } : t));
                    }}
                    className="-mx-1 w-full rounded border border-transparent px-1 py-0.5 text-base font-semibold text-zinc-900 hover:border-zinc-200 focus:border-zinc-300 focus:bg-zinc-50 focus:outline-none"
                    placeholder="Titel…"
                  />
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => {
                      setEditNote(e.target.value);
                      setTasks((prev) => prev.map((t) => t.id === detailTaskId ? { ...t, note: e.target.value || undefined } : t));
                    }}
                    className="-mx-1 mt-0.5 w-full rounded border border-transparent px-1 py-0.5 text-xs text-zinc-500 hover:border-zinc-200 focus:border-zinc-300 focus:bg-zinc-50 focus:outline-none"
                    placeholder="Notiz…"
                  />
                  <div className="mt-2 flex items-center gap-1.5">
                    {paletteOrder.map((pc) => {
                      const DOT_C: Record<string, string> = { amber: "#f59e0b", orange: "#f97316", emerald: "#10b981", teal: "#14b8a6", sky: "#0ea5e9", indigo: "#6366f1", rose: "#f43f5e", violet: "#8b5cf6" };
                      return (
                        <button key={pc} type="button" title={COLORS[pc].label}
                          onClick={() => { setEditColor(pc); setTasks((prev) => prev.map((t) => t.id === detailTaskId ? { ...t, color: pc } : t)); }}
                          className={`rounded-full transition ${editColor === pc ? "scale-125 ring-2 ring-zinc-700 ring-offset-1" : "opacity-50 hover:opacity-100 hover:scale-110"}`}
                          style={{ width: 12, height: 12, background: DOT_C[pc] }}
                        />
                      );
                    })}
                  </div>
                  {/* Iterationen-Stepper */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-500">↺ Iterationen</span>
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setTasks((prev) => prev.map((t) => t.id === detailTaskId ? { ...t, iterations: Math.max(1, (t.iterations ?? 1) - 1) } : t))}
                        className="px-2 py-0.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition"
                      >−</button>
                      <span className="min-w-[1.5rem] text-center text-xs font-semibold text-zinc-800 tabular-nums px-1">
                        {dt.iterations ?? 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTasks((prev) => prev.map((t) => t.id === detailTaskId ? { ...t, iterations: (t.iterations ?? 1) + 1 } : t))}
                        className="px-2 py-0.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition"
                      >+</button>
                    </div>
                    {(dt.iterations ?? 1) > 1 && (
                      <span className="text-[10px] text-zinc-400">
                        = {fmtDuration(effectiveHours(dt))} gesamt
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-zinc-600">
                    {formatChf(effectiveHours(dt) * HOURLY_RATE)}
                    <span className="ml-1.5 font-normal text-zinc-400">{fmtDuration(effectiveHours(dt))}</span>
                  </p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTasks((prev) => prev.filter((t) => t.id !== detailTaskId));
                      setConnections((prev) => prev.filter((c) => c.from !== detailTaskId && c.to !== detailTaskId));
                      closeModal();
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-100"
                    aria-label={level === "phase" ? "Phase löschen" : "Task löschen"}
                    title={level === "phase" ? "Phase löschen" : "Task löschen"}
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                      <path d="M1.5 3h8M4 3V2h3v1M4.5 5v3.5M6.5 5v3.5M2.5 3l.5 6h5l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Löschen
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-sm text-zinc-500 hover:bg-zinc-100"
                    aria-label="Modal schliessen"
                  >
                    &times;
                  </button>
                </div>
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
