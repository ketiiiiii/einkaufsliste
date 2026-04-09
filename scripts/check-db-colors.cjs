const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const r = await p.taskBoardState.findFirst();
  const d = JSON.parse(r.stateJson);
  const bs = d.products[0].groups[0].boardState;

  const HOURS_PER_DAY = 8;
  const toH = (d, u) => u === 'h' ? d : d * HOURS_PER_DAY;
  const effH = t => toH(t.duration ?? 1, t.unit) * Math.max(1, t.iterations ?? 1);
  const lagH = (l, u) => l ? (u === 'd' ? l * HOURS_PER_DAY : l) : 0;

  // Build flat tasks + conns
  const flatT = [], flatC = [];
  for (const ph of bs.tasks) {
    if (!ph.subBoard?.tasks?.length) continue;
    for (const st of ph.subBoard.tasks) flatT.push({ ...st, id: `${ph.id}:${st.id}` });
    for (const c of (ph.subBoard.connections || []))
      flatC.push({ ...c, id: `_s_${ph.id}:${c.id}`, from: `${ph.id}:${c.from}`, to: `${ph.id}:${c.to}` });
  }
  for (const c of bs.connections) {
    if (c.from.includes(':') && c.to.includes(':')) flatC.push(c);
  }

  // findBackEdges
  const ids = flatT.map(t => t.id);
  const idSet = new Set(ids);
  const adj = new Map();
  const connKey = new Map();
  for (const id of ids) adj.set(id, []);
  for (const c of flatC) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    adj.get(c.from).push(c.to);
    connKey.set(`${c.from}:${c.to}`, c.id);
  }
  const backEdges = new Set();
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(ids.map(id => [id, WHITE]));
  function dfs(u) {
    color.set(u, GRAY);
    for (const v of adj.get(u) || []) {
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

  const fwdC = flatC.filter(c => !backEdges.has(c.id));

  // CPM topo sort
  const succs2 = new Map(), preds2 = new Map(), inDeg2 = new Map();
  for (const id of ids) { succs2.set(id, []); preds2.set(id, []); inDeg2.set(id, 0); }
  for (const c of fwdC) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    succs2.get(c.from).push(c.to);
    preds2.get(c.to).push(c.from);
    inDeg2.set(c.to, (inDeg2.get(c.to) || 0) + 1);
  }
  const q = ids.filter(id => inDeg2.get(id) === 0);
  const topo = [];
  const deg = new Map(inDeg2);
  while (q.length) {
    const n = q.shift(); topo.push(n);
    for (const s of succs2.get(n) || []) { deg.set(s, deg.get(s) - 1); if (deg.get(s) === 0) q.push(s); }
  }

  // Forward pass
  const connLookup = new Map();
  for (const c of fwdC) connLookup.set(`${c.from}:${c.to}`, c);
  const ES = new Map(), EF = new Map();
  for (const id of topo) {
    const t = flatT.find(t => t.id === id);
    const dur = effH(t);
    const ps = preds2.get(id) || [];
    const es = ps.length === 0 ? 0 : Math.max(...ps.map(p => {
      const conn = connLookup.get(`${p}:${id}`);
      return (EF.get(p) || 0) + lagH(conn?.lag, conn?.lagUnit);
    }));
    ES.set(id, es);
    EF.set(id, es + dur);
  }

  // Apply loop adjustments
  for (const c of flatC) {
    if (!backEdges.has(c.id) || !c.loopDuration) continue;
    const loopH = toH(c.loopDuration, c.loopDurationUnit || 'h');
    const entryES = ES.get(c.to) || 0;
    const loopDL = entryES + loopH;
    const fAdj = new Map();
    for (const t of flatT) fAdj.set(t.id, []);
    for (const fc of fwdC) { if (idSet.has(fc.from) && idSet.has(fc.to)) fAdj.get(fc.from).push(fc.to); }
    const rfe = new Set();
    const stk = [c.to];
    while (stk.length) { const n = stk.pop(); if (rfe.has(n)) continue; rfe.add(n); for (const nb of fAdj.get(n) || []) stk.push(nb); }
    const ln = new Set();
    function cre(node, vis) {
      if (node === c.from) return true;
      if (vis.has(node)) return false; vis.add(node);
      return (fAdj.get(node) || []).some(nb => cre(nb, vis));
    }
    for (const n of rfe) { if (cre(n, new Set())) ln.add(n); }
    for (const t of flatT) {
      if (ln.has(t.id)) continue;
      const cur = ES.get(t.id) || 0;
      if (cur >= entryES && cur < loopDL) {
        ES.set(t.id, loopDL);
        EF.set(t.id, loopDL + effH(t));
      }
    }
  }

  // NEW: Re-propagate forward constraints after loop shifts
  for (const id of topo) {
    const ps = preds2.get(id) || [];
    if (ps.length === 0) continue;
    const minES = Math.max(...ps.map(p => {
      const conn = connLookup.get(`${p}:${id}`);
      return (EF.get(p) || 0) + lagH(conn?.lag, conn?.lagUnit);
    }));
    const curES = ES.get(id) || 0;
    if (minES > curES) {
      const t = flatT.find(t => t.id === id);
      ES.set(id, minES);
      EF.set(id, minES + effH(t));
    }
  }

  console.log('=== P4+P5 subtask ES/EF after loop + re-propagation ===');
  for (const t of flatT.filter(t => t.id.startsWith('P4:') || t.id.startsWith('P5:'))) {
    console.log(t.id.padEnd(10), t.title.substring(0, 35).padEnd(37), 'ES:', String(ES.get(t.id)).padStart(5), 'EF:', String(EF.get(t.id)).padStart(5));
  }

  // Check: no task should start before its predecessor ends
  let violations = 0;
  for (const c of fwdC) {
    if (!idSet.has(c.from) || !idSet.has(c.to)) continue;
    const predEF = EF.get(c.from) || 0;
    const lag = lagH(c.lag, c.lagUnit);
    const succES = ES.get(c.to) || 0;
    if (succES < predEF + lag - 0.001) {
      console.log('VIOLATION:', c.from, '(EF:', predEF, '+ lag:', lag, ') ->', c.to, '(ES:', succES, ')');
      violations++;
    }
  }
  console.log(violations === 0 ? '\nNo constraint violations.' : `\n${violations} violation(s) found!`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
