"use client";

const CARD_BG = "#161820";
const BORDER = "#2A2D38";

// A plain <select> that submits its parent <form> (a GET form targeting
// "?month=...") the moment the person picks a different month — no
// separate "Go" button needed when JS is available.
export default function MonthSelect({ months, selected }) {
  return (
    <select
      name="month"
      defaultValue={selected}
      onChange={(e) => e.target.form?.submit()}
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        color: "#FFFFFF",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}

function monthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
