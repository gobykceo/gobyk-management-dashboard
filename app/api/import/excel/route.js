import ExcelJS from "exceljs";
import {
  getBranchLookup,
  getExistingReportKeys,
  createDailyReports,
  DAILY_REPORT_TEMPLATE_COLUMNS,
} from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual-entry fallback: writes a filled-in Excel template straight into
// Airtable Daily Reports, using plain code — no AI/Claude involved, so this
// keeps reporting going even if the Claude Pro-driven bucket pipeline is
// paused. Requires a shared import key so the endpoint isn't wide open on
// this public site.

function branchCode(name, lookup) {
  const match = lookup.find(
    (b) => b.name?.trim().toLowerCase() === String(name).trim().toLowerCase()
  );
  return match || null;
}

function toISODate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function ddmmyyyy(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}${m}${y}`;
}

export async function POST(request) {
  const requiredKey = process.env.IMPORT_SECRET;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const providedKey = form.get("importKey");

    if (requiredKey && providedKey !== requiredKey) {
      return Response.json(
        { error: "Import key is missing or incorrect." },
        { status: 401 }
      );
    }
    if (!file) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return Response.json({ error: "Workbook has no sheet." }, { status: 400 });
    }

    const headerRow = sheet.getRow(1).values; // 1-indexed, index 0 empty
    const colIndex = {};
    DAILY_REPORT_TEMPLATE_COLUMNS.forEach((name) => {
      const idx = headerRow.findIndex(
        (h) => String(h || "").trim() === name
      );
      if (idx > -1) colIndex[name] = idx;
    });
    if (colIndex["Branch Name"] === undefined || colIndex["Report Date"] === undefined) {
      return Response.json(
        {
          error:
            "Template columns not recognized. Use the provided Import Template file without renaming headers.",
        },
        { status: 400 }
      );
    }

    const [branchLookup, existingKeys] = await Promise.all([
      getBranchLookup(),
      getExistingReportKeys(),
    ]);

    const toCreate = [];
    const skipped = [];

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum).values;
      const branchNameRaw = row[colIndex["Branch Name"]];
      if (!branchNameRaw) continue; // blank row

      const branch = branchCode(branchNameRaw, branchLookup);
      if (!branch) {
        skipped.push({ row: rowNum, reason: `Unknown branch "${branchNameRaw}"` });
        continue;
      }
      const isoDate = toISODate(row[colIndex["Report Date"]]);
      if (!isoDate) {
        skipped.push({ row: rowNum, reason: "Missing/unreadable Report Date" });
        continue;
      }
      const reportKey = `${branch.code}-${ddmmyyyy(isoDate)}`;
      if (existingKeys.has(reportKey)) {
        skipped.push({ row: rowNum, reason: `Duplicate of existing report ${reportKey}` });
        continue;
      }

      const fields = { Branch: [branch.id], "Report Date": isoDate };
      DAILY_REPORT_TEMPLATE_COLUMNS.forEach((name) => {
        if (name === "Branch Name" || name === "Report Date") return;
        const v = row[colIndex[name]];
        if (v !== undefined && v !== null && v !== "") fields[name] = v;
      });
      fields["Extraction Status"] = "Manually Entered";
      fields["Manually Verified"] = true;
      toCreate.push(fields);
      existingKeys.add(reportKey); // guard against duplicate rows within the same file
    }

    let created = [];
    if (toCreate.length > 0) {
      created = await createDailyReports(toCreate);
    }

    return Response.json({
      createdCount: created.length,
      skipped,
    });
  } catch (e) {
    return Response.json({ error: `Import failed: ${e.message}` }, { status: 500 });
  }
}
