// Dependency Graph view — D3.js + dagre-d3 DAG visualization

import { api } from '../api.js';
import { store } from '../state.js';

let currentSvg = null;

const STATUS_COLORS = {
  closed: { fill: '#27ae60', stroke: '#2ecc71' },
  in_progress: { fill: '#8b5cf6', stroke: '#a78bfa' },
  open: { fill: '#4a4a5a', stroke: '#6a6a7a' },
  blocked: { fill: '#c0392b', stroke: '#e74c3c' },
  deferred: { fill: '#2980b9', stroke: '#3498db' }
};

export async function renderGraph(container) {
  const epics = store.get('epics') || [];

  if (epics.length === 0) {
    container.innerHTML = `
      <div class="view-header"><h2 class="view-title">Dependency Graph</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">🔗</div>
        <div class="empty-state-text">No dependency graphs available</div>
        <div class="empty-state-sub">Create an epic with <code>bd</code> to visualize task dependencies</div>
      </div>
    `;
    return;
  }

  const selectedEpic = store.get('selectedGraphEpic') || epics[0]?.id;

  container.innerHTML = `
    <div class="view-header">
      <h2 class="view-title">Dependency Graph</h2>
    </div>
    <div class="graph-controls">
      <label style="font-size: 13px; color: var(--text-secondary);">Epic:</label>
      <select id="graph-epic-select">
        ${epics.map(e => `<option value="${e.id}" ${e.id === selectedEpic ? 'selected' : ''}>${e.title} (${e.id})</option>`).join('')}
      </select>
    </div>
    <div class="graph-container" id="graph-canvas">
      <svg id="graph-svg"></svg>
      <div class="graph-tooltip" id="graph-tooltip">
        <div class="graph-tooltip-title" id="tooltip-title"></div>
        <div class="graph-tooltip-meta" id="tooltip-meta"></div>
      </div>
    </div>
    <div class="graph-legend">
      <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #2ecc71;"></div> Complete</div>
      <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #8b5cf6;"></div> In Progress</div>
      <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #6a6a7a;"></div> Open</div>
      <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #e74c3c;"></div> Blocked</div>
    </div>
  `;

  // Epic selector
  container.querySelector('#graph-epic-select')?.addEventListener('change', (e) => {
    store.set('selectedGraphEpic', e.target.value);
    loadGraph(container, e.target.value);
  });

  await loadGraph(container, selectedEpic);
}

async function loadGraph(container, epicId) {
  try {
    const graphData = await api.get(`/api/graph?id=${encodeURIComponent(epicId)}`);
    if (!graphData.nodes || graphData.nodes.length === 0) {
      const canvas = container.querySelector('#graph-canvas');
      if (canvas) {
        canvas.innerHTML = `
          <div class="empty-state" style="padding-top: 80px;">
            <div class="empty-state-icon">🔗</div>
            <div class="empty-state-text">No tasks in this epic</div>
          </div>
        `;
      }
      return;
    }
    renderDagre(container, graphData);
  } catch (e) {
    console.error('Graph load error:', e);
  }
}

function renderDagre(container, graphData) {
  const { nodes, edges, epicTitle } = graphData;
  const svgEl = container.querySelector('#graph-svg');
  if (!svgEl) return;

  // Clear previous
  svgEl.innerHTML = '';

  // Check if dagre-d3 is available
  if (typeof dagreD3 === 'undefined' || typeof d3 === 'undefined') {
    svgEl.parentElement.innerHTML = `
      <div class="empty-state" style="padding-top: 80px;">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Graph library not loaded</div>
        <div class="empty-state-sub">D3.js or dagre-d3 failed to load from CDN</div>
      </div>
    `;
    return;
  }

  // Create dagre graph
  const g = new dagreD3.graphlib.Graph().setGraph({
    rankdir: 'LR',
    marginx: 30,
    marginy: 30,
    ranksep: 60,
    nodesep: 30
  });

  // Add nodes
  for (const node of nodes) {
    const label = node.shortId ? `.${node.shortId}` : node.id;
    g.setNode(node.id, {
      label: label + '\n' + (node.label || '').slice(0, 20),
      class: `node-${node.status}`,
      style: `fill: ${STATUS_COLORS[node.status]?.fill || '#4a4a5a'}; stroke: ${STATUS_COLORS[node.status]?.stroke || '#6a6a7a'};`,
      labelStyle: 'fill: #fff; font-size: 11px;',
      rx: 8,
      ry: 8,
      width: 130,
      height: 50,
      _data: node
    });
  }

  // Add edges
  for (const edge of edges) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to, {
        style: 'stroke: #6b3a7d; stroke-width: 2; fill: none;',
        arrowheadStyle: 'fill: #6b3a7d; stroke: #6b3a7d;',
        curve: d3.curveBasis
      });
    }
  }

  // Render
  const svg = d3.select(svgEl);
  const inner = svg.append('g');
  const render = new dagreD3.render();

  try {
    render(inner, g);
  } catch (e) {
    console.error('dagre-d3 render error:', e);
    return;
  }

  // Get graph dimensions
  const graphWidth = g.graph().width || 400;
  const graphHeight = g.graph().height || 300;

  // Setup zoom
  const containerRect = svgEl.parentElement.getBoundingClientRect();
  const zoom = d3.zoom()
    .scaleExtent([0.3, 2])
    .on('zoom', (event) => {
      inner.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Center and fit
  const scale = Math.min(
    (containerRect.width - 60) / graphWidth,
    (containerRect.height - 60) / graphHeight,
    1
  );
  const translateX = (containerRect.width - graphWidth * scale) / 2;
  const translateY = (containerRect.height - graphHeight * scale) / 2;

  svg.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));

  // Tooltip on hover
  const tooltip = container.querySelector('#graph-tooltip');
  const tooltipTitle = container.querySelector('#tooltip-title');
  const tooltipMeta = container.querySelector('#tooltip-meta');

  inner.selectAll('.node').on('mouseover', function (event) {
    const nodeId = d3.select(this).datum();
    const nodeData = nodes.find(n => n.id === nodeId);
    if (nodeData && tooltip) {
      tooltipTitle.textContent = `${nodeData.id}: ${nodeData.label}`;
      tooltipMeta.textContent = `Status: ${nodeData.status}${nodeData.assignee ? ` · ${nodeData.assignee}` : ''}`;
      tooltip.style.display = 'block';
      tooltip.style.left = (event.offsetX || event.layerX || 0) + 20 + 'px';
      tooltip.style.top = (event.offsetY || event.layerY || 0) - 10 + 'px';
    }
  }).on('mouseout', function () {
    if (tooltip) tooltip.style.display = 'none';
  });
}

export function initGraph() {
  const container = document.getElementById('view-graph');
  store.on('epics', () => {
    if (store.get('currentView') === 'graph') {
      renderGraph(container);
    }
  });
}
