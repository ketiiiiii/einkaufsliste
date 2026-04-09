const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
(async () => {
  const u = await p.user.findFirst();
  const r = await p.taskBoardState.findUnique({ where: { userId: u.id } });
  fs.writeFileSync('docs/exported-board-state.json', r.stateJson);
  console.log('Exported', r.stateJson.length, 'chars, userId=', u.id, ', email=', u.email);
  await p.$disconnect();
})();
