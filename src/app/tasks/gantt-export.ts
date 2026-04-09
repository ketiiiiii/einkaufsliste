/**
 * Generates a self-contained interactive HTML string for a read-only Gantt chart.
 * All phases are pre-expanded. Supports: expand/collapse, hover tooltips, bar click selection, arrow highlighting.
 * No editing, no board navigation, no drag.
 */

type ExportGanttRow = {
  id: string;
  title: string;
  note?: string;
  color: string; // ColorToken
  duration: number;
  unit?: "h" | "d";
  iterations?: number;
  indent: number;
  absoluteES: number;
  absoluteEF: number;
  isCritical: boolean;
  hasSubTasks: boolean;
  assignee?: string;
  phaseId?: string; // for subtasks: their parent phase id
};

type ExportArrow = {
  id: string;
  from: string;
  to: string;
  path: string;
  color: string;
  w: number;
  dash?: string;
  lagLabel?: { text: string; x: number; y: number; color: string };
};

type ExportLoopArrow = {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
};

type ExportLoopZone = {
  id: string;
  x: number;
  w: number;
  y: number;
  h: number;
  color: string;
  label: string;
};

type ExportBackEdge = {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
};

export type GanttExportData = {
  rows: ExportGanttRow[];
  fwdRoutes: ExportArrow[];
  subRoutes: ExportArrow[];
  loopRoutes: ExportLoopArrow[];
  backEdges: ExportBackEdge[];
  loopZones: ExportLoopZone[];
  maxHours: number;
  title: string;
};

const GANTT_COLORS: Record<string, string> = {
  amber: "#fbbf24", sky: "#38bdf8", rose: "#fb7185",
  emerald: "#34d399", violet: "#a78bfa", zinc: "#a1a1aa",
  orange: "#fb923c", teal: "#2dd4bf", indigo: "#818cf8",
  mint: "#86efac",
};

const ROW_H = 36;
const HEADER_H = 40;
const LABEL_W = 300;
const HR_W = 18;
const PAD = 12;
const HOURS_PER_DAY = 8;

function fmtDuration(hours: number): string {
  if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) return `${hours / HOURS_PER_DAY}d`;
  if (hours >= HOURS_PER_DAY) return `${(hours / HOURS_PER_DAY).toFixed(1)}d`;
  return `${hours}h`;
}

export function generateGanttHTML(data: GanttExportData): string {
  const { rows, fwdRoutes, subRoutes, loopRoutes, backEdges, loopZones, maxHours, title } = data;

  const svgH = HEADER_H + rows.length * ROW_H + PAD;
  const svgTimeW = maxHours * HR_W + PAD * 2;

  // Collect all unique arrow colors for markers
  const usedColors = new Set<string>();
  for (const r of [...fwdRoutes, ...subRoutes]) usedColors.add(r.color);

  // Day ticks
  const dayTicks: number[] = [];
  for (let h = 0; h <= maxHours; h += HOURS_PER_DAY) dayTicks.push(h);
  const showHourTicks = maxHours <= 48;

  // Track which rows are phases (for collapse/expand data)
  const phaseRows = rows.filter(r => r.indent === 0 && r.hasSubTasks);
  const phaseIds = phaseRows.map(r => r.id);

  // Build child mapping: phaseId -> row indices of subtasks
  const phaseChildIndices: Record<string, number[]> = {};
  for (const pid of phaseIds) phaseChildIndices[pid] = [];
  rows.forEach((r, i) => {
    if (r.indent > 0 && r.phaseId && phaseChildIndices[r.phaseId]) {
      phaseChildIndices[r.phaseId].push(i);
    }
  });

  // JSON data for JS interactivity
  const jsonRows = JSON.stringify(rows.map(r => ({
    id: r.id, title: r.title, note: r.note || '', color: r.color,
    indent: r.indent, hasSubTasks: r.hasSubTasks, phaseId: r.phaseId || null,
    isCritical: r.isCritical, assignee: r.assignee || null,
    absoluteES: r.absoluteES, absoluteEF: r.absoluteEF,
    duration: r.duration, unit: r.unit, iterations: r.iterations || 1,
  })));

  const jsonArrows = JSON.stringify([
    ...fwdRoutes.map(a => ({ ...a, type: 'fwd' })),
    ...subRoutes.map(a => ({ ...a, type: 'sub' })),
  ]);

  // --- Build label SVG content ---
  function buildLabelSVG(): string {
    let s = '';
    // Clip
    s += `<defs><clipPath id="lc"><rect x="0" y="0" width="${LABEL_W - 6}" height="${svgH}"/></clipPath></defs>`;
    // Row backgrounds
    rows.forEach((r, i) => {
      const isPhase = r.indent === 0;
      const bg = isPhase ? (i % 2 === 0 ? '#f4f4f6' : '#ebebed') : (i % 2 === 0 ? '#fafafa' : '#f3f3f5');
      s += `<rect data-row="${i}" x="0" y="${HEADER_H + i * ROW_H}" width="${LABEL_W}" height="${ROW_H}" fill="${bg}" class="row-bg" style="cursor:pointer"/>`;
      s += `<line x1="0" y1="${HEADER_H + (i + 1) * ROW_H}" x2="${LABEL_W}" y2="${HEADER_H + (i + 1) * ROW_H}" stroke="${isPhase ? '#d4d4d8' : '#e8e8ea'}" stroke-width="1"/>`;
    });
    // Labels
    rows.forEach((r, i) => {
      const labelX = r.indent > 0 ? 20 : r.hasSubTasks ? 18 : 8;
      // Indent line
      if (r.indent > 0) {
        s += `<line x1="12" y1="${HEADER_H + (i - 0.5) * ROW_H}" x2="12" y2="${HEADER_H + i * ROW_H + ROW_H / 2}" stroke="#d4d4d8" stroke-width="1"/>`;
      }
      // Expand toggle
      if (r.hasSubTasks) {
        s += `<g class="toggle" data-phase="${r.id}" style="cursor:pointer">`;
        s += `<rect x="0" y="${HEADER_H + i * ROW_H}" width="22" height="${ROW_H}" fill="transparent"/>`;
        s += `<text x="6" y="${HEADER_H + i * ROW_H + ROW_H / 2 + 4}" fill="#a1a1aa" font-size="9" class="nosel toggle-icon" data-phase="${r.id}">▼</text>`;
        s += `</g>`;
      }
      // Label text
      const fill = r.isCritical ? '#c2410c' : r.indent > 0 ? '#52525b' : '#3f3f46';
      const fw = r.isCritical ? '700' : r.indent > 0 ? '400' : '600';
      const fs = r.indent > 0 ? 10 : 11;
      const prefix = r.isCritical && r.indent === 0 ? '● ' : '';
      const escaped = escapeHTML(prefix + r.title);
      s += `<text data-row="${i}" data-rowid="${r.id}" x="${labelX}" y="${HEADER_H + i * ROW_H + ROW_H / 2 + 4}" fill="${fill}" font-size="${fs}" font-weight="${fw}" clip-path="url(#lc)" class="nosel label-text" style="cursor:default">${escaped}</text>`;
      // Assignee badge
      if (r.assignee) {
        const cx = LABEL_W - 42;
        const cy = HEADER_H + i * ROW_H + ROW_H / 2;
        s += `<circle cx="${cx}" cy="${cy}" r="7" fill="#818cf8" opacity="0.9"/>`;
        s += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" class="nosel">${escapeHTML(r.assignee.substring(0, 2).toUpperCase())}</text>`;
      }
    });
    // Header
    s += `<line x1="0" y1="${HEADER_H}" x2="${LABEL_W}" y2="${HEADER_H}" stroke="#e4e4e7" stroke-width="1"/>`;
    s += `<text x="8" y="${HEADER_H - 12}" fill="#a1a1aa" font-size="10" font-weight="600">TASK</text>`;
    return s;
  }

  // --- Build time SVG content ---
  function buildTimeSVG(): string {
    let s = '';
    // Background
    s += `<rect x="0" y="0" width="${svgTimeW}" height="${svgH}" fill="transparent"/>`;
    // Row backgrounds
    rows.forEach((r, i) => {
      const isPhase = r.indent === 0;
      const bg = isPhase ? (i % 2 === 0 ? '#f4f4f6' : '#ebebed') : (i % 2 === 0 ? '#fafafa' : '#f3f3f5');
      s += `<rect data-row="${i}" x="0" y="${HEADER_H + i * ROW_H}" width="${svgTimeW}" height="${ROW_H}" fill="${bg}" class="time-row-bg"/>`;
      s += `<line x1="0" y1="${HEADER_H + (i + 1) * ROW_H}" x2="${svgTimeW}" y2="${HEADER_H + (i + 1) * ROW_H}" stroke="${isPhase ? '#d4d4d8' : '#e8e8ea'}" stroke-width="1"/>`;
    });
    // Day column shading
    dayTicks.forEach((h, di) => {
      if (di % 2 === 1) {
        const w = Math.min(HOURS_PER_DAY * HR_W, (maxHours - h) * HR_W);
        s += `<rect x="${h * HR_W}" y="${HEADER_H}" width="${w}" height="${rows.length * ROW_H}" fill="rgba(0,0,0,0.018)"/>`;
      }
    });
    // Loop zones
    loopZones.forEach(z => {
      s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${z.color}" opacity="0.06" rx="4"/>`;
      s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="none" stroke="${z.color}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.25" rx="4"/>`;
      s += `<line x1="${z.x + z.w}" y1="${z.y}" x2="${z.x + z.w}" y2="${z.y + z.h + ROW_H}" stroke="${z.color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>`;
    });
    // Grid lines
    if (showHourTicks) {
      for (let h = 0; h <= maxHours; h++) {
        if (h % HOURS_PER_DAY !== 0) {
          s += `<line x1="${h * HR_W}" y1="${HEADER_H}" x2="${h * HR_W}" y2="${svgH - PAD}" stroke="#f0f0f2" stroke-width="1"/>`;
        }
      }
    }
    dayTicks.forEach(h => {
      s += `<line x1="${h * HR_W}" y1="${HEADER_H - 10}" x2="${h * HR_W}" y2="${svgH - PAD}" stroke="#e4e4e7" stroke-width="1"/>`;
    });
    // Day headers
    dayTicks.forEach((h, di) => {
      const next = dayTicks[di + 1] ?? maxHours;
      const cx = h * HR_W + (next - h) * HR_W / 2;
      s += `<text x="${cx}" y="${HEADER_H - 20}" text-anchor="middle" fill="#71717a" font-size="10" font-weight="600">${di === 0 ? 'Tag 1' : `Tag ${di + 1}`}</text>`;
    });
    // Hour sub-labels
    if (showHourTicks) {
      for (let h = 0; h <= maxHours; h++) {
        if (h % HOURS_PER_DAY !== 0) {
          s += `<text x="${h * HR_W}" y="${HEADER_H - 6}" text-anchor="middle" fill="#d4d4d8" font-size="8">${h % HOURS_PER_DAY}h</text>`;
        }
      }
    }
    // Arrow markers
    s += `<defs>`;
    s += `<marker id="arr-loop" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill="#8b5cf6"/></marker>`;
    for (const clr of usedColors) {
      s += `<marker id="arr-${clr.replace('#', '')}" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill="${clr}"/></marker>`;
    }
    s += `</defs>`;
    // Back-edge loop arrows
    backEdges.forEach(be => {
      s += `<g class="arrow" data-arrowid="${be.id}">`;
      s += `<path d="${be.path}" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-dasharray="5 3" stroke-linejoin="round" marker-end="url(#arr-loop)"/>`;
      s += `<text x="${be.labelX}" y="${be.labelY}" text-anchor="middle" fill="#8b5cf6" font-size="9" font-weight="700" class="nosel">${escapeHTML(be.label)}</text>`;
      s += `</g>`;
    });
    // Forward arrows
    fwdRoutes.forEach(r => {
      s += `<g class="arrow" data-arrowid="${r.id}" data-from="${r.from}" data-to="${r.to}">`;
      if (r.lagLabel) {
        s += `<text x="${r.lagLabel.x}" y="${r.lagLabel.y}" fill="${r.lagLabel.color}" font-size="8" font-weight="600">${escapeHTML(r.lagLabel.text)}</text>`;
      }
      s += `<path d="${r.path}" fill="none" stroke="${r.color}" stroke-width="${r.w}"${r.dash ? ` stroke-dasharray="${r.dash}"` : ''} stroke-linejoin="round" marker-end="url(#arr-${r.color.replace('#', '')})"/>`;
      s += `</g>`;
    });
    // Sub-board loop arrows
    loopRoutes.forEach(r => {
      s += `<g class="arrow" data-arrowid="${r.id}">`;
      s += `<path d="${r.path}" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-dasharray="5 3" stroke-linejoin="round" marker-end="url(#arr-loop)"/>`;
      s += `<text x="${r.labelX}" y="${r.labelY}" text-anchor="middle" fill="#8b5cf6" font-size="9" font-weight="700" class="nosel">${escapeHTML(r.label)}</text>`;
      s += `</g>`;
    });
    // Sub-board forward arrows
    subRoutes.forEach(r => {
      s += `<g class="arrow" data-arrowid="${r.id}" data-from="${r.from}" data-to="${r.to}">`;
      if (r.lagLabel) {
        s += `<text x="${r.lagLabel.x}" y="${r.lagLabel.y}" fill="${r.lagLabel.color}" font-size="8" font-weight="600">${escapeHTML(r.lagLabel.text)}</text>`;
      }
      s += `<path d="${r.path}" fill="none" stroke="${r.color}" stroke-width="${r.w}" stroke-linejoin="round" marker-end="url(#arr-${r.color.replace('#', '')})"/>`;
      s += `</g>`;
    });
    // Bars
    rows.forEach((r, i) => {
      const col = GANTT_COLORS[r.color] ?? '#a1a1aa';
      const barX = r.absoluteES * HR_W + 2;
      const barW = Math.max((r.absoluteEF - r.absoluteES) * HR_W - 4, 4);
      const barY = HEADER_H + i * ROW_H + 6;
      const barH = ROW_H - 12;
      const durH = r.hasSubTasks ? (r.absoluteEF - r.absoluteES) : (r.unit === 'h' ? r.duration : r.duration * HOURS_PER_DAY);
      const iters = Math.max(1, r.iterations ?? 1);
      const singleBarW = iters > 1 ? Math.max((barW - (iters - 1) * 3) / iters, 2) : barW;

      s += `<g class="bar" data-row="${i}" data-rowid="${r.id}" style="cursor:pointer">`;
      if (iters > 1) {
        for (let si = 0; si < iters; si++) {
          const segX = barX + si * (singleBarW + 3);
          const op = (r.isCritical ? 0.9 - si * 0.06 : 0.55 - si * 0.05);
          s += `<rect x="${segX}" y="${barY}" width="${singleBarW}" height="${barH}" rx="3" fill="${col}" opacity="${op}"/>`;
        }
        if (barW > 32) {
          s += `<text x="${barX + barW / 2}" y="${barY + barH / 2 + 4}" text-anchor="middle" fill="#fff" font-size="9" font-weight="700" class="nosel" style="pointer-events:none">↺ ${iters}× ${fmtDuration(durH)}</text>`;
        }
      } else {
        const op = r.isCritical ? 0.9 : r.indent > 0 ? 0.4 : 0.55;
        s += `<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="${col}" opacity="${op}"/>`;
        if (barW > 24) {
          s += `<text x="${barX + barW / 2}" y="${barY + barH / 2 + 4}" text-anchor="middle" fill="#fff" font-size="9" font-weight="600" class="nosel" style="pointer-events:none">${fmtDuration(durH)}</text>`;
        }
      }
      s += `</g>`;
    });
    // Header separator
    s += `<line x1="0" y1="${HEADER_H}" x2="${svgTimeW}" y2="${HEADER_H}" stroke="#e4e4e7" stroke-width="1"/>`;
    return s;
  }

  const labelSvgContent = buildLabelSVG();
  const timeSvgContent = buildTimeSVG();

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHTML(title)} — Gantt</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;background:#fff;color:#3f3f46}
.nosel{-webkit-user-select:none;user-select:none}
.gantt-wrap{display:flex;flex-direction:column;height:100vh}
.gantt-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e4e7;padding:12px 20px;flex-shrink:0}
.gantt-header h1{font-size:14px;font-weight:600;color:#3f3f46}
.gantt-header .actions{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;gap:4px;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa;padding:4px 10px;font-size:12px;color:#52525b;cursor:pointer;transition:background .15s}
.btn:hover{background:#f0f0f2}
.btn.active{border-color:#a5b4fc;background:#eef2ff;color:#4338ca}
.gantt-body{flex:1;overflow:auto;padding:16px}
.gantt-container{display:flex;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
.label-col{flex-shrink:0;border-right:1px solid #e4e4e7;background:#fff;z-index:2;position:sticky;left:0}
.time-col{overflow-x:auto;flex:1}
.tooltip{position:fixed;z-index:1000;min-width:200px;max-width:360px;background:#fff;border:1px solid #d4d4d8;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:8px 10px;font-size:12px;color:#3f3f46;white-space:pre-wrap;line-height:1.4;pointer-events:none;display:none}
.tooltip.visible{display:block}
.sel-ring{display:none}
.sel-ring.active{display:block}
/* Dim unrelated on selection */
.dimmed .arrow{opacity:0.12}
.dimmed .arrow.highlight{opacity:1}
.dimmed .bar{opacity:0.15}
.dimmed .bar.highlight{opacity:1}
.dimmed .row-bg.highlight{fill:#dbeafe !important}
.dimmed .row-bg.highlight-related{fill:#eff6ff !important}
.dimmed .time-row-bg.highlight{fill:#dbeafe !important}
.dimmed .time-row-bg.highlight-related{fill:#eff6ff !important}
</style>
</head>
<body>
<div class="gantt-wrap">
  <div class="gantt-header">
    <div style="display:flex;align-items:center;gap:12px">
      <h1>${escapeHTML(title)} — Gantt</h1>
      <button class="btn" id="toggleAll">⊟ Einklappen</button>
    </div>
    <div class="actions">
      <span style="font-size:11px;color:#a1a1aa">Exportiert am ${new Date().toLocaleDateString('de-CH')}</span>
    </div>
  </div>
  <div class="gantt-body">
    <div class="gantt-container" id="ganttContainer">
      <div class="label-col" style="width:${LABEL_W}px;min-width:${LABEL_W}px">
        <svg id="labelSvg" width="${LABEL_W}" height="${svgH}" style="display:block;font-family:inherit;font-size:12px">
          ${labelSvgContent}
        </svg>
      </div>
      <div class="time-col">
        <svg id="timeSvg" width="${svgTimeW}" height="${svgH}" style="display:block;min-width:${svgTimeW}px;font-family:inherit;font-size:12px">
          ${timeSvgContent}
        </svg>
      </div>
    </div>
  </div>
</div>
<div class="tooltip" id="tooltip"></div>

<script>
(function(){
  const ROWS = ${jsonRows};
  const ARROWS = ${jsonArrows};
  const ROW_H = ${ROW_H}, HEADER_H = ${HEADER_H};

  // Phase collapse state — all expanded initially
  const collapsed = new Set();

  // Selection state
  let selectedRowId = null;

  function getPhaseIds() {
    return ROWS.filter(r => r.indent === 0 && r.hasSubTasks).map(r => r.id);
  }

  function getChildRowIds(phaseId) {
    return ROWS.filter(r => r.phaseId === phaseId).map(r => r.id);
  }

  // Toggle visibility
  function togglePhase(phaseId) {
    if (collapsed.has(phaseId)) collapsed.delete(phaseId);
    else collapsed.add(phaseId);
    updateVisibility();
  }

  function updateVisibility() {
    // Determine which rows are hidden
    const hidden = new Set();
    for (const pid of collapsed) {
      for (const cid of getChildRowIds(pid)) {
        hidden.add(cid);
      }
    }

    // Update toggle icons
    document.querySelectorAll('.toggle-icon').forEach(el => {
      const pid = el.dataset.phase;
      el.textContent = collapsed.has(pid) ? '▶' : '▼';
    });

    // Hide/show rows and shift visible rows
    const labelSvg = document.getElementById('labelSvg');
    const timeSvg = document.getElementById('timeSvg');
    let visIdx = 0;
    const rowMap = new Map(); // rowIndex -> visibleIndex

    ROWS.forEach((r, i) => {
      const isHidden = hidden.has(r.id);
      // Label column elements
      labelSvg.querySelectorAll('[data-row="'+i+'"]').forEach(el => {
        el.style.display = isHidden ? 'none' : '';
      });
      // Time column elements
      timeSvg.querySelectorAll('[data-row="'+i+'"]').forEach(el => {
        el.style.display = isHidden ? 'none' : '';
      });
      // Elements by rowid
      labelSvg.querySelectorAll('[data-rowid="'+r.id+'"]').forEach(el => {
        el.style.display = isHidden ? 'none' : '';
      });
      timeSvg.querySelectorAll('[data-rowid="'+r.id+'"]').forEach(el => {
        el.style.display = isHidden ? 'none' : '';
      });

      if (!isHidden) {
        rowMap.set(i, visIdx);
        visIdx++;
      }
    });

    // Adjust SVG heights
    const newH = HEADER_H + visIdx * ROW_H + ${PAD};
    labelSvg.setAttribute('height', newH);
    timeSvg.setAttribute('height', newH);

    // Reposition visible rows
    ROWS.forEach((r, i) => {
      if (hidden.has(r.id)) return;
      const vi = rowMap.get(i);
      const newY = HEADER_H + vi * ROW_H;

      // Move label bg rects
      labelSvg.querySelectorAll('rect.row-bg[data-row="'+i+'"]').forEach(el => {
        el.setAttribute('y', newY);
      });
      // Move label texts
      labelSvg.querySelectorAll('text.label-text[data-row="'+i+'"]').forEach(el => {
        el.setAttribute('y', newY + ROW_H / 2 + 4);
      });

      // Move time bg rects
      timeSvg.querySelectorAll('rect.time-row-bg[data-row="'+i+'"]').forEach(el => {
        el.setAttribute('y', newY);
      });
    });

    // Update toggle button text
    const allPhases = getPhaseIds();
    const allCollapsed = allPhases.length > 0 && allPhases.every(p => collapsed.has(p));
    document.getElementById('toggleAll').textContent = allCollapsed ? '⊞ Alle Tasks' : '⊟ Einklappen';
  }

  // Toggle all button
  document.getElementById('toggleAll').addEventListener('click', function() {
    const allPhases = getPhaseIds();
    const allCollapsed = allPhases.every(p => collapsed.has(p));
    if (allCollapsed) {
      collapsed.clear();
    } else {
      allPhases.forEach(p => collapsed.add(p));
    }
    updateVisibility();
  });

  // Phase toggle clicks
  document.querySelectorAll('.toggle').forEach(el => {
    el.addEventListener('click', function() {
      togglePhase(this.dataset.phase);
    });
  });

  // Bar click → selection
  document.querySelectorAll('.bar').forEach(el => {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      const rid = this.dataset.rowid;
      selectedRowId = (selectedRowId === rid) ? null : rid;
      updateSelection();
    });
  });

  // Label row click → selection
  document.querySelectorAll('.row-bg').forEach(el => {
    el.addEventListener('click', function(e) {
      const i = parseInt(this.dataset.row);
      const rid = ROWS[i]?.id;
      if (!rid) return;
      selectedRowId = (selectedRowId === rid) ? null : rid;
      updateSelection();
    });
  });

  // Deselect on background click
  document.getElementById('timeSvg').addEventListener('click', function(e) {
    if (e.target === this || e.target.tagName === 'rect' && e.target.classList.contains('time-row-bg')) return;
    if (e.target === this) { selectedRowId = null; updateSelection(); }
  });

  function updateSelection() {
    const container = document.getElementById('ganttContainer');
    const related = new Set();
    const arrowIds = new Set();

    if (selectedRowId) {
      related.add(selectedRowId);
      ARROWS.forEach(a => {
        if (a.from === selectedRowId || a.to === selectedRowId) {
          arrowIds.add(a.id);
          related.add(a.from);
          related.add(a.to);
        }
      });
      container.classList.add('dimmed');
    } else {
      container.classList.remove('dimmed');
    }

    // Highlight bars
    document.querySelectorAll('.bar').forEach(el => {
      const rid = el.dataset.rowid;
      el.classList.toggle('highlight', related.has(rid));
    });

    // Highlight arrows
    document.querySelectorAll('.arrow').forEach(el => {
      const aid = el.dataset.arrowid;
      const from = el.dataset.from;
      const to = el.dataset.to;
      el.classList.toggle('highlight', arrowIds.has(aid) || related.has(from) || related.has(to));
    });

    // Highlight row backgrounds
    document.querySelectorAll('.row-bg').forEach(el => {
      const i = parseInt(el.dataset.row);
      const rid = ROWS[i]?.id;
      el.classList.remove('highlight', 'highlight-related');
      if (rid === selectedRowId) el.classList.add('highlight');
      else if (related.has(rid)) el.classList.add('highlight-related');
    });
    document.querySelectorAll('.time-row-bg').forEach(el => {
      const i = parseInt(el.dataset.row);
      const rid = ROWS[i]?.id;
      el.classList.remove('highlight', 'highlight-related');
      if (rid === selectedRowId) el.classList.add('highlight');
      else if (related.has(rid)) el.classList.add('highlight-related');
    });
  }

  // Tooltip on label hover
  const tooltip = document.getElementById('tooltip');
  let hideTimer = null;

  document.querySelectorAll('.label-text').forEach(el => {
    el.addEventListener('mouseenter', function(e) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const i = parseInt(this.dataset.row);
      const row = ROWS[i];
      if (!row) return;
      const note = row.note || '';
      if (!note) {
        tooltip.classList.remove('visible');
        return;
      }
      tooltip.textContent = note;
      const rect = this.getBoundingClientRect();
      tooltip.style.left = rect.left + 'px';
      tooltip.style.top = (rect.bottom + 4) + 'px';
      tooltip.classList.add('visible');
    });
    el.addEventListener('mouseleave', function() {
      hideTimer = setTimeout(() => { tooltip.classList.remove('visible'); }, 250);
    });
  });

})();
</script>
</body>
</html>`;
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
