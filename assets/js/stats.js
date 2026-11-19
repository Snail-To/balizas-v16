const STATS_URL = './api/dgt-stats';
let loading = false;
let peaksLoading = false;
const dayInput = document.getElementById('stats-day');
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const time = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
dayInput.value = dayInput.max = dayFormat.format(new Date());
function syncToday() {
  const today = dayFormat.format(new Date());
  if (!dayInput.value || dayInput.value === dayInput.max) dayInput.value = today;
  dayInput.max = today;
}
function period(start, end) {
  return time.format(new Date(start)) + ' – ' + time.format(new Date(end));
}
function cell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
}
async function refreshPeaks() {
  if (peaksLoading || document.hidden) return;
  peaksLoading = true;
  const status = document.getElementById('peaks-status');
  try {
    const response = await fetch('./api/dgt-peaks', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const { days } = await response.json();
    const rows = days.map(day => {
      const row = document.createElement('tr');
      cell(row, day.day);
      cell(row, day.total ?? '—');
      cell(row, day.peak ?? '—');
      cell(row, day.hours.map(([start, end]) => period(start, end)).join(', ') || '—');
      cell(row, day.activePeak ?? '—');
      cell(row, day.activeAt ? time.format(new Date(day.activeAt)) : '—');
      return row;
    });
    document.getElementById('peaks-rows').replaceChildren(...rows);
    status.textContent = '';
  } catch {
    status.textContent = 'No se pudieron actualizar los picos diarios.';
    status.className = 'error';
  } finally {
    peaksLoading = false;
  }
}
async function refreshStats() {
  if (loading || document.hidden) return;
  syncToday();
  if (!dayInput.checkValidity()) return;
  loading = true;
  const button = document.getElementById('stats-refresh');
  button.disabled = true;
  dayInput.disabled = true;
  const status = document.getElementById('stats-status');
  try {
    const response = await fetch(STATS_URL + '?day=' + encodeURIComponent(dayInput.value), {
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    document.getElementById('stats-total').textContent = data.total > 0 || data.hours.some(hour => hour.samples > 0) ? data.total : '—';
    document.getElementById('stats-date').textContent = data.day + ' · Europe/Madrid';
    const body = document.getElementById('stats-rows');
    body.replaceChildren();
    let cumulative = 0;
    data.hours.forEach(hour => {
      const row = document.createElement('tr');
      cumulative += Number(hour.activations);
      const future = Date.parse(hour.hour_start) > Date.now();
      cell(row, period(hour.hour_start, hour.hour_end));
      cell(row, future ? '—' : (hour.samples > 0 || Number(hour.activations) > 0 ? hour.activations : '—'));
      cell(row, future || (hour.samples === 0 && cumulative === 0) ? '—' : cumulative);
      cell(row, future ? 'Pendiente' : (hour.samples > 0 ? hour.samples + ' muestras' : 'Sin muestreo en este horario'));
      body.appendChild(row);
    });
    const latest = data.latest;
    status.textContent = latest
      ? 'Último intento: ' + time.format(new Date(latest.requested_at)) + (latest.succeeded ? ' · correcto' : ' · falló')
      : 'Todavía no hay registros de recogida.';
    status.className = latest && latest.succeeded && Date.now() - Date.parse(latest.requested_at) < 180000 ? '' : 'error';
  } catch {
    status.textContent = 'No se pudieron actualizar las estadísticas. Los valores anteriores pueden estar desactualizados.';
    status.className = 'error';
  } finally {
    loading = false;
    button.disabled = false;
    dayInput.disabled = false;
  }
}
function refreshVisible() {
  refreshStats();
  refreshPeaks();
}
document.getElementById('stats-refresh').addEventListener('click', refreshVisible);
dayInput.addEventListener('change', refreshStats);
refreshVisible();
setInterval(() => {
  if (document.hidden) return;
  if (dayInput.value === dayInput.max) refreshStats();
  refreshPeaks();
}, 60000);
document.addEventListener('visibilitychange', refreshVisible);
