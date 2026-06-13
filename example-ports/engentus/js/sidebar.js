/**
 * sidebar.js — All sidebar rendering: static params, sim list, bolt sets,
 *              edit panel, run config.
 */
import { getState, setState, REMOVE, PARAM_META, PARAM_CATS } from './store.js';
import { createSim, deleteSim, cloneSim,
         deleteBoltSet, cloneBoltSet, getSimTMax } from './simulation.js';
import { refreshMCView, stopPlay } from './scrubber.js';
import { drawStaticChart }          from './chart.js';

// Tracks which bolt-set inline-edit forms are open across re-renders
const openEditForms = new Set();

// ── Top-level sidebar render ──────────────────────────────────────────
export function renderSidebar() {
  const s    = getState();
  const mode = s.ui.mode;
  document.getElementById('sec-static').style.display = mode === 'static' ? 'block' : 'none';
  document.getElementById('sec-mc').style.display     = mode === 'mc'     ? 'block' : 'none';
  document.getElementById('sec-run').style.display    = (mode === 'mc' && s.ui.activeSimId) ? 'block' : 'none';
  document.getElementById('sec-edit').style.display   = mode === 'edit'   ? 'block' : 'none';
  document.getElementById('scr').classList.toggle('hidden', mode !== 'mc');

  if (mode === 'static') renderStaticSection();
  if (mode === 'mc')     renderSimList();
  if (mode === 'edit')   renderEditPanel();
  renderBoltSets();
}

// ── Run config UI ─────────────────────────────────────────────────────
export function updateRunUI() {
  const s   = getState();
  const sim = s.simulations[s.ui.activeSimId];
  const running = sim?.status === 'running';
  const locked  = sim?.status === 'running' || sim?.status === 'done';
  const btnRun   = document.getElementById('btn-run');
  const btnPause = document.getElementById('btn-pause');
  const btnStop  = document.getElementById('btn-stop');
  if (!btnRun) return;
  btnRun.disabled   = running;
  btnPause.disabled = !running;
  btnStop.disabled  = !running;

  // Lock / unlock config inputs
  const cfgIds = ['cfg-n', 'cfg-tmax', 'cfg-dt'];
  cfgIds.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.disabled = locked;
    el.style.opacity = locked ? '0.45' : '';
    el.style.cursor  = locked ? 'not-allowed' : '';
  });
  // Lock indicator
  let lockNote = document.getElementById('cfg-lock-note');
  if (!lockNote) {
    lockNote = document.createElement('div');
    lockNote.id = 'cfg-lock-note';
    lockNote.style.cssText = 'font-size:10px;color:var(--t2);margin:4px 0 0;display:none';
    const runRow = document.querySelector('.run-row');
    if (runRow) runRow.parentNode.insertBefore(lockNote, runRow);
  }
  if (sim?.status === 'done') {
    lockNote.textContent = '🔒 Config locked — clone or create a new simulation to change';
    lockNote.style.display = '';
  } else if (sim?.status === 'running') {
    lockNote.textContent = '⏳ Simulation running…';
    lockNote.style.display = '';
  } else {
    lockNote.style.display = 'none';
  }

  const prog = sim?.progress || 0;
  document.getElementById('prog-fill').style.width = (prog * 100) + '%';
  const labels = { idle:'Ready', stale:'Ready to run', running:'Running…', done:'Complete ✓', stopped:'■ Stopped' };
  document.getElementById('prog-lbl').textContent = labels[sim?.status || 'idle'] || '';
  const fill = document.getElementById('prog-fill');
  if (sim?.status === 'stopped')    fill.style.background = 'var(--ylw)';
  else if (sim?.status === 'done')  fill.style.background = 'var(--grn)';
  else                              fill.style.background = 'var(--blue)';
  if (sim?.config?.tMax != null) {
    const cfgEl = document.getElementById('cfg-tmax');
    if (cfgEl) cfgEl.value = sim.config.tMax;
  }
  const tmax = getSimTMax();
  const timeSl = document.getElementById('time-sl');
  if (timeSl) timeSl.max = tmax;
}

// ── Static view section ───────────────────────────────────────────────
export function renderStaticSection() {
  const sv = getState().staticView;
  const container = document.getElementById('static-params-html');
  const rows = [
    { id:'sv-fapp',  label:'Applied shear F',  unit:'N',   min:500, max:100000, step:500, key:'F_alt_applied_N', fmt:v=>v.toFixed(0) },
    { id:'sv-rpm',   label:'Mill speed',        unit:'RPM', min:5,   max:20,    step:.5,  key:'rpm',      fmt:v=>v.toFixed(1) },
    { id:'sv-slm',   label:'σ_lim endurance',   unit:'MPa', min:20,  max:120,   step:1,   key:'sigma_lim',fmt:v=>v.toFixed(0) },
    { id:'sv-ms',    label:'SN slope m',         unit:'',    min:2,   max:8,     step:.1,  key:'m_slope',  fmt:v=>v.toFixed(1) },
    { id:'sv-probe', label:'Probe preload',      unit:'MPa', min:0,   max:600,   step:5,   key:'probe',    fmt:v=>v.toFixed(0) },
  ];
  container.innerHTML = rows.map(r => `
    <div class="probe-row">
      <label>${r.label}</label>
      <span class="probe-val" id="pv-${r.id}">${r.fmt(sv[r.key])} ${r.unit}</span>
    </div>
    <input type="range" id="${r.id}" min="${r.min}" max="${r.max}" step="${r.step}" value="${sv[r.key]}">`
  ).join('') + '<div id="static-info"></div>' +
    '<button id="static-save-sim-btn" class="save-sim-btn" title="Create a Monte Carlo simulation from the current bolt set state">⊕ Save as Simulation</button>';
  rows.forEach(r => {
    const el = document.getElementById(r.id);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      document.getElementById(`pv-${r.id}`).textContent = r.fmt(v) + ' ' + r.unit;
      setState({ staticView: { [r.key]: v } });
      drawStaticChart();
    });
  });
  // Save-as-simulation button
  const saveBtn = document.getElementById('static-save-sim-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      createSim();
      setState({ ui: { mode: 'mc' } });
      document.body.classList.remove('edit-mode');
      renderSidebar();
      refreshMCView();
    };
  }
  // drawStaticInfo is called inside drawStaticChart
}

// ── Simulation list ───────────────────────────────────────────────────
export function renderSimList() {
  const s    = getState();
  const sims = Object.values(s.simulations);
  const html = sims.length
    ? sims.map(sim => `
        <div class="sim-row ${sim.id===s.ui.activeSimId?'on':''}" data-sid="${sim.id}">
          <div class="sim-dot" style="background:${Object.values(s.boltSets).find(b=>sim.boltSetIds.includes(b.id))?.color||'#64748b'}"></div>
          <span class="sim-name">${sim.name}</span>
          <span class="sim-badge ${sim.status}">${sim.status==='stopped'?'■ stopped':sim.status}</span>
          <div class="sim-acts">
            <button class="sab" data-act="clone" data-sid="${sim.id}" title="Clone">⎘</button>
            <button class="sab" data-act="del"   data-sid="${sim.id}" title="Delete">✕</button>
          </div>
        </div>`).join('')
    : '<p style="font-size:11px;color:var(--t2);padding:4px 0">No simulations yet.</p>';

  document.getElementById('sim-list').innerHTML =
    html + `<button class="add-sim-btn" id="new-sim-btn2">+ New simulation</button>`;

  document.getElementById('sim-list').querySelectorAll('.sim-row').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.sim-acts')) return;
      if (getState().ui.scrubber.playing) stopPlay();
      setState({ ui: { activeSimId: el.dataset.sid } });
      renderSidebar();
      updateRunUI();
      refreshMCView();
    });
  });
  document.getElementById('sim-list').querySelectorAll('.sab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.act === 'del')   { deleteSim(btn.dataset.sid);   renderSidebar(); refreshMCView(); }
      if (btn.dataset.act === 'clone') { cloneSim(btn.dataset.sid);    renderSidebar(); }
    });
  });
  document.getElementById('new-sim-btn2')?.addEventListener('click', () => {
    createSim(); renderSidebar();
  });
  updateRunUI();
}

// ── Edit panel ────────────────────────────────────────────────────────
export function renderEditPanel() {
  const container = document.getElementById('edit-panel-html'); if (!container) return;
  const ce = getState().chartEdit || {};
  const bFills  = (ce.bandFills  && ce.bandFills.length)  ? ce.bandFills  : ['#bbf7d0','#d9f99d','#fef08a','#fde68a'];
  const annots  = ce.annotations || [];
  container.innerHTML = `
    <div class="edit-group">
      <div class="edit-group-title">Labels</div>
      <div class="efield-row"><label>Title</label>
        <input type="text" id="ep-title" value="${(ce.title||'').replace(/"/g,'&quot;')}"></div>
      <div class="efield-row"><label>X axis</label>
        <input type="text" id="ep-xlabel" value="${(ce.xLabel||'').replace(/"/g,'&quot;')}"></div>
      <div class="efield-row"><label>Y axis</label>
        <input type="text" id="ep-ylabel" value="${(ce.yLabel||'').replace(/"/g,'&quot;')}"></div>
      <div class="efield-row"><label>Title size</label>
        <input type="number" id="ep-tsize" value="${ce.titleSize||13}" min="8" max="24" step="1"></div>
      <div class="efield-row"><label>Axis size</label>
        <input type="number" id="ep-asize" value="${ce.axisSize||12}" min="8" max="20" step="1"></div>
      <div class="efield-row"><label>Show grid</label>
        <input type="checkbox" id="ep-showgrid" ${ce.showGrid!==false?'checked':''}></div>
    </div>
    <div class="edit-group">
      <div class="edit-group-title">Band Colours</div>
      ${bFills.map((c,i)=>`<div class="efield-row"><label>Band ${i+1}</label>
        <input type="color" id="ep-band-${i}" value="${c}"></div>`).join('')}
    </div>
    <div class="edit-group">
      <div class="edit-group-title">Annotations</div>
      <div class="annot-list" id="annot-list">
        ${annots.map(a=>`<div class="annot-row" data-aid="${a.id}">
          <input type="text"   class="a-text" value="${(a.text||'').replace(/"/g,'&quot;')}" placeholder="label text" data-aid="${a.id}">
          <input type="number" class="a-x"    value="${(a.xMPa||0).toFixed(0)}" title="x (MPa)" data-aid="${a.id}">
          <input type="number" class="a-y"    value="${(a.yMPa||0).toFixed(0)}" title="y (MPa)" data-aid="${a.id}">
          <input type="color"  class="a-col"  value="${a.color||'#1e293b'}" data-aid="${a.id}">
          <button class="annot-del" data-aid="${a.id}" title="Delete">✕</button>
        </div>`).join('')}
      </div>
      <button class="add-annot-btn" id="add-annot-btn">+ Add annotation</button>
    </div>`;

  // Label inputs
  const labelKeyMap = { title:'title', xlabel:'xLabel', ylabel:'yLabel' };
  ['title','xlabel','ylabel'].forEach(key => {
    const el = document.getElementById(`ep-${key}`); if (!el) return;
    el.addEventListener('input', () => {
      setState({ chartEdit: { [labelKeyMap[key]]: el.value } });
      drawStaticChart();
    });
  });
  const sizeKeyMap = { tsize:'titleSize', asize:'axisSize' };
  ['tsize','asize'].forEach(key => {
    const el = document.getElementById(`ep-${key}`); if (!el) return;
    el.addEventListener('input', () => {
      setState({ chartEdit: { [sizeKeyMap[key]]: parseFloat(el.value)||12 } });
      drawStaticChart();
    });
  });
  const sgEl = document.getElementById('ep-showgrid');
  if (sgEl) sgEl.addEventListener('change', () => {
    setState({ chartEdit: { showGrid: sgEl.checked } });
    drawStaticChart();
  });
  // Band colours
  bFills.forEach((_, i) => {
    const el = document.getElementById(`ep-band-${i}`); if (!el) return;
    el.addEventListener('input', () => {
      const newFills = [...(getState().chartEdit.bandFills || bFills)];
      newFills[i] = el.value;
      setState({ chartEdit: { bandFills: newFills } });
      drawStaticChart();
    });
  });
  // Annotations
  document.querySelectorAll('.a-text,.a-x,.a-y,.a-col').forEach(el => {
    el.addEventListener('input', syncAnnotFromPanel);
  });
  document.querySelectorAll('.annot-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const annots2 = (getState().chartEdit.annotations||[]).filter(a => a.id !== btn.dataset.aid);
      setState({ chartEdit: { annotations: annots2 } });
      drawStaticChart(); renderEditPanel();
    });
  });
  document.getElementById('add-annot-btn')?.addEventListener('click', () => {
    const newA = { id:'a_'+Date.now(), text:'Label', xMPa:200, yMPa:50, fontSize:11, color:'#1e293b', fontWeight:'600' };
    const annots2 = [...(getState().chartEdit.annotations||[]), newA];
    setState({ chartEdit: { annotations: annots2 } });
    drawStaticChart(); renderEditPanel();
  });
}

function syncAnnotFromPanel() {
  const rows = document.querySelectorAll('#annot-list .annot-row');
  const annots = Array.from(rows).map(row => {
    const aid  = row.dataset.aid;
    const orig = (getState().chartEdit.annotations||[]).find(a => a.id === aid) || {};
    return {
      ...orig, id: aid,
      text:  row.querySelector('.a-text')?.value || '',
      xMPa:  parseFloat(row.querySelector('.a-x')?.value)  || 0,
      yMPa:  parseFloat(row.querySelector('.a-y')?.value)  || 0,
      color: row.querySelector('.a-col')?.value || '#1e293b',
    };
  });
  setState({ chartEdit: { annotations: annots } });
  // drawAnnotations is called inside drawStaticChart
  drawStaticChart();
}

// ── Bolt sets ─────────────────────────────────────────────────────────
export function renderBoltSets() {
  const s    = getState();
  const open = s.ui.openBsSets;
  const container = document.getElementById('bs-list');
  container.innerHTML = Object.values(s.boltSets).map(bs => `
    <div class="bs-item" id="bs-${bs.id}">
      <div class="bs-head" data-bsid="${bs.id}">
        <div class="bs-dot" style="background:${bs.color}"></div>
        <span class="bs-name">${bs.name}</span>
        <div class="bs-actions">
          <button class="bs-act" data-act="edit"  data-bsid="${bs.id}" title="Edit name/colour">✎</button>
          <button class="bs-act" data-act="clone" data-bsid="${bs.id}" title="Clone">⎘</button>
          <button class="bs-act" data-act="del"   data-bsid="${bs.id}" title="Delete">✕</button>
        </div>
        <span class="bs-chev ${open[bs.id]?'open':''}">▶</span>
      </div>
      <div class="bs-edit-form" id="bsef-${bs.id}">
        <div class="bs-ef-row"><label>Name</label>
          <input type="text"  id="bsn-${bs.id}" value="${bs.name.replace(/"/g,'&quot;')}"></div>
        <div class="bs-ef-row"><label>Colour</label>
          <input type="color" id="bsc-${bs.id}" value="${bs.color}">
          <button class="bs-ef-save" data-bsid="${bs.id}">Save</button></div>
      </div>
      <div class="bs-params ${open[bs.id]?'open':''}" id="bsp-${bs.id}">
        ${renderBoltSetParams(bs)}
      </div>
    </div>`).join('');

  // Restore open edit forms after DOM rebuild
  openEditForms.forEach(id => {
    const form = document.getElementById(`bsef-${id}`);
    if (form) form.classList.add('open');
  });

  container.querySelectorAll('.bs-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.bs-act')) return;
      const id = head.dataset.bsid;
      setState({ ui: { openBsSets: { [id]: !getState().ui.openBsSets[id] } } });
      renderBoltSets();
    });
  });
  container.querySelectorAll('.bs-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.bsid;
      if (btn.dataset.act === 'del') {
        deleteBoltSet(id); openEditForms.delete(id); renderSidebar(); drawStaticChart();
      }
      if (btn.dataset.act === 'clone') { cloneBoltSet(id); renderSidebar(); }
      if (btn.dataset.act === 'edit') {
        const form = document.getElementById(`bsef-${id}`);
        if (form) {
          const nowOpen = form.classList.toggle('open');
          if (nowOpen) openEditForms.add(id); else openEditForms.delete(id);
        }
      }
    });
  });
  container.querySelectorAll('.bs-ef-save').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id    = btn.dataset.bsid;
      const name  = document.getElementById(`bsn-${id}`)?.value.trim() || getState().boltSets[id]?.name || 'Bolt Set';
      const color = document.getElementById(`bsc-${id}`)?.value || '#64748b';
      setState({ boltSets: { [id]: { name, color } } });
      openEditForms.delete(id);
      drawStaticChart(); renderBoltSets();
    });
  });

  for (const bs of Object.values(s.boltSets)) {
    if (!open[bs.id]) continue;
    bindBoltSetParams(bs);
  }
}

function renderBoltSetParams(bs) {
  const cats = {};
  for (const [pid, pmeta] of Object.entries(PARAM_META)) {
    if (!cats[pmeta.cat]) cats[pmeta.cat] = [];
    cats[pmeta.cat].push(pid);
  }
  let html = '';
  for (const [cat, pids] of Object.entries(cats)) {
    html += `<div class="cat-lbl">${PARAM_CATS[cat]||cat}</div>`;
    for (const pid of pids) {
      const pm = PARAM_META[pid], p = bs.params[pid];
      if (pm.type === 'toggle') {
        html += `<div class="prow" id="prow-${bs.id}-${pid}">
          <div class="prow-top">
            <span class="plabel">${pm.label}</span>
            <label class="toggle-chk-row">
              <input type="checkbox" id="pch-${bs.id}-${pid}" ${p.value > 0.5 ? 'checked' : ''}>
              <span class="pval" id="pvv-${bs.id}-${pid}">${p.value > 0.5 ? 'Yes' : 'No'}</span>
            </label>
          </div>
        </div>`;
      } else {
        html += `<div class="prow" id="prow-${bs.id}-${pid}">
          <div class="prow-top">
            <span class="plabel">${pm.label}${pm.unit?' ('+pm.unit+')':''}</span>
            <span class="pval" id="pvv-${bs.id}-${pid}">${pm.fmt(p.value)}</span>
            <label class="free-tog" title="Sample from distribution">
              <div class="tog-track ${p.free?'on':''}" id="tt-${bs.id}-${pid}"><div class="tog-knob"></div></div>
              <span class="tog-lbl">free</span>
            </label>
          </div>
          <input type="range" id="psl-${bs.id}-${pid}" min="${pm.min}" max="${pm.max}" step="${pm.step}" value="${p.value}">
          <div class="dist-box ${p.free?'open':''}" id="db-${bs.id}-${pid}">
            ${renderDistEditor(bs.id, pid, p)}
          </div>
        </div>`;
      }
    }
  }
  return html;
}

function renderDistEditor(bsId, pid, p) {
  const dists = ['fixed','normal','uniform','lognormal','triangular'];
  const sel = `<select class="dist-sel" id="ds-${bsId}-${pid}">${dists.map(d=>`<option value="${d}" ${p.dist===d?'selected':''}>${d}</option>`)}</select>`;
  return sel + `<div class="dist-inputs" id="di-${bsId}-${pid}">${getDistInputs(bsId, pid, p)}</div>`;
}

function getDistInputs(bsId, pid, p) {
  const f = (id, label, val) =>
    `<div class="dig"><label>${label}</label><input class="dig input" id="${id}" type="number" step="any" value="${(+val).toFixed(4).replace(/\.?0+$/,'')}"></div>`;
  switch (p.dist) {
    case 'fixed':      return '';
    case 'normal':     return f(`dn-mean-${bsId}-${pid}`,'mean',p.mean)+f(`dn-std-${bsId}-${pid}`,'std',p.std);
    case 'uniform':    return f(`du-min-${bsId}-${pid}`,'min',p.umin)+f(`du-max-${bsId}-${pid}`,'max',p.umax);
    case 'lognormal':  return f(`dl-lm-${bsId}-${pid}`,'log-mean',p.lm)+f(`dl-ls-${bsId}-${pid}`,'log-std',p.ls);
    case 'triangular': return f(`dt-a-${bsId}-${pid}`,'min',p.tri_a)+f(`dt-c-${bsId}-${pid}`,'mode',p.tri_c)+f(`dt-b-${bsId}-${pid}`,'max',p.tri_b);
    default: return '';
  }
}

function bindBoltSetParams(bs) {
  for (const pid of Object.keys(PARAM_META)) {
    const pm = PARAM_META[pid];
    if (pm.type === 'toggle') {
      const ch = document.getElementById(`pch-${bs.id}-${pid}`); if (!ch) continue;
      ch.addEventListener('change', () => {
        const v = ch.checked ? 1 : 0;
        setState({ boltSets: { [bs.id]: { params: { [pid]: { value: v } } } } });
        const lbl = document.getElementById(`pvv-${bs.id}-${pid}`);
        if (lbl) lbl.textContent = v > 0.5 ? 'Yes' : 'No';
      });
      continue;
    }
    const sl = document.getElementById(`psl-${bs.id}-${pid}`); if (!sl) continue;
    sl.addEventListener('input', () => {
      const v = parseFloat(sl.value);
      document.getElementById(`pvv-${bs.id}-${pid}`).textContent = pm.fmt(v);
      setState({ boltSets: { [bs.id]: { params: { [pid]: { value: v } } } } });
    });
    const tt = document.getElementById(`tt-${bs.id}-${pid}`); if (!tt) continue;
    tt.addEventListener('click', () => {
      const cur = getState().boltSets[bs.id].params[pid].free;
      setState({ boltSets: { [bs.id]: { params: { [pid]: { free: !cur } } } } });
      tt.classList.toggle('on', !cur);
      document.getElementById(`db-${bs.id}-${pid}`)?.classList.toggle('open', !cur);
    });
    const ds = document.getElementById(`ds-${bs.id}-${pid}`); if (!ds) continue;
    ds.addEventListener('change', () => {
      setState({ boltSets: { [bs.id]: { params: { [pid]: { dist: ds.value } } } } });
      const di = document.getElementById(`di-${bs.id}-${pid}`);
      if (di) di.innerHTML = getDistInputs(bs.id, pid, getState().boltSets[bs.id].params[pid]);
      bindDistInputs(bs.id, pid);
    });
    bindDistInputs(bs.id, pid);
  }
}

function bindDistInputs(bsId, pid) {
  const inputs = { normal:['mean','std'], uniform:['min','max'], lognormal:['lm','ls'], triangular:['a','c','b'] };
  const keys   = { normal:['mean','std'], uniform:['umin','umax'], lognormal:['lm','ls'], triangular:['tri_a','tri_c','tri_b'] };
  const prfxMap = { normal:'dn', uniform:'du', lognormal:'dl', triangular:'dt' };
  const dist    = getState().boltSets[bsId].params[pid].dist;
  const prfx    = prfxMap[dist]; if (!prfx) return;
  (inputs[dist]||[]).forEach((lbl, i) => {
    const el = document.getElementById(`${prfx}-${lbl}-${bsId}-${pid}`); if (!el) return;
    el.addEventListener('input', () => {
      setState({ boltSets: { [bsId]: { params: { [pid]: { [(keys[dist]||[])[i]]: parseFloat(el.value)||0 } } } } });
    });
  });
}
