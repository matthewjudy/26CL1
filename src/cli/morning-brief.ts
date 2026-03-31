/**
 * Morning Brief — Daily intelligence report for MJ
 *
 * Renders as a Tailwind-styled HTML page served from the dashboard.
 * Data is loaded via API from a generated JSON file.
 * To-dos are persisted in the vault (syncs across devices via Obsidian Sync).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// ── Paths ────────────────────────────────────────────────────────────

export function briefPaths(baseDir: string, vaultDir: string) {
  const briefDir = path.join(baseDir, 'morning-brief');
  const archiveDir = path.join(briefDir, 'archive');
  return {
    briefDir,
    archiveDir,
    latestJson: path.join(briefDir, 'latest.json'),
    todosJson: path.join(vaultDir, 'Meta', 'Clementine', 'state', 'morning-brief-todos.json'),
    headlinesJson: path.join(briefDir, 'headlines-history.json'),
    idsJson: path.join(briefDir, 'ids-history.json'),
  };
}

export function ensureBriefDirs(baseDir: string, vaultDir: string) {
  const p = briefPaths(baseDir, vaultDir);
  for (const dir of [p.briefDir, p.archiveDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  // Ensure vault state dir exists
  const stateDir = path.join(vaultDir, 'Meta', 'Clementine', 'state');
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  // Init empty todos if not present
  if (!existsSync(p.todosJson)) {
    writeFileSync(p.todosJson, JSON.stringify({ items: [] }, null, 2));
  }
  return p;
}

// ── Data Types ───────────────────────────────────────────────────────

export interface BriefData {
  generated: string;   // ISO timestamp
  date: string;        // YYYY-MM-DD
  sections: {
    topStories: { title: string; summary: string; whyItMatters: string; suggestedAction: string; source: string; url: string }[];
    onRadar: { title: string; url: string }[];
    trends: { title: string; summary: string }[];
    emailAction: { sender: string; subject: string; summary: string; outlookUrl: string; timeSensitive: boolean }[];
    emailAwareness: { sender: string; subject: string; summary: string; outlookUrl: string }[];
    emailThreads: { subject: string; summary: string; outlookUrl: string }[];
    calendarToday: { time: string; title: string; attendees: string; prep: string }[];
    calendarTomorrow: { time: string; title: string; attendees: string; prep: string }[];
    suggestedMeetings: { who: string; topic: string; why: string; duration: string }[];
    idsExecutive: { issue: string; because: string; stale: boolean }[];
    idsMlt: { issue: string; because: string; stale: boolean }[];
    idsPmt: { issue: string; because: string; stale: boolean }[];
    headlines: { text: string; context: string }[];
    background: { title: string; summary: string }[];
  };
  stats: {
    webSearches: number;
    emailsScanned: number;
    actionEmails: number;
    calendarToday: number;
    calendarTomorrow: number;
    suggestedMeetings: number;
    idsExecutive: number;
    idsMlt: number;
    idsPmt: number;
    newTodos: number;
    carriedForward: number;
  };
}

export interface TodoItem {
  id: string;
  description: string;
  source: string;
  dateAdded: string;
  completed: boolean;
  completedDate: string | null;
}

export interface TodosData {
  items: TodoItem[];
}

// ── HTML Page ────────────────────────────────────────────────────────

export function getMorningBriefHTML(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MJ's Morning Brief</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: '#1a2744',
            'navy-light': '#243356',
          }
        }
      }
    }
  </script>
  <style>
    :root { --navy: #1a2744; --navy-light: #243356; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    /* Card styles */
    .brief-card {
      @apply bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden;
      transition: box-shadow 0.2s ease, transform 0.15s ease;
    }
    .brief-card:hover { @apply shadow-md; }
    .brief-section { @apply mb-6; }
    .section-label {
      @apply text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2;
    }
    .section-label::after {
      content: '';
      @apply flex-1 h-px bg-gray-200;
    }

    /* Story cards */
    .story-card {
      @apply bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-4;
      transition: box-shadow 0.2s ease, transform 0.15s ease;
    }
    .story-card:hover { @apply shadow-md; transform: translateY(-1px); }

    /* Pill links */
    .pill-link {
      @apply inline-flex items-center px-3 py-1 text-xs font-medium rounded-full no-underline transition-colors;
    }
    .pill-blue { @apply bg-blue-50 text-blue-700 hover:bg-blue-100; }
    .pill-red { @apply bg-red-50 text-red-700 hover:bg-red-100; }
    .pill-gray { @apply bg-gray-100 text-gray-600 hover:bg-gray-200; }

    /* Timeline */
    .timeline-item {
      @apply relative pl-6 pb-4 border-l-2 border-green-200 ml-2;
    }
    .timeline-item:last-child { @apply border-l-transparent pb-0; }
    .timeline-dot {
      @apply absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white;
    }

    /* Email action card */
    .email-action-card {
      @apply bg-white rounded-lg border p-3 sm:p-4 mb-3 transition-shadow;
    }
    .email-action-card:hover { @apply shadow-sm; }
    .email-urgent { @apply border-red-300 bg-red-50/30; }
    .urgent-badge {
      @apply inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-100 text-red-700;
    }

    /* Todo */
    .todo-item { @apply flex items-start gap-3 py-2.5 border-b border-gray-100; }
    .todo-cb { @apply mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer accent-blue-600; }

    /* Collapsible */
    details summary { cursor: pointer; list-style: none; }
    details summary::-webkit-details-marker { display: none; }
    details summary .chevron { transition: transform 0.2s ease; display: inline-block; }
    details[open] summary .chevron { transform: rotate(90deg); }

    /* IDS tabs */
    .ids-tab {
      @apply px-4 py-2 text-sm font-medium rounded-t-lg cursor-pointer transition-colors;
    }
    .ids-tab-active { @apply bg-white text-indigo-700 border border-b-0 border-gray-200; }
    .ids-tab-inactive { @apply bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100; }
    .ids-panel { @apply bg-white border border-gray-200 rounded-b-lg rounded-tr-lg p-4; }
    .stale-marker {
      @apply inline-block ml-1 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider rounded bg-amber-100 text-amber-700;
    }

    /* Weather */
    .weather-widget {
      @apply flex items-center gap-4 bg-white/10 backdrop-blur rounded-lg px-4 py-2 text-white;
    }
    .weather-temp { @apply text-2xl font-light; }
    .weather-detail { @apply text-xs text-gray-300; }

    /* Generating state */
    .gen-banner { @apply bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800; }
    .generating-pulse { animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .empty-msg { @apply text-gray-400 text-sm italic py-3; }

    /* Print stylesheet */
    @media print {
      .no-print { display: none !important; }
      body { color: black !important; background: white !important; font-size: 11pt; }
      .brief-card, .story-card, .email-action-card, .ids-panel {
        box-shadow: none !important; border: 1px solid #ccc !important;
        break-inside: avoid;
      }
      details { display: block !important; }
      details[open] > summary { display: none !important; }
      details > *:not(summary) { display: block !important; }
      details:not([open]) > *:not(summary) { display: block !important; }
      #header-bar {
        position: static !important;
        background: white !important;
        color: black !important;
        border-bottom: 3px solid black;
      }
      #header-bar * { color: black !important; }
      #weather-section { display: none !important; }
      .section-label { color: black !important; }
      .section-label::after { background: #999 !important; }
      section { break-inside: avoid; page-break-inside: avoid; }
      @page { margin: 0.75in; }
      .pill-link { border: 1px solid #999; background: none !important; color: black !important; }
      .timeline-item { border-left-color: #999 !important; }
      .timeline-dot { background: #666 !important; }
      #print-header {
        display: block !important;
        text-align: center;
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 12pt;
        padding-bottom: 8pt;
        border-bottom: 2px solid black;
      }
      .email-urgent { background: none !important; border-color: #999 !important; }
      .urgent-badge { background: none !important; border: 1px solid #999; color: black !important; }
      .ids-tab-bar { display: none !important; }
      .ids-panel-container > div { display: block !important; }
      .ids-panel { border: none !important; padding-left: 0 !important; }
      footer { break-before: avoid; }
    }
  </style>
</head>
<body class="bg-gray-50 text-gray-900 min-h-screen">

  <!-- Print-only header -->
  <div id="print-header" style="display:none;"></div>

  <!-- Header -->
  <div id="header-bar" class="bg-navy text-white sticky top-0 z-50 shadow-lg">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div class="flex-1">
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight" id="brief-title">Morning Brief</h1>
          <p class="text-sm text-gray-300 mt-1" id="brief-date">Loading...</p>
        </div>
        <div id="weather-section" class="hidden">
          <div class="weather-widget">
            <div>
              <span class="weather-temp" id="weather-temp">--</span>
            </div>
            <div>
              <p class="text-sm font-medium" id="weather-condition">--</p>
              <p class="weather-detail" id="weather-range">--</p>
            </div>
          </div>
        </div>
        <div class="flex gap-2 no-print self-start sm:self-center">
          <button onclick="window.print()" class="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Print
          </button>
          <button onclick="regenerateBrief()" id="regen-btn"
            class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Regenerate
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8" id="content">
    <div id="loading" class="gen-banner">Loading morning brief...</div>
  </div>

  <!-- Footer -->
  <footer id="brief-footer" class="hidden border-t border-gray-200 bg-white mt-8">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4">
      <div id="footer-stats" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 justify-center"></div>
    </div>
  </footer>

  <script>
    var TOKEN = ${JSON.stringify(token)};
    var briefData = null;
    var todosData = { items: [] };
    var activeIdsTab = 'executive';

    function apiFetch(path, opts) {
      opts = opts || {};
      opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + TOKEN });
      return fetch(path, opts);
    }

    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso + 'T12:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    function timeAgo(iso) {
      var ms = Date.now() - new Date(iso).getTime();
      if (ms < 60000) return 'just now';
      var m = Math.floor(ms / 60000);
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    // ── Weather ────────────────────────────
    function loadWeather() {
      fetch('https://wttr.in/30092?format=j1')
        .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function(data) {
          var cur = data.current_condition && data.current_condition[0];
          var today = data.weather && data.weather[0];
          if (!cur) return;
          var tempF = cur.temp_F || cur.temp_C;
          var condition = (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || '';
          var hi = today ? (today.maxtempF || today.maxtempC) : '';
          var lo = today ? (today.mintempF || today.mintempC) : '';
          document.getElementById('weather-temp').textContent = tempF + 'F';
          document.getElementById('weather-condition').textContent = condition;
          document.getElementById('weather-range').textContent = hi && lo ? 'H ' + hi + 'F / L ' + lo + 'F' : '';
          document.getElementById('weather-section').classList.remove('hidden');
        })
        .catch(function() { /* hide weather gracefully */ });
    }

    // ── Load Data ──────────────────────────
    async function loadBrief() {
      try {
        var r = await apiFetch('/api/morning-brief/data');
        if (!r.ok) throw new Error('No data');
        briefData = await r.json();
        renderBrief();
      } catch (e) {
        document.getElementById('content').innerHTML =
          '<div class="gen-banner">' +
          '<p class="text-lg font-medium mb-2">No morning brief generated yet</p>' +
          '<p class="text-sm">Click <strong>Regenerate</strong> to create your first brief, or wait for the 5:30 AM auto-generation.</p>' +
          '</div>';
      }
    }

    async function loadTodos() {
      try {
        var r = await apiFetch('/api/morning-brief/todos');
        if (r.ok) todosData = await r.json();
      } catch (e) { /* use empty */ }
    }

    async function saveTodos() {
      await apiFetch('/api/morning-brief/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todosData),
      });
    }

    // ── Render Brief ───────────────────────
    function renderBrief() {
      var d = briefData;
      if (!d) return;
      var s = d.sections;
      var dateStr = fmtDate(d.date);

      document.getElementById('brief-title').textContent = dateStr || 'Morning Brief';
      document.getElementById('brief-date').textContent = 'Generated ' + timeAgo(d.generated);
      document.getElementById('header-bar').setAttribute('data-date', d.date);

      // Print header
      var ph = document.getElementById('print-header');
      if (ph) ph.textContent = 'MJ\\x27s Morning Brief - ' + (dateStr || d.date);

      var html = '';

      // ── Top Stories ──────────────────
      html += '<section class="brief-section">';
      html += '<div class="section-label text-blue-600">Top Stories</div>';
      if (s.topStories && s.topStories.length) {
        html += '<div class="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">';
        for (var i = 0; i < s.topStories.length; i++) {
          var st = s.topStories[i];
          html += '<div class="story-card">'
            + '<h3 class="font-semibold text-base text-gray-900 mb-2">' + esc(st.title) + '</h3>'
            + '<p class="text-sm text-gray-600 mb-3">' + esc(st.summary) + '</p>'
            + '<div class="bg-blue-50 rounded-lg p-3 mb-3">'
            + '<p class="text-sm text-blue-900"><span class="font-semibold">Why it matters:</span> ' + esc(st.whyItMatters) + '</p>'
            + '</div>'
            + (st.suggestedAction ? '<div class="bg-green-50 rounded-lg p-3 mb-3"><p class="text-sm text-green-900"><span class="font-semibold">Suggested action:</span> ' + esc(st.suggestedAction) + '</p></div>' : '')
            + '<div class="flex items-center justify-between mt-2">'
            + '<span class="text-xs text-gray-400">' + esc(st.source) + '</span>'
            + (st.url ? '<a href="' + esc(st.url) + '" target="_blank" class="pill-link pill-blue">Read source</a>' : '')
            + '</div></div>';
        }
        html += '</div>';
      } else { html += emptyMsg('No major developments today.'); }
      html += '</section>';

      // ── On My Radar + Trends ─────────
      var hasRadar = s.onRadar && s.onRadar.length;
      var hasTrends = s.trends && s.trends.length;
      if (hasRadar || hasTrends) {
        html += '<section class="brief-section">';
        html += '<div class="grid gap-4 sm:grid-cols-1 md:grid-cols-2">';

        if (hasRadar) {
          html += '<div class="brief-card p-4 sm:p-5">';
          html += '<div class="section-label text-teal-600">On My Radar</div>';
          html += '<ul class="space-y-2">';
          for (var i = 0; i < s.onRadar.length; i++) {
            html += '<li class="text-sm flex items-start gap-2">'
              + '<span class="text-teal-400 mt-0.5 flex-shrink-0">--</span>'
              + '<a href="' + esc(s.onRadar[i].url) + '" target="_blank" class="text-gray-700 hover:text-blue-700 hover:underline">' + esc(s.onRadar[i].title) + '</a></li>';
          }
          html += '</ul></div>';
        }

        if (hasTrends) {
          html += '<div class="brief-card p-4 sm:p-5">';
          html += '<div class="section-label text-purple-600">Trends to Watch</div>';
          for (var i = 0; i < s.trends.length; i++) {
            html += '<div class="mb-3 last:mb-0"><p class="text-sm font-medium text-gray-900">' + esc(s.trends[i].title) + '</p>'
              + '<p class="text-sm text-gray-500 mt-0.5">' + esc(s.trends[i].summary) + '</p></div>';
          }
          html += '</div>';
        }

        html += '</div></section>';
      }

      // ── Headlines ────────────────────
      if (s.headlines && s.headlines.length) {
        html += '<section class="brief-section">';
        html += '<div class="section-label text-yellow-600">Headlines</div>';
        html += '<div class="brief-card divide-y divide-gray-100">';
        for (var i = 0; i < s.headlines.length; i++) {
          var hl = s.headlines[i];
          html += '<div class="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">'
            + '<p class="text-sm font-medium text-gray-900 flex-1">' + esc(hl.text) + '</p>'
            + '<p class="text-xs text-gray-400 flex-shrink-0">' + esc(hl.context) + '</p>'
            + '</div>';
        }
        html += '</div></section>';
      }

      // ── Schedule ─────────────────────
      html += '<section class="brief-section">';
      html += '<div class="section-label text-green-600">Schedule</div>';
      html += '<div class="brief-card p-4 sm:p-5">';

      // Today
      if (s.calendarToday && s.calendarToday.length) {
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Today</p>';
        html += '<div class="mb-6">';
        for (var i = 0; i < s.calendarToday.length; i++) {
          var ct = s.calendarToday[i];
          html += '<div class="timeline-item">'
            + '<span class="timeline-dot"></span>'
            + '<div>'
            + '<span class="text-xs font-mono text-green-700 font-medium">' + esc(ct.time) + '</span>'
            + '<p class="text-sm font-medium text-gray-900 mt-0.5">' + esc(ct.title) + '</p>'
            + (ct.attendees ? '<p class="text-xs text-gray-400 mt-0.5">' + esc(ct.attendees) + '</p>' : '')
            + (ct.prep ? '<p class="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1">Prep: ' + esc(ct.prep) + '</p>' : '')
            + '</div></div>';
        }
        html += '</div>';
      } else {
        html += '<p class="text-sm text-gray-400 italic mb-4">No meetings today.</p>';
      }

      // Tomorrow
      if (s.calendarTomorrow && s.calendarTomorrow.length) {
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tomorrow</p>';
        html += '<div class="mb-4">';
        for (var i = 0; i < s.calendarTomorrow.length; i++) {
          var ct = s.calendarTomorrow[i];
          html += '<div class="timeline-item">'
            + '<span class="timeline-dot" style="background:#94a3b8;"></span>'
            + '<div>'
            + '<span class="text-xs font-mono text-gray-500 font-medium">' + esc(ct.time) + '</span>'
            + '<p class="text-sm font-medium text-gray-700 mt-0.5">' + esc(ct.title) + '</p>'
            + (ct.attendees ? '<p class="text-xs text-gray-400 mt-0.5">' + esc(ct.attendees) + '</p>' : '')
            + (ct.prep ? '<p class="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1">Prep: ' + esc(ct.prep) + '</p>' : '')
            + '</div></div>';
        }
        html += '</div>';
      }

      // Suggested meetings
      if (s.suggestedMeetings && s.suggestedMeetings.length) {
        html += '<div class="border-t border-gray-100 pt-4 mt-2">';
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Suggested Meetings</p>';
        for (var i = 0; i < s.suggestedMeetings.length; i++) {
          var sm = s.suggestedMeetings[i];
          html += '<div class="flex items-start gap-3 py-2">'
            + '<div class="flex-1">'
            + '<p class="text-sm"><span class="font-medium">' + esc(sm.who) + '</span> -- ' + esc(sm.topic) + '</p>'
            + '<p class="text-xs text-gray-500 mt-0.5">' + esc(sm.why) + '</p>'
            + '</div>'
            + '<span class="text-xs text-gray-400 flex-shrink-0 bg-gray-100 rounded px-2 py-0.5">' + esc(sm.duration) + '</span>'
            + '</div>';
        }
        html += '</div>';
      }
      html += '</div></section>';

      // ── Email: Action Needed ─────────
      html += '<section class="brief-section">';
      html += '<div class="section-label text-red-600">Email: Action Needed</div>';
      if (s.emailAction && s.emailAction.length) {
        for (var i = 0; i < s.emailAction.length; i++) {
          var em = s.emailAction[i];
          html += '<div class="email-action-card' + (em.timeSensitive ? ' email-urgent' : ' border-gray-200') + '">'
            + '<div class="flex flex-col sm:flex-row sm:items-start gap-2">'
            + '<div class="flex-1 min-w-0">'
            + '<div class="flex items-center gap-2 flex-wrap">'
            + '<p class="text-sm font-semibold text-gray-900">' + esc(em.sender) + '</p>'
            + (em.timeSensitive ? '<span class="urgent-badge">Time-sensitive</span>' : '')
            + '</div>'
            + '<p class="text-sm text-gray-700 mt-0.5">' + esc(em.subject) + '</p>'
            + '<p class="text-sm text-gray-500 mt-1">' + esc(em.summary) + '</p>'
            + '</div>'
            + (em.outlookUrl ? '<a href="' + esc(em.outlookUrl) + '" target="_blank" class="pill-link pill-red flex-shrink-0 self-start">Open in Outlook</a>' : '')
            + '</div></div>';
        }
      } else { html += emptyMsg('Inbox zero -- no action needed.'); }
      html += '</section>';

      // ── Email: Awareness (collapsed) ──
      var awarenessCount = (s.emailAwareness || []).length + (s.emailThreads || []).length;
      if (awarenessCount > 0) {
        html += '<section class="brief-section">';
        html += '<div class="section-label text-orange-500">Email: Awareness</div>';
        html += '<div class="brief-card">';
        html += '<details><summary class="px-4 sm:px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">'
          + '<span class="chevron">&#9656;</span> ' + awarenessCount + ' items -- FYI and threads to watch</summary>';
        html += '<div class="px-4 sm:px-5 pb-4 space-y-4">';

        if (s.emailAwareness && s.emailAwareness.length) {
          html += '<div>';
          html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">FYI / Awareness</p>';
          for (var i = 0; i < s.emailAwareness.length; i++) {
            var ea = s.emailAwareness[i];
            html += '<div class="flex items-start gap-2 py-2 border-b border-gray-50">'
              + '<div class="flex-1 min-w-0">'
              + '<p class="text-sm"><span class="font-medium">' + esc(ea.sender) + '</span>: ' + esc(ea.summary) + '</p>'
              + '</div>'
              + (ea.outlookUrl ? '<a href="' + esc(ea.outlookUrl) + '" target="_blank" class="pill-link pill-gray flex-shrink-0 text-[11px]">Open</a>' : '')
              + '</div>';
          }
          html += '</div>';
        }

        if (s.emailThreads && s.emailThreads.length) {
          html += '<div>';
          html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Threads to Watch</p>';
          for (var i = 0; i < s.emailThreads.length; i++) {
            var et = s.emailThreads[i];
            html += '<div class="flex items-start gap-2 py-2 border-b border-gray-50">'
              + '<div class="flex-1 min-w-0">'
              + '<p class="text-sm"><span class="font-medium">' + esc(et.subject) + '</span>: ' + esc(et.summary) + '</p>'
              + '</div>'
              + (et.outlookUrl ? '<a href="' + esc(et.outlookUrl) + '" target="_blank" class="pill-link pill-gray flex-shrink-0 text-[11px]">Open</a>' : '')
              + '</div>';
          }
          html += '</div>';
        }

        html += '</div></details></div></section>';
      }

      // ── IDS Suggestions (tabbed) ─────
      var hasIds = (s.idsExecutive && s.idsExecutive.length) || (s.idsMlt && s.idsMlt.length) || (s.idsPmt && s.idsPmt.length);
      if (hasIds) {
        html += '<section class="brief-section">';
        html += '<div class="section-label text-indigo-600">L10 IDS Suggestions</div>';
        html += '<div class="ids-tab-bar flex gap-1 -mb-px relative z-10">'
          + '<button class="ids-tab ids-tab-active" data-tab="executive" onclick="switchIdsTab(\\x27executive\\x27)">Executive</button>'
          + '<button class="ids-tab ids-tab-inactive" data-tab="mlt" onclick="switchIdsTab(\\x27mlt\\x27)">MLT</button>'
          + '<button class="ids-tab ids-tab-inactive" data-tab="pmt" onclick="switchIdsTab(\\x27pmt\\x27)">PMT</button>'
          + '</div>';
        html += '<div class="ids-panel-container">';
        html += '<div id="ids-executive" class="ids-panel">' + renderIDS(s.idsExecutive) + '</div>';
        html += '<div id="ids-mlt" class="ids-panel" style="display:none;">' + renderIDS(s.idsMlt) + '</div>';
        html += '<div id="ids-pmt" class="ids-panel" style="display:none;">' + renderIDS(s.idsPmt) + '</div>';
        html += '</div></section>';
      }

      // ── To-Do List ───────────────────
      html += '<section class="brief-section">';
      html += '<div class="section-label text-pink-600">To-Do List</div>';
      html += '<div class="brief-card p-4 sm:p-5">';
      html += '<div class="no-print flex gap-2 mb-4">'
        + '<input type="text" id="todo-input" placeholder="Add a to-do..." '
        + 'class="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"'
        + ' onkeydown="if(event.key===\\x27Enter\\x27)addTodo()">'
        + '<button onclick="addTodo()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Add</button>'
        + '</div>';
      html += '<div id="todos-today"></div>';
      html += '<div id="todos-carried"></div>';
      html += '<details id="todos-completed-section"><summary class="text-sm font-medium text-gray-500 mt-3 py-1">'
        + '<span class="chevron">&#9656;</span> Completed</summary>'
        + '<div id="todos-completed"></div></details>';
      html += '<div class="flex gap-3 mt-4 pt-3 border-t border-gray-100 no-print">'
        + '<button onclick="clearCompleted()" class="text-xs text-red-500 hover:text-red-700 transition-colors font-medium">Clear Completed</button>'
        + '<button onclick="exportTodos()" class="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Copy to Clipboard</button>'
        + '</div>';
      html += '</div></section>';

      // ── Background (collapsed) ───────
      if (s.background && s.background.length) {
        html += '<section class="brief-section">';
        html += '<div class="section-label text-gray-400">Background / Already Covered</div>';
        html += '<div class="brief-card">';
        html += '<details><summary class="px-4 sm:px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">'
          + '<span class="chevron">&#9656;</span> ' + s.background.length + ' items</summary>';
        html += '<div class="px-4 sm:px-5 pb-4 divide-y divide-gray-50">';
        for (var i = 0; i < s.background.length; i++) {
          html += '<div class="py-2"><p class="text-sm font-medium text-gray-700">' + esc(s.background[i].title) + '</p>'
            + '<p class="text-sm text-gray-400 mt-0.5">' + esc(s.background[i].summary) + '</p></div>';
        }
        html += '</div></details></div></section>';
      }

      document.getElementById('content').innerHTML = html;

      // ── Footer stats ─────────────────
      var st = d.stats || {};
      var stats = [
        'Generated: ' + esc(d.date),
        'Web searches: ' + (st.webSearches || 0),
        'Emails scanned: ' + (st.emailsScanned || 0),
        'Action emails: ' + (st.actionEmails || 0),
        'Calendar: ' + (st.calendarToday || 0) + ' today, ' + (st.calendarTomorrow || 0) + ' tomorrow',
        'Meetings to schedule: ' + (st.suggestedMeetings || 0),
        'IDS: ' + (st.idsExecutive || 0) + ' exec / ' + (st.idsMlt || 0) + ' MLT / ' + (st.idsPmt || 0) + ' PMT',
        'To-dos: ' + (st.newTodos || 0) + ' new, ' + (st.carriedForward || 0) + ' carried'
      ];
      document.getElementById('footer-stats').innerHTML = stats.map(function(s) {
        return '<span>' + s + '</span>';
      }).join('<span class="text-gray-300">|</span>');
      document.getElementById('brief-footer').classList.remove('hidden');

      renderTodos();
    }

    function emptyMsg(msg) { return '<p class="empty-msg">' + esc(msg) + '</p>'; }

    function renderIDS(items) {
      var html = '';
      if (items && items.length) {
        for (var i = 0; i < items.length; i++) {
          html += '<div class="py-2' + (i < items.length - 1 ? ' border-b border-gray-100' : '') + '">'
            + '<p class="text-sm text-gray-900">'
            + esc(items[i].issue)
            + (items[i].stale ? '<span class="stale-marker">stale</span>' : '')
            + '</p>'
            + '<p class="text-xs text-gray-500 mt-0.5">because ' + esc(items[i].because) + '</p>'
            + '</div>';
        }
      } else {
        html += '<p class="text-xs text-gray-400 italic py-2">No suggestions</p>';
      }
      return html;
    }

    function switchIdsTab(tab) {
      activeIdsTab = tab;
      var tabs = document.querySelectorAll('.ids-tab');
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-tab') === tab) {
          tabs[i].className = 'ids-tab ids-tab-active';
        } else {
          tabs[i].className = 'ids-tab ids-tab-inactive';
        }
      }
      var panels = ['executive', 'mlt', 'pmt'];
      for (var i = 0; i < panels.length; i++) {
        var el = document.getElementById('ids-' + panels[i]);
        if (el) el.style.display = panels[i] === tab ? 'block' : 'none';
      }
    }

    // ── To-Do Rendering ────────────────────
    function renderTodos() {
      var today = briefData ? briefData.date : new Date().toISOString().slice(0, 10);
      var todayItems = todosData.items.filter(function(i) { return !i.completed && i.dateAdded === today; });
      var carriedItems = todosData.items.filter(function(i) { return !i.completed && i.dateAdded !== today; });
      var completedItems = todosData.items.filter(function(i) { return i.completed; });

      var todayEl = document.getElementById('todos-today');
      var carriedEl = document.getElementById('todos-carried');
      var completedEl = document.getElementById('todos-completed');
      if (!todayEl) return;

      todayEl.innerHTML = todayItems.length
        ? '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Today</p>' + todayItems.map(todoRow).join('')
        : '';
      carriedEl.innerHTML = carriedItems.length
        ? '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-3">Carried Forward</p>' + carriedItems.map(todoRow).join('')
        : '';
      completedEl.innerHTML = completedItems.length
        ? completedItems.map(function(i) { return todoRow(i, true); }).join('')
        : '<p class="text-xs text-gray-400 italic py-2">None</p>';

      var compSection = document.getElementById('todos-completed-section');
      if (compSection) {
        var sumEl = compSection.querySelector('summary');
        if (sumEl) sumEl.innerHTML = '<span class="chevron">&#9656;</span> Completed (' + completedItems.length + ')';
      }
    }

    function todoRow(item, isCompleted) {
      return '<div class="todo-item">'
        + '<input type="checkbox" class="todo-cb no-print" ' + (item.completed ? 'checked' : '') + ' onchange="toggleTodo(\\x27' + item.id + '\\x27)">'
        + '<div class="flex-1 min-w-0">'
        + '<p class="text-sm ' + (isCompleted ? 'line-through text-gray-400' : 'text-gray-900') + '">' + esc(item.description) + '</p>'
        + '<p class="text-xs text-gray-400">' + esc(item.source) + ' -- ' + esc(item.dateAdded) + '</p>'
        + '</div></div>';
    }

    // ── To-Do Actions ──────────────────────
    async function addTodo() {
      var input = document.getElementById('todo-input');
      var desc = (input.value || '').trim();
      if (!desc) return;
      todosData.items.push({
        id: crypto.randomUUID(),
        description: desc,
        source: 'Manual',
        dateAdded: new Date().toISOString().slice(0, 10),
        completed: false,
        completedDate: null,
      });
      input.value = '';
      await saveTodos();
      renderTodos();
    }

    async function toggleTodo(id) {
      var item = todosData.items.find(function(i) { return i.id === id; });
      if (!item) return;
      item.completed = !item.completed;
      item.completedDate = item.completed ? new Date().toISOString().slice(0, 10) : null;
      await saveTodos();
      renderTodos();
    }

    async function clearCompleted() {
      todosData.items = todosData.items.filter(function(i) { return !i.completed; });
      await saveTodos();
      renderTodos();
    }

    function exportTodos() {
      var text = todosData.items
        .filter(function(i) { return !i.completed; })
        .map(function(i) { return '- ' + i.description + ' (' + i.source + ', ' + i.dateAdded + ')'; })
        .join('\\n');
      navigator.clipboard.writeText(text).then(function() {
        var btn = document.querySelector('[onclick="exportTodos()"]');
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
      });
    }

    // ── Regenerate ─────────────────────────
    async function regenerateBrief() {
      if (!confirm('Generate a new morning brief? This may take several minutes.')) return;
      var btn = document.getElementById('regen-btn');
      btn.textContent = 'Generating...';
      btn.disabled = true;
      btn.classList.add('generating-pulse');
      try {
        await apiFetch('/api/morning-brief/generate', { method: 'POST' });
        pollForBrief();
      } catch (e) {
        btn.textContent = 'Regenerate';
        btn.disabled = false;
        btn.classList.remove('generating-pulse');
        alert('Failed to start generation: ' + e);
      }
    }

    function pollForBrief() {
      var startedAt = briefData ? briefData.generated : null;
      var attempts = 0;
      var poll = setInterval(async function() {
        attempts++;
        try {
          var r = await apiFetch('/api/morning-brief/data');
          if (r.ok) {
            var newData = await r.json();
            if (!startedAt || newData.generated !== startedAt) {
              clearInterval(poll);
              briefData = newData;
              renderBrief();
              var btn = document.getElementById('regen-btn');
              btn.textContent = 'Regenerate';
              btn.disabled = false;
              btn.classList.remove('generating-pulse');
              await loadTodos();
              renderTodos();
            }
          }
        } catch (e) { /* keep polling */ }
        if (attempts > 120) {
          clearInterval(poll);
          var btn = document.getElementById('regen-btn');
          btn.textContent = 'Regenerate';
          btn.disabled = false;
          btn.classList.remove('generating-pulse');
        }
      }, 5000);
    }

    // ── Init ───────────────────────────────
    (async function() {
      loadWeather();
      await Promise.all([loadBrief(), loadTodos()]);
    })();
  </script>
</body>
</html>`;
}

// ── Generation Prompt ────────────────────────────────────────────────

export const MORNING_BRIEF_PROMPT = `You are generating MJ's Morning Brief — a daily intelligence report for Matthew Judy, VP of Performance Marketing at Floor Coverings International (FCI), a home services franchise brand under FirstService Corporation. The franchise brand has 300+ locations nationwide. The operating system that the brand uses to manage their business and their franchisees is the Entrepreneurial Operating System (EOS).

MJ sits on three L10 teams:
- **Executive L10** — C-suite and VPs, strategic decisions, brand-level metrics
- **MLT (Marketing Leadership Team) L10** — marketing strategy, campaign performance, vendor management
- **PMT (Performance Marketing Team) L10** — tactical execution, ad ops, franchisee performance

This report is for one reader. Write for him, not a general audience. Keep it tight. "No major developments today" is a valid and honest result. Never pad with filler.

---

## Your Task

1. **Research** — Run web searches for each topic below. Date-filter to last 48 hours. If a search returns nothing fresh, that's fine — mark it empty.
2. **Email** — Scan MJ's Outlook inbox (last 24 hours). Categorize every email.
3. **Calendar** — Pull today's and tomorrow's Outlook calendar.
4. **Compile** — Produce a JSON file matching the schema below.
5. **Write** — Save the JSON to the path specified.

---

## Web Search Topics (search each independently):

**Industry & competitive landscape:**
- Home services franchise industry (flooring, remodeling, restoration)
- Floor Coverings International news, reviews, mentions
- Competitors: Empire Today, Lumber Liquidators/LL Flooring, 50 Floor, The Floor Trader, Carpet One, Abbey Carpet & Floor, National Floors Direct
- FirstService Corporation / FirstService Brands news
- Franchise industry trends, FTC franchise regulation, franchise M&A

**Performance marketing & martech:**
- Google Ads product updates, policy changes, beta features
- Google Business Profile changes, local search algorithm updates
- Local SEO and local services ads (LSA) developments
- GA4 updates, attribution model changes
- AI in performance marketing, ad automation, bidding strategy shifts
- Google AI Overviews / SGE impact on local search
- Meta/Facebook Ads platform changes, Advantage+ developments
- Lead aggregator shifts (Angi, HomeAdvisor, Thumbtack)
- Google review policy changes, reputation platform shifts
- Privacy legislation, cookie developments, conversion API changes

---

## Freshness Rule (NON-NEGOTIABLE):
- Only surface content published in the last 48 hours in sections A-C.
- If nothing fresh exists, say "no new developments." Do not backfill with older content.
- Older context goes to background section.

---

## Email Rules:
For EVERY email surfaced, include a direct Outlook Web App link using this format:
\`https://outlook.office365.com/mail/id/{urlEncodedMessageId}\`
IMPORTANT: The messageId from the Graph API contains characters like +, /, and = that MUST be URL-encoded (encodeURIComponent). Do NOT include "/inbox/" in the path — just "/mail/id/".

Organize into three tiers:
1. **Needs reply/action** — MJ is on To line, response expected. Flag time-sensitive with timeSensitive: true.
2. **FYI/awareness** — CC'd or informational.
3. **Threads to watch** — ongoing conversations with new activity.

---

## Calendar Rules:
For each meeting: time, title, attendees (abbreviated if >5), prep recommendation.
Also scan email threads from last 7 days for implied meetings that haven't been scheduled.

---

## IDS Suggestions:
Source from news (sections A-C), email threads, franchisee patterns, industry shifts.
Format as problems to solve: "Our CPL in the Southeast is 40% above target because [reason]"
Keep 3-5 per L10. Mark items appearing 3+ consecutive days with stale: true.

---

## Headlines:
5-7 punchy one-liners for team comms. Tied to report items. Conversational, not clickbait.

---

## Output:
Write a JSON file to: {OUTPUT_PATH}

The JSON must match this exact schema:

\`\`\`json
{
  "generated": "<ISO timestamp>",
  "date": "<YYYY-MM-DD>",
  "sections": {
    "topStories": [{"title": "", "summary": "", "whyItMatters": "", "suggestedAction": "", "source": "", "url": ""}],
    "onRadar": [{"title": "", "url": ""}],
    "trends": [{"title": "", "summary": ""}],
    "emailAction": [{"sender": "", "subject": "", "summary": "", "outlookUrl": "", "timeSensitive": false}],
    "emailAwareness": [{"sender": "", "subject": "", "summary": "", "outlookUrl": ""}],
    "emailThreads": [{"subject": "", "summary": "", "outlookUrl": ""}],
    "calendarToday": [{"time": "", "title": "", "attendees": "", "prep": ""}],
    "calendarTomorrow": [{"time": "", "title": "", "attendees": "", "prep": ""}],
    "suggestedMeetings": [{"who": "", "topic": "", "why": "", "duration": ""}],
    "idsExecutive": [{"issue": "", "because": "", "stale": false}],
    "idsMlt": [{"issue": "", "because": "", "stale": false}],
    "idsPmt": [{"issue": "", "because": "", "stale": false}],
    "headlines": [{"text": "", "context": ""}],
    "background": [{"title": "", "summary": ""}]
  },
  "stats": {
    "webSearches": 0,
    "emailsScanned": 0,
    "actionEmails": 0,
    "calendarToday": 0,
    "calendarTomorrow": 0,
    "suggestedMeetings": 0,
    "idsExecutive": 0,
    "idsMlt": 0,
    "idsPmt": 0,
    "newTodos": 0,
    "carriedForward": 0
  }
}
\`\`\`

After writing the JSON file, also read the existing to-do file at {TODOS_PATH} and add any new action items from emails (Section D), suggested meetings (Section F), and IDS prep items. Write the updated to-do file back. Each new item should have a unique id (use a UUID-like string), source referencing which section generated it, and today's date.

## Tone:
- Direct, no hedging. If something matters, say why in one sentence.
- If something doesn't directly affect MJ's work, cut it.
- Treat freshness as sacred.
- Email summaries: who, what, what's needed.
- IDS suggestions: problems to solve, not observations.
`;
