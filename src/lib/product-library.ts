// ─── Product Library ──────────────────────────────────────────────────────────
// Defines reusable product templates that can be combined into a project board.
// Each product has base tasks, optional add-on modules, and cross-product link
// anchors so tasks from different products can be automatically connected.

export type ColorToken = "amber" | "emerald" | "sky" | "rose" | "violet";

export type ProductTask = {
  id: string;       // unique within one product (e.g. "kasse-setup")
  title: string;
  note?: string;
  color: ColorToken;
  duration: number; // AT (Arbeitstage)
  col: number;      // layout column index (0-based)
  row: number;      // layout row index (0-based)
};

export type ProductConnection = {
  from: string; // relative task id
  to: string;
};

export type ProductOption = {
  id: string;
  label: string;
  description?: string;
  tasks: ProductTask[];
  connections: ProductConnection[];
  /** Extra edges that link option-tasks back to base tasks */
  baseConnections?: ProductConnection[];
};

export type ProductDefinition = {
  id: string;
  name: string;
  description: string;
  color: ColorToken;
  tasks: ProductTask[];
  connections: ProductConnection[];
  options: ProductOption[];
};

/** Links a task in one product to a task in another product */
export type CrossProductLink = {
  fromProduct: string;
  fromTask: string;
  toProduct: string;
  toTask: string;
};

// ─── Column / Row to pixel conversion (used at generation time) ──────────────
const COL_X = [40, 320, 600, 880, 1160];
const ROW_Y = [40, 200, 360, 520];
const COL_OFFSET_PER_PRODUCT = 1300; // horizontal offset per product block

export function colRowToXY(col: number, row: number, productIndex: number) {
  return {
    x: (COL_X[col] ?? col * 280 + 40) + productIndex * COL_OFFSET_PER_PRODUCT,
    y: ROW_Y[row] ?? row * 160 + 40,
  };
}

// ─── Product Definitions ─────────────────────────────────────────────────────

const WATO_KASSE: ProductDefinition = {
  id: "wato-kasse",
  name: "Wato Kasse",
  description: "Kassensystem-Einführung inkl. Hardware, Software, Schulung und Go-Live.",
  color: "amber",
  tasks: [
    { id: "wk-kickoff",    title: "Kickoff & Anforderungen",  note: "Ziele, Standorte, Benutzer klären",             color: "amber",   duration: 1, col: 0, row: 0 },
    { id: "wk-hw",         title: "Hardware Beschaffung",     note: "Kassen-HW, Drucker, Scanner bestellen",         color: "amber",   duration: 2, col: 1, row: 0 },
    { id: "wk-install",    title: "Software Installation",    note: "Wato Kasse installieren & Lizenzieren",         color: "amber",   duration: 1, col: 1, row: 1 },
    { id: "wk-stammdaten", title: "Stammdaten import",        note: "Artikel, Preise, PLU-Codes",                    color: "emerald", duration: 2, col: 2, row: 0 },
    { id: "wk-config",     title: "Kasse konfigurieren",      note: "Layouts, Zahlungsarten, Drucker einrichten",    color: "emerald", duration: 2, col: 2, row: 1 },
    { id: "wk-schulung",   title: "Schulung Personal",        note: "Kassierer und Supervisor schulen",              color: "sky",     duration: 1, col: 3, row: 0 },
    { id: "wk-test",       title: "Abnahmetest",              note: "Testbetrieb, Szenarien durchspielen",           color: "sky",     duration: 1, col: 3, row: 1 },
    { id: "wk-golive",     title: "Go-Live",                  note: "Live-Betrieb, Begleitung erster Tag",           color: "rose",    duration: 1, col: 4, row: 0 },
  ],
  connections: [
    { from: "wk-kickoff",    to: "wk-hw" },
    { from: "wk-kickoff",    to: "wk-install" },
    { from: "wk-hw",         to: "wk-stammdaten" },
    { from: "wk-install",    to: "wk-stammdaten" },
    { from: "wk-install",    to: "wk-config" },
    { from: "wk-stammdaten", to: "wk-schulung" },
    { from: "wk-config",     to: "wk-schulung" },
    { from: "wk-config",     to: "wk-test" },
    { from: "wk-schulung",   to: "wk-golive" },
    { from: "wk-test",       to: "wk-golive" },
  ],
  options: [
    {
      id: "kassenbuch",
      label: "Kassenbuch / Tagesabschluss",
      description: "Automatischer Tagesabschluss und Kassenbuch-Anbindung",
      tasks: [
        { id: "wk-kassenbuch", title: "Kassenbuch einrichten", note: "Tagesabschluss, Z-Bericht konfigurieren", color: "violet", duration: 1, col: 2, row: 2 },
      ],
      connections: [],
      baseConnections: [
        { from: "wk-config",     to: "wk-kassenbuch" },
        { from: "wk-kassenbuch", to: "wk-test" },
      ],
    },
    {
      id: "webshop",
      label: "Webshop-Anbindung",
      description: "Artikel- und Bestandssync mit Online-Shop",
      tasks: [
        { id: "wk-webshop", title: "Webshop Sync konfigurieren", note: "API-Key, Produktmapping, Intervall", color: "sky", duration: 2, col: 3, row: 2 },
      ],
      connections: [],
      baseConnections: [
        { from: "wk-stammdaten", to: "wk-webshop" },
        { from: "wk-webshop",    to: "wk-test" },
      ],
    },
  ],
};

const WATO_DOCCREATOR: ProductDefinition = {
  id: "wato-doccreator",
  name: "Wato DocCreator",
  description: "Automatische Dokumentengenerierung: Offerten, Lieferscheine, Rechnungen.",
  color: "sky",
  tasks: [
    { id: "dc-kickoff",    title: "Kickoff DocCreator",        note: "Dokumententypen & Vorlagen definieren",        color: "sky",     duration: 1, col: 0, row: 0 },
    { id: "dc-vorlagen",   title: "Vorlagen erstellen",        note: "Word/HTML-Vorlagen je Dokumenttyp",            color: "sky",     duration: 3, col: 1, row: 0 },
    { id: "dc-daten",      title: "Datenquellen konfigurieren",note: "ERP-Felder, Platzhalter mappen",               color: "emerald", duration: 2, col: 1, row: 1 },
    { id: "dc-workflow",   title: "Workflow einrichten",       note: "Trigger, Versand per Mail/Druck",              color: "emerald", duration: 2, col: 2, row: 0 },
    { id: "dc-test",       title: "Testdurchlauf",             note: "Muster-Dokumente prüfen",                      color: "sky",     duration: 1, col: 3, row: 0 },
    { id: "dc-abnahme",    title: "Kundenabnahme",             note: "Freigabe durch Kunde",                         color: "rose",    duration: 1, col: 4, row: 0 },
  ],
  connections: [
    { from: "dc-kickoff",  to: "dc-vorlagen" },
    { from: "dc-kickoff",  to: "dc-daten" },
    { from: "dc-vorlagen", to: "dc-workflow" },
    { from: "dc-daten",    to: "dc-workflow" },
    { from: "dc-workflow", to: "dc-test" },
    { from: "dc-test",     to: "dc-abnahme" },
  ],
  options: [
    {
      id: "esignatur",
      label: "E-Signatur Integration",
      description: "Dokumente digital signieren lassen",
      tasks: [
        { id: "dc-esign", title: "E-Signatur konfigurieren", note: "Anbieter anbinden, Prozess testen", color: "violet", duration: 2, col: 2, row: 1 },
      ],
      connections: [],
      baseConnections: [
        { from: "dc-workflow", to: "dc-esign" },
        { from: "dc-esign",    to: "dc-test" },
      ],
    },
    {
      id: "archiv",
      label: "Dokument-Archivierung",
      description: "Automatisches Ablegen signierter Dokumente",
      tasks: [
        { id: "dc-archiv", title: "Archiv einrichten", note: "Ablagestruktur, Naming-Convention", color: "amber", duration: 1, col: 3, row: 1 },
      ],
      connections: [],
      baseConnections: [
        { from: "dc-test",   to: "dc-archiv" },
        { from: "dc-archiv", to: "dc-abnahme" },
      ],
    },
  ],
};

const PROFFIX: ProductDefinition = {
  id: "proffix",
  name: "proffix",
  description: "ERP-Einführung: Fibu, Debitor, Kreditor, Auftrag, Lager, Personal.",
  color: "emerald",
  tasks: [
    { id: "px-kickoff",  title: "Kickoff ERP",              note: "Module, Mandanten, Timeline festlegen",        color: "emerald", duration: 1, col: 0, row: 0 },
    { id: "px-install",  title: "proffix Installation",     note: "Server/Cloud, Lizenz, DB-Setup",               color: "emerald", duration: 1, col: 1, row: 0 },
    { id: "px-stamm",    title: "Stammdaten erfassen",       note: "Kunden, Lieferanten, MwSt, Kontenplan",        color: "emerald", duration: 3, col: 1, row: 1 },
    { id: "px-fibu",     title: "Fibu einrichten",           note: "Kontenplan, Kostenstellen, EB-Buchungen",      color: "emerald", duration: 2, col: 2, row: 0 },
    { id: "px-auftrag",  title: "Auftrag & Lager",           note: "Artikel, Preislisten, Lagerorte",              color: "sky",     duration: 2, col: 2, row: 1 },
    { id: "px-schulung", title: "Anwenderschulung",          note: "Abteilungsweise, Key-User first",              color: "sky",     duration: 2, col: 3, row: 0 },
    { id: "px-migration","title": "Datenmigration",          note: "Alt-System → proffix, Qualitätssicherung",     color: "amber",   duration: 3, col: 3, row: 1 },
    { id: "px-golive",   title: "Go-Live ERP",               note: "Echtbetrieb, Hypercare Phase",                 color: "rose",    duration: 1, col: 4, row: 0 },
  ],
  connections: [
    { from: "px-kickoff",  to: "px-install" },
    { from: "px-kickoff",  to: "px-stamm" },
    { from: "px-install",  to: "px-fibu" },
    { from: "px-install",  to: "px-auftrag" },
    { from: "px-stamm",    to: "px-fibu" },
    { from: "px-stamm",    to: "px-auftrag" },
    { from: "px-fibu",     to: "px-schulung" },
    { from: "px-auftrag",  to: "px-schulung" },
    { from: "px-stamm",    to: "px-migration" },
    { from: "px-schulung", to: "px-golive" },
    { from: "px-migration",to: "px-golive" },
  ],
  options: [
    {
      id: "lohn",
      label: "Lohnmodul",
      description: "Lohnbuchhaltung, Sozialversicherungen",
      tasks: [
        { id: "px-lohn", title: "Lohnmodul einrichten", note: "Lohnarten, SVA-Codes, Abrechnungen", color: "violet", duration: 2, col: 2, row: 2 },
      ],
      connections: [],
      baseConnections: [
        { from: "px-fibu",  to: "px-lohn" },
        { from: "px-lohn",  to: "px-schulung" },
      ],
    },
    {
      id: "webshop-erp",
      label: "Webshop ERP-Anbindung",
      description: "Bestellungen aus Online-Shop automatisch in proffix",
      tasks: [
        { id: "px-webshop", title: "Webshop ERP-Integration", note: "Bestellimport, Lageraktualisierung", color: "sky", duration: 2, col: 3, row: 2 },
      ],
      connections: [],
      baseConnections: [
        { from: "px-auftrag",  to: "px-webshop" },
        { from: "px-webshop",  to: "px-golive" },
      ],
    },
  ],
};

const PX_APP: ProductDefinition = {
  id: "px-app",
  name: "pxApp",
  description: "Mobile App für proffix: Aussendienst, Auftragserfassung, Zeiterfassung.",
  color: "violet",
  tasks: [
    { id: "app-analyse",  title: "Anforderungsanalyse App",   note: "Use Cases, Benutzerrollen, Geräte",            color: "violet", duration: 1, col: 0, row: 0 },
    { id: "app-config",   title: "pxApp konfigurieren",       note: "Verbindung zu proffix, Mandant, API",          color: "violet", duration: 1, col: 1, row: 0 },
    { id: "app-rechte",   title: "Berechtigungen einrichten", note: "Rollen, Felder, Sichtbarkeit",                 color: "violet", duration: 1, col: 1, row: 1 },
    { id: "app-masken",   title: "Masken & Felder anpassen",  note: "Formulare, Pflichtfelder, Listen",             color: "sky",    duration: 2, col: 2, row: 0 },
    { id: "app-test",     title: "Benutzertest",              note: "Testgeräte, Szenarien, Feedback",              color: "sky",    duration: 1, col: 3, row: 0 },
    { id: "app-rollout",  title: "Rollout & Schulung",        note: "MDM, App-Verteilung, Kurzschulung",            color: "rose",   duration: 1, col: 4, row: 0 },
  ],
  connections: [
    { from: "app-analyse", to: "app-config" },
    { from: "app-analyse", to: "app-rechte" },
    { from: "app-config",  to: "app-masken" },
    { from: "app-rechte",  to: "app-masken" },
    { from: "app-masken",  to: "app-test" },
    { from: "app-test",    to: "app-rollout" },
  ],
  options: [
    {
      id: "zeiterfassung",
      label: "Zeiterfassung",
      description: "Stunden direkt in der App erfassen und an proffix übertragen",
      tasks: [
        { id: "app-zeit", title: "Zeiterfassung konfigurieren", note: "Projektzuordnung, Auswertungen", color: "amber", duration: 1, col: 2, row: 1 },
      ],
      connections: [],
      baseConnections: [
        { from: "app-config", to: "app-zeit" },
        { from: "app-zeit",   to: "app-test" },
      ],
    },
    {
      id: "offline",
      label: "Offline-Modus",
      description: "App funktioniert auch ohne Netzverbindung",
      tasks: [
        { id: "app-offline", title: "Offline-Sync einrichten", note: "Sync-Strategie, Konflikterkennung", color: "violet", duration: 2, col: 3, row: 1 },
      ],
      connections: [],
      baseConnections: [
        { from: "app-masken",  to: "app-offline" },
        { from: "app-offline", to: "app-rollout" },
      ],
    },
  ],
};

export const PRODUCT_LIBRARY: ProductDefinition[] = [
  WATO_KASSE,
  WATO_DOCCREATOR,
  PROFFIX,
  PX_APP,
];

// ─── Cross-product connections ────────────────────────────────────────────────
// Defined as pairs: when BOTH products are selected, these edges are added.

export const CROSS_PRODUCT_LINKS: CrossProductLink[] = [
  // proffix Go-Live → pxApp config (App braucht laufendes ERP)
  { fromProduct: "proffix", fromTask: "px-golive",   toProduct: "px-app",          toTask: "app-config" },
  // Wato Kasse Stammdaten → proffix Auftrag (Kassen-Artikel aus ERP)
  { fromProduct: "proffix", fromTask: "px-stamm",    toProduct: "wato-kasse",      toTask: "wk-stammdaten" },
  // proffix Auftrag → DocCreator Daten (ERP liefert Dokumenten-Daten)
  { fromProduct: "proffix", fromTask: "px-auftrag",  toProduct: "wato-doccreator", toTask: "dc-daten" },
  // pxApp Test → Wato Kasse Test (Gesamttest erst wenn alle Systeme ready)
  { fromProduct: "px-app",  fromTask: "app-test",    toProduct: "wato-kasse",      toTask: "wk-test" },
];

// ─── Board generator ─────────────────────────────────────────────────────────

export type ComposerSelection = {
  productId: string;
  enabledOptions: string[];
};

export type GeneratedTask = {
  id: string;
  title: string;
  note?: string;
  color: ColorToken;
  duration: number;
  x: number;
  y: number;
};

export type GeneratedConnection = {
  id: string;
  from: string;
  to: string;
};

export type GeneratedBoard = {
  tasks: GeneratedTask[];
  connections: GeneratedConnection[];
};

let _cid = 0;
const cid = () => `cc-${++_cid}-${Date.now()}`;

export function generateBoardFromSelection(selections: ComposerSelection[]): GeneratedBoard {
  const allTasks: GeneratedTask[] = [];
  const allConnections: GeneratedConnection[] = [];

  // Map: "productId/relativeTaskId" → absolute task id for cross-product links
  const taskIdMap = new Map<string, string>();

  selections.forEach((sel, productIndex) => {
    const product = PRODUCT_LIBRARY.find((p) => p.id === sel.productId);
    if (!product) return;

    const prefixId = (relId: string) => `${product.id}__${relId}`;

    // Base tasks
    for (const task of product.tasks) {
      const absId = prefixId(task.id);
      taskIdMap.set(`${product.id}/${task.id}`, absId);
      const { x, y } = colRowToXY(task.col, task.row, productIndex);
      allTasks.push({ id: absId, title: task.title, note: task.note, color: task.color, duration: task.duration, x, y });
    }

    // Base connections
    for (const conn of product.connections) {
      allConnections.push({ id: cid(), from: prefixId(conn.from), to: prefixId(conn.to) });
    }

    // Options
    for (const opt of product.options) {
      if (!sel.enabledOptions.includes(opt.id)) continue;

      for (const task of opt.tasks) {
        const absId = prefixId(task.id);
        taskIdMap.set(`${product.id}/${task.id}`, absId);
        const { x, y } = colRowToXY(task.col, task.row, productIndex);
        allTasks.push({ id: absId, title: task.title, note: task.note, color: task.color, duration: task.duration, x, y });
      }
      for (const conn of opt.connections) {
        allConnections.push({ id: cid(), from: prefixId(conn.from), to: prefixId(conn.to) });
      }
      for (const conn of opt.baseConnections ?? []) {
        // Only add if both ends exist (option task might not exist yet if not selected)
        const from = prefixId(conn.from);
        const to = prefixId(conn.to);
        if (allTasks.find((t) => t.id === from) && allTasks.find((t) => t.id === to)) {
          allConnections.push({ id: cid(), from, to });
        }
      }
    }
  });

  // Cross-product links — only when both products are selected
  const selectedProductIds = new Set(selections.map((s) => s.productId));
  for (const link of CROSS_PRODUCT_LINKS) {
    if (!selectedProductIds.has(link.fromProduct) || !selectedProductIds.has(link.toProduct)) continue;
    const from = taskIdMap.get(`${link.fromProduct}/${link.fromTask}`);
    const to = taskIdMap.get(`${link.toProduct}/${link.toTask}`);
    if (from && to) {
      allConnections.push({ id: cid(), from, to });
    }
  }

  // Deduplicate connections
  const seen = new Set<string>();
  const dedupedConnections = allConnections.filter((c) => {
    const key = `${c.from}→${c.to}`;
    const rev = `${c.to}→${c.from}`;
    if (seen.has(key) || seen.has(rev)) return false;
    seen.add(key);
    return true;
  });

  return { tasks: allTasks, connections: dedupedConnections };
}
