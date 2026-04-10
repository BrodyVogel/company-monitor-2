/* company.js — Company detail page logic */

let DATA = null;
const TICKER = document.getElementById('company-page').dataset.ticker;

// ── Currency & Formatting Helpers ──────────────────────────────────────────

function currencySymbol(currency) {
  const map = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  return map[(currency || '').toUpperCase()] || '$';
}

function formatCurrency(value, currency, exchange) {
  if (value == null) return '—';
  const cur = (currency || 'USD').toUpperCase();
  // GBP pence: London exchange + value > 100 → pence
  if (cur === 'GBP' && exchange && exchange.toLowerCase().includes('london') && value > 100) {
    return Math.round(value).toLocaleString() + 'p';
  }
  const sym = currencySymbol(cur);
  if (cur === 'JPY') return sym + Math.round(value).toLocaleString();
  return sym + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrencyM(value, currency) {
  if (value == null) return '—';
  const sym = currencySymbol(currency);
  // Show as millions with commas, no decimals
  return sym + Math.round(value).toLocaleString() + 'M';
}

function formatPct(value, decimals) {
  if (value == null) return '—';
  decimals = decimals != null ? decimals : 1;
  return (value * 100).toFixed(decimals) + '%';
}

function formatPctRaw(value, decimals) {
  // value is already a percentage number (e.g. 13.0), not a ratio
  if (value == null) return '—';
  decimals = decimals != null ? decimals : 1;
  return value.toFixed(decimals) + '%';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function returnClass(val) {
  if (val == null) return '';
  return val >= 0 ? 'text-green-600' : 'text-red-600';
}

// ── Rating Helpers ─────────────────────────────────────────────────────────

const RATING_COLORS = {
  'Strong Buy':    { bg: 'bg-emerald-700', text: 'text-white', dot: 'bg-emerald-700' },
  'Outperform':    { bg: 'bg-green-600',   text: 'text-white', dot: 'bg-green-600' },
  'Inline':        { bg: 'bg-gray-500',    text: 'text-white', dot: 'bg-gray-500' },
  'Underperform':  { bg: 'bg-orange-500',  text: 'text-white', dot: 'bg-orange-500' },
  'Sell':          { bg: 'bg-red-600',     text: 'text-white', dot: 'bg-red-600' },
};

function ratingBadge(rating, large) {
  const c = RATING_COLORS[rating] || { bg: 'bg-gray-400', text: 'text-white' };
  const size = large ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-0.5 text-xs';
  return '<span class="inline-block rounded-full font-semibold ' + size + ' ' + c.bg + ' ' + c.text + '">' + esc(rating) + '</span>';
}

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Status Dot ─────────────────────────────────────────────────────────────

function statusDot(status) {
  const colors = { all_clear: 'bg-green-500', watch: 'bg-yellow-400', action_required: 'bg-red-500' };
  return '<span class="inline-block w-2.5 h-2.5 rounded-full ' + (colors[status] || 'bg-gray-400') + '"></span>';
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const resp = await fetch('/api/companies/' + encodeURIComponent(TICKER));
    if (!resp.ok) {
      const err = await resp.json().catch(function() { return {}; });
      throw new Error(err.error || 'Company not found');
    }
    DATA = await resp.json();

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    renderHeader();
    renderRiskRewardBar();
    renderOverview();
    renderScenariosIndicators();
    renderModel();
    renderHistory();
    initTabs();
  } catch (e) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error-msg').textContent = e.message;
    document.getElementById('error').classList.remove('hidden');
  }
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function initTabs() {
  var btns = document.querySelectorAll('.tab-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });
  switchTab('overview');
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    if (btn.dataset.tab === name) {
      btn.classList.add('border-blue-600', 'text-blue-600', 'font-bold');
      btn.classList.remove('border-transparent', 'text-gray-500');
    } else {
      btn.classList.remove('border-blue-600', 'text-blue-600', 'font-bold');
      btn.classList.add('border-transparent', 'text-gray-500');
    }
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) {
    p.classList.add('hidden');
  });
  document.getElementById('tab-' + name).classList.remove('hidden');
}

// ── Persistent Header ──────────────────────────────────────────────────────

function renderHeader() {
  var c = DATA.company;
  var recHist = DATA.recommendation_history || [];
  var openRec = null;
  for (var i = recHist.length - 1; i >= 0; i--) {
    if (!recHist[i].ended_at) { openRec = recHist[i]; break; }
  }

  var suggestedHtml = '';
  if (c.suggested_rating && c.suggested_rating !== c.current_rating) {
    suggestedHtml = '<div class="flex items-center mt-1 text-sm text-yellow-600">' +
      '<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
      'Suggested: ' + esc(c.suggested_rating) +
      '</div>';
  }

  var recLine = '';
  if (openRec) {
    var retClass = returnClass(openRec.return_pct);
    recLine = '<div class="text-sm text-gray-600 mt-2">' +
      esc(openRec.rating) + ' since ' + formatDate(openRec.started_at) +
      ' · Return: <span class="font-medium ' + retClass + '">' + formatPct(openRec.return_pct) + '</span>' +
      ' · ' + (openRec.current_period_days != null ? openRec.current_period_days + ' days' : '') +
      '</div>';
  }

  document.getElementById('header-section').innerHTML =
    '<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">' +
      '<div class="min-w-0">' +
        '<h1 class="text-2xl font-bold text-gray-900">' + esc(c.name) + '</h1>' +
        '<p class="text-sm text-gray-500 mt-0.5">' + esc(c.ticker) + '.' + esc(c.exchange) + ' · ' + esc(c.currency) + '</p>' +
        (c.elevator_pitch ? '<p class="text-sm text-gray-600 mt-1 line-clamp-3">' + esc(c.elevator_pitch) + '</p>' : '') +
      '</div>' +
      '<div class="flex-shrink-0 text-right">' +
        ratingBadge(c.current_rating, true) +
        suggestedHtml +
      '</div>' +
    '</div>' +
    recLine;
}

// ── Risk / Reward Bar ──────────────────────────────────────────────────────

function renderRiskRewardBar() {
  var c = DATA.company;
  var scenarios = DATA.scenarios || [];
  if (scenarios.length === 0) { document.getElementById('risk-reward-bar').innerHTML = ''; return; }

  var prices = scenarios.map(function(s) { return s.implied_price; }).filter(function(p) { return p != null; });
  var bearPrice = Math.min.apply(null, prices);
  var bullPrice = Math.max.apply(null, prices);

  if (bearPrice === bullPrice) return;
  var range = bullPrice - bearPrice;
  var currentPct = Math.max(0, Math.min(100, ((c.current_price - bearPrice) / range) * 100));
  var targetPct = Math.max(0, Math.min(100, ((c.blended_price_target - bearPrice) / range) * 100));

  var cur = c.currency;
  var exch = c.exchange;

  document.getElementById('risk-reward-bar').innerHTML =
    '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">' +
      '<div class="relative h-6 rounded-full overflow-hidden" style="background:linear-gradient(to right, #fecaca 0%, #fecaca ' + currentPct + '%, #bbf7d0 ' + currentPct + '%, #bbf7d0 100%)">' +
        // Current price dot
        '<div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style="left:' + currentPct + '%">' +
          '<div class="w-4 h-4 bg-gray-800 rounded-full border-2 border-white shadow"></div>' +
        '</div>' +
        // Target marker
        '<div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style="left:' + targetPct + '%">' +
          '<div class="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-blue-600" style="margin-top:-2px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="flex justify-between mt-1.5 text-xs text-gray-500">' +
        '<span>Bear ' + formatCurrency(bearPrice, cur, exch) + '</span>' +
        '<span class="font-medium text-gray-700">Current ' + formatCurrency(c.current_price, cur, exch) + '</span>' +
        '<span class="font-medium text-blue-600">Target ' + formatCurrency(c.blended_price_target, cur, exch) + '</span>' +
        '<span>Bull ' + formatCurrency(bullPrice, cur, exch) + '</span>' +
      '</div>' +
    '</div>';
}

// ── Tab 1: Overview ────────────────────────────────────────────────────────

function renderOverview() {
  var c = DATA.company;
  var cur = c.currency;
  var exch = c.exchange;
  var html = '';

  // Price cards
  html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">';
  html += priceCard('Price', formatCurrency(c.current_price, cur, exch), '');
  html += priceCard('Blended Target', formatCurrency(c.blended_price_target, cur, exch), '');
  html += priceCard('Upside', formatPct(c.upside_pct), returnClass(c.upside_pct));
  html += '</div>';

  // Scenarios compact
  html += sectionHeading('Scenarios');
  html += renderScenarioTable(DATA.scenarios);

  // Indicator Status compact
  html += sectionHeading('Indicator Status');
  html += renderIndicatorCompact(DATA.indicators);

  // Variant Perceptions
  if (DATA.variant_perceptions && DATA.variant_perceptions.length) {
    html += sectionHeading('Variant Perceptions');
    html += renderVariantPerceptions(DATA.variant_perceptions);
  }

  // Upcoming Catalysts
  html += sectionHeading('Upcoming Catalysts');
  html += renderUpcomingCatalysts(DATA.catalysts);

  document.getElementById('tab-overview').innerHTML = html;
  bindVpToggles();
}

function priceCard(label, value, colorClass) {
  return '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">' +
    '<div class="text-xs text-gray-500 uppercase tracking-wide">' + label + '</div>' +
    '<div class="text-2xl font-bold mt-1 ' + colorClass + '">' + value + '</div>' +
  '</div>';
}

function sectionHeading(title) {
  return '<h2 class="text-lg font-semibold text-gray-900 mb-3 mt-6">' + title + '</h2>';
}

function renderScenarioTable(scenarios) {
  if (!scenarios || !scenarios.length) return '<p class="text-sm text-gray-400">No scenarios.</p>';
  var c = DATA.company;
  var html = '<div class="overflow-x-auto"><table class="w-full text-sm">' +
    '<thead><tr class="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">' +
    '<th class="pb-2 pr-4">Scenario</th><th class="pb-2 pr-4">Weight</th><th class="pb-2 pr-4">Implied Price</th><th class="pb-2">Summary</th>' +
    '</tr></thead><tbody>';
  scenarios.forEach(function(s) {
    html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="py-2 pr-4 font-medium">' + esc(s.name) + '</td>' +
      '<td class="py-2 pr-4">' + formatPctRaw(s.effective_weight != null ? s.effective_weight * 100 : null, 0) + '</td>' +
      '<td class="py-2 pr-4">' + formatCurrency(s.implied_price, c.currency, c.exchange) + '</td>' +
      '<td class="py-2 text-gray-600">' + esc(s.summary) + '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderIndicatorCompact(indicators) {
  if (!indicators || !indicators.length) return '<p class="text-sm text-gray-400">No indicators.</p>';
  var html = '<div class="space-y-2">';
  indicators.forEach(function(ind) {
    html += '<div class="flex items-start gap-2">' +
      statusDot(ind.status) +
      '<span class="font-medium text-sm">' + esc(ind.name) + '</span>' +
      '<span class="text-sm text-gray-500">— ' + esc(ind.commentary) + '</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function renderVariantPerceptions(vps) {
  var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  vps.forEach(function(vp, idx) {
    var isAbove = vp.direction === 'above_consensus';
    var arrow = isAbove ? '↑' : '↓';
    var arrowColor = isAbove ? 'text-green-600' : 'text-red-600';

    var convictionColors = { 'High': 'bg-green-100 text-green-800', 'Medium-High': 'bg-blue-100 text-blue-800', 'Medium': 'bg-yellow-100 text-yellow-800', 'Low': 'bg-gray-100 text-gray-600' };
    var convClass = convictionColors[vp.conviction] || 'bg-gray-100 text-gray-600';

    var desc = vp.description || '';
    var truncated = desc.length > 100;
    var shortDesc = truncated ? desc.substring(0, 100) + '…' : desc;

    html += '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">' +
      '<div class="flex items-center gap-2 mb-1">' +
        '<span class="text-lg font-bold ' + arrowColor + '">' + arrow + '</span>' +
        '<span class="font-medium text-sm">' + esc(vp.title) + '</span>' +
        '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + convClass + '">' + esc(vp.conviction) + '</span>' +
      '</div>' +
      '<p class="text-sm text-gray-500">' +
        '<span class="vp-short" data-idx="' + idx + '">' + esc(shortDesc) + '</span>' +
        (truncated ? '<span class="vp-full hidden" data-idx="' + idx + '">' + esc(desc) + '</span>' : '') +
        (truncated ? ' <button class="vp-toggle text-blue-600 hover:underline text-xs" data-idx="' + idx + '">more</button>' : '') +
      '</p>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function bindVpToggles() {
  document.querySelectorAll('.vp-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = btn.dataset.idx;
      var short = document.querySelector('.vp-short[data-idx="' + idx + '"]');
      var full = document.querySelector('.vp-full[data-idx="' + idx + '"]');
      if (!full) return;
      var isExpanded = !full.classList.contains('hidden');
      if (isExpanded) {
        full.classList.add('hidden');
        short.classList.remove('hidden');
        btn.textContent = 'more';
      } else {
        full.classList.remove('hidden');
        short.classList.add('hidden');
        btn.textContent = 'less';
      }
    });
  });
}

function renderUpcomingCatalysts(catalysts) {
  if (!catalysts || !catalysts.length) return '<p class="text-sm text-gray-400">No catalysts.</p>';

  // Filter: occurred=0
  var upcoming = catalysts.filter(function(cat) { return cat.occurred === 0; });
  if (!upcoming.length) return '<p class="text-sm text-gray-400">No upcoming catalysts.</p>';

  // Sort by expected_date
  upcoming.sort(function(a, b) { return (a.expected_date || '').localeCompare(b.expected_date || ''); });

  // Split into future and overdue
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var html = '<div class="space-y-3">';
  var shown = 0;
  upcoming.forEach(function(cat) {
    var days = daysUntil(cat.expected_date);
    var isPast = days !== null && days < 0;

    // Show overdue + next 3 future
    if (!isPast && shown >= 3) return;
    if (!isPast) shown++;

    var daysLabel = '';
    if (isPast) {
      daysLabel = '<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Overdue</span>';
    } else if (days != null) {
      daysLabel = '<span class="text-gray-400 ml-1">· ' + days + ' days</span>';
    }

    html += '<div class="flex items-start gap-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3">' +
      '<div>' +
        '<div class="text-sm font-medium">' + esc(cat.event) + '</div>' +
        '<div class="text-xs text-gray-500 mt-0.5">' + formatDate(cat.expected_date) + daysLabel + '</div>' +
        (cat.why_it_matters ? '<div class="text-xs text-gray-500 mt-1">' + esc(cat.why_it_matters) + '</div>' : '') +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// ── Tab 2: Scenarios & Indicators ──────────────────────────────────────────

function renderScenariosIndicators() {
  var html = '';

  html += sectionHeading('Scenarios');
  html += renderScenarioTable(DATA.scenarios);

  html += sectionHeading('Indicators');
  html += renderIndicatorFull(DATA.indicators);

  document.getElementById('tab-scenarios').innerHTML = html;
}

function renderIndicatorFull(indicators) {
  if (!indicators || !indicators.length) return '<p class="text-sm text-gray-400">No indicators.</p>';
  var html = '<div class="overflow-x-auto"><table class="w-full text-sm">' +
    '<thead><tr class="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">' +
    '<th class="pb-2 pr-3">Indicator</th><th class="pb-2 pr-3">Current Value</th>' +
    '<th class="pb-2 pr-3">Bear Threshold</th><th class="pb-2 pr-3">Bull Threshold</th>' +
    '<th class="pb-2 pr-3">Frequency</th><th class="pb-2 pr-3">Source</th>' +
    '<th class="pb-2 pr-3">Status</th><th class="pb-2">Commentary</th>' +
    '</tr></thead><tbody>';
  indicators.forEach(function(ind) {
    html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="py-2 pr-3 font-medium">' + esc(ind.name) + '</td>' +
      '<td class="py-2 pr-3">' + esc(ind.current_value) + '</td>' +
      '<td class="py-2 pr-3 text-red-600">' + esc(ind.bear_threshold) + '</td>' +
      '<td class="py-2 pr-3 text-green-600">' + esc(ind.bull_threshold) + '</td>' +
      '<td class="py-2 pr-3">' + esc(ind.check_frequency) + '</td>' +
      '<td class="py-2 pr-3">' + esc(ind.data_source) + '</td>' +
      '<td class="py-2 pr-3">' + statusDot(ind.status) + '</td>' +
      '<td class="py-2 text-gray-600">' + esc(ind.commentary) + '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// ── Tab 3: Model ───────────────────────────────────────────────────────────

var activeScenario = 'Base';

function renderModel() {
  var html = '';

  // Scenario toggle
  html += '<div class="flex space-x-2 mb-6">';
  ['Bear', 'Base', 'Bull'].forEach(function(sc) {
    var isActive = sc === activeScenario;
    var cls = isActive
      ? 'bg-blue-600 text-white'
      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50';
    html += '<button class="scenario-btn px-4 py-1.5 rounded-md text-sm font-medium ' + cls + '" data-scenario="' + sc + '">' + sc + '</button>';
  });
  html += '</div>';

  html += '<div id="model-table-container"></div>';

  document.getElementById('tab-model').innerHTML = html;
  renderModelTable();

  document.querySelectorAll('.scenario-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activeScenario = btn.dataset.scenario;
      renderModel();
    });
  });
}

function renderModelTable() {
  var financials = (DATA.model_financials || []).filter(function(f) {
    return f.scenario === activeScenario;
  });

  if (!financials.length) {
    document.getElementById('model-table-container').innerHTML = '<p class="text-sm text-gray-400">No financial data for ' + activeScenario + ' scenario.</p>';
    return;
  }

  financials.sort(function(a, b) { return a.sort_order - b.sort_order; });

  var cur = DATA.company.currency;
  var years = financials.map(function(f) { return f.fiscal_year; });

  var metrics = [
    { label: 'Revenue',       key: 'revenue',        fmt: 'currM' },
    { label: 'Revenue Growth', key: 'revenue_growth', fmt: 'pctRaw' },
    { label: 'EBITDA',        key: 'ebitda',          fmt: 'currM' },
    { label: 'EBITDA Margin', key: 'ebitda_margin',   fmt: 'pctRaw' },
    { label: 'EPS',           key: 'eps',             fmt: 'eps' },
    { label: 'Free Cash Flow', key: 'free_cash_flow', fmt: 'currM' },
    { label: 'FCF Margin',   key: 'fcf_margin',       fmt: 'pctRaw' },
  ];

  var html = '<div class="overflow-x-auto"><table class="w-full text-sm">';
  // Header row: blank + years
  html += '<thead><tr class="border-b border-gray-200 text-left text-xs text-gray-500 uppercase"><th class="pb-2 pr-4"></th>';
  years.forEach(function(y) { html += '<th class="pb-2 pr-4">' + esc(y) + '</th>'; });
  html += '</tr></thead><tbody>';

  metrics.forEach(function(m) {
    html += '<tr class="border-b border-gray-100 hover:bg-gray-50">';
    html += '<td class="py-2 pr-4 font-medium text-gray-700">' + m.label + '</td>';
    financials.forEach(function(f) {
      var val = f[m.key];
      var formatted;
      if (m.fmt === 'currM') formatted = formatCurrencyM(val, cur);
      else if (m.fmt === 'pctRaw') formatted = val != null ? (val * 100).toFixed(1) + '%' : '—';
      else if (m.fmt === 'eps') formatted = val != null ? currencySymbol(cur) + val.toFixed(2) : '—';
      else formatted = val != null ? String(val) : '—';
      html += '<td class="py-2 pr-4">' + formatted + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  document.getElementById('model-table-container').innerHTML = html;
}

// ── Tab 4: History ─────────────────────────────────────────────────────────

function renderHistory() {
  var html = '';

  // Recommendation History
  html += sectionHeading('Recommendation History');
  html += renderRecHistory();

  // Change Log
  html += sectionHeading('Change Log');
  html += renderChangeLog();

  // Delete Company
  html += '<div class="mt-12 pt-6 border-t border-gray-200">' +
    '<button id="delete-company-btn" class="text-sm text-red-500 hover:text-red-700 hover:underline">Delete this company</button>' +
  '</div>';

  document.getElementById('tab-history').innerHTML = html;
  bindHistoryActions();
}

function renderRecHistory() {
  var recs = DATA.recommendation_history || [];
  if (!recs.length) return '<p class="text-sm text-gray-400">No recommendation history.</p>';

  var c = DATA.company;
  var cur = c.currency;
  var exch = c.exchange;

  var html = '<div class="overflow-x-auto"><table class="w-full text-sm">' +
    '<thead><tr class="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">' +
    '<th class="pb-2 pr-3">Period</th><th class="pb-2 pr-3">Rating</th>' +
    '<th class="pb-2 pr-3">Entry Price</th><th class="pb-2 pr-3">Exit Price</th>' +
    '<th class="pb-2 pr-3">Return</th><th class="pb-2">Duration</th>' +
    '</tr></thead><tbody>';

  recs.forEach(function(rec) {
    var startDate = formatDate(rec.started_at);
    var endDate = rec.ended_at ? formatDate(rec.ended_at) : 'current';
    var period = startDate + ' – ' + endDate;

    var exitPrice = rec.ended_at
      ? formatCurrency(rec.price_at_end, cur, exch)
      : formatCurrency(c.current_price, cur, exch) + ' <span class="text-gray-400">(live)</span>';

    html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="py-2 pr-3">' + period + '</td>' +
      '<td class="py-2 pr-3">' + ratingBadge(rec.rating) + '</td>' +
      '<td class="py-2 pr-3">' + formatCurrency(rec.price_at_start, cur, exch) + '</td>' +
      '<td class="py-2 pr-3">' + exitPrice + '</td>' +
      '<td class="py-2 pr-3 font-medium ' + returnClass(rec.return_pct) + '">' + formatPct(rec.return_pct) + '</td>' +
      '<td class="py-2">' + (rec.current_period_days != null ? rec.current_period_days + ' days' : '—') + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div>';

  // Total return
  if (DATA.total_return_since_initiation != null) {
    html += '<p class="mt-3 text-sm font-bold ' + returnClass(DATA.total_return_since_initiation) + '">' +
      'Total return since initiation: ' + formatPct(DATA.total_return_since_initiation) +
    '</p>';
  }

  return html;
}

function renderChangeLog() {
  var logs = DATA.change_log || [];
  if (!logs.length) return '<p class="text-sm text-gray-400">No changes recorded.</p>';

  // Find most recent non-undone entry for undo button
  var latestNonUndone = null;
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].is_undone === 0) { latestNonUndone = logs[i].id; break; }
  }

  var actionBadge = {
    onboard: 'bg-blue-100 text-blue-800',
    update: 'bg-orange-100 text-orange-800',
    undo: 'bg-gray-100 text-gray-600',
  };

  var html = '<div class="space-y-3">';
  logs.forEach(function(log) {
    var isUndone = log.is_undone === 1;
    var badgeClass = actionBadge[log.action] || 'bg-gray-100 text-gray-600';
    var undoneClass = isUndone ? 'opacity-50' : '';

    html += '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-3 ' + undoneClass + '">' +
      '<div class="flex items-center gap-2 flex-wrap">' +
        '<span class="text-xs text-gray-400">' + formatDate(log.created_at) + '</span>' +
        '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + badgeClass + '">' + esc(log.action) + '</span>' +
        (isUndone ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">Undone</span>' : '') +
      '</div>' +
      '<p class="text-sm mt-1' + (isUndone ? ' line-through text-gray-400' : ' text-gray-700') + '">' + esc(log.summary) + '</p>' +
      '<div class="mt-2 flex items-center gap-3">' +
        '<button class="changelog-expand text-xs text-blue-600 hover:underline" data-logid="' + log.id + '">Expand</button>' +
        (!isUndone && log.id === latestNonUndone ? '<button class="changelog-undo text-xs text-red-500 hover:underline" data-logid="' + log.id + '">Undo</button>' : '') +
      '</div>' +
      '<pre class="changelog-details hidden mt-2 text-xs bg-gray-50 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto" data-logid="' + log.id + '"></pre>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function bindHistoryActions() {
  // Expand/collapse change log details
  document.querySelectorAll('.changelog-expand').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.dataset.logid;
      var pre = document.querySelector('pre.changelog-details[data-logid="' + id + '"]');
      if (pre.classList.contains('hidden')) {
        // Find the log entry and populate
        var log = DATA.change_log.find(function(l) { return String(l.id) === id; });
        if (log) {
          var details;
          try { details = JSON.stringify(JSON.parse(log.details), null, 2); } catch (e) { details = log.details || '(no details)'; }
          pre.textContent = details;
        }
        pre.classList.remove('hidden');
        btn.textContent = 'Collapse';
      } else {
        pre.classList.add('hidden');
        btn.textContent = 'Expand';
      }
    });
  });

  // Undo buttons
  document.querySelectorAll('.changelog-undo').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (!confirm('Undo this import?')) return;
      var id = btn.dataset.logid;
      try {
        var resp = await fetch('/api/undo/' + id, { method: 'POST' });
        var result = await resp.json();
        if (resp.ok) {
          showToast(result.message || 'Undo successful');
          await refreshData();
        } else {
          showToast(result.error || 'Undo failed', 'error');
        }
      } catch (e) {
        showToast('Undo failed: ' + e.message, 'error');
      }
    });
  });

  // Delete company
  var delBtn = document.getElementById('delete-company-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async function() {
      var name = DATA.company.name;
      if (!confirm('Delete ' + name + '? This removes all data and cannot be undone.')) return;
      try {
        var resp = await fetch('/api/companies/' + encodeURIComponent(TICKER), { method: 'DELETE' });
        var result = await resp.json();
        if (resp.ok) {
          showToast('Deleted ' + name);
          setTimeout(function() { window.location.href = '/'; }, 1000);
        } else {
          showToast(result.error || 'Delete failed', 'error');
        }
      } catch (e) {
        showToast('Delete failed: ' + e.message, 'error');
      }
    });
  }
}

// ── Refresh data (after undo) ──────────────────────────────────────────────

async function refreshData() {
  try {
    var resp = await fetch('/api/companies/' + encodeURIComponent(TICKER));
    if (!resp.ok) { window.location.href = '/'; return; }
    DATA = await resp.json();
    renderHeader();
    renderRiskRewardBar();
    renderOverview();
    renderScenariosIndicators();
    renderModel();
    renderHistory();
  } catch (e) {
    window.location.href = '/';
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
