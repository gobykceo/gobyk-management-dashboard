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
