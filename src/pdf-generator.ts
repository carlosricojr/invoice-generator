import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import type { Invoice } from "./types.js";

const COLORS = {
  primary: "#1a1a2e",
  accent: "#0f3460",
  muted: "#6b7280",
  light: "#f3f4f6",
  white: "#ffffff",
  green: "#059669",
  border: "#d1d5db",
};

export async function generateInvoicePDF(
  invoice: Invoice,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- HEADER ---
    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text("INVOICE", 50, 50);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(invoice.invoiceNumber, 50, 82);

    // From company (top right)
    const rightX = 350;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text(invoice.from.name, rightX, 50, { width: pageWidth - rightX + 50, align: "right" });

    let fromY = 65;
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted);
    for (const line of invoice.from.address) {
      doc.text(line, rightX, fromY, { width: pageWidth - rightX + 50, align: "right" });
      fromY += 13;
    }
    if (invoice.from.email) {
      doc.text(invoice.from.email, rightX, fromY, { width: pageWidth - rightX + 50, align: "right" });
      fromY += 13;
    }
    if (invoice.from.phone) {
      doc.text(invoice.from.phone, rightX, fromY, { width: pageWidth - rightX + 50, align: "right" });
      fromY += 13;
    }
    if (invoice.from.website) {
      doc.text(invoice.from.website, rightX, fromY, { width: pageWidth - rightX + 50, align: "right" });
    }

    // Divider
    doc
      .moveTo(50, 115)
      .lineTo(50 + pageWidth, 115)
      .strokeColor(COLORS.border)
      .lineWidth(1)
      .stroke();

    // --- BILL TO + INVOICE DETAILS ---
    let y = 130;

    // Bill To
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(COLORS.muted)
      .text("BILL TO", 50, y);
    y += 15;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text(invoice.client.name, 50, y);
    y += 16;
    if (invoice.client.contactName) {
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text(invoice.client.contactName, 50, y);
      y += 13;
    }
    if (invoice.client.address) {
      for (const line of invoice.client.address) {
        doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text(line, 50, y);
        y += 13;
      }
    }

    // Invoice details (right side)
    const detailsX = 380;
    let detY = 130;
    const details = [
      ["Issue Date", invoice.issueDate],
      ["Due Date", invoice.dueDate],
      ["Period", `${invoice.periodStart} — ${invoice.periodEnd}`],
      ["Rate", `$${invoice.hourlyRate.toFixed(2)}/hr`],
    ];

    for (const [label, value] of details) {
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.muted).text(label.toUpperCase(), detailsX, detY);
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.primary).text(value, detailsX, detY + 12);
      detY += 30;
    }

    // --- VALUE SUMMARY BOX ---
    y = Math.max(y, detY) + 15;
    const timeSaved = invoice.totalEstimatedMarketHours - invoice.totalHours;
    const savingsPercent = ((timeSaved / invoice.totalEstimatedMarketHours) * 100).toFixed(0);
    const moneySaved = timeSaved * invoice.hourlyRate;

    doc.rect(50, y, pageWidth, 55).fill(COLORS.light);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLORS.accent)
      .text("VALUE DELIVERED", 65, y + 10);

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLORS.primary)
      .text(
        `Your work was completed in ${invoice.totalHours.toFixed(1)} hours vs. an estimated market average of ${invoice.totalEstimatedMarketHours.toFixed(1)} hours — saving you approximately ${timeSaved.toFixed(1)} hours (${savingsPercent}% faster) or $${moneySaved.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at the same rate.`,
        65,
        y + 26,
        { width: pageWidth - 30 },
      );

    y += 70;

    // --- LINE ITEMS TABLE ---
    // Header row
    const colDesc = 50;
    const colTags = 280;
    const colActual = 360;
    const colMarket = 410;
    const colAmount = 470;

    doc.rect(50, y, pageWidth, 22).fill(COLORS.primary);
    doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.white);
    doc.text("DESCRIPTION", colDesc + 8, y + 7);
    doc.text("CATEGORY", colTags + 5, y + 7);
    doc.text("ACTUAL", colActual, y + 7, { width: 45, align: "right" });
    doc.text("MARKET EST.", colMarket, y + 7, { width: 55, align: "right" });
    doc.text("AMOUNT", colAmount, y + 7, { width: pageWidth - colAmount + 50 - 8, align: "right" });

    y += 22;

    // Line items
    for (let i = 0; i < invoice.lineItems.length; i++) {
      const item = invoice.lineItems[i];

      // Check if we need a new page (leave room for at least one row)
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }

      // Alternating row background
      const rowMinHeight = 38;

      // Measure description height
      const descWidth = colTags - colDesc - 15;
      const descHeight = doc.fontSize(8).font("Helvetica").heightOfString(item.description, { width: descWidth });
      const justHeight = doc.fontSize(7).font("Helvetica").heightOfString(item.estimationJustification, { width: descWidth });
      const rowHeight = Math.max(rowMinHeight, descHeight + justHeight + 18);

      if (i % 2 === 0) {
        doc.rect(50, y, pageWidth, rowHeight).fill("#f9fafb");
      }

      // Description
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(COLORS.primary)
        .text(item.description, colDesc + 8, y + 6, { width: descWidth });

      const descEndY = y + 6 + descHeight;

      // Justification
      doc
        .fontSize(7)
        .font("Helvetica-Oblique")
        .fillColor(COLORS.green)
        .text(`Market note: ${item.estimationJustification}`, colDesc + 8, descEndY + 3, { width: descWidth });

      // Tags
      const tagText = item.tags.slice(0, 2).join(", ");
      doc.fontSize(7).font("Helvetica").fillColor(COLORS.muted).text(tagText, colTags + 5, y + 6, { width: 75 });

      // Hours
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLORS.primary)
        .text(`${item.totalHours.toFixed(1)}h`, colActual, y + 6, { width: 45, align: "right" });

      // Market estimate
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`${item.estimatedMarketHours.toFixed(1)}h`, colMarket, y + 6, { width: 55, align: "right" });

      // Amount
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLORS.primary)
        .text(
          `$${item.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          colAmount,
          y + 6,
          { width: pageWidth - colAmount + 50 - 8, align: "right" },
        );

      y += rowHeight;
    }

    // --- TOTALS + PAYMENT + REMITTANCE + FOOTER as one block ---
    const retainerHeight = invoice.retainerApplied != null ? 55 : 0;
    const fullFooterHeight = 65 + retainerHeight + 70 + (invoice.remittance ? 110 : 0) + 35;
    if (y + fullFooterHeight > doc.page.height - 50) {
      doc.addPage();
      y = 50;
    }

    y += 10;
    doc.moveTo(colActual, y).lineTo(50 + pageWidth, y).strokeColor(COLORS.border).lineWidth(1).stroke();
    y += 10;

    // Total hours row
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text("Total Hours", colActual - 80, y);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.primary).text(
      `${invoice.totalHours.toFixed(2)}h`,
      colActual,
      y,
      { width: 45, align: "right" },
    );
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text(
      `${invoice.totalEstimatedMarketHours.toFixed(1)}h`,
      colMarket,
      y,
      { width: 55, align: "right" },
    );

    y += 20;

    if (invoice.retainerApplied != null) {
      // Subtotal row
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text("Subtotal", colAmount - 80, y);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.primary).text(
        `$${invoice.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        colAmount,
        y,
        { width: pageWidth - colAmount + 50 - 8, align: "right" },
      );
      y += 16;

      // Retainer applied row
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.green).text("Less: Retainer Applied", colAmount - 80, y);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.green).text(
        `-$${invoice.retainerApplied.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        colAmount,
        y,
        { width: pageWidth - colAmount + 50 - 8, align: "right" },
      );
      y += 20;

      // Amount due box
      const amountDue = invoice.totalAmount - invoice.retainerApplied;
      const boxLabel = amountDue === 0 ? "BALANCE DUE" : "AMOUNT DUE";
      doc
        .rect(colAmount - 80, y - 5, pageWidth - colAmount + 130, 28)
        .fill(COLORS.primary);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.white)
        .text(boxLabel, colAmount - 70, y + 2);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.white)
        .text(
          `$${amountDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          colAmount,
          y + 2,
          { width: pageWidth - colAmount + 50 - 8, align: "right" },
        );
      y += 30;

      // Retainer remaining note (only if there's still balance)
      if (invoice.retainerRemaining != null && invoice.retainerRemaining > 0) {
        doc.fontSize(8).font("Helvetica-Oblique").fillColor(COLORS.muted).text(
          `Retainer Remaining: $${invoice.retainerRemaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          colAmount - 80,
          y,
          { width: pageWidth - colAmount + 130, align: "right" },
        );
        y += 15;
      }
    } else {
      // No retainer — standard TOTAL DUE box
      doc
        .rect(colAmount - 80, y - 5, pageWidth - colAmount + 130, 28)
        .fill(COLORS.primary);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.white)
        .text("TOTAL DUE", colAmount - 70, y + 2);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.white)
        .text(
          `$${invoice.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          colAmount,
          y + 2,
          { width: pageWidth - colAmount + 50 - 8, align: "right" },
        );
      y += 30;
    }

    if (invoice.paymentInstructions?.length) {
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.muted).text("PAYMENT TERMS", 50, y);
      y += 12;
      doc.fontSize(7.5).font("Helvetica").fillColor(COLORS.muted);
      for (const line of invoice.paymentInstructions) {
        doc.text(line, 50, y, { width: pageWidth });
        y += 11;
      }
    }

    if (invoice.lateInterestRate) {
      y += 3;
      doc
        .fontSize(6.5)
        .font("Helvetica-Oblique")
        .fillColor(COLORS.muted)
        .text(`Late payment interest: ${invoice.lateInterestRate}`, 50, y);
    }

    // --- REMITTANCE DETAILS ---
    if (invoice.remittance) {
      y += 12;

      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.muted).text("REMITTANCE DETAILS", 50, y);
      y += 12;

      doc.rect(50, y, pageWidth, 80).fill(COLORS.light);

      const remitLeftX = 60;
      const remitRightX = 50 + pageWidth / 2 + 10;
      let remitY = y + 8;

      // Left column: ACH
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.accent).text("ACH Payment", remitLeftX, remitY);
      remitY += 12;
      const achDetails = [
        ["Payee", invoice.remittance.accountName],
        ["Bank", invoice.remittance.bank],
        ["Account #", invoice.remittance.accountNumber],
        ["Routing #", invoice.remittance.routingACH],
      ];
      for (const [label, value] of achDetails) {
        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(COLORS.muted).text(`${label}:`, remitLeftX, remitY, { continued: true });
        doc.font("Helvetica").text(` ${value}`);
        remitY += 10;
      }

      // Right column: Wire
      let wireY = y + 8;
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.accent).text("Wire Transfer", remitRightX, wireY);
      wireY += 12;
      const wireDetails = [
        ["Payee", invoice.remittance.accountName],
        ["Bank", invoice.remittance.bank],
        ["Account #", invoice.remittance.accountNumber],
        ["Routing #", invoice.remittance.routingWire],
      ];
      for (const [label, value] of wireDetails) {
        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(COLORS.muted).text(`${label}:`, remitRightX, wireY, { continued: true });
        doc.font("Helvetica").text(` ${value}`);
        wireY += 10;
      }

      // Address line below both columns
      if (invoice.remittance.address) {
        const addrY = y + 66;
        doc.fontSize(6.5).font("Helvetica").fillColor(COLORS.muted).text(
          `Address: ${invoice.remittance.address}`,
          remitLeftX,
          addrY,
        );
      }

      y += 85;
    }

    // --- FOOTER (inline after content, not at fixed page bottom) ---
    y += 15;
    doc
      .moveTo(50, y)
      .lineTo(50 + pageWidth, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += 10;
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(
        `${invoice.from.name} — ${invoice.from.email}`,
        50,
        y,
        { width: pageWidth, align: "center" },
      );

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
