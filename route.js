import PDFDocument from "pdfkit";
import { getSnapshot, getBranches } from "../../../../lib/airtable";
import { fmtNumber, fmtDate, fmtLag } from "../../../../lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// pdfkit's built-in fonts (Helvetica etc.) only support the WinAnsi
// character set, which does NOT include the ₹ rupee sign — pdfkit
// silently substitutes a garbage glyph for it instead of throwing.
// Rather than embed a custom Unicode font (another font file to trace
// into the serverless bundle), the PDF uses a plain "Rs " prefix, which
// every standard font renders correctly. The web dashboard and Excel
// export keep the real ₹ symbol since those render fine there.
function fmtCurrency(value) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const BRAND = "#FF6B1A";
const DARK = "#1A1D26";
const MUTED = "#6B7280";
const BORDER = "#D8DAE0";
const ROW_ALT = "#F6F7F9";

const PAGE_MARGIN = 36;

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawHeader(doc, snapshot) {
  doc
    .rect(0, 0, doc.page.width, 64)
    .fill(DARK);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("GoBYK Management Dashboard", PAGE_MARGIN, 18);
  doc
    .fillColor(BRAND)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Consolidated snapshot · generated ${new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
      PAGE_MARGIN,
      40
    );
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      `Reporting coverage today: ${snapshot["Reporting Coverage"] || "—"}`,
      doc.page.width - PAGE_MARGIN - 200,
      24,
      { width: 200, align: "right" }
    );
  doc.fillColor("#000000");
  doc.y = 80;
}

function summaryBlock(doc, snapshot) {
  const cards = [
    ["Latest Reported Revenue", fmtCurrency(snapshot["Latest Reported Revenue"])],
    ["Latest Reported Job Cards", fmtNumber(snapshot["Latest Reported Job Cards"])],
    ["Latest Reported Rev/JC", fmtCurrency(snapshot["Latest Reported Revenue per JC"])],
    ["MTD Revenue", fmtCurrency(snapshot["MTD Revenue"])],
    ["MTD Job Cards", fmtNumber(snapshot["MTD Volume"])],
    ["MTD Revenue/JC", fmtCurrency(snapshot["MTD Revenue per JC"])],
    [
      "Expected Month-End Closure",
      fmtCurrency(snapshot["Expected Month-End Sales Closure"]),
    ],
  ];
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const cardWidth = usableWidth / 4;
  const cardHeight = 44;
  let startY = doc.y + 4;

  cards.forEach((card, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = PAGE_MARGIN + col * cardWidth;
    const y = startY + row * (cardHeight + 8);
    doc
      .roundedRect(x, y, cardWidth - 8, cardHeight, 4)
      .fillAndStroke("#FBFBFC", BORDER);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(7.5)
      .text(card[0], x + 8, y + 7, { width: cardWidth - 24 });
    doc
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(card[1], x + 8, y + 19, { width: cardWidth - 24 });
  });

  const rows = Math.ceil(cards.length / 4);
  doc.y = startY + rows * (cardHeight + 8) + 12;
}

const COLUMNS = [
  { key: "Branch Name", label: "Branch", width: 95, fmt: (v) => v || "—", align: "left" },
  { key: "Latest Report Date", label: "Latest Report", width: 75, fmt: fmtDate, align: "left" },
  {
    // Widened from 42 → 52: at 8pt the value "Same day" measures ~36pt,
    // which didn't fit inside the old 34pt usable width (42 - 8 padding)
    // and wrapped onto a second line, overlapping the fixed-height row
    // below it — this was the real cause of the "misaligned" look.
    key: "Reporting Lag (Latest Report, Corrected)",
    label: "Lag",
    width: 52,
    fmt: fmtLag,
    align: "left",
  },
  { key: "Revenue (Latest Reported Day)", label: "Revenue", width: 72, fmt: fmtCurrency, align: "right" },
  { key: "Volume (Latest Reported Day)", label: "JC", width: 44, fmt: fmtNumber, align: "right" },
  {
    key: "Counter Sale Revenue (Latest Reported Day)",
    label: "Counter Sales",
    width: 72,
    fmt: fmtCurrency,
    align: "right",
  },
  { key: "MTD Revenue (Latest Reported)", label: "MTD Revenue", width: 82, fmt: fmtCurrency, align: "right" },
  { key: "MTD Volume (Latest Reported)", label: "MTD JC", width: 54, fmt: fmtNumber, align: "right" },
  {
    key: "MTD Counter Sale Revenue (Latest Reported)",
    label: "MTD Counter",
    width: 72,
    fmt: fmtCurrency,
    align: "right",
  },
  { key: "MTD Revenue per JC", label: "MTD Rev/JC", width: 66, fmt: fmtCurrency, align: "right" },
  {
    key: "Branch Expected Month-End Closure",
    label: "Exp. Month-End",
    width: 82,
    fmt: fmtCurrency,
    align: "right",
  },
];
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 22;

function tableHeaderRow(doc, tableLeft, y) {
  doc.rect(tableLeft, y, COLUMNS.reduce((s, c) => s + c.width, 0), HEADER_HEIGHT).fill(DARK);
  let x = tableLeft;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF");
  COLUMNS.forEach((col) => {
    doc.text(col.label, x + 4, y + 7, { width: col.width - 8, align: col.align });
    x += col.width;
  });
  doc.fillColor("#000000");
  return y + HEADER_HEIGHT;
}

function branchTable(doc, branches) {
  const tableLeft = PAGE_MARGIN;
  const tableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);
  const bottomLimit = doc.page.height - PAGE_MARGIN;

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
  doc.text("Branch-wise Performance", tableLeft, doc.y);
  doc.moveDown(0.4);

  let y = tableHeaderRow(doc, tableLeft, doc.y);

  branches.forEach((branch, idx) => {
    if (y + ROW_HEIGHT > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = tableHeaderRow(doc, tableLeft, y);
    }
    if (idx % 2 === 1) {
      doc.rect(tableLeft, y, tableWidth, ROW_HEIGHT).fill(ROW_ALT);
    }
    let x = tableLeft;
    doc.font("Helvetica").fontSize(8).fillColor("#000000");
    COLUMNS.forEach((col) => {
      const raw = branch[col.key];
      const display = col.fmt(raw);
      const isMissing = display === "—";
      doc.fillColor(isMissing ? "#B3B6BE" : "#000000");
      doc.text(display, x + 4, y + 6, { width: col.width - 8, align: col.align });
      x += col.width;
    });
    doc
      .moveTo(tableLeft, y + ROW_HEIGHT)
      .lineTo(tableLeft + tableWidth, y + ROW_HEIGHT)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    y += ROW_HEIGHT;
  });

  doc.fillColor("#000000");
  return y;
}

function footer(doc, snapshot) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The footer sits inside the page's own bottom margin (36pt). pdfkit's
    // text() auto-paginates any time a draw would cross the margin
    // boundary, even with explicit x/y coordinates — so without this,
    // every footer line silently pushed itself onto a brand-new blank
    // page instead of drawing on the page it belongs to (this was also
    // why the previous PDF looked incomplete: the disclaimer/page-number
    // calls were each spawning an extra blank trailing page). Zeroing the
    // bottom margin just for this page, after all its real content is
    // already drawn, lets the footer draw in place safely.
    doc.page.margins.bottom = 0;
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        "Missing values are shown as — (never zero) — the branch simply hasn't reported that figure yet.",
        PAGE_MARGIN,
        doc.page.height - 26,
        { width: doc.page.width - PAGE_MARGIN * 2 - 60, lineBreak: false }
      );
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(`Page ${i + 1} of ${range.count}`, doc.page.width - PAGE_MARGIN - 60, doc.page.height - 26, {
        width: 60,
        align: "right",
        lineBreak: false,
      });
  }
}

export async function GET() {
  try {
    const [snapshot, branches] = await Promise.all([getSnapshot(), getBranches()]);

    const doc = new PDFDocument({
      margin: PAGE_MARGIN,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });
    const bufferPromise = streamToBuffer(doc);

    drawHeader(doc, snapshot);
    summaryBlock(doc, snapshot);
    branchTable(doc, branches);
    footer(doc, snapshot);

    doc.end();
    const buffer = await bufferPromise;

    const filename = `gobyk-dashboard-snapshot-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response(`Export failed: ${e.message}\n${e.stack}`, { status: 500 });
  }
}
