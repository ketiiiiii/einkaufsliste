// scripts/import-v3-direct.mjs
// Baut den Board-State aus v3-JSON, schreibt direkt in SQLite via @prisma/client
// Muss als ESM mit dem richtigen Prisma-Output laufen.
//
// Usage: node --experimental-modules scripts/import-v3-direct.mjs

import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PHASE_COLORS = ['amber','sky','rose','emerald','violet','orange','teal','indigo'];
let seq = 0;
const mid = (p) => `${p}-${++seq}-${Date.now()}`;
const toD = (h) => Math.max(0.125, Math.round((h / 8) * 100) / 100);

function compPos(ids, edges) {
  const W = 300, GX = 60, H = 140, GY = 30, P = 40;
  const s = new Set(ids);
  const ch = new Map(ids.map(i => [i, []]));
  const dg = new Map(ids.map(i => [i, 0]));
  for (const { from: f, to: t } of edges) {
    if (!s.has(f) || !s.has(t)) continue;
    ch.get(f).push(t);
    dg.set(t, (dg.get(t) || 0) + 1);
  }
  const col = new Map();
  const q = ids.filter(i => (dg.get(i) || 0) === 0);
  for (const i of q) col.set(i, 0);
  while (q.length) {
    const i = q.shift();
    for (const c of ch.get(i) || []) {
      col.set(c, Math.max(col.get(c) || 0, (col.get(i) || 0) + 1));
      q.push(c);
    }
  }
  for (const i of ids) if (!col.has(i)) col.set(i, 0);
  const g = new Map();
  for (const i of ids) {
    const c = col.get(i);
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(i);
  }
  const pos = new Map();
  for (const [c, gi] of g) gi.forEach((i, r) => pos.set(i, { x: P + c * (W + GX), y: P + r * (H + GY) }));
  return pos;
}

function buildSub(subs, clr) {
  if (!subs || !subs.length) return null;
  const ids = subs.map(s => s.id), iS = new Set(ids), ed = [], co = [];
  for (const st of subs) {
    for (const pr of (st.predecessors || [])) {
      const l = pr.split(':').pop();
      if (iS.has(l)) {
        ed.push({ from: l, to: st.id });
        const c = { id: mid('sc'), from: l, to: st.id };
        if (st.lag_h > 0) { c.lag = st.lag_h; c.lagUnit = 'h'; }
        co.push(c);
      }
    }
  }
  const pos = compPos(ids, ed);
  return {
    tasks: subs.map(s => {
      const p = pos.get(s.id) || { x: 40, y: 40 };
      return { id: s.id, title: s.title, color: clr, duration: toD(s.duration_h), x: p.x, y: p.y };
    }),
    connections: co,
  };
}

function buildPhSub(ph, clr) {
  const ch = ph.children || [];
  if (!ch.length) return { tasks: [], connections: [] };
  const ids = ch.map(c => c.id), iS = new Set(ids), ed = [], co = [];
  for (const t of ch) {
    for (const pr of (t.predecessors || [])) {
      const l = pr.startsWith(ph.id + ':') ? pr.slice(ph.id.length + 1) : null;
      if (l && iS.has(l)) {
        ed.push({ from: l, to: t.id });
        const c = { id: mid('tc'), from: l, to: t.id };
        if (t.lag_h > 0) { c.lag = t.lag_h; c.lagUnit = 'h'; }
        co.push(c);
      }
    }
  }
  const pos = compPos(ids, ed);
  return {
    tasks: ch.map(t => {
      const p = pos.get(t.id) || { x: 40, y: 40 };
      const r = { id: t.id, title: t.title, color: clr, duration: toD(t.duration_h), x: p.x, y: p.y };
      if (t.children && t.children.length) r.subBoard = buildSub(t.children, clr);
      return r;
    }),
    connections: co,
  };
}

async function run() {
  const plan = JSON.parse(fs.readFileSync('docs/master-thesis-plan-v3.json', 'utf8'));
  const phases = plan.phases;
  const pIS = new Set(phases.map(p => p.id));
  const rE = [], rC = [], ap = new Set();

  for (const ph of phases) {
    for (const t of (ph.children || [])) {
      for (const pr of (t.predecessors || [])) {
        const pp = pr.split(':')[0];
        if (pp !== ph.id && pIS.has(pp)) {
          const pk = `${pp}->${ph.id}`;
          if (!ap.has(pk)) {
            ap.add(pk);
            rE.push({ from: pp, to: ph.id });
            rC.push({ id: mid('pc'), from: pp, to: ph.id });
          }
          const c = { id: mid('xc'), from: pr, to: `${ph.id}:${t.id}` };
          if (t.lag_h > 0) { c.lag = t.lag_h; c.lagUnit = 'h'; }
          rC.push(c);
        }
      }
    }
  }

  const pE = rE.filter(e => pIS.has(e.from) && pIS.has(e.to));
  const pP = compPos(phases.map(p => p.id), pE);
  const pT = phases.map((ph, i) => {
    const p = pP.get(ph.id) || { x: 40, y: 40 };
    const clr = PHASE_COLORS[i % 8];
    return { id: ph.id, title: ph.title, color: clr, duration: toD(ph.duration_h), x: p.x, y: p.y, subBoard: buildPhSub(ph, clr) };
  });

  const productId = plan.product.id;
  const product = {
    id: productId,
    name: plan.product.name,
    groups: [{ id: 'grp-ms', name: 'MS', boardState: { tasks: pT, connections: rC }, children: [], phasesEnabled: true }],
    activeGroupId: 'grp-ms',
  };

  const user = await prisma.user.findFirst();
  if (!user) { console.error('No user found'); process.exit(1); }

  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  let state = null;
  if (row?.stateJson) { try { state = JSON.parse(row.stateJson); } catch { /* ignore */ } }
  if (!state || !Array.isArray(state.products)) {
    state = { products: [product], activeProductId: productId };
  } else {
    state.products = state.products.filter(p => p.id !== productId);
    state.products.push(product);
    state.activeProductId = productId;
  }

  await prisma.taskBoardState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, stateJson: JSON.stringify(state) },
    update: { stateJson: JSON.stringify(state) },
  });

  console.log(`Done: "${plan.product.name}" for ${user.email}`);
  console.log(`Phases: ${phases.length} | Root connections: ${rC.length}`);
  await prisma.$disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
