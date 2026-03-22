"use client";

import { useState, useMemo, useEffect } from "react";
import {
  PRODUCT_LIBRARY,
  CROSS_PRODUCT_LINKS,
  generateBoardFromSelection,
  type ComposerSelection,
  type GeneratedBoard,
} from "@/lib/product-library";
import {
  loadCustomProducts,
  generateCustomBoard,
  type CustomProduct,
  type ProductVariant,
} from "@/lib/custom-products";
import { ProductManagerModal } from "./ProductEditor";

const COLOR_DOT: Record<string, string> = {
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  sky:     "bg-sky-400",
  rose:    "bg-rose-400",
  violet:  "bg-violet-400",
};

const COLOR_RING: Record<string, string> = {
  amber:   "ring-amber-300 border-amber-300",
  emerald: "ring-emerald-300 border-emerald-300",
  sky:     "ring-sky-300 border-sky-300",
  rose:    "ring-rose-300 border-rose-300",
  violet:  "ring-violet-300 border-violet-300",
};

const COLOR_BG: Record<string, string> = {
  amber:   "bg-amber-50",
  emerald: "bg-emerald-50",
  sky:     "bg-sky-50",
  rose:    "bg-rose-50",
  violet:  "bg-violet-50",
};

// ─── VariantCheckboxTree (recursive) ─────────────────────────────────────────

function VariantCheckboxTree({
  variants,
  selectedIds,
  onToggle,
  depth = 0,
}: {
  variants: ProductVariant[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  depth?: number;
}) {
  if (variants.length === 0) return null;
  return (
    <div style={{ paddingLeft: depth * 16 }} className="space-y-1">
      {variants.map((v) => {
        const selected = selectedIds.includes(v.id);
        const atCount = v.extraPhases.reduce((s, p) => s + p.duration, 0);
        return (
          <div key={v.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                selected
                  ? "border-zinc-300 bg-white shadow-sm"
                  : "border-transparent bg-white/50 hover:bg-white hover:border-zinc-200"
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(v.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-800"
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900">{v.label || "(ohne Name)"}</p>
                {v.description && (
                  <p className="mt-0.5 text-xs text-zinc-500">{v.description}</p>
                )}
                {(v.extraPhases.length > 0 || v.subVariants.length > 0) && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {v.extraPhases.length > 0 && `+${v.extraPhases.length} Phasen · ${atCount} AT`}
                    {v.subVariants.length > 0 && ` · ${v.subVariants.length} Sub-Varianten verfügbar`}
                  </p>
                )}
              </div>
            </label>
            {selected && v.subVariants.length > 0 && (
              <VariantCheckboxTree
                variants={v.subVariants}
                selectedIds={selectedIds}
                onToggle={onToggle}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onConfirm: (board: GeneratedBoard) => void;
  onCancel: () => void;
};

export function ProductComposer({ onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<"select" | "configure" | "preview">("select");
  const [selections, setSelections] = useState<ComposerSelection[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [showProductManager, setShowProductManager] = useState(false);

  useEffect(() => {
    setCustomProducts(loadCustomProducts());
  }, []);

  const handleManagerClose = () => {
    setCustomProducts(loadCustomProducts());
    setShowProductManager(false);
  };

  // ── Step 1: toggle product selection ─────────────────────────────────────
  const toggleProduct = (id: string) => {
    setSelections((prev) => {
      const exists = prev.find((s) => s.productId === id);
      if (exists) return prev.filter((s) => s.productId !== id);
      return [...prev, { productId: id, enabledOptions: [] }];
    });
  };

  const isSelected = (id: string) => selections.some((s) => s.productId === id);

  // ── Step 2: toggle option per built-in product ───────────────────────────
  const toggleOption = (productId: string, optionId: string) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.productId !== productId) return s;
        const has = s.enabledOptions.includes(optionId);
        return {
          ...s,
          enabledOptions: has
            ? s.enabledOptions.filter((o) => o !== optionId)
            : [...s.enabledOptions, optionId],
        };
      })
    );
  };

  // ── Step 2: toggle variant per custom product ─────────────────────────────
  const toggleVariant = (productId: string, variantId: string) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.productId !== productId) return s;
        const has = s.enabledOptions.includes(variantId);
        return {
          ...s,
          enabledOptions: has
            ? s.enabledOptions.filter((id) => id !== variantId)
            : [...s.enabledOptions, variantId],
        };
      })
    );
  };

  // ── Preview board (mixed: built-in + custom) ──────────────────────────────
  const previewBoard = useMemo(() => {
    if (selections.length === 0) return null;

    const builtInSels = selections.filter((s) =>
      PRODUCT_LIBRARY.some((p) => p.id === s.productId)
    );
    const customSels = selections.filter(
      (s) => !PRODUCT_LIBRARY.some((p) => p.id === s.productId)
    );

    const allTasks: GeneratedBoard["tasks"] = [];
    const allConns: GeneratedBoard["connections"] = [];

    if (builtInSels.length > 0) {
      const board = generateBoardFromSelection(builtInSels);
      allTasks.push(...board.tasks);
      allConns.push(...board.connections);
    }

    customSels.forEach((sel, i) => {
      const product = customProducts.find((p) => p.id === sel.productId);
      if (!product) return;
      const board = generateCustomBoard(
        product,
        new Set(sel.enabledOptions),
        builtInSels.length + i
      );
      allTasks.push(...board.tasks);
      allConns.push(...board.connections);
    });

    return { tasks: allTasks, connections: allConns } as GeneratedBoard;
  }, [selections, customProducts]);

  // Active cross-product links for selected products
  const activeCrossLinks = useMemo(() => {
    const ids = new Set(selections.map((s) => s.productId));
    return CROSS_PRODUCT_LINKS.filter(
      (l) => ids.has(l.fromProduct) && ids.has(l.toProduct)
    );
  }, [selections]);

  // ── Mini preview board rendering ─────────────────────────────────────────
  const PREVIEW_W = 680;
  const PREVIEW_H = 340;

  const scaledPreview = useMemo(() => {
    if (!previewBoard || previewBoard.tasks.length === 0) return null;
    const maxX = Math.max(...previewBoard.tasks.map((t) => t.x + 224));
    const maxY = Math.max(...previewBoard.tasks.map((t) => t.y + 130));
    const scaleX = (PREVIEW_W - 16) / maxX;
    const scaleY = (PREVIEW_H - 16) / maxY;
    const scale = Math.min(scaleX, scaleY, 1);
    return { scale, tasks: previewBoard.tasks, connections: previewBoard.connections };
  }, [previewBoard]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Product manager overlay
  if (showProductManager) {
    return <ProductManagerModal onClose={handleManagerClose} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Produkte kombinieren</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Wähle Produkte aus und konfiguriere Module — das Board wird automatisch generiert.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {(["select", "configure", "preview"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (s === "select") setStep("select");
                if (s === "configure" && selections.length > 0) setStep("configure");
                if (s === "preview" && selections.length > 0) setStep("preview");
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition ${
                step === s
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
              }`}
            >
              {i + 1}
            </button>
            <span className={step === s ? "text-zinc-800" : "text-zinc-400"}>
              {s === "select" ? "Produkte" : s === "configure" ? "Module" : "Vorschau"}
            </span>
            {i < 2 && <span className="text-zinc-200">›</span>}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Produkte auswählen ────────────────────────────────── */}
      {step === "select" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {PRODUCT_LIBRARY.map((product) => {
              const selected = isSelected(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProduct(product.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? `${COLOR_BG[product.color]} ${COLOR_RING[product.color]} border-transparent ring-2`
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`h-3 w-3 rounded-full ${COLOR_DOT[product.color]}`} />
                    <span className="font-semibold text-zinc-900">{product.name}</span>
                    {selected && (
                      <span className="ml-auto text-xs font-bold text-zinc-500">✓</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">
                    {product.description}
                  </p>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {product.tasks.length} Tasks · {product.options.length} optionale Module
                  </p>
                </button>
              );
            })}
          </div>

          {/* Custom products section */}
          {customProducts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Eigene Produkte
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {customProducts.map((product) => {
                  const selected = isSelected(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => toggleProduct(product.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? `${COLOR_BG[product.color]} ${COLOR_RING[product.color]} border-transparent ring-2`
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`h-3 w-3 rounded-full ${COLOR_DOT[product.color]}`} />
                        <span className="font-semibold text-zinc-900">{product.name}</span>
                        {selected && <span className="ml-auto text-xs font-bold text-zinc-500">✓</span>}
                      </div>
                      {product.description && (
                        <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">{product.description}</p>
                      )}
                      <p className="mt-2 text-[11px] text-zinc-400">
                        {product.phases.length} Phasen · {product.variants.length} Varianten
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manage products */}
          <button
            type="button"
            onClick={() => setShowProductManager(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 py-3 text-sm font-semibold text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
          >
            ⊕ Eigene Produkte verwalten
          </button>

          {selections.length > 0 && activeCrossLinks.length > 0 && (
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <span className="font-semibold">Automatische Querverbindungen:</span>{" "}
              {activeCrossLinks.map((l, i) => {
                const fp = PRODUCT_LIBRARY.find((p) => p.id === l.fromProduct);
                const tp = PRODUCT_LIBRARY.find((p) => p.id === l.toProduct);
                const ft = [...(fp?.tasks ?? []), ...(fp?.options.flatMap((o) => o.tasks) ?? [])].find(
                  (t) => t.id === l.fromTask
                );
                const tt = [...(tp?.tasks ?? []), ...(tp?.options.flatMap((o) => o.tasks) ?? [])].find(
                  (t) => t.id === l.toTask
                );
                return (
                  <span key={i}>
                    {i > 0 && " · "}
                    {ft?.title ?? l.fromTask} → {tt?.title ?? l.toTask}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Module / Varianten konfigurieren ───────────────────── */}
      {step === "configure" && (
        <div className="space-y-5">
          {selections.map((sel) => {
            // Built-in product
            const builtIn = PRODUCT_LIBRARY.find((p) => p.id === sel.productId);
            if (builtIn) {
              return (
                <div
                  key={sel.productId}
                  className={`rounded-2xl border p-4 ${COLOR_BG[builtIn.color]} border-${builtIn.color}-200`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[builtIn.color]}`} />
                    <h3 className="font-semibold text-zinc-900">{builtIn.name}</h3>
                  </div>
                  {builtIn.options.length === 0 ? (
                    <p className="text-xs italic text-zinc-400">Keine optionalen Module.</p>
                  ) : (
                    <div className="space-y-2">
                      {builtIn.options.map((opt) => {
                        const enabled = sel.enabledOptions.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                              enabled
                                ? "border-zinc-300 bg-white shadow-sm"
                                : "border-transparent bg-white/50 hover:bg-white hover:border-zinc-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleOption(builtIn.id, opt.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-800"
                            />
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">{opt.label}</p>
                              {opt.description && (
                                <p className="mt-0.5 text-xs text-zinc-500">{opt.description}</p>
                              )}
                              <p className="mt-1 text-[11px] text-zinc-400">
                                +{opt.tasks.length} Task{opt.tasks.length !== 1 ? "s" : ""} ·{" "}
                                {opt.tasks.reduce((s, t) => s + t.duration, 0)} AT
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Custom product → show recursive variant tree
            const custom = customProducts.find((p) => p.id === sel.productId);
            if (!custom) return null;
            return (
              <div
                key={sel.productId}
                className={`rounded-2xl border p-4 ${COLOR_BG[custom.color]} border-${custom.color}-200`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[custom.color]}`} />
                  <h3 className="font-semibold text-zinc-900">{custom.name}</h3>
                </div>
                {custom.variants.length === 0 ? (
                  <p className="text-xs italic text-zinc-400">Keine Varianten definiert.</p>
                ) : (
                  <VariantCheckboxTree
                    variants={custom.variants}
                    selectedIds={sel.enabledOptions}
                    onToggle={(variantId) => toggleVariant(custom.id, variantId)}
                    depth={0}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── STEP 3: Vorschau ─────────────────────────────────────────── */}
      {step === "preview" && previewBoard && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
            <span>
              <strong className="text-zinc-900">{previewBoard.tasks.length}</strong> Tasks
            </span>
            <span>
              <strong className="text-zinc-900">{previewBoard.connections.length}</strong> Verbindungen
            </span>
            <span>
              <strong className="text-zinc-900">
                {previewBoard.tasks.reduce((s, t) => s + t.duration, 0)}
              </strong>{" "}
              AT total
            </span>
          </div>

          {/* Mini board */}
          <div
            className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
            style={{ width: PREVIEW_W, height: PREVIEW_H, maxWidth: "100%" }}
          >
            {scaledPreview && (
              <div
                className="absolute inset-0 origin-top-left"
                style={{ transform: `scale(${scaledPreview.scale})` }}
              >
                <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
                  <defs>
                    <marker id="pc-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                      <polygon points="0 0, 7 2.5, 0 5" fill="#a1a1aa" />
                    </marker>
                  </defs>
                  {scaledPreview.connections.map((conn) => {
                    const from = scaledPreview.tasks.find((t) => t.id === conn.from);
                    const to = scaledPreview.tasks.find((t) => t.id === conn.to);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={conn.id}
                        x1={from.x + 112}
                        y1={from.y + 65}
                        x2={to.x + 112}
                        y2={to.y + 65}
                        stroke="#a1a1aa"
                        strokeWidth={1.5}
                        markerEnd="url(#pc-arrow)"
                      />
                    );
                  })}
                </svg>
                {scaledPreview.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`absolute rounded-xl border px-2 py-1.5 text-[10px] font-semibold shadow-sm ${COLOR_BG[task.color]}`}
                    style={{ transform: `translate(${task.x}px, ${task.y}px)`, width: 224 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_DOT[task.color]}`} />
                      <span className="truncate text-zinc-800">{task.title}</span>
                      <span className="ml-auto shrink-0 text-zinc-400">{task.duration}d</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer buttons ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition"
        >
          Abbrechen
        </button>

        <div className="flex gap-2">
          {step !== "select" && (
            <button
              type="button"
              onClick={() => setStep(step === "configure" ? "select" : "configure")}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition"
            >
              ← Zurück
            </button>
          )}
          {step === "select" && (
            <button
              type="button"
              disabled={selections.length === 0}
              onClick={() => setStep("configure")}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Module konfigurieren →
            </button>
          )}
          {step === "configure" && (
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Vorschau →
            </button>
          )}
          {step === "preview" && previewBoard && (
            <button
              type="button"
              onClick={() => onConfirm(previewBoard)}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              ✦ Auf Board laden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
