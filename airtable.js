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
    "?fields%5B%5D=Branch%20Name&fields%5B%5D=Branch%20Code"
  );
  return data.records.map((r) => ({
    id: r.id,
    name: r.fields["Branch Name"],
    code: r.fields["Branch Code"],
  }));
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
