export interface CompanyConfig {
  name: string;
  legalName: string;
  address: string[];
  email: string;
  phone?: string;
  website?: string;
}

export interface RemittanceConfig {
  accountName: string;
  address?: string;
  bank: string;
  accountNumber: string;
  routingACH: string;
  routingWire: string;
}

export interface InvoiceConfig {
  from: CompanyConfig;
  defaultClient?: ClientConfig;
  hourlyRate: number;
  billingIncrement: number;
  currency: string;
  paymentTermsDays: number;
  paymentInstructions?: string[];
  remittance?: RemittanceConfig;
  invoiceNumberPrefix?: string;
  lateInterestRate?: string;
}

export interface ClientConfig {
  name: string;
  contactName?: string;
  address?: string[];
  email?: string;
}

export interface ClockifyEntry {
  project: string;
  client: string;
  description: string;
  task: string;
  user: string;
  email: string;
  tags: string;
  billable: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  durationHours: string;
  durationDecimal: number;
  billableRate: number;
  billableAmount: number;
}

export interface GroupedLineItem {
  description: string;
  tags: string[];
  totalHours: number;
  totalAmount: number;
  hourlyRate: number;
  entries: ClockifyEntry[];
}

export interface EstimatedLineItem extends GroupedLineItem {
  estimatedMarketHours: number;
  estimationJustification: string;
}

export interface Invoice {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  from: CompanyConfig;
  client: ClientConfig;
  lineItems: EstimatedLineItem[];
  totalHours: number;
  totalAmount: number;
  totalEstimatedMarketHours: number;
  hourlyRate: number;
  currency: string;
  paymentTermsDays: number;
  paymentInstructions?: string[];
  remittance?: RemittanceConfig;
  lateInterestRate?: string;
  retainerApplied?: number;
  retainerRemaining?: number;
}

export interface RetainerLedgerEntry {
  date: string;
  type: "deposit" | "debit";
  amount: number;
  invoiceNumber?: string;
  note: string;
}

export interface RetainerState {
  balance: number;
  ledger: RetainerLedgerEntry[];
}
