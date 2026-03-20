import { readFileSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import {
  findMostRecentCSV,
  parseClockifyCSV,
  groupEntries,
  extractPeriod,
} from "./csv-parser.js";
import { estimateLineItems } from "./estimator.js";
import { generateInvoicePDF } from "./pdf-generator.js";
import { applyRetainer } from "./retainer.js";
import type { InvoiceConfig, Invoice, ClientConfig } from "./types.js";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const projectRoot = resolve(import.meta.dirname, "..");
  const configPath = args.config || join(projectRoot, "config.json");
  const backupsDir = args.input || join(projectRoot, "invoice-backups");
  const outputDir = args.output || join(projectRoot, "output");

  // Load config
  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error(`Create a config.json file. See config.example.json for reference.`);
    process.exit(1);
  }

  const config: InvoiceConfig = JSON.parse(readFileSync(configPath, "utf-8"));

  // Find and parse CSV
  const csvPath = args.file
    ? resolve(args.file)
    : findMostRecentCSV(backupsDir);

  console.log(`\nReading: ${basename(csvPath)}`);
  const entries = parseClockifyCSV(csvPath);
  console.log(`  Found ${entries.length} time entries`);

  // Group entries by description, rounding each entry to billing increment
  const billingIncrement = config.billingIncrement || 0.1;
  const grouped = groupEntries(entries, billingIncrement, config.hourlyRate);
  console.log(`  Grouped into ${grouped.length} line items (billed in ${billingIncrement}h increments)`);

  // Extract period and client info
  const period = extractPeriod(entries);
  console.log(`  Period: ${period.start} — ${period.end}`);
  console.log(`  Client: ${period.client} (${period.project})\n`);

  // AI estimation
  console.log("Estimating market-average completion times...");
  const estimated = args["skip-ai"] === "true"
    ? grouped.map((item) => ({
        ...item,
        estimatedMarketHours: Math.round(item.totalHours * 1.5 * 10) / 10,
        estimationJustification: "Estimate based on typical 1.5x industry average for comparable tasks.",
      }))
    : await estimateLineItems(grouped);

  // Build invoice — use project name as client company, CSV "Client" field as contact
  const client: ClientConfig = config.defaultClient || {
    name: period.project,
    contactName: period.client,
  };

  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + config.paymentTermsDays);

  const totalHours = estimated.reduce((sum, item) => sum + item.totalHours, 0);
  const totalAmount = estimated.reduce(
    (sum, item) => sum + item.totalAmount,
    0,
  );
  const totalEstimatedMarketHours = estimated.reduce(
    (sum, item) => sum + item.estimatedMarketHours,
    0,
  );

  const invoiceNumber = generateInvoiceNumber(config.invoiceNumberPrefix || "INV", today);

  // Apply retainer if balance exists
  const prefix = config.invoiceNumberPrefix || "INV";
  const retainer = applyRetainer(prefix, totalAmount, invoiceNumber);

  const invoice: Invoice = {
    invoiceNumber,
    issueDate: formatDate(today),
    dueDate: formatDate(dueDate),
    periodStart: period.start,
    periodEnd: period.end,
    from: config.from,
    client,
    lineItems: estimated,
    totalHours,
    totalAmount,
    totalEstimatedMarketHours,
    hourlyRate: config.hourlyRate,
    currency: config.currency,
    paymentTermsDays: config.paymentTermsDays,
    paymentInstructions: config.paymentInstructions,
    remittance: config.remittance,
    lateInterestRate: config.lateInterestRate,
    retainerApplied: retainer.retainerApplied > 0 ? retainer.retainerApplied : undefined,
    retainerRemaining: retainer.retainerApplied > 0 ? retainer.retainerRemaining : undefined,
  };

  // Generate PDF
  const outputFileName = `invoice-${invoiceNumber}-${period.project.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  const outputPath = join(outputDir, outputFileName);

  console.log(`\nGenerating invoice PDF...`);
  await generateInvoicePDF(invoice, outputPath);

  console.log(`\nInvoice generated: ${outputPath}`);
  console.log(`  Invoice #: ${invoiceNumber}`);
  console.log(`  Total: $${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  if (retainer.retainerApplied > 0) {
    console.log(`  Retainer applied: -$${retainer.retainerApplied.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`  Amount due: $${retainer.amountDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`  Retainer remaining: $${retainer.retainerRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }
  console.log(`  Hours: ${totalHours.toFixed(1)} actual vs ${totalEstimatedMarketHours.toFixed(1)} market estimate`);
  console.log(
    `  Value: ${((1 - totalHours / totalEstimatedMarketHours) * 100).toFixed(0)}% faster than market average\n`,
  );
}

function generateInvoiceNumber(prefix: string, date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${prefix}-${year}${month}${day}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
