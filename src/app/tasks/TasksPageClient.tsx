"use client";

import { useEffect, useState } from "react";

import {
  loadSavedTemplates,
  deleteTemplate,
  type SavedTemplate,
  type GeneratedTask,
  type GeneratedConnection,
} from "@/lib/task-templates";
import { TaskBoard } from "./TaskBoard";
import { TaskWizard } from "./TaskWizard";
import { ProductComposer } from "./ProductComposer";

type GeneratedBoard = {
  tasks: Array<GeneratedTask & { x: number; y: number }>;
  connections: GeneratedConnection[];
};

export function TasksPageClient() {
  const [showWizard, setShowWizard] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [pendingBoard, setPendingBoard] = useState<GeneratedBoard | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    setSavedTemplates(loadSavedTemplates());
  }, []);

  const handleWizardConfirm = (board: GeneratedBoard) => {
    setPendingBoard(board);
    setShowWizard(false);
    setSavedTemplates(loadSavedTemplates());
  };

  const handleLoadTemplate = (template: SavedTemplate) => {
    setPendingBoard(template.board);
    setShowTemplates(false);
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
    setSavedTemplates(loadSavedTemplates());
  };

  return (
    <>
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition"
        >
          ✦ Projektablauf generieren
        </button>
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
        >
          ⊞ Produkte kombinieren
        </button>
        {savedTemplates.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTemplates((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
          >
            📁 Gespeicherte Templates
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
              {savedTemplates.length}
            </span>
          </button>
        )}
      </div>

      {/* Saved templates panel */}
      {showTemplates && savedTemplates.length > 0 && (
        <div className="mb-5 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-900">Gespeicherte Templates</h3>
            <button
              type="button"
              onClick={() => setShowTemplates(false)}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Schliessen
            </button>
          </div>
          <ul className="divide-y divide-zinc-100">
            {savedTemplates.map((tpl) => (
              <li key={tpl.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{tpl.name}</p>
                  <p className="text-xs text-zinc-400">
                    {new Date(tpl.createdAt).toLocaleDateString("de-DE")} ·{" "}
                    {tpl.board.tasks.length} Tasks · {tpl.answers.projectType}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(tpl)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                  >
                    Laden
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
                    aria-label="Template löschen"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <TaskWizard
              onConfirm={handleWizardConfirm}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        </div>
      )}

      {/* Product Composer modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <ProductComposer
              onConfirm={(board) => {
                setPendingBoard(board);
                setShowComposer(false);
              }}
              onCancel={() => setShowComposer(false)}
            />
          </div>
        </div>
      )}

      {/* Board */}
      <TaskBoard externalBoard={pendingBoard} onExternalBoardConsumed={() => setPendingBoard(null)} />
    </>
  );
}
