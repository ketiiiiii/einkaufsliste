"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { TaskBoard, type BoardState, type CrossConnection, type VariantTab } from "./TaskBoard";
import { loadBoardState, saveBoardState } from "./board-actions";

type DrillStep = { taskId: string; title: string };

const DEFAULT_VARIANT_ID = "__default__";

// ─── Group Tree Types ─────────────────────────────────────────────────────────

export type PlanGroup = {
  id: string;
  name: string;
  boardState: BoardState;
  children: PlanGroup[];
  phasesEnabled?: boolean; // default true — if false, tasks are flat (no phase drill-in)
};

export type PlanProduct = {
  id: string;
  name: string;
  groups: PlanGroup[];
  activeGroupId: string | null;
};

type AppRootState = {
  products: PlanProduct[];
  activeProductId: string | null;
};

// ─── Variant Switcher ──────────────────────────────────────────────────────────

function VariantSwitcherBar({
  variantTabs,
  activeVariantId,
  onSwitch,
  onAdd,
  onDelete,
}: {
  variantTabs: VariantTab[];
  activeVariantId: string | null;
  onSwitch: (id: string) => void;
  onAdd: (label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    onAdd(label);
    setDraft("");
    setAdding(false);
  }

  const currentId = activeVariantId ?? DEFAULT_VARIANT_ID;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {variantTabs.map((tab) => {
        const isActive = tab.id === currentId;
        const isDefault = tab.id === DEFAULT_VARIANT_ID;
        return (
          <div key={tab.id} className="group relative flex items-center">
            <button
              type="button"
              onClick={() => onSwitch(tab.id)}
              className={`h-7 rounded-full px-3.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={() => onDelete(tab.id)}
                className="absolute -right-1.5 -top-1 hidden size-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] leading-none text-zinc-600 hover:bg-rose-400 hover:text-white group-hover:flex"
                title="Variante l\u00f6schen"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {adding ? (
        <form onSubmit={submitAdd} className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setDraft(""))}
            placeholder="Variantenname…"
            className="h-7 rounded-full border border-violet-300 bg-white px-3 text-xs font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-violet-400/50"
          />
          <button
            type="submit"
            className="flex h-7 items-center rounded-full bg-violet-600 px-2.5 text-xs font-bold text-white hover:bg-violet-700"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M2 5.2L4.2 7.5L8 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setDraft(""); }}
            className="flex h-7 items-center rounded-full border border-zinc-200 bg-white px-2 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
              <path d="M2 2l5 5M7 2L2 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-7 items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 text-xs font-semibold text-zinc-500 transition hover:border-violet-400 hover:text-violet-600"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Variante
        </button>
      )}
    </div>
  );
}

// ─── Board Path Helpers ──────────────────────────────────────────────────────

function getBoardAtPath(root: BoardState, path: DrillStep[]): BoardState {
  if (path.length === 0) return root;
  const task = root.tasks.find((t) => t.id === path[0].taskId);
  const sub = task?.subBoard ?? { tasks: [], connections: [] };
  return getBoardAtPath(sub, path.slice(1));
}

function updateBoardAtPath(root: BoardState, path: DrillStep[], newBoard: BoardState): BoardState {
  if (path.length === 0) return newBoard;
  return {
    ...root,
    tasks: root.tasks.map((t) =>
      t.id === path[0].taskId
        ? {
            ...t,
            subBoard: updateBoardAtPath(
              t.subBoard ?? { tasks: [], connections: [] },
              path.slice(1),
              newBoard
            ),
          }
        : t
    ),
  };
}

// ─── Group & Product Tree Helpers ────────────────────────────────────────────

function findGroup(groups: PlanGroup[], id: string | null): PlanGroup | null {
  if (!id) return null;
  for (const g of groups) {
    if (g.id === id) return g;
    const found = findGroup(g.children, id);
    if (found) return found;
  }
  return null;
}

function updateGroupIn(groups: PlanGroup[], id: string, fn: (g: PlanGroup) => PlanGroup): PlanGroup[] {
  return groups.map((g) =>
    g.id === id ? fn(g) : { ...g, children: updateGroupIn(g.children, id, fn) }
  );
}

function deleteGroupIn(groups: PlanGroup[], id: string): PlanGroup[] {
  return groups
    .filter((g) => g.id !== id)
    .map((g) => ({ ...g, children: deleteGroupIn(g.children, id) }));
}

function addChildToGroup(groups: PlanGroup[], parentId: string | null, child: PlanGroup): PlanGroup[] {
  if (!parentId) return [...groups, child];
  return groups.map((g) =>
    g.id === parentId
      ? { ...g, children: [...g.children, child] }
      : { ...g, children: addChildToGroup(g.children, parentId, child) }
  );
}

function firstGroupId(groups: PlanGroup[]): string | null {
  return groups.length === 0 ? null : groups[0].id;
}

function makeGroup(name: string): PlanGroup {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`;
  return { id, name, boardState: { tasks: [], connections: [] }, children: [], phasesEnabled: true };
}

// Migrate composite-ID connections from connections[] into crossConnections[] (single source of truth).
// This handles legacy data where cross-phase connections were stored in both places.
function migrateBoardCrossConnections(board: BoardState): BoardState {
  const compositeConns = board.connections.filter(
    (c) => c.from.includes(":") && c.to.includes(":")
  );
  if (compositeConns.length === 0) return board;

  const existingCross = board.crossConnections ?? [];
  const existingKeys = new Set(
    existingCross.map((cc) => `${cc.fromPhaseId}:${cc.fromTaskId}→${cc.toPhaseId}:${cc.toTaskId}`)
  );

  const newCross: CrossConnection[] = [...existingCross];
  for (const c of compositeConns) {
    const [fromPhaseId, ...fromRest] = c.from.split(":");
    const [toPhaseId, ...toRest] = c.to.split(":");
    const key = `${c.from}→${c.to}`;
    if (!existingKeys.has(key)) {
      newCross.push({
        id: c.id,
        fromPhaseId,
        fromTaskId: fromRest.join(":"),
        toPhaseId,
        toTaskId: toRest.join(":"),
        lag: c.lag,
        lagUnit: c.lagUnit,
      });
      existingKeys.add(key);
    }
  }

  // Remove composite-ID entries from connections, keep phase-level only
  const cleanConns = board.connections.filter(
    (c) => !c.from.includes(":") || !c.to.includes(":")
  );

  // Recurse into subBoards (nested phases won't have cross-connections, but be thorough)
  const migratedTasks = board.tasks.map((t) =>
    t.subBoard ? { ...t, subBoard: migrateBoardCrossConnections(t.subBoard) } : t
  );

  return { ...board, tasks: migratedTasks, connections: cleanConns, crossConnections: newCross };
}

// Apply migration to all boards in the group tree
function migrateGroupTree(groups: PlanGroup[]): PlanGroup[] {
  return groups.map((g) => ({
    ...g,
    boardState: migrateBoardCrossConnections(g.boardState),
    children: migrateGroupTree(g.children),
  }));
}

// When phases are disabled: promote subBoard tasks one level up to the flat board
function flattenPhasesBoard(board: BoardState): BoardState {
  const tasks: BoardState["tasks"] = [];
  const conns: BoardState["connections"] = [];
  for (const phase of board.tasks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (phase as any).subBoard as BoardState | undefined;
    if (sub && sub.tasks.length > 0) {
      tasks.push(...sub.tasks);
      conns.push(...sub.connections);
    } else {
      tasks.push(phase);
    }
  }
  return { ...board, tasks, connections: conns };
}

function makeProduct(name: string): PlanProduct {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `prd-${Date.now()}`;
  return { id, name, groups: [], activeGroupId: null };
}

function updateProductIn(products: PlanProduct[], id: string, fn: (p: PlanProduct) => PlanProduct): PlanProduct[] {
  return products.map((p) => (p.id === id ? fn(p) : p));
}

// ─── Sidebar UI ───────────────────────────────────────────────────────────────

type GroupNodeProps = {
  group: PlanGroup;
  depth: number;
  activeGroupId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string, name: string) => void;
  onTogglePhases: (id: string) => void;
};

function GroupTreeNode({ group, depth, activeGroupId, onSelect, onRename, onDelete, onAddChild, onTogglePhases }: GroupNodeProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childDraft, setChildDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (addingChild) childInputRef.current?.focus(); }, [addingChild]);

  const isActive = group.id === activeGroupId;
  const hasChildren = group.children.length > 0;

  return (
    <div>
      <div
        className={`group/node flex cursor-pointer items-center gap-1 rounded-lg py-1.5 pr-1 transition select-none ${
          isActive ? "bg-violet-50 text-violet-800" : "text-zinc-700 hover:bg-zinc-100"
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => !editing && onSelect(group.id)}
      >
        <button
          type="button"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition ${
            !hasChildren ? "invisible pointer-events-none" : "text-zinc-400 hover:text-zinc-700"
          }`}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          tabIndex={-1}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d={open ? "M1.5 3L4 5.5L6.5 3" : "M3 1.5L5.5 4L3 6.5"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <svg className="shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <path d="M1 4.5V10.5C1 11 1.5 11.5 2 11.5H11C11.5 11.5 12 11 12 10.5V5C12 4.5 11.5 4 11 4H6.5L5.5 2.5H2C1.5 2.5 1 3 1 3.5V4.5Z"
            fill={isActive ? "#ede9fe" : "#f4f4f5"} stroke={isActive ? "#7c3aed" : "#a1a1aa"} strokeWidth="1"/>
        </svg>
        {editing ? (
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onRename(group.id, draft.trim() || group.name); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onRename(group.id, draft.trim() || group.name); setEditing(false); }
              if (e.key === "Escape") { setDraft(group.name); setEditing(false); }
            }}
            className="min-w-0 flex-1 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-violet-400"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate text-xs ${isActive ? "font-semibold" : "font-medium"}`}>{group.name}</span>
        )}
        {!editing && (
          <div className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover/node:flex">
            <button type="button" title="Umbenennen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              onClick={(e) => { e.stopPropagation(); setDraft(group.name); setEditing(true); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M6.5 1.5L7.5 2.5L3 7H2V6L6.5 1.5Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            </button>
            <button type="button" title="Untergruppe hinzufügen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              onClick={(e) => { e.stopPropagation(); setAddingChild(true); setOpen(true); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M4.5 1.5v6M1.5 4.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <button type="button" title="Gruppe löschen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-rose-100 hover:text-rose-600"
              onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 2l5 5M7 2L2 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
            <button type="button"
              title={group.phasesEnabled !== false ? "Phasen ausschalten (Tasks flach)" : "Phasen einschalten"}
              className={`flex h-5 w-5 items-center justify-center rounded transition ${
                group.phasesEnabled !== false
                  ? "text-violet-400 hover:bg-violet-100 hover:text-violet-700"
                  : "text-zinc-300 hover:bg-zinc-200 hover:text-zinc-700"
              }`}
              onClick={(e) => { e.stopPropagation(); onTogglePhases(group.id); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                {group.phasesEnabled !== false ? (
                  <>
                    <path d="M1.5 2.5h6M1.5 4.5h6M1.5 6.5h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </>
                ) : (
                  <path d="M1.5 4.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                )}
              </svg>
            </button>
          </div>
        )}
      </div>
      {addingChild && (
        <form onSubmit={(e) => { e.preventDefault(); if (childDraft.trim()) onAddChild(group.id, childDraft.trim()); setAddingChild(false); setChildDraft(""); }}
          className="flex items-center gap-1 py-1 pr-1"
          style={{ paddingLeft: `${8 + (depth + 1) * 14 + 20}px` }}>
          <input ref={childInputRef} value={childDraft} onChange={(e) => setChildDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setAddingChild(false); setChildDraft(""); } }}
            placeholder="Gruppenname…"
            className="h-6 flex-1 rounded border border-violet-300 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-violet-400"/>
          <button type="submit" className="flex h-6 items-center rounded bg-violet-600 px-2 text-[10px] font-bold text-white hover:bg-violet-700">✓</button>
          <button type="button" onClick={() => { setAddingChild(false); setChildDraft(""); }} className="flex h-6 items-center rounded border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-500 hover:bg-zinc-50">✕</button>
        </form>
      )}
      {open && group.children.map((child) => (
        <GroupTreeNode key={child.id} group={child} depth={depth + 1} activeGroupId={activeGroupId}
          onSelect={onSelect} onRename={onRename} onDelete={onDelete} onAddChild={onAddChild}
          onTogglePhases={onTogglePhases}/>
      ))}
    </div>
  );
}

type ProductNodeProps = {
  product: PlanProduct;
  isActiveProduct: boolean;
  onSelectGroup: (productId: string, groupId: string) => void;
  onAddGroup: (productId: string, name: string) => void;
  onAddChildGroup: (productId: string, parentId: string, name: string) => void;
  onRenameGroup: (productId: string, groupId: string, name: string) => void;
  onDeleteGroup: (productId: string, groupId: string) => void;
  onRenameProduct: (id: string, name: string) => void;
  onDeleteProduct: (id: string) => void;
  onTogglePhases: (productId: string, groupId: string) => void;
};

function ProductNode({ product, isActiveProduct, onSelectGroup, onAddGroup, onAddChildGroup, onRenameGroup, onDeleteGroup, onRenameProduct, onDeleteProduct, onTogglePhases }: ProductNodeProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product.name);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (addingGroup) groupInputRef.current?.focus(); }, [addingGroup]);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      {/* Product header row */}
      <div className={`group/prod flex cursor-pointer items-center gap-1.5 px-2 py-1.5 transition select-none hover:bg-zinc-50 ${isActiveProduct ? "bg-zinc-50" : ""}`}
        onClick={() => !editing && setOpen((v) => !v)}>
        <button type="button" className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-700" tabIndex={-1}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d={open ? "M1.5 3L4 5.5L6.5 3" : "M3 1.5L5.5 4L3 6.5"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* box/product icon */}
        <svg className="shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <path d="M1.5 4L6.5 1.5L11.5 4V9L6.5 11.5L1.5 9V4Z" fill={isActiveProduct ? "#ede9fe" : "#f4f4f5"} stroke={isActiveProduct ? "#7c3aed" : "#a1a1aa"} strokeWidth="1" strokeLinejoin="round"/>
          <path d="M1.5 4L6.5 6.5L11.5 4M6.5 6.5V11.5" stroke={isActiveProduct ? "#7c3aed" : "#a1a1aa"} strokeWidth="1" strokeLinecap="round"/>
        </svg>
        {editing ? (
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onRenameProduct(product.id, draft.trim() || product.name); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onRenameProduct(product.id, draft.trim() || product.name); setEditing(false); }
              if (e.key === "Escape") { setDraft(product.name); setEditing(false); }
            }}
            className="min-w-0 flex-1 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-violet-400"
            onClick={(e) => e.stopPropagation()}/>
        ) : (
          <span className="flex-1 truncate text-xs font-bold text-zinc-700">{product.name}</span>
        )}
        {!editing && (
          <div className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover/prod:flex">
            <button type="button" title="Umbenennen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              onClick={(e) => { e.stopPropagation(); setDraft(product.name); setEditing(true); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M6.5 1.5L7.5 2.5L3 7H2V6L6.5 1.5Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            </button>
            <button type="button" title="Gruppe hinzufügen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              onClick={(e) => { e.stopPropagation(); setAddingGroup(true); setOpen(true); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M4.5 1.5v6M1.5 4.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <button type="button" title="Produkt löschen"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-rose-100 hover:text-rose-600"
              onClick={(e) => { e.stopPropagation(); onDeleteProduct(product.id); }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 2l5 5M7 2L2 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
      {/* Groups below product */}
      {open && (
        <div className="pb-1">
          {product.groups.map((g) => (
            <GroupTreeNode key={g.id} group={g} depth={1} activeGroupId={isActiveProduct ? product.activeGroupId : null}
              onSelect={(gid) => onSelectGroup(product.id, gid)}
              onRename={(gid, name) => onRenameGroup(product.id, gid, name)}
              onDelete={(gid) => onDeleteGroup(product.id, gid)}
              onAddChild={(parentId, name) => onAddChildGroup(product.id, parentId, name)}
              onTogglePhases={(gid) => onTogglePhases(product.id, gid)}/>
          ))}
          {addingGroup && (
            <form onSubmit={(e) => { e.preventDefault(); if (groupDraft.trim()) onAddGroup(product.id, groupDraft.trim()); setAddingGroup(false); setGroupDraft(""); }}
              className="flex items-center gap-1 py-1 pl-8 pr-2">
              <input ref={groupInputRef} value={groupDraft} onChange={(e) => setGroupDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setAddingGroup(false); setGroupDraft(""); } }}
                placeholder="Gruppenname…"
                className="h-6 flex-1 rounded border border-violet-300 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-violet-400"/>
              <button type="submit" className="flex h-6 items-center rounded bg-violet-600 px-2 text-[10px] font-bold text-white hover:bg-violet-700">✓</button>
              <button type="button" onClick={() => { setAddingGroup(false); setGroupDraft(""); }} className="flex h-6 items-center rounded border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-500 hover:bg-zinc-50">✕</button>
            </form>
          )}
          {product.groups.length === 0 && !addingGroup && (
            <button type="button" onClick={() => setAddingGroup(true)}
              className="flex w-full items-center gap-1.5 py-1 pl-8 text-xs text-zinc-400 hover:text-violet-600 transition">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M4.5 1.5v6M1.5 4.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Gruppe anlegen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PlanSidebar({
  products,
  activeProductId,
  onSelectGroup,
  onAddProduct,
  onAddGroup,
  onAddChildGroup,
  onRenameGroup,
  onDeleteGroup,
  onRenameProduct,
  onDeleteProduct,
  onTogglePhases,
}: {
  products: PlanProduct[];
  activeProductId: string | null;
  onSelectGroup: (productId: string, groupId: string) => void;
  onAddProduct: (name: string) => void;
  onAddGroup: (productId: string, name: string) => void;
  onAddChildGroup: (productId: string, parentId: string, name: string) => void;
  onRenameGroup: (productId: string, groupId: string, name: string) => void;
  onDeleteGroup: (productId: string, groupId: string) => void;
  onRenameProduct: (id: string, name: string) => void;
  onDeleteProduct: (id: string) => void;
  onTogglePhases: (productId: string, groupId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  return (
    <div className="flex w-52 shrink-0 flex-col self-start rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Produkte</span>
        <button type="button" title="Neues Produkt" onClick={() => setAdding(true)}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="min-h-[60px]">
        {products.length === 0 && !adding && (
          <p className="px-3 py-4 text-center text-xs text-zinc-400">
            Noch keine Produkte.{" "}
            <button type="button" onClick={() => setAdding(true)} className="text-violet-600 hover:underline">Anlegen</button>
          </p>
        )}
        {products.map((p) => (
          <ProductNode key={p.id} product={p} isActiveProduct={p.id === activeProductId}
            onSelectGroup={onSelectGroup} onAddGroup={onAddGroup} onAddChildGroup={onAddChildGroup}
            onRenameGroup={onRenameGroup} onDeleteGroup={onDeleteGroup}
            onRenameProduct={onRenameProduct} onDeleteProduct={onDeleteProduct}
            onTogglePhases={onTogglePhases}/>
        ))}
        {adding && (
          <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onAddProduct(draft.trim()); setAdding(false); setDraft(""); }}
            className="flex items-center gap-1 px-2 py-1.5">
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
              placeholder="Produktname…"
              className="h-6 flex-1 rounded border border-violet-300 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-violet-400"/>
            <button type="submit" className="flex h-6 items-center rounded bg-violet-600 px-2 text-[10px] font-bold text-white hover:bg-violet-700">✓</button>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="flex h-6 items-center rounded border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-500 hover:bg-zinc-50">✕</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function TasksPageClient() {
  const [boardKey, setBoardKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Product/Group tree state
  const [appState, setAppState] = useState<AppRootState>({ products: [], activeProductId: null });
  const appStateRef = useRef<AppRootState>({ products: [], activeProductId: null });
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  const [showGroupTree, setShowGroupTree] = useState(true);

  // Root board state (active group's board — persisted via appState)
  const [rootBoard, setRootBoard] = useState<BoardState>({ tasks: [], connections: [] });
  const rootBoardRef = useRef<BoardState>({ tasks: [], connections: [] });
  useEffect(() => { rootBoardRef.current = rootBoard; }, [rootBoard]);

  const [boardLoaded, setBoardLoaded] = useState(false);
  // Drill-in path for 3D navigation
  const [drillPath, setDrillPath] = useState<DrillStep[]>([]);
  // Track if navigation came from Gantt fullscreen (to return back)
  const [cameFromGantt, setCameFromGantt] = useState(false);
  // Reset cameFromGantt after root board has mounted with gantt-fullscreen
  useEffect(() => {
    if (cameFromGantt && drillPath.length === 0) {
      const t = setTimeout(() => setCameFromGantt(false), 100);
      return () => clearTimeout(t);
    }
  }, [cameFromGantt, drillPath.length]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current ref so handleBoardStateChange never has a stale drillPath
  const drillPathRef = useRef<DrillStep[]>([]);
  useEffect(() => { drillPathRef.current = drillPath; }, [drillPath]);

  // Load from DB on mount — supports legacy BoardState and new AppRootState
  useEffect(() => {
    localStorage.removeItem("task-board:templates:v1");
    loadBoardState().then((json) => {
      if (json) {
        try {
          const parsed = JSON.parse(json) as Record<string, unknown>;
          if (Array.isArray(parsed.products)) {
            // Current format: AppRootState with products
            const state = parsed as unknown as AppRootState;
            // Migrate composite-ID connections → crossConnections (single source of truth)
            const migratedState: AppRootState = {
              ...state,
              products: state.products.map((p) => ({
                ...p,
                groups: migrateGroupTree(p.groups),
              })),
            };
            setAppState(migratedState);
            const activeProd = migratedState.products.find((p) => p.id === migratedState.activeProductId);
            if (activeProd) {
              const activeGroup = findGroup(activeProd.groups, activeProd.activeGroupId);
              if (activeGroup) setRootBoard(activeGroup.boardState);
            }
          } else if (Array.isArray(parsed.groups)) {
            // Legacy v1: AppRootState with groups — migrate to product
            const legacyGroups = migrateGroupTree(parsed.groups as PlanGroup[]);
            const legacyActiveGroupId = (parsed.activeGroupId as string) ?? null;
            const product = makeProduct("Standard");
            product.groups = legacyGroups;
            product.activeGroupId = legacyActiveGroupId;
            const migrated: AppRootState = { products: [product], activeProductId: product.id };
            setAppState(migrated);
            const activeGroup = findGroup(legacyGroups, legacyActiveGroupId);
            if (activeGroup) setRootBoard(activeGroup.boardState);
          } else if (Array.isArray(parsed.tasks)) {
            // Legacy v0: bare BoardState — migrate into default product+group
            const defaultGroup = makeGroup("Standard");
            defaultGroup.boardState = migrateBoardCrossConnections(parsed as unknown as BoardState);
            const product = makeProduct("Standard");
            product.groups = [defaultGroup];
            product.activeGroupId = defaultGroup.id;
            const migrated: AppRootState = { products: [product], activeProductId: product.id };
            setAppState(migrated);
            setRootBoard(defaultGroup.boardState);
          }
        } catch {
          // ignore corrupt state
        }
      }
      setBoardLoaded(true);
    });
  }, []);

  // Build save payload from latest refs (avoids stale closures in timers)
  const buildSavePayload = useRef(() => {
    const app = appStateRef.current;
    const board = rootBoardRef.current;
    const { activeProductId, products } = app;
    return activeProductId
      ? {
          ...app,
          products: updateProductIn(products, activeProductId, (p) =>
            p.activeGroupId
              ? { ...p, groups: updateGroupIn(p.groups, p.activeGroupId, (g) => ({ ...g, boardState: board })) }
              : p
          ),
        }
      : app;
  }).current;

  const pendingSaveRef = useRef(false);

  // Debounced save: embeds current rootBoard into the active product/group before persisting
  useEffect(() => {
    if (!boardLoaded) return;
    pendingSaveRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      pendingSaveRef.current = false;
      const stateToSave = buildSavePayload();
      saveBoardState(JSON.stringify(stateToSave))
        .then(() => {
          setSaveStatus("saved");
          if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
          saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch(console.error);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [rootBoard, appState, boardLoaded, buildSavePayload]);

  // Flush pending save on page unload (server restart, tab close, navigation)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!pendingSaveRef.current) return;
      pendingSaveRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const stateToSave = buildSavePayload();
      // Use sendBeacon for reliable delivery even during page unload
      const blob = new Blob([JSON.stringify({ stateJson: JSON.stringify(stateToSave) })], { type: "application/json" });
      navigator.sendBeacon("/api/save-board", blob);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [buildSavePayload]);

  const handleBoardStateChange = (newBoard: BoardState) => {
    const dp = drillPathRef.current;
    setRootBoard((root) => {
      if (dp.length === 0) {
        // Preserve root-level fields that TaskBoard doesn't manage
        return {
          ...newBoard,
          crossConnections: root.crossConnections,
          variantTabs: root.variantTabs,
          activeVariantId: root.activeVariantId,
        };
      }
      return updateBoardAtPath(root, dp, newBoard);
    });
  };

  const handleDrillIn = (taskId: string, taskTitle: string, fromGantt?: boolean) => {
    if (fromGantt) setCameFromGantt(true);
    setDrillPath((prev) => [...prev, { taskId, title: taskTitle }]);
  };

  const handleCrossConnectionsChange = (conns: CrossConnection[]) => {
    setRootBoard((root) => ({ ...root, crossConnections: conns }));
  };

  // crossConnections is the single source of truth for cross-phase connections.
  // Migration from legacy composite-ID entries in connections[] happens once on load (see below).
  const effectiveCrossConnections = useMemo<CrossConnection[]>(
    () => rootBoard.crossConnections ?? [],
    [rootBoard.crossConnections]
  );

  const handleNavigateToPhase = (phaseId: string, phaseTitle: string) => {
    setDrillPath([{ taskId: phaseId, title: phaseTitle }]);
  };

  // ─── Variant handlers ─────────────────────────────────────────────────────

  const handleSwitchVariant = (toId: string) => {
    setRootBoard((root) => {
      const currentId = root.activeVariantId ?? DEFAULT_VARIANT_ID;
      if (currentId === toId) return root;
      // Save current board into active variant snapshot
      const updatedTabs = (root.variantTabs ?? []).map((t) =>
        t.id === currentId ? { ...t, tasks: root.tasks, connections: root.connections } : t
      );
      const target = updatedTabs.find((t) => t.id === toId);
      if (!target) return root;
      return {
        ...root,
        tasks: target.tasks,
        connections: target.connections,
        variantTabs: updatedTabs,
        activeVariantId: toId === DEFAULT_VARIANT_ID ? null : toId,
      };
    });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleAddVariant = (label: string) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`;
    setRootBoard((root) => {
      const currentId = root.activeVariantId ?? DEFAULT_VARIANT_ID;
      // Flush current board into active variant snapshot
      const flushedTabs = (root.variantTabs ?? []).map((t) =>
        t.id === currentId ? { ...t, tasks: root.tasks, connections: root.connections } : t
      );
      const hasDefault = flushedTabs.some((t) => t.id === DEFAULT_VARIANT_ID);
      const defaultTab: VariantTab = hasDefault
        ? flushedTabs.find((t) => t.id === DEFAULT_VARIANT_ID)!
        : { id: DEFAULT_VARIANT_ID, label: "Standard", tasks: root.tasks, connections: root.connections };
      const otherTabs = flushedTabs.filter((t) => t.id !== DEFAULT_VARIANT_ID);
      const newTab: VariantTab = { id, label, tasks: root.tasks, connections: root.connections };
      return {
        ...root,
        variantTabs: [defaultTab, ...otherTabs, newTab],
        activeVariantId: id,
      };
    });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleDeleteVariant = (deleteId: string) => {
    setRootBoard((root) => {
      const tabs = (root.variantTabs ?? []).filter((t) => t.id !== deleteId);
      const isActive = root.activeVariantId === deleteId;
      if (isActive) {
        const defaultTab = tabs.find((t) => t.id === DEFAULT_VARIANT_ID);
        const newTasks = defaultTab?.tasks ?? root.tasks;
        const newConns = defaultTab?.connections ?? root.connections;
        if (tabs.length <= 1) {
          return { ...root, tasks: newTasks, connections: newConns, variantTabs: undefined, activeVariantId: null };
        }
        return { ...root, tasks: newTasks, connections: newConns, variantTabs: tabs, activeVariantId: null };
      }
      if (tabs.length <= 1) {
        return { ...root, variantTabs: undefined };
      }
      return { ...root, variantTabs: tabs };
    });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  // ─── Group & Product handlers ─────────────────────────────────────────────

  // Helper: flush current rootBoard into the active product/group
  const flushCurrentBoard = (prev: AppRootState): AppRootState => {
    const current = rootBoardRef.current;
    if (!prev.activeProductId) return prev;
    return {
      ...prev,
      products: updateProductIn(prev.products, prev.activeProductId, (p) =>
        p.activeGroupId
          ? { ...p, groups: updateGroupIn(p.groups, p.activeGroupId, (g) => ({ ...g, boardState: current })) }
          : p
      ),
    };
  };

  const handleSelectGroup = (productId: string, groupId: string) => {
    const prod = appState.products.find((p) => p.id === productId);
    if (!prod) return;
    if (productId === appState.activeProductId && groupId === prod.activeGroupId) return;
    const target = findGroup(prod.groups, groupId);
    if (!target) return;
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      return {
        ...flushed,
        activeProductId: productId,
        products: updateProductIn(flushed.products, productId, (p) => ({ ...p, activeGroupId: groupId })),
      };
    });
    setRootBoard(target.boardState);
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleAddGroup = (productId: string, name: string) => {
    const g = makeGroup(name);
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      return {
        ...flushed,
        activeProductId: productId,
        products: updateProductIn(flushed.products, productId, (p) => ({
          ...p,
          groups: [...p.groups, g],
          activeGroupId: g.id,
        })),
      };
    });
    setRootBoard({ tasks: [], connections: [] });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleAddChildGroup = (productId: string, parentId: string, name: string) => {
    const g = makeGroup(name);
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      return {
        ...flushed,
        activeProductId: productId,
        products: updateProductIn(flushed.products, productId, (p) => ({
          ...p,
          groups: addChildToGroup(p.groups, parentId, g),
          activeGroupId: g.id,
        })),
      };
    });
    setRootBoard({ tasks: [], connections: [] });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleRenameGroup = (productId: string, groupId: string, name: string) => {
    setAppState((prev) => ({
      ...prev,
      products: updateProductIn(prev.products, productId, (p) => ({
        ...p,
        groups: updateGroupIn(p.groups, groupId, (g) => ({ ...g, name })),
      })),
    }));
  };

  const handleDeleteGroup = (productId: string, groupId: string) => {
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      const prod = flushed.products.find((p) => p.id === productId);
      if (!prod) return flushed;
      const newGroups = deleteGroupIn(prod.groups, groupId);
      const newActiveId = prod.activeGroupId === groupId ? firstGroupId(newGroups) : prod.activeGroupId;
      const newActive = findGroup(newGroups, newActiveId);
      const isActiveProd = flushed.activeProductId === productId;
      if (isActiveProd) {
        setRootBoard(newActive ? newActive.boardState : { tasks: [], connections: [] });
        setDrillPath([]);
        setBoardKey((k) => k + 1);
      }
      return {
        ...flushed,
        products: updateProductIn(flushed.products, productId, (p) => ({
          ...p,
          groups: newGroups,
          activeGroupId: newActiveId,
        })),
      };
    });
  };

  const handleAddProduct = (name: string) => {
    const p = makeProduct(name);
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      return { ...flushed, products: [...flushed.products, p], activeProductId: p.id };
    });
    setRootBoard({ tasks: [], connections: [] });
    setDrillPath([]);
    setBoardKey((k) => k + 1);
  };

  const handleRenameProduct = (id: string, name: string) => {
    setAppState((prev) => ({ ...prev, products: updateProductIn(prev.products, id, (p) => ({ ...p, name })) }));
  };

  const handleDeleteProduct = (id: string) => {
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      const newProducts = flushed.products.filter((p) => p.id !== id);
      const isActive = flushed.activeProductId === id;
      const newActiveId = isActive ? (newProducts[0]?.id ?? null) : flushed.activeProductId;
      if (isActive) {
        const newProd = newProducts.find((p) => p.id === newActiveId);
        const newGroup = newProd ? findGroup(newProd.groups, newProd.activeGroupId) : null;
        setRootBoard(newGroup ? newGroup.boardState : { tasks: [], connections: [] });
        setDrillPath([]);
        setBoardKey((k) => k + 1);
      }
      return { products: newProducts, activeProductId: newActiveId };
    });
  };

  const handleTogglePhases = (productId: string, groupId: string) => {
    setAppState((prev) => {
      const flushed = flushCurrentBoard(prev);
      const prod = flushed.products.find((p) => p.id === productId);
      if (!prod) return flushed;
      const group = findGroup(prod.groups, groupId);
      if (!group) return flushed;

      const wasEnabled = group.phasesEnabled !== false;
      const newEnabled = !wasEnabled;

      // When turning OFF: flatten subBoard tasks up one level
      const newBoardState = !newEnabled
        ? flattenPhasesBoard(group.boardState)
        : group.boardState;

      const isActiveGroup = flushed.activeProductId === productId && prod.activeGroupId === groupId;
      if (isActiveGroup) {
        setRootBoard(newBoardState);
        setDrillPath([]);
        setBoardKey((k) => k + 1);
      }

      return {
        ...flushed,
        products: updateProductIn(flushed.products, productId, (p) => ({
          ...p,
          groups: updateGroupIn(p.groups, groupId, (g) => ({
            ...g,
            phasesEnabled: newEnabled,
            boardState: newBoardState,
          })),
        })),
      };
    });
  };

  const currentBoard = getBoardAtPath(rootBoard, drillPath);

  const breadcrumbNav = (
    <>
      <nav className="mb-2 flex min-h-[34px] items-center gap-0.5 rounded-xl border border-zinc-100 bg-white/60 px-3 py-1.5 shadow-sm">
      {drillPath.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setDrillPath([])}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden>
              <rect x="1" y="1" width="4.5" height="4.5" rx="1"/>
              <rect x="7.5" y="1" width="4.5" height="4.5" rx="1"/>
              <rect x="1" y="7.5" width="4.5" height="4.5" rx="1"/>
              <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1"/>
            </svg>
            Phasen
          </button>
          {drillPath.map((step, i) => (
            <span key={`${step.taskId}-${i}`} className="flex items-center gap-0.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-zinc-300" aria-hidden>
                <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <button
                type="button"
                onClick={() => setDrillPath(drillPath.slice(0, i + 1))}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  i === drillPath.length - 1
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                }`}
              >
                {step.title}
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setDrillPath((prev) => prev.slice(0, -1))}
            className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Zurück
          </button>
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden>
            <rect x="1" y="1" width="4.5" height="4.5" rx="1"/>
            <rect x="7.5" y="1" width="4.5" height="4.5" rx="1"/>
            <rect x="1" y="7.5" width="4.5" height="4.5" rx="1"/>
            <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1"/>
          </svg>
          Phasen
        </span>
      )}
      </nav>
    </>
  );

  return (
    <>
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Groups toggle */}
        <button
          type="button"
          onClick={() => setShowGroupTree((v) => !v)}
          title={showGroupTree ? "Produkte ausblenden" : "Produkte einblenden"}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            showGroupTree
              ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M1 3.5V11C1 11.5 1.5 12 2 12H12C12.5 12 13 11.5 13 11V5C13 4.5 12.5 4 12 4H7L6 2.5H2C1.5 2.5 1 3 1 3.5Z"
              fill={showGroupTree ? "#ede9fe" : "#f4f4f5"}
              stroke={showGroupTree ? "#7c3aed" : "#a1a1aa"}
              strokeWidth="1"
            />
          </svg>
          Produkte
        </button>



        {saveStatus === "saved" && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Gespeichert
          </span>
        )}
      </div>

      {/* Main layout: optional sidebar + board */}
      <div className="flex items-start gap-4">
        {showGroupTree && (
          <PlanSidebar
            products={appState.products}
            activeProductId={appState.activeProductId}
            onSelectGroup={handleSelectGroup}
            onAddProduct={handleAddProduct}
            onAddGroup={handleAddGroup}
            onAddChildGroup={handleAddChildGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onRenameProduct={handleRenameProduct}
            onDeleteProduct={handleDeleteProduct}
            onTogglePhases={handleTogglePhases}
          />
        )}

        {/* Board column */}
        <div className="min-w-0 flex-1">
          {boardLoaded && (() => {
            const activeProd = appState.products.find((p) => p.id === appState.activeProductId);
            const hasActiveGroup = activeProd && activeProd.activeGroupId;
            if (!hasActiveGroup) {
              return (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-16 text-center">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-3 text-zinc-300" aria-hidden>
                    <path d="M2 9V27C2 28 3 29 4 29H28C29 29 30 28 30 27V13C30 12 29 11 28 11H17L15 8H4C3 7 2 8 2 9Z"
                      fill="#f4f4f5" stroke="#d4d4d8" strokeWidth="1.5"/>
                  </svg>
                  <p className="text-sm font-semibold text-zinc-500">
                    {appState.products.length === 0 ? "Kein Produkt vorhanden" : "Keine Gruppe ausgewählt"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {appState.products.length === 0
                      ? "Erstelle ein Produkt in der Sidebar, dann leg Gruppen an."
                      : "Wähle eine Gruppe im Produkt aus oder lege eine neue an."}
                  </p>
                </div>
              );
            }
            return (
              <TaskBoard
                key={drillPath.length === 0 ? `root-${boardKey}` : drillPath.map((s) => s.taskId).join("/")}
                initialState={currentBoard}
                onStateChange={handleBoardStateChange}
                onDrillIn={handleDrillIn}
                level={(() => {
                  if (drillPath.length > 0) return "task";
                  const grp = findGroup(activeProd!.groups, activeProd!.activeGroupId);
                  return grp?.phasesEnabled !== false ? "phase" : "task";
                })()}
                rootBoard={drillPath.length === 1 ? rootBoard : undefined}
                currentPhaseId={drillPath.length === 1 ? drillPath[0].taskId : undefined}
                crossConnections={effectiveCrossConnections}
                onCrossConnectionsChange={handleCrossConnectionsChange}
                onNavigateToPhase={handleNavigateToPhase}
                breadcrumbSlot={breadcrumbNav}
                variantSlot={
                  <VariantSwitcherBar
                    variantTabs={rootBoard.variantTabs ?? []}
                    activeVariantId={rootBoard.activeVariantId ?? null}
                    onSwitch={handleSwitchVariant}
                    onAdd={handleAddVariant}
                    onDelete={handleDeleteVariant}
                  />
                }
                returnToGantt={drillPath.length > 0 && cameFromGantt ? () => {
                  setDrillPath([]);
                  // cameFromGantt stays true so root board opens in gantt-fullscreen
                } : undefined}
                initialView={drillPath.length === 0 && cameFromGantt ? "gantt-fullscreen" : undefined}
              />
            );
          })()}
        </div>
      </div>
    </>
  );
}
