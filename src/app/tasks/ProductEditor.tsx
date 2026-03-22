"use client";

import { useState, useMemo } from "react";
import {
  loadCustomProducts,
  saveCustomProducts,
  collectAllPhases,
  type CustomProduct,
  type ProductPhase,
  type PhaseConnection,
  type ProductVariant,
  type ColorToken,
} from "@/lib/custom-products";

// ─── Constants ────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

const COLOR_TOKENS: ColorToken[] = ["amber", "orange", "emerald", "teal", "sky", "indigo", "rose", "violet"];

const COLOR_DOT: Record<ColorToken, string> = {
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  emerald: "bg-emerald-400",
  teal: "bg-teal-400",
  sky: "bg-sky-400",
  indigo: "bg-indigo-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
};

const COLOR_LABEL: Record<ColorToken, string> = {
  amber: "Gelb",
  orange: "Orange",
  emerald: "Grün",
  teal: "Türkis",
  sky: "Blau",
  indigo: "Indigo",
  rose: "Rot",
  violet: "Lila",
};

const COLOR_BG: Record<ColorToken, string> = {
  amber: "bg-amber-50 border-amber-200",
  orange: "bg-orange-50 border-orange-200",
  emerald: "bg-emerald-50 border-emerald-200",
  teal: "bg-teal-50 border-teal-200",
  sky: "bg-sky-50 border-sky-200",
  indigo: "bg-indigo-50 border-indigo-200",
  rose: "bg-rose-50 border-rose-200",
  violet: "bg-violet-50 border-violet-200",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyProduct(): CustomProduct {
  return {
    id: newId(),
    name: "",
    description: "",
    color: "sky",
    phases: [],
    connections: [],
    variants: [],
  };
}

function emptyVariant(): ProductVariant {
  return { id: newId(), label: "", description: "", extraPhases: [], extraConnections: [], subVariants: [] };
}

// ─── PhaseRow ────────────────────────────────────────────────────────────────

function PhaseRow({
  phase,
  onChange,
  onDelete,
}: {
  phase: ProductPhase;
  onChange: (p: ProductPhase) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <input
        type="text"
        value={phase.title}
        onChange={(e) => onChange({ ...phase, title: e.target.value })}
        placeholder="Phase..."
        className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
      />
      <input
        type="text"
        value={phase.note ?? ""}
        onChange={(e) => onChange({ ...phase, note: e.target.value })}
        placeholder="Notiz..."
        className="min-w-0 flex-1 text-xs text-zinc-500 outline-none placeholder:text-zinc-300"
      />
      <input
        type="number"
        min={0.5}
        step={0.5}
        value={phase.duration}
        onChange={(e) => onChange({ ...phase, duration: parseFloat(e.target.value) || 1 })}
        className="w-14 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-400"
      />
      <span className="shrink-0 text-xs text-zinc-400">AT</span>
      <button
        type="button"
        onClick={onDelete}
        className="text-zinc-300 hover:text-rose-400 transition text-sm shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

// ─── ConnectionRow ────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  allPhases,
  onChange,
  onDelete,
}: {
  conn: PhaseConnection;
  allPhases: ProductPhase[];
  onChange: (c: PhaseConnection) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={conn.from}
        onChange={(e) => onChange({ ...conn, from: e.target.value })}
        className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
      >
        <option value="">— Von —</option>
        {allPhases.map((p) => (
          <option key={p.id} value={p.id}>{p.title || `(${p.id.slice(0, 8)})`}</option>
        ))}
      </select>
      <span className="shrink-0 text-zinc-400 text-sm">→</span>
      <select
        value={conn.to}
        onChange={(e) => onChange({ ...conn, to: e.target.value })}
        className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
      >
        <option value="">— Nach —</option>
        {allPhases.map((p) => (
          <option key={p.id} value={p.id}>{p.title || `(${p.id.slice(0, 8)})`}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-zinc-300 hover:text-rose-400 transition text-sm"
      >
        ✕
      </button>
    </div>
  );
}

// ─── PhasesSection ────────────────────────────────────────────────────────────

function PhasesSection({
  phases,
  connections,
  allPhases,
  onPhasesChange,
  onConnectionsChange,
}: {
  phases: ProductPhase[];
  connections: PhaseConnection[];
  allPhases: ProductPhase[];
  onPhasesChange: (p: ProductPhase[]) => void;
  onConnectionsChange: (c: PhaseConnection[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {phases.map((phase) => (
          <PhaseRow
            key={phase.id}
            phase={phase}
            onChange={(updated) => onPhasesChange(phases.map((p) => (p.id === phase.id ? updated : p)))}
            onDelete={() => onPhasesChange(phases.filter((p) => p.id !== phase.id))}
          />
        ))}
        <button
          type="button"
          onClick={() => onPhasesChange([...phases, { id: newId(), title: "", note: "", duration: 1 }])}
          className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
        >
          + Phase hinzufügen
        </button>
      </div>

      {allPhases.length >= 2 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Verbindungen</p>
          {connections.map((conn, i) => (
            <ConnectionRow
              key={i}
              conn={conn}
              allPhases={allPhases}
              onChange={(updated) => onConnectionsChange(connections.map((c, j) => (j === i ? updated : c)))}
              onDelete={() => onConnectionsChange(connections.filter((_, j) => j !== i))}
            />
          ))}
          <button
            type="button"
            onClick={() => onConnectionsChange([...connections, { from: "", to: "" }])}
            className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
          >
            + Verbindung hinzufügen
          </button>
        </div>
      )}
    </div>
  );
}

// ─── VariantSection (recursive) ───────────────────────────────────────────────

function VariantSection({
  variant,
  allPhasesInProduct,
  onUpdate,
  onDelete,
  depth,
}: {
  variant: ProductVariant;
  allPhasesInProduct: ProductPhase[];
  onUpdate: (v: ProductVariant) => void;
  onDelete: () => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // For this variant's connection dropdowns: global product phases + this variant's own extra phases (deduplicated)
  const localAllPhases = useMemo(() => {
    const seen = new Set<string>();
    return [...allPhasesInProduct, ...variant.extraPhases].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [allPhasesInProduct, variant.extraPhases]);

  const totalAT = variant.extraPhases.reduce((s, p) => s + p.duration, 0);

  return (
    <div
      className={`rounded-xl border bg-white ${
        depth > 0 ? "border-zinc-100" : "border-zinc-200"
      }`}
      style={{ marginLeft: depth * 16 }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-4 shrink-0 text-xs text-zinc-400 hover:text-zinc-600"
        >
          {expanded ? "▼" : "►"}
        </button>
        <input
          type="text"
          value={variant.label}
          onChange={(e) => onUpdate({ ...variant, label: e.target.value })}
          placeholder="Variantenname..."
          onClick={() => !expanded && setExpanded(true)}
          className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
        />
        <span className="shrink-0 text-[11px] text-zinc-400">
          {variant.extraPhases.length > 0 && `+${variant.extraPhases.length}P · ${totalAT}AT`}
          {variant.subVariants.length > 0 && ` · ${variant.subVariants.length} Sub`}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="ml-1 shrink-0 text-zinc-300 transition hover:text-rose-400 text-sm"
        >
          ✕
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-4 border-t border-zinc-100 px-3 py-3">
          {/* Description */}
          <input
            type="text"
            value={variant.description ?? ""}
            onChange={(e) => onUpdate({ ...variant, description: e.target.value })}
            placeholder="Beschreibung (optional)..."
            className="w-full text-xs text-zinc-500 outline-none placeholder:text-zinc-300"
          />

          {/* Extra phases + connections for this variant */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Extra Phasen dieser Variante
            </p>
            <PhasesSection
              phases={variant.extraPhases}
              connections={variant.extraConnections}
              allPhases={localAllPhases}
              onPhasesChange={(extraPhases) => onUpdate({ ...variant, extraPhases })}
              onConnectionsChange={(extraConnections) => onUpdate({ ...variant, extraConnections })}
            />
          </div>

          {/* Sub-variants */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Sub-Varianten
            </p>
            <div className="space-y-2">
              {variant.subVariants.map((sv) => (
                <VariantSection
                  key={sv.id}
                  variant={sv}
                  allPhasesInProduct={localAllPhases}
                  onUpdate={(updated) =>
                    onUpdate({
                      ...variant,
                      subVariants: variant.subVariants.map((v) => (v.id === sv.id ? updated : v)),
                    })
                  }
                  onDelete={() =>
                    onUpdate({
                      ...variant,
                      subVariants: variant.subVariants.filter((v) => v.id !== sv.id),
                    })
                  }
                  depth={depth + 1}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  onUpdate({ ...variant, subVariants: [...variant.subVariants, emptyVariant()] })
                }
                className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
              >
                + Sub-Variante
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ProductEditorForm ────────────────────────────────────────────────────────

function ProductEditorForm({
  initial,
  onSave,
  onCancel,
  usedColors = [],
}: {
  initial: CustomProduct;
  onSave: (product: CustomProduct) => void;
  onCancel: () => void;
  usedColors?: ColorToken[];
}) {
  const [product, setProduct] = useState<CustomProduct>(initial);
  const [tab, setTab] = useState<"basis" | "phasen" | "varianten">("basis");

  const allPhasesInProduct = useMemo(() => collectAllPhases(product), [product]);

  const handleSave = () => {
    if (!product.name.trim()) {
      alert("Bitte einen Produktnamen eingeben.");
      return;
    }
    onSave(product);
  };

  const TABS = [
    { id: "basis", label: "Basis" },
    { id: "phasen", label: "Phasen" },
    { id: "varianten", label: "Varianten" },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-zinc-100">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-[56vh] overflow-y-auto pr-1">
        {/* ── TAB: Basis ───────────────────────────────────────────────── */}
        {tab === "basis" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500">Name</label>
              <input
                type="text"
                value={product.name}
                onChange={(e) => setProduct({ ...product, name: e.target.value })}
                placeholder="z.B. Wato Kasse"
                autoFocus
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500">Beschreibung</label>
              <input
                type="text"
                value={product.description ?? ""}
                onChange={(e) => setProduct({ ...product, description: e.target.value })}
                placeholder="Kurze Beschreibung..."
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500">Farbe</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_TOKENS.filter((c) => c === product.color || !usedColors.includes(c)).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setProduct({ ...product, color: c })}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      product.color === c
                        ? "border-zinc-400 bg-zinc-100 text-zinc-900 ring-2 ring-zinc-300"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${COLOR_DOT[c]}`} />
                    {COLOR_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Phasen ──────────────────────────────────────────────── */}
        {tab === "phasen" && (
          <div>
            <p className="mb-3 text-xs text-zinc-500">
              Basis-Phasen sind immer im Projektablauf vorhanden — unabhängig von Varianten.
            </p>
            <PhasesSection
              phases={product.phases}
              connections={product.connections}
              allPhases={allPhasesInProduct}
              onPhasesChange={(phases) => setProduct({ ...product, phases })}
              onConnectionsChange={(connections) => setProduct({ ...product, connections })}
            />
          </div>
        )}

        {/* ── TAB: Varianten ────────────────────────────────────────────── */}
        {tab === "varianten" && (
          <div>
            <p className="mb-3 text-xs text-zinc-500">
              Optionale Erweiterungen. Jede Variante kann eigene Phasen, Verbindungen und
              beliebig tiefe Sub-Varianten haben.
            </p>
            <div className="space-y-2">
              {product.variants.map((v) => (
                <VariantSection
                  key={v.id}
                  variant={v}
                  allPhasesInProduct={allPhasesInProduct}
                  onUpdate={(updated) =>
                    setProduct({
                      ...product,
                      variants: product.variants.map((pv) => (pv.id === v.id ? updated : pv)),
                    })
                  }
                  onDelete={() =>
                    setProduct({
                      ...product,
                      variants: product.variants.filter((pv) => pv.id !== v.id),
                    })
                  }
                  depth={0}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  setProduct({ ...product, variants: [...product.variants, emptyVariant()] })
                }
                className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
              >
                + Variante hinzufügen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}

// ─── ProductManagerModal (list + editor) ─────────────────────────────────────

type ProductManagerProps = {
  onClose: () => void;
};

export function ProductManagerModal({ onClose }: ProductManagerProps) {
  const [products, setProducts] = useState<CustomProduct[]>(loadCustomProducts);
  const [editing, setEditing] = useState<CustomProduct | null>(null); // null = list view
  const [isCreating, setIsCreating] = useState(false);

  const refresh = () => setProducts(loadCustomProducts());

  const handleSave = (product: CustomProduct) => {
    const existing = loadCustomProducts();
    const idx = existing.findIndex((p) => p.id === product.id);
    const updated =
      idx >= 0
        ? existing.map((p) => (p.id === product.id ? product : p))
        : [...existing, product];
    saveCustomProducts(updated);
    refresh();
    setEditing(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Produkt wirklich löschen?")) return;
    saveCustomProducts(loadCustomProducts().filter((p) => p.id !== id));
    refresh();
  };

  // ── Editor view ────────────────────────────────────────────────────────────
  if (editing !== null || isCreating) {
    const usedColors = products.filter((p) => p.id !== (editing?.id ?? "__new__")).map((p) => p.color);
    const firstFree = COLOR_TOKENS.find((c) => !usedColors.includes(c)) ?? "sky";
    const initial = isCreating
      ? { id: newId(), name: "", description: "", color: firstFree, phases: [], connections: [], variants: [] }
      : editing!;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setEditing(null); setIsCreating(false); }}
            className="text-xs text-zinc-400 hover:text-zinc-700"
          >
            ← Zurück
          </button>
          <h2 className="text-lg font-semibold text-zinc-900">
            {isCreating ? "Neues Produkt" : `Bearbeitung: ${editing?.name}`}
          </h2>
        </div>
        <ProductEditorForm
          initial={initial}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setIsCreating(false); }}
          usedColors={usedColors}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Eigene Produkte</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Definiere Produktabläufe mit Phasen und Varianten.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          + Neues Produkt
        </button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center">
          <p className="text-sm font-semibold text-zinc-400">Noch keine eigenen Produkte.</p>
          <p className="mt-1 text-xs text-zinc-300">Erstelle dein erstes Produkt mit dem Button oben.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {products.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl border p-4 ${COLOR_BG[p.color]}`}
            >
              <span className={`h-3 w-3 shrink-0 rounded-full ${COLOR_DOT[p.color]}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900">{p.name}</p>
                {p.description && (
                  <p className="text-xs text-zinc-500">{p.description}</p>
                )}
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {p.phases.length} Phasen · {p.variants.length} Varianten
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
        >
          Schliessen
        </button>
      </div>
    </div>
  );
}
