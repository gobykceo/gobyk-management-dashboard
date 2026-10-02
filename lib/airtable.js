const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

async function airtableFetch(table, query = "") {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN environment variable."
    );
  }
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(
    table
  )}${query}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    // Re-fetch fresh data at most once a minute, so the dashboard
    // stays current without hammering the Airtable API on every view.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable request failed (${res.status}): ${body}`);
  }
  return res.json();
}

// The single consolidated "GoBYK Consolidated" record.
export async function getSnapshot() {
  const data = await airtableFetch("Management Snapshot");
  return data.records[0]?.fields || {};
}

// One row per branch, alphabetical by name.
export async function getBranches() {
  const data = await airtableFetch(
    "Branches",
    "?sort%5B0%5D%5Bfield%5D=Branch%20Name&sort%5B0%5D%5Bdirection%5D=asc"
  );
  return data.records.map((r) => r.fields);
}

// Minimal branch list (id + name + code) for Import lookups. Not cached long,
// since it's only used at import time.
export async function getBranchLookup() {
  const data = await airtableFetch(
    "Branches",
    "?fields%5B%5D=Branch%20Name&fields%5B%5D=Branch%20Code&sort%5B0%5D%5Bfield%5D=Branch%20Name&sort%5B0%5D%5Bdirection%5D=asc"
  );
  return data.records.map((r) => ({
    id: r.id,
    name: r.fields["Branch Name"],
    code: r.fields["Branch Code"],
  }));
}

function daysInMonth(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// The real calendar month right now, as "YYYY-MM".
export function currentYyyyMM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Every distinct "YYYY-MM" that has at least one Daily Report, newest
// first — used to populate the dashboard's month selector.
export async function getAvailableMonths() {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN environment variable."
    );
  }
  const months = new Set([currentYyyyMM()]);
  let offset = "";
  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/Daily%20Reports?fields%5B%5D=Month&pageSize=100${
      offset ? `&offset=${offset}` : ""
    }`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable request failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    data.records.forEach((r) => {
      if (r.fields["Month"]) months.add(r.fields["Month"]);
    });
    offset = data.offset || "";
  } while (offset);
  return Array.from(months).sort().reverse();
}

// Branch-wise figures STRICTLY scoped to one calendar month ("YYYY-MM").
// Unlike getBranches() (which always reflects each branch's single
// latest-ever report, regardless of month), this never lets a later — or
// earlier — month's data show through: a branch with no report in the
// selected month comes back with every figure blank ("—"), even if it has
// since reported in a different month. This is what keeps "September" and
// "October" from bleeding into each other on the dashboard.
export async function getBranchesForMonth(yyyyMM) {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN environment variable."
    );
  }
  const branchLookup = await getBranchLookup();

  const filter = encodeURIComponent(`{Month}="${yyyyMM}"`);
  let records = [];
  let offset = "";
  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/Daily%20Reports?filterByFormula=${filter}&pageSize=100&sort%5B0%5D%5Bfield%5D=Report%20Date&sort%5B0%5D%5Bdirection%5D=asc${
      offset ? `&offset=${offset}` : ""
    }`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable request failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    records = records.concat(data.records);
    offset = data.offset || "";
  } while (offset);

  // Records come back sorted ascending by Report Date, so the last record
  // seen per branch is that branch's latest report within this month.
  const latestByBranch = {};
  for (const r of records) {
    const branchId = r.fields["Branch"]?.[0];
    if (!branchId) continue;
    latestByBranch[branchId] = r.fields;
  }

  const dim = daysInMonth(yyyyMM);
  const isCurrentMonth = yyyyMM === currentYyyyMM();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return branchLookup.map(({ id, name, code }) => {
    const f = latestByBranch[id];
    if (!f) {
      // No report at all for this branch in this month: every figure
      // must be blank, never a fallback to another month's data.
      return {
        "Branch Name": name,
        "Branch Code": code,
        "Latest Report Date": null,
        "Reporting Lag (Latest Report, Corrected)": null,
        "Revenue (Latest Reported Day)": null,
        "Volume (Latest Reported Day)": null,
        "Counter Sale Revenue (Latest Reported Day)": null,
        "MTD Revenue (Latest Reported)": null,
        "MTD Volume (Latest Reported)": null,
        "MTD Counter Sale Revenue (Latest Reported)": null,
        "MTD Revenue per JC": null,
        "Branch Expected Month-End Closure": null,
      };
    }

    const reportDate = f["Report Date"];
    const dayOfMonth = new Date(reportDate).getDate();
    const mtdRevenue = f["MTD Revenue"] ?? null;
    const mtdVolume = f["MTD Volume"] ?? null;
    const mtdRevPerJc =
      mtdRevenue != null && mtdVolume ? mtdRevenue / mtdVolume : null;
    // Projects the month's close from this branch's own run-rate so far —
    // for a month that has already ended, this lands at (or very near)
    // the branch's actual final figure, since dayOfMonth is then the
    // month's own last reported day.
    const expectedMonthEnd =
      mtdRevenue != null && dayOfMonth ? (mtdRevenue / dayOfMonth) * dim : null;

    // Reporting lag (days behind "today") is only a meaningful figure for
    // the current calendar month — a past month has no "today" to lag
    // behind, so it's left blank there rather than showing a stale number.
    let lag = null;
    if (isCurrentMonth) {
      const d = new Date(reportDate);
      const reportMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      lag = Math.round((todayMidnight - reportMidnight) / 86400000);
    }

    return {
      "Branch Name": name,
      "Branch Code": code,
      "Latest Report Date": reportDate,
      "Reporting Lag (Latest Report, Corrected)": lag,
      "Revenue (Latest Reported Day)": f["Today Revenue"] ?? null,
      "Volume (Latest Reported Day)": f["Today Volume"] ?? null,
      "Counter Sale Revenue (Latest Reported Day)": f["Counter Sale Revenue"] ?? null,
      "MTD Revenue (Latest Reported)": mtdRevenue,
      "MTD Volume (Latest Reported)": mtdVolume,
      "MTD Counter Sale Revenue (Latest Reported)": f["MTD Counter Sale Revenue"] ?? null,
      "MTD Revenue per JC": mtdRevPerJc,
      "Branch Expected Month-End Closure": expectedMonthEnd,
    };
  });
}

// Aggregates a getBranchesForMonth() result into the company-wide summary
// cards for that month. Sums only over branches that actually have data
// this month, so a branch that hasn't reported yet never drags totals down
// or silently gets counted as zero.
export function summarizeMonth(monthBranches) {
  const sum = (key) =>
    monthBranches.reduce(
      (acc, b) => (b[key] != null ? acc + Number(b[key]) : acc),
      0
    );
  const reportedCount = monthBranches.filter(
    (b) => b["Latest Report Date"] != null
  ).length;
  const mtdRevenue = sum("MTD Revenue (Latest Reported)");
  const mtdVolume = sum("MTD Volume (Latest Reported)");

  return {
    reportedCount,
    totalBranches: monthBranches.length,
    todayRevenue: sum("Revenue (Latest Reported Day)"),
    todayVolume: sum("Volume (Latest Reported Day)"),
    todayCounterSales: sum("Counter Sale Revenue (Latest Reported Day)"),
    mtdRevenue,
    mtdVolume,
    mtdCounterSales: sum("MTD Counter Sale Revenue (Latest Reported)"),
    mtdRevenuePerJc: mtdVolume ? mtdRevenue / mtdVolume : null,
    expectedMonthEndClosure: sum("Branch Expected Month-End Closure"),
  };
}

// Every Daily Reports record, all fields, paginated. Used for the Excel/PDF
// backup export — this is a point-in-time snapshot for the operator to keep,
// not used by the live dashboard views.
export async function getAllDailyReports() {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN environment variable."
    );
  }
  const records = [];
  let offset = "";
  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/Daily%20Reports?pageSize=100&sort%5B0%5D%5Bfield%5D=Report%20Date&sort%5B0%5D%5Bdirection%5D=asc${
      offset ? `&offset=${offset}` : ""
    }`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable request failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset || "";
  } while (offset);
  return records.map((r) => ({ id: r.id, ...r.fields }));
}

// Raw fields a Daily Report can carry, in the order the Import template
// expects them. "Branch Name" is a plain text column in the template (not
// the linked-record field) — Import resolves it to a Branch record ID.
export const DAILY_REPORT_TEMPLATE_COLUMNS = [
  "Branch Name",
  "Report Date",
  "Today Volume",
  "Today Revenue",
  "Today AMC",
  "Today Google Reviews",
  "Today Parts",
  "Today Labour",
  "Cash",
  "Card",
  "Scan",
  "NEFT",
  "Advance",
  "Counter Sale Volume",
  "Counter Sale Revenue",
  "MTD Volume",
  "MTD Revenue",
  "MTD AMC",
  "MTD Google Reviews",
  "MTD Counter Sale Volume",
  "MTD Counter Sale Revenue",
  "MTD Parts",
  "MTD Labour",
  "Today 2W Revenue",
  "Today 4W Revenue",
  "MTD 2W Revenue",
  "MTD 4W Revenue",
];

// Existing Report Keys, for duplicate-prevention on import.
export async function getExistingReportKeys() {
  const data = await airtableFetch(
    "Daily%20Reports",
    "?fields%5B%5D=Report%20Key"
  );
  return new Set(data.records.map((r) => r.fields["Report Key"]).filter(Boolean));
}

// Writes a batch of new Daily Reports records (max 10 per Airtable call).
// fieldsList: array of { Branch: [branchId], "Report Date": "...", ... }
export async function createDailyReports(fieldsList) {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN environment variable."
    );
  }
  const created = [];
  for (let i = 0; i < fieldsList.length; i += 10) {
    const chunk = fieldsList.slice(i, i + 10);
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Daily%20Reports`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typecast: true,
          records: chunk.map((fields) => ({ fields })),
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable write failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    created.push(...data.records);
  }
  return created;
}
