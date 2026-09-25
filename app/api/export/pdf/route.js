import PDFDocument from "pdfkit";
import { getSnapshot, getBranches } from "../../../../lib/airtable";
import { fmtCurrency, fmtNumber, fmtDate, fmtLag } from "../../../../lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function GET() {
  try {
    const [snapshot, branches] = await Promise.all([
      getSnapshot(),
      getBranches(),
    ]);

    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });

    doc
      .fontSize(18)
      .fillColor("#FF6B1A")
      .text("GoBYK Management Dashboard", { continued: false });
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(`Snapshot generated ${new Date().toLocaleString("en-IN")}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#000000").text("Consolidated Summary");
    doc.moveDown(0.3);
    const summaryLines = [
      ["Latest Reported Revenue", fmtCurrency(snapshot["Latest Reported Revenue"])],
      ["Latest Reported Job Cards", fmtNumber(snapshot["Latest Reported Job Cards"])],
      ["MTD Revenue", fmtCurrency(snapshot["MTD Revenue"])],
      ["MTD Job Cards", fmtNumber(snapshot["MTD Volume"])],
      ["MTD Revenue per JC", fmtCurrency(snapshot["MTD Revenue per JC"])],
      [
        "Expected Month-End Closure",
        fmtCurrency(snapshot["Expected Month-End Sales Closure"]),
      ],
      ["Reporting Coverage (Today)", snapshot["Reporting Coverage"] || "—"],
    ];
    doc.fontSize(10);
    for (const [label, value] of summaryLines) {
      doc.text(`${label}: `, { continued: true }).fillColor("#333333").text(value);
      doc.fillColor("#000000");
    }
    doc.moveDown(1);

    doc.fontSize(12).text("Branch-wise");
    doc.moveDown(0.3);

    const columns = [
      { key: "Branch Name", label: "Branch", width: 110, fmt: (v) => v || "—" },
      { key: "Latest Report Date", label: "Latest Report", width: 90, fmt: fmtDate },
      {
        key: "Reporting Lag (Latest Report, Corrected)",
        label: "Lag",
        width: 60,
        fmt: fmtLag,
      },
      { key: "Revenue (Latest Reported Day)", label: "Revenue", width: 90, fmt: fmtCurrency },
      { key: "MTD Revenue (Latest Reported)", label: "MTD Revenue", width: 100, fmt: fmtCurrency },
      { key: "MTD Volume (Latest Reported)", label: "MTD JC", width: 70, fmt: fmtNumber },
      { key: "MTD Revenue per JC", label: "MTD Rev/JC", width: 90, fmt: fmtCurrency },
      {
        key: "Branch Expected Month-End Closure",
        label: "Exp. Month-End",
        width: 100,
        fmt: fmtCurrency,
      },
    ];

    let y = doc.y;
    let x = doc.x;
    doc.fontSize(9).fillColor("#666666");
    columns.forEach((col) => {
      doc.text(col.label, x, y, { width: col.width });
      x += col.width;
    });
    y += 16;
    doc.moveTo(doc.x, y).lineTo(x, y).strokeColor("#cccccc").stroke();
    y += 6;

    doc.fillColor("#000000");
    for (const branch of branches) {
      x = doc.x;
      columns.forEach((col) => {
        doc.text(col.fmt(branch[col.key]), x, y, { width: col.width });
        x += col.width;
      });
      y += 16;
    }

    const buffer = await streamToBuffer(doc);
    const filename = `gobyk-dashboard-snapshot-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response(`Export failed: ${e.message}`, { status: 500 });
  }
}
