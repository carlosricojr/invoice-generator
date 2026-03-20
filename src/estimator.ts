import { execFileSync } from "child_process";
import { createInterface } from "readline";
import type { GroupedLineItem, EstimatedLineItem } from "./types.js";

const CLARIFICATION_PROMPT = `You are an expert consultant and project estimator. You will be given a list of tasks from a consulting engagement, each with actual hours spent by a specialist.

Before estimating market-average times, identify any tasks where the description is ambiguous and you'd benefit from clarification to give a more accurate and defensible estimate.

For each task, decide: is the description clear enough to estimate confidently, or would a brief clarification help?

Respond with ONLY valid JSON in this format:
{
  "questions": [
    {
      "taskIndex": <number>,
      "taskSnippet": "<first 60 chars of task description>",
      "question": "<specific clarifying question>",
      "options": ["<option1>", "<option2>", "<option3 if needed>"],
      "whyItMatters": "<1 sentence on how the answer affects the estimate>"
    }
  ]
}

If all tasks are clear enough, return: { "questions": [] }

Only ask questions that meaningfully affect the time estimate. Don't ask about things that are obvious from context. Limit to at most 4 questions total — focus on the highest-impact ambiguities.`;

const ESTIMATION_PROMPT = `You are an expert consultant and project estimator. You will be given a list of tasks from a consulting engagement, each with actual hours spent by a specialist.

For EACH task, estimate how long it would take the AVERAGE mid-to-senior professional working at a normal pace — someone without the consultant's cross-functional expertise who would need to context-switch, research, troubleshoot, and potentially involve multiple specialists.

Consider:
- Research and ramp-up time a typical professional would need
- Trial-and-error and troubleshooting overhead
- Typical corporate pace (meetings, approvals, coordination)
- Whether the task spans multiple disciplines (legal, technical, business, compliance)

Respond with ONLY a valid JSON array. Each element must match this format exactly:
[
  {
    "taskIndex": 0,
    "estimatedHours": <number>,
    "justification": "<1 sentence — reference the task type and why a typical professional would need more time>"
  }
]

Be realistic and defensible. Base estimates on general industry knowledge of comparable task types (e.g., IT admin setup times, legal document review rates, DNS/hosting configuration benchmarks). Do not inflate artificially — the goal is honest market-rate comparison.`;

export async function estimateLineItems(
  items: GroupedLineItem[],
): Promise<EstimatedLineItem[]> {
  console.log(`  Analyzing ${items.length} items for ambiguities...`);

  const taskList = formatTaskList(items);

  // Pass 1: Identify clarifying questions
  let clarifications = "";
  try {
    const questions = getClarifyingQuestions(taskList);
    if (questions.length > 0) {
      console.log(`  ${questions.length} clarification(s) needed.\n`);
      const answers = await askClarifyingQuestions(questions);
      clarifications = formatClarifications(questions, answers);
    } else {
      console.log(`  No clarifications needed.`);
    }
  } catch (error) {
    console.warn(`  Warning: Clarification pass failed, proceeding without.`);
  }

  // Pass 2: Generate estimates (with clarifications if any)
  console.log(`  Generating market-average estimates...`);
  try {
    const prompt = clarifications
      ? `Estimate market-average completion times for each task below:\n\n${taskList}\n\nAdditional context from the consultant:\n${clarifications}`
      : `Estimate market-average completion times for each task below:\n\n${taskList}`;

    const estimates = getEstimates(prompt);

    return items.map((item, i) => {
      const estimate = estimates.find((e: { taskIndex: number }) => e.taskIndex === i);
      if (estimate) {
        return {
          ...item,
          estimatedMarketHours: Math.round(estimate.estimatedHours * 10) / 10,
          estimationJustification: estimate.justification,
        };
      }
      return {
        ...item,
        estimatedMarketHours: Math.round(item.totalHours * 1.5 * 10) / 10,
        estimationJustification:
          "Estimate based on typical 1.5x industry average for comparable tasks.",
      };
    });
  } catch (error) {
    console.warn(`  Warning: AI estimation failed, using 1.5x fallback for all items`);
    console.warn(`  Error: ${error instanceof Error ? error.message : error}`);
    return items.map((item) => ({
      ...item,
      estimatedMarketHours: Math.round(item.totalHours * 1.5 * 10) / 10,
      estimationJustification:
        "Estimate based on typical 1.5x industry average for comparable tasks.",
    }));
  }
}

function formatTaskList(items: GroupedLineItem[]): string {
  return items
    .map(
      (item, i) =>
        `[Task ${i}] "${item.description}" | Categories: ${item.tags.join(", ")} | Actual hours: ${item.totalHours.toFixed(2)}`,
    )
    .join("\n");
}

function getClarifyingQuestions(
  taskList: string,
): Array<{
  taskIndex: number;
  taskSnippet: string;
  question: string;
  options: string[];
  whyItMatters: string;
}> {
  const prompt = `Review these consulting tasks and identify any ambiguities:\n\n${taskList}`;

  const output = execFileSync(
    "claude",
    [
      "-p", prompt,
      "--system-prompt", CLARIFICATION_PROMPT,
      "--output-format", "json",
      "--model", "sonnet",
      "--no-session-persistence",
    ],
    {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );

  const claudeResponse = JSON.parse(output);
  const text = claudeResponse.result || output;
  const jsonMatch = text.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.questions || [];
}

async function askClarifyingQuestions(
  questions: Array<{
    taskIndex: number;
    taskSnippet: string;
    question: string;
    options: string[];
    whyItMatters: string;
  }>,
): Promise<string[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so stdout stays clean for piping
  });

  const answers: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.error(`\n  Question ${i + 1}/${questions.length} (re: "${q.taskSnippet}...")`);
    console.error(`  ${q.question}`);
    console.error(`  Why it matters: ${q.whyItMatters}`);
    if (q.options.length > 0) {
      q.options.forEach((opt, j) => console.error(`    ${j + 1}) ${opt}`));
      console.error(`    0) Skip / no additional context`);
    }
    const answer = await new Promise<string>((resolve) => {
      rl.question("  > ", resolve);
    });
    answers.push(answer.trim() || "No additional context provided.");
  }

  rl.close();
  return answers;
}

function formatClarifications(
  questions: Array<{ taskIndex: number; question: string }>,
  answers: string[],
): string {
  return questions
    .map((q, i) => `- Task ${q.taskIndex}: Q: "${q.question}" A: "${answers[i]}"`)
    .join("\n");
}

function getEstimates(
  prompt: string,
): Array<{ taskIndex: number; estimatedHours: number; justification: string }> {
  const output = execFileSync(
    "claude",
    [
      "-p", prompt,
      "--system-prompt", ESTIMATION_PROMPT,
      "--output-format", "json",
      "--model", "sonnet",
      "--no-session-persistence",
    ],
    {
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );

  const claudeResponse = JSON.parse(output);
  const text = claudeResponse.result || output;

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error("Could not parse AI response as JSON array");
  }

  return JSON.parse(arrayMatch[0]);
}
