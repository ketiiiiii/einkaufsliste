import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

type CsvRow = string[];

function toDays(h: string) {
  const n = parseFloat(h) || 0;
  return Math.max(0.125, Math.round((n / 8) * 100) / 100);
}

function parseCsv(raw: string) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  lines.shift(); // drop header
  const rows: CsvRow[] = lines.map((l) => l.split(";"));
  const phases = rows.map((cols) => {
    const [id, parent, ebene, title, dauer_h, liege, vorg, iter, note] = cols;
    return {
      id: (id || "").trim(),
      parent: (parent || "").trim(),
      title: (title || id || "").trim(),
      note: (note || "").trim(),
      duration: toDays(dauer_h || "0"),
    };
  });
  const connections: { from: string; to: string }[] = [];
  rows.forEach((cols) => {
    const [id, parent, , , , , vorg] = cols;
    const cleanId = (id || "").trim();
    if (parent && parent.trim()) connections.push({ from: parent.trim(), to: cleanId });
    if (vorg && vorg.trim()) {
      const preds = vorg.split(",").map((s) => s.trim()).filter(Boolean);
      preds.forEach((p) => connections.push({ from: p, to: cleanId }));
    }
  });
  return { phases, connections };
}

// compute simple topological columns (like the client generator)
function computeColumns(phases: { id: string }[], conns: { from: string; to: string }[]) {
  const children = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const p of phases) { children.set(p.id, []); inDeg.set(p.id, 0); }
  for (const c of conns) {
    if (!children.has(c.from) || !inDeg.has(c.to)) continue;
    children.get(c.from)!.push(c.to);
    inDeg.set(c.to, (inDeg.get(c.to) ?? 0) + 1);
  }
  const col = new Map<string, number>();
  const q: string[] = [];
  for (const p of phases) if ((inDeg.get(p.id) ?? 0) === 0) { col.set(p.id, 0); q.push(p.id); }
  while (q.length > 0) {
    const id = q.shift()!;
    const c = col.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      col.set(child, Math.max(col.get(child) ?? 0, c + 1));
      q.push(child);
    }
  }
  for (const p of phases) if (!col.has(p.id)) col.set(p.id, 0);
  return col;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const csvPath = path.join(process.cwd(), "docs", "master-thesis-plan.csv");
    const raw = await fs.readFile(csvPath, "utf8");
    const { phases, connections } = parseCsv(raw);

    // map phases -> TaskCard
    const colMap = computeColumns(phases, connections);
    const COL_W = 300, GAP_X = 60, CARD_H = 140, GAP_Y = 30, PAD = 40;
    const colGroups = new Map<number, string[]>();
    for (const p of phases) {
      const c = colMap.get(p.id) ?? 0;
      if (!colGroups.has(c)) colGroups.set(c, []);
      colGroups.get(c)!.push(p.id);
    }
    const tasks: any[] = [];
    for (const [c, ids] of colGroups) {
      ids.forEach((id, row) => {
        const ph = phases.find((x) => x.id === id)!;
        tasks.push({
          id: ph.id,
          title: ph.title,
          note: ph.note,
          color: "amber",
          duration: ph.duration,
          x: PAD + c * (COL_W + GAP_X),
          y: PAD + row * (CARD_H + GAP_Y),
        });
      });
    }
    const conns = connections.map((c, i) => ({ id: `c-${i}-${Date.now()}`, from: c.from, to: c.to }));

    const groupId = `grp-ms-${Date.now()}`;
    const productId = `prd-master-theses`;
    const product = {
      id: productId,
      name: "Master Theses",
      groups: [ { id: groupId, name: "MS", boardState: { tasks, connections: conns }, children: [], phasesEnabled: true } ],
      activeGroupId: groupId,
    };

    // load existing state for user
    const row = await prisma.taskBoardState.findUnique({ where: { userId } });
    let state: any = null;
    if (row?.stateJson) {
      try { state = JSON.parse(row.stateJson); } catch { state = null; }
    }
    if (!state || !Array.isArray(state.products)) {
      state = { products: [product], activeProductId: productId };
    } else {
      // remove existing product with same id
      const filtered = state.products.filter((p: any) => p.id !== product.id);
      filtered.push(product);
      state.products = filtered;
      state.activeProductId = productId;
    }

    await prisma.taskBoardState.upsert({
      where: { userId },
      create: { userId, stateJson: JSON.stringify(state) },
      update: { stateJson: JSON.stringify(state) },
    });

    return NextResponse.json({ ok: true, productId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
