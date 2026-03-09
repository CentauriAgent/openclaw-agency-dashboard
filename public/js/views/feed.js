// Activity Feed view — with historical date picker

import { api } from '../api.js';
import { store } from '../state.js';

const SYMBOL_CLASSES = {
  '✓': 'completed', '→': 'started', '+': 'created', '✗': 'failed',
  '💓': 'heartbeat', '🤖': 'agent', '📝': 'memory',
  'completed': 'completed', 'started': 'started', 'created': 'created',
  'failed': 'failed', 'heartbeat': 'heartbeat'
};

export function renderFeed(container) {
  const activity = store.get('activity');
  const selectedDate = store.get('feedDate') || 'today';
  const historicalData = store.get('historicalFeed');

  // Use historical data if a date is selected
  const displayActivity = selectedDate !== 'today' && historicalData ? historicalData : activity;

  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="view-header">
      <h2 class="view-title">Activity Feed</h2>
      <div class="date-picker-row">
        <input type="date" id="feed-date-picker" class="date-picker-input" value="${selectedDate === 'today' ? today : selectedDate}" max="${today}" />
        ${selectedDate !== 'today' ? '<button class="btn btn-ghost btn-sm" id="btn-feed-today">← Today</button>' : ''}
      </div>
    </div>
  `;

  if (!displayActivity || displayActivity.length === 0) {
    container.innerHTML += `
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <div class="empty-state-text">${selectedDate !== 'today' ? 'No activity found for this date' : 'No recent activity'}</div>
        <div class="empty-state-sub">${selectedDate !== 'today' ? 'Try selecting a different date' : 'Events will appear here as agents work on tasks'}</div>
      </div>
    `;
  } else {
    // Group by date
    const groups = groupByDate(displayActivity);
    container.innerHTML += `
      <div class="feed-list">
        ${Object.entries(groups).map(([date, events]) => `
          <div class="feed-date-header">${date}</div>
          ${events.map(event => renderFeedItem(event)).join('')}
        `).join('')}
      </div>
    `;
  }

  // Date picker handler
  container.querySelector('#feed-date-picker')?.addEventListener('change', async (e) => {
    const date = e.target.value;
    if (date === today) {
      store.set('feedDate', 'today');
      store.set('historicalFeed', null);
      renderFeed(container);
      return;
    }
    store.set('feedDate', date);
    try {
      const result = await api.get(`/api/memory/${date}`);
      const entries = (result.entries || []).map(entry => ({
        timestamp: entry.timestamp,
        time: entry.time || '',
        type: entry.type || 'general',
        symbol: getSymbolForType(entry.type),
        issueId: '',
        title: entry.title,
        assignee: 'Centauri',
        source: 'memory',
        content: entry.content
      }));
      store.set('historicalFeed', entries);
      renderFeed(container);
    } catch (err) {
      store.set('historicalFeed', []);
      renderFeed(container);
    }
  });

  // Today button
  container.querySelector('#btn-feed-today')?.addEventListener('click', () => {
    store.set('feedDate', 'today');
    store.set('historicalFeed', null);
    renderFeed(container);
  });
}

function getSymbolForType(type) {
  const symbols = {
    heartbeat: '💓', social: '📱', agent: '🤖', task: '✓',
    email: '📧', calendar: '📅', deploy: '🚀', general: '📝'
  };
  return symbols[type] || '📝';
}

function renderFeedItem(event) {
  const symbolType = SYMBOL_CLASSES[event.symbol] || SYMBOL_CLASSES[event.type] || 'created';
  const displaySymbol = event.symbol || (event.type === 'completed' ? '✓' : event.type === 'started' ? '→' : '+');
  const time = event.time || '';
  const sourceClass = event.source === 'memory' ? ' feed-item--memory' : '';

  return `
    <div class="feed-item${sourceClass}">
      <span class="feed-time mono">${time}</span>
      <span class="feed-symbol feed-symbol--${symbolType}">${displaySymbol}</span>
      <span class="feed-id mono">${event.issueId || ''}</span>
      <span class="feed-title">${event.title || ''}</span>
      <span class="feed-assignee">${event.assignee ? `@${event.assignee}` : ''}</span>
    </div>
  `;
}

function groupByDate(events) {
  const groups = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const event of events) {
    let dateKey;
    if (event.timestamp) {
      const d = new Date(event.timestamp);
      const ds = d.toDateString();
      dateKey = ds === today ? 'Today' : ds === yesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } else {
      dateKey = 'Today';
    }

    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(event);
  }

  return groups;
}

export function initFeed() {
  const container = document.getElementById('view-feed');
  store.on('activity', () => {
    if (store.get('currentView') === 'feed' && store.get('feedDate') === 'today') {
      renderFeed(container);
    }
  });
}
