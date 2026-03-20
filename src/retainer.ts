import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import type { RetainerState, RetainerLedgerEntry } from "./types.js";

const OLD_RETAINER_FILE = "retainer.json";

function getRetainerPath(prefix: string): string {
  const root = resolve(import.meta.dirname, "..");
  return join(root, `retainer-${prefix.toLowerCase()}.json`);
}

function migrateOldRetainer(prefix: string): void {
  const root = resolve(import.meta.dirname, "..");
  const oldPath = join(root, OLD_RETAINER_FILE);
  const newPath = getRetainerPath(prefix);

  if (existsSync(oldPath) && !existsSync(newPath)) {
    const data = readFileSync(oldPath, "utf-8");
    writeFileSync(newPath, data, "utf-8");
    unlinkSync(oldPath);
    console.log(`Migrated ${OLD_RETAINER_FILE} → retainer-${prefix.toLowerCase()}.json`);
  }
}

export function loadRetainer(prefix: string): RetainerState {
  migrateOldRetainer(prefix);
  const path = getRetainerPath(prefix);
  if (!existsSync(path)) {
    return { balance: 0, ledger: [] };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveRetainer(prefix: string, state: RetainerState): void {
  const path = getRetainerPath(prefix);
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function addDeposit(prefix: string, amount: number, note: string): RetainerState {
  const state = loadRetainer(prefix);
  const entry: RetainerLedgerEntry = {
    date: formatDateISO(new Date()),
    type: "deposit",
    amount,
    note,
  };
  state.balance += amount;
  state.ledger.push(entry);
  saveRetainer(prefix, state);
  return state;
}

export function applyRetainer(
  prefix: string,
  invoiceTotal: number,
  invoiceNumber: string,
): { retainerApplied: number; retainerRemaining: number; amountDue: number } {
  const state = loadRetainer(prefix);

  if (state.balance <= 0) {
    return { retainerApplied: 0, retainerRemaining: 0, amountDue: invoiceTotal };
  }

  const retainerApplied = Math.min(state.balance, invoiceTotal);
  const amountDue = invoiceTotal - retainerApplied;
  state.balance -= retainerApplied;

  const entry: RetainerLedgerEntry = {
    date: formatDateISO(new Date()),
    type: "debit",
    amount: retainerApplied,
    invoiceNumber,
    note: `Invoice ${invoiceNumber} applied`,
  };
  state.ledger.push(entry);
  saveRetainer(prefix, state);

  return { retainerApplied, retainerRemaining: state.balance, amountDue };
}

export function printStatus(prefix: string): void {
  const state = loadRetainer(prefix);

  console.log(`\nRetainer Balance (${prefix.toUpperCase()}): $${state.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n`);

  if (state.ledger.length === 0) {
    console.log("No transactions yet.\n");
    return;
  }

  console.log("Ledger:");
  console.log("─".repeat(80));
  for (const entry of state.ledger) {
    const sign = entry.type === "deposit" ? "+" : "-";
    const amount = `${sign}$${entry.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const invoice = entry.invoiceNumber ? ` [${entry.invoiceNumber}]` : "";
    console.log(`  ${entry.date}  ${amount.padEnd(15)} ${entry.note}${invoice}`);
  }
  console.log("");
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
