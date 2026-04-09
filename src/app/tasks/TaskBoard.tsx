"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type ColorToken = "amber" | "orange" | "emerald" | "teal" | "sky" | "indigo" | "rose" | "violet" | "mint";

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
  assignee?: string; // Ressource / Person (für Resource Leveling)
};

export type TaskConnection = {
  id: string;
  from: string;
  to: string;
  lag?: number;        // Wartezeit nach dem Vorgänger (Einheit: lagUnit)
  lagUnit?: "h" | "d"; // default "h"
  loopDuration?: number;     // Gesamtzeit für diesen Loop-Zyklus (nur Back-Edges)
  loopDurationUnit?: "h" | "d";
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

const CARD_WIDTH = 280;
const CARD_HEIGHT = 148;
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
  mint:    { bg: "bg-green-50",   border: "border-green-200",   text: "text-green-900",   label: "Mint" },
};

const paletteOrder: ColorToken[] = ["amber", "orange", "emerald", "teal", "sky", "indigo", "rose", "violet", "mint"];

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
  topoOrder: string[];
};

function computeCriticalPath(tasks: TaskCard[], connections: TaskConnection[]): CriticalPathResult {
  const empty: CriticalPathResult = {
    criticalTaskIds: new Set(),
    criticalConnectionIds: new Set(),
    projectDuration: 0,
    hasCycle: false,
    ES: new Map(),
    EF: new Map(),
    topoOrder: [],
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

  return { criticalTaskIds, criticalConnectionIds, projectDuration, hasCycle: false, ES, EF, topoOrder };
}

// ─── Back-Edge Detection (Zyklen / Loops) ────────────────────────────────────
// Returns the set of connection IDs that form back edges (cycles).
// CPM and Gantt exclude these; the board renders them as loop arrows.
function findBackEdges(tasks: TaskCard[], connections: TaskConnection[]): Set<string> {
  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const adj = new Map<string, string[]>();
  const connKey = new Map<string, string>(); // "from:to" -> connId
  for (const id of ids) adj.set(id, []);
  for (const c of connections) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    adj.get(c.from)!.push(c.to);
    connKey.set(`${c.from}:${c.to}`, c.id);
  }
  const backEdges = new Set<string>();
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]));
  function dfs(u: string) {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        const cid = connKey.get(`${u}:${v}`);
        if (cid) backEdges.add(cid);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }
  for (const id of ids) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return backEdges;
}

/** Returns IDs of forward edges that lie on a cycle (used only for visual styling). */
function findCycleEdgeIds(tasks: TaskCard[], connections: TaskConnection[], backEdges: Set<string>): Set<string> {
  if (backEdges.size === 0) return new Set();
  const idSet = new Set(tasks.map((t) => t.id));
  const fwdAdj = new Map<string, string[]>();
  const revAdj = new Map<string, string[]>();
  for (const t of tasks) { fwdAdj.set(t.id, []); revAdj.set(t.id, []); }
  for (const c of connections) {
    if (backEdges.has(c.id) || !idSet.has(c.from) || !idSet.has(c.to)) continue;
    fwdAdj.get(c.from)!.push(c.to);
    revAdj.get(c.to)!.push(c.from);
  }
  const cycleEdges = new Set<string>();
  for (const c of connections) {
    if (!backEdges.has(c.id)) continue;
    const fwdReach = new Set<string>();
    const fq: string[] = [c.to];
    while (fq.length) { const n = fq.pop()!; if (fwdReach.has(n)) continue; fwdReach.add(n); for (const nb of fwdAdj.get(n) ?? []) fq.push(nb); }
    const revReach = new Set<string>();
    const rq: string[] = [c.from];
    while (rq.length) { const n = rq.pop()!; if (revReach.has(n)) continue; revReach.add(n); for (const nb of revAdj.get(n) ?? []) rq.push(nb); }
    const onCycle = new Set<string>([...fwdReach].filter((n) => revReach.has(n)));
    for (const edge of connections) {
      if (!backEdges.has(edge.id) && onCycle.has(edge.from) && onCycle.has(edge.to)) cycleEdges.add(edge.id);
    }
  }
  return cycleEdges;
}

type CrossPickerState = {
  taskId: string;
  direction: "in" | "out";
  selectedPhaseId: string | null;
};

type TaskBoardProps = {
  initialState?: BoardState;
  onStateChange?: (state: BoardState) => void;
  onDrillIn?: (taskId: string, taskTitle: string, fromGantt?: boolean) => void;
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
  /** When set, shows a "Zurück zum Gantt" button that calls this callback */
  returnToGantt?: () => void;
  /** Force initial view mode (e.g. to restore gantt fullscreen after back-navigation) */
  initialView?: "board" | "table" | "gantt-fullscreen";
};

export function TaskBoard({ initialState, onStateChange, onDrillIn, externalBoard, onExternalBoardConsumed, level = "task", rootBoard, currentPhaseId, crossConnections, onCrossConnectionsChange, onNavigateToPhase, breadcrumbSlot, variantSlot, returnToGantt, initialView }: TaskBoardProps = {}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
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
  const [view, setView] = useState<"board" | "table" | "gantt">(initialView === "gantt-fullscreen" ? "gantt" : (initialView ?? "board"));
  const [ganttFullscreen, setGanttFullscreen] = useState(initialView === "gantt-fullscreen");
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
  const [soloMode, setSoloMode] = useState(true); // Resource Leveling: Solo-Modus (1 Person)

  // Gantt inline editing state
  const [ganttEditId, setGanttEditId] = useState<string | null>(null); // row id being edited (title)
  const [ganttEditTitle, setGanttEditTitle] = useState("");
  const [ganttEditDurId, setGanttEditDurId] = useState<string | null>(null); // row id being edited (duration)
  const [ganttEditDur, setGanttEditDur] = useState("");
  const [ganttEditUnit, setGanttEditUnit] = useState<"h" | "d">("h");
  // Gantt description popover state
  const [ganttDescPopover, setGanttDescPopover] = useState<{ rowId: string; x: number; y: number } | null>(null);
  const [ganttDescEditId, setGanttDescEditId] = useState<string | null>(null);
  const [ganttDescEditText, setGanttDescEditText] = useState("");
  const ganttDescHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gantt bar drag state
  const ganttDragRef = useRef<{ rowId: string; startX: number; origES: number } | null>(null);
  // Gantt selection highlight
  const [ganttSelectedRowId, setGanttSelectedRowId] = useState<string | null>(null);
  // Gantt hover states (gear icon + insert zone)
  const [ganttHoverRowIdx, setGanttHoverRowIdx] = useState<number | null>(null);
  const [ganttInsertHoverIdx, setGanttInsertHoverIdx] = useState<number | null>(null);

  /** Update a task by gantt row id. Supports composite IDs like "P1:1.3" for subtasks. */
  const ganttUpdateTask = useCallback((rowId: string, updater: (t: TaskCard) => TaskCard) => {
    if (rowId.includes(':')) {
      const [phaseId, subId] = rowId.split(':');
      setTasks((prev) => prev.map((t) => {
        if (t.id !== phaseId || !t.subBoard) return t;
        return { ...t, subBoard: { ...t.subBoard, tasks: t.subBoard.tasks.map((st) => st.id === subId ? updater(st) : st) } };
      }));
    } else {
      setTasks((prev) => prev.map((t) => t.id === rowId ? updater(t) : t));
    }
  }, []);

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

  const backEdgeIds = useMemo(() => findBackEdges(tasks, connections), [tasks, connections]);
  const cycleEdgeIds = useMemo(() => findCycleEdgeIds(tasks, connections, backEdgeIds), [tasks, connections, backEdgeIds]);

  const forwardConnections = useMemo(
    () => connections.filter((c) => !backEdgeIds.has(c.id)),
    [connections, backEdgeIds]
  );

  const criticalPath = useMemo(() => computeCriticalPath(tasks, forwardConnections), [tasks, forwardConnections]);

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
              mint: "#22c55e",
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
        {view === "gantt" && tasks.some((t) => (t.subBoard?.tasks?.length ?? 0) > 0) && (
          <button
            type="button"
            onClick={() => {
              const allWithSubs = tasks.filter((t) => (t.subBoard?.tasks?.length ?? 0) > 0).map((t) => t.id);
              const allExpanded = allWithSubs.every((id) => expandedPhaseIds.has(id));
              setExpandedPhaseIds(allExpanded ? new Set() : new Set(allWithSubs));
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50"
          >
            {tasks.some((t) => expandedPhaseIds.has(t.id)) ? "⊟ Einklappen" : "⊞ Alle Tasks"}
          </button>
        )}
        {view === "gantt" && (
          <button
            type="button"
            onClick={() => setSoloMode((p) => !p)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${soloMode ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
            title="Resource Leveling: Solo-Modus (nur 1 Person arbeitet)"
          >
            👤 Solo-Modus
          </button>
        )}
        {view === "gantt" && (
          <button
            type="button"
            onClick={() => setGanttFullscreen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50"
            title="Vollansicht"
          >
            ⛶ Vollansicht
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

          {/* Zurück zum Gantt button — shown when navigated from Gantt view */}
          {returnToGantt && (
            <button
              type="button"
              onClick={returnToGantt}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Zurück zum Gantt
            </button>
          )}

          <div
            ref={scrollWrapRef}
            className="overflow-auto rounded-3xl"
            style={{ cursor: panRef.current?.active ? "grabbing" : "default", maxHeight: "calc(100vh - 200px)" }}
            onPointerDown={(e) => {
              // Mitteltaste (button=1) oder rechte Taste (button=2) → Pan-Modus
              if (e.button !== 1 && e.button !== 2) return;
              e.preventDefault();
              const wrap = scrollWrapRef.current;
              if (!wrap) return;
              panRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop };
              wrap.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const pan = panRef.current;
              if (!pan?.active) return;
              const wrap = scrollWrapRef.current;
              if (!wrap) return;
              wrap.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
              wrap.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
            }}
            onPointerUp={(e) => {
              if (panRef.current?.active) panRef.current = null;
            }}
            onContextMenu={(e) => {
              // Rechtsklick-Kontextmenü unterdrücken wenn Pan aktiv war
              if (!panRef.current) return;
              e.preventDefault();
            }}
          >
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
                <marker id="arrowhead-loop" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
                </marker>
              </defs>
              {connectionLines.map((line) => {
                const isCritical = criticalPath.criticalConnectionIds.has(line.id);
                const isBackEdge = backEdgeIds.has(line.id);
                const isCycleEdge = cycleEdgeIds.has(line.id);
                const isLoop = isBackEdge || isCycleEdge;

                if (isBackEdge) {
                  // Curved arc for back-edges — visually distinct loop-back arrow (routes below)
                  const midX = (line.x1 + line.x2) / 2;
                  const midY = (line.y1 + line.y2) / 2;
                  const dist = Math.sqrt((line.x2 - line.x1) ** 2 + (line.y2 - line.y1) ** 2);
                  const downOffset = Math.min(dist * 0.45, 140);
                  const cpX = midX;
                  const cpY = midY + downOffset;
                  const d = `M ${line.x1},${line.y1} Q ${cpX},${cpY} ${line.x2},${line.y2}`;
                  const conn = connections.find((c) => c.id === line.id);
                  const loopLabel = conn?.loopDuration
                    ? `↺ ${fmtDuration(toHours(conn.loopDuration, conn.loopDurationUnit as "h" | "d" ?? "h"))}`
                    : "↺";
                  return (
                    <g key={line.id}>
                      <path d={d} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="7 4"
                        markerEnd="url(#arrowhead-loop)" strokeLinejoin="round" />
                      <text x={cpX} y={cpY + 14} textAnchor="middle" fontSize={11} fontWeight="700"
                        fill="#8b5cf6" className="select-none pointer-events-none">
                        {loopLabel}
                      </text>
                    </g>
                  );
                }

                return (
                  <g key={line.id}>
                    <line
                      x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                      stroke={isCycleEdge ? "#8b5cf6" : isCritical ? "#f97316" : "#a1a1aa"}
                      strokeWidth={isCritical ? 2.5 : 2}
                      strokeDasharray={isCycleEdge ? "5 3" : undefined}
                      strokeLinecap="round"
                      markerEnd={isLoop ? "url(#arrowhead-loop)" : isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
                      className="mix-blend-multiply"
                    />
                  </g>
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
                      <div className={`absolute w-[288px] rounded-2xl border ${color.border} ${color.bg} opacity-40`} style={{ top: 8, left: 8, height: CARD_HEIGHT }} aria-hidden />
                      {iters >= 3 && <div className={`absolute w-[288px] rounded-2xl border ${color.border} ${color.bg} opacity-25`} style={{ top: 16, left: 16, height: CARD_HEIGHT }} aria-hidden />}
                    </>
                  )}
                <article
                  className={`relative w-[280px] rounded-2xl border p-3 text-sm shadow-md transition-shadow ${color.bg} ${color.border} ${color.text} ${
                    linkSource === task.id
                      ? "ring-2 ring-zinc-900"
                      : criticalPath.criticalTaskIds.has(task.id)
                      ? "ring-2 ring-orange-400 shadow-orange-100"
                      : ""
                  }`}
                  onPointerDown={(event) => handlePointerDown(task.id, event)}
                  onClick={() => handleCardClick(task.id)}
                >
                  {/* Titel — ganz oben, eigene Zeile */}
                  <h3 className={`mb-1.5 break-words text-sm font-semibold leading-snug ${level === "phase" ? "cursor-pointer" : "cursor-grab"}`}>{task.title}</h3>
                  {isIterative && (
                    <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-black/[0.09] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
                      ↺ {iters}× iterativ
                    </span>
                  )}
                  {/* Aktions-Buttons — eigene Zeile */}
                  <div className="flex items-center gap-0.5">
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
                  {task.note ? <p className="mt-1.5 text-xs text-zinc-600">{task.note}</p> : null}
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
                  {/* Inline subtask list */}
                  {(task.subBoard?.tasks?.length ?? 0) > 0 && (
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
          </div>{/* end scrollWrapRef */}

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
                      {/* Loop-Dauer — nur für Back-Edges sichtbar */}
                      {backEdgeIds.has(connection.id) && (
                        <span className="flex shrink-0 items-center gap-1" title="Gesamtzeit für diesen Loop">
                          <span className="text-[10px] font-bold text-violet-500">↺</span>
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            value={connection.loopDuration ?? 0}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setConnections((prev) =>
                                prev.map((c) => c.id === connection.id ? { ...c, loopDuration: val || undefined } : c)
                              );
                            }}
                            className="w-12 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-center text-xs font-semibold text-violet-700 focus:border-violet-400 focus:outline-none"
                            aria-label="Loop-Gesamtdauer"
                            placeholder="0"
                          />
                          <button
                            type="button"
                            onClick={() => setConnections((prev) => prev.map((c) => c.id === connection.id ? { ...c, loopDurationUnit: c.loopDurationUnit === "d" ? "h" : "d" } : c))}
                            className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 hover:border-violet-400"
                            title="Loop-Einheit wechseln"
                          >
                            {connection.loopDurationUnit === "d" ? "d" : "h"}
                          </button>
                        </span>
                      )}
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

      {/* Gantt view — renders inline or inside fullscreen overlay */}
      {(view === "gantt" || ganttFullscreen) && (() => {
        if (tasks.length === 0) {
          return ganttFullscreen ? null : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
              Noch keine Tasks angelegt.
            </div>
          );
        }
        const ROW_H = 36;
        const LABEL_W = 300;
        const HR_W = 18; // pixels per hour
        const HEADER_H = 40;
        const PAD = 12;

        // Normalize all durations to hours; ES/EF are already in hours after CPM update
        // Back edges (loops) are excluded from CPM — use forwardConnections
        const efMap = new Map<string, number>();
        const esMap = new Map<string, number>();
        if (forwardConnections.length > 0 && !criticalPath.hasCycle && criticalPath.ES.size > 0) {
          for (const t of tasks) {
            esMap.set(t.id, criticalPath.ES.get(t.id) ?? 0);
            efMap.set(t.id, criticalPath.EF.get(t.id) ?? (criticalPath.ES.get(t.id) ?? 0) + effectiveHours(t));
          }
        } else {
          // Fallback: place tasks in topo order or original order
          const fallbackOrder = criticalPath.topoOrder.length > 0
            ? criticalPath.topoOrder
            : tasks.map((t) => t.id);
          let cursor = 0;
          for (const id of fallbackOrder) {
            const t = tasks.find((x) => x.id === id);
            if (!t) continue;
            const dur = effectiveHours(t);
            esMap.set(id, cursor);
            efMap.set(id, cursor + dur);
            cursor += dur;
          }
          // any tasks not in fallbackOrder
          for (const t of tasks) {
            if (!esMap.has(t.id)) {
              const dur = effectiveHours(t);
              esMap.set(t.id, cursor);
              efMap.set(t.id, cursor + dur);
              cursor += dur;
            }
          }
        }

        // Apply loop duration: for back edges with loopDuration,
        // any task that topologically comes AFTER the loop entry (but is not IN the loop)
        // must start at >= loopEntry.ES + loopDuration.
        for (const c of connections) {
          if (!backEdgeIds.has(c.id) || !c.loopDuration) continue;
          const loopH = toHours(c.loopDuration, c.loopDurationUnit ?? "h");
          const entryId = c.to;  // back-edge target = loop entry
          const entryES = esMap.get(entryId) ?? 0;
          const loopDeadline = entryES + loopH;
          // Forward adjacency (without back edges)
          const fwdAdj = new Map<string, string[]>();
          for (const t of tasks) fwdAdj.set(t.id, []);
          for (const fc of forwardConnections) fwdAdj.get(fc.from)?.push(fc.to);
          // Find loop nodes = all nodes reachable from entryId that can reach c.from
          const reachFromEntry = new Set<string>();
          const stk = [entryId];
          while (stk.length) { const n = stk.pop()!; if (reachFromEntry.has(n)) continue; reachFromEntry.add(n); for (const nb of fwdAdj.get(n) ?? []) stk.push(nb); }
          const loopNodes = new Set<string>();
          function canReachExit(node: string, visited: Set<string>): boolean {
            if (node === c.from) return true;
            if (visited.has(node)) return false;
            visited.add(node);
            return (fwdAdj.get(node) ?? []).some((nb) => canReachExit(nb, visited));
          }
          for (const n of reachFromEntry) {
            if (canReachExit(n, new Set())) loopNodes.add(n);
          }
          // Shift post-loop tasks
          for (const t of tasks) {
            if (loopNodes.has(t.id)) continue;
            const curES = esMap.get(t.id) ?? 0;
            if (curES >= entryES && curES < loopDeadline) {
              esMap.set(t.id, loopDeadline);
              efMap.set(t.id, loopDeadline + effectiveHours(t));
            }
          }
        }
        // Re-propagate phase-level: after loop shifts, enforce ES >= max(pred EF + lag)
        if (!criticalPath.hasCycle && criticalPath.topoOrder.length > 0) {
          const _phConnLookup = new Map<string, TaskConnection>();
          for (const fc of forwardConnections) _phConnLookup.set(`${fc.from}:${fc.to}`, fc);
          const _phPreds = new Map<string, string[]>();
          for (const t of tasks) _phPreds.set(t.id, []);
          for (const fc of forwardConnections) {
            const s = new Set(tasks.map((t) => t.id));
            if (s.has(fc.from) && s.has(fc.to)) _phPreds.get(fc.to)!.push(fc.from);
          }
          for (const id of criticalPath.topoOrder) {
            const preds = _phPreds.get(id) ?? [];
            if (preds.length === 0) continue;
            const minES = Math.max(...preds.map((p) => {
              const conn = _phConnLookup.get(`${p}:${id}`);
              return (efMap.get(p) ?? 0) + lagToHours(conn?.lag, conn?.lagUnit);
            }));
            const curES = esMap.get(id) ?? 0;
            if (minES > curES) {
              const t = tasks.find((t) => t.id === id)!;
              esMap.set(id, minES);
              efMap.set(id, minES + effectiveHours(t));
            }
          }
        }

        // ── Global flat CPM across ALL sub-tasks (cross-phase aware) ──────
        const _flatTasks: TaskCard[] = [];
        const _flatConns: TaskConnection[] = [];
        for (const ph of tasks) {
          if (!ph.subBoard?.tasks?.length) continue;
          for (const st of ph.subBoard.tasks) _flatTasks.push({ ...st, id: `${ph.id}:${st.id}` });
          for (const c of (ph.subBoard.connections ?? []))
            _flatConns.push({ ...c, id: `_s_${ph.id}:${c.id}`, from: `${ph.id}:${c.from}`, to: `${ph.id}:${c.to}` });
        }
        // Cross-phase task-to-task connections from root board
        for (const c of connections) {
          if (c.from.includes(':') && c.to.includes(':')) _flatConns.push(c);
        }
        // Also include crossConnections (e.g. manually-added phases like Meetings)
        for (const cc of (crossConnections ?? [])) {
          const cid = `${cc.fromPhaseId}:${cc.fromTaskId}`;
          const tid = `${cc.toPhaseId}:${cc.toTaskId}`;
          // Avoid duplicates if already present as composite-ID connection
          if (!_flatConns.some((fc) => fc.from === cid && fc.to === tid)) {
            _flatConns.push({ id: cc.id, from: cid, to: tid });
          }
        }
        // Translate phase-level connections into subtask-level virtual edges:
        // exitTasks(A) → entryTasks(B) for every phase connection A→B
        for (const c of connections) {
          if (c.from.includes(':') || c.to.includes(':')) continue; // only phase-level
          const phFrom = tasks.find((t) => t.id === c.from);
          const phTo = tasks.find((t) => t.id === c.to);
          if (!phFrom?.subBoard?.tasks?.length || !phTo?.subBoard?.tasks?.length) continue;
          // Exit tasks: subtasks with no outgoing internal forward connection
          const intFromIds = new Set(phFrom.subBoard.tasks.map((t) => t.id));
          const intFromConns = (phFrom.subBoard.connections ?? []).filter((ic) => intFromIds.has(ic.from) && intFromIds.has(ic.to));
          const intFromBackIds = findBackEdges(phFrom.subBoard.tasks, intFromConns);
          const hasOutgoing = new Set(intFromConns.filter((ic) => !intFromBackIds.has(ic.id)).map((ic) => ic.from));
          const exitTasks = phFrom.subBoard.tasks.filter((t) => !hasOutgoing.has(t.id));
          // Entry tasks: subtasks with no incoming internal forward connection
          const intToIds = new Set(phTo.subBoard.tasks.map((t) => t.id));
          const intToConns = (phTo.subBoard.connections ?? []).filter((ic) => intToIds.has(ic.from) && intToIds.has(ic.to));
          const intToBackIds = findBackEdges(phTo.subBoard.tasks, intToConns);
          const hasIncoming = new Set(intToConns.filter((ic) => !intToBackIds.has(ic.id)).map((ic) => ic.to));
          const entryTasks = phTo.subBoard.tasks.filter((t) => !hasIncoming.has(t.id));
          for (const ex of exitTasks) {
            for (const en of entryTasks) {
              const vFrom = `${c.from}:${ex.id}`;
              const vTo = `${c.to}:${en.id}`;
              if (!_flatConns.some((fc) => fc.from === vFrom && fc.to === vTo)) {
                _flatConns.push({ id: `_vp_${vFrom}_${vTo}`, from: vFrom, to: vTo, lag: c.lag, lagUnit: c.lagUnit });
              }
            }
          }
        }
        const _flatBackIds = findBackEdges(_flatTasks, _flatConns);
        const _flatFwd = _flatConns.filter((c) => !_flatBackIds.has(c.id));
        const _flatCPM = computeCriticalPath(_flatTasks, _flatFwd);
        const globalSubES = new Map<string, number>();
        const globalSubEF = new Map<string, number>();
        if (!_flatCPM.hasCycle && _flatCPM.ES.size > 0) {
          for (const t of _flatTasks) {
            globalSubES.set(t.id, _flatCPM.ES.get(t.id) ?? 0);
            globalSubEF.set(t.id, _flatCPM.EF.get(t.id) ?? 0);
          }
        } else {
          let _cur = 0;
          for (const t of _flatTasks) { const d = effectiveHours(t); globalSubES.set(t.id, _cur); globalSubEF.set(t.id, _cur + d); _cur += d; }
        }
        // Apply loop duration adjustments on flat model
        for (const c of _flatConns) {
          if (!_flatBackIds.has(c.id) || !c.loopDuration) continue;
          const loopH = toHours(c.loopDuration, c.loopDurationUnit ?? "h");
          const entryES2 = globalSubES.get(c.to) ?? 0;
          const loopDL = entryES2 + loopH;
          const _fAdj = new Map<string, string[]>();
          for (const t of _flatTasks) _fAdj.set(t.id, []);
          for (const fc of _flatFwd) _fAdj.get(fc.from)?.push(fc.to);
          const _rfe = new Set<string>();
          const _stk: string[] = [c.to];
          while (_stk.length) { const n = _stk.pop()!; if (_rfe.has(n)) continue; _rfe.add(n); for (const nb of _fAdj.get(n) ?? []) _stk.push(nb); }
          const _ln = new Set<string>();
          const _cre = (node: string, vis: Set<string>): boolean => {
            if (node === c.from) return true;
            if (vis.has(node)) return false; vis.add(node);
            return (_fAdj.get(node) ?? []).some((nb) => _cre(nb, vis));
          };
          for (const n of _rfe) { if (_cre(n, new Set())) _ln.add(n); }
          for (const t of _flatTasks) {
            if (_ln.has(t.id)) continue;
            const cur = globalSubES.get(t.id) ?? 0;
            if (cur >= entryES2 && cur < loopDL) {
              globalSubES.set(t.id, loopDL);
              globalSubEF.set(t.id, loopDL + effectiveHours(t));
            }
          }
        }
        // Re-propagate: after loop shifts some tasks may violate predecessor constraints.
        // Walk forward edges in topo order and enforce ES >= max(pred EF + lag).
        if (!_flatCPM.hasCycle && _flatCPM.topoOrder.length > 0) {
          const _fwdConnLookup = new Map<string, { lag?: number; lagUnit?: string }>();
          for (const fc of _flatFwd) _fwdConnLookup.set(`${fc.from}:${fc.to}`, fc);
          const _fwdPreds = new Map<string, string[]>();
          for (const t of _flatTasks) _fwdPreds.set(t.id, []);
          for (const fc of _flatFwd) {
            const s = new Set(_flatTasks.map((t) => t.id));
            if (s.has(fc.from) && s.has(fc.to)) _fwdPreds.get(fc.to)!.push(fc.from);
          }
          for (const id of _flatCPM.topoOrder) {
            const preds = _fwdPreds.get(id) ?? [];
            if (preds.length === 0) continue;
            const minES = Math.max(...preds.map((p) => {
              const conn = _fwdConnLookup.get(`${p}:${id}`);
              return (globalSubEF.get(p) ?? 0) + lagToHours(conn?.lag, conn?.lagUnit);
            }));
            const curES = globalSubES.get(id) ?? 0;
            if (minES > curES) {
              const t = _flatTasks.find((t) => t.id === id)!;
              globalSubES.set(id, minES);
              globalSubEF.set(id, minES + effectiveHours(t));
            }
          }
        }

        // ── Resource Leveling (Solo-Modus) ────────────────────────────────
        // When soloMode is active, tasks on the same resource cannot overlap.
        // We use priority-based scheduling: always pick the task with the
        // earliest CPM-ES whose predecessors are all finished (= "ready queue").
        if (soloMode && _flatTasks.length > 0) {
          // Build predecessor and successor lookup
          const _lvPreds = new Map<string, Set<string>>();
          const _lvSuccs = new Map<string, string[]>();
          const _lvConnLookup = new Map<string, { lag?: number; lagUnit?: string }>();
          for (const t of _flatTasks) { _lvPreds.set(t.id, new Set()); _lvSuccs.set(t.id, []); }
          const _flatIds = new Set(_flatTasks.map((t) => t.id));
          for (const fc of _flatFwd) {
            if (_flatIds.has(fc.from) && _flatIds.has(fc.to)) {
              _lvPreds.get(fc.to)!.add(fc.from);
              _lvSuccs.get(fc.from)!.push(fc.to);
              _lvConnLookup.set(`${fc.from}:${fc.to}`, fc);
            }
          }
          // Priority queue: tasks sorted by CPM-ES (earliest-ready first)
          const _origES = new Map<string, number>();
          for (const t of _flatTasks) _origES.set(t.id, globalSubES.get(t.id) ?? 0);
          const readyQueue: string[] = [];
          const scheduled = new Set<string>();
          const remainingPreds = new Map<string, number>();
          for (const t of _flatTasks) remainingPreds.set(t.id, _lvPreds.get(t.id)!.size);
          // Seed with tasks that have no predecessors
          for (const t of _flatTasks) {
            if (remainingPreds.get(t.id) === 0) readyQueue.push(t.id);
          }
          // Sort ready queue by original CPM-ES (ascending) so earliest-available task runs first
          readyQueue.sort((a, b) => (_origES.get(a) ?? 0) - (_origES.get(b) ?? 0));
          let resourceFreeAt = 0;
          let lastPhase = ""; // Track last scheduled phase for affinity
          const phaseOf = (cid: string) => cid.includes(':') ? cid.split(':')[0] : cid;
          while (readyQueue.length > 0) {
            // Compute effective ES for each candidate
            const candidates: { idx: number; effES: number; phase: string }[] = [];
            for (let qi = 0; qi < readyQueue.length; qi++) {
              const cid = readyQueue[qi];
              const cpmES = _origES.get(cid) ?? 0;
              let effES = Math.max(cpmES, resourceFreeAt);
              for (const p of _lvPreds.get(cid) ?? []) {
                const conn = _lvConnLookup.get(`${p}:${cid}`);
                effES = Math.max(effES, (globalSubEF.get(p) ?? 0) + lagToHours(conn?.lag, conn?.lagUnit));
              }
              candidates.push({ idx: qi, effES, phase: phaseOf(cid) });
            }
            // Sort: earliest effES first, then phase affinity (same phase as last → priority)
            candidates.sort((a, b) => {
              if (a.effES !== b.effES) return a.effES - b.effES;
              // Tiebreaker: prefer same phase as last scheduled task
              const aAff = a.phase === lastPhase ? 0 : 1;
              const bAff = b.phase === lastPhase ? 0 : 1;
              return aAff - bAff;
            });
            const best = candidates[0];
            const id = readyQueue.splice(best.idx, 1)[0];
            scheduled.add(id);
            lastPhase = phaseOf(id);
            const t = _flatTasks.find((t) => t.id === id);
            if (!t) continue;
            const dur = effectiveHours(t);
            globalSubES.set(id, best.effES);
            globalSubEF.set(id, best.effES + dur);
            resourceFreeAt = best.effES + dur;
            // Unlock successors
            for (const s of _lvSuccs.get(id) ?? []) {
              remainingPreds.set(s, (remainingPreds.get(s) ?? 1) - 1);
              if (remainingPreds.get(s) === 0 && !scheduled.has(s)) {
                readyQueue.push(s);
              }
            }
          }
        }

        // Phase-level ES/EF derived from their sub-tasks
        const phaseAbsES = new Map<string, number>();
        const phaseAbsEF = new Map<string, number>();
        for (const ph of tasks) {
          if (ph.subBoard?.tasks?.length) {
            let minE = Infinity, maxE = 0;
            for (const st of ph.subBoard.tasks) {
              const cid = `${ph.id}:${st.id}`;
              minE = Math.min(minE, globalSubES.get(cid) ?? 0);
              maxE = Math.max(maxE, globalSubEF.get(cid) ?? 0);
            }
            phaseAbsES.set(ph.id, minE === Infinity ? 0 : minE);
            phaseAbsEF.set(ph.id, maxE);
          } else {
            phaseAbsES.set(ph.id, esMap.get(ph.id) ?? 0);
            phaseAbsEF.set(ph.id, efMap.get(ph.id) ?? effectiveHours(ph));
          }
        }

        // Sort phases by absoluteES
        const sortedGanttTasks = [...tasks].sort((a, b) =>
          (phaseAbsES.get(a.id) ?? 0) - (phaseAbsES.get(b.id) ?? 0)
        );

        // Build gantt rows using global positions
        type GanttRow = { id: string; title: string; note?: string; color: ColorToken; duration: number; unit?: "h" | "d"; iterations?: number; indent: number; absoluteES: number; absoluteEF: number; isCritical: boolean; hasSubTasks: boolean; assignee?: string; };
        const ganttRows: GanttRow[] = [];
        for (const task of sortedGanttTasks) {
          const taskES = phaseAbsES.get(task.id) ?? 0;
          const taskEF = phaseAbsEF.get(task.id) ?? taskES + effectiveHours(task);
          const hasSubTasks = (task.subBoard?.tasks?.length ?? 0) > 0;
          ganttRows.push({ id: task.id, title: task.title, note: task.note, color: task.color, duration: task.duration ?? 1, unit: task.unit, iterations: task.iterations, indent: 0, absoluteES: taskES, absoluteEF: taskEF, isCritical: criticalPath.criticalTaskIds.has(task.id), hasSubTasks, assignee: task.assignee });
          if (hasSubTasks && expandedPhaseIds.has(task.id)) {
            const sortedSubs = [...task.subBoard!.tasks].sort((a, b) =>
              (globalSubES.get(`${task.id}:${a.id}`) ?? 0) - (globalSubES.get(`${task.id}:${b.id}`) ?? 0)
            );
            for (const st of sortedSubs) {
              const cid = `${task.id}:${st.id}`;
              ganttRows.push({ id: cid, title: st.title, note: st.note, color: st.color, duration: st.duration ?? 1, unit: st.unit, iterations: st.iterations, indent: 1, absoluteES: globalSubES.get(cid) ?? 0, absoluteEF: globalSubEF.get(cid) ?? effectiveHours(st), isCritical: _flatCPM.criticalTaskIds.has(cid), hasSubTasks: false, assignee: st.assignee });
            }
          }
        }

        const maxHours = Math.max(...ganttRows.map((r) => r.absoluteEF), 1);
        const svgW = LABEL_W + maxHours * HR_W + PAD * 2;
        const svgH = HEADER_H + ganttRows.length * ROW_H + PAD;

        // Collect visible sub-board connections + cross-phase connections (remapped to composite IDs)
        type GanttConn = { id: string; from: string; to: string; lag?: number; lagUnit?: string; loopDuration?: number; loopDurationUnit?: string; isSubConn?: boolean; };
        const ganttSubConns: GanttConn[] = [];
        for (const task of sortedGanttTasks) {
          if ((task.subBoard?.tasks?.length ?? 0) > 0 && expandedPhaseIds.has(task.id)) {
            for (const c of (task.subBoard!.connections ?? [])) {
              ganttSubConns.push({ ...c, id: `${task.id}:${c.id}`, from: `${task.id}:${c.from}`, to: `${task.id}:${c.to}`, isSubConn: true });
            }
          }
        }
        // Cross-phase task-level connections (show when both phases expanded)
        for (const c of connections) {
          if (!c.from.includes(':') || !c.to.includes(':')) continue;
          const fp = c.from.split(':')[0], tp = c.to.split(':')[0];
          if (expandedPhaseIds.has(fp) && expandedPhaseIds.has(tp)) {
            ganttSubConns.push({ ...c, isSubConn: true });
          }
        }
        // Also include crossConnections (e.g. manually-added phases like Meetings)
        for (const cc of (crossConnections ?? [])) {
          const fromId = `${cc.fromPhaseId}:${cc.fromTaskId}`;
          const toId = `${cc.toPhaseId}:${cc.toTaskId}`;
          if (expandedPhaseIds.has(cc.fromPhaseId) && expandedPhaseIds.has(cc.toPhaseId)) {
            if (!ganttSubConns.some((gc) => gc.from === fromId && gc.to === toId)) {
              ganttSubConns.push({ id: cc.id, from: fromId, to: toId, isSubConn: true });
            }
          }
        }

        const GANTT_COLORS: Record<string, string> = {
          amber: "#fbbf24", sky: "#38bdf8", rose: "#fb7185",
          emerald: "#34d399", violet: "#a78bfa", zinc: "#a1a1aa",
          orange: "#fb923c", teal: "#2dd4bf", indigo: "#818cf8",
          mint: "#86efac",
        };

        // Row index by id (for dependency arrows)
        const rowIndex = new Map(ganttRows.map((r, i) => [r.id, i]));
        const svgTimeW = maxHours * HR_W + PAD * 2; // width of the scrollable time area

        // Build tick marks: every 8h = 1 day; also every 1h if total ≤ 24h
        const dayTicks: number[] = [];
        for (let h = 0; h <= maxHours; h += HOURS_PER_DAY) dayTicks.push(h);
        const showHourTicks = maxHours <= 48;

        // ── Arrow routing ─────────────────────────────────────────────────
        // Rules:
        // 1. Arrow enters target bar always from LEFT
        // 2. Avoid crossing SOURCE and TARGET bars (intermediate bars OK)
        // 3. Adjacent parallel lines spaced apart
        // 4. Arrow color = target task color; same-color arrows may overlap, different colors are separated
        type _ArrowR = { id: string; from: string; to: string; path: string; color: string; marker: string; w: number; dash?: string; lagLabel?: { text: string; x: number; y: number; color: string }; };

        const _BAR_PAD = 6;
        const _CHAN_SPC = 8;
        const _usedArrowColors = new Set<string>();

        // Bar pixel extents per gantt row
        const _barPx = ganttRows.map((r) => ({
          l: r.absoluteES * HR_W + 2,
          r: r.absoluteEF * HR_W - 2,
        }));

        // Channel overlap tracking — prevents parallel vertical segments (same color may share)
        const _usedV: { x: number; minR: number; maxR: number; color?: string }[] = [];

        /** Find vertical channel searching RIGHT.
         *  barRows: only these rows are checked for bar collision (source + target).
         *  minR/maxR: full row range for channel overlap prevention.
         *  color: arrow color — same color may share channels. */
        const _findChanRight = (startX: number, barRows: number[], minR: number, maxR: number, color?: string): number => {
          let x = startX;
          for (let pass = 0; pass < 80; pass++) {
            let blocked = false;
            for (const r of barRows) {
              if (x >= _barPx[r].l - _BAR_PAD && x <= _barPx[r].r + _BAR_PAD) {
                x = _barPx[r].r + _BAR_PAD + 4;
                blocked = true; break;
              }
            }
            if (blocked) continue;
            const ov = _usedV.find((ch) => Math.abs(ch.x - x) < _CHAN_SPC && ch.minR <= maxR && ch.maxR >= minR && ch.color !== color);
            if (ov) { x = ov.x + _CHAN_SPC; continue; }
            break;
          }
          _usedV.push({ x, minR, maxR, color });
          return x;
        };

        /** Find vertical channel searching LEFT.
         *  barRows: only these rows are checked for bar collision.
         *  minR/maxR: full row range for channel overlap prevention.
         *  color: arrow color — same color may share channels. */
        const _findChanLeft = (startX: number, barRows: number[], minR: number, maxR: number, color?: string): number => {
          let x = startX;
          for (let pass = 0; pass < 80; pass++) {
            let blocked = false;
            for (const r of barRows) {
              if (x >= _barPx[r].l - _BAR_PAD && x <= _barPx[r].r + _BAR_PAD) {
                x = _barPx[r].l - _BAR_PAD - 4;
                blocked = true; break;
              }
            }
            if (blocked) { if (x < 4) break; continue; }
            const ov = _usedV.find((ch) => Math.abs(ch.x - x) < _CHAN_SPC && ch.minR <= maxR && ch.maxR >= minR && ch.color !== color);
            if (ov) { x -= _CHAN_SPC; if (x < 4) break; continue; }
            break;
          }
          x = Math.max(x, 4);
          _usedV.push({ x, minR, maxR, color });
          return x;
        };

        /** Route forward arrow from row fi → row ti.
         *  3-segment for forward deps, 4-segment for overlaps.
         *  color: used for channel sharing (same color may overlap). */
        const _routeFwd = (fi: number, ti: number, color?: string): string => {
          const srcX = _barPx[fi].r + 2;
          const dstX = _barPx[ti].l - 2;
          const srcY = HEADER_H + fi * ROW_H + ROW_H / 2;
          const dstY = HEADER_H + ti * ROW_H + ROW_H / 2;

          if (fi === ti) return `M ${srcX},${srcY} H ${dstX}`;

          const minR = Math.min(fi, ti), maxR = Math.max(fi, ti);
          const goDown = fi < ti;

          // Forward: target starts clearly after source ends → 3-segment
          if (dstX > srcX + 8) {
            // Only check SOURCE bar for collision — vertical is left of target bar
            let chanX = _findChanRight(srcX + 4, [fi], minR, maxR, color);
            // Clamp: keep vertical between source and target
            if (chanX > dstX - 4) {
              _usedV.pop();
              chanX = (srcX + dstX) / 2;
              _usedV.push({ x: chanX, minR, maxR, color });
            }
            return `M ${srcX},${srcY} H ${chanX} V ${dstY} H ${dstX}`;
          }

          // Overlap/tight: 4-segment approach from left of target only
          // vertical drop → gutter → approach left of target → right into target
          const gutterY = goDown
            ? HEADER_H + (fi + 1) * ROW_H - 2
            : HEADER_H + fi * ROW_H + 2;
          const approachX = _findChanLeft(dstX - 8, [ti], minR, maxR, color);
          return `M ${srcX},${srcY} V ${gutterY} H ${approachX} V ${dstY} H ${dstX}`;
        };

        // ── Build arrow routes ──
        // Phase-level arrows: HIDE when either endpoint's PHASE is expanded
        const _expandedIds = expandedPhaseIds;
        const _phaseOf = (id: string) => id.includes(':') ? id.split(':')[0] : id;
        const _fwdRoutes: _ArrowR[] = [];
        for (const c of forwardConnections) {
          // Skip connections when their phase is expanded (subtask arrows replace them)
          if (_expandedIds.has(_phaseOf(c.from)) || _expandedIds.has(_phaseOf(c.to))) continue;
          const fi = rowIndex.get(c.from), ti = rowIndex.get(c.to);
          if (fi === undefined || ti === undefined) continue;
          const isLoop = cycleEdgeIds.has(c.id);
          const targetColor = GANTT_COLORS[ganttRows[ti].color] ?? "#a1a1aa";
          const arrowColor = isLoop ? "#8b5cf6" : targetColor;
          _usedArrowColors.add(arrowColor);
          const lagH = lagToHours(c.lag, c.lagUnit);
          const srcX = _barPx[fi].r + 2;
          const srcY = HEADER_H + fi * ROW_H + ROW_H / 2;
          const markerId = `gantt-arr-${arrowColor.replace('#', '')}`;
          _fwdRoutes.push({
            id: c.id, from: c.from, to: c.to,
            path: _routeFwd(fi, ti, arrowColor),
            color: arrowColor,
            marker: isLoop ? "url(#gantt-arrow-loop)" : `url(#${markerId})`,
            w: 1.4,
            dash: isLoop ? "5 3" : undefined,
            lagLabel: lagH > 0 ? { text: `+${fmtDuration(lagH)}`, x: srcX + 4, y: srcY - 4, color: arrowColor } : undefined,
          });
        }

        const _subRoutes: _ArrowR[] = [];
        const _loopRoutes: { id: string; path: string; label: string; labelX: number; labelY: number }[] = [];
        for (const c of ganttSubConns) {
          const fi = rowIndex.get(c.from), ti = rowIndex.get(c.to);
          if (fi === undefined || ti === undefined) continue;
          const srcY = HEADER_H + fi * ROW_H + ROW_H / 2;
          if (c.loopDuration !== undefined) {
            const srcX = _barPx[fi].r + 2;
            const dstCX = (_barPx[ti].l + _barPx[ti].r) / 2;
            const bottomY = HEADER_H + (Math.max(fi, ti) + 1) * ROW_H + 4;
            const dstYL = HEADER_H + ti * ROW_H + ROW_H - 6;
            _loopRoutes.push({
              id: c.id,
              path: `M ${srcX},${srcY} H ${srcX + 14} V ${bottomY} H ${dstCX} V ${dstYL}`,
              label: `↺ ${fmtDuration(toHours(c.loopDuration, (c.loopDurationUnit ?? "h") as "h" | "d"))}`,
              labelX: (srcX + 14 + dstCX) / 2,
              labelY: bottomY + 10,
            });
            continue;
          }
          const lagH = lagToHours(c.lag, c.lagUnit as "h" | "d" | undefined);
          const srcX = _barPx[fi].r + 2;
          const subTargetColor = GANTT_COLORS[ganttRows[ti].color] ?? "#a1a1aa";
          _usedArrowColors.add(subTargetColor);
          const subMarkerId = `gantt-arr-${subTargetColor.replace('#', '')}`;
          _subRoutes.push({
            id: c.id, from: c.from, to: c.to,
            path: _routeFwd(fi, ti, subTargetColor),
            color: subTargetColor, marker: `url(#${subMarkerId})`, w: 1,
            lagLabel: lagH > 0 ? { text: `+${fmtDuration(lagH)}`, x: srcX + 4, y: srcY - 4, color: subTargetColor } : undefined,
          });
        }

        // ── Loop Zone indicators (semi-transparent band showing iterative cycle span) ──
        type _LoopZone = { id: string; x: number; w: number; y: number; h: number; color: string; label: string };
        const _loopZones: _LoopZone[] = [];
        // Phase-level back edges
        for (const c of connections) {
          if (!backEdgeIds.has(c.id) || !c.loopDuration) continue;
          const ti = rowIndex.get(c.to), fi = rowIndex.get(c.from);
          if (ti === undefined || fi === undefined) continue;
          const entryES = ganttRows[ti].absoluteES;
          const loopH = toHours(c.loopDuration, c.loopDurationUnit ?? "h");
          const minRow = Math.min(ti, fi), maxRow = Math.max(ti, fi);
          _loopZones.push({ id: c.id, x: entryES * HR_W, w: loopH * HR_W, y: HEADER_H + minRow * ROW_H, h: (maxRow - minRow + 1) * ROW_H, color: GANTT_COLORS[ganttRows[ti].color] ?? "#a1a1aa", label: `↺ ${fmtDuration(loopH)}` });
        }
        // Sub-task level back edges
        for (const c of ganttSubConns) {
          if (c.loopDuration === undefined) continue;
          const ti = rowIndex.get(c.to), fi = rowIndex.get(c.from);
          if (ti === undefined || fi === undefined) continue;
          const entryES = ganttRows[ti].absoluteES;
          const loopH = toHours(c.loopDuration, (c.loopDurationUnit ?? "h") as "h" | "d");
          const minRow = Math.min(ti, fi), maxRow = Math.max(ti, fi);
          _loopZones.push({ id: c.id, x: entryES * HR_W, w: loopH * HR_W, y: HEADER_H + minRow * ROW_H, h: (maxRow - minRow + 1) * ROW_H, color: GANTT_COLORS[ganttRows[ti].color] ?? "#a1a1aa", label: `↺ ${fmtDuration(loopH)}` });
        }

        // ── Selection highlight sets ──
        const _selId = ganttSelectedRowId;
        const _selArrowIds = new Set<string>();
        const _selRelatedRowIds = new Set<string>();
        if (_selId) {
          _selRelatedRowIds.add(_selId);
          const allRoutes = [..._fwdRoutes, ..._subRoutes];
          for (const r of allRoutes) {
            if (r.from === _selId || r.to === _selId) {
              _selArrowIds.add(r.id);
              _selRelatedRowIds.add(r.from);
              _selRelatedRowIds.add(r.to);
            }
          }
          // Also check back-edge / loop connections
          for (const c of connections.filter((c) => backEdgeIds.has(c.id))) {
            if (c.from === _selId || c.to === _selId) {
              _selArrowIds.add(c.id);
              _selRelatedRowIds.add(c.from);
              _selRelatedRowIds.add(c.to);
            }
          }
          for (const r of _loopRoutes) {
            // loop routes use the same id scheme
            const lc = ganttSubConns.find((c) => c.id === r.id);
            if (lc && (lc.from === _selId || lc.to === _selId)) {
              _selArrowIds.add(r.id);
              _selRelatedRowIds.add(lc.from);
              _selRelatedRowIds.add(lc.to);
            }
          }
        }
        const _hasSel = _selId !== null;

        const ganttChart = (
          <div className="rounded-xl border border-zinc-100 bg-white shadow-sm" style={{ display: 'flex', overflow: 'hidden' }}>
            {/* Sticky label column */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, borderRight: '1px solid #e4e4e7', background: '#fff', zIndex: 2 }}>
              <svg width={LABEL_W} height={svgH} className="block font-sans text-xs" style={{ display: 'block' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top - HEADER_H;
                  if (y < 0) { setGanttHoverRowIdx(null); setGanttInsertHoverIdx(null); return; }
                  const rowIdx = Math.floor(y / ROW_H);
                  const yInRow = y - rowIdx * ROW_H;
                  if (rowIdx < 0 || rowIdx >= ganttRows.length) { setGanttHoverRowIdx(null); setGanttInsertHoverIdx(null); return; }
                  setGanttHoverRowIdx(rowIdx);
                  if (yInRow > ROW_H - 7 && rowIdx < ganttRows.length - 1) {
                    setGanttInsertHoverIdx(rowIdx);
                  } else if (yInRow < 7 && rowIdx > 0) {
                    setGanttInsertHoverIdx(rowIdx - 1);
                  } else {
                    setGanttInsertHoverIdx(null);
                  }
                }}
                onMouseLeave={() => { setGanttHoverRowIdx(null); setGanttInsertHoverIdx(null); }}
              >
                <defs>
                  <clipPath id="label-clip">
                    <rect x={0} y={0} width={LABEL_W - 6} height={svgH} />
                  </clipPath>
                </defs>
                {/* Row backgrounds for label column */}
                {ganttRows.map((r, i) => {
                  const isPhase = r.indent === 0;
                  const isSelRow = _hasSel && _selRelatedRowIds.has(r.id);
                  const isSelPrimary = _selId === r.id;
                  const bg = isSelPrimary ? '#dbeafe' : isSelRow ? '#eff6ff' : isPhase ? (i % 2 === 0 ? '#f4f4f6' : '#ebebed') : (i % 2 === 0 ? '#fafafa' : '#f3f3f5');
                  return (
                    <g key={r.id + '-lbg'} style={{ cursor: 'pointer' }} onClick={() => setGanttSelectedRowId(r.id === _selId ? null : r.id)}>
                      <rect x={0} y={HEADER_H + i * ROW_H} width={LABEL_W} height={ROW_H} fill={bg} />
                      <line x1={0} y1={HEADER_H + (i + 1) * ROW_H} x2={LABEL_W} y2={HEADER_H + (i + 1) * ROW_H} stroke={isPhase ? '#d4d4d8' : '#e8e8ea'} strokeWidth={1} />
                    </g>
                  );
                })}
                {/* Indent lines and expand toggles */}
                {ganttRows.map((row, i) => {
                  const labelX = row.indent > 0 ? 20 : row.hasSubTasks ? 18 : 8;
                  const labelY = HEADER_H + i * ROW_H;
                  const isEditing = ganttEditId === row.id;
                  return (
                  <g key={row.id + '-lbl'}>
                    {row.indent > 0 && (
                      <line x1={12} y1={HEADER_H + (i - 0.5) * ROW_H} x2={12} y2={HEADER_H + i * ROW_H + ROW_H / 2} stroke="#d4d4d8" strokeWidth={1} />
                    )}
                    {row.hasSubTasks && (
                      <g style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedPhaseIds((prev) => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}>
                        <rect x={0} y={HEADER_H + i * ROW_H} width={22} height={ROW_H} fill="transparent" />
                        <text x={6} y={HEADER_H + i * ROW_H + ROW_H / 2 + 4} fill="#a1a1aa" fontSize={9} className="select-none">
                          {expandedPhaseIds.has(row.id) ? '▼' : '▶'}
                        </text>
                      </g>
                    )}
                    {isEditing ? (
                      <foreignObject x={labelX} y={labelY + 4} width={LABEL_W - labelX - 4} height={ROW_H - 8}>
                        <input
                          autoFocus
                          value={ganttEditTitle}
                          onChange={(e) => setGanttEditTitle(e.target.value)}
                          onBlur={() => { ganttUpdateTask(row.id, (t) => ({ ...t, title: ganttEditTitle })); setGanttEditId(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { ganttUpdateTask(row.id, (t) => ({ ...t, title: ganttEditTitle })); setGanttEditId(null); } if (e.key === 'Escape') setGanttEditId(null); }}
                          style={{ width: '100%', height: '100%', border: '1px solid #3b82f6', borderRadius: 3, padding: '0 4px', fontSize: row.indent > 0 ? 10 : 11, fontWeight: row.indent > 0 ? 400 : 600, outline: 'none', background: '#fff' }}
                        />
                      </foreignObject>
                    ) : (
                      <text
                        x={labelX}
                        y={HEADER_H + i * ROW_H + ROW_H / 2 + 4}
                        fill={row.isCritical ? '#c2410c' : row.indent > 0 ? '#52525b' : '#3f3f46'}
                        fontSize={row.indent > 0 ? 10 : 11}
                        fontWeight={row.isCritical ? '700' : row.indent > 0 ? '400' : '600'}
                        clipPath="url(#label-clip)"
                        className="select-none"
                        style={{ cursor: 'text' }}
                        onDoubleClick={() => { setGanttEditId(row.id); setGanttEditTitle(row.title); }}
                        onMouseEnter={(e) => {
                          if (ganttDescHideTimer.current) clearTimeout(ganttDescHideTimer.current);
                          const rect = (e.target as SVGTextElement).getBoundingClientRect();
                          setGanttDescPopover({ rowId: row.id, x: rect.left, y: rect.bottom + 4 });
                        }}
                        onMouseLeave={() => {
                          ganttDescHideTimer.current = setTimeout(() => {
                            setGanttDescPopover((prev) => prev?.rowId === row.id ? null : prev);
                            setGanttDescEditId((prev) => prev === row.id ? null : prev);
                          }, 250);
                        }}
                      >
                        {row.isCritical && row.indent === 0 ? '● ' : ''}{row.title}
                      </text>
                    )}
                    {/* Assignee badge */}
                    {row.assignee && (
                      <g>
                        <circle cx={LABEL_W - 42} cy={HEADER_H + i * ROW_H + ROW_H / 2} r={7} fill="#818cf8" opacity={0.9} />
                        <text x={LABEL_W - 42} y={HEADER_H + i * ROW_H + ROW_H / 2 + 3.5} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="700" className="select-none">
                          {row.assignee.substring(0, 2).toUpperCase()}
                        </text>
                      </g>
                    )}
                  </g>
                  );
                })}
                {/* Header */}
                <line x1={0} y1={HEADER_H} x2={LABEL_W} y2={HEADER_H} stroke="#e4e4e7" strokeWidth={1} />
                <text x={8} y={HEADER_H - 12} fill="#a1a1aa" fontSize={10} fontWeight="600">TASK</text>

                {/* Gear icon on row hover — navigate to board (positioned left of expand arrow) */}
                {ganttHoverRowIdx !== null && ganttHoverRowIdx >= 0 && ganttHoverRowIdx < ganttRows.length && (() => {
                  const i = ganttHoverRowIdx;
                  const row = ganttRows[i];
                  const cy = HEADER_H + i * ROW_H + ROW_H / 2;
                  // Only show for rows that have an associated board to navigate to
                  const canNavigate = row.indent === 0 ? row.hasSubTasks : true;
                  if (!canNavigate) return null;
                  return (
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (row.id.includes(':')) {
                          const phaseId = row.id.split(':')[0];
                          const phase = tasks.find(t => t.id === phaseId);
                          if (phase && onDrillIn) {
                            setGanttFullscreen(false);
                            onDrillIn(phase.id, phase.title, true);
                          }
                        } else if (onDrillIn) {
                          setGanttFullscreen(false);
                          onDrillIn(row.id, row.title, true);
                        }
                      }}
                      title="Ins Board springen"
                    >
                      <rect x={LABEL_W - 22} y={cy - 8} width={16} height={16} rx={3} fill="#f4f4f5" stroke="#d4d4d8" strokeWidth={0.5} />
                      <g transform={`translate(${LABEL_W - 19}, ${cy - 5}) scale(0.625)`}>
                        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="none" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round"/>
                      </g>
                    </g>
                  );
                })()}

                {/* "+" insert zone between rows */}
                {ganttInsertHoverIdx !== null && ganttInsertHoverIdx >= 0 && ganttInsertHoverIdx < ganttRows.length - 1 && (() => {
                  const insertY = HEADER_H + (ganttInsertHoverIdx + 1) * ROW_H;
                  const insertAfterIdx = ganttInsertHoverIdx;
                  return (
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Determine context: insert a new task between row[insertAfterIdx] and row[insertAfterIdx+1]
                        const rowAbove = ganttRows[insertAfterIdx];
                        const rowBelow = ganttRows[insertAfterIdx + 1];
                        const newTaskId = `gt-${Date.now()}`;

                        if (rowAbove.indent === 1) {
                          // Subtask context: insert in same phase after this subtask
                          const [phaseId, aboveSubId] = rowAbove.id.split(':');
                          const belowInSamePhase = rowBelow?.indent === 1 && rowBelow.id.startsWith(phaseId + ':');
                          const belowSubId = belowInSamePhase ? rowBelow.id.split(':')[1] : null;
                          setTasks(prev => prev.map(t => {
                            if (t.id !== phaseId || !t.subBoard) return t;
                            const newTask: TaskCard = { id: newTaskId, title: 'Neuer Task', color: t.color, x: 0, y: 0, duration: 4, unit: 'h' };
                            const newConns = [...t.subBoard.connections];
                            newConns.push({ id: `gc-${Date.now()}`, from: aboveSubId, to: newTaskId });
                            if (belowSubId) {
                              const existIdx = newConns.findIndex(c => c.from === aboveSubId && c.to === belowSubId);
                              if (existIdx >= 0) newConns.splice(existIdx, 1);
                              newConns.push({ id: `gc-${Date.now() + 1}`, from: newTaskId, to: belowSubId });
                            }
                            return { ...t, subBoard: { ...t.subBoard, tasks: [...t.subBoard.tasks, newTask], connections: newConns } };
                          }));
                        } else if (rowAbove.indent === 0 && rowBelow?.indent === 1 && rowBelow.id.startsWith(rowAbove.id + ':')) {
                          // Phase header → first subtask: insert at beginning of phase
                          const phaseId = rowAbove.id;
                          const belowSubId = rowBelow.id.split(':')[1];
                          setTasks(prev => prev.map(t => {
                            if (t.id !== phaseId || !t.subBoard) return t;
                            const newTask: TaskCard = { id: newTaskId, title: 'Neuer Task', color: t.color, x: 0, y: 0, duration: 4, unit: 'h' };
                            const newConns = [...t.subBoard.connections];
                            newConns.push({ id: `gc-${Date.now()}`, from: newTaskId, to: belowSubId });
                            return { ...t, subBoard: { ...t.subBoard, tasks: [newTask, ...t.subBoard.tasks], connections: newConns } };
                          }));
                        } else {
                          // Root level: insert new phase-level task
                          const newTask: TaskCard = { id: newTaskId, title: 'Neue Phase', color: 'sky' as ColorToken, x: 0, y: 0, duration: 8, unit: 'h' };
                          setTasks(prev => {
                            const idx = prev.findIndex(t => t.id === rowAbove.id);
                            const updated = [...prev];
                            updated.splice(idx + 1, 0, newTask);
                            return updated;
                          });
                        }
                        setGanttInsertHoverIdx(null);
                      }}
                    >
                      {/* Horizontal line */}
                      <line x1={20} y1={insertY} x2={LABEL_W - 4} y2={insertY} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                      {/* Circle with + */}
                      <circle cx={12} cy={insertY} r={8} fill="#3b82f6" />
                      <text x={12} y={insertY + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="700" className="select-none">+</text>
                    </g>
                  );
                })()}
              </svg>
            </div>
            {/* Scrollable time area */}
            <div style={{ overflowX: 'auto', flex: 1 }}>
            <svg
              width={svgTimeW}
              height={svgH}
              className="block font-sans text-xs"
              style={{ minWidth: svgTimeW }}
              onClick={(e) => { if (e.target === e.currentTarget) setGanttSelectedRowId(null); }}
            >
              {/* Deselect background rect */}
              <rect x={0} y={0} width={svgTimeW} height={svgH} fill="transparent" onClick={() => setGanttSelectedRowId(null)} />
              {/* Row backgrounds */}
              {ganttRows.map((r, i) => {
                const isPhase = r.indent === 0;
                const isSelRow = _hasSel && _selRelatedRowIds.has(r.id);
                const isSelPrimary = _selId === r.id;
                const bg = isSelPrimary ? '#dbeafe' : isSelRow ? '#eff6ff' : isPhase ? (i % 2 === 0 ? '#f4f4f6' : '#ebebed') : (i % 2 === 0 ? '#fafafa' : '#f3f3f5');
                return (
                  <g key={r.id + "-bg"}>
                    <rect x={0} y={HEADER_H + i * ROW_H} width={svgTimeW} height={ROW_H} fill={bg} />
                    <line x1={0} y1={HEADER_H + (i + 1) * ROW_H} x2={svgTimeW} y2={HEADER_H + (i + 1) * ROW_H} stroke={isPhase ? '#d4d4d8' : '#e8e8ea'} strokeWidth={1} />
                  </g>
                );
              })}

              {/* Day column shading (every other day) */}
              {dayTicks.map((h, di) =>
                di % 2 === 1 ? (
                  <rect
                    key={"dayshade-" + di}
                    x={h * HR_W}
                    y={HEADER_H}
                    width={Math.min(HOURS_PER_DAY * HR_W, (maxHours - h) * HR_W)}
                    height={ganttRows.length * ROW_H}
                    fill="rgba(0,0,0,0.018)"
                  />
                ) : null
              )}

              {/* Loop zone indicators — semi-transparent band behind loop body rows */}
              {_loopZones.map((z) => (
                <g key={`lz-${z.id}`}>
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={z.color} opacity={0.06} rx={4} />
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="none" stroke={z.color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.25} rx={4} />
                  {/* Right-edge milestone line extending below the loop to show where post-loop tasks start */}
                  <line x1={z.x + z.w} y1={z.y} x2={z.x + z.w} y2={z.y + z.h + ROW_H} stroke={z.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />
                </g>
              ))}

              {/* Hour grid lines (light) + day lines (medium) */}
              {showHourTicks && Array.from({ length: maxHours + 1 }, (_, h) => (
                h % HOURS_PER_DAY !== 0 && (
                  <line
                    key={"hline-" + h}
                    x1={h * HR_W} y1={HEADER_H}
                    x2={h * HR_W} y2={svgH - PAD}
                    stroke="#f0f0f2" strokeWidth={1}
                  />
                )
              ))}
              {dayTicks.map((h) => (
                <line
                  key={"dline-" + h}
                  x1={h * HR_W} y1={HEADER_H - 10}
                  x2={h * HR_W} y2={svgH - PAD}
                  stroke="#e4e4e7" strokeWidth={1}
                />
              ))}

              {/* Day headers */}
              {dayTicks.map((h, di) => {
                const next = dayTicks[di + 1] ?? maxHours;
                return (
                  <text
                    key={"dlabel-" + di}
                    x={h * HR_W + (next - h) * HR_W / 2}
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
                    x={h * HR_W}
                    y={HEADER_H - 6}
                    textAnchor="middle"
                    fill="#d4d4d8"
                    fontSize={8}
                  >
                    {h % HOURS_PER_DAY}h
                  </text>
                )
              ))}

              {/* Arrow markers — per-color for target-colored arrows */}
              <defs>
                <marker id="gantt-arrow-loop" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#8b5cf6" />
                </marker>
                {Array.from(_usedArrowColors).map((clr) => (
                  <marker key={clr} id={`gantt-arr-${clr.replace('#', '')}`} markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                    <polygon points="0 0, 6 2.5, 0 5" fill={clr} />
                  </marker>
                ))}
              </defs>

              {/* Back-edge loop arrows — routed from source bar end → right gutter → target bar end */}
              {connections.filter((c) => backEdgeIds.has(c.id)).map((c) => {
                const fi = rowIndex.get(c.from);
                const ti = rowIndex.get(c.to);
                if (fi === undefined || ti === undefined) return null;
                const fromRow = ganttRows[fi];
                const toRow   = ganttRows[ti];
                const ELBOW   = 14;
                const srcX    = fromRow.absoluteEF * HR_W;
                const dstX    = (toRow.absoluteES + toRow.absoluteEF) / 2 * HR_W;  // center of target bar
                const srcY    = HEADER_H + fi * ROW_H + ROW_H / 2;
                const dstY    = HEADER_H + ti * ROW_H + ROW_H - 6; // bottom-center of target bar
                const bottomY = HEADER_H + (Math.max(fi, ti) + 1) * ROW_H;
                const arrowPath = `M ${srcX},${srcY} H ${srcX + ELBOW} V ${bottomY} H ${dstX} V ${dstY}`;
                const loopLabel = c.loopDuration
                  ? `↺ ${fmtDuration(toHours(c.loopDuration, c.loopDurationUnit ?? "h"))}`
                  : "↺";
                const labelX = (srcX + ELBOW + dstX) / 2;
                const beHit = _hasSel && _selArrowIds.has(c.id);
                const beOp = _hasSel ? (beHit ? 1 : 0.12) : 1;
                return (
                  <g key={c.id} opacity={beOp}>
                    <path d={arrowPath} fill="none" stroke="#8b5cf6" strokeWidth={beHit ? 2.6 : 1.8}
                      strokeDasharray="5 3" strokeLinejoin="round"
                      markerEnd="url(#gantt-arrow-loop)" />
                    <text x={labelX} y={bottomY - 3} textAnchor="middle" fill="#8b5cf6" fontSize={9} fontWeight="700" className="select-none">
                      {loopLabel}
                    </text>
                  </g>
                );
              })}

              {/* Dependency arrows — pre-computed routes (bar-free) */}
              {_fwdRoutes.map((r) => {
                const hit = _hasSel && _selArrowIds.has(r.id);
                const op = _hasSel ? (hit ? 1 : 0.12) : 1;
                return (
                  <g key={r.id} opacity={op}>
                    {r.lagLabel && (
                      <text x={r.lagLabel.x} y={r.lagLabel.y} fill={r.lagLabel.color} fontSize={8} fontWeight="600">
                        {r.lagLabel.text}
                      </text>
                    )}
                    <path d={r.path} fill="none" stroke={r.color} strokeWidth={hit ? r.w + 1.2 : r.w}
                      strokeDasharray={r.dash} strokeLinejoin="round" markerEnd={r.marker} />
                  </g>
                );
              })}

              {/* Sub-board loop arrows (iterative flows — exempt from bar-free rule) */}
              {_loopRoutes.map((r) => {
                const hit = _hasSel && _selArrowIds.has(r.id);
                const op = _hasSel ? (hit ? 1 : 0.12) : 1;
                return (
                  <g key={r.id} opacity={op}>
                    <path d={r.path} fill="none" stroke="#8b5cf6" strokeWidth={hit ? 2.6 : 1.8}
                      strokeDasharray="5 3" strokeLinejoin="round"
                      markerEnd="url(#gantt-arrow-loop)" />
                    <text x={r.labelX} y={r.labelY} textAnchor="middle" fill="#8b5cf6" fontSize={9} fontWeight="700" className="select-none">
                      {r.label}
                    </text>
                  </g>
                );
              })}
              {/* Sub-board forward arrows — bar-free */}
              {_subRoutes.map((r) => {
                const hit = _hasSel && _selArrowIds.has(r.id);
                const op = _hasSel ? (hit ? 1 : 0.12) : 1;
                return (
                  <g key={r.id} opacity={op}>
                    {r.lagLabel && (
                      <text x={r.lagLabel.x} y={r.lagLabel.y} fill={r.lagLabel.color} fontSize={8} fontWeight="600">{r.lagLabel.text}</text>
                    )}
                    <path d={r.path} fill="none" stroke={r.color} strokeWidth={hit ? r.w + 1 : r.w} strokeLinejoin="round" markerEnd={r.marker} />
                  </g>
                );
              })}

              {/* Bars — draggable + double-click to edit duration */}
              {ganttRows.map((row, i) => {
                const barX = row.absoluteES * HR_W + 2;
                const barW = Math.max((row.absoluteEF - row.absoluteES) * HR_W - 4, 4);
                const barY = HEADER_H + i * ROW_H + 6;
                const barH = ROW_H - 12;
                const col = GANTT_COLORS[row.color] ?? "#a1a1aa";
                const durH = row.hasSubTasks ? (row.absoluteEF - row.absoluteES) : toHours(row.duration, row.unit);
                const iters = Math.max(1, row.iterations ?? 1);
                const singleBarW = iters > 1 ? Math.max((barW - (iters - 1) * 3) / iters, 2) : barW;
                const isDraggable = !row.hasSubTasks; // phases auto-derive from subtasks
                const isDurEditing = ganttEditDurId === row.id;

                const handleBarPointerDown = isDraggable ? (e: React.PointerEvent<SVGRectElement>) => {
                  e.stopPropagation();
                  (e.target as SVGRectElement).setPointerCapture(e.pointerId);
                  ganttDragRef.current = { rowId: row.id, startX: e.clientX, origES: row.absoluteES };
                } : undefined;

                const handleBarPointerMove = isDraggable ? (e: React.PointerEvent<SVGRectElement>) => {
                  const drag = ganttDragRef.current;
                  if (!drag || drag.rowId !== row.id) return;
                  const dx = e.clientX - drag.startX;
                  const dh = Math.round((dx / HR_W) * 2) / 2; // snap to 0.5h
                  const newES = Math.max(0, drag.origES + dh);
                  // Update the task duration stays the same, but we add/remove lag on incoming connections
                  // For simplicity: shift by adjusting the task's lag on its first incoming connection
                  // Actually — we store the shift as a "ganttOffset" or adjust lag. Simplest: update the lag.
                  // But for subtasks within a phase, the position is determined by CPM, not manually.
                  // So for now: only allow drag for tasks that have NO predecessors (start tasks) or adjust lag.
                } : undefined;

                const handleBarPointerUp = isDraggable ? (e: React.PointerEvent<SVGRectElement>) => {
                  const drag = ganttDragRef.current;
                  if (!drag || drag.rowId !== row.id) return;
                  ganttDragRef.current = null;
                  (e.target as SVGRectElement).releasePointerCapture(e.pointerId);
                  const dx = e.clientX - drag.startX;
                  const dh = Math.round((dx / HR_W) * 2) / 2;
                  if (dh === 0) return;
                  // Apply shift: adjust lag on incoming connections
                  const rowId = row.id;
                  if (rowId.includes(':')) {
                    // Subtask: find the parent phase's subBoard connection targeting this task
                    const [phaseId, subId] = rowId.split(':');
                    setTasks((prev) => prev.map((t) => {
                      if (t.id !== phaseId || !t.subBoard) return t;
                      const updConns = t.subBoard.connections.map((c) => {
                        if (c.to !== subId) return c;
                        const oldLag = c.lag ?? 0;
                        return { ...c, lag: Math.max(0, oldLag + dh), lagUnit: c.lagUnit ?? 'h' };
                      });
                      return { ...t, subBoard: { ...t.subBoard, connections: updConns } };
                    }));
                  } else {
                    // Root task: adjust lag on root connections
                    setConnections((prev) => prev.map((c) => {
                      if (c.to !== rowId) return c;
                      const oldLag = c.lag ?? 0;
                      return { ...c, lag: Math.max(0, oldLag + dh), lagUnit: c.lagUnit ?? 'h' };
                    }));
                  }
                } : undefined;

                const canEditDur = !row.hasSubTasks; // phases auto-calculated
                const commitDuration = () => {
                  const parsed = parseFloat(ganttEditDur);
                  if (!isNaN(parsed) && parsed > 0) {
                    ganttUpdateTask(row.id, (t) => ({ ...t, duration: parsed, unit: ganttEditUnit }));
                  }
                  setGanttEditDurId(null);
                };

                const isBarSelected = _selId === row.id;
                const isBarRelated = _hasSel && _selRelatedRowIds.has(row.id);
                const barDimFactor = _hasSel && !isBarRelated ? 0.15 : 1;
                const handleBarClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setGanttSelectedRowId(row.id === _selId ? null : row.id);
                };

                return (
                  <g key={row.id} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                    {isBarSelected && (
                      <rect x={barX - 2} y={barY - 2} width={barW + 4} height={barH + 4} rx={6} fill="none" stroke={col} strokeWidth={2} opacity={0.6} />
                    )}
                    {iters > 1 ? (
                      <>
                        {Array.from({ length: iters }, (_, si) => {
                          const segX = barX + si * (singleBarW + 3);
                          return (
                            <rect key={si} x={segX} y={barY} width={singleBarW} height={barH} rx={3}
                              fill={col} opacity={(row.isCritical ? 0.9 - si * 0.06 : 0.55 - si * 0.05) * barDimFactor}
                              style={isDraggable ? { cursor: 'grab' } : undefined}
                              onPointerDown={handleBarPointerDown} onPointerMove={handleBarPointerMove} onPointerUp={handleBarPointerUp} />
                          );
                        })}
                        {barW > 32 && (
                          <text x={barX + barW / 2} y={barY + barH / 2 + 4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="700"
                            className="select-none" style={{ pointerEvents: 'none' }}>
                            ↺ {iters}× {fmtDuration(durH)}
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        <rect x={barX} y={barY} width={barW} height={barH} rx={4} fill={col}
                          opacity={(row.isCritical ? 0.9 : row.indent > 0 ? 0.4 : 0.55) * barDimFactor}
                          style={isDraggable ? { cursor: 'grab' } : undefined}
                          onPointerDown={handleBarPointerDown} onPointerMove={handleBarPointerMove} onPointerUp={handleBarPointerUp} />
                        {isDurEditing && canEditDur ? (
                          <foreignObject x={barX} y={barY - 2} width={Math.max(barW, 90)} height={barH + 4}>
                            <div style={{ display: 'flex', height: '100%', gap: 2, alignItems: 'center' }}>
                              <input
                                autoFocus
                                value={ganttEditDur}
                                onChange={(e) => setGanttEditDur(e.target.value)}
                                onBlur={commitDuration}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitDuration(); if (e.key === 'Escape') setGanttEditDurId(null); }}
                                style={{ flex: 1, minWidth: 30, height: '100%', border: 'none', borderRadius: 3, padding: '0 3px', fontSize: 10, fontWeight: 600, textAlign: 'center', outline: '2px solid #3b82f6', background: 'rgba(255,255,255,0.95)', color: '#333' }}
                              />
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const newUnit = ganttEditUnit === 'h' ? 'd' : 'h';
                                  const cur = parseFloat(ganttEditDur) || 0;
                                  const converted = newUnit === 'd' ? Math.round((cur / 8) * 100) / 100 : Math.round(cur * 8 * 100) / 100;
                                  setGanttEditUnit(newUnit);
                                  setGanttEditDur(String(converted));
                                }}
                                style={{ height: '100%', padding: '0 4px', borderRadius: 3, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', fontSize: 9, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                {ganttEditUnit}
                              </button>
                            </div>
                          </foreignObject>
                        ) : barW > 24 ? (
                          <text x={barX + barW / 2} y={barY + barH / 2 + 4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="600"
                            className="select-none" style={canEditDur ? { cursor: 'text' } : undefined}
                            onDoubleClick={canEditDur ? (e) => { e.stopPropagation(); setGanttEditDurId(row.id); setGanttEditDur(String(row.duration)); setGanttEditUnit(row.unit ?? 'h'); } : undefined}>
                            {fmtDuration(durH)}
                          </text>
                        ) : null}
                      </>
                    )}
                  </g>
                );
              })}

              {/* Header separator */}
              <line x1={0} y1={HEADER_H} x2={svgTimeW} y2={HEADER_H} stroke="#e4e4e7" strokeWidth={1} />
            </svg>
            </div>
            {/* Description popover (fixed position, unaffected by overflow) */}
            {ganttDescPopover && (() => {
              const hovRow = ganttRows.find((r) => r.id === ganttDescPopover.rowId);
              if (!hovRow) return null;
              const isEditing = ganttDescEditId === hovRow.id;
              const desc = hovRow.note || '';
              return (
                <div
                  style={{ position: 'fixed', left: ganttDescPopover.x, top: ganttDescPopover.y, zIndex: 1000, minWidth: 220, maxWidth: 380 }}
                  onMouseEnter={() => { if (ganttDescHideTimer.current) clearTimeout(ganttDescHideTimer.current); }}
                  onMouseLeave={() => { setGanttDescPopover(null); setGanttDescEditId(null); }}
                >
                  <div style={{ background: '#fff', border: '1px solid #d4d4d8', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '8px 10px', fontSize: 12, color: '#3f3f46' }}>
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={ganttDescEditText}
                        onChange={(e) => setGanttDescEditText(e.target.value)}
                        onBlur={() => {
                          ganttUpdateTask(hovRow.id, (t) => ({ ...t, note: ganttDescEditText || undefined }));
                          setGanttDescEditId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setGanttDescEditId(null); }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            ganttUpdateTask(hovRow.id, (t) => ({ ...t, note: ganttDescEditText || undefined }));
                            setGanttDescEditId(null);
                          }
                        }}
                        style={{ width: '100%', minHeight: 60, border: '1px solid #93c5fd', borderRadius: 4, padding: '4px 6px', fontSize: 12, lineHeight: 1.4, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                        placeholder="Beschreibung eingeben…"
                      />
                    ) : (
                      <div
                        onClick={() => { setGanttDescEditId(hovRow.id); setGanttDescEditText(desc); }}
                        style={{ cursor: 'text', whiteSpace: 'pre-wrap', lineHeight: 1.4, minHeight: 20, color: desc ? '#3f3f46' : '#a1a1aa' }}
                      >
                        {desc || 'Klicken um Beschreibung zu bearbeiten…'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );

        if (ganttFullscreen) {
          return (
            <div className="fixed inset-0 z-50 flex flex-col bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-700">Gantt — Vollansicht</span>
                  {tasks.some((t) => (t.subBoard?.tasks?.length ?? 0) > 0) && (
                    <button type="button"
                      onClick={() => {
                        const allWithSubs = tasks.filter((t) => (t.subBoard?.tasks?.length ?? 0) > 0).map((t) => t.id);
                        const allExpanded = allWithSubs.every((id) => expandedPhaseIds.has(id));
                        setExpandedPhaseIds(allExpanded ? new Set() : new Set(allWithSubs));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100"
                    >
                      {tasks.some((t) => expandedPhaseIds.has(t.id)) ? "⊟ Einklappen" : "⊞ Alle Tasks"}
                    </button>
                  )}
                  <button type="button"
                    onClick={() => setSoloMode((p) => !p)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${soloMode ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"}`}
                    title="Resource Leveling: Solo-Modus (nur 1 Person arbeitet)"
                  >
                    👤 Solo-Modus
                  </button>
                </div>
                <button type="button" onClick={() => setGanttFullscreen(false)}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100"
                >
                  ✕ Schliessen
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {ganttChart}
              </div>
            </div>
          );
        }

        return ganttChart;
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
                      const DOT_C: Record<string, string> = { amber: "#f59e0b", orange: "#f97316", emerald: "#10b981", teal: "#14b8a6", sky: "#0ea5e9", indigo: "#6366f1", rose: "#f43f5e", violet: "#8b5cf6", mint: "#22c55e" };
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
