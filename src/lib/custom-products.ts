// ─── Custom Product Library ───────────────────────────────────────────────────
// User-defined products stored in localStorage.
// Each product has base phases, connections, and recursive variants.

import type { ColorToken, GeneratedBoard, GeneratedTask, GeneratedConnection } from "./product-library";

export type { ColorToken };

export type ProductPhase = {
  id: string;
  title: string;
  note?: string;
  duration: number; // Arbeitstage
};

export type PhaseConnection = {
  from: string; // phase id
  to: string;   // phase id
};

// Recursive: a variant can contain sub-variants indefinitely
export type ProductVariant = {
  id: string;
  label: string;
  description?: string;
  extraPhases: ProductPhase[];
  extraConnections: PhaseConnection[];
  subVariants: ProductVariant[];
};

export type CustomProduct = {
  id: string;
  name: string;
  description?: string;
  color: ColorToken;
  phases: ProductPhase[];         // base phases, always present
  connections: PhaseConnection[]; // base connections
  variants: ProductVariant[];
};

const STORAGE_KEY = "custom-products:v1";

export function loadCustomProducts(): CustomProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomProduct[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomProducts(products: CustomProduct[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

export function updateVariantById(
  variants: ProductVariant[],
  id: string,
  updater: (v: ProductVariant) => ProductVariant
): ProductVariant[] {
  return variants.map((v) => {
    if (v.id === id) return updater(v);
    return { ...v, subVariants: updateVariantById(v.subVariants, id, updater) };
  });
}

export function deleteVariantById(
  variants: ProductVariant[],
  id: string
): ProductVariant[] {
  return variants
    .filter((v) => v.id !== id)
    .map((v) => ({ ...v, subVariants: deleteVariantById(v.subVariants, id) }));
}

// Collect all phases from all levels of a product (base + every variant depth)
export function collectAllPhases(product: CustomProduct): ProductPhase[] {
  const all: ProductPhase[] = [...product.phases];
  function fromVariant(v: ProductVariant) {
    all.push(...v.extraPhases);
    v.subVariants.forEach(fromVariant);
  }
  product.variants.forEach(fromVariant);
  return all;
}

// ─── Board generator ──────────────────────────────────────────────────────────
// Generates task cards + connections with auto-layout (topological columns).

export function generateCustomBoard(
  product: CustomProduct,
  selectedVariantIds: Set<string>,
  productIndex: number
): GeneratedBoard {
  // 1. Collect active phases + connections
  const phases: ProductPhase[] = [...product.phases];
  const conns: PhaseConnection[] = [...product.connections];

  function applyVariant(v: ProductVariant) {
    if (!selectedVariantIds.has(v.id)) return;
    phases.push(...v.extraPhases);
    conns.push(...v.extraConnections);
    v.subVariants.forEach(applyVariant);
  }
  product.variants.forEach(applyVariant);

  // 2. Filter invalid connections (both endpoints must be active)
  const phaseIds = new Set(phases.map((p) => p.id));
  const validConns = conns.filter((c) => phaseIds.has(c.from) && phaseIds.has(c.to));

  // 3. Topological column assignment via Kahn's algorithm
  const children = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const p of phases) {
    children.set(p.id, []);
    inDeg.set(p.id, 0);
  }
  for (const c of validConns) {
    children.get(c.from)?.push(c.to);
    inDeg.set(c.to, (inDeg.get(c.to) ?? 0) + 1);
  }

  const col = new Map<string, number>();
  const q: string[] = [];
  for (const p of phases) {
    if ((inDeg.get(p.id) ?? 0) === 0) {
      col.set(p.id, 0);
      q.push(p.id);
    }
  }
  while (q.length > 0) {
    const id = q.shift()!;
    const c = col.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      col.set(child, Math.max(col.get(child) ?? 0, c + 1));
      q.push(child);
    }
  }
  // Handle disconnected phases (cycles or orphans → column 0)
  for (const p of phases) {
    if (!col.has(p.id)) col.set(p.id, 0);
  }

  // 4. Group by column, assign rows
  const colGroups = new Map<number, string[]>();
  for (const p of phases) {
    const c = col.get(p.id) ?? 0;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c)!.push(p.id);
  }

  const CARD_W = 224, GAP_X = 60, CARD_H = 130, GAP_Y = 30, PAD = 40;
  const COL_OFFSET = 1300; // horizontal offset per product block (matches product-library)

  // Track which variant each phase belongs to
  const phaseVariantLabel = new Map<string, string>();
  function trackVariant(v: ProductVariant) {
    if (!selectedVariantIds.has(v.id)) return;
    for (const p of v.extraPhases) phaseVariantLabel.set(p.id, v.label);
    v.subVariants.forEach(trackVariant);
  }
  product.variants.forEach(trackVariant);

  const taskMap = new Map<string, GeneratedTask>();
  for (const [c, ids] of colGroups) {
    ids.forEach((id, row) => {
      const phase = phases.find((p) => p.id === id)!;
      const vLabel = phaseVariantLabel.get(id);
      taskMap.set(id, {
        id: `${product.id}__${id}`,
        title: phase.title,
        note: phase.note,
        color: product.color,
        duration: phase.duration,
        x: PAD + c * (CARD_W + GAP_X) + productIndex * COL_OFFSET,
        y: PAD + row * (CARD_H + GAP_Y),
        productName: product.name,
        variantLabel: vLabel,
      });
    });
  }

  const tasks = [...taskMap.values()];
  const connections: GeneratedConnection[] = validConns.map((c, i) => ({
    id: `cc-${product.id}-${i}-${Date.now()}`,
    from: `${product.id}__${c.from}`,
    to: `${product.id}__${c.to}`,
  }));

  return { tasks, connections };
}
