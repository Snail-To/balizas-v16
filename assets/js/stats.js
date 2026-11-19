const madrid = 'Europe/Madrid';
const number = new Intl.NumberFormat('es-ES');
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: madrid, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat('es-ES', { timeZone: madrid, hour: '2-digit', minute: '2-digit' });
const clockWithOffset = new Intl.DateTimeFormat('es-ES', { timeZone: madrid, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
const el = id => document.getElementById(id);
const date = el('stats-day');
const refresh = el('stats-refresh');
const status = el('stats-status');
const chart = el('stats-chart');
const canvas = el('trend-canvas');
const points = el('trend-points');
const selection = el('chart-selection');
const body = el('stats-rows');
let mode = 'daily';
let rows = [];
let selectedKey = null;
let pending;
let renderedQuery = '';

function syncToday() {
  const parts = Object.fromEntries(dateKey.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const today = [parts.year, parts.month, parts.day].join('-');
  if (!date.max || date.value === date.max) date.value = today;
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
    key: day.day,
    tick: dayLabel.format(new Date(day.day + 'T00:00:00Z')),
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
      key: hour.hour_start,
      tick: clock.format(new Date(hour.hour_start)),
      label: period(hour.hour_start, hour.hour_end),
      value: hasData ? Number(hour.activations) : null,
      details: [hasData ? formatValue(cumulative) : '—']
    };
  });
}

function select(key, scroll = false) {
  selectedKey = key;
  for (const item of rows) {
    const active = item.key === selectedKey;
    item.row.classList.toggle('selected', active);
    item.point?.setAttribute('aria-pressed', String(active));
    item.button?.setAttribute('aria-pressed', String(active));
  }
  const item = rows.find(row => row.key === selectedKey);
  selection.hidden = !item;
  selection.textContent = item ? item.label + ' · ' + formatValue(item.value) + ' activaciones' : '';
  if (scroll && item) item.row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderTable() {
  const labels = mode === 'daily'
    ? ['Fecha', 'Activaciones', 'Pico horario', 'Horarios del pico', 'Pico simultáneo', 'Hora de la muestra']
    : ['Horario', 'Activaciones', 'Acumulado observado'];
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
    if (item.value == null) {
      label.textContent = item.label;
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'period-button';
      button.textContent = item.label;
      button.addEventListener('click', () => select(item.key));
      label.append(button);
      item.button = button;
    }
    [formatValue(item.value), ...item.details].forEach((value, index) => {
      const cell = row.insertCell();
      cell.textContent = value;
      cell.classList.toggle('numeric', mode === 'hourly' || [0, 1, 3].includes(index));
    });
    item.row = row;
  }
  body.replaceChildren(...rows.map(item => item.row));
}

function drawTrend() {
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  if (!width || !height || chart.hidden) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);

  const left = 48;
  const right = width - 14;
  const top = 15;
  const bottom = height - 32;
  const values = rows.map(row => row.value).filter(value => value != null);
  const max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil(max / 4));
  const x = index => left + index * (right - left) / Math.max(rows.length - 1, 1);
  const y = value => bottom - value * (bottom - top) / (step * 4);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#526477';
  ctx.strokeStyle = '#dfe8f1';
  for (let tick = 0; tick <= 4; tick++) {
    const line = y(tick * step);
    ctx.beginPath();
    ctx.moveTo(left, line);
    ctx.lineTo(right, line);
    ctx.stroke();
    ctx.fillText(formatValue(tick * step), left - 8, line);
  }

  const spacing = Math.ceil(rows.length / Math.max(1, Math.floor((right - left) / 58)));
  ctx.textAlign = 'center';
  rows.forEach((item, index) => {
    const last = rows.length - 1;
    if (index === last || (index % spacing === 0 && last - index >= spacing)) {
      ctx.fillText(item.tick, x(index), bottom + 17);
    }
  });

  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, '#76a7e3');
  gradient.addColorStop(1, '#eff6ff');
  const segments = [];
  let segment = [];
  rows.forEach((item, index) => {
    if (item.value == null) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    segment.push({ item, x: x(index), y: y(item.value) });
  });
  if (segment.length) segments.push(segment);

  const focusKey = document.activeElement?.dataset.pointKey;
  points.replaceChildren();
  for (const run of segments) {
    const first = run[0];
    const last = run[run.length - 1];
    ctx.beginPath();
    ctx.moveTo(first.x, bottom);
    run.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(last.x, bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    run.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2468b4';
    ctx.stroke();
    for (const point of run) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#2468b4';
      ctx.fill();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'point';
      button.dataset.pointKey = point.item.key;
      button.style.left = point.x + 'px';
      button.style.top = point.y + 'px';
      button.style.width = Math.min(24, (right - left) / Math.max(rows.length - 1, 1)) + 'px';
      button.title = point.item.label + ' · ' + formatValue(point.item.value) + ' activaciones';
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => select(point.item.key, true));
      points.append(button);
      point.item.point = button;
      if (focusKey === point.item.key) button.focus({ preventScroll: true });
    }
  }
  select(selectedKey);
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
  if (!observed.some(item => item.key === selectedKey)) {
    selectedKey = observed.reduce((peak, item) => !peak || item.value >= peak.value ? item : peak, null)?.key;
  }
  chart.hidden = observed.length === 0;
  select(selectedKey);
  drawTrend();
  const latestAt = Date.parse(data.latest?.requested_at);
  const known = Number.isFinite(latestAt);
  const delayed = known && (!data.latest.succeeded || Date.now() - latestAt > 180000);
  status.classList.toggle('error', !known || delayed);
  status.textContent = !known ? 'No se pudo comprobar el estado de la recogida de datos.'
    : delayed ? 'La recogida de datos está retrasada.'
    : observed.length ? '' : 'No hay datos observados en este periodo.';
}

function clearStats() {
  renderedQuery = '';
  selectedKey = null;
  rows = [];
  renderTable();
  chart.hidden = true;
  points.replaceChildren();
  selection.hidden = true;
  el('stats-range').textContent = 'Hora de Madrid';
  el('stats-total').textContent = '—';
}

async function loadStats() {
  if (document.hidden) return;
  syncToday();
  if (mode === 'hourly' && !date.checkValidity()) {
    pending?.controller.abort();
    pending = undefined;
    refresh.disabled = false;
    clearStats();
    status.classList.add('error');
    status.textContent = 'Selecciona una fecha válida que no sea posterior a hoy.';
    return;
  }
  const query = mode === 'daily' ? './api/dgt-peaks' : './api/dgt-stats?day=' + encodeURIComponent(date.value);
  if (pending?.query === query) return;
  pending?.controller.abort();
  const controller = new AbortController();
  pending = { query, controller };
  refresh.disabled = true;
  status.classList.remove('error');
  if (query !== renderedQuery) {
    clearStats();
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
new ResizeObserver(drawTrend).observe(chart);
setInterval(() => {
  if (mode === 'daily' || date.value === date.max) loadStats();
}, 60000);
showMode('daily');
