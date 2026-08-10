(() => {
  const fmtRet = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  };
  const fmtHit = (value) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);
  const badgeClass = (label) => {
    const t = String(label || "").toLowerCase();
    if (t === "target hit") return "badge badge-outcome-target";
    if (t === "stop") return "badge badge-outcome-stop";
    if (t === "open" || t === "pending entry") return "badge badge-outcome-open";
    if (t === "untracked") return "badge badge-outcome-untracked";
    return "badge badge-neutral";
  };
  const inWindow = (iso, windowKey, asOf) => {
    if (!windowKey) return true;
    if (!iso) return false;
    if (windowKey === "last_30") {
      const a = new Date(`${iso}T00:00:00`);
      const b = new Date(`${asOf}T00:00:00`);
      return (b - a) / 86400000 <= 30;
    }
    if (windowKey === "last_month") {
      return iso.slice(0, 7) === String(asOf).slice(0, 7);
    }
    return true;
  };
  const statusMatch = (row, status) => {
    if (!status) return true;
    const st = String(row.outcome_status || "");
    const lab = String(row.outcome_label || "");
    if (status === "open") return st === "open" || st === "pending_entry";
    if (status === "closed") return st === "closed";
    if (status === "target") return lab === "Target Hit";
    if (status === "stop") return lab === "Stop";
    return true;
  };
  const summarize = (rows) => {
    let recommendations = rows.length;
    let untracked = 0;
    let stillOpen = 0;
    const closed = [];
    let wins = 0;
    let losses = 0;
    for (const row of rows) {
      const st = String(row.outcome_status || "");
      const lab = String(row.outcome_label || "");
      if (st === "untracked" || lab === "Untracked") {
        untracked += 1;
        continue;
      }
      if (st === "open" || st === "pending_entry") {
        stillOpen += 1;
        continue;
      }
      if (st !== "closed" || typeof row.outcome_return_pct !== "number") continue;
      closed.push(row.outcome_return_pct);
      if (row.outcome_return_pct > 0) wins += 1;
      else if (row.outcome_return_pct < 0) losses += 1;
    }
    const decided = wins + losses;
    return {
      recommendations,
      wins,
      losses,
      still_open: stillOpen,
      hit_rate: decided ? wins / decided : null,
      average_return: closed.length ? closed.reduce((a, b) => a + b, 0) / closed.length : null,
      untracked,
    };
  };
  const renderTracker = (rows) => {
    const body = document.getElementById("tracker-body");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = "<tr><td colspan='3' class='empty'>No matching recommendations.</td></tr>";
      return;
    }
    body.innerHTML = rows.map((row) => {
      const label = row.outcome_label || "Untracked";
      const showRet = (row.outcome_status === "closed" || row.outcome_status === "open") && typeof row.outcome_return_pct === "number";
      return `<tr><td class="symbol">${row.symbol}</td><td><span class="${badgeClass(label)}">${label}</span></td><td class="price">${showRet ? fmtRet(row.outcome_return_pct) : "—"}</td></tr>`;
    }).join("");
  };
  const renderSummary = (summary) => {
    const set = (key, text) => {
      const el = document.querySelector(`[data-kpi="${key}"]`);
      if (el) el.textContent = text;
    };
    set("recommendations", String(summary.recommendations));
    set("wins", String(summary.wins));
    set("losses", String(summary.losses));
    set("still_open", String(summary.still_open));
    set("hit_rate", fmtHit(summary.hit_rate));
    set("average_return", fmtRet(summary.average_return));
  };
  const boot = async () => {
    const filterRoot = document.getElementById("filters");
    if (!filterRoot) return;
    let latest;
    let performance;
    try {
      const [latestRes, perfRes] = await Promise.all([
        fetch("data/latest.json"),
        fetch("data/performance.json"),
      ]);
      if (!latestRes.ok || !perfRes.ok) return;
      latest = await latestRes.json();
      performance = await perfRes.json();
    } catch (_err) {
      return;
    }
    let status = "";
    let windowKey = "";
    const apply = () => {
      const asOf = latest.as_of_date;
      let rows = performance.rows || [];
      if (!windowKey) {
        rows = rows.filter((row) => row.as_of_date === asOf);
      } else {
        rows = rows.filter((row) => inWindow(row.as_of_date, windowKey, asOf));
      }
      rows = rows.filter((row) => statusMatch(row, status));
      renderTracker(rows);
      const summaryRows = windowKey
        ? (performance.rows || []).filter((row) => inWindow(row.as_of_date, windowKey, asOf))
        : (performance.rows || []);
      renderSummary(summarize(summaryRows));
    };
    filterRoot.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-status], button[data-window]");
      if (!btn) return;
      if (btn.dataset.status) {
        status = status === btn.dataset.status ? "" : btn.dataset.status;
      }
      if (btn.dataset.window) {
        windowKey = windowKey === btn.dataset.window ? "" : btn.dataset.window;
      }
      filterRoot.querySelectorAll("button").forEach((el) => el.classList.remove("is-active"));
      if (status) {
        const active = filterRoot.querySelector(`[data-status="${status}"]`);
        if (active) active.classList.add("is-active");
      }
      if (windowKey) {
        const active = filterRoot.querySelector(`[data-window="${windowKey}"]`);
        if (active) active.classList.add("is-active");
      }
      apply();
    });
  };
    const fmtInr = (value) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
      return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const refreshLastCloses = async () => {
      const cells = document.querySelectorAll("[data-yahoo]");
      for (const cell of cells) {
        const ticker = cell.getAttribute("data-yahoo");
        if (!ticker) continue;
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const body = await res.json();
          const meta = body && body.chart && body.chart.result && body.chart.result[0] && body.chart.result[0].meta;
          const price = meta && (meta.regularMarketPrice || meta.previousClose);
          if (typeof price !== "number") continue;
          const valueEl = cell.querySelector(".last-close-value");
          const asofEl = cell.querySelector(".last-close-asof");
          if (valueEl) valueEl.textContent = fmtInr(price);
          if (asofEl) asofEl.textContent = "Yahoo last traded";
        } catch (_err) {
          /* Pages cannot proxy quotes; keep published last close. */
        }
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { boot(); refreshLastCloses(); });
  else { boot(); refreshLastCloses(); }
})();
