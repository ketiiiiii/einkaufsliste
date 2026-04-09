import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run(){
  const user = await prisma.user.findFirst();
  if(!user){ console.error('No user'); process.exit(1); }
  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  if(!row?.stateJson){ console.error('No stateJson'); process.exit(1); }
  const state = JSON.parse(row.stateJson);
  const prod = (state.products||[]).find(p=>p.name==='Master Theses') || (state.products||[])[0];
  if(!prod){ console.error('No product'); process.exit(1); }
  const group = prod.groups.find(g=>g.id===prod.activeGroupId) || prod.groups[0];
  if(!group || !group.boardState){ console.error('No group/boardState'); process.exit(1); }
  const tasks = group.boardState.tasks || [];
  const subMap = new Map();
  for(const phase of tasks){
    const subs = phase.subBoard?.tasks || [];
    for(const s of subs) subMap.set(s.id, `${phase.id}:${s.id}`);
  }
  let changed = 0;
  group.boardState.connections = (group.boardState.connections||[]).map(c => {
    const nf = subMap.get(c.from) || c.from;
    const nt = subMap.get(c.to) || c.to;
    if(nf !== c.from || nt !== c.to) changed++;
    return { ...c, from: nf, to: nt };
  });
  // persist
  state.products = state.products.map(p => p.id===prod.id ? prod : p);
  await prisma.taskBoardState.upsert({ where: { userId: user.id }, create: { userId: user.id, stateJson: JSON.stringify(state) }, update: { stateJson: JSON.stringify(state) } });
  console.log('Normalized connections, replacements:', changed);
  await prisma.$disconnect();
}
run().catch(e=>{ console.error(e); process.exit(1); });
