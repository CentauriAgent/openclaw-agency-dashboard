// Activity Feed view

import { store } from '../state.js';

const SYMBOL_CLASSES = {
  '✓': 'completed',
  '→': 'started',
  '+': 'created',
  '✗': 'failed',
  'completed': 'completed',
  'started': 'started',
  'created': 'created',
  'failed': 'failed'
};

export function renderFeed(container) {
  const activity = store.get('activity');
  if (!activity || activity.length === 0) {
    container.innerHTML = `
      <div class="view-header"><h2 class="view-title">Activity Feed</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <div class="empty-state-text">No recent activity</div>
        <div class="empty-state-sub">Events will appear here as agents work on tasks</div>
      </div>
    `;
    return;
  }

  // Group by date
  const groups = groupByDate(activity);

  container.innerHTML = `
    <div class="view-header"><h2 class="view-title">Activity Feed</h2></div>
    <div class="feed-list">
      ${Object.entries(groups).map(([date, events]) => `
        <div class="feed-date-header">${date}</div>
        ${events.map(event => renderFeedItem(event)).join('')}
      `).join('')}
    </div>
  `;
}

function renderFeedItem(event) {
  const symbolType = SYMBOL_CLASSES[event.symbol] || SYMBOL_CLASSES[event.type] || 'created';
  const displaySymbol = event.symbol || (event.type === 'completed' ? '✓' : event.type === 'started' ? '→' : '+');
  const time = event.time || '';

  return `
    <div class="feed-item">
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
    if (store.get('currentView') === 'feed') {
      renderFeed(container);
    }
  });
}
