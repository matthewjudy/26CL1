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
  <style>
    :root { --navy: #1a2744; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .section-header { @apply text-lg font-bold pb-1 mb-4 border-b-2; }
    .story-card { @apply shadow-md rounded-lg p-4 mb-4 bg-white border border-gray-100; }
    .pill-link { @apply inline-flex items-center px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 no-underline transition-colors; }
    .todo-item { @apply flex items-start gap-2 py-2 border-b border-gray-100; }
    .todo-cb { @apply mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer; }
    details summary { cursor: pointer; }
    details summary::-webkit-details-marker { display: none; }
    details summary::before { content: '▸ '; font-size: 0.8em; }
    details[open] summary::before { content: '▾ '; }
    .status-line span { @apply block; }
    .empty-msg { @apply text-gray-400 text-sm italic py-2; }
    .gen-banner { @apply bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-amber-800; }
    .generating-pulse { animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /* Print stylesheet */
    @media print {
      .no-print { display: none !important; }
      details { display: block !important; }
      details > summary { display: none !important; }
      details > *:not(summary) { display: block !important; }
      .story-card { box-shadow: none !important; border: 1px solid #ddd !important; }
      body { color: black !important; background: white !important; }
      .bg-\\[\\#1a2744\\] { background: white !important; color: black !important; border-bottom: 2px solid black; }
      .section-header { color: black !important; }
      section { break-inside: avoid; }
      @page { margin: 1in; }
      .pill-link { border: 1px solid #999; background: none !important; color: black !important; }
      #header-bar::before { content: "MJ's Morning Brief — " attr(data-date); font-weight: bold; }
    }
  </style>
</head>
<body class="bg-gray-50 text-gray-900">

  <!-- Header -->
  <div id="header-bar" class="bg-[#1a2744] text-white sticky top-0 z-50 shadow-lg">
    <div class="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
      <div>
        <h1 class="text-xl font-bold tracking-tight">MJ's Morning Brief</h1>
        <p class="text-sm text-gray-300" id="brief-date">Loading...</p>
      </div>
      <div class="flex gap-2 no-print">
        <button onclick="regenerateBrief()" id="regen-btn"
          class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-3 py-1.5 rounded text-sm font-medium transition-colors">
          ↻ Regenerate
        </button>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-8" id="content">
    <div id="loading" class="gen-banner">Loading morning brief...</div>
  </div>

  <script>
    var TOKEN = ${JSON.stringify(token)};
    var briefData = null;
    var todosData = { items: [] };

    function apiFetch(path, opts) {
      opts = opts || {};
      opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + TOKEN });
      return fetch(path, opts);
    }

    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso);
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

      document.getElementById('brief-date').textContent = fmtDate(d.date) + ' · Generated ' + timeAgo(d.generated);
      document.getElementById('header-bar').setAttribute('data-date', d.date);

      var html = '';

      // Section A — Top Stories
      html += sectionStart('A', 'Top Stories', 'border-blue-600');
      if (s.topStories && s.topStories.length) {
        for (var i = 0; i < s.topStories.length; i++) {
          var st = s.topStories[i];
          html += '<div class="story-card">'
            + '<h3 class="font-semibold text-base mb-1">' + esc(st.title) + '</h3>'
            + '<p class="text-sm text-gray-700 mb-2">' + esc(st.summary) + '</p>'
            + '<p class="text-sm text-blue-800 mb-1"><strong>Why it matters:</strong> ' + esc(st.whyItMatters) + '</p>'
            + (st.suggestedAction ? '<p class="text-sm text-green-800"><strong>Action:</strong> ' + esc(st.suggestedAction) + '</p>' : '')
            + '<div class="mt-2 flex gap-2 items-center">'
            + (st.url ? '<a href="' + esc(st.url) + '" target="_blank" class="pill-link">Source ↗</a>' : '')
            + '<span class="text-xs text-gray-400">' + esc(st.source) + '</span>'
            + '</div></div>';
        }
      } else { html += emptyMsg('No major developments today.'); }
      html += sectionEnd();

      // Section B — On My Radar
      html += sectionStart('B', 'On My Radar', 'border-teal-500');
      if (s.onRadar && s.onRadar.length) {
        html += '<ul class="space-y-1">';
        for (var i = 0; i < s.onRadar.length; i++) {
          html += '<li class="text-sm">• <a href="' + esc(s.onRadar[i].url) + '" target="_blank" class="text-blue-700 hover:underline">' + esc(s.onRadar[i].title) + '</a></li>';
        }
        html += '</ul>';
      } else { html += emptyMsg('Nothing noteworthy today.'); }
      html += sectionEnd();

      // Section C — Trends to Watch
      html += sectionStart('C', 'Trends to Watch', 'border-purple-500');
      if (s.trends && s.trends.length) {
        for (var i = 0; i < s.trends.length; i++) {
          html += '<div class="mb-3"><p class="text-sm font-medium">' + esc(s.trends[i].title) + '</p>'
            + '<p class="text-sm text-gray-600">' + esc(s.trends[i].summary) + '</p></div>';
        }
      } else { html += emptyMsg('No emerging patterns detected.'); }
      html += sectionEnd();

      // Section D — Email: Needs Action
      html += sectionStart('D', 'Email: Needs Action', 'border-red-500');
      if (s.emailAction && s.emailAction.length) {
        for (var i = 0; i < s.emailAction.length; i++) {
          var em = s.emailAction[i];
          html += '<div class="flex items-start gap-3 py-2 border-b border-gray-100">'
            + (em.timeSensitive ? '<span class="text-lg flex-shrink-0">⏰</span>' : '<span class="w-5 flex-shrink-0"></span>')
            + '<div class="flex-1 min-w-0">'
            + '<p class="text-sm"><strong>' + esc(em.sender) + '</strong> — ' + esc(em.subject) + '</p>'
            + '<p class="text-sm text-gray-600">' + esc(em.summary) + '</p>'
            + '</div>'
            + (em.outlookUrl ? '<a href="' + esc(em.outlookUrl) + '" target="_blank" class="pill-link flex-shrink-0">Open ↗</a>' : '')
            + '</div>';
        }
      } else { html += emptyMsg('Inbox zero — no action needed.'); }
      html += sectionEnd();

      // Section E — Email: Awareness & Threads (collapsed)
      html += sectionStart('E', 'Email: Awareness & Threads', 'border-orange-400');
      html += '<details><summary class="text-sm font-medium text-gray-600 mb-2">'
        + ((s.emailAwareness || []).length + (s.emailThreads || []).length) + ' items</summary><div class="space-y-3">';
      if (s.emailAwareness && s.emailAwareness.length) {
        html += '<div class="mb-3"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">FYI / Awareness</p>';
        for (var i = 0; i < s.emailAwareness.length; i++) {
          var ea = s.emailAwareness[i];
          html += '<p class="text-sm py-1 border-b border-gray-50"><strong>' + esc(ea.sender) + '</strong>: ' + esc(ea.summary)
            + (ea.outlookUrl ? ' <a href="' + esc(ea.outlookUrl) + '" target="_blank" class="pill-link ml-1">Open ↗</a>' : '')
            + '</p>';
        }
        html += '</div>';
      }
      if (s.emailThreads && s.emailThreads.length) {
        html += '<div><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Threads to Watch</p>';
        for (var i = 0; i < s.emailThreads.length; i++) {
          var et = s.emailThreads[i];
          html += '<p class="text-sm py-1 border-b border-gray-50"><strong>' + esc(et.subject) + '</strong>: ' + esc(et.summary)
            + (et.outlookUrl ? ' <a href="' + esc(et.outlookUrl) + '" target="_blank" class="pill-link ml-1">Open ↗</a>' : '')
            + '</p>';
        }
        html += '</div>';
      }
      html += '</div></details>';
      html += sectionEnd();

      // Section F — Schedule
      html += sectionStart('F', "Today's Schedule + Tomorrow Preview", 'border-green-500');
      if (s.calendarToday && s.calendarToday.length) {
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Today</p>';
        html += '<div class="space-y-2 mb-4">';
        for (var i = 0; i < s.calendarToday.length; i++) {
          var ct = s.calendarToday[i];
          html += '<div class="flex gap-3 text-sm py-1 border-b border-gray-100">'
            + '<span class="font-mono text-gray-500 w-16 flex-shrink-0">' + esc(ct.time) + '</span>'
            + '<div><strong>' + esc(ct.title) + '</strong>'
            + (ct.attendees ? '<span class="text-gray-400 ml-1">(' + esc(ct.attendees) + ')</span>' : '')
            + (ct.prep ? '<p class="text-gray-600 text-xs mt-0.5">📋 ' + esc(ct.prep) + '</p>' : '')
            + '</div></div>';
        }
        html += '</div>';
      } else { html += '<p class="text-sm text-gray-400 italic mb-4">No meetings today.</p>'; }

      if (s.calendarTomorrow && s.calendarTomorrow.length) {
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tomorrow</p>';
        html += '<div class="space-y-2 mb-4">';
        for (var i = 0; i < s.calendarTomorrow.length; i++) {
          var ct = s.calendarTomorrow[i];
          html += '<div class="flex gap-3 text-sm py-1 border-b border-gray-100">'
            + '<span class="font-mono text-gray-500 w-16 flex-shrink-0">' + esc(ct.time) + '</span>'
            + '<div><strong>' + esc(ct.title) + '</strong>'
            + (ct.attendees ? '<span class="text-gray-400 ml-1">(' + esc(ct.attendees) + ')</span>' : '')
            + (ct.prep ? '<p class="text-gray-600 text-xs mt-0.5">📋 ' + esc(ct.prep) + '</p>' : '')
            + '</div></div>';
        }
        html += '</div>';
      }

      if (s.suggestedMeetings && s.suggestedMeetings.length) {
        html += '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Suggested Meetings to Schedule</p>';
        for (var i = 0; i < s.suggestedMeetings.length; i++) {
          var sm = s.suggestedMeetings[i];
          html += '<div class="text-sm py-1 border-b border-gray-100">'
            + '<strong>' + esc(sm.who) + '</strong> — ' + esc(sm.topic)
            + '<span class="text-gray-400 ml-1">(' + esc(sm.duration) + ')</span>'
            + '<p class="text-xs text-gray-500">' + esc(sm.why) + '</p></div>';
        }
      }
      html += sectionEnd();

      // Section G — L10 IDS Suggestions
      html += sectionStart('G', 'L10 IDS Suggestions', 'border-indigo-500');
      html += renderIDS('Executive L10', s.idsExecutive);
      html += renderIDS('MLT L10', s.idsMlt);
      html += renderIDS('PMT L10', s.idsPmt);
      html += sectionEnd();

      // Section H — Headlines
      html += sectionStart('H', 'Headlines', 'border-yellow-500');
      if (s.headlines && s.headlines.length) {
        html += '<div class="space-y-1">';
        for (var i = 0; i < s.headlines.length; i++) {
          html += '<p class="text-sm">💬 <strong>' + esc(s.headlines[i].text) + '</strong>'
            + ' <span class="text-gray-400">— ' + esc(s.headlines[i].context) + '</span></p>';
        }
        html += '</div>';
      } else { html += emptyMsg('No fresh headlines today.'); }
      html += sectionEnd();

      // Section I — Background (collapsed)
      html += sectionStart('I', 'Background / Already Covered', 'border-gray-400');
      html += '<details><summary class="text-sm font-medium text-gray-600 mb-2">'
        + (s.background ? s.background.length : 0) + ' items</summary>';
      if (s.background && s.background.length) {
        for (var i = 0; i < s.background.length; i++) {
          html += '<div class="mb-2"><p class="text-sm font-medium">' + esc(s.background[i].title) + '</p>'
            + '<p class="text-sm text-gray-500">' + esc(s.background[i].summary) + '</p></div>';
        }
      } else { html += emptyMsg('Nothing to carry forward.'); }
      html += '</details>';
      html += sectionEnd();

      // Section J — To-Do List
      html += sectionStart('J', 'To-Do List', 'border-pink-500');
      html += '<div class="no-print flex gap-2 mb-4">'
        + '<input type="text" id="todo-input" placeholder="Add a to-do..." '
        + 'class="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"'
        + ' onkeydown="if(event.key===\'Enter\')addTodo()">'
        + '<button onclick="addTodo()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">Add</button>'
        + '</div>';
      html += '<div id="todos-today"></div>';
      html += '<div id="todos-carried"></div>';
      html += '<details id="todos-completed-section"><summary class="text-sm font-medium text-gray-500 mt-3">Completed</summary>'
        + '<div id="todos-completed"></div></details>';
      html += '<div class="flex gap-3 mt-3 no-print">'
        + '<button onclick="clearCompleted()" class="text-xs text-red-500 hover:text-red-700 transition-colors">Clear Completed</button>'
        + '<button onclick="exportTodos()" class="text-xs text-blue-500 hover:text-blue-700 transition-colors">📋 Export</button>'
        + '</div>';
      html += sectionEnd();

      // Status line
      html += '<div class="text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200 space-y-0.5">';
      var st = d.stats || {};
      html += '<span>✅ Report generated: ' + esc(d.date) + '</span>';
      html += '<span>✅ Web searches: ' + (st.webSearches || 0) + ' queries run</span>';
      html += '<span>✅ Emails scanned: ' + (st.emailsScanned || 0) + ' from last 24h</span>';
      html += '<span>✅ Action emails: ' + (st.actionEmails || 0) + ' items needing reply</span>';
      html += '<span>✅ Calendar: ' + (st.calendarToday || 0) + ' today, ' + (st.calendarTomorrow || 0) + ' tomorrow</span>';
      html += '<span>✅ Suggested meetings: ' + (st.suggestedMeetings || 0) + ' to schedule</span>';
      html += '<span>✅ IDS items: ' + (st.idsExecutive || 0) + ' executive / ' + (st.idsMlt || 0) + ' MLT / ' + (st.idsPmt || 0) + ' PMT</span>';
      html += '<span>✅ To-dos: ' + (st.newTodos || 0) + ' new / ' + (st.carriedForward || 0) + ' carried forward</span>';
      html += '</div>';

      document.getElementById('content').innerHTML = html;
      renderTodos();
    }

    function sectionStart(letter, title, borderColor) {
      return '<section class="mb-2"><h2 class="section-header ' + borderColor + ' text-[#1a2744]">'
        + letter + ' — ' + esc(title) + '</h2>';
    }
    function sectionEnd() { return '</section>'; }
    function emptyMsg(msg) { return '<p class="empty-msg">' + esc(msg) + '</p>'; }

    function renderIDS(label, items) {
      var html = '<div class="mb-3"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">' + esc(label) + '</p>';
      if (items && items.length) {
        for (var i = 0; i < items.length; i++) {
          html += '<p class="text-sm py-0.5">'
            + (items[i].stale ? '🔄 ' : '• ')
            + esc(items[i].issue)
            + ' <span class="text-gray-500">because ' + esc(items[i].because) + '</span></p>';
        }
      } else {
        html += '<p class="text-xs text-gray-400 italic">No suggestions</p>';
      }
      html += '</div>';
      return html;
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
      if (!todayEl) return; // section not rendered yet

      todayEl.innerHTML = todayItems.length
        ? '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Today</p>' + todayItems.map(todoRow).join('')
        : '';
      carriedEl.innerHTML = carriedItems.length
        ? '<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-3">Carried Forward</p>' + carriedItems.map(todoRow).join('')
        : '';
      completedEl.innerHTML = completedItems.length
        ? completedItems.map(function(i) { return todoRow(i, true); }).join('')
        : '<p class="text-xs text-gray-400 italic py-2">None</p>';

      // Update completed section count
      var compSection = document.getElementById('todos-completed-section');
      if (compSection) {
        compSection.querySelector('summary').textContent = 'Completed (' + completedItems.length + ')';
      }
    }

    function todoRow(item, isCompleted) {
      return '<div class="todo-item">'
        + '<input type="checkbox" class="todo-cb no-print" ' + (item.completed ? 'checked' : '') + ' onchange="toggleTodo(\\'' + item.id + '\\')">'
        + '<div class="flex-1 min-w-0">'
        + '<p class="text-sm ' + (isCompleted ? 'line-through text-gray-400' : '') + '">' + esc(item.description) + '</p>'
        + '<p class="text-xs text-gray-400">' + esc(item.source) + ' · ' + esc(item.dateAdded) + '</p>'
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
        btn.textContent = '✓ Copied!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
      });
    }

    // ── Regenerate ─────────────────────────
    async function regenerateBrief() {
      if (!confirm('Generate a new morning brief? This may take several minutes.')) return;
      var btn = document.getElementById('regen-btn');
      btn.textContent = '⟳ Generating...';
      btn.disabled = true;
      btn.classList.add('generating-pulse');
      try {
        await apiFetch('/api/morning-brief/generate', { method: 'POST' });
        // Poll for completion
        pollForBrief();
      } catch (e) {
        btn.textContent = '↻ Regenerate';
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
              btn.textContent = '↻ Regenerate';
              btn.disabled = false;
              btn.classList.remove('generating-pulse');
              await loadTodos();
              renderTodos();
            }
          }
        } catch (e) { /* keep polling */ }
        if (attempts > 120) { // 10 minutes
          clearInterval(poll);
          var btn = document.getElementById('regen-btn');
          btn.textContent = '↻ Regenerate';
          btn.disabled = false;
          btn.classList.remove('generating-pulse');
        }
      }, 5000);
    }

    // ── Init ───────────────────────────────
    (async function() {
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
For EVERY email surfaced, include a direct Outlook Web App link:
\`https://outlook.office365.com/mail/inbox/id/{messageId}\`

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
