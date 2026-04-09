import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run(){
  const user = await prisma.user.findFirst();
  if(!user){ console.error('no user'); process.exit(1); }
  const row = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
  if(!row?.stateJson){ console.error('no stateJson'); process.exit(1); }
  const state = JSON.parse(row.stateJson);
  const prod = (state.products||[]).find(p=>p.name==='Master Theses') || (state.products||[])[0];
  console.log('Product:', prod?.name, 'id=', prod?.id);
  const group = prod?.groups?.find(g=>g.id===prod.activeGroupId) || prod?.groups?.[0];
  console.log('Group:', group?.name, 'id=', group?.id);
  const tasks = group?.boardState?.tasks || [];
  console.log('\nTasks:');
  tasks.forEach(t=> console.log('-', t.id, '->', t.title));
  const conns = group?.boardState?.connections || [];
  console.log('\nConnections:', conns.length);
  conns.slice(0,200).forEach(c=> console.log('-', c.id, c.from, '->', c.to));
  await prisma.$disconnect();
}
run().catch(e=>{console.error(e); process.exit(1);});
