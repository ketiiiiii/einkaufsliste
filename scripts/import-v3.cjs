// Quick import script for v3 plan
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

const PHASE_COLORS = ['amber', 'sky', 'rose', 'emerald', 'violet', 'orange', 'teal', 'indigo'];
let connSeq = 0;
function makeId(prefix) { return prefix + '-' + (++connSeq) + '-' + Date.now(); }
function toDays(h) { return Math.max(0.125, Math.round((h / 8) * 100) / 100); }

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
      col.set(c, Math.max(col.get(c) || 0, (col.get(id) || 0) + 1));
      q.push(c);
    }
  }
  for (const id of ids) if (!col.has(id)) col.set(id, 0);
  const groups = new Map();
  for (const id of ids) { const c = col.get(id); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(id); }
  const pos = new Map();
  for (const [c, gids] of groups) {
    gids.forEach((id, r) => pos.set(id, { x: PAD + c * (COL_W + GAP_X), y: PAD + r * (CARD_H + GAP_Y) }));
  }
  return pos;
}

function buildSubtaskBoard(subtasks, phaseColor) {
  if (!subtasks || !subtasks.length) return null;
  const ids = subtasks.map(s => s.id);
  const idSet = new Set(ids);
  const edges = [], conns = [];
  for (const st of subtasks) {
    for (const pred of (st.predecessors || [])) {
      const parts = pred.split(':');
      const localId = parts[parts.length - 1];
      if (idSet.has(localId)) {
        edges.push({ from: localId, to: st.id });
        const c = { id: makeId('sc'), from: localId, to: st.id };
        if (st.lag_h > 0) { c.lag = st.lag_h; c.lagUnit = 'h'; }
        conns.push(c);
      }
    }
  }
  const pos = computePositions(ids, edges);
  return {
    tasks: subtasks.map(st => {
      const p = pos.get(st.id) || { x: 40, y: 40 };
      return { id: st.id, title: st.title, color: phaseColor, duration: toDays(st.duration_h), x: p.x, y: p.y };
    }),
    connections: conns,
  };
}

function buildPhaseSubBoard(phase, phaseColor) {
  const children = phase.children || [];
  if (!children.length) return { tasks: [], connections: [] };
  const ids = children.map(c => c.id);
  const idSet = new Set(ids);
  const edges = [], conns = [];
  for (const task of children) {
    for (const pred of (task.predecessors || [])) {
      const localId = pred.startsWith(phase.id + ':') ? pred.slice(phase.id.length + 1) : null;
      if (localId && idSet.has(localId)) {
        edges.push({ from: localId, to: task.id });
        const c = { id: makeId('tc'), from: localId, to: task.id };
        if (task.lag_h > 0) { c.lag = task.lag_h; c.lagUnit = 'h'; }
        conns.push(c);
      }
    }
  }
  const pos = computePositions(ids, edges);
  return {
    tasks: children.map(task => {
      const p = pos.get(task.id) || { x: 40, y: 40 };
      const t = { id: task.id, title: task.title, color: phaseColor, duration: toDays(task.duration_h), x: p.x, y: p.y };
      if (task.children && task.children.length) t.subBoard = buildSubtaskBoard(task.children, phaseColor);
      return t;
    }),
    connections: conns,
  };
}

async function run() {
  const raw = fs.readFileSync('docs/master-thesis-plan-v3.json', 'utf8');
  const { product: meta, phases } = JSON.parse(raw);
  const phaseIdSet = new Set(phases.map(p => p.id));

  const rootEdges = [], rootConns = [];
  const addedPairs = new Set();

  for (const phase of phases) {
    for (const task of (phase.children || [])) {
      for (const pred of (task.predecessors || [])) {
        const predPhase = pred.split(':')[0];
        if (predPhase !== phase.id && phaseIdSet.has(predPhase)) {
          const pairKey = predPhase + '->' + phase.id;
          if (!addedPairs.has(pairKey)) {
            addedPairs.add(pairKey);
            rootEdges.push({ from: predPhase, to: phase.id });
            rootConns.push({ id: makeId('pc'), from: predPhase, to: phase.id });
          }
          // Cross-phase task connection
          const compositeTo = phase.id + ':' + task.id;
          const c = { id: makeId('xc'), from: pred, to: compositeTo };
          if (task.lag_h > 0) { c.lag = task.lag_h; c.lagUnit = 'h'; }
          rootConns.push(c);
        }
      }
    }
  }

  const phaseEdges = rootEdges.filter(e => phaseIdSet.has(e.from) && phaseIdSet.has(e.to));
  const phasePos = computePositions(phases.map(p => p.id), phaseEdges);

  const phaseTasks = phases.map((phase, i) => {
    const pos = phasePos.get(phase.id) || { x: 40, y: 40 };
    const color = PHASE_COLORS[i % PHASE_COLORS.length];
    return {
      id: phase.id,
      title: phase.title,
      color: color,
      duration: toDays(phase.duration_h),
      x: pos.x,
      y: pos.y,
      subBoard: buildPhaseSubBoard(phase, color),
    };
  });

  const groupId = 'grp-ms';
  const productId = meta.id || 'prd-master-thesis';
  const product = {
    id: productId,
    name: meta.name,
    groups: [{ id: groupId, name: 'MS', boardState: { tasks: phaseTasks, connections: rootConns }, children: [], phasesEnabled: true }],
    activeGroupId: groupId,
  };

  const user = await prisma.user.findFirst();
  if (!user) { console.error('No user'); process.exit(1); }

  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  let state = null;
  if (row && row.stateJson) { try { state = JSON.parse(row.stateJson); } catch {} }
  if (!state || !Array.isArray(state.products)) state = { products: [product], activeProductId: productId };
  else { state.products = state.products.filter(p => p.id !== product.id); state.products.push(product); state.activeProductId = productId; }

  await prisma.taskBoardState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, stateJson: JSON.stringify(state) },
    update: { stateJson: JSON.stringify(state) },
  });
  
  console.log('Done:', meta.name, 'for', user.email);
  console.log('Phases:', phases.length, '| Root connections:', rootConns.length);
  await prisma.$disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
