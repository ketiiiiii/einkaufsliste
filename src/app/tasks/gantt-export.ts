/**
 * Generates a self-contained interactive HTML string for a read-only Gantt chart.
 * All phases are pre-expanded. Supports: expand/collapse, hover tooltips, bar click selection, arrow highlighting.
 * No editing, no board navigation, no drag.
 */

export type ExportGanttRow = {
  id: string;
  title: string;
  note?: string;
  color: string;
  duration: number;
  unit?: "h" | "d";
  iterations?: number;
  indent: number;
  absoluteES: number;
  absoluteEF: number;
  isCritical: boolean;
  hasSubTasks: boolean;
  assignee?: string;
  phaseId?: string;
};

export type ExportConnection = {
  id: string;
  from: string;
  to: string;
  lag?: number;
  lagUnit?: string;
  loopDuration?: number;
  loopDurationUnit?: string;
  level: "phase" | "sub";
  isBackEdge: boolean;
};

export type GanttExportData = {
  rows: ExportGanttRow[];
  connections: ExportConnection[];
  maxHours: number;
  title: string;
};

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeJSString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/<\/script>/gi, '<\\/script>');
}

export function generateGanttHTML(data: GanttExportData): string {
  const { title } = data;
  // Serialize data safely for embedding in script
  const jsonData = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHTML(title)} — Gantt</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;background:#fff;color:#3f3f46}
.gantt-wrap{display:flex;flex-direction:column;height:100vh}
.gantt-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e4e7;padding:12px 20px;flex-shrink:0}
.gantt-header h1{font-size:14px;font-weight:600;color:#3f3f46}
.gantt-header .actions{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:4px;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa;padding:4px 10px;font-size:12px;color:#52525b;cursor:pointer;transition:background .15s}
.btn:hover{background:#f0f0f2}
.btn.active{background:#fff;color:#18181b;box-shadow:0 1px 2px rgba(0,0,0,0.08);font-weight:600}
.view-toggle{display:flex;border-radius:10px;border:1px solid #e4e4e7;background:#f4f4f5;padding:3px;gap:0}
.view-toggle .btn{border:none;background:transparent;border-radius:8px;padding:4px 12px}
.view-toggle .btn.active{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.08)}
.gantt-body{flex:1;overflow:auto;padding:16px}
.gantt-container{display:flex;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
.label-col{flex-shrink:0;border-right:1px solid #e4e4e7;background:#fff;z-index:2;position:sticky;left:0}
.time-col{overflow-x:auto;flex:1}
.tooltip{position:fixed;z-index:1000;min-width:200px;max-width:360px;background:#fff;border:1px solid #d4d4d8;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:8px 10px;font-size:12px;color:#3f3f46;white-space:pre-wrap;line-height:1.4;pointer-events:auto;display:none}
.tooltip.visible{display:block;pointer-events:auto}
.list-view{display:none}
.list-view.active{display:block}
.gantt-view.active .gantt-container{display:flex}
.list-table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.list-table th{padding:8px 12px;font-weight:600;color:#71717a;background:#f9fafb;border-bottom:1px solid #e4e4e7}
.list-table td{padding:6px 12px;border-bottom:1px solid #f4f4f5}
.list-table .phase-row td{font-weight:600;color:#3f3f46}
.list-table .sub-row td{color:#52525b}
.list-table .note-cell{color:#a1a1aa;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list-table .dur-cell{text-align:right;font-variant-numeric:tabular-nums;color:#71717a}
.list-table .day-cell{font-variant-numeric:tabular-nums;color:#71717a;width:48px}
</style>
</head>
<body>
<div class="gantt-wrap">
  <div class="gantt-header">
    <div style="display:flex;align-items:center;gap:12px">
      <h1>${escapeHTML(title)}</h1>
      <div class="view-toggle">
        <button class="btn active" id="viewGantt">Gantt</button>
        <button class="btn" id="viewList">Liste</button>
      </div>
      <button class="btn" id="toggleAll">⊟ Einklappen</button>
    </div>
    <div class="actions">
      <span style="font-size:11px;color:#a1a1aa">Exportiert am ${new Date().toLocaleDateString('de-CH')}</span>
    </div>
  </div>
  <div class="gantt-body">
    <div class="gantt-container" id="ganttContainer">
      <div class="label-col" id="labelCol"></div>
      <div class="time-col" id="timeCol"></div>
    </div>
    <div class="list-view" id="listView"></div>
  </div>
</div>
<div class="tooltip" id="tooltip"></div>

<script>
(function(){
  var DATA = ${jsonData};
  var ALL_ROWS = DATA.rows;
  var ALL_CONNS = DATA.connections;
  var MAX_H = DATA.maxHours;

  var ROW_H = 36, HEADER_H = 40, LABEL_W = 300, HR_W = 18, PAD = 12, HPD = 8;
  var COLORS = {amber:"#fbbf24",sky:"#38bdf8",rose:"#fb7185",emerald:"#34d399",violet:"#a78bfa",zinc:"#a1a1aa",orange:"#fb923c",teal:"#2dd4bf",indigo:"#818cf8",mint:"#86efac"};

  var collapsed = new Set();
  var selectedRowId = null;

  function fmtDur(h) {
    if (h >= HPD && h % HPD === 0) return (h / HPD) + 'd';
    if (h >= HPD) return (h / HPD).toFixed(1) + 'd';
    return h + 'h';
  }
  function toH(d, u) { return u === 'h' ? d : d * HPD; }
  function lagH(lag, u) { return lag ? (u === 'd' ? lag * HPD : lag) : 0; }
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function getVisibleRows() {
    var vis = [];
    ALL_ROWS.forEach(function(r, i) {
      if (r.indent > 0 && r.phaseId && collapsed.has(r.phaseId)) return;
      vis.push(Object.assign({}, r, { origIdx: i, visIdx: vis.length }));
    });
    return vis;
  }

  function render() {
    var rows = getVisibleRows();
    var rowIdx = {};
    rows.forEach(function(r, i) { rowIdx[r.id] = i; });
    var svgH = HEADER_H + rows.length * ROW_H + PAD;
    var svgTimeW = MAX_H * HR_W + PAD * 2;

    // Bar pixel extents
    var barPx = rows.map(function(r) {
      return { l: r.absoluteES * HR_W + 2, r: r.absoluteEF * HR_W - 2 };
    });

    // --- Determine visible connections & compute arrow paths ---
    var fwdArrows = [];
    var backArrows = [];
    var loopZones = [];

    ALL_CONNS.forEach(function(c) {
      var fi = rowIdx[c.from], ti = rowIdx[c.to];
      if (fi === undefined || ti === undefined) return;

      // Determine visibility: phase-level conns shown when phases NOT expanded
      // sub-level conns shown when parent phases ARE expanded
      if (c.level === 'phase') {
        var fromPhase = c.from, toPhase = c.to;
        // If either endpoint phase is expanded → subtask arrows replace this
        if (!c.isBackEdge) {
          var fromExpanded = ALL_ROWS.some(function(r) { return r.phaseId === fromPhase && !collapsed.has(fromPhase); });
          var toExpanded = ALL_ROWS.some(function(r) { return r.phaseId === toPhase && !collapsed.has(toPhase); });
          if (fromExpanded || toExpanded) return;
        }
      } else {
        // Sub-level: only show if parent phase is expanded
        var fp = c.from.split(':')[0], tp = c.to.split(':')[0];
        if (collapsed.has(fp) || collapsed.has(tp)) return;
      }

      if (c.isBackEdge) {
        var fromRow = rows[fi], toRow = rows[ti];
        var ELBOW = 14;
        var srcX = fromRow.absoluteEF * HR_W;
        var dstX = (toRow.absoluteES + toRow.absoluteEF) / 2 * HR_W;
        var srcY = HEADER_H + fi * ROW_H + ROW_H / 2;
        var dstY = HEADER_H + ti * ROW_H + ROW_H - 6;
        var bottomY = HEADER_H + (Math.max(fi, ti) + 1) * ROW_H;
        var path = 'M ' + srcX + ',' + srcY + ' H ' + (srcX + ELBOW) + ' V ' + bottomY + ' H ' + dstX + ' V ' + dstY;
        var label = c.loopDuration ? '↺ ' + fmtDur(toH(c.loopDuration, c.loopDurationUnit || 'h')) : '↺';
        backArrows.push({ id: c.id, path: path, label: label, labelX: (srcX + ELBOW + dstX) / 2, labelY: bottomY - 3, from: c.from, to: c.to });

        // Loop zone
        if (c.loopDuration) {
          var entryES = toRow.absoluteES;
          var loopHrs = toH(c.loopDuration, c.loopDurationUnit || 'h');
          var minRow = Math.min(fi, ti), maxRow = Math.max(fi, ti);
          loopZones.push({ x: entryES * HR_W, w: loopHrs * HR_W, y: HEADER_H + minRow * ROW_H, h: (maxRow - minRow + 1) * ROW_H, color: COLORS[toRow.color] || '#a1a1aa' });
        }
      } else if (c.loopDuration !== undefined) {
        // Sub-board loop arrow
        var srcX2 = barPx[fi].r + 2;
        var dstCX = (barPx[ti].l + barPx[ti].r) / 2;
        var srcY2 = HEADER_H + fi * ROW_H + ROW_H / 2;
        var bottomY2 = HEADER_H + (Math.max(fi, ti) + 1) * ROW_H + 4;
        var dstYL = HEADER_H + ti * ROW_H + ROW_H - 6;
        var lPath = 'M ' + srcX2 + ',' + srcY2 + ' H ' + (srcX2 + 14) + ' V ' + bottomY2 + ' H ' + dstCX + ' V ' + dstYL;
        var lLabel = '↺ ' + fmtDur(toH(c.loopDuration, c.loopDurationUnit || 'h'));
        backArrows.push({ id: c.id, path: lPath, label: lLabel, labelX: (srcX2 + 14 + dstCX) / 2, labelY: bottomY2 + 10, from: c.from, to: c.to });

        // Loop zone for sub-level
        var entryES2 = rows[ti].absoluteES;
        var loopHrs2 = toH(c.loopDuration, c.loopDurationUnit || 'h');
        var minRow2 = Math.min(fi, ti), maxRow2 = Math.max(fi, ti);
        loopZones.push({ x: entryES2 * HR_W, w: loopHrs2 * HR_W, y: HEADER_H + minRow2 * ROW_H, h: (maxRow2 - minRow2 + 1) * ROW_H, color: COLORS[rows[ti].color] || '#a1a1aa' });
      } else {
        // Forward arrow
        var col = COLORS[rows[ti].color] || '#a1a1aa';
        var path2 = routeFwd(fi, ti, barPx, rows.length);
        var lH = lagH(c.lag, c.lagUnit);
        var srcX3 = barPx[fi].r + 2;
        var srcY3 = HEADER_H + fi * ROW_H + ROW_H / 2;
        fwdArrows.push({ id: c.id, from: c.from, to: c.to, path: path2, color: col, w: c.level === 'sub' ? 1 : 1.4, lagLabel: lH > 0 ? { text: '+' + fmtDur(lH), x: srcX3 + 4, y: srcY3 - 4, color: col } : null });
      }
    });

    // --- Selection state ---
    var related = new Set();
    var arrowIds = new Set();
    if (selectedRowId) {
      related.add(selectedRowId);
      fwdArrows.concat(backArrows).forEach(function(a) {
        if (a.from === selectedRowId || a.to === selectedRowId) {
          arrowIds.add(a.id);
          if (a.from) related.add(a.from);
          if (a.to) related.add(a.to);
        }
      });
    }
    var hasSel = selectedRowId !== null;

    // --- Collect arrow colors for markers ---
    var usedColors = new Set();
    fwdArrows.forEach(function(a) { usedColors.add(a.color); });

    // -- Day ticks --
    var dayTicks = [];
    for (var h = 0; h <= MAX_H; h += HPD) dayTicks.push(h);
    var showHourTicks = MAX_H <= 48;

    // ========== Precompute zebra backgrounds (restart per phase) ==========
    var rowBg = [];
    var stripe = 0;
    rows.forEach(function(r) {
      if (r.indent === 0) stripe = 0; else stripe++;
      rowBg.push(stripe % 2 === 0 ? '#f4f4f5' : '#ffffff');
    });

    // ========== Build Label SVG ==========
    var ls = '';
    ls += '<defs><clipPath id="lc"><rect x="0" y="0" width="' + (LABEL_W - 6) + '" height="' + svgH + '"/></clipPath></defs>';
    rows.forEach(function(r, i) {
      var isPhase = r.indent === 0;
      var bg = rowBg[i];
      if (hasSel) { if (r.id === selectedRowId) bg = '#dbeafe'; else if (related.has(r.id)) bg = '#eff6ff'; }
      ls += '<rect data-row="' + i + '" data-rid="' + esc(r.id) + '" x="0" y="' + (HEADER_H + i * ROW_H) + '" width="' + LABEL_W + '" height="' + ROW_H + '" fill="' + bg + '" style="cursor:pointer" class="row-click"/>';
      ls += '<line x1="0" y1="' + (HEADER_H + (i + 1) * ROW_H) + '" x2="' + LABEL_W + '" y2="' + (HEADER_H + (i + 1) * ROW_H) + '" stroke="' + (isPhase ? '#d4d4d8' : '#e8e8ea') + '" stroke-width="1"/>';
    });
    rows.forEach(function(r, i) {
      var labelX = r.indent > 0 ? 20 : r.hasSubTasks ? 18 : 8;
      if (r.indent > 0) {
        ls += '<line x1="12" y1="' + (HEADER_H + (i - 0.5) * ROW_H) + '" x2="12" y2="' + (HEADER_H + i * ROW_H + ROW_H / 2) + '" stroke="#d4d4d8" stroke-width="1"/>';
      }
      if (r.hasSubTasks) {
        var isCol = collapsed.has(r.id);
        ls += '<g class="toggle-click" data-phase="' + esc(r.id) + '" style="cursor:pointer">';
        ls += '<rect x="0" y="' + (HEADER_H + i * ROW_H) + '" width="22" height="' + ROW_H + '" fill="transparent"/>';
        ls += '<text x="6" y="' + (HEADER_H + i * ROW_H + ROW_H / 2 + 4) + '" fill="#a1a1aa" font-size="9" style="user-select:none">' + (isCol ? '▶' : '▼') + '</text>';
        ls += '</g>';
      }
      var fill = r.isCritical ? '#c2410c' : r.indent > 0 ? '#52525b' : '#3f3f46';
      var fw = r.isCritical ? '700' : r.indent > 0 ? '400' : '600';
      var fs = r.indent > 0 ? 10 : 11;
      var prefix = r.isCritical && r.indent === 0 ? '● ' : '';
      var dimOp = hasSel && !related.has(r.id) ? ' opacity="0.2"' : '';
      ls += '<text data-rid="' + esc(r.id) + '" x="' + labelX + '" y="' + (HEADER_H + i * ROW_H + ROW_H / 2 + 4) + '" fill="' + fill + '" font-size="' + fs + '" font-weight="' + fw + '" clip-path="url(#lc)" style="user-select:none;cursor:default" class="label-hover"' + dimOp + '>' + esc(prefix + r.title) + '</text>';
      if (r.assignee) {
        var cx = LABEL_W - 42, cy = HEADER_H + i * ROW_H + ROW_H / 2;
        ls += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#818cf8" opacity="0.9"/>';
        ls += '<text x="' + cx + '" y="' + (cy + 3.5) + '" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" style="user-select:none">' + esc(r.assignee.substring(0, 2).toUpperCase()) + '</text>';
      }
    });
    ls += '<line x1="0" y1="' + HEADER_H + '" x2="' + LABEL_W + '" y2="' + HEADER_H + '" stroke="#e4e4e7" stroke-width="1"/>';
    ls += '<text x="8" y="' + (HEADER_H - 12) + '" fill="#a1a1aa" font-size="10" font-weight="600">TASK</text>';

    // ========== Build Time SVG ==========
    var ts = '';
    ts += '<rect x="0" y="0" width="' + svgTimeW + '" height="' + svgH + '" fill="transparent" class="bg-click"/>';
    rows.forEach(function(r, i) {
      var isPhase = r.indent === 0;
      var bg = rowBg[i];
      if (hasSel) { if (r.id === selectedRowId) bg = '#dbeafe'; else if (related.has(r.id)) bg = '#eff6ff'; }
      ts += '<rect x="0" y="' + (HEADER_H + i * ROW_H) + '" width="' + svgTimeW + '" height="' + ROW_H + '" fill="' + bg + '"/>';
      ts += '<line x1="0" y1="' + (HEADER_H + (i + 1) * ROW_H) + '" x2="' + svgTimeW + '" y2="' + (HEADER_H + (i + 1) * ROW_H) + '" stroke="' + (isPhase ? '#d4d4d8' : '#e8e8ea') + '" stroke-width="1"/>';
    });
    // Day shading
    dayTicks.forEach(function(h, di) {
      if (di % 2 === 1) {
        var w = Math.min(HPD * HR_W, (MAX_H - h) * HR_W);
        ts += '<rect x="' + (h * HR_W) + '" y="' + HEADER_H + '" width="' + w + '" height="' + (rows.length * ROW_H) + '" fill="rgba(0,0,0,0.018)"/>';
      }
    });
    // Loop zones
    loopZones.forEach(function(z) {
      ts += '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" fill="' + z.color + '" opacity="0.06" rx="4"/>';
      ts += '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" fill="none" stroke="' + z.color + '" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.25" rx="4"/>';
      ts += '<line x1="' + (z.x + z.w) + '" y1="' + z.y + '" x2="' + (z.x + z.w) + '" y2="' + (z.y + z.h + ROW_H) + '" stroke="' + z.color + '" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>';
    });
    // Grid
    if (showHourTicks) {
      for (var h = 0; h <= MAX_H; h++) {
        if (h % HPD !== 0) ts += '<line x1="' + (h * HR_W) + '" y1="' + HEADER_H + '" x2="' + (h * HR_W) + '" y2="' + (svgH - PAD) + '" stroke="#f0f0f2" stroke-width="1"/>';
      }
    }
    dayTicks.forEach(function(h) {
      ts += '<line x1="' + (h * HR_W) + '" y1="' + (HEADER_H - 10) + '" x2="' + (h * HR_W) + '" y2="' + (svgH - PAD) + '" stroke="#e4e4e7" stroke-width="1"/>';
    });
    // Day headers
    dayTicks.forEach(function(h, di) {
      var next = dayTicks[di + 1] || MAX_H;
      var cx = h * HR_W + (next - h) * HR_W / 2;
      ts += '<text x="' + cx + '" y="' + (HEADER_H - 20) + '" text-anchor="middle" fill="#71717a" font-size="10" font-weight="600">' + (di === 0 ? 'Tag 1' : 'Tag ' + (di + 1)) + '</text>';
    });
    // Hour sub-labels
    if (showHourTicks) {
      for (var h2 = 0; h2 <= MAX_H; h2++) {
        if (h2 % HPD !== 0) ts += '<text x="' + (h2 * HR_W) + '" y="' + (HEADER_H - 6) + '" text-anchor="middle" fill="#d4d4d8" font-size="8">' + (h2 % HPD) + 'h</text>';
      }
    }
    // Arrow markers
    ts += '<defs>';
    ts += '<marker id="arr-loop" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill="#8b5cf6"/></marker>';
    usedColors.forEach(function(clr) {
      ts += '<marker id="arr-' + clr.replace('#', '') + '" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill="' + clr + '"/></marker>';
    });
    ts += '</defs>';
    // Back-edge arrows
    backArrows.forEach(function(a) {
      var op = hasSel ? (arrowIds.has(a.id) ? 1 : 0.12) : 1;
      ts += '<g opacity="' + op + '">';
      ts += '<path d="' + a.path + '" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-dasharray="5 3" stroke-linejoin="round" marker-end="url(#arr-loop)"/>';
      ts += '<text x="' + a.labelX + '" y="' + a.labelY + '" text-anchor="middle" fill="#8b5cf6" font-size="9" font-weight="700" style="user-select:none">' + esc(a.label) + '</text>';
      ts += '</g>';
    });
    // Forward arrows
    fwdArrows.forEach(function(a) {
      var op = hasSel ? (arrowIds.has(a.id) ? 1 : 0.12) : 1;
      ts += '<g opacity="' + op + '">';
      if (a.lagLabel) ts += '<text x="' + a.lagLabel.x + '" y="' + a.lagLabel.y + '" fill="' + a.lagLabel.color + '" font-size="8" font-weight="600">' + esc(a.lagLabel.text) + '</text>';
      ts += '<path d="' + a.path + '" fill="none" stroke="' + a.color + '" stroke-width="' + a.w + '" stroke-linejoin="round" marker-end="url(#arr-' + a.color.replace('#', '') + ')"/>';
      ts += '</g>';
    });
    // Bars
    rows.forEach(function(r, i) {
      var col = COLORS[r.color] || '#a1a1aa';
      var bx = r.absoluteES * HR_W + 2;
      var bw = Math.max((r.absoluteEF - r.absoluteES) * HR_W - 4, 4);
      var by = HEADER_H + i * ROW_H + 6;
      var bh = ROW_H - 12;
      var durH = r.hasSubTasks ? (r.absoluteEF - r.absoluteES) : toH(r.duration, r.unit);
      var iters = Math.max(1, r.iterations || 1);
      var dimFactor = hasSel && !related.has(r.id) ? 0.15 : 1;
      var selRing = selectedRowId === r.id;

      ts += '<g class="bar-click" data-rid="' + esc(r.id) + '" style="cursor:pointer">';
      if (selRing) ts += '<rect x="' + (bx - 2) + '" y="' + (by - 2) + '" width="' + (bw + 4) + '" height="' + (bh + 4) + '" rx="6" fill="none" stroke="' + col + '" stroke-width="2" opacity="0.6"/>';
      if (iters > 1) {
        var sw = Math.max((bw - (iters - 1) * 3) / iters, 2);
        for (var si = 0; si < iters; si++) {
          var segX = bx + si * (sw + 3);
          var op = ((r.isCritical ? 0.9 - si * 0.06 : 0.55 - si * 0.05) * dimFactor).toFixed(2);
          ts += '<rect x="' + segX + '" y="' + by + '" width="' + sw + '" height="' + bh + '" rx="3" fill="' + col + '" opacity="' + op + '"/>';
        }
        if (bw > 32) ts += '<text x="' + (bx + bw / 2) + '" y="' + (by + bh / 2 + 4) + '" text-anchor="middle" fill="#fff" font-size="9" font-weight="700" style="user-select:none;pointer-events:none">↺ ' + iters + '× ' + fmtDur(durH) + '</text>';
      } else {
        var op2 = ((r.isCritical ? 0.9 : r.indent > 0 ? 0.4 : 0.55) * dimFactor).toFixed(2);
        ts += '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="4" fill="' + col + '" opacity="' + op2 + '"/>';
        if (bw > 24) ts += '<text x="' + (bx + bw / 2) + '" y="' + (by + bh / 2 + 4) + '" text-anchor="middle" fill="#fff" font-size="9" font-weight="600" style="user-select:none;pointer-events:none">' + fmtDur(durH) + '</text>';
      }
      ts += '</g>';
    });
    ts += '<line x1="0" y1="' + HEADER_H + '" x2="' + svgTimeW + '" y2="' + HEADER_H + '" stroke="#e4e4e7" stroke-width="1"/>';

    // ========== Apply ==========
    var labelCol = document.getElementById('labelCol');
    var timeCol = document.getElementById('timeCol');
    labelCol.style.width = LABEL_W + 'px';
    labelCol.style.minWidth = LABEL_W + 'px';
    labelCol.innerHTML = '<svg id="labelSvg" width="' + LABEL_W + '" height="' + svgH + '" style="display:block;font-family:inherit;font-size:12px">' + ls + '</svg>';
    timeCol.innerHTML = '<svg id="timeSvg" width="' + svgTimeW + '" height="' + svgH + '" style="display:block;min-width:' + svgTimeW + 'px;font-family:inherit;font-size:12px">' + ts + '</svg>';

    // ========== Attach event listeners ==========
    // Toggle clicks
    document.querySelectorAll('.toggle-click').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = this.getAttribute('data-phase');
        if (collapsed.has(pid)) collapsed.delete(pid); else collapsed.add(pid);
        render();
      });
    });
    // Row click → selection
    document.querySelectorAll('.row-click').forEach(function(el) {
      el.addEventListener('click', function() {
        var rid = this.getAttribute('data-rid');
        selectedRowId = (selectedRowId === rid) ? null : rid;
        render();
      });
    });
    // Bar click → selection
    document.querySelectorAll('.bar-click').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var rid = this.getAttribute('data-rid');
        selectedRowId = (selectedRowId === rid) ? null : rid;
        render();
      });
    });
    // Background click → deselect
    document.querySelectorAll('.bg-click').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target === this) { selectedRowId = null; render(); }
      });
    });
    // Tooltip on label hover
    var tooltip = document.getElementById('tooltip');
    var hideTimer = null;
    document.querySelectorAll('.label-hover').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        var rid = this.getAttribute('data-rid');
        var row = ALL_ROWS.find(function(r) { return r.id === rid; });
        if (!row || !row.note) { tooltip.classList.remove('visible'); return; }
        tooltip.textContent = row.note;
        var rect = this.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 4) + 'px';
        tooltip.classList.add('visible');
      });
      el.addEventListener('mouseleave', function() {
        hideTimer = setTimeout(function() { tooltip.classList.remove('visible'); }, 250);
      });
    });
    tooltip.addEventListener('mouseenter', function() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } });
    tooltip.addEventListener('mouseleave', function() { hideTimer = setTimeout(function() { tooltip.classList.remove('visible'); }, 250); });

    // Update toggle-all button
    var phaseIds = ALL_ROWS.filter(function(r) { return r.indent === 0 && r.hasSubTasks; }).map(function(r) { return r.id; });
    var allCollapsed = phaseIds.length > 0 && phaseIds.every(function(p) { return collapsed.has(p); });
    document.getElementById('toggleAll').textContent = allCollapsed ? '⊞ Alle Tasks' : '⊟ Einklappen';
  }

  // Simple arrow routing: H-V-H (3 segments)
  function routeFwd(fi, ti, barPx, rowCount) {
    var srcX = barPx[fi].r + 2;
    var dstX = barPx[ti].l - 2;
    var srcY = HEADER_H + fi * ROW_H + ROW_H / 2;
    var dstY = HEADER_H + ti * ROW_H + ROW_H / 2;
    if (fi === ti) return 'M ' + srcX + ',' + srcY + ' H ' + dstX;
    if (dstX > srcX + 8) {
      var chanX = Math.min(srcX + 12, (srcX + dstX) / 2);
      return 'M ' + srcX + ',' + srcY + ' H ' + chanX + ' V ' + dstY + ' H ' + dstX;
    }
    var goDown = fi < ti;
    var gutterY = goDown ? HEADER_H + (fi + 1) * ROW_H - 2 : HEADER_H + fi * ROW_H + 2;
    var approachX = Math.max(4, dstX - 12);
    return 'M ' + srcX + ',' + srcY + ' V ' + gutterY + ' H ' + approachX + ' V ' + dstY + ' H ' + dstX;
  }

  // Toggle all button
  document.getElementById('toggleAll').addEventListener('click', function() {
    var phaseIds = ALL_ROWS.filter(function(r) { return r.indent === 0 && r.hasSubTasks; }).map(function(r) { return r.id; });
    var allCollapsed = phaseIds.every(function(p) { return collapsed.has(p); });
    if (allCollapsed) collapsed.clear();
    else phaseIds.forEach(function(p) { collapsed.add(p); });
    render();
  });

  // ========== List view ==========
  var currentView = 'gantt'; // 'gantt' or 'list'

  function renderList() {
    var html = '<div style="border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)">';
    html += '<table class="list-table"><thead><tr><th class="day-cell">Tag</th><th>Task</th><th>Notiz</th><th class="dur-cell" style="width:56px">Dauer</th></tr></thead><tbody>';
    ALL_ROWS.forEach(function(r) {
      var col = COLORS[r.color] || '#a1a1aa';
      var isPhase = r.indent === 0;
      var bgAlpha = isPhase ? 0.15 : 0.07;
      var bgA = Math.round(bgAlpha * 255).toString(16);
      if (bgA.length < 2) bgA = '0' + bgA;
      var bg = col + bgA;
      var day = Math.floor(r.absoluteES / HPD) + 1;
      var durH = r.hasSubTasks ? (r.absoluteEF - r.absoluteES) : toH(r.duration, r.unit) * Math.max(1, r.iterations || 1);
      var cls = isPhase ? 'phase-row' : 'sub-row';
      html += '<tr class="' + cls + '" style="background:' + bg + ';border-left:3px solid ' + col + '">';
      html += '<td class="day-cell">' + day + '</td>';
      html += '<td' + (isPhase ? '' : ' style="padding-left:24px"') + '>';
      if (isPhase) html += '<span style="color:' + col + '">● </span>';
      html += esc(r.title) + '</td>';
      html += '<td class="note-cell">' + (r.note ? esc(r.note) : '') + '</td>';
      html += '<td class="dur-cell">' + fmtDur(durH) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('listView').innerHTML = html;
  }

  function switchView(v) {
    currentView = v;
    var gc = document.getElementById('ganttContainer');
    var lv = document.getElementById('listView');
    var btnG = document.getElementById('viewGantt');
    var btnL = document.getElementById('viewList');
    var btnToggle = document.getElementById('toggleAll');
    if (v === 'gantt') {
      gc.style.display = 'flex';
      lv.style.display = 'none';
      btnG.classList.add('active');
      btnL.classList.remove('active');
      btnToggle.style.display = '';
    } else {
      gc.style.display = 'none';
      lv.style.display = 'block';
      btnG.classList.remove('active');
      btnL.classList.add('active');
      btnToggle.style.display = 'none';
      renderList();
    }
  }

  document.getElementById('viewGantt').addEventListener('click', function() { switchView('gantt'); });
  document.getElementById('viewList').addEventListener('click', function() { switchView('list'); });

  // Initial render
  render();
})();
</script>
</body>
</html>`;
}
