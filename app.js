'use strict';

// Мини-приложение ГПиАС: календарь (поездки из реестра + встречи) и задачи.
// Данные отдаёт бэкенд на Apps Script (config.js → API_URL); с ?mock в адресе работает на тестовых данных.

const tg = window.Telegram && window.Telegram.WebApp;
const MOCK = new URLSearchParams(location.search).has('mock');

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const STATUSES = [['todo', 'К выполнению'], ['doing', 'В работе'], ['done', 'Готово']];
const AVATAR_COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774', '#5a9ee0'];
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const state = {
  tab: 'calendar',
  calMode: 'month',
  month: monthStart(todayKey()),
  selected: todayKey(),
  onlyMine: false,
  taskFilter: 'mine',
  showDone: false,
  me: null,
  people: [],
  trips: [],
  meetings: [],
  tasks: [],
};

const $ = sel => document.querySelector(sel);
let onSheetClose = null;

init();

// ---------- Запуск и API ----------

async function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    document.documentElement.dataset.scheme = tg.colorScheme;
    tg.onEvent('themeChanged', () => { document.documentElement.dataset.scheme = tg.colorScheme; });
  }
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  if (MOCK) await loadScript('mock.js');
  await load();
}

async function load() {
  $('#view').innerHTML = '<div class="center"><div class="spinner"></div></div>';
  try {
    Object.assign(state, await api('bootstrap'));
    render();
  } catch (e) {
    $('#view').innerHTML = `<div class="center"><p>${esc(e.message)}</p>
      <button class="btn primary" data-action="reload" style="width:auto;padding:10px 22px">Повторить</button></div>`;
  }
}

async function api(action, payload = {}) {
  if (MOCK) return window.mockApi(action, payload);
  const url = (window.APP_CONFIG || {}).API_URL;
  if (!url) throw new Error('Не указан API_URL в config.js');
  // Тело строкой → запрос без preflight, Apps Script такой принимает
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ initData: initData(), action, payload }) });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error);
  return body.data;
}

function initData() {
  if (tg && tg.initData) return tg.initData;
  const m = location.hash.match(/tgWebAppData=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

// ---------- Отрисовка ----------

function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#view').innerHTML = state.tab === 'calendar' ? renderCalendar() : renderTasks();
}

function renderCalendar() {
  return `
    <div class="toolbar">
      ${seg('calMode', [['month', 'Месяц'], ['list', 'Список']])}
      <label class="switch"><input type="checkbox" data-action="toggle-mine" ${state.onlyMine ? 'checked' : ''}>Только мои</label>
    </div>
    ${state.calMode === 'month' ? renderMonth() : renderUpcoming()}
    <button class="fab" data-action="new-meeting">＋ Встреча</button>`;
}

function renderMonth() {
  const first = parseKey(state.month);
  const start = addDays(state.month, -((first.getDay() + 6) % 7));
  const byDay = groupBy(events(), e => e.date);
  let cells = WEEKDAYS.map(d => `<div class="wd">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const key = addDays(start, i);
    const d = parseKey(key);
    const out = d.getMonth() !== first.getMonth();
    if (i === 35 && out) break;
    const dots = (byDay[key] || []).slice(0, 3)
      .map(e => `<i class="dot ${e.kind}${e.mine ? ' mine' : ''}"></i>`).join('');
    const cls = ['day', out && 'out', key === todayKey() && 'today', key === state.selected && 'sel'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-action="pick-day" data-day="${key}"><span>${d.getDate()}</span><div class="dots">${dots}</div></button>`;
  }
  const dayEvents = (byDay[state.selected] || []).sort(byTime);
  return `
    <div class="card">
      <div class="monthbar">
        <button data-action="month" data-delta="-1" aria-label="Предыдущий месяц"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
        <b>${MONTHS[first.getMonth()]} ${first.getFullYear()}</b>
        <button data-action="month" data-delta="1" aria-label="Следующий месяц"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
      </div>
      <div class="grid">${cells}</div>
      <div class="legend"><span><i style="background:var(--trip)"></i>Поездки</span><span><i style="background:var(--meeting)"></i>Встречи</span></div>
    </div>
    <div class="section-title">${cap(humanDay(state.selected))}</div>
    ${dayEvents.length ? `<div class="events">${dayEvents.map(eventCard).join('')}</div>`
      : '<div class="card empty">Ничего не запланировано</div>'}`;
}

function renderUpcoming() {
  const from = todayKey();
  const to = addDays(from, 90);
  const list = events().filter(e => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  if (!list.length) return '<div class="card empty">В ближайшие три месяца ничего нет</div>';
  return Object.entries(groupBy(list, e => e.date)).map(([day, items]) => `
    <div class="section-title">${cap(relativeDay(day))}</div>
    <div class="events">${items.map(eventCard).join('')}</div>`).join('');
}

function eventCard(e) {
  const sub = e.kind === 'trip'
    ? [e.format, e.people_text].filter(Boolean).join(' · ')
    : [e.place, names(e.participants)].filter(Boolean).join(' · ');
  return `
    <button class="card ev ${e.kind}" data-action="open-event" data-id="${esc(e.id)}">
      <div class="ev-time">${esc(e.time || 'весь день')}</div>
      <div class="ev-body">
        <div class="ev-title">${esc(e.title)}</div>
        ${sub ? `<div class="ev-sub">${esc(sub)}</div>` : ''}
        <div class="ev-tags">
          <span class="tag ${e.kind}">${e.kind === 'trip' ? 'Поездка' : 'Встреча'}</span>
          ${e.mine ? '<span class="tag mine">Вы участвуете</span>' : ''}
        </div>
      </div>
    </button>`;
}

function renderTasks() {
  const me = state.me.pid;
  const filters = { mine: t => t.assignees.includes(me), all: () => true, byme: t => t.created_by === me };
  const list = state.tasks.filter(filters[state.taskFilter]).sort(taskOrder);
  const sections = STATUSES.map(([status, title]) => {
    const items = list.filter(t => t.status === status);
    if (status === 'done') {
      if (!items.length) return '';
      return `<div class="section-title"><button data-action="toggle-done">${title} · ${items.length} ${state.showDone ? '▾' : '▸'}</button></div>
        ${state.showDone ? `<div class="tasks">${items.map(taskRow).join('')}</div>` : ''}`;
    }
    return `<div class="section-title">${title}${items.length ? ` · ${items.length}` : ''}</div>
      ${items.length ? `<div class="tasks">${items.map(taskRow).join('')}</div>` : '<div class="card empty">Пусто</div>'}`;
  }).join('');
  return `
    <div class="toolbar">${seg('taskFilter', [['mine', 'Мои'], ['all', 'Все'], ['byme', 'Поставил я']])}</div>
    ${sections}
    <button class="fab" data-action="new-task">＋ Задача</button>`;
}

function taskRow(t) {
  const shown = t.assignees.slice(0, 3).map(pid => avatar(person(pid))).join('');
  const more = t.assignees.length > 3 ? `<span class="ava more">+${t.assignees.length - 3}</span>` : '';
  return `
    <div class="card task ${t.status}">
      <button class="tick ${t.status === 'done' ? 'on' : t.status}" data-action="toggle-task" data-id="${t.id}" aria-label="Готово">${CHECK_ICON}</button>
      <button class="task-main" data-action="open-task" data-id="${t.id}">
        <div class="task-title">${esc(t.title)}</div>
        ${t.deadline || t.assignees.length ? `<div class="task-meta">${dueLabel(t)}${shown || more ? `<span class="avatars">${shown}${more}</span>` : ''}</div>` : ''}
      </button>
    </div>`;
}

function dueLabel(t) {
  if (!t.deadline) return '';
  const today = todayKey();
  if (t.status !== 'done' && t.deadline < today) return `<span class="due late">Просрочено · ${shortDay(t.deadline)}</span>`;
  if (t.deadline === today) return '<span class="due soon">Сегодня</span>';
  if (t.deadline === addDays(today, 1)) return '<span class="due soon">Завтра</span>';
  return `<span class="due">до ${shortDay(t.deadline)}</span>`;
}

// ---------- Шторки: просмотр ----------

function openEvent(id) {
  const e = events(true).find(x => x.id === id);
  if (!e) return;
  if (e.kind === 'meeting') return openMeeting(e);
  openSheet(`
    <h2>${esc(e.title)}</h2>
    <div class="kv">
      ${kv('🗓', cap(humanDay(e.date)))}
      ${kv('🕐', e.time)}
      ${kv('🎤', e.format)}
      ${e.address ? kv('📍', `<a class="link" data-action="open-link" data-url="${esc(mapUrl(e.address))}">${esc(e.address)}</a>`, true) : ''}
      ${kv('🚕', e.transfer)}
      ${kv('☎️', e.contact)}
      ${kv('👥', e.people_text || 'Участники не указаны')}
    </div>
    ${e.mine ? '<p class="note"><span class="tag mine">Вы участвуете</span></p>' : ''}
    <p class="note">Поездки подтягиваются из реестра. Чтобы что-то поменять — правьте таблицу.</p>`);
}

function openMeeting(m) {
  const when = cap(humanDay(m.date)) + (m.start ? `<small>${m.start}${m.end ? `–${m.end}` : ''}</small>` : '');
  const chips = m.participants.map(pid => `<span class="chip">${avatar(person(pid))}${esc(person(pid).name)}</span>`).join('');
  openSheet(`
    <h2>${esc(m.title)}</h2>
    <div class="kv">
      ${kv('🗓', when, true)}
      ${m.place ? kv('📍', linkify(m.place), true) : ''}
      ${kv('📝', m.description)}
      ${kv('👥', chips ? `<div class="chips">${chips}</div>` : 'Участники не выбраны', !!chips)}
    </div>
    <p class="note">Создал: ${esc(person(m.created_by).name)}</p>
    <div class="actions">
      <button class="btn primary" data-action="edit-meeting" data-id="${m.id}">Изменить</button>
      ${canDelete(m) ? `<button class="btn danger" data-action="delete-meeting" data-id="${m.id}">Удалить</button>` : ''}
    </div>`);
}

// ---------- Шторки: формы ----------

function meetingForm(m) {
  const isNew = !m;
  m = m || { title: '', date: state.selected, start: '', end: '', place: '', description: '', participants: [state.me.pid] };
  openSheet(`
    <form class="form" data-form="meeting" data-id="${m.id || ''}">
      <h2>${isNew ? 'Новая встреча' : 'Изменить встречу'}</h2>
      <label class="field"><span>Название</span><input name="title" required maxlength="200" value="${esc(m.title)}" placeholder="Например, планёрка"></label>
      <label class="field"><span>Дата</span><input type="date" name="date" required value="${m.date}"></label>
      <div class="row2">
        <label class="field"><span>Начало</span><input type="time" name="start" value="${m.start}"></label>
        <label class="field"><span>Конец</span><input type="time" name="end" value="${m.end}"></label>
      </div>
      <label class="field"><span>Место</span><input name="place" maxlength="300" value="${esc(m.place)}" placeholder="Адрес, кабинет или ссылка"></label>
      <label class="field"><span>Описание</span><textarea name="description" maxlength="2000" placeholder="Повестка, что взять с собой">${esc(m.description)}</textarea></label>
      <div class="field"><span>Участники</span>${peoplePicker(m.participants)}</div>
      <label class="check"><input type="checkbox" name="notify" ${isNew ? 'checked' : ''}>${isNew ? 'Написать в группу и отметить участников' : 'Написать в группу об изменениях'}</label>
      <button class="btn primary" type="submit">Сохранить</button>
    </form>`);
}

function taskForm(t) {
  const isNew = !t;
  t = t || { title: '', description: '', assignees: [], deadline: '', status: 'todo' };
  openSheet(`
    <form class="form" data-form="task" data-id="${t.id || ''}">
      <h2>${isNew ? 'Новая задача' : 'Задача'}</h2>
      <label class="field"><span>Что сделать</span><input name="title" required maxlength="300" value="${esc(t.title)}" placeholder="Например, заказать мерч"></label>
      <label class="field"><span>Подробности</span><textarea name="description" maxlength="2000">${esc(t.description)}</textarea></label>
      <label class="field"><span>Срок</span><input type="date" name="deadline" value="${t.deadline}"></label>
      <div class="field"><span>Статус</span><div class="statuses">
        ${STATUSES.map(([code, title]) => `<label><input type="radio" name="status" value="${code}" ${t.status === code ? 'checked' : ''}><span>${title}</span></label>`).join('')}
      </div></div>
      <div class="field"><span>Ответственные</span>${peoplePicker(t.assignees)}</div>
      <label class="check"><input type="checkbox" name="notify" ${isNew ? 'checked' : ''}>${isNew ? 'Написать в группу и отметить ответственных' : 'Написать в группу об изменениях'}</label>
      <button class="btn primary" type="submit">Сохранить</button>
      ${!isNew && canDelete(t) ? `<button class="btn danger" type="button" data-action="delete-task" data-id="${t.id}">Удалить задачу</button>` : ''}
    </form>`);
}

function peoplePicker(selected) {
  const sorted = [...state.people].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return `
    <div class="picker">
      ${state.people.length > 6 ? '<input type="search" placeholder="Найти человека" data-role="picker-search">' : ''}
      <div class="picker-list">
        ${sorted.map(p => `
          <label class="person" data-search="${esc(`${p.name} ${p.username}`.toLowerCase())}">
            <input type="checkbox" name="people" value="${p.pid}" ${selected.includes(p.pid) ? 'checked' : ''}>
            ${avatar(p)}<span>${esc(p.name)}${p.pid === state.me.pid ? ' <small>(вы)</small>' : ''}${p.username ? ` <small>@${esc(p.username)}</small>` : ''}</span>
          </label>`).join('')}
      </div>
    </div>`;
}

// ---------- События интерфейса ----------

async function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'tab': state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'set': state[el.dataset.key] = el.dataset.value; render(); break;
    case 'toggle-mine': state.onlyMine = el.checked; render(); break;
    case 'toggle-done': state.showDone = !state.showDone; render(); break;
    case 'month': state.month = shiftMonth(state.month, Number(el.dataset.delta)); render(); break;
    case 'pick-day': selectDay(el.dataset.day); break;
    case 'open-event': openEvent(id); break;
    case 'new-meeting': meetingForm(); break;
    case 'edit-meeting': meetingForm(state.meetings.find(m => m.id === id)); break;
    case 'delete-meeting': await removeItem('deleteMeeting', 'meetings', id, 'Удалить встречу?'); break;
    case 'new-task': taskForm(); break;
    case 'open-task': taskForm(state.tasks.find(t => t.id === id)); break;
    case 'toggle-task': await toggleTask(id); break;
    case 'delete-task': await removeItem('deleteTask', 'tasks', id, 'Удалить задачу?'); break;
    case 'open-link': openLink(el.dataset.url); break;
    case 'close-sheet': closeSheet(); break;
    case 'reload': load(); break;
  }
}

function onInput(ev) {
  if (ev.target.dataset.role !== 'picker-search') return;
  const q = ev.target.value.trim().toLowerCase();
  ev.target.closest('.picker').querySelectorAll('.person').forEach(row => {
    row.hidden = q && !row.dataset.search.includes(q);
  });
}

async function onSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);
  const base = { id: form.dataset.id || undefined, title: f.get('title'), description: f.get('description'), notify: f.has('notify') };
  if (form.dataset.form === 'meeting') {
    const res = await busy(form, () => api('saveMeeting', Object.assign(base, {
      date: f.get('date'), start: f.get('start'), end: f.get('end'), place: f.get('place'), participants: f.getAll('people'),
    })));
    if (!res) return;
    upsert(state.meetings, res.item);
    state.selected = res.item.date;
    state.month = monthStart(res.item.date);
    saved(res);
  } else {
    const res = await busy(form, () => api('saveTask', Object.assign(base, {
      deadline: f.get('deadline'), status: f.get('status'), assignees: f.getAll('people'),
    })));
    if (!res) return;
    upsert(state.tasks, res.item);
    saved(res);
  }
}

function saved(res) {
  closeSheet();
  render();
  haptic('success');
  toast(res.notifyError ? `Сохранено, но в группу не ушло: ${res.notifyError}` : 'Сохранено');
}

function selectDay(key) {
  state.selected = key;
  if (monthStart(key) !== state.month) state.month = monthStart(key);
  render();
}

async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  const prev = t.status;
  t.status = prev === 'done' ? 'todo' : 'done';
  haptic('light');
  render();
  try {
    upsert(state.tasks, (await api('saveTask', Object.assign({}, t, { notify: false }))).item);
  } catch (e) {
    t.status = prev;
    render();
    toast(e.message);
  }
}

async function removeItem(action, list, id, question) {
  if (!(await confirmDialog(question))) return;
  try {
    await api(action, { id });
    state[list] = state[list].filter(x => x.id !== id);
    closeSheet();
    render();
    toast('Удалено');
  } catch (e) {
    toast(e.message);
  }
}

async function busy(form, fn) {
  const btn = form.querySelector('[type="submit"]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Сохраняю…';
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
    return null;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- Шторка, тосты, Telegram ----------

function openSheet(html) {
  $('#sheet-panel').innerHTML = html;
  $('#sheet-panel').scrollTop = 0;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  if (tg && tg.isVersionAtLeast('6.1')) {
    if (onSheetClose) tg.BackButton.offClick(onSheetClose);
    onSheetClose = closeSheet;
    tg.BackButton.onClick(onSheetClose);
    tg.BackButton.show();
  }
}

function closeSheet() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  if (tg && tg.isVersionAtLeast('6.1') && onSheetClose) {
    tg.BackButton.offClick(onSheetClose);
    tg.BackButton.hide();
    onSheetClose = null;
  }
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function confirmDialog(text) {
  return new Promise(resolve => {
    if (tg && tg.isVersionAtLeast('6.2')) tg.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

function haptic(kind) {
  if (!tg || !tg.isVersionAtLeast('6.1')) return;
  if (kind === 'success') tg.HapticFeedback.notificationOccurred('success');
  else tg.HapticFeedback.impactOccurred(kind);
}

function openLink(url) {
  if (tg && tg.openLink) tg.openLink(url);
  else window.open(url, '_blank');
}

// ---------- Данные ----------

/** Поездки и встречи в одном виде; withHidden — без фильтра «Только мои». */
function events(withHidden) {
  const me = state.me.pid;
  const list = [
    ...state.trips.map(t => Object.assign({}, t, { kind: 'trip', mine: t.participants.includes(me) })),
    ...state.meetings.map(m => Object.assign({}, m, {
      kind: 'meeting',
      time: m.start ? m.start + (m.end ? `–${m.end}` : '') : '',
      mine: m.participants.includes(me) || m.created_by === me,
    })),
  ];
  return state.onlyMine && !withHidden ? list.filter(e => e.mine) : list;
}

function person(pid) {
  return state.people.find(p => p.pid === pid) || { pid, name: 'Кто-то', username: '' };
}

function names(pids) {
  return pids.map(pid => person(pid).name).join(', ');
}

function canDelete(item) {
  return item.created_by === state.me.pid || state.me.admin;
}

function upsert(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

function taskOrder(a, b) {
  return (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.title.localeCompare(b.title, 'ru');
}

function byTime(a, b) {
  return (a.time || '').localeCompare(b.time || '');
}

function groupBy(list, keyFn) {
  return list.reduce((acc, x) => { (acc[keyFn(x)] = acc[keyFn(x)] || []).push(x); return acc; }, {});
}

// ---------- Мелкие помощники разметки ----------

function seg(key, options) {
  return `<div class="seg">${options.map(([value, title]) =>
    `<button class="${state[key] === value ? 'on' : ''}" data-action="set" data-key="${key}" data-value="${value}">${title}</button>`).join('')}</div>`;
}

function kv(icon, value, raw) {
  if (!value) return '';
  return `<div><span class="k">${icon}</span><span class="v">${raw ? value : esc(value)}</span></div>`;
}

function avatar(p) {
  const letters = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const color = AVATAR_COLORS[[...p.pid].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return `<span class="ava" style="background:${color}">${esc(letters)}</span>`;
}

function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, url => `<a class="link" data-action="open-link" data-url="${url}">${url}</a>`);
}

function mapUrl(address) {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`Санкт-Петербург, ${address}`)}`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Даты (ключ дня — 'yyyy-mm-dd' по местному времени) ----------

function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return keyOf(new Date()); }
function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(key, n) { const d = parseKey(key); d.setDate(d.getDate() + n); return keyOf(d); }
function monthStart(key) { return `${key.slice(0, 7)}-01`; }
function shiftMonth(key, delta) { const d = parseKey(key); d.setMonth(d.getMonth() + delta, 1); return keyOf(d); }
function shortDay(key) { const d = parseKey(key); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; }

function humanDay(key) {
  const d = parseKey(key);
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

function relativeDay(key) {
  if (key === todayKey()) return `сегодня, ${shortDay(key)}`;
  if (key === addDays(todayKey(), 1)) return `завтра, ${shortDay(key)}`;
  return humanDay(key);
}
