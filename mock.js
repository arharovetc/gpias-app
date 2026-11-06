// Тестовые данные для просмотра в браузере: открыть index.html?mock
(function () {
  const day = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const people = [
    ['p1', 'Керим', 'sodichek'], ['p2', 'Арина', 'aarlllln'], ['p3', 'Уля', 'utanlar'], ['p4', 'Кирилл', 'dezskk'],
    ['p5', 'Маша', 'mataranova'], ['p6', 'Катя', 'Despiseeeee'], ['p7', 'Ульяна', 'uprosecco'], ['p8', 'Ксюша', 'Ksushulechka'],
  ].map(([pid, name, username]) => ({ pid, name, username }));

  const db = {
    me: { pid: 'p1', name: 'Керим', username: 'sodichek', admin: true },
    people,
    trips: [
      { id: 't1', date: day(1), title: 'МБИ им. Собчака', format: 'День карьеры — стендовая сессия, лекция', time: '13:00-16:00',
        address: 'Малая Садовая д.6, ауд.4305', transfer: 'Корп. такси', contact: '', people_text: 'Кирилл, Уля', participants: ['p4', 'p3'] },
      { id: 't2', date: day(4), title: 'ГУАП', format: 'Ярмарка вакансий, стенд', time: '', address: '', transfer: '', contact: '',
        people_text: '', participants: [] },
      { id: 't3', date: day(12), title: 'ГУГА', format: 'Ярмарка вакансий, стенд', time: '12:30-17:00', address: 'Пилотов 38',
        transfer: 'Корп. авто', contact: 'Ландер Лев Владимирович +7(931)336-85-19', people_text: 'Керим, Катя', participants: ['p1', 'p6'] },
    ],
    meetings: [
      { id: 'm1', title: 'Планёрка амбассадоров', date: day(0), start: '18:00', end: '19:00', place: 'БЦ, переговорка 510',
        description: 'План на ноябрь и распределение поездок', participants: ['p1', 'p2', 'p3', 'p4'], created_by: 'p1' },
      { id: 'm2', title: 'Созвон с ментором', date: day(4), start: '11:00', end: '', place: 'https://telemost.yandex.ru/j/123',
        description: '', participants: ['p5', 'p7'], created_by: 'p5' },
    ],
    tasks: [
      { id: 'k1', title: 'Заказать мерч на ярмарку ГУАП', description: 'Шопперы, значки, бутылки', assignees: ['p1', 'p8'],
        deadline: day(1), status: 'doing', created_by: 'p4' },
      { id: 'k2', title: 'Фотоотчёт с МБИ', description: '', assignees: ['p4'], deadline: day(3), status: 'todo', created_by: 'p1' },
      { id: 'k3', title: 'Обновить реестр поездок', description: '', assignees: ['p1'], deadline: day(-2), status: 'todo', created_by: 'p2' },
      { id: 'k4', title: 'Пост про СПБГИК', description: '', assignees: ['p3', 'p7'], deadline: day(-5), status: 'done', created_by: 'p1' },
    ],
  };

  let seq = 1;
  const clone = x => JSON.parse(JSON.stringify(x));
  function save(list, p, fields) {
    if (!String(p.title || '').trim()) throw new Error('Укажите название');
    const existing = db[list].find(x => x.id === p.id);
    const item = Object.assign(existing || { id: `new${seq++}`, created_by: db.me.pid }, fields);
    if (!existing) db[list].push(item);
    return { item: clone(item), notifyError: '' };
  }

  window.mockApi = async function (action, p) {
    await new Promise(r => setTimeout(r, 300));
    switch (action) {
      case 'bootstrap': return clone(db);
      case 'saveMeeting':
        if (!p.date) throw new Error('Укажите дату');
        return save('meetings', p, { title: p.title.trim(), date: p.date, start: p.start || '', end: p.end || '',
          place: p.place || '', description: p.description || '', participants: p.participants || [] });
      case 'saveTask':
        return save('tasks', p, { title: p.title.trim(), description: p.description || '', assignees: p.assignees || [],
          deadline: p.deadline || '', status: p.status || 'todo' });
      case 'deleteMeeting': db.meetings = db.meetings.filter(x => x.id !== p.id); return { id: p.id };
      case 'deleteTask': db.tasks = db.tasks.filter(x => x.id !== p.id); return { id: p.id };
      default: throw new Error(`Неизвестное действие: ${action}`);
    }
  };
})();
