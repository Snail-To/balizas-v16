const STATS_URL = './api/dgt-stats';
let refreshTimer;
let loading = false;
const dayInput = document.getElementById('stats-day');
dayInput.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
dayInput.max = dayInput.value;
function cell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
}
async function refreshStats() {
  if (loading || document.hidden) return;
  loading = true;
  const button = document.getElementById('stats-refresh');
  button.disabled = true;
  dayInput.disabled = true;
  const status = document.getElementById('stats-status');
  try {
    const response = await fetch(STATS_URL + '?day=' + encodeURIComponent(dayInput.value), {
      cache: 'no-store', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    document.getElementById('stats-total').textContent = data.total > 0 || data.hours.some(hour => hour.samples > 0) ? data.total : '—';
    document.getElementById('stats-date').textContent = data.day + ' · Europe/Madrid';
    const body = document.getElementById('stats-rows');
    body.replaceChildren();
    const time = new Intl.DateTimeFormat('es-ES', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
    let cumulative = 0;
    data.hours.forEach(hour => {
      const row = document.createElement('tr');
      cumulative += Number(hour.activations);
      const future = Date.parse(hour.hour_start) > Date.now();
      cell(row, time.format(new Date(hour.hour_start)) + ' – ' + time.format(new Date(hour.hour_end)));
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
document.getElementById('stats-refresh').addEventListener('click', refreshStats);
dayInput.addEventListener('change', refreshStats);
refreshStats();
refreshTimer = setInterval(refreshStats, 60000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));


document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); });
