(() => {
  'use strict';

  // ---------- config ----------
  // Each event has its own colour. Events created before that stored a calendar id in `cal`;
  // LEGACY maps those ids to the colour they always showed in.
  const COLORS = [
    ['#7c5cff', 'Violet'], ['#2f80ed', 'Blue'], ['#0ea5b7', 'Teal'], ['#20b26b', 'Green'], ['#74b316', 'Lime'],
    ['#d9a20b', 'Gold'], ['#f2994a', 'Orange'], ['#e5484d', 'Red'], ['#eb5a8c', 'Pink'], ['#8b8d98', 'Gray'],
  ];
  const LEGACY = { personal: '#7c5cff', work: '#2f80ed', family: '#20b26b', health: '#f2994a', social: '#eb5a8c' };
  const STORE = 'cal.events.v1';
  const PREFS = 'cal.prefs.v1';
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- date helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
  const sameDay = (a, b) => ymd(a) === ymd(b);
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'am' : 'pm';
    const hh = h % 12 || 12;
    return m ? `${hh}:${pad(m)}${ap}` : `${hh}${ap}`;
  };
  const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);
  const colorOf = (e) => e.color || LEGACY[e.cal] || COLORS[0][0];
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------- storage ----------
  const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  function seed() {
    const t = new Date();
    const d = (n) => ymd(addDays(t, n));
    return [
      { id: uid(), title: 'Team standup', date: d(0), start: '09:30', end: '09:45', color: LEGACY.work, repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] } },
      { id: uid(), title: 'Design review', date: d(0), start: '13:00', end: '14:30', color: LEGACY.work },
      { id: uid(), title: 'Gym', date: d(0), start: '18:00', end: '19:00', color: LEGACY.health },
      { id: uid(), title: 'Lunch with Sam', date: d(1), start: '12:00', end: '13:00', color: LEGACY.social },
      { id: uid(), title: 'Product sync', date: d(1), start: '12:30', end: '13:30', color: LEGACY.work },
      { id: uid(), title: 'Dentist', date: d(2), start: '10:00', end: '11:00', color: LEGACY.health },
      { id: uid(), title: 'Family dinner', date: d(3), start: '19:00', end: '21:00', color: LEGACY.family },
      { id: uid(), title: 'Weekend trip', date: d(5), allDay: true, color: LEGACY.personal },
      { id: uid(), title: 'Quarterly planning', date: d(7), start: '10:00', end: '12:00', color: LEGACY.work },
      { id: uid(), title: 'Book club', date: d(-2), start: '19:30', end: '21:00', color: LEGACY.social },
      { id: uid(), title: 'Morning run', date: d(-1), start: '07:00', end: '07:45', color: LEGACY.health },
    ];
  }

  // ---------- state ----------
  const prefs = load(PREFS, {});
  const state = {
    view: prefs.view || 'month',
    cursor: new Date(),
    miniCursor: new Date(),
    lastColor: prefs.lastColor || COLORS[0][0], // new events start in the colour used last
    events: load(STORE, null) || seed(),
  };
  save(STORE, state.events);
  const persistPrefs = () => save(PREFS, { view: state.view, lastColor: state.lastColor, theme: document.documentElement.dataset.theme });

  // ---------- recurrence ----------
  // A repeating event is stored once, with `repeat: { freq, days?, until? }` (freq: daily | weekly |
  // monthly | yearly; days: weekdays 0–6 for weekly) and `exceptions`: dates of skipped occurrences.
  // Views expand it into occurrences: copies dated to the day they fall on, carrying `occ` so the UI
  // knows which instance was clicked or dragged. Monthly on the 31st skips shorter months.
  function occursOn(e, ds) {
    const r = e.repeat;
    if (!r) return e.date === ds;
    if (ds < e.date || (r.until && ds > r.until) || (e.exceptions || []).includes(ds)) return false;
    const a = parse(e.date), b = parse(ds);
    switch (r.freq) {
      case 'daily': return true;
      case 'weekly': return (r.days && r.days.length ? r.days : [a.getDay()]).includes(b.getDay());
      case 'monthly': return a.getDate() === b.getDate();
      case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
      default: return false;
    }
  }
  const eventsOn = (dateStr) =>
    state.events
      .filter((e) => occursOn(e, dateStr))
      .map((e) => (e.repeat ? { ...e, date: dateStr, occ: dateStr } : e))
      .sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || (a.start || '').localeCompare(b.start || ''));
  const dayDiff = (from, to) => Math.round((parse(to) - parse(from)) / 864e5);

  // ---------- elements ----------
  const $ = (s) => document.querySelector(s);
  const viewEl = $('#view');
  const modal = $('#eventModal');
  const form = $('#eventForm');

  // ---------- theme ----------
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  // Match the phone's status bar / browser chrome to the toolbar colour.
  const syncThemeColor = () => {
    $('#themeColor').content = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  };
  document.documentElement.dataset.theme = prefs.theme || (sysDark ? 'dark' : 'light');
  syncThemeColor();
  $('#themeBtn').onclick = () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
    syncThemeColor();
    persistPrefs();
  };

  // ---------- render: toolbar ----------
  function renderToolbar() {
    const c = state.cursor;
    let title;
    if (state.view === 'month') title = fmt(c, { month: 'long', year: 'numeric' });
    else if (state.view === 'day') title = fmt(c, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    else {
      const s = startOfWeek(c), e = addDays(s, 6);
      title = s.getMonth() === e.getMonth()
        ? `${fmt(s, { month: 'long' })} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
        : `${fmt(s, { month: 'short', day: 'numeric' })} – ${fmt(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    $('#title').textContent = title;
    document.title = `${title} · Calendar`;

    const seg = $('#viewSeg');
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    const active = seg.querySelector('button.active');
    const pill = seg.querySelector('.seg-pill');
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // ---------- render: month ----------
  function renderMonth() {
    const c = state.cursor;
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = startOfWeek(first);
    const today = new Date();
    let html = `<div class="month"><div class="month-dow">${DOW.map((d) => `<div>${d}</div>`).join('')}</div><div class="month-grid">`;
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const ds = ymd(d);
      const evs = eventsOn(ds);
      const cls = ['cell', d.getMonth() !== c.getMonth() && 'out', sameDay(d, today) && 'today', (d.getDay() % 6 === 0) && 'weekend'].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-date="${ds}"><span class="daynum">${d.getDate()}</span>${evs.map(pillHTML).join('')}</div>`;
    }
    html += '</div></div>';
    viewEl.innerHTML = html;
    fitMonthCells();
  }

  const REPEAT_ICON = `<svg class="rep" viewBox="0 0 24 24" width="11" height="11" aria-label="Repeats"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h16M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // data-id points at the stored event; data-occ marks which occurrence of a repeating one this is.
  const evAttrs = (e) => `data-id="${e.id}"${e.occ ? ` data-occ="${e.occ}"` : ''}`;
  const eventOf = (el) => {
    const ev = state.events.find((x) => x.id === el.dataset.id);
    return ev ? { ev, occ: el.dataset.occ || null } : null;
  };

  function pillHTML(e) {
    const c = colorOf(e);
    const rep = e.repeat ? REPEAT_ICON : '';
    if (e.allDay) return `<div class="pill allday" style="--c:${c}" ${evAttrs(e)}><span class="name">${esc(e.title)}</span>${rep}</div>`;
    return `<div class="pill timed" style="--c:${c}" ${evAttrs(e)}><span class="dot"></span><span class="t">${fmtTime(e.start)}</span><span class="name">${esc(e.title)}</span>${rep}</div>`;
  }

  // Collapse overflowing pills into a "+N more" link based on actual cell height.
  function fitMonthCells() {
    viewEl.querySelectorAll('.cell').forEach((cell) => {
      const pills = [...cell.querySelectorAll('.pill')];
      if (!pills.length) return;
      const avail = cell.clientHeight;
      if (cell.scrollHeight <= avail) return;
      const more = document.createElement('div');
      more.className = 'more';
      cell.appendChild(more);
      let hiddenCount = 0;
      for (let i = pills.length - 1; i >= 0 && cell.scrollHeight > avail; i--) {
        pills[i].remove();
        hiddenCount++;
        more.textContent = `+${hiddenCount} more`;
      }
      more.dataset.date = cell.dataset.date;
    });
  }

  // ---------- render: week / day ----------
  function layoutDay(evs) {
    const items = evs
      .map((e) => ({ e, s: toMin(e.start), en: Math.max(toMin(e.end || e.start), toMin(e.start) + 20) }))
      .sort((a, b) => a.s - b.s || b.en - a.en);
    let cluster = [], end = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((it) => {
        let i = cols.findIndex((ce) => ce <= it.s);
        if (i === -1) { i = cols.length; cols.push(0); }
        cols[i] = it.en; it.col = i;
      });
      cluster.forEach((it) => (it.ncol = cols.length));
      cluster = [];
    };
    items.forEach((it) => {
      if (cluster.length && it.s >= end) flush();
      cluster.push(it);
      end = Math.max(end, it.en);
    });
    if (cluster.length) flush();
    return items;
  }

  let lastGridKey = null;
  function renderTimeGrid(days) {
    const today = new Date();
    const cols = days.length;
    let head = `<div class="tg-head"><div></div>`;
    let allday = `<div class="tg-allday"><div class="lbl">all-day</div>`;
    let body = `<div class="tg-body"><div class="tg-body-inner"><div class="hours">`;
    for (let h = 1; h < 24; h++) body += `<span style="top:calc(var(--hour)*${h})">${fmtTime(`${pad(h)}:00`)}</span>`;
    body += `</div>`;

    days.forEach((d) => {
      const ds = ymd(d);
      const isToday = sameDay(d, today);
      const evs = eventsOn(ds);
      head += `<div class="colhead${isToday ? ' today' : ''}" data-goto="${ds}"><div class="dw">${DOW[d.getDay()]}</div><div class="dn">${d.getDate()}</div></div>`;
      allday += `<div class="adcol" data-date="${ds}">${evs.filter((e) => e.allDay).map(pillHTML).join('')}</div>`;
      body += `<div class="daycol${isToday ? ' today' : ''}" data-date="${ds}">`;
      layoutDay(evs.filter((e) => !e.allDay)).forEach(({ e, s, en, col, ncol }) => {
        const c = colorOf(e);
        const w = 100 / ncol;
        const short = en - s < 45;
        body += `<div class="ev" ${evAttrs(e)} style="--c:${c};top:calc(var(--hour)*${s / 60});height:calc(var(--hour)*${(en - s) / 60} - 2px);left:calc(${w * col}% + 2px);width:calc(${w}% - 4px)">
          <div class="ev-title">${esc(e.title)}${e.repeat ? REPEAT_ICON : ''}${short ? ` <span class="ev-time">${fmtTime(e.start)}</span>` : ''}</div>
          ${short ? '' : `<div class="ev-time">${fmtTime(e.start)} – ${fmtTime(e.end || e.start)}</div>`}
          <div class="ev-resize"></div>
        </div>`;
      });
      if (isToday) body += `<div class="now-line" style="top:calc(var(--hour)*${(today.getHours() * 60 + today.getMinutes()) / 60})"></div>`;
      body += `</div>`;
    });
    body += `</div></div>`;
    const prev = viewEl.querySelector('.tg-body');
    const prevTop = prev ? prev.scrollTop : 0;
    viewEl.innerHTML = `<div class="tgrid" style="--cols:${cols}">${head}</div>${allday}</div>${body}</div>`;

    // Keep the scroll position when re-rendering the same range; otherwise scroll to a sensible hour.
    const scroller = viewEl.querySelector('.tg-body');
    const key = `${ymd(days[0])}/${cols}`;
    scroller.style.scrollBehavior = 'auto';
    if (prev && key === lastGridKey) scroller.scrollTop = prevTop;
    else {
      const hourPx = scroller.querySelector('.tg-body-inner').offsetHeight / 24;
      const target = days.some((d) => sameDay(d, today)) ? Math.max(today.getHours() - 2, 0) : 7;
      scroller.scrollTop = target * hourPx;
    }
    scroller.style.scrollBehavior = '';
    lastGridKey = key;
  }

  // ---------- render: sidebar ----------
  function renderMini() {
    const c = state.miniCursor;
    $('#miniTitle').textContent = fmt(c, { month: 'long', year: 'numeric' });
    const start = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
    const today = new Date();
    const wkStart = startOfWeek(state.cursor);
    let html = DOW.map((d) => `<div class="dow">${d[0]}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const ds = ymd(d);
      const inWeek = state.view === 'week' && d >= wkStart && d < addDays(wkStart, 7);
      const cls = [
        d.getMonth() !== c.getMonth() && 'out',
        sameDay(d, today) && 'today',
        sameDay(d, state.cursor) ? 'selected' : inWeek && 'in-range',
        eventsOn(ds).length > 0 && 'has',
      ].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-goto="${ds}">${d.getDate()}</button>`;
    }
    $('#miniGrid').innerHTML = html;
  }

  function renderUpcoming() {
    const now = new Date();
    const nowStr = ymd(now), nowMin = now.getHours() * 60 + now.getMinutes();
    // Walk forward day by day so repeating events contribute their next occurrences.
    const list = [];
    for (let i = 0; i < 366 && list.length < 5; i++) {
      for (const e of eventsOn(ymd(addDays(now, i)))) {
        if (i === 0 && !e.allDay && toMin(e.end || e.start) < nowMin) continue;
        if (list.length < 5) list.push(e);
      }
    }
    if (!list.length) { $('#upcoming').innerHTML = `<li class="empty">Nothing scheduled</li>`; return; }
    const tomorrow = ymd(addDays(now, 1));
    $('#upcoming').innerHTML = list.map((e) => {
      const day = e.date === nowStr ? 'Today' : e.date === tomorrow ? 'Tomorrow' : fmt(parse(e.date), { weekday: 'short', month: 'short', day: 'numeric' });
      const time = e.allDay ? 'All day' : `${fmtTime(e.start)} – ${fmtTime(e.end || e.start)}`;
      return `<li ${evAttrs(e)} style="--c:${colorOf(e)}"><span class="bar"></span><div style="min-width:0"><div class="u-title">${esc(e.title)}${e.repeat ? REPEAT_ICON : ''}</div><div class="u-meta">${day} · ${time}</div></div></li>`;
    }).join('');
  }

  // ---------- render all ----------
  function render(animate = false) {
    renderToolbar();
    if (state.view === 'month') renderMonth();
    else if (state.view === 'week') {
      const s = startOfWeek(state.cursor);
      renderTimeGrid(Array.from({ length: 7 }, (_, i) => addDays(s, i)));
    } else renderTimeGrid([state.cursor]);
    renderMini();
    renderUpcoming();
    if (animate) { viewEl.classList.remove('fade'); void viewEl.offsetWidth; viewEl.classList.add('fade'); }
  }

  // ---------- navigation ----------
  function shift(dir) {
    const c = state.cursor;
    if (state.view === 'month') state.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
    else state.cursor = addDays(c, dir * (state.view === 'week' ? 7 : 1));
    state.miniCursor = new Date(state.cursor);
    render(true);
  }
  function goTo(date, view) {
    state.cursor = date;
    state.miniCursor = new Date(date);
    if (view) { state.view = view; persistPrefs(); }
    render(true);
  }
  function setView(v) { state.view = v; persistPrefs(); render(true); }

  $('#prevBtn').onclick = () => shift(-1);
  $('#nextBtn').onclick = () => shift(1);
  $('#todayBtn').onclick = () => goTo(new Date());
  $('#viewSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); };
  $('#miniPrev').onclick = () => { const m = state.miniCursor; state.miniCursor = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderMini(); };
  $('#miniNext').onclick = () => { const m = state.miniCursor; state.miniCursor = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderMini(); };
  $('#miniGrid').onclick = (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    goTo(parse(b.dataset.goto));
    setSidebar(false);
  };
  $('#upcoming').onclick = (e) => {
    const li = e.target.closest('[data-id]');
    const hit = li && eventOf(li);
    if (!hit) return;
    setSidebar(false);
    openModal(hit.ev, {}, hit.occ);
  };
  // On narrow screens the sidebar is an overlay drawer; the scrim behind it catches taps outside the
  // drawer so they close it instead of landing on the calendar underneath.
  const sidebarOpen = () => $('#sidebar').classList.contains('open');
  function setSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#scrim').classList.toggle('show', open);
  }
  $('#menuBtn').onclick = () => setSidebar(!sidebarOpen());
  $('#sidebarClose').onclick = () => setSidebar(false);
  $('#scrim').onclick = () => setSidebar(false);
  $('#newEventBtn').onclick = () => { setSidebar(false); openModal(null, { date: ymd(state.cursor) }); };

  // ---------- view interactions ----------
  viewEl.addEventListener('click', (e) => {
    if (suppressClick) return;
    const evEl = e.target.closest('[data-id]');
    if (evEl) { const hit = eventOf(evEl); if (hit) openModal(hit.ev, {}, hit.occ); return; }
    const more = e.target.closest('.more');
    if (more) { goTo(parse(more.dataset.date), 'day'); return; }
    const head = e.target.closest('[data-goto]');
    if (head) { goTo(parse(head.dataset.goto), 'day'); return; }
    const cell = e.target.closest('.cell, .adcol');
    if (cell) {
      openModal(null, { date: cell.dataset.date, allDay: cell.classList.contains('adcol') });
    }
  });

  // drag on a day column to create a timed event
  const TOUCH_SLOP = 8; // px a finger may wander before a press counts as a scroll
  let drag = null;
  const snap = (col, clientY) => {
    const r = col.getBoundingClientRect();
    const min = ((clientY - r.top) / r.height) * 1440;
    return Math.min(Math.max(Math.round(min / 15) * 15, 0), 1440);
  };
  viewEl.addEventListener('pointerdown', (e) => {
    const col = e.target.closest('.daycol');
    if (!col || e.target.closest('.ev') || e.button !== 0) return;
    const m = snap(col, e.clientY);
    drag = { col, a: m, b: m + 60, ghost: null, moved: false, touch: e.pointerType !== 'mouse', x0: e.clientX, y0: e.clientY };
    // On touch a swipe here has to scroll the grid, so touch gets tap-to-create only (see pointerup).
    if (drag.touch) return;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'ghost';
    col.appendChild(drag.ghost);
    paintGhost();
    try { col.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  viewEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.touch) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > TOUCH_SLOP) drag = null; // it's a scroll
      return;
    }
    const m = snap(drag.col, e.clientY);
    if (m !== drag.a) { drag.moved = true; drag.b = m; paintGhost(); }
  });
  viewEl.addEventListener('pointercancel', () => {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    drag = null;
  });
  viewEl.addEventListener('pointerup', () => {
    if (!drag) return;
    let { a, b, col, ghost, moved } = drag;
    drag = null;
    if (ghost) ghost.remove();
    if (!moved) { a = Math.floor(a / 60) * 60; b = a + 60; }
    let s = Math.min(a, b), en = Math.max(a, b);
    if (en - s < 15) en = s + 30;
    openModal(null, { date: col.dataset.date, start: fromMin(Math.min(s, 1425)), end: fromMin(Math.min(en, 1439)) });
  });
  function paintGhost() {
    const s = Math.min(drag.a, drag.b), en = Math.max(drag.a, drag.b, s + 15);
    drag.ghost.style.top = `calc(var(--hour)*${s / 60})`;
    drag.ghost.style.height = `calc(var(--hour)*${(en - s) / 60})`;
  }

  // ---------- move / resize existing events ----------
  // Mouse drags start right away. On touch, a swipe scrolls as usual and a long-press "lifts" the event
  // first; the resize handle (touch-action: none) is the exception and drags immediately.
  let evDrag = null;
  let suppressClick = false;
  const DRAG_THRESHOLD = 4;
  const LONG_PRESS = 350;
  const clampEnd = (m) => fromMin(Math.min(m, 1439));
  const q15 = (m) => Math.round(m / 15) * 15;
  const minuteAt = (col, clientY) => { const r = col.getBoundingClientRect(); return ((clientY - r.top) / r.height) * 1440; };
  const under = (x, y, sel) => document.elementsFromPoint(x, y).map((n) => n.closest(sel)).find(Boolean);

  viewEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.ev, .pill');
    const hit = el && eventOf(el);
    if (!hit) return;
    const { ev, occ } = hit;
    const touch = e.pointerType !== 'mouse';
    const resize = !!e.target.closest('.ev-resize');
    const base = {
      ev, occ, el, x0: e.clientX, y0: e.clientY, moved: false, cancelled: false,
      before: { ...ev, date: occ || ev.date }, touch, armed: !touch || resize,
    };
    if (el.classList.contains('ev')) {
      const col = el.closest('.daycol');
      const s = toMin(ev.start);
      const dur = Math.max(toMin(ev.end || ev.start) - s, 15);
      evDrag = { ...base, kind: resize ? 'resize' : 'move', col, s, dur, grab: minuteAt(col, e.clientY) - s };
    } else {
      evDrag = { ...base, kind: 'date', container: el.parentElement };
    }
    if (!evDrag.armed) {
      const d = evDrag;
      d.timer = setTimeout(() => {
        if (evDrag !== d) return;
        d.armed = true;
        d.el.classList.add('lifted');
        try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* haptics are optional */ }
      }, LONG_PRESS);
    }
  });

  // Once an event is lifted, stop the browser from scrolling under the finger.
  viewEl.addEventListener('touchmove', (e) => {
    if ((evDrag && evDrag.armed) || (drag && !drag.touch)) e.preventDefault();
  }, { passive: false });
  viewEl.addEventListener('contextmenu', (e) => { if (evDrag && evDrag.touch) e.preventDefault(); });

  viewEl.addEventListener('pointermove', (e) => {
    const d = evDrag;
    if (!d || d.cancelled) return;
    if (!d.armed) {
      // Moved before the long-press fired: the finger is scrolling, so let it.
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > TOUCH_SLOP) { clearTimeout(d.timer); evDrag = null; }
      return;
    }
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
      d.moved = true;
      // Capture only once dragging starts (capturing earlier retargets plain clicks to the view), and on
      // the view rather than the element so re-parenting the element mid-drag doesn't drop capture.
      try { viewEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone; drag still works without capture */ }
      d.el.classList.add('dragging');
      document.body.classList.add(d.kind === 'resize' ? 'resizing' : 'grabbing');
    }

    if (d.kind === 'date') {
      const target = under(e.clientX, e.clientY, state.view === 'month' ? '.cell' : '.adcol');
      if (target && target !== d.container) {
        d.container.classList.remove('drop-target');
        d.container = target;
        target.insertBefore(d.el, target.querySelector('.more'));
      }
      d.container.classList.add('drop-target');
      return;
    }

    if (d.kind === 'move') {
      const col = under(e.clientX, e.clientY, '.daycol') || d.col;
      if (col !== d.col) { col.appendChild(d.el); d.col = col; }
      d.s = Math.min(Math.max(q15(minuteAt(col, e.clientY) - d.grab), 0), 1440 - d.dur);
    } else {
      d.dur = Math.min(Math.max(q15(minuteAt(d.col, e.clientY)) - d.s, 15), 1440 - d.s);
    }
    paintEv(d);
  });

  function paintEv(d) {
    const st = d.el.style;
    st.top = `calc(var(--hour)*${d.s / 60})`;
    st.height = `calc(var(--hour)*${d.dur / 60} - 2px)`;
    if (d.kind === 'move') { st.left = '2px'; st.width = 'calc(100% - 4px)'; }
    const t = d.el.querySelector('.ev-time');
    if (t) t.textContent = `${fmtTime(fromMin(d.s))} – ${fmtTime(clampEnd(d.s + d.dur))}`;
  }

  function finishEvDrag() {
    const d = evDrag;
    if (!d) return;
    evDrag = null;
    clearTimeout(d.timer);
    d.el.classList.remove('lifted');
    document.body.classList.remove('grabbing', 'resizing');
    const longPressOnly = d.touch && d.armed && !d.moved;
    if (!d.moved && !longPressOnly) return;
    // The click that follows pointerup must not open the editor.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (longPressOnly) return;
    if (!d.cancelled) {
      const next = d.kind === 'date'
        ? { date: d.container.dataset.date }
        : { date: d.col.dataset.date, start: fromMin(d.s), end: clampEnd(d.s + d.dur) };
      if (Object.keys(next).some((k) => next[k] !== d.before[k])) applyMove(d, next);
    }
    render();
  }

  // A standalone (non-repeating) copy of a series, used when one occurrence is changed on its own.
  const detach = (series, fields) => {
    const { repeat, exceptions, ...rest } = series;
    return { ...rest, id: uid(), ...fields };
  };

  function applyMove(d, next) {
    const verb = d.kind === 'resize' ? 'Resized' : 'Moved';
    if (d.occ) {
      // Dragging one occurrence of a repeating event moves only that one: the series skips that date
      // and a standalone copy takes its new place.
      const series = d.ev;
      const prevEx = series.exceptions || [];
      const single = detach(series, next);
      series.exceptions = [...prevEx, d.occ];
      state.events.push(single);
      changed(series);
      changed(single);
      showUndo(moveMsg(verb, single), () => {
        series.exceptions = prevEx;
        state.events = state.events.filter((x) => x !== single);
        changed(series);
        removed(single.id);
      });
    } else {
      const ev = d.ev, before = d.before;
      Object.assign(ev, next);
      changed(ev);
      showUndo(moveMsg(verb, ev), () => { Object.assign(ev, before); changed(ev); });
    }
  }
  viewEl.addEventListener('pointerup', finishEvDrag);
  viewEl.addEventListener('pointercancel', () => { if (evDrag) evDrag.cancelled = true; finishEvDrag(); });

  // ---------- undo toast ----------
  let toastTimer;
  const fmtDay = (ds) => fmt(parse(ds), { weekday: 'short', month: 'short', day: 'numeric' });
  function moveMsg(verb, ev) {
    const to = verb === 'Resized'
      ? `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`
      : ev.allDay ? fmtDay(ev.date) : `${fmtDay(ev.date)}, ${fmtTime(ev.start)}`;
    return `${verb} “${ev.title}” to ${to}`;
  }
  function showUndo(msg, undo) {
    $('#toastMsg').textContent = msg;
    const t = $('#toast');
    t.classList.add('show');
    $('#toastUndo').onclick = () => {
      undo();
      render();
      t.classList.remove('show');
    };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  // ---------- modal ----------
  let editing = null;
  let editingOcc = null; // which occurrence was opened, for repeating events
  $('#swatches').innerHTML = COLORS.map(([c, name]) =>
    `<label class="swatch" style="--c:${c}" title="${name}"><input type="radio" name="color" value="${c}" aria-label="${name}" /><i></i></label>`).join('');
  $('#weekdays').innerHTML = DOW.map((d, i) =>
    `<label class="wd" title="${d}"><input type="checkbox" name="wd" value="${i}" /><span>${d[0]}</span></label>`).join('');

  const syncAllDay = () => $('.times').classList.toggle('hidden', form.allDay.checked);
  form.allDay.onchange = syncAllDay;
  form.start.onchange = () => {
    if (form.end.value && toMin(form.end.value) > toMin(form.start.value)) return;
    form.end.value = fromMin(Math.min(toMin(form.start.value) + 60, 1439));
  };

  // --- repeat controls ---
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const wdBoxes = () => [...form.querySelectorAll('input[name=wd]')];
  const checkedDays = () => wdBoxes().filter((b) => b.checked).map((b) => Number(b.value));
  const setDays = (days) => wdBoxes().forEach((b) => { b.checked = days.includes(Number(b.value)); });

  function syncRepeatUI() {
    const d = form.date.value ? parse(form.date.value) : new Date();
    const opt = (v) => form.repeat.querySelector(`option[value="${v}"]`);
    opt('weekly').textContent = `Weekly on ${fmt(d, { weekday: 'long' })}`;
    opt('monthly').textContent = `Monthly on the ${ordinal(d.getDate())}`;
    opt('yearly').textContent = `Yearly on ${fmt(d, { month: 'short', day: 'numeric' })}`;
    const v = form.repeat.value;
    if (v === 'weekly' && checkedDays().length > 1) opt('weekly').textContent = 'Weekly on selected days';
    $('#weekdays').hidden = v !== 'weekly';
    $('#untilField').hidden = !v;
  }
  form.repeat.onchange = () => {
    if (form.repeat.value === 'weekly' && !checkedDays().length) setDays([parse(form.date.value).getDay()]);
    syncRepeatUI();
  };
  let lastFormDate = '';
  form.date.addEventListener('change', () => {
    // Moving the date moves the selected weekdays with it (Mon/Wed/Fri moved a day → Tue/Thu/Sat).
    if (form.repeat.value === 'weekly' && form.date.value && lastFormDate) {
      const shift = ((dayDiff(lastFormDate, form.date.value) % 7) + 7) % 7;
      setDays(checkedDays().map((d) => (d + shift) % 7));
    }
    if (form.date.value) lastFormDate = form.date.value;
    syncRepeatUI();
  });
  $('#weekdays').onchange = () => { if (!checkedDays().length) setDays([parse(form.date.value).getDay()]); syncRepeatUI(); };

  function writeRepeat(r, dateStr) {
    const isWeekdays = r && r.freq === 'weekly' && r.days && sameSet(r.days, WEEKDAYS);
    form.repeat.value = !r ? '' : isWeekdays ? 'weekdays' : r.freq;
    setDays(r && r.freq === 'weekly' && r.days && r.days.length ? r.days : [parse(dateStr).getDay()]);
    form.until.value = (r && r.until) || '';
    lastFormDate = dateStr;
    syncRepeatUI();
  }
  function readRepeat() {
    const v = form.repeat.value;
    if (!v) return null;
    const r = { freq: v === 'weekdays' ? 'weekly' : v };
    if (v === 'weekdays') r.days = WEEKDAYS;
    if (v === 'weekly') r.days = checkedDays().length ? checkedDays() : [parse(form.date.value).getDay()];
    if (form.until.value && form.until.value >= form.date.value) r.until = form.until.value;
    return r;
  }

  // --- "this event or all events?" prompt for repeating events ---
  // Resolves to 'this', 'all' or null (cancelled). Buttons resolve directly rather than through the
  // dialog's close event, which isn't reliably delivered for a dialog stacked on another.
  const scopeModal = $('#scopeModal');
  let scopeResolve = null;
  function askScope(title) {
    $('#scopeTitle').textContent = title;
    scopeModal.showModal();
    return new Promise((resolve) => { scopeResolve = resolve; });
  }
  function endScope(choice) {
    if (scopeModal.open) scopeModal.close();
    const resolve = scopeResolve;
    scopeResolve = null;
    if (resolve) resolve(choice || null);
  }
  scopeModal.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => endScope(b.dataset.scope); });
  scopeModal.addEventListener('cancel', (e) => { e.preventDefault(); endScope(null); }); // Esc
  scopeModal.addEventListener('click', (e) => { if (e.target === scopeModal) endScope(null); });

  function openModal(ev, defaults = {}, occ = null) {
    editing = ev || null;
    editingOcc = ev && ev.repeat ? occ || ev.date : null;
    const now = new Date();
    const nextHour = fromMin(Math.min((now.getHours() + 1) * 60, 1380));
    const d = ev || {
      title: '', date: ymd(state.cursor), allDay: false,
      start: nextHour, end: fromMin(toMin(nextHour) + 60), color: state.lastColor, notes: '', ...defaults,
    };
    form.title.value = d.title;
    form.date.value = editingOcc || d.date;
    form.allDay.checked = !!d.allDay;
    form.start.value = d.start || nextHour;
    form.end.value = d.end || fromMin(toMin(form.start.value) + 60);
    form.notes.value = d.notes || '';
    const swatch = form.querySelector(`input[name=color][value="${colorOf(d)}"]`) || form.querySelector('input[name=color]');
    swatch.checked = true;
    writeRepeat(d.repeat, form.date.value);
    $('#deleteBtn').style.visibility = ev ? 'visible' : 'hidden';
    syncAllDay();
    modal.showModal();
    form.title.focus();
  }
  const closeModal = () => modal.close();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const allDay = form.allDay.checked;
    let start = form.start.value, end = form.end.value;
    if (!allDay && end && toMin(end) <= toMin(start)) end = fromMin(Math.min(toMin(start) + 30, 1439));
    const data = {
      title: form.title.value.trim() || 'Untitled',
      date: form.date.value,
      allDay,
      start: allDay ? '' : start,
      end: allDay ? '' : end,
      color: form.color.value,
      notes: form.notes.value.trim(),
    };
    state.lastColor = data.color;
    persistPrefs();
    const repeat = readRepeat();
    const ev = editing;

    if (ev && ev.repeat) {
      const scope = await askScope('Save changes to a repeating event');
      if (!scope) return; // keep the form open
      if (scope === 'this') {
        // Change just this occurrence: skip it in the series and save a standalone copy.
        const single = detach(ev, data);
        delete single.cal;
        ev.exceptions = [...(ev.exceptions || []), editingOcc];
        state.events.push(single);
        changed(ev);
        changed(single);
      } else {
        // Change the whole series. Moving this occurrence's date shifts the series by the same amount.
        const seriesStart = ymd(addDays(parse(ev.date), dayDiff(editingOcc, data.date)));
        Object.assign(ev, data, { date: seriesStart });
        delete ev.cal;
        if (repeat) ev.repeat = repeat;
        else { delete ev.repeat; delete ev.exceptions; }
        changed(ev);
      }
    } else {
      const target = ev || { id: uid() };
      Object.assign(target, data);
      delete target.cal;
      if (repeat) target.repeat = repeat;
      else delete target.repeat;
      if (!ev) state.events.push(target);
      changed(target);
    }
    closeModal();
    render();
  });

  $('#deleteBtn').onclick = async () => {
    const ev = editing, occ = editingOcc;
    if (!ev) return;
    if (ev.repeat) {
      const scope = await askScope('Delete a repeating event');
      if (!scope) return;
      if (scope === 'this') {
        const prevEx = ev.exceptions || [];
        ev.exceptions = [...prevEx, occ];
        changed(ev);
        closeModal();
        render();
        showUndo(`Deleted “${ev.title}” on ${fmtDay(occ)}`, () => { ev.exceptions = prevEx; changed(ev); });
        return;
      }
    }
    state.events = state.events.filter((x) => x !== ev);
    removed(ev.id);
    closeModal();
    render();
    showUndo(`Deleted “${ev.title}”`, () => { state.events.push(ev); changed(ev); });
  };
  $('#cancelBtn').onclick = closeModal;
  $('#closeModal').onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // ---------- sync ----------
  // Events always live in localStorage, so the app works offline. With sync set up, local changes are
  // queued in `pending` and pushed to /api/events, and other devices' changes are pulled on load, when
  // the tab becomes visible, when the network comes back and every 30s. The last write to reach the
  // server wins; an unsent local change always beats an incoming one.
  const SYNC = 'cal.sync.v1';
  const PENDING = 'cal.pending.v1';
  const CHUNK = 200;
  const syncModal = $('#syncModal');
  const sync = { cfg: load(SYNC, null), pending: load(PENDING, {}), status: 'off', lastOk: 0, running: false, again: false };

  function changed(ev) {
    save(STORE, state.events);
    queue({ id: ev.id, deleted: false, data: { ...ev } });
  }
  function removed(id) {
    save(STORE, state.events);
    queue({ id, deleted: true });
  }
  let pushTimer;
  function queue(change) {
    if (!sync.cfg) return;
    sync.pending[change.id] = change;
    save(PENDING, sync.pending);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 400);
  }

  class SyncError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
  async function api(method, query = '', body) {
    let res;
    try {
      res = await fetch(`/api/events${query}`, {
        method,
        headers: { authorization: `Bearer ${sync.cfg.password}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new SyncError('offline'); }
    if (res.status === 401) throw new SyncError('unauthorized');
    if (!res.ok) throw new SyncError('error'); // 503 = not configured, 404 = API not deployed
    return res.json();
  }

  async function syncNow() {
    if (!sync.cfg) return setSync('off');
    if (sync.running) { sync.again = true; return; }
    sync.running = true;
    setSync('syncing');
    try {
      const batch = Object.values(sync.pending);
      for (let i = 0; i < batch.length; i += CHUNK) {
        const part = batch.slice(i, i + CHUNK);
        await api('POST', '', { changes: part });
        // Only clear entries that weren't changed again while the request was in flight.
        part.forEach((c) => { if (sync.pending[c.id] === c) delete sync.pending[c.id]; });
        save(PENDING, sync.pending);
      }
      await pull();
      setSync('ok');
    } catch (err) {
      setSync(err.kind || 'error');
    } finally {
      sync.running = false;
      if (sync.again) { sync.again = false; syncNow(); }
    }
  }

  async function pull() {
    // Skip while an event is being edited or dragged; the next round picks the changes up.
    if (modal.open || evDrag) return;
    // A few seconds of overlap guards against writes that commit slightly out of order.
    const res = await api('GET', `?since=${Math.max(sync.cfg.cursor - 5000, 0)}`);
    let dirty = false;
    for (const c of res.changes) {
      if (sync.pending[c.id]) continue;
      const i = state.events.findIndex((e) => e.id === c.id);
      if (c.deleted) {
        if (i >= 0) { state.events.splice(i, 1); dirty = true; }
      } else if (i < 0) {
        state.events.push(c.data); dirty = true;
      } else if (JSON.stringify(state.events[i]) !== JSON.stringify(c.data)) {
        // Update in place so references held elsewhere (undo toast) stay valid.
        const ev = state.events[i];
        Object.keys(ev).forEach((k) => delete ev[k]);
        Object.assign(ev, c.data);
        dirty = true;
      }
    }
    sync.cfg.cursor = Math.max(sync.cfg.cursor, res.cursor);
    save(SYNC, sync.cfg);
    if (dirty) { save(STORE, state.events); render(); }
  }

  async function connect(password) {
    sync.cfg = { password, cursor: 0 };
    sync.pending = {};
    const res = await api('GET', '?since=0'); // throws on a wrong password or missing setup
    const live = res.changes.filter((c) => !c.deleted).map((c) => c.data);
    if (live.length) {
      // The cloud already has a calendar: this device switches to it.
      state.events = live;
      save(STORE, state.events);
    } else {
      // First device: upload what's here.
      state.events.forEach((ev) => { sync.pending[ev.id] = { id: ev.id, deleted: false, data: { ...ev } }; });
    }
    sync.cfg.cursor = res.cursor;
    save(SYNC, sync.cfg);
    save(PENDING, sync.pending);
    render();
    await syncNow();
  }

  function disconnect() {
    sync.cfg = null;
    sync.pending = {};
    try { localStorage.removeItem(SYNC); localStorage.removeItem(PENDING); } catch { /* ignore */ }
    setSync('off');
  }

  const SYNC_TEXT = {
    off: 'Sync is off. Events are saved only in this browser.',
    syncing: 'Syncing…',
    offline: 'Offline. Changes are saved here and will sync when you reconnect.',
    unauthorized: 'The sync password was rejected. Turn sync off and reconnect.',
    error: 'Sync isn’t reachable right now. Changes are saved here.',
  };
  const syncText = () => sync.status === 'ok'
    ? `Synced at ${new Date(sync.lastOk).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : SYNC_TEXT[sync.status];

  function setSync(status) {
    sync.status = status;
    if (status === 'ok') sync.lastOk = Date.now();
    const btn = $('#syncBtn');
    btn.dataset.status = status;
    btn.title = syncText();
    if (syncModal.open) fillSyncModal();
  }
  function fillSyncModal() {
    $('#syncConnect').hidden = !!sync.cfg;
    $('#syncConnected').hidden = !sync.cfg;
    $('#syncState').textContent = syncText();
    $('#syncState').dataset.status = sync.status;
  }

  $('#syncBtn').onclick = () => {
    $('#syncError').textContent = '';
    fillSyncModal();
    syncModal.showModal();
    if (!sync.cfg) $('#syncPassword').focus();
  };
  $('#syncForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#syncPassword').value;
    if (!pw) return;
    const btn = $('#syncConnectBtn');
    btn.disabled = true;
    $('#syncError').textContent = '';
    try {
      await connect(pw);
      $('#syncPassword').value = '';
    } catch (err) {
      disconnect();
      $('#syncError').textContent = {
        unauthorized: 'Wrong password.',
        offline: 'You’re offline. Try again when connected.',
      }[err.kind] || 'Couldn’t reach sync. Is it set up in Cloudflare?';
    } finally {
      btn.disabled = false;
      fillSyncModal();
    }
  });
  $('#syncNowBtn').onclick = syncNow;
  $('#syncOffBtn').onclick = () => { disconnect(); fillSyncModal(); };
  $('#syncClose').onclick = () => syncModal.close();
  syncModal.addEventListener('click', (e) => { if (e.target === syncModal) syncModal.close(); });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', syncNow);
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000);

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && evDrag && evDrag.moved) {
      evDrag.cancelled = true;
      document.body.classList.remove('grabbing', 'resizing');
      render();
      return;
    }
    if (modal.open || syncModal.open || scopeModal.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && sidebarOpen()) { setSidebar(false); return; }
    if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'j') shift(-1);
    else if (k === 'arrowright' || k === 'k') shift(1);
    else if (k === 't') goTo(new Date());
    else if (k === 'm') setView('month');
    else if (k === 'w') setView('week');
    else if (k === 'd') setView('day');
    else if (k === 'n' || k === 'c') { e.preventDefault(); openModal(null, { date: ymd(state.cursor) }); }
    else return;
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => render(), 120); });
  setInterval(() => { if (state.view !== 'month') { const nl = viewEl.querySelector('.now-line'); if (nl) { const n = new Date(); nl.style.top = `calc(var(--hour)*${(n.getHours() * 60 + n.getMinutes()) / 60})`; } } renderUpcoming(); }, 60000);

  render();
  syncNow();

  // Offline support / installable app. Service workers need HTTPS (localhost is allowed for testing).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
