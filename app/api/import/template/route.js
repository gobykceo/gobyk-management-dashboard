import ExcelJS from "exceljs";
import { DAILY_REPORT_TEMPLATE_COLUMNS } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A blank fill-in template matching what /api/import/excel expects.
// Branch Name must exactly match a name in the Branches table
// (Pragathinagar, Kukatpalli, KPHB, Chandanagar, Kondapur, Borabanda,
// Gandimaisamma). Report Date should be YYYY-MM-DD. Leave any field blank
// if that branch's report doesn't have it — never enter 0 for a figure that
// wasn't actually reported.
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Daily Reports");
  sheet.columns = DAILY_REPORT_TEMPLATE_COLUMNS.map((c) => ({
    header: c,
    key: c,
    width: 20,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    "Branch Name": "Chandanagar",
    "Report Date": "2026-09-25",
    "Today Volume": 6,
    "Today Revenue": 1950,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gobyk-import-template.xlsx"`,
    },
  });
}
