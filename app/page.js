import { getSnapshot, getBranches } from "../lib/airtable";
import { fmtCurrency, fmtNumber, fmtDate, fmtLag } from "../lib/format";
import ExportImportBar from "./components/ExportImportBar";

export const revalidate = 60;

const BRAND = "#FF6B1A";
const CARD_BG = "#161820";
const PAGE_BG = "#000000";
const GREEN = "#22C55E";
const BORDER = "#2A2D38";
const MUTED = "#8A8D98";

function StatBox({ label, value, sub }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "14px 16px",
        minWidth: 150,
        flex: "1 1 150px",
        background: "#1C1F29",
      }}
    >
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 12, color: GREEN, marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export default async function Page() {
  let snapshot = {};
  let branches = [];
  let error = null;

  try {
    [snapshot, branches] = await Promise.all([getSnapshot(), getBranches()]);
  } catch (e) {
    error = e.message;
  }

  const columns = [
    { key: "Branch Name", label: "Branch", fmt: (v) => v || "—" },
    {
      key: "Latest Report Date",
      label: "Latest Report",
      fmt: fmtDate,
    },
    {
      key: "Reporting Lag (Latest Report, Corrected)",
      label: "Reporting Lag",
      fmt: fmtLag,
    },
    {
      key: "Revenue (Latest Reported Day)",
      label: "Revenue",
      fmt: fmtCurrency,
    },
    {
      key: "MTD Revenue (Latest Reported)",
      label: "MTD Revenue",
      fmt: fmtCurrency,
    },
    { key: "MTD Volume (Latest Reported)", label: "MTD JC", fmt: fmtNumber },
    { key: "MTD Revenue per JC", label: "MTD Rev/JC", fmt: fmtCurrency },
    {
      key: "Branch Expected Month-End Closure",
      label: "Exp. Month-End Closure",
      fmt: fmtCurrency,
    },
  ];

  return (
    <main
      style={{
        background: PAGE_BG,
        minHeight: "100vh",
        padding: "20px 16px 48px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            GoBYK <span style={{ color: BRAND }}>Management Dashboard</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            Live from Airtable · refreshes at most once a minute
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: BRAND,
            border: `1px solid ${BRAND}`,
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          {snapshot["Reporting Coverage"]
            ? `${snapshot["Reporting Coverage"]} reported today`
            : "—"}
        </div>
      </div>

      <ExportImportBar />

      {error ? (
        <div
          style={{
            background: "#3A1A1A",
            border: "1px solid #7A2E2E",
            color: "#FFB4B4",
            borderRadius: 10,
            padding: 16,
            fontSize: 14,
          }}
        >
          Couldn&apos;t load data from Airtable: {error}
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div
            style={{
              background: CARD_BG,
              borderRadius: 14,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: MUTED,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Latest Reported (each branch&apos;s most recent valid report)
            </div>
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}
            >
              <StatBox
                label="Revenue"
                value={fmtCurrency(snapshot["Latest Reported Revenue"])}
              />
              <StatBox
                label="Job Cards"
                value={fmtNumber(snapshot["Latest Reported Job Cards"])}
              />
              <StatBox
                label="Revenue / JC"
                value={fmtCurrency(snapshot["Latest Reported Revenue per JC"])}
              />
              <StatBox
                label="Counter Sales"
                value={fmtCurrency(snapshot["Latest Reported Counter Sales"])}
              />
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: MUTED,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              MTD (current month, latest valid snapshot per branch)
            </div>
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}
            >
              <StatBox
                label="MTD Revenue"
                value={fmtCurrency(snapshot["MTD Revenue"])}
              />
              <StatBox
                label="MTD Job Cards"
                value={fmtNumber(snapshot["MTD Volume"])}
              />
              <StatBox
                label="MTD Revenue / JC"
                value={fmtCurrency(snapshot["MTD Revenue per JC"])}
              />
              <StatBox
                label="MTD Counter Sales"
                value={fmtCurrency(snapshot["MTD Counter Sale Revenue"])}
              />
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: MUTED,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Projection
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatBox
                label="Expected Month-End Closure"
                value={fmtCurrency(snapshot["Expected Month-End Sales Closure"])}
                sub="Sum of each branch's own run-rate"
              />
              <StatBox
                label="Reports Received Today"
                value={snapshot["Reporting Coverage"] || "—"}
              />
            </div>
          </div>

          {/* Branch-wise table */}
          <div
            style={{
              background: CARD_BG,
              borderRadius: 14,
              padding: 16,
              overflowX: "auto",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: MUTED,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Branch-wise
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `1.2fr repeat(${columns.length - 1}, 1fr)`,
                minWidth: 780,
              }}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  style={{
                    fontSize: 12,
                    color: MUTED,
                    fontWeight: 700,
                    padding: "6px 8px",
                    borderBottom: `1px solid ${BORDER}`,
                    textAlign: col.key === "Branch Name" ? "left" : "right",
                  }}
                >
                  {col.label}
                </div>
              ))}

              {branches.map((branch, rowIdx) =>
                columns.map((col) => {
                  const raw = branch[col.key];
                  const display = col.fmt(raw);
                  const isMissing = display === "—";
                  return (
                    <div
                      key={col.key}
                      style={{
                        fontSize: 14,
                        padding: "10px 8px",
                        borderBottom:
                          rowIdx === branches.length - 1
                            ? "none"
                            : `1px solid ${BORDER}`,
                        textAlign: col.key === "Branch Name" ? "left" : "right",
                        fontVariantNumeric: "tabular-nums",
                        color: isMissing ? MUTED : "#FFFFFF",
                        fontStyle: isMissing ? "italic" : "normal",
                      }}
                    >
                      {display}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: MUTED, marginTop: 16 }}>
            Blank/italic cells mean the branch hasn&apos;t reported that figure
            yet — never treated as zero.
          </div>
        </>
      )}
    </main>
  );
}
