let DATA = null;

document.addEventListener("DOMContentLoaded", () => {
    loadCompany();
    document.getElementById("tabsBar").addEventListener("click", (e) => {
        if (!e.target.classList.contains("tab")) return;
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
        e.target.classList.add("active");
        document.getElementById("tab-" + e.target.dataset.tab).classList.add("active");
    });
});

async function loadCompany() {
    try {
        const res = await fetch("/api/companies/" + encodeURIComponent(TICKER));
        if (!res.ok) {
            document.getElementById("companyName").textContent = "Company not found";
            return;
        }
        DATA = await res.json();
        renderBanner();
        renderOverview();
        renderScenarios();
        renderModel();
        renderHistory();
    } catch (err) {
        document.getElementById("companyName").textContent = "Error loading company";
    }
}

function currSym() {
    const c = DATA.company.currency || "USD";
    return { USD: "$", EUR: "\u20ac", GBP: "\u00a3", AUD: "A$", CAD: "C$" }[c] || c + " ";
}

function renderBanner() {
    const c = DATA.company;
    const sym = currSym();
    document.getElementById("companyName").textContent = c.name;
    document.getElementById("companySubtitle").textContent =
        c.ticker + (c.exchange ? " \u00b7 " + c.exchange : "");

    const upsidePct = c.upside_pct != null ? (c.upside_pct * 100).toFixed(1) + "%" : "\u2014";
    const upsideClass = c.upside_pct != null ? (c.upside_pct >= 0 ? "upside-pos" : "upside-neg") : "";
    const totalReturn = DATA.total_return_since_initiation != null
        ? (DATA.total_return_since_initiation * 100).toFixed(1) + "%"
        : "\u2014";
    const totalReturnClass = DATA.total_return_since_initiation != null
        ? (DATA.total_return_since_initiation >= 0 ? "upside-pos" : "upside-neg")
        : "";

    document.getElementById("companyStats").innerHTML = `
        <div class="stat"><span class="stat-label">Rating</span><span class="stat-value">${esc(c.current_rating)}</span></div>
        <div class="stat"><span class="stat-label">Price</span><span class="stat-value">${c.current_price != null ? sym + c.current_price.toFixed(2) : "\u2014"}</span></div>
        <div class="stat"><span class="stat-label">Target</span><span class="stat-value">${sym}${c.blended_price_target.toFixed(2)}</span></div>
        <div class="stat"><span class="stat-label">Upside</span><span class="stat-value ${upsideClass}">${upsidePct}</span></div>
        <div class="stat"><span class="stat-label">Suggested</span><span class="stat-value">${esc(c.suggested_rating)}</span></div>
        <div class="stat"><span class="stat-label">Total Return</span><span class="stat-value ${totalReturnClass}">${totalReturn}</span></div>
    `;
}

/* ---- OVERVIEW TAB ---- */
function renderOverview() {
    const c = DATA.company;
    let html = "";

    // Elevator Pitch
    if (c.elevator_pitch) {
        html += `<div class="card"><div class="card-header">Elevator Pitch</div><div class="card-body"><p class="pitch">${esc(c.elevator_pitch)}</p></div></div>`;
    }

    // Variant Perceptions
    if (DATA.variant_perceptions.length) {
        html += '<div class="card"><div class="card-header">Variant Perceptions</div><div class="card-body"><table><thead><tr><th>Direction</th><th>Title</th><th>Description</th><th>Conviction</th></tr></thead><tbody>';
        for (const vp of DATA.variant_perceptions) {
            const badge = vp.direction === "above_consensus" ? "badge-above" : vp.direction === "below_consensus" ? "badge-below" : "badge-neutral";
            const label = vp.direction === "above_consensus" ? "Above" : vp.direction === "below_consensus" ? "Below" : "Neutral";
            html += `<tr><td><span class="badge ${badge}">${label}</span></td><td>${esc(vp.title)}</td><td>${esc(vp.description)}</td><td>${esc(vp.conviction)}</td></tr>`;
        }
        html += "</tbody></table></div></div>";
    }

    // Catalysts
    if (DATA.catalysts.length) {
        html += '<div class="card"><div class="card-header">Catalysts</div><div class="card-body"><table><thead><tr><th>Event</th><th>Expected Date</th><th>Why It Matters</th><th>Status</th></tr></thead><tbody>';
        for (const cat of DATA.catalysts) {
            const cls = cat.occurred ? "catalyst-occurred" : "";
            const status = cat.occurred ? "Occurred" : "Pending";
            html += `<tr class="${cls}"><td>${esc(cat.event)}</td><td>${esc(cat.expected_date)}</td><td>${esc(cat.why_it_matters)}</td><td>${status}</td></tr>`;
        }
        html += "</tbody></table></div></div>";
    }

    document.getElementById("tab-overview").innerHTML = html || '<div class="empty">No overview data.</div>';
}

/* ---- SCENARIOS & INDICATORS TAB ---- */
function renderScenarios() {
    let html = "";
    const sym = currSym();

    // Scenarios table
    if (DATA.scenarios.length) {
        html += '<div class="card"><div class="card-header">Scenarios</div><div class="card-body"><table><thead><tr><th>Scenario</th><th>Weight</th><th>Implied Price</th><th>Summary</th></tr></thead><tbody>';
        for (const s of DATA.scenarios) {
            const weight = s.effective_weight != null ? (s.effective_weight * 100).toFixed(0) + "%" : "\u2014";
            html += `<tr><td>${esc(s.name)}</td><td>${weight}</td><td>${sym}${s.implied_price.toFixed(2)}</td><td>${esc(s.summary)}</td></tr>`;
        }
        html += "</tbody></table></div></div>";
    }

    // Indicators table
    if (DATA.indicators.length) {
        html += '<div class="card"><div class="card-header">Indicators</div><div class="card-body"><table><thead><tr><th>Name</th><th>Current</th><th>Bear</th><th>Bull</th><th>Status</th><th>Commentary</th></tr></thead><tbody>';
        for (const ind of DATA.indicators) {
            const badge = ind.status === "action_required" ? "badge-red" : ind.status === "watch" ? "badge-yellow" : "badge-green";
            const label = ind.status === "action_required" ? "Action Required" : ind.status === "watch" ? "Watch" : "All Clear";
            html += `<tr><td>${esc(ind.name)}</td><td>${esc(ind.current_value)}</td><td>${esc(ind.bear_threshold)}</td><td>${esc(ind.bull_threshold)}</td><td><span class="badge ${badge}">${label}</span></td><td>${esc(ind.commentary)}</td></tr>`;
        }
        html += "</tbody></table></div></div>";
    }

    document.getElementById("tab-scenarios").innerHTML = html || '<div class="empty">No scenario data.</div>';
}

/* ---- MODEL TAB ---- */

// Format a currency value with commas and "M" suffix.
// e.g. 4820 -> "$4,820M", null -> "\u2014"
function fmtCurrencyM(val) {
    if (val == null) return "\u2014";
    const sym = currSym();
    return sym + val.toLocaleString("en-US", { maximumFractionDigits: 0 }) + "M";
}

// Format a percentage value that is ALREADY a percentage number.
// The database stores 13.0 meaning 13.0%, NOT 0.13.
// Do NOT multiply by 100.
function fmtPct(val) {
    if (val == null) return "\u2014";
    return val.toFixed(1) + "%";
}

// Format EPS with currency symbol and 2 decimals.
// e.g. 0.75 -> "$0.75"
function fmtEps(val) {
    if (val == null) return "\u2014";
    const sym = currSym();
    return sym + val.toFixed(2);
}

function renderModel() {
    const financials = DATA.model_financials;
    if (!financials.length) {
        document.getElementById("tab-model").innerHTML = '<div class="empty">No model data.</div>';
        return;
    }

    // Group by scenario
    const byScenario = {};
    for (const mf of financials) {
        if (!byScenario[mf.scenario]) byScenario[mf.scenario] = [];
        byScenario[mf.scenario].push(mf);
    }

    let html = "";
    for (const [scenario, rows] of Object.entries(byScenario)) {
        rows.sort((a, b) => (a.fiscal_year > b.fiscal_year ? 1 : -1));

        html += `<div class="card"><div class="card-header">${esc(scenario)} Case</div><div class="card-body">`;
        html += "<table><thead><tr><th>Metric</th>";
        for (const r of rows) {
            html += `<th>${esc(r.fiscal_year)}</th>`;
        }
        html += "</tr></thead><tbody>";

        const metrics = [
            { key: "revenue", label: "Revenue", fmt: fmtCurrencyM },
            { key: "revenue_growth", label: "Revenue Growth", fmt: fmtPct },
            { key: "ebitda", label: "EBITDA", fmt: fmtCurrencyM },
            { key: "ebitda_margin", label: "EBITDA Margin", fmt: fmtPct },
            { key: "eps", label: "EPS", fmt: fmtEps },
            { key: "free_cash_flow", label: "Free Cash Flow", fmt: fmtCurrencyM },
            { key: "fcf_margin", label: "FCF Margin", fmt: fmtPct },
        ];

        for (const m of metrics) {
            html += `<tr><td><strong>${m.label}</strong></td>`;
            for (const r of rows) {
                html += `<td>${m.fmt(r[m.key])}</td>`;
            }
            html += "</tr>";
        }

        html += "</tbody></table></div></div>";
    }

    document.getElementById("tab-model").innerHTML = html;
}

/* ---- HISTORY TAB ---- */
function renderHistory() {
    let html = "";
    const sym = currSym();

    // Recommendation History
    if (DATA.recommendation_history.length) {
        html += '<div class="card"><div class="card-header">Recommendation History</div><div class="card-body"><table><thead><tr><th>Rating</th><th>Start</th><th>End</th><th>Entry Price</th><th>Exit Price</th><th>Return</th><th>Days</th></tr></thead><tbody>';
        for (const rec of DATA.recommendation_history) {
            const returnPct = rec.return_pct != null ? (rec.return_pct * 100).toFixed(1) + "%" : "\u2014";
            const returnClass = rec.return_pct != null ? (rec.return_pct >= 0 ? "return-pos" : "return-neg") : "";
            const exitPrice = rec.ended_at
                ? (rec.price_at_end != null ? sym + rec.price_at_end.toFixed(2) : "\u2014")
                : (DATA.company.current_price != null ? sym + DATA.company.current_price.toFixed(2) + " (current)" : "\u2014");
            const endDate = rec.ended_at || "Open";
            html += `<tr><td>${esc(rec.rating)}</td><td>${esc(rec.started_at)}</td><td>${endDate}</td><td>${sym}${rec.price_at_start.toFixed(2)}</td><td>${exitPrice}</td><td class="${returnClass}">${returnPct}</td><td>${rec.current_period_days != null ? rec.current_period_days : "\u2014"}</td></tr>`;
        }
        html += "</tbody></table></div></div>";
    }

    // Change Log
    if (DATA.change_log.length) {
        html += '<div class="card"><div class="card-header">Change Log</div><div class="card-body">';
        for (const cl of DATA.change_log) {
            const date = cl.created_at ? cl.created_at.split("T")[0] : "";
            const undone = cl.is_undone ? " (undone)" : "";
            html += `<div class="history-item"><div class="history-meta">${esc(cl.action)}${undone} &mdash; ${date}</div><div class="history-summary">${esc(cl.summary)}</div></div>`;
        }
        html += "</div></div>";
    }

    document.getElementById("tab-history").innerHTML = html || '<div class="empty">No history data.</div>';
}

function esc(s) {
    if (s == null) return "\u2014";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
}
