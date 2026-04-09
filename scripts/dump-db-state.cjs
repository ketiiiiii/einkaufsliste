const { PrismaClient } = require('@prisma/client');
async function main() {
  const p = new PrismaClient();
  try {
    const r = await p.taskBoardState.findFirst();
    if (!r) { console.log('No state found'); return; }
    const d = JSON.parse(r.stateJson);
    console.log('Keys:', Object.keys(d));
    // Navigate to boardState inside product structure  
    let board = d;
    if (d.products) {
      const prod = d.products.find(p => p.id === 'prd-master-thesis');
      if (prod) {
        const grp = (prod.groups || []).find(g => g.id === 'grp-ms');
        if (grp && grp.boardState) board = grp.boardState;
      }
    }
    if (!board.tasks) { console.log('No tasks found in board'); return; }
    console.log('Tasks:', board.tasks.length);
    for (const t of board.tasks) {
      console.log(t.id, '|', t.title, '| color:', t.color, '| dur:', t.duration, t.unit);
      if (t.subBoard?.tasks) {
        for (const s of t.subBoard.tasks) {
          console.log('  ', s.id, '|', s.title, '| color:', s.color, '| dur:', s.duration, s.unit, '| note:', (s.note || '').substring(0, 80));
        }
      }
    }
  } finally { await p.$disconnect(); }
}
main();
