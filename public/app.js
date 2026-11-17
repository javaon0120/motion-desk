import { clone, sceneDuration, timelineDuration, changesBetween, documentPositions } from './scene.js';
import { curveGeometry, dragCurveControl, curveBadgePath } from './curve.js';
import { resizeGroup, moveTracks } from './timeline.js';
import { isRowSelected, updateSelection, selectionTracks } from './selection.js';

const $ = (selector) => document.querySelector(selector);
const asset = (name) => `./assets/figma/${name}.svg`;
const img = (name, className = '') => `<img class="${className}" src="${asset(name)}" alt="" draggable="false">`;
const barGrip = (edge, name, value) => `<span class="bar-grip" data-resize="${edge}" role="slider" tabindex="0" aria-label="${escapeHtml(name)} ${edge === 'start' ? '开始' : '结束'}时间" aria-valuemin="0" aria-valuemax="20000" aria-valuenow="${value}" title="拖动缩放${edge === 'start' ? '起点' : '终点'}">${img('bar-handle', 'bar-grip-default')}${img('bar-handle-selected', 'bar-grip-selected')}</span>`;
const keyframeIcon = `${img('key-default', 'node-default')}${img('key-hover', 'node-hover')}${img('key-selected', 'node-selected')}`;
const curveBadgeIcon = (points) => `<svg class="easing-miniature" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x=".5" y=".5" width="13" height="13" rx="2.5"/><path d="${curveBadgePath(points)}"/></svg>`;
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const params = new URLSearchParams(location.search);
const sessionId = params.get('session');
const token = params.get('token');
const presets = { in: [.42, 0, 1, 1], out: [0, 0, .58, 1], inout: [.42, 0, .58, 1], linear: [0, 0, 1, 1], back: [.34, 1.35, .64, 1] };
const propertyNames = { opacity: 'Opacity', x: 'Position X', y: 'Position Y', scale: 'Scale' };
const histories = [];
const future = [];
const collapsed = new Set();
let session, scene, original, selectedId, selectedProperty;
let selectedRows = [], suppressSelectionClick = false;
let time = 0, total = 2000, playing = false, looping = true, raf = 0, previousFrame = 0;
let saveTimer, saveChain = Promise.resolve(), dirty = false, editSequence = 0, saveError;
let previewConnected = false, previewOrigin, previewTimer, toastTimer, lastHandoff;
let curveDragBounds = null;

async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Motion-Token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请重试');
  return result;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}
function track() { return scene.tracks.find((item) => item.id === selectedId) || scene.tracks[0]; }
function elementId(item = track()) { return item.elementId || item.id; }
function selectedElementId() { return selectedId ? elementId() : null; }
function setSelection(id, property = null, options = {}) {
  if (document.activeElement?.closest('#inspector')) document.activeElement.blur();
  selectedRows = updateSelection(selectedRows, id, property, options);
  const active = selectedRows.at(-1);
  selectedId = active?.id || null;
  selectedProperty = active?.property || null;
  paintSelection(); renderInspector(); postPreview();
}
function selectedElementIds() { return new Set(selectionTracks(scene, selectedRows).map((item) => elementId(item))); }
function bindSelectionMove(element, event, before, startX, width, id, property = null) {
  const items = selectionTracks(scene, selectedRows), initial = items.map(clone);
  const ids = new Set(items.map((item) => item.id));
  const affectedGroups = groups().filter((group) => group.tracks.some((item) => ids.has(item.id)));
  let dragged = false;
  bindDrag(element, event, (next) => {
    dragged ||= Math.hypot(next.clientX - startX, next.clientY - event.clientY) >= 3;
    const delta = Math.round((next.clientX - startX) / width * total / 10) * 10;
    const timings = moveTracks(initial, delta);
    items.forEach((item, i) => Object.assign(item, timings[i]));
    affectedGroups.forEach((group) => paintGroupTiming(group, $(`[data-summary="${group.id}"]`)));
    postPreview();
  }, () => {
    if (JSON.stringify(before) !== JSON.stringify(scene)) { remember(before); setDirty(); }
    else if (!dragged && selectedRows.length > 1) setSelection(id, property);
    renderTracks(); renderInspector(); postPreview();
  });
}
function groups() {
  const map = new Map();
  for (const item of scene.tracks) {
    const id = elementId(item);
    if (!map.has(id)) map.set(id, { id, name: item.name, tracks: [] });
    map.get(id).tracks.push(item);
  }
  return [...map.values()];
}
function propertyRows(group) {
  return group.tracks.flatMap((item) => item.property ? [{ item, property: item.property }] :
    Object.keys(propertyNames).filter((property) => item.from[property] !== item.to[property]).map((property) => ({ item, property })));
}
function paintGroupTiming(group, summary) {
  const start = Math.min(...group.tracks.map((item) => item.delay));
  const end = Math.max(...group.tracks.map((item) => item.delay + item.duration));
  summary.style.setProperty('--start', `${start / total * 100}%`);
  summary.style.setProperty('--length', `${(end - start) / total * 100}%`);
  summary.querySelector('[data-resize="start"]').setAttribute('aria-valuenow', start);
  summary.querySelector('[data-resize="end"]').setAttribute('aria-valuenow', end);
  for (const item of group.tracks) {
    $('#tracks').querySelectorAll(`[data-track="${item.id}"] .property-motion`).forEach((motion) => {
      motion.style.setProperty('--start', `${item.delay / total * 100}%`);
      motion.style.setProperty('--length', `${item.duration / total * 100}%`);
      const frames = framesFor(item, motion.closest('[data-property]').dataset.property);
      motion.querySelectorAll('[data-keyframe]').forEach((node, i) => { node.style.left = `${frames[i].offset * 100}%`; });
      motion.querySelectorAll('.channel-line').forEach((node, i) => {
        node.style.left = `${frames[i].offset * 100}%`;
        node.style.width = `${(frames[i + 1].offset - frames[i].offset) * 100}%`;
      });
      motion.querySelectorAll('.easing-badge').forEach((node, i) => { node.style.left = `${(frames[i].offset + frames[i + 1].offset) / 2 * 100}%`; });
    });
  }
}
function framesFor(item, property) {
  return item.property && item.keyframes ? item.keyframes : [{ offset: 0, value: item.from[property] }, { offset: 1, value: item.to[property] }];
}
function moveKeyframe(item, initial, property, index, delta) {
  const frames = framesFor(initial, property);
  if (item.property) {
    const minTime = index ? initial.delay + frames[index - 1].offset * initial.duration + 1 : 0;
    const maxTime = index < frames.length - 1 ? initial.delay + frames[index + 1].offset * initial.duration - 1 : Math.min(20000, initial.delay + 10000);
    const nextTime = clamp(initial.delay + frames[index].offset * initial.duration + delta, minTime, maxTime);
    const absolute = frames.map((entry, i) => i === index ? nextTime : initial.delay + entry.offset * initial.duration);
    const start = Math.max(0, Math.min(initial.delay, absolute[0]));
    const end = Math.max(initial.delay + initial.duration, absolute.at(-1));
    item.delay = clamp(Math.round(start), Math.max(0, Math.ceil(end - 10000)), 10000);
    item.duration = clamp(Math.round(end - item.delay), 10, 10000);
    item.keyframes = frames.map((entry, i) => ({ ...entry, offset: clamp((absolute[i] - item.delay) / item.duration, 0, 1) }));
  } else if (index === 0) {
    item.delay = clamp(initial.delay + delta, Math.max(0, initial.delay + initial.duration - 10000), initial.delay + initial.duration - 10);
    item.duration = initial.delay + initial.duration - item.delay;
  } else item.duration = clamp(initial.duration + delta, 10, 10000);
}
function postPreview() {
  if (!previewConnected || !scene) return;
  $('#preview').contentWindow.postMessage({ channel: 'motion-desk', type: 'render', scene, time, selected: selectedElementId(), editing: !playing }, previewOrigin);
}
function loadPreview() {
  const url = new URL(scene.previewUrl, location.origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('预览地址必须使用 HTTP 或 HTTPS');
  previewOrigin = url.origin;
  const frame = $('#preview');
  frame.onload = () => {
    previewConnected = false;
    frame.contentWindow.postMessage({ channel: 'motion-desk', type: 'hello' }, previewOrigin);
  };
  previewTimer = setTimeout(() => {
    if (!previewConnected) { $('#preview-status').hidden = false; $('#preview-status').textContent = '网页尚未连接，请检查开发页面是否已加载 bridge.js。'; }
  }, 6000);
  frame.src = url.href;
}
window.addEventListener('message', (event) => {
  if (event.source !== $('#preview').contentWindow || event.origin !== previewOrigin || event.data?.channel !== 'motion-desk') return;
  if (event.data.type === 'ready') {
    previewConnected = true;
    clearTimeout(previewTimer);
    $('#preview-status').hidden = true;
    postPreview();
  } else if (event.data.type === 'select' && scene) {
    const item = scene.tracks.find((item) => elementId(item) === event.data.id);
    if (item) select(item.id);
  } else if (event.data.type === 'layout' && scene) {
    const { origins, viewport } = event.data;
    if (!origins || !viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 ||
        !scene.tracks.every((item) => { const origin = origins[elementId(item)]; return origin && Number.isFinite(origin.x) && Number.isFinite(origin.y); })) return;
    const next = documentPositions(scene, origins, viewport);
    if (JSON.stringify(next.positioning) !== JSON.stringify(scene.positioning)) {
      for (const stack of [histories, future]) stack.forEach((snapshot, index) => {
        if (!snapshot.positioning) stack[index] = documentPositions(snapshot, origins, viewport);
      });
      if (!original.positioning) original = documentPositions(original, origins, viewport);
      scene = next;
      setDirty(); render();
    }
  } else if (event.data.type === 'toggle-playback' && scene && !document.querySelector('dialog[open]')) {
    play();
  } else if (event.data.type === 'applied') {
    const missing = event.data.missing || [];
    $('#preview-status').hidden = missing.length === 0;
    $('#preview-status').textContent = missing.length ? `网页中未找到元素：${missing.join('、')}` : '';
  }
});
function remember(before = clone(scene)) {
  histories.push(before);
  if (histories.length > 80) histories.shift();
  future.length = 0;
}
function setDirty() {
  dirty = true;
  editSequence++;
  lastHandoff = null;
  $('#save-status').textContent = '等待保存';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushSave().catch(() => {}); }, 500);
  const changes = changesBetween(original, scene);
  $('#change-count').textContent = `${changes.length} 处调整`;
}
async function flushSave() {
  clearTimeout(saveTimer);
  saveChain = saveChain.catch(() => {}).then(async () => {
    if (!dirty) return;
    const snapshot = clone(scene), sequence = editSequence;
    $('#save-status').textContent = '保存中';
    try {
      const result = await api(`/sessions/${sessionId}`, { scene: snapshot, expectedRevision: session.revision }, 'PUT');
      session.revision = result.revision;
      saveError = null;
      if (sequence === editSequence) { dirty = false; $('#save-status').textContent = '已保存到本地'; }
    } catch (error) {
      saveError = error;
      $('#save-status').textContent = '保存失败';
      toast(error.message);
      throw error;
    }
  });
  return saveChain;
}
function stop() {
  playing = false;
  cancelAnimationFrame(raf);
  $('#play').innerHTML = img('play');
  $('#play').setAttribute('aria-label', '播放');
}
function renderTime() {
  if (document.activeElement !== $('#current-time')) $('#current-time').value = String(Math.round(time)).padStart(4, '0');
  const ruler = $('#ruler');
  const width = Math.max(0, ruler.clientWidth - 57);
  $('#playhead').style.left = `${ruler.offsetLeft + 28.5 + width * time / total}px`;
  $('#playhead').setAttribute('aria-valuenow', Math.round(time));
  $('#playhead').setAttribute('aria-valuemax', total);
  postPreview();
}
function seek(nextTime) { stop(); time = clamp(nextTime, 0, total); renderTime(); }
function play() {
  if (playing) { stop(); renderTime(); return; }
  if (time >= total) time = 0;
  playing = true;
  $('#play').innerHTML = '<span class="pause-icon"></span>';
  $('#play').setAttribute('aria-label', '暂停');
  previousFrame = performance.now();
  postPreview();
  const step = (now) => {
    time += now - previousFrame;
    previousFrame = now;
    if (time >= total) {
      if (looping) time %= total;
      else { time = total; stop(); renderTime(); return; }
    }
    renderTime();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function renderRuler() {
  $('#ruler').innerHTML = `<div class="ruler-ticks">${Array.from({ length: 21 }, (_, i) => `<div class="ruler-tick ${i % 5 ? 'minor' : 'major'}" style="left:calc(${i * 5}% - ${i * .45}px)">${i % 5 ? img('tick-small') : `<span>${Math.round(total * i / 20)}</span>`}</div>`).join('')}</div>`;
  $('#total-time').value = total;
}
function renderTracks() {
  const selectedElements = selectedElementIds();
  $('#tracks').innerHTML = groups().map((group) => {
    const isSelected = selectedElements.has(group.id);
    const start = Math.min(...group.tracks.map((item) => item.delay));
    const end = Math.max(...group.tracks.map((item) => item.delay + item.duration));
    const rows = propertyRows(group);
    return `<section class="track-group ${isSelected ? 'selected' : ''} ${collapsed.has(group.id) ? 'collapsed' : ''}" data-group="${escapeHtml(group.id)}"><div class="track-row group-row"><div class="track-label group-label"><button class="label-select" data-select="${escapeHtml(group.tracks[0].id)}">${escapeHtml(group.name)}</button><button class="row-icon collapse-button" data-collapse="${escapeHtml(group.id)}" aria-label="${collapsed.has(group.id) ? '展开' : '折叠'} ${escapeHtml(group.name)}" aria-expanded="${!collapsed.has(group.id)}">${img('collapse')}</button></div><div class="track-lane"><div class="lane-content"><div class="summary-bar" data-summary="${escapeHtml(group.id)}" style="--start:${start / total * 100}%;--length:${(end - start) / total * 100}%" tabindex="0" role="group" aria-label="${escapeHtml(group.name)} 整组时间条" title="拖动中间平移，拖动两端缩放">${barGrip('start', group.name, start)}${barGrip('end', group.name, end)}</div></div></div></div>${collapsed.has(group.id) ? '' : rows.map(({ item, property }, rowIndex) => {
      const selected = isRowSelected(selectedRows, item.id, property);
      const frames = framesFor(item, property);
      const disabled = item.enabled === false;
      return `<div class="track-row property-row ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" data-track="${escapeHtml(item.id)}" data-property="${property}"><div class="track-label property-label">${img(rowIndex === rows.length - 1 ? 'tree-end' : 'tree-start', 'tree-icon')}<button class="label-select" data-select="${escapeHtml(item.id)}" data-property="${property}">${propertyNames[property]}</button><button class="row-icon" data-toggle="${escapeHtml(item.id)}" aria-label="${disabled ? '启用' : '停用'} ${escapeHtml(group.name)} ${propertyNames[property]}" aria-pressed="${!disabled}">${img(disabled ? 'eye-hidden' : 'eye')}</button></div><div class="track-lane"><div class="lane-content"><div class="property-motion" style="--start:${item.delay / total * 100}%;--length:${item.duration / total * 100}%">${frames.slice(0, -1).map((frame, i) => `<div class="channel-line" style="left:${frame.offset * 100}%;width:${(frames[i + 1].offset - frame.offset) * 100}%"></div>`).join('')}${frames.map((frame, i) => `<button class="keyframe" style="left:${frame.offset * 100}%" data-keyframe="${i}" title="${Math.round(item.delay + frame.offset * item.duration)}ms · ${frame.value}" aria-label="${escapeHtml(group.name)} ${propertyNames[property]} 关键帧 ${i + 1}">${keyframeIcon}</button>`).join('')}${disabled ? '' : frames.slice(0, -1).map((frame, i) => `<button class="easing-badge" data-select="${escapeHtml(item.id)}" data-property="${property}" style="left:${(frame.offset + frames[i + 1].offset) / 2 * 100}%" aria-label="调整 ${escapeHtml(group.name)} ${propertyNames[property]} 曲线">${curveBadgeIcon(item.easing)}</button>`).join('')}</div></div></div></div>`;
    }).join('')}</section>`;
  }).join('');
  paintSelection();
  renderTime();
}
function renderCurve() {
  const points = track().easing;
  const miniature = curveBadgePath(points);
  $('#tracks').querySelectorAll(`[data-track="${selectedId}"] .easing-miniature path`).forEach((path) => { path.setAttribute('d', miniature); });
  const geometry = curveGeometry(points, curveDragBounds);
  if (curveDragBounds) curveDragBounds = { minY: geometry.minY, maxY: geometry.maxY };
  const { start, end, handles: [a, b] } = geometry;
  $('#curve-path').setAttribute('d', `M${start.join(' ')} C${a.join(' ')} ${b.join(' ')} ${end.join(' ')}`);
  $('#curve-handles').setAttribute('d', `M${start.join(' ')}L${a.join(' ')}M${end.join(' ')}L${b.join(' ')}`);
  [start, end].forEach((point, i) => { $(`#curve-${i ? 'end' : 'start'}`).setAttribute('cx', point[0]); $(`#curve-${i ? 'end' : 'start'}`).setAttribute('cy', point[1]); });
  const reference = geometry.minY === 0 && geometry.maxY === 1 && JSON.stringify(points) === JSON.stringify(presets.in);
  (reference ? [[70, 170], [118, 20]] : [a, b]).forEach((point, i) => { $(`#handle-${i + 1}`).setAttribute('x', point[0] - 4); $(`#handle-${i + 1}`).setAttribute('y', point[1] - 4); });
  $('#curve-reference').hidden = !reference;
  $('.curve-editor').classList.toggle('reference', reference);
  if (document.activeElement !== $('#bezier-values')) $('#bezier-values').value = points.join(', ');
  $('#easing-preset').value = Object.keys(presets).find((key) => JSON.stringify(presets[key]) === JSON.stringify(points)) || 'custom';
}
function renderInspector() {
  const editable = Boolean(selectedRows.length === 1 && selectedId && selectedProperty);
  const inspector = $('#inspector');
  $('.inspector-placeholder').textContent = selectedRows.length > 1 ? `已选中 ${selectedRows.length} 条，拖动可一起平移` : '选择属性节点以编辑';
  inspector.classList.toggle('position-values', Boolean(selectedId && ['x', 'y'].includes(selectedProperty)));
  inspector.classList.toggle('is-empty', !editable);
  inspector.setAttribute('aria-disabled', String(!editable));
  inspector.querySelectorAll('input,select').forEach((field) => { field.disabled = !editable; });
  if (!editable) {
    ['from-value', 'to-value', 'bezier-values', 'easing-preset'].forEach((id) => { $(`#${id}`).value = ''; });
    inspector.querySelectorAll('.value-unit').forEach((node) => { node.textContent = ''; });
    return;
  }
  const item = track(), property = selectedProperty;
  const frames = framesFor(item, property);
  const percent = ['opacity', 'scale'].includes(property);
  const position = ['x', 'y'].includes(property);
  for (const [id, value] of [['from-value', frames[0].value], ['to-value', frames.at(-1).value]]) {
    const field = $(`#${id}`);
    field.disabled = position && !scene.positioning;
    if (document.activeElement !== field) field.value = field.disabled ? '' : Math.round(value * (percent ? 100 : 1) * 100) / 100;
    field.min = property === 'opacity' ? 0 : property === 'scale' ? 1 : -1000000;
    field.max = property === 'opacity' ? 100 : property === 'scale' ? 500 : 1000000;
    field.title = position ? `${id === 'from-value' ? '起始' : '结束'}${property.toUpperCase()}：元素左上角距页面${property === 'x' ? '左边' : '顶部'}的距离（px）` : '';
    field.setAttribute('aria-label', position ? `${id === 'from-value' ? '起始' : '结束'}页面坐标 ${property.toUpperCase()}` : id === 'from-value' ? '起始数值' : '结束数值');
  }
  document.querySelectorAll('.value-unit').forEach((node) => { node.textContent = percent ? '%' : 'px'; });
  renderCurve();
}
function render() { renderRuler(); renderTracks(); renderInspector(); $('#scene-name').textContent = scene.name; }
function paintSelection() {
  const selectedElements = selectedElementIds();
  $('#tracks').querySelectorAll('.track-group').forEach((node) => node.classList.toggle('selected', selectedElements.has(node.dataset.group)));
  $('#tracks').querySelectorAll('.property-row').forEach((node) => {
    const selected = isRowSelected(selectedRows, node.dataset.track, node.dataset.property);
    node.classList.toggle('selected', selected);
    node.querySelector('.label-select').setAttribute('aria-pressed', String(selected));
  });
}
function select(id, property = null, options = {}) {
  const item = scene.tracks.find((item) => item.id === id);
  if (id !== null && !item) return;
  setSelection(id, property, options);
}
function mutate(callback) {
  const before = clone(scene);
  callback(track());
  if (JSON.stringify(before) === JSON.stringify(scene)) return;
  remember(before); stop(); setDirty(); render();
}
function restore(redo) {
  const source = redo ? future : histories, destination = redo ? histories : future;
  if (!source.length) return;
  destination.push(clone(scene)); scene = source.pop(); stop(); setDirty(); render();
}
document.addEventListener('pointerdown', () => { suppressSelectionClick = false; }, true);
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-select]');
  if (target && !suppressSelectionClick) select(target.dataset.select, target.dataset.property, { additive: event.shiftKey });
  suppressSelectionClick = false;
  const fold = event.target.closest('[data-collapse]');
  if (fold) {
    const id = fold.dataset.collapse;
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    if (collapsed.has(id)) {
      selectedRows = selectedRows.filter((row) => !row.property || elementId(scene.tracks.find((item) => item.id === row.id)) !== id);
      const active = selectedRows.at(-1);
      setSelection(active?.id || null, active?.property, { preserve: true });
    }
    renderTracks(); renderInspector(); postPreview();
  }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) mutate(() => { const item = scene.tracks.find((item) => item.id === toggle.dataset.toggle); item.enabled = item.enabled === false; });
  const close = event.target.closest('[data-close]');
  if (close) $(`#${close.dataset.close}`).close();
});
$('#play').onclick = play;
$('#loop').onclick = () => { looping = !looping; $('#loop').classList.toggle('active', looping); $('#loop').setAttribute('aria-pressed', looping); };
$('#current-time').addEventListener('change', () => {
  const value = Number($('#current-time').value);
  if (Number.isFinite(value)) seek(value);
});
$('#total-time').addEventListener('change', () => {
  const value = Number($('#total-time').value);
  if (Number.isFinite(value)) { total = clamp(Math.round(value), 100, 20000); time = Math.min(time, total); render(); }
});
for (const side of ['from', 'to']) {
  $(`#${side}-value`).addEventListener('change', (event) => {
    if (!event.target.value.trim() || !Number.isFinite(Number(event.target.value))) { renderInspector(); return; }
    const value = clamp(Number(event.target.value), Number(event.target.min), Number(event.target.max)) / (['opacity', 'scale'].includes(selectedProperty) ? 100 : 1);
    mutate((item) => {
      item[side][selectedProperty] = value;
      if (item.keyframes) item.keyframes[side === 'from' ? 0 : item.keyframes.length - 1].value = value;
    });
    renderTime();
  });
}
$('#easing-preset').onchange = (event) => { if (presets[event.target.value]) mutate((item) => { item.easing = clone(presets[event.target.value]); }); };
$('#bezier-values').onchange = (event) => {
  const values = event.target.value.split(',').map((value) => Number(value.trim()));
  if (values.length !== 4 || !values.every(Number.isFinite) || values.some((value, i) => value < (i % 2 ? -1 : 0) || value > (i % 2 ? 2 : 1))) { toast('请输入四个有效控制值，X 为 0–1，Y 为 -1–2。'); event.target.blur(); renderCurve(); return; }
  mutate((item) => { item.easing = values; });
};
function bindDrag(element, event, move, finish) {
  element.setPointerCapture(event.pointerId);
  const onMove = (next) => { if (next.pointerId === event.pointerId) move(next); };
  const onUp = (next) => {
    if (next.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    finish?.();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
$('#curve').addEventListener('pointerdown', (event) => {
  if (!selectedProperty) return;
  const handle = event.target.closest('[data-handle]');
  if (!handle || !scene) return;
  event.preventDefault(); stop();
  const index = Number(handle.dataset.handle), before = clone(scene), rect = $('#curve').getBoundingClientRect();
  const initial = [...track().easing], geometry = curveGeometry(initial);
  curveDragBounds = { minY: geometry.minY, maxY: geometry.maxY };
  bindDrag(handle, event, (next) => {
    const deltaX = (next.clientX - event.clientX) / rect.width * 190;
    const deltaY = (next.clientY - event.clientY) / rect.height * 190;
    track().easing = dragCurveControl(initial, index, deltaX, deltaY, geometry);
    renderCurve(); renderTime();
  }, () => {
    curveDragBounds = null;
    if (JSON.stringify(before) !== JSON.stringify(scene)) { remember(before); setDirty(); }
    renderCurve();
  });
});
function seekFromPointer(event) {
  const rect = $('#ruler').getBoundingClientRect();
  seek((event.clientX - rect.left - 28.5) / Math.max(1, rect.width - 57) * total);
}
$('#ruler').addEventListener('pointerdown', (event) => { event.preventDefault(); seekFromPointer(event); bindDrag($('#ruler'), event, seekFromPointer); });
$('#playhead').addEventListener('pointerdown', (event) => { event.preventDefault(); stop(); bindDrag($('#playhead'), event, seekFromPointer); });
$('#tracks').addEventListener('pointerdown', (event) => {
  const key = event.target.closest('[data-keyframe]'), summary = event.target.closest('[data-summary]');
  const motion = !key && !summary ? event.target.closest('.property-motion') : null;
  const lane = event.target.closest('.track-lane');
  const propertyRow = event.target.closest('.property-row');
  if (event.shiftKey && (key || summary || motion || (lane && propertyRow))) {
    event.preventDefault(); stop();
    suppressSelectionClick = Boolean(event.target.closest('[data-select]'));
    if (summary) {
      const group = groups().find((group) => group.id === summary.dataset.summary);
      setSelection(group.tracks[0].id, null, { additive: true });
    } else setSelection(propertyRow.dataset.track, propertyRow.dataset.property, { additive: true });
    return;
  }
  if (!key && !summary && !motion) {
    if (lane && !event.target.closest('button')) {
      event.preventDefault();
      const row = event.target.closest('.property-motion')?.closest('.property-row');
      if (row) { stop(); select(row.dataset.track, row.dataset.property); }
      else { setSelection(null); seekFromPointer(event); bindDrag(lane, event, seekFromPointer); }
    }
    return;
  }
  event.preventDefault(); stop();
  suppressSelectionClick = Boolean(event.target.closest('[data-select]'));
  const before = clone(scene), startX = event.clientX;
  const width = Math.max(1, $('#ruler').clientWidth - 57);
  let moved = false;
  if (summary) {
    const group = groups().find((group) => group.id === summary.dataset.summary);
    const edge = event.target.closest('[data-resize]')?.dataset.resize;
    setSelection(group.tracks[0].id, null, { preserve: !edge });
    if (!edge) {
      bindSelectionMove(summary, event, before, startX, width, group.tracks[0].id);
      return;
    }
    const initial = group.tracks.map(clone);
    bindDrag(summary, event, (next) => {
      const delta = Math.round((next.clientX - startX) / width * total / 10) * 10;
      const timings = resizeGroup(initial, edge, delta);
      group.tracks.forEach((item, i) => Object.assign(item, timings[i]));
      paintGroupTiming(group, summary);
      postPreview();
    }, () => { if (JSON.stringify(before) !== JSON.stringify(scene)) { remember(before); setDirty(); } renderTracks(); renderInspector(); });
  } else if (motion) {
    const row = motion.closest('[data-track]');
    setSelection(row.dataset.track, row.dataset.property, { preserve: true });
    bindSelectionMove(motion, event, before, startX, width, row.dataset.track, row.dataset.property);
  } else {
    const row = key.closest('[data-track]');
    setSelection(row.dataset.track, row.dataset.property);
    const item = track(), index = Number(key.dataset.keyframe);
    const frames = clone(framesFor(item, selectedProperty));
    const initial = clone(item);
    bindDrag(key, event, (next) => {
      const delta = Math.round((next.clientX - startX) / width * total / 10) * 10;
      moved ||= delta !== 0;
      if (!moved) return;
      moveKeyframe(item, initial, selectedProperty, index, delta);
      key.style.left = `${item.keyframes ? item.keyframes[index].offset * 100 : index * 100}%`;
      const motion = key.closest('.property-motion');
      motion.style.setProperty('--start', `${item.delay / total * 100}%`);
      motion.style.setProperty('--length', `${item.duration / total * 100}%`);
      time = item.delay + (item.keyframes?.[index].offset || 0) * item.duration;
      renderInspector(); renderTime();
    }, () => { if (JSON.stringify(before) !== JSON.stringify(scene)) { remember(before); setDirty(); } renderTracks(); renderInspector(); postPreview(); });
  }
});
$('#tracks').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const key = event.target.closest('[data-keyframe]'), summary = event.target.closest('[data-summary]');
  if (!key && !summary) return;
  event.preventDefault();
  const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 100 : 10);
  if (key) {
    const row = key.closest('[data-track]');
    setSelection(row.dataset.track, row.dataset.property);
    mutate((item) => { moveKeyframe(item, clone(item), selectedProperty, Number(key.dataset.keyframe), delta); });
    const selector = `[data-track="${selectedId}"][data-property="${selectedProperty}"] [data-keyframe="${key.dataset.keyframe}"]`;
    $(selector)?.focus();
  } else {
    const id = summary.dataset.summary;
    const group = groups().find((group) => group.id === id);
    setSelection(group.tracks[0].id);
    const edge = event.target.closest('[data-resize]')?.dataset.resize;
    if (edge) {
      const timings = resizeGroup(group.tracks, edge, delta);
      mutate(() => group.tracks.forEach((item, i) => Object.assign(item, timings[i])));
    } else {
      const min = Math.min(...group.tracks.map((item) => item.delay)), max = Math.max(...group.tracks.map((item) => item.delay));
      const shift = clamp(delta, -min, 10000 - max);
      mutate(() => group.tracks.forEach((item) => { item.delay += shift; }));
    }
    $(`[data-summary="${id}"]${edge ? ` [data-resize="${edge}"]` : ''}`)?.focus();
  }
});
$('#timeline-scroll').addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.track-row')) setSelection(null);
});
document.addEventListener('keydown', (event) => {
  const field = event.target.closest('#app input');
  if (event.key === 'Enter' && !event.isComposing && field) {
    event.preventDefault();
    field.blur();
    return;
  }
  if (event.target.closest('input,textarea,select,[role="textbox"]') || event.target.isContentEditable || event.isComposing || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space') {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat && scene) play();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey); }
  if (event.target === $('#playhead') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    seek(event.key === 'Home' ? 0 : event.key === 'End' ? total : time + (event.key === 'ArrowRight' ? 10 : -10));
  }
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
new ResizeObserver(() => { if (scene) renderTime(); }).observe($('#timeline-body'));

const scrollView = $('#timeline-scroll');
const scrollRail = $('#timeline-scrollbar');
const scrollThumb = $('#timeline-scrollbar-thumb');
let scrollHideTimer, nearScrollEdge = false, draggingScrollbar = false;
function updateScrollbar() {
  const maximum = Math.max(0, scrollView.scrollHeight - scrollView.clientHeight);
  scrollRail.hidden = maximum <= 1;
  if (scrollRail.hidden) { scrollRail.classList.remove('is-visible'); return; }
  const height = scrollRail.clientHeight;
  const thumbHeight = Math.min(height, Math.max(24, height * scrollView.clientHeight / scrollView.scrollHeight));
  scrollThumb.style.height = `${thumbHeight}px`;
  scrollThumb.style.transform = `translateY(${clamp(scrollView.scrollTop / maximum, 0, 1) * (height - thumbHeight)}px)`;
  scrollRail.setAttribute('aria-valuemax', Math.round(maximum));
  scrollRail.setAttribute('aria-valuenow', Math.round(scrollView.scrollTop));
  if (nearScrollEdge || draggingScrollbar || document.activeElement === scrollRail) scrollRail.classList.add('is-visible');
}
function scheduleScrollbarHide() {
  clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => {
    if (!nearScrollEdge && !draggingScrollbar && document.activeElement !== scrollRail) scrollRail.classList.remove('is-visible');
  }, 800);
}
function revealScrollbar() {
  if (scrollRail.hidden) return;
  scrollRail.classList.add('is-visible');
  scheduleScrollbarHide();
}
scrollView.addEventListener('scroll', () => { updateScrollbar(); revealScrollbar(); }, { passive: true });
function updateScrollEdge(event) {
  const panel = $('.timeline-panel').getBoundingClientRect();
  const view = scrollView.getBoundingClientRect();
  const near = panel.right - event.clientX <= 20 && event.clientX <= panel.right && event.clientY >= view.top;
  if (near === nearScrollEdge) return;
  nearScrollEdge = near;
  if (near) revealScrollbar(); else scheduleScrollbarHide();
}
$('.timeline-panel').addEventListener('pointermove', updateScrollEdge);
$('.timeline-panel').addEventListener('pointerenter', updateScrollEdge);
$('.timeline-panel').addEventListener('pointerleave', () => { nearScrollEdge = false; scheduleScrollbarHide(); });
scrollRail.addEventListener('focus', revealScrollbar);
scrollRail.addEventListener('blur', scheduleScrollbarHide);
scrollRail.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || scrollRail.hidden) return;
  event.preventDefault();
  const rect = scrollRail.getBoundingClientRect();
  const thumb = scrollThumb.getBoundingClientRect();
  const grabOffset = event.target === scrollThumb ? event.clientY - thumb.top : thumb.height / 2;
  const maximum = scrollView.scrollHeight - scrollView.clientHeight;
  const travel = rect.height - thumb.height;
  if (travel <= 0) return;
  draggingScrollbar = true;
  revealScrollbar();
  const move = (pointer) => {
    scrollView.scrollTop = clamp((pointer.clientY - rect.top - grabOffset) / travel, 0, 1) * maximum;
    updateScrollbar();
  };
  if (event.target !== scrollThumb) move(event);
  bindDrag(scrollRail, event, move, () => { draggingScrollbar = false; scheduleScrollbarHide(); });
});
scrollRail.addEventListener('keydown', (event) => {
  const distance = { ArrowUp: -40, ArrowDown: 40, PageUp: -scrollView.clientHeight, PageDown: scrollView.clientHeight };
  if (!(event.key in distance) && !['Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  scrollView.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? scrollView.scrollHeight : scrollView.scrollTop + distance[event.key];
  updateScrollbar(); revealScrollbar();
});
const scrollbarResize = new ResizeObserver(updateScrollbar);
scrollbarResize.observe(scrollView);
scrollbarResize.observe($('#tracks'));

const fieldNames = { delay: '开始时间', duration: '持续时长', easing: '缓动曲线', from: '起始状态', to: '结束状态', keyframes: '关键帧', enabled: '轨道启用状态' };
function shortValue(value, field) {
  if (value === undefined) return '默认';
  if (['delay', 'duration'].includes(field)) return `${value}ms`;
  if (field === 'easing') return value.join(', ');
  if (field === 'from' || field === 'to') return `X ${value.x} / Y ${value.y} / ${value.scale}× / ${Math.round(value.opacity * 100)}%`;
  return JSON.stringify(value);
}
$('#handoff').onclick = () => {
  stop(); renderTime();
  const changes = changesBetween(original, scene);
  $('#change-list').innerHTML = changes.length ? changes.map((change) => `<div class="change-item"><div>${escapeHtml(change.name)} · ${fieldNames[change.field] || escapeHtml(change.field)}</div><code>${escapeHtml(shortValue(change.before, change.field))} → ${escapeHtml(shortValue(change.after, change.field))}</code></div>`).join('') : '<div class="change-item">尚未修改，将交付当前完整场景。</div>';
  $('#handoff-result').hidden = true;
  $('#copy-fallback').hidden = true;
  $('#confirm-handoff').textContent = '复制给 AI';
  $('#handoff-dialog').showModal();
};
$('#confirm-handoff').onclick = async () => {
  const button = $('#confirm-handoff');
  button.disabled = true;
  button.textContent = '正在复制…';
  try {
    await flushSave();
    if (saveError) throw saveError;
    const note = $('#handoff-note').value.trim();
    if (!lastHandoff || lastHandoff.note !== note || lastHandoff.revision !== session.revision) lastHandoff = await api(`/sessions/${sessionId}/handoffs`, { expectedRevision: session.revision, note });
    const result = $('#handoff-result');
    result.hidden = false;
    $('#copy-fallback').hidden = true;
    try {
      await navigator.clipboard.writeText(lastHandoff.prompt);
      result.textContent = '已复制，粘贴给 AI 即可。';
    } catch {
      const fallback = $('#copy-fallback');
      fallback.hidden = false;
      fallback.value = lastHandoff.prompt;
      fallback.focus(); fallback.select();
      result.textContent = '无法访问剪贴板，请复制下方已选中的内容，再粘贴给 AI。';
    }
  } catch (error) { toast(`复制未完成：${error.message}`); }
  finally { button.disabled = false; button.textContent = '复制给 AI'; }
};

try {
  if (location.protocol === 'file:') throw new Error('请运行 npm run open，通过本地服务打开工作台。');
  session = await api(`/sessions/${sessionId}`);
  scene = clone(session.scene); original = clone(session.original);
  selectedId = null; selectedProperty = null;
  if (scene.id === 'studio-intro-properties') {
    ['title', 'description', 'composition'].forEach((id) => collapsed.add(id));
  }
  total = timelineDuration(scene);
  time = sceneDuration(scene);
  render(); loadPreview();
  $('#save-status').textContent = '已保存到本地';
} catch (error) {
  $('#save-status').textContent = '加载失败';
  $('#app').querySelectorAll('button,input,select').forEach((element) => { element.disabled = true; });
  $('#preview-status').textContent = `无法载入场景：${error.message}`;
  toast(error.message);
}
