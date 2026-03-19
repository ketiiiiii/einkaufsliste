import { NextRequest, NextResponse } from "next/server";

import { generateBoardFromAnswers, type WizardAnswers, type GeneratedTask, type GeneratedConnection } from "@/lib/task-templates";
import { requireUserId } from "@/lib/require-user";

export async function POST(req: NextRequest) {
  await requireUserId();

  let answers: WizardAnswers;
  try {
    answers = (await req.json()) as WizardAnswers;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Basic validation
  if (!answers.projectType || !answers.teamSize || !answers.timeline) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Rule-based board — always available, no key needed
  const ruleBasedBoard = generateBoardFromAnswers(answers);

  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey) {
    // No key → return rule-based result directly
    return NextResponse.json({ board: ruleBasedBoard, source: "template" });
  }

  // AI-enhanced generation
  try {
    const systemPrompt = `You are a software project planning expert. 
Given a project description and answers, suggest additional specific tasks that complement the provided base task list.
Return ONLY a JSON object with this exact shape:
{
  "additionalTasks": [
    { "title": "string", "note": "string (max 60 chars)", "color": "amber|emerald|sky|rose|violet", "insertAfterTitle": "string or null" }
  ]
}
Keep additionalTasks to max 4 items. Focus on project-specific tasks not already covered by the base list.`;

    const userPrompt = `Project: "${answers.projectName || "Unnamed"}"
Description: "${answers.description || "No description"}"
Type: ${answers.projectType}, Team: ${answers.teamSize}, Timeline: ${answers.timeline}
Stack: ${answers.techStack.join(", ") || "unspecified"}
Auth: ${answers.auth}, DB: ${answers.database}
Extras: ${answers.extras.join(", ") || "none"}

Base tasks already included:
${ruleBasedBoard.tasks.map((t) => `- ${t.title}`).join("\n")}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      // AI call failed silently → fall back to template
      return NextResponse.json({ board: ruleBasedBoard, source: "template" });
    }

    const aiData = (await aiRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = aiData.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      additionalTasks?: Array<{
        title: string;
        note?: string;
        color: "amber" | "emerald" | "sky" | "rose" | "violet";
        insertAfterTitle?: string | null;
      }>;
    };

    const additionalTasks = parsed.additionalTasks ?? [];

    if (additionalTasks.length === 0) {
      return NextResponse.json({ board: ruleBasedBoard, source: "template" });
    }

    // Merge AI tasks into the board
    const newTasks: Array<GeneratedTask & { x: number; y: number }> = [...ruleBasedBoard.tasks];
    const newConnections: GeneratedConnection[] = [...ruleBasedBoard.connections];

    let xOffset = 1340;
    let yOffset = 40;

    for (const aiTask of additionalTasks) {
      const id = `ai-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
      const task: GeneratedTask & { x: number; y: number } = {
        id,
        title: aiTask.title.slice(0, 60),
        note: aiTask.note ? aiTask.note.slice(0, 60) : undefined,
        color: aiTask.color ?? "sky",
        x: xOffset,
        y: yOffset,
      };
      newTasks.push(task);
      yOffset += 160;

      if (aiTask.insertAfterTitle) {
        const anchor = newTasks.find(
          (t) => t.title.toLowerCase().includes(aiTask.insertAfterTitle!.toLowerCase())
        );
        if (anchor) {
          newConnections.push({ id: `gc-ai-${id}`, from: anchor.id, to: id });
        }
      }
    }

    return NextResponse.json({
      board: { tasks: newTasks, connections: newConnections },
      source: "ai",
    });
  } catch {
    // Any AI error → graceful fallback
    return NextResponse.json({ board: ruleBasedBoard, source: "template" });
  }
}
