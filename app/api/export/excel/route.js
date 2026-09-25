import ExcelJS from "exceljs";
import { getAllDailyReports, getBranches, DAILY_REPORT_TEMPLATE_COLUMNS } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full backup export: every Daily Reports record (raw + key computed fields)
// plus a current Branches summary sheet. This is the operator's offline
// backup of everything in Airtable, independent of Claude/AI.
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GoBYK Management Dashboard";
  workbook.created = new Date();

  try {
    const [reports, branches] = await Promise.all([
      getAllDailyReports(),
      getBranches(),
    ]);

    // --- Daily Reports sheet ---
    const reportCols = [
      "Report Key",
      "Branch Name",
      ...DAILY_REPORT_TEMPLATE_COLUMNS.filter((c) => c !== "Branch Name"),
      "Reported Average Volume",
      "Reported Average Revenue",
      "Reported Revenue per JC",
      "Validation Status",
      "Extraction Status",
      "Source File Name",
    ];
    const sheet1 = workbook.addWorksheet("Daily Reports");
    sheet1.columns = reportCols.map((c) => ({ header: c, key: c, width: 20 }));
    sheet1.getRow(1).font = { bold: true };
    for (const r of reports) {
      const branchName = Array.isArray(r["Branch"])
        ? r["Branch"][0]?.name || r["Branch"][0]
        : r["Branch Name"] || "";
      sheet1.addRow({ ...r, "Branch Name": branchName });
    }

    // --- Branches summary sheet ---
    const branchCols = [
      "Branch Name",
      "Latest Report Date",
      "Reporting Lag (Latest Report, Corrected)",
      "Revenue (Latest Reported Day)",
      "MTD Revenue (Latest Reported)",
      "MTD Volume (Latest Reported)",
      "MTD Revenue per JC",
      "Branch Expected Month-End Closure",
    ];
    const sheet2 = workbook.addWorksheet("Branches Summary");
    sheet2.columns = branchCols.map((c) => ({ header: c, key: c, width: 24 }));
    sheet2.getRow(1).font = { bold: true };
    for (const b of branches) sheet2.addRow(b);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `gobyk-daily-reports-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response(`Export failed: ${e.message}`, { status: 500 });
  }
}
