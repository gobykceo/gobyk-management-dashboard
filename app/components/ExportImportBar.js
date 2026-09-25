"use client";

import { useState, useRef } from "react";

const BORDER = "#2A2D38";
const CARD_BG = "#1C1F29";
const MUTED = "#8A8D98";
const BRAND = "#FF6B1A";
const GREEN = "#22C55E";
const RED = "#FF4D5E";

function btnStyle() {
  return {
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}

export default function ExportImportBar() {
  const [showImport, setShowImport] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [status, setStatus] = useState(null); // { type: 'ok'|'error', message }
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  async function handleImport(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ type: "error", message: "Choose a file first." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("importKey", importKey);
      const res = await fetch("/api/import/excel", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Import failed." });
      } else {
        const skippedNote =
          data.skipped?.length > 0
            ? ` (${data.skipped.length} row(s) skipped — see below)`
            : "";
        setStatus({
          type: "ok",
          message: `Imported ${data.createdCount} report(s)${skippedNote}.`,
          skipped: data.skipped,
        });
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <a href="/api/export/excel" style={{ textDecoration: "none" }}>
          <button style={btnStyle()}>⬇ Download Excel</button>
        </a>
        <a href="/api/export/pdf" style={{ textDecoration: "none" }}>
          <button style={btnStyle()}>⬇ Download PDF</button>
        </a>
        <button style={btnStyle()} onClick={() => setShowImport((s) => !s)}>
          ⬆ Import Excel
        </button>
      </div>

      {showImport && (
        <form
          onSubmit={handleImport}
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 480,
          }}
        >
          <div style={{ fontSize: 12, color: MUTED }}>
            Only use this if the automatic bucket pipeline isn't running (e.g.
            Claude Pro paused).{" "}
            <a href="/api/import/template" style={{ color: BRAND }}>
              Download the blank template
            </a>{" "}
            first, fill it in, then upload it here.
          </div>
          <input
            type="password"
            placeholder="Import key"
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            style={{
              background: "#12141C",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: "8px 10px",
              color: "#FFFFFF",
              fontSize: 13,
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ fontSize: 13, color: MUTED }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ ...btnStyle(), background: BRAND, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Importing…" : "Upload & Import"}
          </button>
          {status && (
            <div
              style={{
                fontSize: 12,
                color: status.type === "ok" ? GREEN : RED,
              }}
            >
              {status.message}
              {status.skipped?.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: MUTED }}>
                  {status.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
