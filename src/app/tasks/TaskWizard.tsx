"use client";

import { useState } from "react";

import {
  generateBoardFromAnswers,
  saveTemplate,
  type WizardAnswers,
  type ProjectType,
  type TeamSize,
  type Timeline,
  type AuthLevel,
  type DatabaseType,
  type Extra,
  type TechStack,
  type GeneratedTask,
  type GeneratedConnection,
} from "@/lib/task-templates";

// ─── Types ────────────────────────────────────────────────────────────────────

type GeneratedBoard = {
  tasks: Array<GeneratedTask & { x: number; y: number }>;
  connections: GeneratedConnection[];
};

type Props = {
  onConfirm: (board: GeneratedBoard) => void;
  onCancel: () => void;
};

// ─── Step Config ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8;

const PROJECT_TYPES: { value: ProjectType; label: string; icon: string }[] = [
  { value: "web-app", label: "Web App", icon: "🌐" },
  { value: "mobile-app", label: "Mobile App", icon: "📱" },
  { value: "api", label: "API / Microservice", icon: "⚡" },
  { value: "cli", label: "CLI Tool", icon: "💻" },
  { value: "library", label: "Library / SDK", icon: "📦" },
  { value: "desktop", label: "Desktop App", icon: "🖥️" },
];

const TEAM_SIZES: { value: TeamSize; label: string; sub: string }[] = [
  { value: "solo", label: "Solo", sub: "1 Person" },
  { value: "small", label: "Klein", sub: "2–4 Personen" },
  { value: "medium", label: "Mittel", sub: "5–10 Personen" },
  { value: "large", label: "Groß", sub: "10+ Personen" },
];

const TIMELINES: { value: Timeline; label: string; sub: string }[] = [
  { value: "hackathon", label: "Hackathon", sub: "< 1 Woche" },
  { value: "mvp", label: "MVP", sub: "1–4 Wochen" },
  { value: "short", label: "Kurzprojekt", sub: "1–3 Monate" },
  { value: "full", label: "Vollprojekt", sub: "3–6+ Monate" },
];

const TECH_STACKS: { value: TechStack; label: string }[] = [
  { value: "nextjs", label: "Next.js" },
  { value: "vue", label: "Vue / Nuxt" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "mobile", label: "React Native / Flutter" },
  { value: "other", label: "Anderes" },
];

const AUTH_LEVELS: { value: AuthLevel; label: string; sub: string }[] = [
  { value: "none", label: "Keine Auth", sub: "Öffentlicher Zugriff" },
  { value: "simple", label: "Einfach", sub: "E-Mail + Passwort" },
  { value: "oauth", label: "OAuth", sub: "Google, GitHub, …" },
  { value: "mfa", label: "MFA", sub: "Multi-Faktor" },
];

const DATABASE_TYPES: { value: DatabaseType; label: string; sub: string }[] = [
  { value: "none", label: "Keine DB", sub: "Statisch / localStorage" },
  { value: "sql", label: "SQL", sub: "PostgreSQL, MySQL, SQLite" },
  { value: "nosql", label: "NoSQL", sub: "MongoDB, Firestore" },
  { value: "unclear", label: "Noch unklar", sub: "Entscheidung offen" },
];

const EXTRAS: { value: Extra; label: string; icon: string }[] = [
  { value: "cicd", label: "CI/CD", icon: "🔄" },
  { value: "testing", label: "Testing", icon: "🧪" },
  { value: "security", label: "Security / GDPR", icon: "🔒" },
  { value: "i18n", label: "i18n / Lokalisierung", icon: "🌍" },
  { value: "monitoring", label: "Monitoring", icon: "📊" },
  { value: "payment", label: "Payment", icon: "💳" },
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Schritt {step} / {TOTAL_STEPS}
      </p>
      <h2 className="mt-1 text-xl font-bold text-zinc-900">{title}</h2>
      <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className="h-full rounded-full bg-zinc-900 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SingleChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sub?: string; icon?: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex flex-col items-start rounded-xl border px-3 py-3 text-left text-sm transition ${
            value === o.value
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          {o.icon && <span className="mb-1 text-lg">{o.icon}</span>}
          <span className="font-semibold">{o.label}</span>
          {o.sub && (
            <span className={`mt-0.5 text-xs ${value === o.value ? "text-zinc-300" : "text-zinc-400"}`}>
              {o.sub}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MultiChoice<T extends string>({
  options,
  values,
  onChange,
}: {
  options: { value: T; label: string; icon?: string }[];
  values: T[];
  onChange: (v: T[]) => void;
}) {
  const toggle = (v: T) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {o.icon && <span>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Preview Mini-Board ───────────────────────────────────────────────────────

const PREVIEW_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  sky: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-900" },
};

function PreviewBoard({ board }: { board: GeneratedBoard }) {
  // Scale-down: detect bounding box and scale to fit preview container (max 700 x 400 logical)
  const PREVIEW_W = 700;
  const PREVIEW_H = 380;
  const CARD_W = 180;
  const CARD_H = 64;

  const maxX = Math.max(...board.tasks.map((t) => t.x + 224), PREVIEW_W);
  const maxY = Math.max(...board.tasks.map((t) => t.y + 140), PREVIEW_H);
  const scaleX = PREVIEW_W / maxX;
  const scaleY = PREVIEW_H / maxY;
  const scale = Math.min(scaleX, scaleY, 1);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-zinc-100" style={{ height: PREVIEW_H }}>
      <div
        className="absolute inset-0 origin-top-left"
        style={{ transform: `scale(${scale})`, width: maxX, height: maxY }}
      >
        <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" aria-hidden>
          <defs>
            <marker id="prev-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#a1a1aa" />
            </marker>
          </defs>
          {board.connections.map((c) => {
            const from = board.tasks.find((t) => t.id === c.from);
            const to = board.tasks.find((t) => t.id === c.to);
            if (!from || !to) return null;
            const x1 = from.x + 112;
            const y1 = from.y + 70;
            const x2 = to.x + 112;
            const y2 = to.y + 70;
            return (
              <line
                key={c.id}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#a1a1aa" strokeWidth={2} strokeLinecap="round"
                markerEnd="url(#prev-arrow)"
                className="mix-blend-multiply"
              />
            );
          })}
        </svg>
        {board.tasks.map((task) => {
          const colors = PREVIEW_COLORS[task.color] ?? PREVIEW_COLORS.sky;
          return (
            <div
              key={task.id}
              className={`absolute rounded-xl border px-2 py-1.5 shadow-sm ${colors.bg} ${colors.border} ${colors.text}`}
              style={{ left: task.x, top: task.y, width: CARD_W, minHeight: CARD_H }}
            >
              <p className="text-xs font-bold leading-snug">{task.title}</p>
              {task.note && <p className="mt-0.5 text-[10px] text-zinc-500">{task.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const defaultAnswers: WizardAnswers = {
  projectType: "web-app",
  teamSize: "solo",
  timeline: "mvp",
  techStack: [],
  auth: "simple",
  database: "sql",
  extras: [],
  projectName: "",
  description: "",
};

export function TaskWizard({ onConfirm, onCancel }: Props) {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<WizardAnswers>(defaultAnswers);
  const [preview, setPreview] = useState<GeneratedBoard | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const [generationSource, setGenerationSource] = useState<"template" | "ai" | null>(null);

  const set = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const canProceed = (): boolean => {
    if (step === 1) return !!answers.projectType;
    if (step === 2) return !!answers.teamSize;
    if (step === 3) return !!answers.timeline;
    if (step === 4) return true; // tech stack optional
    if (step === 5) return !!answers.auth;
    if (step === 6) return !!answers.database;
    if (step === 7) return true; // extras optional
    if (step === 8) return answers.projectName.trim().length > 0;
    return true;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as { board: GeneratedBoard; source: "template" | "ai" };
      setPreview(data.board);
      setGenerationSource(data.source);
      setTemplateName(answers.projectName || "Neues Projekt");
    } catch {
      // Fallback: client-side rule-based generation
      const board = generateBoardFromAnswers(answers);
      setPreview(board);
      setGenerationSource("template");
      setTemplateName(answers.projectName || "Neues Projekt");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    if (saveAsTemplate && templateName.trim()) {
      saveTemplate({ name: templateName.trim(), answers, board: preview });
    }
    onConfirm(preview);
  };

  // ── Preview screen ──
  if (preview) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Vorschau</h2>
            <p className="text-sm text-zinc-500">
              {preview.tasks.length} Tasks · {preview.connections.length} Verbindungen
              {generationSource === "ai" && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
                  ✦ KI-ergänzt
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="text-xs text-zinc-400 hover:text-zinc-700 underline"
          >
            ← Zurück zum Wizard
          </button>
        </div>

        <PreviewBoard board={preview} />

        {/* Task list */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {preview.tasks.map((t) => {
            const colors = PREVIEW_COLORS[t.color] ?? PREVIEW_COLORS.sky;
            return (
              <div
                key={t.id}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${colors.bg} ${colors.border} ${colors.text}`}
              >
                <span className="font-semibold">{t.title}</span>
                {t.note && <span className="block text-zinc-500">{t.note}</span>}
              </div>
            );
          })}
        </div>

        {/* Save option */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Als Template speichern
          </label>
          {saveAsTemplate && (
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template-Name"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Ins Board laden ↗
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard steps ──
  return (
    <div className="space-y-2">
      <ProgressBar step={step} />

      {step === 1 && (
        <>
          <StepHeader step={1} title="Projekttyp" subtitle="Um welche Art Software handelt es sich?" />
          <SingleChoice options={PROJECT_TYPES} value={answers.projectType} onChange={(v) => set("projectType", v)} />
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} title="Teamgröße" subtitle="Wie viele Personen arbeiten am Projekt?" />
          <SingleChoice options={TEAM_SIZES} value={answers.teamSize} onChange={(v) => set("teamSize", v)} />
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader step={3} title="Timeline / Scope" subtitle="Wie viel Zeit habt ihr?" />
          <SingleChoice options={TIMELINES} value={answers.timeline} onChange={(v) => set("timeline", v)} />
        </>
      )}

      {step === 4 && (
        <>
          <StepHeader step={4} title="Tech Stack" subtitle="Welche Technologien verwendet ihr? (Mehrfachauswahl)" />
          <MultiChoice
            options={TECH_STACKS}
            values={answers.techStack}
            onChange={(v) => set("techStack", v)}
          />
          <p className="mt-3 text-xs text-zinc-400">Optional — kann leer gelassen werden.</p>
        </>
      )}

      {step === 5 && (
        <>
          <StepHeader step={5} title="Authentifizierung" subtitle="Welche Art von Auth braucht das Projekt?" />
          <SingleChoice options={AUTH_LEVELS} value={answers.auth} onChange={(v) => set("auth", v)} />
        </>
      )}

      {step === 6 && (
        <>
          <StepHeader step={6} title="Datenbank" subtitle="Welches Datenbankmodell wird verwendet?" />
          <SingleChoice options={DATABASE_TYPES} value={answers.database} onChange={(v) => set("database", v)} />
        </>
      )}

      {step === 7 && (
        <>
          <StepHeader step={7} title="Besonderheiten" subtitle="Was soll noch berücksichtigt werden? (Mehrfachauswahl)" />
          <MultiChoice
            options={EXTRAS}
            values={answers.extras}
            onChange={(v) => set("extras", v)}
          />
          <p className="mt-3 text-xs text-zinc-400">Optional — kann leer gelassen werden.</p>
        </>
      )}

      {step === 8 && (
        <>
          <StepHeader step={8} title="Projektname & Beschreibung" subtitle="Wird an die KI übergeben für spezifischere Tasks." />
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-700">
              Projektname *
              <input
                type="text"
                value={answers.projectName}
                onChange={(e) => set("projectName", e.target.value)}
                placeholder="z. B. Einkaufsplaner Pro"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-base text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold text-zinc-700">
              Kurzbeschreibung (optional)
              <textarea
                value={answers.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Kurz beschreiben, was das Projekt macht…"
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none resize-none"
              />
            </label>
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex gap-2 pt-4">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            ← Zurück
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Abbrechen
          </button>
        )}

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="ml-auto rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Weiter →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canProceed() || isGenerating}
            className="ml-auto rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? "Generiere…" : "Projektablauf generieren ✦"}
          </button>
        )}
      </div>
    </div>
  );
}
