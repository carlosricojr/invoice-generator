import { readFileSync, readdirSync } from "fs";
import { parse } from "csv-parse/sync";
import { join } from "path";
import type { ClockifyEntry, GroupedLineItem } from "./types.js";

export function findMostRecentCSV(backupsDir: string): string {
  const files = readdirSync(backupsDir)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error(`No CSV files found in ${backupsDir}`);
  }

  return join(backupsDir, files[0]);
}

export function parseClockifyCSV(filePath: string): ClockifyEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return (records as Record<string, string>[]).map((row) => ({
    project: row["Project"],
    client: row["Client"],
    description: row["Description"],
    task: row["Task"],
    user: row["User"],
    email: row["Email"],
    tags: row["Tags"],
    billable: row["Billable"] === "Yes",
    startDate: row["Start Date"],
    startTime: row["Start Time"],
    endDate: row["End Date"],
    endTime: row["End Time"],
    durationHours: row["Duration (h)"],
    durationDecimal: parseFloat(row["Duration (decimal)"]),
    billableRate: parseFloat(row["Billable Rate (USD)"]),
    billableAmount: parseFloat(row["Billable Amount (USD)"]),
  }));
}

/**
 * Parse HH:MM:SS duration string to exact decimal hours.
 * Uses the raw time for precision instead of Clockify's pre-rounded decimal.
 */
function parseDurationToHours(duration: string): number {
  const parts = duration.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(Number);
  return h + m / 60 + s / 3600;
}

/**
 * Round hours UP to the nearest billing increment.
 * Standard consulting practice: no work goes unbilled.
 * e.g., with 0.1h increment: 0.033h (2 min) → 0.1h, 0.55h → 0.6h
 */
function roundToIncrement(hours: number, increment: number): number {
  return Math.ceil(hours / increment) * increment;
}

/**
 * Round a number to a fixed number of decimal places to avoid
 * floating-point accumulation errors (e.g., 0.1 + 0.2 = 0.30000000000000004).
 */
function roundDecimal(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function groupEntries(
  entries: ClockifyEntry[],
  billingIncrement: number,
  hourlyRate: number,
): GroupedLineItem[] {
  const groups: GroupedLineItem[] = [];
  // Determine decimal places from increment (0.1 → 1, 0.25 → 2, 0.01 → 2)
  const decimals = Math.max(1, -Math.floor(Math.log10(billingIncrement)));

  for (const entry of entries) {
    if (!entry.billable) continue;

    // Parse exact duration from HH:MM:SS and round UP to billing increment
    const exactHours = parseDurationToHours(entry.durationHours);
    const billedHours = roundToIncrement(exactHours, billingIncrement);
    const billedAmount = roundDecimal(billedHours * hourlyRate, 2);

    const existing = groups.find((g) => descriptionsMatch(g.description, entry.description));

    if (existing) {
      existing.totalHours = roundDecimal(existing.totalHours + billedHours, decimals);
      existing.totalAmount = roundDecimal(existing.totalAmount + billedAmount, 2);
      existing.entries.push(entry);
      if (entry.description.length > existing.description.length) {
        existing.description = entry.description;
      }
      const newTags = entry.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      for (const tag of newTags) {
        if (!existing.tags.includes(tag)) existing.tags.push(tag);
      }
    } else {
      groups.push({
        description: entry.description,
        tags: entry.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        totalHours: billedHours,
        totalAmount: billedAmount,
        hourlyRate: entry.billableRate,
        entries: [entry],
      });
    }
  }

  return groups.sort((a, b) => {
    const dateA = new Date(a.entries[0].startDate);
    const dateB = new Date(b.entries[0].startDate);
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Check if two descriptions are similar enough to merge.
 * Uses the shorter description as a prefix/substring check — if the shorter
 * one is contained in the longer one, or if they share a long common prefix,
 * they describe the same work.
 */
function descriptionsMatch(a: string, b: string): boolean {
  if (a === b) return true;

  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA.includes(normB) || normB.includes(normA)) return true;

  const shorter = normA.length < normB.length ? normA : normB;
  const longer = normA.length < normB.length ? normB : normA;
  const minPrefixLen = Math.floor(shorter.length * 0.6);

  if (minPrefixLen < 20) return false;

  let commonPrefix = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) commonPrefix++;
    else break;
  }

  return commonPrefix >= minPrefixLen;
}

export function extractPeriod(entries: ClockifyEntry[]): {
  start: string;
  end: string;
  client: string;
  project: string;
} {
  const dates = entries.map((e) => new Date(e.startDate));
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d) => d.getTime())));

  return {
    start: formatDate(start),
    end: formatDate(end),
    client: entries[0]?.client || "Unknown Client",
    project: entries[0]?.project || "Unknown Project",
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
