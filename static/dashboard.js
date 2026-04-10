// ── Helpers ────────────────────────────────────────────────────────

function formatPrice(value, currency) {
  if (value == null) return "\u2014";
  const cur = (currency || "USD").toUpperCase();

  if (cur === "GBX") {
    return Math.round(value) + "p";
  }
  if (cur === "GBP") {
    if (value > 100) return Math.round(value) + "p";
    return "\u00a3" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (cur === "JPY") {
    return "\u00a5" + Math.round(value).toLocaleString("en-US");
  }
  if (cur === "EUR") {
    return "\u20ac" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // USD default
  return "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value) {
  if (value == null) return "\u2014";
  const pct = (value * 100).toFixed(1);
  const sign = value >= 0 ? "+" : "";
  return sign + pct + "%";
}

function percentColor(value) {
  if (value == null) return "text-gray-400";
  return value >= 0 ? "text-green-600" : "text-red-600";
}

function formatDate(dateString) {
  if (!dateString) return "\u2014";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "\u2014";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

function isMaterialsStale(dateString) {
  if (!dateString) return true;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return true;
  const diffMs = Date.now() - d.getTime();
  return diffMs > 90 * 24 * 60 * 60 * 1000;
}

// ── Rating Badge ──────────────────────────────────────────────────

function ratingBadge(rating) {
  if (!rating) return "";
  const r = rating.toLowerCase();
  let bg, text;
  if (r === "strong buy" || r === "outperform") {
    bg = "#dcfce7"; text = "#166534";
  } else if (r === "inline") {
    bg = "#f3f4f6"; text = "#374151";
  } else if (r === "underperform") {
    bg = "#fef3c7"; text = "#92400e";
  } else if (r === "sell") {
    bg = "#fee2e2"; text = "#991b1b";
  } else {
    bg = "#f3f4f6"; text = "#374151";
  }
  return '<span class="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap" style="background:' + bg + ";color:" + text + '">' + escapeHtml(rating) + "</span>";
}

// ── Signal Dot ────────────────────────────────────────────────────

function signalDot(signal) {
  const colors = { green: "bg-green-500", yellow: "bg-yellow-400", red: "bg-red-500" };
  const cls = colors[signal] || "bg-gray-300";
  return '<span class="inline-block w-2.5 h-2.5 rounded-full ' + cls + '"></span>';
}

// ── Warning Icon ──────────────────────────────────────────────────

function warningIcon() {
  return '<svg class="inline w-4 h-4 ml-1 text-yellow-500 -mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>';
}

// ── Escape HTML ───────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Toast Notification ───────────────────────────────────────────

function showToast(message, type) {
  const toast = document.createElement("div");
  const bg = type === "success" ? "bg-green-600" : "bg-red-600";
  toast.className = "toast-enter fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg " + bg;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger enter transition
  requestAnimationFrame(function () {
    toast.className = toast.className.replace("toast-enter", "toast-visible");
  });

  setTimeout(function () {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-exit");
    toast.addEventListener("transitionend", function () { toast.remove(); });
    // Fallback removal
    setTimeout(function () { toast.remove(); }, 400);
  }, 3000);
}

// ── Import Handler ───────────────────────────────────────────────

function initImport() {
  var fileInput = document.getElementById("import-file");
  var importBtn = document.getElementById("import-btn");
  var emptyImportBtn = document.getElementById("empty-import-btn");

  function triggerFile() { fileInput.click(); }

  importBtn.addEventListener("click", triggerFile);
  if (emptyImportBtn) emptyImportBtn.addEventListener("click", triggerFile);

  fileInput.addEventListener("change", function () {
    var file = fileInput.files[0];
    if (!file) return;

    var formData = new FormData();
    formData.append("file", file);

    fetch("/api/import", { method: "POST", body: formData })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status === "ok") {
          showToast(data.message || "Import successful", "success");
        } else {
          showToast(data.detail || data.message || "Import failed", "error");
        }
        // Reset file input so the same file can be re-imported
        fileInput.value = "";
        // Refresh data after 2 seconds
        setTimeout(loadDashboard, 2000);
      })
      .catch(function (err) {
        showToast("Network error: " + err.message, "error");
        fileInput.value = "";
      });
  });
}

// ── Render Portfolio Table ───────────────────────────────────────

function renderPortfolio(companies) {
  var emptyState = document.getElementById("empty-state");
  var tableWrapper = document.getElementById("table-wrapper");
  var tbody = document.getElementById("portfolio-body");

  if (!companies || companies.length === 0) {
    emptyState.classList.remove("hidden");
    tableWrapper.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  tableWrapper.classList.remove("hidden");

  var rows = "";
  for (var i = 0; i < companies.length; i++) {
    var c = companies[i];
    var materialsDateStr = formatDate(c.materials_date);
    var materialsClass = isMaterialsStale(c.materials_date) ? "text-red-600" : "text-gray-700";

    var suggestedCell = ratingBadge(c.suggested_rating);
    if (c.suggested_rating !== c.current_rating) {
      suggestedCell += warningIcon();
    }

    rows += '<tr class="hover:bg-[#f3f4f6] cursor-pointer" onclick="window.location=\'/company/' + encodeURIComponent(c.ticker) + '\'">';
    rows += '<td class="px-5 py-3 text-sm font-medium text-gray-900 whitespace-nowrap"><a href="/company/' + encodeURIComponent(c.ticker) + '" class="hover:text-blue-600">' + escapeHtml(c.name) + "</a></td>";
    rows += '<td class="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">' + escapeHtml(c.ticker) + "</td>";
    rows += '<td class="px-5 py-3 whitespace-nowrap">' + ratingBadge(c.current_rating) + "</td>";
    rows += '<td class="px-5 py-3 text-sm text-gray-700 text-right whitespace-nowrap">' + formatPrice(c.current_price, c.currency) + "</td>";
    rows += '<td class="px-5 py-3 text-sm text-gray-700 text-right whitespace-nowrap">' + formatPrice(c.blended_price_target, c.currency) + "</td>";
    rows += '<td class="px-5 py-3 text-sm text-right whitespace-nowrap ' + percentColor(c.upside_pct) + '">' + formatPercent(c.upside_pct) + "</td>";
    rows += '<td class="px-5 py-3 whitespace-nowrap">' + suggestedCell + "</td>";
    rows += '<td class="px-5 py-3 text-sm whitespace-nowrap ' + materialsClass + '">' + materialsDateStr + "</td>";
    rows += '<td class="px-5 py-3 text-center whitespace-nowrap">' + signalDot(c.signal) + "</td>";
    rows += "</tr>";
  }

  tbody.innerHTML = rows;
}

// ── Render Changes Feed ──────────────────────────────────────────

function renderChanges(changes) {
  var list = document.getElementById("changes-list");
  var emptyMsg = document.getElementById("changes-empty");

  // Filter to updates only, take first 10
  var updates = [];
  for (var i = 0; i < changes.length; i++) {
    if (changes[i].action === "update" && !changes[i].is_undone) {
      updates.push(changes[i]);
    }
    if (updates.length >= 10) break;
  }

  if (updates.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }

  emptyMsg.classList.add("hidden");
  var html = "";
  for (var i = 0; i < updates.length; i++) {
    var ch = updates[i];
    var ticker = ch.company_ticker || "";
    var href = "/company/" + encodeURIComponent(ticker);

    html += '<a href="' + href + '" class="block px-5 py-4 hover:bg-gray-50 transition-colors">';
    html += '<div class="flex items-start gap-4">';
    html += '<div class="text-xs text-gray-400 font-medium whitespace-nowrap pt-0.5 w-24 flex-shrink-0">' + formatDate(ch.created_at) + "</div>";
    html += '<div class="min-w-0">';
    html += '<div class="text-sm font-medium text-gray-900">' + escapeHtml(ch.company_name) + ' <span class="text-gray-400 font-normal">' + escapeHtml(ticker) + "</span></div>";
    html += '<div class="text-sm text-gray-600 mt-0.5">' + escapeHtml(ch.summary) + "</div>";
    html += "</div>";
    html += "</div>";
    html += "</a>";
  }
  list.innerHTML = html;
}

// ── Load Dashboard Data ──────────────────────────────────────────

function loadDashboard() {
  Promise.all([
    fetch("/api/companies").then(function (r) { return r.json(); }),
    fetch("/api/changes").then(function (r) { return r.json(); })
  ]).then(function (results) {
    renderPortfolio(results[0]);
    renderChanges(results[1]);
  }).catch(function (err) {
    showToast("Failed to load data: " + err.message, "error");
  });
}

// ── Init ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  initImport();
  loadDashboard();
});
