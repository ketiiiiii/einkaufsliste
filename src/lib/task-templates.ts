// ─── Shared Types ─────────────────────────────────────────────────────────────

export type ColorToken = "amber" | "emerald" | "sky" | "rose" | "violet";

export type GeneratedTask = {
  id: string;
  title: string;
  note?: string;
  color: ColorToken;
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

// ─── Wizard Answer Types ──────────────────────────────────────────────────────

export type ProjectType = "web-app" | "mobile-app" | "api" | "cli" | "library" | "desktop";
export type TeamSize = "solo" | "small" | "medium" | "large";
export type Timeline = "hackathon" | "mvp" | "short" | "full";
export type AuthLevel = "none" | "simple" | "oauth" | "mfa";
export type DatabaseType = "none" | "sql" | "nosql" | "unclear";
export type Extra = "cicd" | "testing" | "security" | "i18n" | "monitoring" | "payment";
export type TechStack = "nextjs" | "vue" | "node" | "python" | "mobile" | "other";

export type WizardAnswers = {
  projectType: ProjectType;
  teamSize: TeamSize;
  timeline: Timeline;
  techStack: TechStack[];
  auth: AuthLevel;
  database: DatabaseType;
  extras: Extra[];
  projectName: string;
  description: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _counter = 0;
const tid = (label: string) => `gen-${label}-${++_counter}`;
const cid = () => `gc-${++_counter}`;

function resetCounter() {
  _counter = 0;
}

function link(from: string, to: string): GeneratedConnection {
  return { id: cid(), from, to };
}

// ─── Core Phase Builders ──────────────────────────────────────────────────────

function planningPhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[] } {
  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const req = { id: tid("requirements"), title: "Anforderungen sammeln", note: "Scope, Stakeholder, Ziele", color: "amber" as ColorToken };
  const arch = { id: tid("architecture"), title: "Architektur entwerfen", note: "Komponentendiagramm, Tech-Entscheide", color: "amber" as ColorToken };
  tasks.push(req, arch);
  connections.push(link(req.id, arch.id));

  if (answers.teamSize !== "solo") {
    const teamSetup = { id: tid("team"), title: "Team & Rollen definieren", note: "Verantwortlichkeiten, Kommunikation", color: "amber" as ColorToken };
    tasks.push(teamSetup);
    connections.push(link(req.id, teamSetup.id));
    connections.push(link(teamSetup.id, arch.id));
  }

  return { tasks, connections };
}

function setupPhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[]; firstId: string; lastId: string } {
  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const repoSetup = { id: tid("repo"), title: "Repository einrichten", note: "Git, Branch-Strategie, .gitignore", color: "sky" as ColorToken };
  tasks.push(repoSetup);

  let lastId = repoSetup.id;

  if (answers.techStack.includes("nextjs") || answers.techStack.includes("vue")) {
    const scaffold = { id: tid("scaffold"), title: "Projekt scaffolden", note: `${answers.techStack.join(", ")} Setup`, color: "sky" as ColorToken };
    tasks.push(scaffold);
    connections.push(link(lastId, scaffold.id));
    lastId = scaffold.id;
  }

  if (answers.extras.includes("cicd")) {
    const ci = { id: tid("ci"), title: "CI/CD Pipeline aufsetzen", note: "GitHub Actions / Vercel / Render", color: "sky" as ColorToken };
    tasks.push(ci);
    connections.push(link(lastId, ci.id));
    lastId = ci.id;
  }

  if (answers.database !== "none" && answers.database !== "unclear") {
    const db = { id: tid("db"), title: "Datenbank einrichten", note: answers.database === "sql" ? "Schema, Migrations" : "Collections, Indexes", color: "sky" as ColorToken };
    tasks.push(db);
    connections.push(link(lastId, db.id));
    lastId = db.id;
  }

  return { tasks, connections, firstId: repoSetup.id, lastId };
}

function authPhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[]; firstId: string; lastId: string } | null {
  if (answers.auth === "none") return null;

  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const authBase = {
    id: tid("auth"),
    title: answers.auth === "simple" ? "Login / Registrierung" : answers.auth === "oauth" ? "OAuth Integration" : "Auth + MFA",
    note: answers.auth === "oauth" ? "Provider: Google/GitHub/..." : answers.auth === "mfa" ? "TOTP oder SMS" : "E-Mail + Passwort",
    color: "rose" as ColorToken,
  };
  tasks.push(authBase);

  const session = { id: tid("session"), title: "Session & Guards", note: "Route-Schutz, Token-Handling", color: "rose" as ColorToken };
  tasks.push(session);
  connections.push(link(authBase.id, session.id));

  return { tasks, connections, firstId: authBase.id, lastId: session.id };
}

function featurePhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[]; firstId: string; lastId: string } {
  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const coreFeature = {
    id: tid("core"),
    title: "Kernfunktionen entwickeln",
    note: answers.description ? answers.description.slice(0, 60) : "Haupt-Feature-Set",
    color: "emerald" as ColorToken,
  };
  tasks.push(coreFeature);

  let lastId = coreFeature.id;

  if (answers.extras.includes("i18n")) {
    const i18n = { id: tid("i18n"), title: "i18n / Lokalisierung", note: "Sprachstrings, Locale-Setup", color: "emerald" as ColorToken };
    tasks.push(i18n);
    connections.push(link(lastId, i18n.id));
    lastId = i18n.id;
  }

  if (answers.extras.includes("payment")) {
    const pay = { id: tid("payment"), title: "Payment Integration", note: "Stripe / PayPal, Webhooks", color: "emerald" as ColorToken };
    tasks.push(pay);
    connections.push(link(lastId, pay.id));
    lastId = pay.id;
  }

  const ui = { id: tid("ui"), title: "UI / UX finalisieren", note: "Responsiveness, Accessibility, Design-System", color: "emerald" as ColorToken };
  tasks.push(ui);
  connections.push(link(lastId, ui.id));

  return { tasks, connections, firstId: coreFeature.id, lastId: ui.id };
}

function qualityPhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[]; firstId: string; lastId: string } {
  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const tasks_arr: GeneratedTask[] = [];

  if (answers.extras.includes("testing")) {
    const test = { id: tid("testing"), title: "Tests schreiben", note: "Unit, Integration, E2E", color: "violet" as ColorToken };
    tasks_arr.push(test);
  }

  if (answers.extras.includes("security")) {
    const sec = { id: tid("security"), title: "Security Review / GDPR", note: "OWASP Checklist, Datenschutz", color: "violet" as ColorToken };
    tasks_arr.push(sec);
  }

  if (answers.extras.includes("monitoring")) {
    const mon = { id: tid("monitoring"), title: "Monitoring & Alerting", note: "Sentry, Uptime, Logs", color: "violet" as ColorToken };
    tasks_arr.push(mon);
  }

  const review = { id: tid("review"), title: "Code Review & QA", note: "PR-Reviews, Bugfixing", color: "violet" as ColorToken };
  tasks_arr.push(review);

  tasks.push(...tasks_arr);

  let firstId = tasks_arr[0]?.id ?? review.id;
  for (let i = 0; i < tasks_arr.length - 1; i++) {
    connections.push(link(tasks_arr[i].id, tasks_arr[i + 1].id));
  }

  return { tasks, connections, firstId, lastId: review.id };
}

function deployPhase(answers: WizardAnswers): { tasks: GeneratedTask[]; connections: GeneratedConnection[]; firstId: string; lastId: string } {
  const tasks: GeneratedTask[] = [];
  const connections: GeneratedConnection[] = [];

  const staging = { id: tid("staging"), title: "Staging Deployment", note: "Test-Umgebung bereitstellen", color: "rose" as ColorToken };
  const prod = { id: tid("prod"), title: "Production Release", note: answers.timeline === "hackathon" ? "Schneller Deploy" : "Rollout-Plan, Runbook", color: "rose" as ColorToken };
  const docs = { id: tid("docs"), title: "Dokumentation", note: "README, API-Docs, Changelog", color: "rose" as ColorToken };

  tasks.push(staging, prod, docs);
  connections.push(link(staging.id, prod.id));
  connections.push(link(prod.id, docs.id));

  return { tasks, connections, firstId: staging.id, lastId: docs.id };
}

// ─── Position Layouter ────────────────────────────────────────────────────────

const COL_X = [40, 300, 560, 820, 1080];
const ROW_H = 160;

function layoutTasks(tasks: GeneratedTask[]): Array<GeneratedTask & { x: number; y: number }> {
  const phaseMap: Record<ColorToken, number> = {
    amber: 0,
    sky: 1,
    emerald: 2,
    violet: 3,
    rose: 4,
  };
  const colCounts: number[] = [0, 0, 0, 0, 0];
  return tasks.map((t) => {
    const col = phaseMap[t.color] ?? 0;
    const row = colCounts[col]++;
    return { ...t, x: COL_X[col], y: 40 + row * ROW_H };
  });
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateBoardFromAnswers(answers: WizardAnswers): GeneratedBoard & { tasks: Array<GeneratedTask & { x: number; y: number }> } {
  resetCounter();

  const allTasks: GeneratedTask[] = [];
  const allConnections: GeneratedConnection[] = [];

  // Phases
  const planning = planningPhase(answers);
  const setup = setupPhase(answers);
  const auth = authPhase(answers);
  const features = featurePhase(answers);
  const quality = qualityPhase(answers);
  const deploy = deployPhase(answers);

  allTasks.push(...planning.tasks, ...setup.tasks);
  allConnections.push(...planning.connections, ...setup.connections);

  // Planning → Setup
  const lastPlanningTask = planning.tasks[planning.tasks.length - 1];
  if (lastPlanningTask) {
    allConnections.push(link(lastPlanningTask.id, setup.firstId));
  }

  if (auth) {
    allTasks.push(...auth.tasks);
    allConnections.push(...auth.connections);
    allConnections.push(link(setup.lastId, auth.firstId));
    allConnections.push(link(auth.lastId, features.firstId));
  } else {
    allConnections.push(link(setup.lastId, features.firstId));
  }

  allTasks.push(...features.tasks, ...quality.tasks, ...deploy.tasks);
  allConnections.push(...features.connections, ...quality.connections, ...deploy.connections);

  // Features → Quality → Deploy
  allConnections.push(link(features.lastId, quality.firstId));
  allConnections.push(link(quality.lastId, deploy.firstId));

  return {
    tasks: layoutTasks(allTasks),
    connections: allConnections,
  };
}

// ─── Saved Templates (localStorage) ──────────────────────────────────────────

export type SavedTemplate = {
  id: string;
  name: string;
  createdAt: string;
  answers: WizardAnswers;
  board: GeneratedBoard & { tasks: Array<GeneratedTask & { x: number; y: number }> };
};

const TEMPLATES_KEY = "task-board:templates:v1";

export function loadSavedTemplates(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplate(template: Omit<SavedTemplate, "id" | "createdAt">): SavedTemplate {
  const full: SavedTemplate = {
    ...template,
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tpl-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const existing = loadSavedTemplates();
  const updated = [full, ...existing].slice(0, 20); // max 20 gespeichert
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  }
  return full;
}

export function deleteTemplate(id: string): void {
  if (typeof window === "undefined") return;
  const existing = loadSavedTemplates();
  const updated = existing.filter((t) => t.id !== id);
  window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
}
