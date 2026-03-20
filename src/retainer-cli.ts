import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { addDeposit, printStatus } from "./retainer.js";
import type { InvoiceConfig } from "./types.js";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

function resolvePrefix(args: Record<string, string>): string {
  if (args.prefix) {
    return args.prefix;
  }

  const projectRoot = resolve(import.meta.dirname, "..");
  const configPath = join(projectRoot, "config.json");
  if (existsSync(configPath)) {
    const config: InvoiceConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.invoiceNumberPrefix) {
      return config.invoiceNumberPrefix;
    }
  }

  return "INV";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const prefix = resolvePrefix(args);

  if (args.status === "true") {
    printStatus(prefix);
    return;
  }

  if (args.deposit) {
    const amount = parseFloat(args.deposit);
    if (isNaN(amount) || amount <= 0) {
      console.error("Error: --deposit must be a positive number");
      process.exit(1);
    }
    const note = args.note || "Retainer deposit";
    const state = addDeposit(prefix, amount, note);
    console.log(`\nDeposit recorded (${prefix.toUpperCase()}): $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`New balance: $${state.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n`);
    return;
  }

  console.error("Usage:");
  console.error("  pnpm run retainer -- --status                          Show balance and ledger");
  console.error("  pnpm run retainer -- --deposit 5000                    Add funds");
  console.error('  pnpm run retainer -- --deposit 5000 --note "Retainer"  Add funds with note');
  console.error("  pnpm run retainer -- --prefix ACME --status            Show another client's balance");
  console.error("  pnpm run retainer -- --prefix ACME --deposit 3000      Deposit to another client");
  process.exit(1);
}

main();
