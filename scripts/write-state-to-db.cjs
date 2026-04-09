// Writes board-state-v4.json into the SQLite database,
// MERGING into the existing product structure and preserving user edits
// (descriptions, durations, colors changed in the UI).
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

function mergeSubBoard(newSub, oldSub) {
  if (!newSub || !newSub.tasks) return newSub;
  if (!oldSub || !oldSub.tasks) return newSub;
  const oldMap = new Map();
  for (const t of oldSub.tasks) oldMap.set(t.id, t);
  const merged = newSub.tasks.map((nt) => {
    const ot = oldMap.get(nt.id);
    if (!ot) return nt;
    // New JSON is authoritative for: structure, title, color, duration, unit
    // Old DB is authoritative for: note (user-edited descriptions)
    return {
      ...nt,
      note: ot.note || nt.note,
    };
  });
  return { ...newSub, tasks: merged };
}

function mergeTask(newTask, oldTask) {
  if (!oldTask) return newTask;
  const result = {
    ...newTask,
    note: oldTask.note || newTask.note,
  };
  if (newTask.subBoard) {
    result.subBoard = mergeSubBoard(newTask.subBoard, oldTask.subBoard);
    if (newTask.subBoard.connections) result.subBoard.connections = newTask.subBoard.connections;
  }
  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const newStateStr = fs.readFileSync('docs/board-state-v4.json', 'utf8');
    const newState = JSON.parse(newStateStr);
    const user = await prisma.user.findFirst();
    if (!user) { console.error('No user found'); process.exit(1); }
    console.log('User:', user.email);

    // Extract the new board from the product structure
    let newBoard = null;
    if (newState.products) {
      const np = newState.products.find((p) => p.id === 'prd-master-thesis');
      if (np) {
        const ng = (np.groups || []).find((g) => g.id === 'grp-ms');
        if (ng) newBoard = ng.boardState;
      }
    }
    if (!newBoard || !newBoard.tasks) {
      // Fallback: maybe it's a raw board state
      newBoard = newState.tasks ? newState : null;
    }
    if (!newBoard) { console.error('Could not find board in new state'); process.exit(1); }
    console.log('New board tasks:', newBoard.tasks.length);

    // Read existing state from DB
    const existing = await prisma.taskBoardState.findUnique({ where: { userId: user.id } });
    let finalState;

    if (existing && existing.stateJson) {
      const dbState = JSON.parse(existing.stateJson);
      
      if (dbState.products && Array.isArray(dbState.products)) {
        const prodIdx = dbState.products.findIndex((p) => p.id === 'prd-master-thesis');
        if (prodIdx >= 0) {
          const prod = dbState.products[prodIdx];
          const grpIdx = (prod.groups || []).findIndex((g) => g.id === 'grp-ms');
          if (grpIdx >= 0) {
            const oldBoard = prod.groups[grpIdx].boardState;
            const oldTaskMap = new Map();
            if (oldBoard && oldBoard.tasks) {
              for (const t of oldBoard.tasks) oldTaskMap.set(t.id, t);
            }
            // Merge: new structure (JSON is authoritative) + old user-edited notes
            const mergedTasks = newBoard.tasks.map((nt) => mergeTask(nt, oldTaskMap.get(nt.id)));
            const mergedBoard = { ...newBoard, tasks: mergedTasks };
            dbState.products[prodIdx].groups[grpIdx].boardState = mergedBoard;
            finalState = dbState;
            console.log('Merged into existing product structure');
            console.log('Tasks merged:', mergedTasks.length);
            for (const t of mergedTasks) {
              console.log(`  ${t.id}: color=${t.color}`);
            }
          } else {
            prod.groups = prod.groups || [];
            prod.groups.push({ id: 'grp-ms', name: 'MS', boardState: newBoard });
            finalState = dbState;
            console.log('Added new group to existing product');
          }
        } else {
          dbState.products.push(newState.products[0]);
          dbState.activeProductId = 'prd-master-thesis';
          finalState = dbState;
          console.log('Added product to existing state');
        }
      } else {
        finalState = newState;
        console.log('Replaced non-product DB state with new product structure');
      }
    } else {
      finalState = newState;
      console.log('Created new state (DB was empty)');
    }

    await prisma.taskBoardState.upsert({
      where: { userId: user.id },
      create: { userId: user.id, stateJson: JSON.stringify(finalState) },
      update: { stateJson: JSON.stringify(finalState) },
    });
    console.log('Board state saved to DB');
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}
main();
