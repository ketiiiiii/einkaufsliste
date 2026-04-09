// scripts/import-from-json.mjs
// Importiert ein Produkt-JSON (Format: { product, phases }) in die TaskBoardState-DB.
// Verwendung: node ./scripts/import-from-json.mjs [pfad/zur/datei.json]

import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PHASE_COLORS = ['amber', 'sky', 'rose', 'emerald', 'violet', 'orange', 'teal', 'indigo', 'amber', 'sky', 'rose'];

let connSeq = 0;
function makeId(prefix) {
  return `${prefix}-${++connSeq}-${Date.now()}`;
}

function toDays(h) {
  return Math.max(0.125, Math.round((h / 8) * 100) / 100);
}

/**
 * Topologische Sortierung → Gitter-Positionen.
 * @param {string[]} ids
 * @param {{ from: string, to: string }[]} edges
 * @returns {Map<string, { x: number, y: number }>}
 */
function computePositions(ids, edges) {
  const COL_W = 300, GAP_X = 60, CARD_H = 140, GAP_Y = 30, PAD = 40;
  const idSet = new Set(ids);
  const ch = new Map(ids.map(id => [id, []]));
  const deg = new Map(ids.map(id => [id, 0]));

  for (const { from, to } of edges) {
    if (!idSet.has(from) || !idSet.has(to)) continue;
    ch.get(from).push(to);
    deg.set(to, (deg.get(to) || 0) + 1);
  }

  const col = new Map();
  const q = ids.filter(id => (deg.get(id) || 0) === 0);
  for (const id of q) col.set(id, 0);

  while (q.length) {
    const id = q.shift();
    for (const c of ch.get(id) || []) {
      col.set(c, Math.max(col.get(c) ?? 0, (col.get(id) || 0) + 1));
      q.push(c);
    }
  }
  for (const id of ids) if (!col.has(id)) col.set(id, 0);

  const groups = new Map();
  for (const id of ids) {
    const c = col.get(id);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(id);
  }

  const pos = new Map();
  for (const [c, gids] of groups) {
    gids.forEach((id, r) => pos.set(id, { x: PAD + c * (COL_W + GAP_X), y: PAD + r * (CARD_H + GAP_Y) }));
  }
  return pos;
}

/** "P2:2.3.1" → "P2" */
function phaseOf(compositeId) {
  return compositeId.split(':')[0];
}

/** "P2:2.3.1" für Phase "P2" → "2.3.1"; andernfalls null */
function localOf(compositeId, phaseId) {
  if (compositeId.startsWith(phaseId + ':')) {
    return compositeId.slice(phaseId.length + 1);
  }
  return null;
}

/**
 * Baut ein subBoard für Unteraufgaben (3. Ebene).
 */
function buildSubtaskBoard(subtasks, phaseColor = 'amber') {
  if (!subtasks?.length) return null;
  const ids = subtasks.map(s => s.id);
  const idSet = new Set(ids);
  const edges = [];
  const conns = [];

  for (const st of subtasks) {
    for (const pred of (st.predecessors || [])) {
      // Letztes Segment des Composite-IDs: "P2:2.3.1" → "2.3.1"
      const parts = pred.split(':');
      const localId = parts[parts.length - 1];
      if (idSet.has(localId)) {
        const lag = st.lag_h || 0;
        edges.push({ from: localId, to: st.id });
        const c = { id: makeId('sc'), from: localId, to: st.id };
        if (lag > 0) { c.lag = lag; c.lagUnit = 'h'; }
        conns.push(c);
      }
    }
  }

  const pos = computePositions(ids, edges);
  const tasks = subtasks.map(st => {
    const p = pos.get(st.id) || { x: 40, y: 40 };
    return {
      id: st.id,
      title: st.title,
      ...(st.note ? { note: st.note } : {}),
      color: phaseColor,
      duration: toDays(st.duration_h),
      x: p.x,
      y: p.y,
    };
  });

  return { tasks, connections: conns };
}

/**
 * Baut das subBoard einer Phase (2. Ebene: Tasks).
 */
function buildPhaseSubBoard(phase, phaseColor = 'amber') {
  const children = phase.children || [];
  if (!children.length) return { tasks: [], connections: [] };

  const ids = children.map(c => c.id);
  const idSet = new Set(ids);
  const edges = [];
  const conns = [];

  for (const task of children) {
    for (const pred of (task.predecessors || [])) {
      const localId = localOf(pred, phase.id);
      if (localId && idSet.has(localId)) {
        const lag = task.lag_h || 0;
        edges.push({ from: localId, to: task.id });
        const c = { id: makeId('tc'), from: localId, to: task.id };
        if (lag > 0) { c.lag = lag; c.lagUnit = 'h'; }
        conns.push(c);
      }
    }
  }

  // Loop-Back-Verbindungen (Back-Edges für iterative Zyklen) — werden NACH der Position
  // berechnet, damit sie den topologischen Sort nicht stören.
  for (const loop of (phase.loopConnections || [])) {
    const c = { id: makeId('lc'), from: loop.from, to: loop.to };
    if (loop.loopDuration) { c.loopDuration = loop.loopDuration; c.loopDurationUnit = loop.loopDurationUnit || 'h'; }
    conns.push(c);
  }

  const pos = computePositions(ids, edges);
  const tasks = children.map(task => {
    const p = pos.get(task.id) || { x: 40, y: 40 };
    const t = {
      id: task.id,
      title: task.title,
      ...(task.note ? { note: task.note } : {}),
      color: phaseColor,
      duration: toDays(task.duration_h),
      x: p.x,
      y: p.y,
    };
    if (task.children?.length) {
      t.subBoard = buildSubtaskBoard(task.children, phaseColor);
    }
    return t;
  });

  return { tasks, connections: conns };
}

async function run() {
  const jsonPath = process.argv[2] || path.join(process.cwd(), 'docs', 'master-thesis-plan.json');
  console.log(`Lese: ${jsonPath}`);
  const raw = await fs.readFile(jsonPath, 'utf8');
  const { product: meta, phases } = JSON.parse(raw);

  const phaseIdSet = new Set(phases.map(p => p.id));

  // Wurzel-Verbindungen aufbauen
  const rootEdges = [];
  const rootConns = [];
  const addedPhasePairs = new Set();

  for (const phase of phases) {
    for (const task of (phase.children || [])) {
      for (const pred of (task.predecessors || [])) {
        const predPhase = phaseOf(pred);
        const isWholePhase = phaseIdSet.has(pred); // z.B. "P3" direkt

        if (isWholePhase) {
          // Phasen-zu-Phasen-Verbindung
          const pairKey = `${pred}->${phase.id}`;
          if (!addedPhasePairs.has(pairKey)) {
            addedPhasePairs.add(pairKey);
            rootEdges.push({ from: pred, to: phase.id });
            rootConns.push({ id: makeId('pc'), from: pred, to: phase.id });
          }
          // Auch task-genaue Verbindung: "P3" → "P8:8.3"
          const compositeTo = `${phase.id}:${task.id}`;
          rootEdges.push({ from: pred, to: compositeTo });
          const c = { id: makeId('xc'), from: pred, to: compositeTo };
          const lag = task.lag_h || 0;
          if (lag > 0) { c.lag = lag; c.lagUnit = 'h'; }
          rootConns.push(c);

        } else if (predPhase !== phase.id && phaseIdSet.has(predPhase)) {
          // Phasenübergreifende Task-Verbindung: "P1:1.5" → "P2:2.1"
          const pairKey = `${predPhase}->${phase.id}`;
          if (!addedPhasePairs.has(pairKey)) {
            addedPhasePairs.add(pairKey);
            rootEdges.push({ from: predPhase, to: phase.id });
            rootConns.push({ id: makeId('pc'), from: predPhase, to: phase.id });
          }
          const compositeTo = `${phase.id}:${task.id}`;
          rootEdges.push({ from: pred, to: compositeTo });
          const c = { id: makeId('xc'), from: pred, to: compositeTo };
          const lag = task.lag_h || 0;
          if (lag > 0) { c.lag = lag; c.lagUnit = 'h'; }
          rootConns.push(c);
        }
      }
    }
  }

  // Phase-Layout anhand der Phasen-Verbindungen
  const phaseEdges = rootEdges.filter(e => phaseIdSet.has(e.from) && phaseIdSet.has(e.to));
  const phasePos = computePositions(phases.map(p => p.id), phaseEdges);

  const phaseTasks = phases.map((phase, phaseIndex) => {
    const pos = phasePos.get(phase.id) || { x: 40, y: 40 };
    const phaseColor = PHASE_COLORS[phaseIndex % PHASE_COLORS.length];
    return {
      id: phase.id,
      title: phase.title,
      ...(phase.note ? { note: phase.note } : {}),
      color: phaseColor,
      duration: toDays(phase.duration_h),
      x: pos.x,
      y: pos.y,
      subBoard: buildPhaseSubBoard(phase, phaseColor),
    };
  });

  const groupId = `grp-ms`;
  const productId = meta.id || 'prd-master-theses';
  const product = {
    id: productId,
    name: meta.name,
    groups: [{
      id: groupId,
      name: 'MS',
      boardState: { tasks: phaseTasks, connections: rootConns },
      children: [],
      phasesEnabled: true,
    }],
    activeGroupId: groupId,
  };

  const user = await prisma.user.findFirst();
  if (!user) { console.error('Kein Benutzer gefunden.'); process.exit(1); }

  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  let state = null;
  if (row?.stateJson) {
    try { state = JSON.parse(row.stateJson); } catch { state = null; }
  }
  if (!state || !Array.isArray(state.products)) {
    state = { products: [product], activeProductId: productId };
  } else {
    state.products = state.products.filter(p => p.id !== product.id);
    state.products.push(product);
    state.activeProductId = productId;
  }

  await prisma.taskBoardState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, stateJson: JSON.stringify(state) },
    update: { stateJson: JSON.stringify(state) },
  });

  console.log(`✓ Produkt "${meta.name}" für ${user.email || user.id} gespeichert.`);
  console.log(`  Phasen: ${phases.length}`);
  console.log(`  Wurzel-Verbindungen: ${rootConns.length}`);
  console.log(`    davon Phasen-Phasen:    ${rootConns.filter(c => phaseIdSet.has(c.from) && phaseIdSet.has(c.to)).length}`);
  console.log(`    davon task-übergreifend: ${rootConns.filter(c => !phaseIdSet.has(c.from) || !phaseIdSet.has(c.to)).length}`);

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
