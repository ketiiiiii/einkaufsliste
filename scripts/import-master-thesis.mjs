import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL(import.meta.url).pathname, '..', '..');
const CSV_PATH = path.join(ROOT, 'docs', 'master-thesis-plan.csv');
const KEY = 'custom-products:v1';
const PRODUCT_ID = 'master-thesis-ms';

function toDays(h) {
  const n = parseFloat(h) || 0;
  return Math.max(0.125, Math.round((n / 8) * 100) / 100);
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  const rows = lines.map((l) => l.split(';'));
  const phases = rows.map((cols) => {
    const [id, parent, ebene, title, dauer_h, liege, vorg, iter, note] = cols;
    return {
      id: (id || '').trim(),
      title: (title || id || '').trim(),
      note: (note || '').trim(),
      duration: toDays(dauer_h),
    };
  });
  const connections = [];
  rows.forEach((cols) => {
    const [id, parent, , , , , vorg] = cols;
    const cleanId = (id || '').trim();
    if (parent && parent.trim()) connections.push({ from: parent.trim(), to: cleanId });
    if (vorg && vorg.trim()) {
      const preds = vorg.split(',').map((s) => s.trim()).filter(Boolean);
      preds.forEach((p) => connections.push({ from: p, to: cleanId }));
    }
  });
  return { phases, connections };
}

async function run({ url = 'http://localhost:3000', headless = true } = {}) {
  const raw = await fs.readFile(CSV_PATH, 'utf8');
  const { phases, connections } = parseCsv(raw);
  const product = {
    id: PRODUCT_ID,
    name: 'Master Thesis (MS)',
    description: 'Master Thesis project plan (imported)',
    color: 'amber',
    phases,
    connections,
    variants: [],
  };

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  console.log(`Opening ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  const injected = await page.evaluate(({ KEY, product }) => {
    try {
      const raw = localStorage.getItem(KEY) || '[]';
      const arr = JSON.parse(raw);
      const filtered = arr.filter((p) => p.id !== product.id);
      filtered.push(product);
      localStorage.setItem(KEY, JSON.stringify(filtered));
      return true;
    } catch (e) {
      // forward error
      return { error: String(e) };
    }
  }, { KEY, product });

  if (injected && injected.error) {
    console.error('Fehler beim Setzen in localStorage:', injected.error);
  } else if (injected) {
    console.log('Produkt erfolgreich in localStorage geschrieben. Reloading page...');
    await page.reload({ waitUntil: 'networkidle' });
    console.log('Fertig — Produkt sollte im UI sichtbar sein.');
  } else {
    console.error('Unbekannter Fehler beim Inject.');
  }

  await browser.close();
}

// CLI
const args = process.argv.slice(2);
const headless = args.indexOf('--no-headless') === -1;
const urlArgIndex = args.findIndex((a) => a === '--url');
const url = urlArgIndex >= 0 ? args[urlArgIndex + 1] : 'http://localhost:3000';

run({ url, headless }).catch((err) => {
  console.error('Import fehlgeschlagen:', err);
  process.exit(1);
});
