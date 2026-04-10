document.addEventListener("DOMContentLoaded", () => {
    loadPortfolio();
    loadChanges();
    initDropZone();
});

async function loadPortfolio() {
    const container = document.getElementById("portfolio-table");
    try {
        const res = await fetch("/api/companies");
        const companies = await res.json();

        if (!companies.length) {
            container.innerHTML = '<div class="empty">No companies in portfolio. Use Import JSON to add one.</div>';
            return;
        }

        let html = "<table><thead><tr>";
        html += "<th></th><th>Name</th><th>Ticker</th><th>Rating</th><th>Price</th><th>Target</th><th>Upside</th><th>Suggested</th>";
        html += "</tr></thead><tbody>";

        for (const c of companies) {
            const signalClass = c.signal === "red" ? "signal-red" : c.signal === "yellow" ? "signal-yellow" : "signal-green";
            const upsidePct = c.upside_pct != null ? (c.upside_pct * 100).toFixed(1) + "%" : "\u2014";
            const upsideClass = c.upside_pct != null ? (c.upside_pct >= 0 ? "upside-pos" : "upside-neg") : "";
            const currency = c.currency || "USD";
            const sym = { USD: "$", EUR: "\u20ac", GBP: "\u00a3", AUD: "A$", CAD: "C$" }[currency] || currency + " ";
            const price = c.current_price != null ? sym + c.current_price.toFixed(2) : "\u2014";
            const target = c.blended_price_target != null ? sym + c.blended_price_target.toFixed(2) : "\u2014";

            html += "<tr>";
            html += `<td><span class="signal ${signalClass}"></span></td>`;
            html += `<td><a class="ticker-link" href="/company/${encodeURIComponent(c.ticker)}">${esc(c.name)}</a></td>`;
            html += `<td>${esc(c.ticker)}</td>`;
            html += `<td>${esc(c.current_rating)}</td>`;
            html += `<td>${price}</td>`;
            html += `<td>${target}</td>`;
            html += `<td class="${upsideClass}">${upsidePct}</td>`;
            html += `<td>${esc(c.suggested_rating)}</td>`;
            html += "</tr>";
        }

        html += "</tbody></table>";
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="empty">Failed to load portfolio.</div>';
    }
}

async function loadChanges() {
    const container = document.getElementById("changes-feed");
    try {
        const res = await fetch("/api/changes");
        const changes = await res.json();

        if (!changes.length) {
            container.innerHTML = '<div class="empty">No recent changes.</div>';
            return;
        }

        let html = "";
        for (const ch of changes) {
            const date = ch.created_at ? ch.created_at.split("T")[0] : "";
            html += '<div class="change-item">';
            html += `<div class="change-meta">${esc(ch.company_name)} (${esc(ch.company_ticker)}) &mdash; ${date}</div>`;
            html += `<div class="change-summary">${esc(ch.summary)}</div>`;
            html += "</div>";
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="empty">Failed to load changes.</div>';
    }
}

function openImport() {
    document.getElementById("importModal").classList.add("active");
    document.getElementById("importJson").value = "";
    const status = document.getElementById("importStatus");
    status.className = "import-status";
    status.textContent = "";
}

function closeImport() {
    document.getElementById("importModal").classList.remove("active");
}

async function submitImport() {
    const text = document.getElementById("importJson").value.trim();
    const status = document.getElementById("importStatus");

    if (!text) {
        status.className = "import-status error";
        status.textContent = "Please paste JSON data.";
        return;
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        status.className = "import-status error";
        status.textContent = "Invalid JSON.";
        return;
    }

    try {
        const res = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const result = await res.json();

        if (res.ok) {
            status.className = "import-status success";
            status.textContent = result.summary || "Import successful.";
            setTimeout(() => {
                closeImport();
                loadPortfolio();
                loadChanges();
            }, 1500);
        } else {
            status.className = "import-status error";
            status.textContent = result.message || "Import failed.";
        }
    } catch (err) {
        status.className = "import-status error";
        status.textContent = "Network error.";
    }
}

function initDropZone() {
    const overlay = document.getElementById("dropOverlay");
    let dragCounter = 0;

    window.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.classList.add("active");
    });
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove("active");
        }
    });
    window.addEventListener("drop", async (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove("active");

        const file = e.dataTransfer.files[0];
        if (!file || !file.name.endsWith(".json")) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const res = await fetch("/api/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (res.ok) {
                loadPortfolio();
                loadChanges();
            } else {
                alert(result.message || "Import failed.");
            }
        } catch {
            alert("Failed to read or import file.");
        }
    });
}

function esc(s) {
    if (s == null) return "\u2014";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
}
