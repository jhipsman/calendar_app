(() => {
  'use strict';

  // ---------- config ----------
  const CALENDARS = [
    { id: 'personal', name: 'Personal', color: '#7c5cff' },
    { id: 'work', name: 'Work', color: '#2f80ed' },
    { id: 'family', name: 'Family', color: '#20b26b' },
    { id: 'health', name: 'Health', color: '#f2994a' },
    { id: 'social', name: 'Social', color: '#eb5a8c' },
  ];
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
  const calOf = (id) => CALENDARS.find((c) => c.id === id) || CALENDARS[0];
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------- storage ----------
  const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  function seed() {
    const t = new Date();
    const d = (n) => ymd(addDays(t, n));
    return [
      { id: uid(), title: 'Team standup', date: d(0), start: '09:30', end: '09:45', cal: 'work' },
      { id: uid(), title: 'Design review', date: d(0), start: '13:00', end: '14:30', cal: 'work' },
      { id: uid(), title: 'Gym', date: d(0), start: '18:00', end: '19:00', cal: 'health' },
      { id: uid(), title: 'Lunch with Sam', date: d(1), start: '12:00', end: '13:00', cal: 'social' },
      { id: uid(), title: 'Product sync', date: d(1), start: '12:30', end: '13:30', cal: 'work' },
      { id: uid(), title: 'Dentist', date: d(2), start: '10:00', end: '11:00', cal: 'health' },
      { id: uid(), title: 'Family dinner', date: d(3), start: '19:00', end: '21:00', cal: 'family' },
      { id: uid(), title: 'Weekend trip', date: d(5), allDay: true, cal: 'personal' },
      { id: uid(), title: 'Quarterly planning', date: d(7), start: '10:00', end: '12:00', cal: 'work' },
      { id: uid(), title: 'Book club', date: d(-2), start: '19:30', end: '21:00', cal: 'social' },
      { id: uid(), title: 'Morning run', date: d(-1), start: '07:00', end: '07:45', cal: 'health' },
    ];
  }

  // ---------- state ----------
  const prefs = load(PREFS, {});
  const state = {
    view: prefs.view || 'month',
    cursor: new Date(),
    miniCursor: new Date(),
    hidden: new Set(prefs.hidden || []),
    events: load(STORE, null) || seed(),
  };
  save(STORE, state.events);
  const persistPrefs = () => save(PREFS, { view: state.view, hidden: [...state.hidden], theme: document.documentElement.dataset.theme });

  const visible = () => state.events.filter((e) => !state.hidden.has(e.cal));
  const eventsOn = (dateStr) =>
    visible()
      .filter((e) => e.date === dateStr)
      .sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || (a.start || '').localeCompare(b.start || ''));

  // ---------- elements ----------
  const $ = (s) => document.querySelector(s);
  const viewEl = $('#view');
  const modal = $('#eventModal');
  const form = $('#eventForm');

  // ---------- theme ----------
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = prefs.theme || (sysDark ? 'dark' : 'light');
  $('#themeBtn').onclick = () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
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

  function pillHTML(e) {
    const c = calOf(e.cal).color;
    if (e.allDay) return `<div class="pill allday" style="--c:${c}" data-id="${e.id}"><span class="name">${esc(e.title)}</span></div>`;
    return `<div class="pill timed" style="--c:${c}" data-id="${e.id}"><span class="dot"></span><span class="t">${fmtTime(e.start)}</span><span class="name">${esc(e.title)}</span></div>`;
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
        const c = calOf(e.cal).color;
        const w = 100 / ncol;
        const short = en - s < 45;
        body += `<div class="ev" data-id="${e.id}" style="--c:${c};top:calc(var(--hour)*${s / 60});height:calc(var(--hour)*${(en - s) / 60} - 2px);left:calc(${w * col}% + 2px);width:calc(${w}% - 4px)">
          <div class="ev-title">${esc(e.title)}${short ? ` <span class="ev-time">${fmtTime(e.start)}</span>` : ''}</div>
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
    const dates = new Set(visible().map((e) => e.date));
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
        dates.has(ds) && 'has',
      ].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-goto="${ds}">${d.getDate()}</button>`;
    }
    $('#miniGrid').innerHTML = html;
  }

  function renderCalList() {
    const check = `<svg viewBox="0 0 24 24" width="10" height="10"><path d="M5 12l5 5L20 7" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    $('#calList').innerHTML = CALENDARS.map((c) => `
      <li><label style="--c:${c.color}">
        <input type="checkbox" data-cal="${c.id}" ${state.hidden.has(c.id) ? '' : 'checked'} />
        <span class="cal-check">${check}</span>${c.name}
      </label></li>`).join('');
  }

  function renderUpcoming() {
    const now = new Date();
    const nowStr = ymd(now), nowMin = now.getHours() * 60 + now.getMinutes();
    const list = visible()
      .filter((e) => e.date > nowStr || (e.date === nowStr && (e.allDay || toMin(e.end || e.start) >= nowMin)))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.allDay ? -1 : b.allDay ? 1 : a.start.localeCompare(b.start)))
      .slice(0, 5);
    if (!list.length) { $('#upcoming').innerHTML = `<li class="empty">Nothing scheduled</li>`; return; }
    const tomorrow = ymd(addDays(now, 1));
    $('#upcoming').innerHTML = list.map((e) => {
      const day = e.date === nowStr ? 'Today' : e.date === tomorrow ? 'Tomorrow' : fmt(parse(e.date), { weekday: 'short', month: 'short', day: 'numeric' });
      const time = e.allDay ? 'All day' : `${fmtTime(e.start)} – ${fmtTime(e.end || e.start)}`;
      return `<li data-id="${e.id}" style="--c:${calOf(e.cal).color}"><span class="bar"></span><div style="min-width:0"><div class="u-title">${esc(e.title)}</div><div class="u-meta">${day} · ${time}</div></div></li>`;
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
    renderCalList();
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
    $('#sidebar').classList.remove('open');
  };
  $('#calList').onchange = (e) => {
    const id = e.target.dataset.cal;
    e.target.checked ? state.hidden.delete(id) : state.hidden.add(id);
    persistPrefs();
    render();
  };
  $('#upcoming').onclick = (e) => {
    const li = e.target.closest('[data-id]');
    if (li) openModal(state.events.find((x) => x.id === li.dataset.id));
  };
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#newEventBtn').onclick = () => { $('#sidebar').classList.remove('open'); openModal(null, { date: ymd(state.cursor) }); };

  // ---------- view interactions ----------
  viewEl.addEventListener('click', (e) => {
    if (suppressClick) return;
    const evEl = e.target.closest('[data-id]');
    if (evEl) { openModal(state.events.find((x) => x.id === evEl.dataset.id)); return; }
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
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    col.appendChild(ghost);
    drag = { col, a: m, b: m + 60, ghost, moved: false };
    paintGhost();
    col.setPointerCapture(e.pointerId);
  });
  viewEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const m = snap(drag.col, e.clientY);
    if (m !== drag.a) { drag.moved = true; drag.b = m; paintGhost(); }
  });
  viewEl.addEventListener('pointerup', () => {
    if (!drag) return;
    let { a, b, col, ghost, moved } = drag;
    drag = null;
    ghost.remove();
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
  let evDrag = null;
  let suppressClick = false;
  const DRAG_THRESHOLD = 4;
  const clampEnd = (m) => fromMin(Math.min(m, 1439));
  const q15 = (m) => Math.round(m / 15) * 15;
  const minuteAt = (col, clientY) => { const r = col.getBoundingClientRect(); return ((clientY - r.top) / r.height) * 1440; };
  const under = (x, y, sel) => document.elementsFromPoint(x, y).map((n) => n.closest(sel)).find(Boolean);

  viewEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.ev, .pill');
    const ev = el && state.events.find((x) => x.id === el.dataset.id);
    if (!ev) return;
    const base = { ev, el, x0: e.clientX, y0: e.clientY, moved: false, cancelled: false, before: { ...ev } };
    if (el.classList.contains('ev')) {
      const col = el.closest('.daycol');
      const s = toMin(ev.start);
      const dur = Math.max(toMin(ev.end || ev.start) - s, 15);
      evDrag = { ...base, kind: e.target.closest('.ev-resize') ? 'resize' : 'move', col, s, dur, grab: minuteAt(col, e.clientY) - s };
    } else {
      evDrag = { ...base, kind: 'date', container: el.parentElement };
    }
  });

  viewEl.addEventListener('pointermove', (e) => {
    const d = evDrag;
    if (!d || d.cancelled) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
      d.moved = true;
      // Capture only once dragging starts (capturing earlier retargets plain clicks to the view), and on
      // the view rather than the element so re-parenting the element mid-drag doesn't drop capture.
      viewEl.setPointerCapture(e.pointerId);
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
    document.body.classList.remove('grabbing', 'resizing');
    if (!d.moved) return;
    // The click that follows pointerup must not open the editor.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (!d.cancelled) {
      if (d.kind === 'date') d.ev.date = d.container.dataset.date;
      else {
        d.ev.date = d.col.dataset.date;
        d.ev.start = fromMin(d.s);
        d.ev.end = clampEnd(d.s + d.dur);
      }
      if (['date', 'start', 'end'].some((k) => d.ev[k] !== d.before[k])) {
        save(STORE, state.events);
        showUndo(d.ev, d.before, d.kind === 'resize' ? 'Resized' : 'Moved');
      }
    }
    render();
  }
  viewEl.addEventListener('pointerup', finishEvDrag);
  viewEl.addEventListener('pointercancel', () => { if (evDrag) evDrag.cancelled = true; finishEvDrag(); });

  // ---------- undo toast ----------
  let toastTimer;
  function showUndo(ev, before, verb) {
    const day = fmt(parse(ev.date), { weekday: 'short', month: 'short', day: 'numeric' });
    const msg = verb === 'Resized'
      ? `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`
      : ev.allDay ? day : `${day}, ${fmtTime(ev.start)}`;
    $('#toastMsg').textContent = `${verb} “${ev.title}” to ${msg}`;
    const t = $('#toast');
    t.classList.add('show');
    $('#toastUndo').onclick = () => {
      Object.assign(ev, before);
      save(STORE, state.events);
      render();
      t.classList.remove('show');
    };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  // ---------- modal ----------
  let editing = null;
  $('#swatches').innerHTML = CALENDARS.map((c) =>
    `<label class="swatch" style="--c:${c.color}"><input type="radio" name="cal" value="${c.id}" /><i></i>${c.name}</label>`).join('');

  const syncAllDay = () => $('.times').classList.toggle('hidden', form.allDay.checked);
  form.allDay.onchange = syncAllDay;
  form.start.onchange = () => {
    if (form.end.value && toMin(form.end.value) > toMin(form.start.value)) return;
    form.end.value = fromMin(Math.min(toMin(form.start.value) + 60, 1439));
  };

  function openModal(ev, defaults = {}) {
    editing = ev || null;
    const now = new Date();
    const nextHour = fromMin(Math.min((now.getHours() + 1) * 60, 1380));
    const d = ev || {
      title: '', date: ymd(state.cursor), allDay: false,
      start: nextHour, end: fromMin(toMin(nextHour) + 60), cal: 'personal', notes: '', ...defaults,
    };
    form.title.value = d.title;
    form.date.value = d.date;
    form.allDay.checked = !!d.allDay;
    form.start.value = d.start || nextHour;
    form.end.value = d.end || fromMin(toMin(form.start.value) + 60);
    form.notes.value = d.notes || '';
    form.querySelector(`input[name=cal][value=${d.cal || 'personal'}]`).checked = true;
    $('#deleteBtn').style.visibility = ev ? 'visible' : 'hidden';
    syncAllDay();
    modal.showModal();
    form.title.focus();
  }
  const closeModal = () => modal.close();

  form.addEventListener('submit', (e) => {
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
      cal: form.cal.value,
      notes: form.notes.value.trim(),
    };
    if (editing) Object.assign(editing, data);
    else state.events.push({ id: uid(), ...data });
    save(STORE, state.events);
    closeModal();
    render();
  });
  $('#deleteBtn').onclick = () => {
    if (!editing) return;
    state.events = state.events.filter((x) => x !== editing);
    save(STORE, state.events);
    closeModal();
    render();
  };
  $('#cancelBtn').onclick = closeModal;
  $('#closeModal').onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && evDrag && evDrag.moved) {
      evDrag.cancelled = true;
      document.body.classList.remove('grabbing', 'resizing');
      render();
      return;
    }
    if (modal.open || e.metaKey || e.ctrlKey || e.altKey) return;
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
})();
