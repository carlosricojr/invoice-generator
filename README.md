# Invoice Generator

CLI tool that generates professional PDF invoices from Clockify time reports. Each line item includes an AI-estimated market-average completion time with a short justification, so clients can see the value they're getting relative to typical industry pace.

## How It Works

1. Reads a Clockify CSV export from `invoice-backups/`
2. Groups similar time entries into line items
3. Rounds each entry UP to the configured billing increment (standard consulting practice)
4. Uses Claude Code to estimate how long each task would take the average professional, with a brief justification
5. Generates a PDF invoice with actual hours, market estimates, and a "Value Delivered" summary

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and edit config with your company/client details
cp config.example.json config.json

# Place your Clockify CSV export in invoice-backups/

# Generate invoice
pnpm run generate

# Generate without AI estimation (uses 1.5x fallback)
pnpm run generate -- --skip-ai true
```

## Retainer Tracking

Track per-client retainer balances that auto-deduct when generating invoices. Each client's retainer is stored in a separate file keyed by their `invoiceNumberPrefix` (e.g., `retainer-osp.json`).

```bash
# Record a retainer deposit (uses invoiceNumberPrefix from config.json)
pnpm run retainer -- --deposit 5000 --note "Initial retainer"

# Check balance and transaction history
pnpm run retainer -- --status

# Manage a different client's retainer with --prefix
pnpm run retainer -- --prefix ACME --deposit 3000 --note "Q2 retainer"
pnpm run retainer -- --prefix ACME --status

# Generate invoice (retainer auto-applied from the matching prefix file)
pnpm run generate
```

When a retainer balance exists, invoices show a subtotal, the retainer deduction, and the net amount due. If the retainer fully covers the invoice, it shows "BALANCE DUE $0.00" with the remaining retainer noted. With no retainer balance, invoices display the standard "TOTAL DUE" (unchanged behavior).

State is stored in `retainer-{prefix}.json` files (gitignored) with a full ledger of deposits and debits per client.

## CLI Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to config file (default: `config.json`) |
| `--input <path>` | Directory containing CSV exports (default: `invoice-backups/`) |
| `--file <path>` | Specific CSV file to use (overrides auto-detect) |
| `--output <path>` | Output directory for PDFs (default: `output/`) |
| `--skip-ai true` | Skip AI estimation, use 1.5x fallback multiplier |

## Config Reference

Create `config.json` from the example. All fields:

### `from` (required)

Your company details displayed on the invoice.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Display name |
| `legalName` | string | yes | Legal entity name |
| `address` | string[] | yes | Address lines |
| `email` | string | yes | Contact email |
| `phone` | string | no | Phone number |
| `website` | string | no | Website URL |

### `defaultClient` (optional)

Pre-configured client info. If omitted, client details are pulled from the CSV.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Client company name |
| `contactName` | string | no | Client contact person |
| `address` | string[] | no | Client address lines |
| `email` | string | no | Client email |

### `remittance` (optional)

Bank details displayed at the bottom of the invoice for ACH and wire payments.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountName` | string | yes | Name on the account |
| `address` | string | no | Business address for remittance |
| `bank` | string | yes | Bank name |
| `accountNumber` | string | yes | Account number |
| `routingACH` | string | yes | ACH routing number |
| `routingWire` | string | yes | Wire routing number |

### Billing & Payment

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `hourlyRate` | number | - | Billing rate in dollars per hour |
| `billingIncrement` | number | `0.1` | Minimum billing unit in hours. Each time entry is rounded UP to this increment. |
| `currency` | string | - | Currency code (e.g., `"USD"`) |
| `paymentTermsDays` | number | - | Days until payment is due |
| `paymentInstructions` | string[] | - | Payment terms lines shown on invoice |
| `invoiceNumberPrefix` | string | `"INV"` | Prefix for invoice numbers (e.g., `"OSP"` produces `OSP-260320`) |
| `lateInterestRate` | string | - | Late payment interest text |

## Requirements

- A [supported Node.js LTS release](https://nodejs.org/en/about/previous-releases)
  (validated with Node 26.12.1 on 2026-11-11)
- [pnpm](https://pnpm.io/)
- [Claude Code](https://claude.ai/claude-code) CLI (for AI estimation)
