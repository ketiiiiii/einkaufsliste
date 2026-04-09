import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toDays(h) {
  const n = parseFloat(h) || 0;
  return Math.max(0.125, Math.round((n / 8) * 100) / 100);
}

async function readCsv() {
  const csvPath = path.join(process.cwd(), 'docs', 'master-thesis-plan.csv');
  const raw = await fs.readFile(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const header = lines.shift();
  const rows = lines.map(l => l.split(';'));
  const map = new Map();
  for (const cols of rows) {
    const [id, parent, ebene, title, dauer_h, liege, vorg, iter, note] = cols;
    const key = (id||'').trim();
    map.set(key, { id: key, parent: (parent||'').trim(), ebene: (ebene||'').trim(), title: (title||id||'').trim(), duration: toDays(dauer_h||'0'), vorg: (vorg||'').trim(), note: (note||'').trim() });
  }
  return map;
}

function collectChildren(map, parentId) {
  const out = [];
  for (const v of map.values()) if (v.parent === parentId) out.push(v.id);
  // sort to keep original order
  out.sort();
  return out;
}

function computeColumns(phases, conns) {
  const children = new Map();
  const inDeg = new Map();
  for (const p of phases) { children.set(p.id, []); inDeg.set(p.id, 0); }
  for (const c of conns) {
    if (!children.has(c.from) || !inDeg.has(c.to)) continue;
    children.get(c.from).push(c.to);
    inDeg.set(c.to, (inDeg.get(c.to)||0)+1);
  }
  const col = new Map();
  const q = [];
  for (const p of phases) if ((inDeg.get(p.id)||0)===0) { col.set(p.id,0); q.push(p.id); }
  while (q.length>0) {
    const id = q.shift();
    const c = col.get(id)||0;
    for (const child of children.get(id)||[]) { col.set(child, Math.max(col.get(child)||0, c+1)); q.push(child); }
  }
  for (const p of phases) if (!col.has(p.id)) col.set(p.id,0);
  return col;
}

function makeTask(id, title, note, duration, x, y) {
  return { id, title, note, color: 'amber', duration, x, y };
}

function buildSubBoard(map, parentId) {
  // immediate children
  const childIds = collectChildren(map, parentId);
  const phases = childIds.map(id => ({ id }));
  // build connections from vorg that are internal to this subBoard
  const conns = [];
  for (const id of childIds) {
    const node = map.get(id);
    if (!node) continue;
    if (node.vorg) {
      const preds = node.vorg.split(',').map(s=>s.trim()).filter(Boolean);
      for (const p of preds) if (childIds.includes(p)) conns.push({ from: p, to: id });
    }
  }

  const colMap = computeColumns(childIds.map(id=>({id})), conns);
  const COL_W = 300, GAP_X = 60, CARD_H = 140, GAP_Y = 30, PAD = 40;
  const colGroups = new Map();
  for (const id of childIds) {
    const c = colMap.get(id) || 0;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c).push(id);
  }

  const tasks = [];
  for (const [c, ids] of colGroups) {
    ids.forEach((id, row) => {
      const node = map.get(id);
      const task = makeTask(node.id, node.title, node.note, node.duration, PAD + c*(COL_W+GAP_X), PAD + row*(CARD_H+GAP_Y));
      // recursively add nested subBoard if this node has children
      const grandchildren = collectChildren(map, id);
      if (grandchildren.length > 0) {
        task.subBoard = buildSubBoard(map, id);
      }
      tasks.push(task);
    });
  }
  const connections = conns.map((c,i)=>({ id: `c-${parentId}-${i}-${Date.now()}`, from: c.from, to: c.to }));
  return { tasks, connections };
}

async function run() {
  const map = await readCsv();
  // top-level phases are entries with parent empty or parent starting with ''? We consider ids that start with 'P' as top phases
  const topPhaseIds = [];
  for (const v of map.values()) if (!v.parent || v.parent === '') { if (v.id && v.id.startsWith('P')) topPhaseIds.push(v.id); }
  topPhaseIds.sort();

  const COL_W = 300, GAP_X = 60, CARD_H = 140, GAP_Y = 30, PAD = 40;

  const tasks = [];
  const connections = [];
  for (const [pIndex, pid] of topPhaseIds.entries()) {
    const node = map.get(pid);
    const phaseChildren = collectChildren(map, pid);
    // create subBoard for this phase
    const subBoard = buildSubBoard(map, pid);
    const phaseTask = {
      id: pid,
      title: node ? node.title : pid,
      note: node ? node.note : '',
      color: 'amber',
      duration: node ? node.duration : 1,
      x: PAD + pIndex * (COL_W + GAP_X),
      y: PAD,
      subBoard,
    };
    tasks.push(phaseTask);
  }

  const conns = []; // root-level no connections between phases

  const groupId = `grp-ms-${Date.now()}`;
  const productId = `prd-master-theses`;
  const product = { id: productId, name: 'Master Theses', groups: [{ id: groupId, name: 'MS', boardState: { tasks, connections: conns }, children: [], phasesEnabled: true }], activeGroupId: groupId };

  const user = await prisma.user.findFirst();
  if (!user) { console.error('No user in DB'); process.exit(1); }
  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  let state = null;
  if (row?.stateJson) { try { state = JSON.parse(row.stateJson); } catch { state = null; } }
  if (!state || !Array.isArray(state.products)) state = { products: [product], activeProductId: productId };
  else { const filtered = state.products.filter(p => p.id !== product.id); filtered.push(product); state.products = filtered; state.activeProductId = productId; }

  await prisma.taskBoardState.upsert({ where: { userId: user.id }, create: { userId: user.id, stateJson: JSON.stringify(state) }, update: { stateJson: JSON.stringify(state) } });
  console.log('Repaired Master Theses structure for user', user.email || user.id);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
