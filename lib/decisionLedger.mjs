// Pure decision-ledger helpers shared by the UI and Node tests.
// A ledger contains events; a taste summary contains the latest decision for
// each candidate. Outcome events are a different entity and never count as an
// accept/reject.

const timestamp = (row, fallback = 0) => {
  const value = row?.created_at || row?.at;
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function canonicalDecisionRows(rows = []) {
  const latest = new Map();
  rows.forEach((row, index) => {
    if (!row?.candidate_key || row?.candidate?.kind === "outcome") return;
    if (row.decision !== "accept" && row.decision !== "reject") return;
    const previous = latest.get(row.candidate_key);
    if (!previous || timestamp(row, index) >= timestamp(previous.row, previous.index)) {
      latest.set(row.candidate_key, { row, index });
    }
  });
  return [...latest.values()]
    .sort((a, b) => timestamp(b.row, b.index) - timestamp(a.row, a.index))
    .map((entry) => entry.row);
}

export function decisionCounts(rows = []) {
  const canonical = canonicalDecisionRows(rows);
  return {
    total: canonical.length,
    accepts: canonical.filter((row) => row.decision === "accept").length,
    rejects: canonical.filter((row) => row.decision === "reject").length,
  };
}
