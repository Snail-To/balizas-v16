const madrid = 'Europe/Madrid';
const number = new Intl.NumberFormat('es-ES');
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: madrid, year: 'numeric', month: '2-digit', day: '2-digit' });
const clockWithOffset = new Intl.DateTimeFormat('es-ES', { timeZone: madrid, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
const el = id => document.getElementById(id);
const date = el('stats-day');
const refresh = el('stats-refresh');
const status = el('stats-status');
const body = el('stats-rows');
let mode = 'daily';
let rows = [];
let pending;
let renderedQuery = '';

function syncToday() {
  const parts = Object.fromEntries(dateKey.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const today = [parts.year, parts.month, parts.day].join('-');
  if (!date.value || date.value === date.max) date.value = today;
  date.max = today;
}

function period(start, end) {
  return clockWithOffset.format(new Date(start)) + ' – ' + clockWithOffset.format(new Date(end));
}

function formatValue(value) {
  return value == null ? '—' : number.format(value);
}

function dailyRows(days) {
  return [...days].reverse().map(day => ({
    label: day.day,
    value: day.total,
    details: [
      formatValue(day.peak),
      day.hours.map(([start, end]) => period(start, end)).join(', ') || '—',
      formatValue(day.activePeak),
      day.activeAt ? clockWithOffset.format(new Date(day.activeAt)) : '—'
    ]
  }));
}

function hourlyRows(hours) {
  let cumulative = 0;
  return hours.map(hour => {
    const future = Date.parse(hour.hour_start) > Date.now();
    const hasData = !future && (hour.samples > 0 || hour.activations > 0);
    if (hasData) cumulative += Number(hour.activations);
    return {
      label: period(hour.hour_start, hour.hour_end),
      value: hasData ? Number(hour.activations) : null,
      details: [hasData ? formatValue(cumulative) : '—', future ? 'Pendiente' : hour.samples ? number.format(hour.samples) : '—']
    };
  });
}

function renderTable() {
  const labels = mode === 'daily'
    ? ['Fecha', 'Activaciones', 'Pico horario', 'Horarios del pico', 'Pico simultáneo', 'Hora de la muestra']
    : ['Horario', 'Activaciones', 'Acumulado observado', 'Muestras'];
  const heading = document.createElement('tr');
  for (const [index, label] of labels.entries()) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    th.classList.toggle('numeric', mode === 'hourly' ? index > 0 : [1, 2, 4].includes(index));
    heading.append(th);
  }
  el('stats-head').replaceChildren(heading);
  for (const item of rows) {
    const row = document.createElement('tr');
    const label = row.insertCell();
    label.textContent = item.label;
    [formatValue(item.value), ...item.details].forEach((value, index) => {
      const cell = row.insertCell();
      cell.textContent = value;
      cell.classList.toggle('numeric', mode === 'hourly' || [0, 1, 3].includes(index));
    });
    item.row = row;
  }
  body.replaceChildren(...rows.map(item => item.row));
}

function render(data) {
  rows = mode === 'daily' ? dailyRows(data.days) : hourlyRows(data.hours);
  const observed = rows.filter(item => item.value != null);
  const total = observed.length ? observed.reduce((sum, item) => sum + item.value, 0) : null;
  el('stats-total').textContent = formatValue(total);
  el('stats-range').textContent = mode === 'daily'
    ? rows[0].label + ' – ' + rows[rows.length - 1].label
    : data.day;
  renderTable();
  const latest = data.latest;
  const delayed = latest && (!latest.succeeded || Date.now() - Date.parse(latest.requested_at) > 180000);
  status.classList.toggle('error', Boolean(delayed));
  status.textContent = delayed ? 'La recogida de datos está retrasada.'
    : observed.length ? '' : 'No hay datos observados en este periodo.';
}

async function loadStats() {
  if (document.hidden) return;
  syncToday();
  if (mode === 'hourly' && !date.checkValidity()) return;
  const query = mode === 'daily' ? './api/dgt-peaks' : './api/dgt-stats?day=' + encodeURIComponent(date.value);
  if (pending?.query === query) return;
  pending?.controller.abort();
  const controller = new AbortController();
  pending = { query, controller };
  refresh.disabled = true;
  status.classList.remove('error');
  if (query !== renderedQuery) {
    renderedQuery = '';
    rows = [];
    body.replaceChildren();
    el('stats-range').textContent = 'Hora de Madrid';
    el('stats-total').textContent = '—';
    status.textContent = 'Cargando estadísticas…';
  }
  try {
    const response = await fetch(query, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (controller.signal.aborted) return;
    render(data);
    renderedQuery = query;
  } catch {
    if (controller.signal.aborted) return;
    status.textContent = 'No se pudieron actualizar las estadísticas.';
    status.classList.add('error');
  } finally {
    if (pending?.controller === controller) {
      pending = undefined;
      refresh.disabled = false;
    }
  }
}

function showMode(next) {
  mode = next;
  const daily = mode === 'daily';
  el('view-daily').setAttribute('aria-pressed', String(daily));
  el('view-hourly').setAttribute('aria-pressed', String(!daily));
  el('date-control').hidden = daily;
  el('detail-title').textContent = daily ? 'Detalle diario' : 'Detalle por hora';
  el('stats-note').textContent = daily
    ? 'El día en curso se actualiza con nuevas observaciones. El pico horario muestra la hora con más activaciones y el pico simultáneo usa las muestras de los últimos 14 días.'
    : 'La hora en curso aún puede sumar activaciones. Los días con cambio de horario tienen 23 o 25 horas y el desfase UTC distingue las horas repetidas.';
  loadStats();
}

el('view-daily').addEventListener('click', () => showMode('daily'));
el('view-hourly').addEventListener('click', () => showMode('hourly'));
refresh.addEventListener('click', loadStats);
date.addEventListener('change', loadStats);
document.addEventListener('visibilitychange', loadStats);
setInterval(() => {
  if (mode === 'daily' || date.value === date.max) loadStats();
}, 60000);
showMode('daily');
