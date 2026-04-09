import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines.map(l => l.split(';').map(c => (c||'').trim()));
}

async function run() {
  const csvPath = path.join(process.cwd(), 'docs', 'master-thesis-plan.csv');
  const raw = await fs.readFile(csvPath, 'utf8');
  const rows = parseCsv(raw);

  // collect phase ids (those starting with P)
  const phaseIds = rows.map(r=>r[0]).filter(id=>id && id.startsWith('P'));

  // connections: any row with parent -> id where parent is a phase, or Vorgänger referencing a phase
  const rootConns = [];
  for (const cols of rows) {
    const [id, parent, ebene, title, dauer_h, liege, vorg] = cols;
    const to = id;
    if (parent && phaseIds.includes(parent)) {
      rootConns.push({ from: parent, to });
    }
    if (vorg) {
      const preds = vorg.split(',').map(s=>s.trim()).filter(Boolean);
      for (const p of preds) if (phaseIds.includes(p)) rootConns.push({ from: p, to });
    }
  }

  if (rootConns.length === 0) {
    console.log('Keine Phase-Verbindungen gefunden.');
    await prisma.$disconnect();
    return;
  }

  // find taskBoardState for first user
  const user = await prisma.user.findFirst();
  if (!user) { console.error('Kein Benutzer in DB'); await prisma.$disconnect(); process.exit(1); }

  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  let state = null;
  if (row?.stateJson) {
    try { state = JSON.parse(row.stateJson); } catch { state = null; }
  }
  if (!state || !Array.isArray(state.products) || state.products.length === 0) {
    console.error('Kein Produktzustand gefunden im Board-State.');
    await prisma.$disconnect();
    return;
  }

  // try to find product 'Master Theses' else use active product
  let product = state.products.find(p => p.name === 'Master Theses') || state.products.find(p => p.id === state.activeProductId) || state.products[0];
  if (!product.groups || product.groups.length === 0) {
    console.error('Produkt hat keine Gruppen; Abbruch.');
    await prisma.$disconnect();
    return;
  }

  // choose active group or first
  const group = product.groups.find(g => g.id === product.activeGroupId) || product.groups[0];
  if (!group.boardState) group.boardState = { tasks: [], connections: [] };

  // map existing connection (from->to) to avoid duplicates
  const exists = new Set((group.boardState.connections || []).map(c => `${c.from}=>${c.to}`));
  const nextIndex = (group.boardState.connections || []).length;
  let i = nextIndex;
  for (const c of rootConns) {
    const key = `${c.from}=>${c.to}`;
    if (exists.has(key)) continue;
    group.boardState.connections.push({ id: `phase-c-${i++}-${Date.now()}`, from: c.from, to: c.to });
    exists.add(key);
  }

  // persist
  // replace product in state
  state.products = state.products.map(p => p.id === product.id ? product : p);
  await prisma.taskBoardState.upsert({ where: { userId: user.id }, create: { userId: user.id, stateJson: JSON.stringify(state) }, update: { stateJson: JSON.stringify(state) } });

  console.log('Phase-Verbindungen hinzugefügt:', i - nextIndex);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
