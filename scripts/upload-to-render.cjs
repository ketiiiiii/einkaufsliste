/**
 * Upload lokalen Board-State auf Render.
 * Usage: node scripts/upload-to-render.cjs
 */
const fs = require('fs');
const path = require('path');

const RENDER_URL = 'https://einkaufsliste-cemu.onrender.com';
const SECRET = '-------------------------------------';

async function run() {
  const statePath = path.join(__dirname, '..', 'docs', 'exported-board-state.json');
  if (!fs.existsSync(statePath)) {
    console.error('Fehler: docs/exported-board-state.json nicht gefunden. Zuerst export-state.cjs ausfuehren.');
    process.exit(1);
  }

  const stateJson = fs.readFileSync(statePath, 'utf-8');
  console.log(`Lade ${stateJson.length} Zeichen hoch nach ${RENDER_URL} ...`);

  const res = await fetch(`${RENDER_URL}/api/seed-board`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ stateJson }),
  });

  const body = await res.json();
  if (res.ok) {
    console.log('Erfolg:', body);
  } else {
    console.error(`Fehler ${res.status}:`, body);
    process.exit(1);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
