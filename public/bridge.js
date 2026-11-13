import { sampleScene, transformString } from "./scene.js";
// 在开发环境中接入：为元素添加 data-motion-id，再从工作台加载这个模块。
const moduleUrl = new URL(import.meta.url);
const editorOrigin = moduleUrl.origin;
const elements = new Map();
let selectedId = null;
let activeScene = null;
let editMode = false;
let parentOrigin = null;
let layout = {};
let layoutDetails = new Map();
let currentTime = 0;
let layoutFrame = 0;
const marker = document.createElement("div");
marker.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:1px solid #0080ff;border-radius:8px;padding:4px;display:none";
const markerFill = document.createElement("div");
markerFill.style.cssText = "width:100%;height:100%;background:rgba(0,128,255,.08);border-radius:4px";
marker.append(markerFill);
document.body.append(marker);

function findElement(id) {
  return [...document.querySelectorAll("[data-motion-id]")].find((element) => element.dataset.motionId === id);
}

function send(type, payload = {}) {
  if (window.parent !== window) window.parent.postMessage({ channel: "motion-desk", type, ...payload }, parentOrigin || editorOrigin);
}

function markSelection() {
  const element = selectedId && findElement(selectedId);
  if (!element || !editMode) { marker.style.display = "none"; return; }
  const rect = element.getBoundingClientRect();
  Object.assign(marker.style, { display: "block", boxSizing: "border-box", left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px` });
}

function measureLayout() {
  // 同时移除受控元素的动效，避免把当前播放位置或父元素的动效当成布局原点。
  const saved = [...elements.values()].map((element) => [element, element.style.getPropertyValue('transform'), element.style.getPropertyPriority('transform')]);
  saved.forEach(([element]) => element.style.setProperty('transform', 'none', 'important'));
  layout = {};
  layoutDetails.clear();
  for (const [id, element] of elements) {
    const rect = element.getBoundingClientRect();
    const [originX, originY] = getComputedStyle(element).transformOrigin.split(' ').map(Number.parseFloat);
    layout[id] = { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
    layoutDetails.set(id, { originX, originY });
  }
  saved.forEach(([element, value, priority]) => value ? element.style.setProperty('transform', value, priority) : element.style.removeProperty('transform'));
  send('layout', { origins: layout, viewport: { width: window.innerWidth, height: window.innerHeight } });
}

function renderScene() {
  if (!activeScene) return;
  for (const [id, state] of sampleScene(activeScene, currentTime, layout)) {
    const element = elements.get(id);
    if (!element) continue;
    if (activeScene.positioning) {
      const tracks = activeScene.tracks.filter((track) => (track.elementId || track.id) === id && track.enabled !== false);
      const details = layoutDetails.get(id);
      // 缩放仍沿用原有中心点；补偿边框移动，让受控的左上角坐标保持准确。
      if (tracks.some((track) => !track.property || track.property === 'x')) state.x += details.originX * (state.scale - 1);
      if (tracks.some((track) => !track.property || track.property === 'y')) state.y += details.originY * (state.scale - 1);
    }
    Object.assign(element.style, { transform: transformString(state), opacity: state.opacity });
  }
  markSelection();
}

const layoutObserver = new ResizeObserver(() => {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => { if (activeScene) { measureLayout(); renderScene(); } });
});
layoutObserver.observe(document.documentElement);

function applyScene(scene) {
  if (JSON.stringify(scene) === JSON.stringify(activeScene)) return;
  const bindingChanged = !activeScene || JSON.stringify(activeScene.tracks.map((track) => track.elementId || track.id)) !== JSON.stringify(scene.tracks.map((track) => track.elementId || track.id));
  elements.clear();
  activeScene = scene;
  const missing = [];
  for (const track of scene.tracks) {
    const id = track.elementId || track.id;
    if (elements.has(id)) continue;
    const element = findElement(id);
    if (!element) { missing.push(id); continue; }
    // 接入的是独立动效元素；已有动效交给调试台接管，避免两套动画同时驱动。
    for (const animation of element.getAnimations()) animation.cancel();
    elements.set(id, element);
    if (bindingChanged) layoutObserver.observe(element);
  }
  if (bindingChanged) measureLayout();
  send("applied", { missing });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.origin !== editorOrigin || event.data?.channel !== "motion-desk") return;
  parentOrigin = event.origin;
  const { type, scene, time, selected, editing } = event.data;
  if (type === "hello") {
    send("ready", { scene: window.__MOTION_SCENE__ || null, ids: [...document.querySelectorAll("[data-motion-id]")].map((element) => element.dataset.motionId) });
  }
  if (type === "render") {
    if (scene) applyScene(scene);
    currentTime = time;
    selectedId = selected;
    editMode = editing;
    renderScene();
  }
});

document.addEventListener("click", (event) => {
  if (!activeScene) return;
  const element = event.target.closest("[data-motion-id]");
  if (element) {
    event.preventDefault();
    event.stopPropagation();
    send("select", { id: element.dataset.motionId });
  }
}, true);
document.addEventListener("keydown", (event) => {
  if (!activeScene || window.parent === window || event.code !== "Space" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
  if (event.target.closest('input,textarea,select,[role="textbox"]') || event.target.isContentEditable) return;
  event.preventDefault();
  if (!event.repeat) send("toggle-playback");
});
window.addEventListener("resize", () => { if (activeScene) { measureLayout(); renderScene(); } });
window.addEventListener("scroll", markSelection, true);
document.fonts.ready.then(() => { if (activeScene) { measureLayout(); renderScene(); } });
send("ready", { scene: window.__MOTION_SCENE__ || null, ids: [...document.querySelectorAll("[data-motion-id]")].map((element) => element.dataset.motionId) });
