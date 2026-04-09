/**
 * Imports the new "Master Thesis Forecasting" plan from the HTML export data.
 * Replaces the entire board state locally and uploads to Render.
 * Run: node scripts/import-new-plan.cjs
 */
const { PrismaClient } = require('@prisma/client');
const https = require('https');
const http = require('http');

// ──────────────────────────────────────────────────────────────────────────────
// NEW PLAN DATA — extracted from the Gantt HTML export (preview.html)
// ──────────────────────────────────────────────────────────────────────────────

const PLAN_NAME = "Master Thesis Forecasting";
const PRODUCT_NAME = "Proffix Forecast AI Engine";

// Phase definitions with their subtasks and connections
const phases = [
  {
    id: "P1", title: "Vorbereitung & Setup", color: "amber", duration: 14, unit: "h", x: 40, y: 40,
    subTasks: [
      { id: "1.1", title: "Thema und Forschungsrahmen klären", note: "Fragestellung, Hypothesen, Abgrenzung und Metriken festlegen.", color: "amber", duration: 3, unit: "h", x: 40, y: 40 },
      { id: "1.2", title: "Umgebung und Tools aufsetzen", note: "Projektstruktur, Python-Umgebung, Git und lauffähige Basis einrichten.", color: "amber", duration: 3, unit: "h", x: 400, y: 40 },
      { id: "1.3", title: "MLflow einrichten", note: "MLflow installieren und ersten Test-Run erfassen.", color: "amber", duration: 3, unit: "h", x: 760, y: 40 },
      { id: "1.4", title: "Datenfluss und Pipeline grob festlegen", note: "Proffix → Export → Datei/FTP → Forecast-Pipeline grob festlegen.", color: "amber", duration: 3, unit: "h", x: 1120, y: 40 },
    ],
    subConns: [
      { id: "p11", from: "1.1", to: "1.2", lag: 1, lagUnit: "h" },
      { id: "p12", from: "1.2", to: "1.3", lag: 1, lagUnit: "h" },
      { id: "p13", from: "1.3", to: "1.4", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "P2", title: "Analysephase", color: "sky", duration: 29, unit: "h", x: 400, y: 40,
    subTasks: [
      { id: "2.1", title: "Datenquellen sichten", note: "Verkaufsdaten, Aktionen, Preise und weitere mögliche Felder sichten.", color: "sky", duration: 4, unit: "h", x: 40, y: 40 },
      { id: "2.2", title: "Ersten Proffix-Export bereitstellen", note: "Zuerst eher breit exportieren, damit genügend Felder zum Prüfen vorhanden sind.", color: "sky", duration: 4, unit: "h", x: 400, y: 40 },
      { id: "2.3", title: "Daten prüfen und vorbereiten", note: "Datentypen, Nullwerte, Dubletten und Grundstruktur prüfen und bereinigen.", color: "sky", duration: 6, unit: "h", x: 760, y: 40 },
      { id: "2.4", title: "Daten erkunden (EDA)", note: "Verteilungen, Zeitverläufe und erste Auffälligkeiten sichtbar machen.", color: "sky", duration: 6, unit: "h", x: 1120, y: 40 },
      { id: "2.5", title: "Export und SQL-View verbessern", note: "Zu viele, fehlende oder unklare Felder anhand der Analyse gezielt anpassen.", color: "sky", duration: 4, unit: "h", x: 1480, y: 40 },
      { id: "2.6", title: "Zielgrösse, Zusatzfelder und Splits festlegen", note: "Forecast-Ziel, sinnvolle Zusatzfelder und Train/Validation/Test-Splits verbindlich festlegen.", color: "sky", duration: 1, unit: "h", x: 1840, y: 40 },
    ],
    subConns: [
      { id: "p21", from: "2.1", to: "2.2", lag: 1, lagUnit: "h" },
      { id: "p22", from: "2.2", to: "2.3", lag: 1, lagUnit: "h" },
      { id: "p23", from: "2.3", to: "2.4", lag: 1, lagUnit: "h" },
      { id: "p24", from: "2.4", to: "2.5", lag: 1, lagUnit: "h" },
      { id: "p25", from: "2.5", to: "2.6", lag: 1, lagUnit: "h" },
      { id: "p2loop", from: "2.5", to: "2.2", loopDuration: 23, loopDurationUnit: "h" },
    ],
  },
  {
    id: "P3", title: "Architektur & Pipeline", color: "rose", duration: 25, unit: "h", x: 760, y: 40,
    subTasks: [
      { id: "3.1", title: "Importformat und Loader bauen", note: "Ein einheitliches Dateiformat und einen Loader für alle Modelle aufbauen.", color: "rose", duration: 5, unit: "h", x: 40, y: 40 },
      { id: "3.2", title: "Feature-Bausteine vorbereiten", note: "Lag-, Rolling- und Kalender-Features als Bausteine vorbereiten.", color: "rose", duration: 5, unit: "h", x: 400, y: 40 },
      { id: "3.3", title: "Split-Logik bauen", note: "Zeitbasierte Splits für alle Horizonte technisch umsetzen.", color: "rose", duration: 4, unit: "h", x: 760, y: 40 },
      { id: "3.4", title: "Modell-Schnittstelle bauen", note: "fit, predict und evaluate in einem einheitlichen Schema umsetzen.", color: "rose", duration: 6, unit: "h", x: 1120, y: 40 },
      { id: "3.5", title: "MLflow-Logging zentral anbinden", note: "Parameter, Metriken und Artefakte pro Run standardisiert loggen.", color: "rose", duration: 2, unit: "h", x: 1480, y: 40 },
    ],
    subConns: [
      { id: "p31", from: "3.1", to: "3.2", lag: 1, lagUnit: "h" },
      { id: "p32", from: "3.2", to: "3.3", lag: 1, lagUnit: "h" },
      { id: "p33", from: "3.3", to: "3.4", lag: 1, lagUnit: "h" },
      { id: "p34", from: "3.4", to: "3.5", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "P4", title: "Erste Vergleichsrunde der Modellklassen", color: "emerald", duration: 16, unit: "h", x: 1120, y: 40,
    subTasks: [
      { id: "4.1", title: "Baseline testen", note: "Einfache Referenzmodelle wie Last Value oder Mean Forecast ausführen.", color: "emerald", duration: 4, unit: "h", x: 40, y: 40 },
      { id: "4.2", title: "Klassische Modelle testen", note: "ARIMA, ETS, Prophet oder ähnliche Kandidaten in einer ersten Runde testen.", color: "emerald", duration: 8, unit: "h", x: 400, y: 40 },
      { id: "4.3", title: "Deep-Learning-Modelle testen", note: "LSTM, TFT, N-BEATS oder ähnliche Kandidaten in einer ersten Runde testen.", color: "emerald", duration: 10, unit: "h", x: 760, y: 40 },
      { id: "4.4", title: "Foundation Model testen", note: "Foundation Model als erste Benchmark mit gleichem Setup testen.", color: "emerald", duration: 6, unit: "h", x: 1120, y: 40 },
      { id: "4.5", title: "Erste Ergebnisse vergleichen", note: "Die erste Runde vergleichen und pro Modellklasse einen sinnvollen Kandidaten wählen.", color: "emerald", duration: 6, unit: "h", x: 1480, y: 40 },
    ],
    subConns: [
      { id: "p4a", from: "4.1", to: "4.5", lag: 1, lagUnit: "h" },
      { id: "p4b", from: "4.2", to: "4.5", lag: 1, lagUnit: "h" },
      { id: "p4c", from: "4.3", to: "4.5", lag: 1, lagUnit: "h" },
      { id: "p4d", from: "4.4", to: "4.5", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "P5", title: "Gezielte Vertiefung und Verfeinerung", color: "violet", duration: 15, unit: "h", x: 1480, y: 40,
    subTasks: [
      { id: "5.1", title: "Klassisches Modell verfeinern", note: "Parameter, Aggregation und ausgewählte Zusatzfelder gezielt verbessern.", color: "violet", duration: 8, unit: "h", x: 40, y: 40 },
      { id: "5.2", title: "Deep-Learning-Modell verfeinern", note: "Features, Hyperparameter und Trainings-Setup iterativ verbessern.", color: "violet", duration: 10, unit: "h", x: 400, y: 40 },
      { id: "5.3", title: "Foundation Model verfeinern", note: "Modellwahl, Historienlänge, Eingabeformat oder Aggregation gezielt anpassen.", color: "violet", duration: 6, unit: "h", x: 760, y: 40 },
      { id: "5.4", title: "Erneut vergleichen und nächste Runde festlegen", note: "Resultate prüfen und entscheiden, wo eine weitere Runde sinnvoll ist.", color: "violet", duration: 5, unit: "h", x: 1120, y: 40 },
    ],
    subConns: [
      { id: "p5a", from: "5.1", to: "5.4", lag: 1, lagUnit: "h" },
      { id: "p5b", from: "5.2", to: "5.4", lag: 1, lagUnit: "h" },
      { id: "p5c", from: "5.3", to: "5.4", lag: 1, lagUnit: "h" },
      { id: "p5l1", from: "5.4", to: "5.1", loopDuration: 15, loopDurationUnit: "h" },
    ],
  },
  {
    id: "P6", title: "Finaler Modellvergleich", color: "orange", duration: 15, unit: "h", x: 1840, y: 40,
    subTasks: [
      { id: "6.1", title: "Endruns aller 3 Modelle ausführen", note: "Alle drei Modellklassen mit gleichem Setup final ausführen.", color: "orange", duration: 6, unit: "h", x: 40, y: 40 },
      { id: "6.2", title: "Final bewerten und Fehler analysieren", note: "Metriken, Schwächen und Unterschiede sauber auswerten.", color: "orange", duration: 6, unit: "h", x: 400, y: 40 },
      { id: "6.3", title: "Champion-Modell auswählen", note: "Bestes Modell fachlich und praktisch begründet auswählen.", color: "orange", duration: 2, unit: "h", x: 760, y: 40 },
    ],
    subConns: [
      { id: "p6a", from: "6.1", to: "6.2", lag: 1, lagUnit: "h" },
      { id: "p6b", from: "6.2", to: "6.3", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "P7", title: "Praxistest & Integration", color: "teal", duration: 10, unit: "h", x: 2200, y: 40,
    subTasks: [
      { id: "7.1", title: "Praxistest mit echten Daten", note: "End-to-end Forecast mit realen Kundendaten prüfen und Reports bauen.", color: "teal", duration: 6, unit: "h", x: 40, y: 40 },
      { id: "7.2", title: "Runs ordnen und dokumentieren", note: "Wichtige Runs sauber benennen, markieren und dokumentieren.", color: "teal", duration: 3, unit: "h", x: 400, y: 40 },
    ],
    subConns: [
      { id: "p7a", from: "7.1", to: "7.2", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "P8", title: "Finalisierung & Abgabe", color: "indigo", duration: 8, unit: "h", x: 2560, y: 40,
    subTasks: [
      { id: "8.1", title: "Review und Korrekturen", note: "Fachliches und formales Review durchführen, Feedback einarbeiten.", color: "indigo", duration: 5, unit: "h", x: 40, y: 40 },
      { id: "8.2", title: "Abgabe und Präsentation", note: "PDF vorbereiten, einreichen, Folien bauen und Verteidigung üben.", color: "indigo", duration: 3, unit: "h", x: 400, y: 40 },
    ],
    subConns: [
      { id: "p81", from: "8.1", to: "8.2", lag: 1, lagUnit: "h" },
    ],
  },
  {
    id: "PS", title: "Schreiben der Thesis (parallel, durchgehend)", color: "mint", duration: 50, unit: "h", x: 40, y: 210,
    subTasks: [
      { id: "S.1", title: "Theorie-Kapitel schreiben", note: "Einleitung, Stand der Forschung, Stand der Technik und Methodik verfassen.", color: "mint", duration: 20, unit: "h", x: 40, y: 40 },
      { id: "S.2", title: "Praxis-Kapitel schreiben", note: "Analyse, Modellläufe, Vergleich und Empfehlung dokumentieren.", color: "mint", duration: 18, unit: "h", x: 400, y: 40 },
      { id: "S.3", title: "Gesamtdokument überarbeiten", note: "Roter Faden, Konsistenz, Sprache verbessern und Schlussfassung erstellen.", color: "mint", duration: 10, unit: "h", x: 760, y: 40 },
    ],
    subConns: [
      { id: "ps1", from: "S.1", to: "S.3", lag: 1, lagUnit: "h" },
      { id: "ps2", from: "S.2", to: "S.3", lag: 1, lagUnit: "h" },
    ],
  },
];

// Phase-level connections
const phaseConnections = [
  { id: "pc1", from: "P1", to: "P2" },
  { id: "pc2", from: "P2", to: "P3" },
  { id: "pc3", from: "P3", to: "P4" },
  { id: "pc4", from: "P4", to: "P5" },
  { id: "pc5", from: "P5", to: "P6" },
  { id: "pc6", from: "P6", to: "P7" },
  { id: "pc7", from: "P7", to: "P8" },
];

// Cross-phase sub-task connections (stored both in connections[] and crossConnections[])
const crossConns = [
  { id: "x1", from: "P1:1.4", to: "P2:2.1", lag: 1, lagUnit: "h", fromPhaseId: "P1", fromTaskId: "1.4", toPhaseId: "P2", toTaskId: "2.1" },
  { id: "x2", from: "P1:1.4", to: "PS:S.1", lag: 1, lagUnit: "h", fromPhaseId: "P1", fromTaskId: "1.4", toPhaseId: "PS", toTaskId: "S.1" },
  { id: "x4", from: "P2:2.6", to: "P3:3.1", lag: 1, lagUnit: "h", fromPhaseId: "P2", fromTaskId: "2.6", toPhaseId: "P3", toTaskId: "3.1" },
  { id: "x6", from: "P3:3.5", to: "P4:4.1", lag: 1, lagUnit: "h", fromPhaseId: "P3", fromTaskId: "3.5", toPhaseId: "P4", toTaskId: "4.1" },
  { id: "x7", from: "P3:3.5", to: "P4:4.2", lag: 1, lagUnit: "h", fromPhaseId: "P3", fromTaskId: "3.5", toPhaseId: "P4", toTaskId: "4.2" },
  { id: "x8", from: "P3:3.5", to: "P4:4.3", lag: 1, lagUnit: "h", fromPhaseId: "P3", fromTaskId: "3.5", toPhaseId: "P4", toTaskId: "4.3" },
  { id: "x9", from: "P3:3.5", to: "P4:4.4", lag: 1, lagUnit: "h", fromPhaseId: "P3", fromTaskId: "3.5", toPhaseId: "P4", toTaskId: "4.4" },
  { id: "x11", from: "P4:4.5", to: "P5:5.1", lag: 1, lagUnit: "h", fromPhaseId: "P4", fromTaskId: "4.5", toPhaseId: "P5", toTaskId: "5.1" },
  { id: "x12", from: "P4:4.5", to: "P5:5.2", lag: 1, lagUnit: "h", fromPhaseId: "P4", fromTaskId: "4.5", toPhaseId: "P5", toTaskId: "5.2" },
  { id: "x13", from: "P4:4.5", to: "P5:5.3", lag: 1, lagUnit: "h", fromPhaseId: "P4", fromTaskId: "4.5", toPhaseId: "P5", toTaskId: "5.3" },
  { id: "x14", from: "P5:5.4", to: "P6:6.1", lag: 1, lagUnit: "h", fromPhaseId: "P5", fromTaskId: "5.4", toPhaseId: "P6", toTaskId: "6.1" },
  { id: "x15", from: "P5:5.4", to: "PS:S.2", lag: 1, lagUnit: "h", fromPhaseId: "P5", fromTaskId: "5.4", toPhaseId: "PS", toTaskId: "S.2" },
  { id: "x16", from: "P6:6.3", to: "P7:7.1", lag: 1, lagUnit: "h", fromPhaseId: "P6", fromTaskId: "6.3", toPhaseId: "P7", toTaskId: "7.1" },
  { id: "x18", from: "P7:7.2", to: "P8:8.1", lag: 1, lagUnit: "h", fromPhaseId: "P7", fromTaskId: "7.2", toPhaseId: "P8", toTaskId: "8.1" },
];

// ──────────────────────────────────────────────────────────────────────────────
// BUILD BOARD STATE
// ──────────────────────────────────────────────────────────────────────────────

function buildBoardState() {
  const tasks = phases.map(p => ({
    id: p.id,
    title: p.title,
    color: p.color,
    duration: p.duration,
    unit: p.unit,
    x: p.x,
    y: p.y,
    subBoard: {
      tasks: p.subTasks.map(st => ({
        id: st.id,
        title: st.title,
        note: st.note,
        color: st.color,
        duration: st.duration,
        unit: st.unit,
        x: st.x,
        y: st.y,
      })),
      connections: p.subConns.map(c => {
        const conn = { id: c.id, from: c.from, to: c.to };
        if (c.lag !== undefined) { conn.lag = c.lag; conn.lagUnit = c.lagUnit; }
        if (c.loopDuration !== undefined) { conn.loopDuration = c.loopDuration; conn.loopDurationUnit = c.loopDurationUnit; }
        return conn;
      }),
    },
  }));

  // Build connections array (phase-level + cross-connections as composite IDs)
  const connections = [
    ...phaseConnections,
    ...crossConns.map(c => {
      const conn = { id: c.id, from: c.from, to: c.to };
      if (c.lag !== undefined) { conn.lag = c.lag; conn.lagUnit = c.lagUnit; }
      return conn;
    }),
  ];

  // Build crossConnections array
  const crossConnections = crossConns.map(c => ({
    id: c.id,
    fromPhaseId: c.fromPhaseId,
    fromTaskId: c.fromTaskId,
    toPhaseId: c.toPhaseId,
    toTaskId: c.toTaskId,
  }));

  const boardState = { tasks, connections, crossConnections };

  const fullState = {
    products: [{
      id: "prd-master-thesis",
      name: PRODUCT_NAME,
      groups: [{
        id: "grp-ms",
        name: "MS",
        boardState,
        children: [],
      }],
      children: [],
      phasesEnabled: true,
    }],
    activeProductId: "prd-master-thesis",
    planName: PLAN_NAME,
  };

  return fullState;
}

// ──────────────────────────────────────────────────────────────────────────────
// SAVE LOCALLY + UPLOAD TO RENDER
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const state = buildBoardState();
  const stateJson = JSON.stringify(state);
  console.log(`Built new board state: ${stateJson.length} chars, ${state.products[0].groups[0].boardState.tasks.length} phases`);

  // Count total subtasks
  let totalSubs = 0;
  for (const t of state.products[0].groups[0].boardState.tasks) {
    totalSubs += t.subBoard.tasks.length;
  }
  console.log(`Total subtasks: ${totalSubs}`);
  console.log(`Connections: ${state.products[0].groups[0].boardState.connections.length}`);
  console.log(`Cross-connections: ${state.products[0].groups[0].boardState.crossConnections.length}`);

  // Save locally
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');
    console.log(`\nLocal DB: userId=${user.id}, email=${user.email}`);

    await prisma.taskBoardState.upsert({
      where: { userId: user.id },
      update: { stateJson },
      create: { userId: user.id, stateJson },
    });
    console.log('✓ Local DB updated');
  } finally {
    await prisma.$disconnect();
  }

  // Upload to Render
  const RENDER_URL = 'https://einkaufsliste-cemu.onrender.com/api/seed-board';
  const SECRET = process.env.NEXTAUTH_SECRET || 'e3f8a1b2c4d6e8f0a1b3c5d7e9f2a4b6c8d0e2f4a6b8c1d3e5f7a9b2c4d6e8';

  console.log(`\nUploading to Render: ${RENDER_URL}`);
  const body = JSON.stringify({ stateJson });

  const result = await new Promise((resolve, reject) => {
    const url = new URL(RENDER_URL);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`Render response: ${result.status}`, result.body);
  if (result.status === 200 && result.body.ok) {
    console.log('✓ Render DB updated');
  } else {
    console.error('✗ Render upload failed!');
  }
}

main().catch(console.error);
