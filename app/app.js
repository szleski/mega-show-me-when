import { ack, fetchIncidents } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const notice = document.querySelector('#notice');
const refreshNotice = document.querySelector('#refresh-notice');
const incidents = new Map();
const rows = new Map();
const acknowledged = new Set();
const pending = new Set();

const locale = navigator.language;
const region = new Intl.Locale(locale).maximize().region;
const european = 'AT BE BG HR CY CZ DK EE EU FI FR DE GB GR HU IE IS IT LI LV LT LU MT NL NO PL PT RO SK SI ES SE CH'
  .split(' ').includes(region);
const date = new Intl.DateTimeFormat(european ? 'en-GB' : locale, {
  day: '2-digit', month: '2-digit', year: 'numeric',
});
const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

let queue = Promise.resolve();
let loaded = false;
let refreshing = false;

// Serialize network actions so that an Ack uses the cursor from the last completed poll.
function enqueue(action) {
  queue = queue.then(action);
}

function makeRow(id) {
  const row = document.querySelector('#incident-template').content.firstElementChild.cloneNode(true);
  row.dataset.id = id;
  row.querySelector('.id').textContent = id;
  const button = row.querySelector('button');
  button.setAttribute('aria-label', `Ack ${id}`);
  button.addEventListener('click', () => {
    if (pending.has(id) || acknowledged.has(id)) return;
    pending.add(id);
    updateAck(id);
    enqueue(async () => {
      try {
        await ack(id);
        acknowledged.add(id);
        notice.textContent = '';
      } catch {
        notice.textContent = `Couldn’t acknowledge ${id}. Try again.`;
      } finally {
        pending.delete(id);
        updateAck(id);
      }
    });
  });
  rows.set(id, row);
  return row;
}

function updateAck(id) {
  const row = rows.get(id);
  const button = row.querySelector('button');
  button.disabled = pending.has(id);
  button.hidden = acknowledged.has(id);
  button.textContent = pending.has(id) ? 'Acking…' : 'Ack';
  row.querySelector('[data-testid="acked"]').hidden = !acknowledged.has(id);
}

function render(changes) {
  for (const incident of changes) {
    incidents.set(incident.id, incident);
    const row = rows.get(incident.id) ?? makeRow(incident.id);
    row.className = `row ${incident.severity}`;
    row.querySelector('.sev').textContent = incident.severity;
    row.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
    const time = row.querySelector('time');
    time.dateTime = incident.openedAt;
    const instant = new Date(incident.openedAt);
    time.textContent = `${date.format(instant)}, ${clock.format(instant)}`;
  }

  const newestFirst = [...incidents.values()].sort((a, b) =>
    Date.parse(b.openedAt) - Date.parse(a.openedAt));
  let next = list.firstElementChild;
  for (const { id } of newestFirst) {
    const row = rows.get(id);
    if (row === next) {
      next = next.nextElementSibling;
    } else {
      list.insertBefore(row, next);
    }
  }
  empty.hidden = incidents.size > 0;
}

function refresh() {
  if (refreshing) return;
  refreshing = true;
  enqueue(async () => {
    try {
      const page = await fetchIncidents();
      render(page.incidents);
      loader.hidden = true;
      loaded = true;
      refreshNotice.textContent = '';
    } catch {
      refreshNotice.textContent = loaded
        ? 'Couldn’t refresh incidents. Retrying…'
        : 'Couldn’t load incidents. Retrying…';
    } finally {
      refreshing = false;
    }
  });
}

refresh();
setInterval(refresh, 2000);
