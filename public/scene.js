import { isPropertyEnabled } from './visibility.js';

export const demoScene = {
  id: "studio-intro",
  name: "首屏入场",
  trigger: "页面进入",
  previewUrl: "/demo/",
  tracks: [
    { id: "title", name: "主标题", type: "文字", color: "#66816c", source: "public/demo/index.html · [data-motion-id=\"title\"]", delay: 0, duration: 720, easing: [0.22, 1, 0.36, 1], from: { x: 0, y: 34, scale: 1, opacity: 0 }, to: { x: 0, y: 0, scale: 1, opacity: 1 } },
    { id: "description", name: "介绍文字", type: "文字", color: "#7d88ab", source: "public/demo/index.html · [data-motion-id=\"description\"]", delay: 120, duration: 640, easing: [0.22, 1, 0.36, 1], from: { x: 0, y: 24, scale: 1, opacity: 0 }, to: { x: 0, y: 0, scale: 1, opacity: 1 } },
    { id: "action", name: "行动按钮", type: "按钮", color: "#ad8662", source: "public/demo/index.html · [data-motion-id=\"action\"]", delay: 240, duration: 560, easing: [0.22, 1, 0.36, 1], from: { x: 0, y: 20, scale: 0.96, opacity: 0 }, to: { x: 0, y: 0, scale: 1, opacity: 1 } },
    { id: "composition", name: "作品展示", type: "容器", color: "#9d7e9f", source: "public/demo/index.html · [data-motion-id=\"composition\"]", delay: 180, duration: 880, easing: [0.22, 1, 0.36, 1], from: { x: 0, y: 42, scale: 0.94, opacity: 0 }, to: { x: 0, y: 0, scale: 1, opacity: 1 } }
  ]
};

export const clone = (value) => structuredClone(value);
export const sceneDuration = (scene) => Math.max(...scene.tracks.map((track) => track.delay + track.duration), 1);
export const timelineDuration = (scene) => Math.ceil(Math.max(2000, sceneDuration(scene) + 200) / 500) * 500;
export const easingString = (points) => `cubic-bezier(${points.join(", ")})`;
export const transformString = (state) => `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;

export function documentPositions(scene, origins, viewport) {
  const result = clone(scene);
  if (!result.positioning) {
    for (const track of result.tracks) {
      const origin = origins[track.elementId || track.id];
      if (!origin) throw new Error(`尚未测量元素：${track.elementId || track.id}`);
      for (const axis of ['x', 'y']) {
        track.from[axis] += origin[axis];
        track.to[axis] += origin[axis];
        if (track.property === axis && track.keyframes) {
          track.keyframes.forEach((frame) => { frame.value += origin[axis]; });
        }
      }
    }
  }
  result.positioning = { space: 'document', anchor: 'top-left', origins: clone(origins), viewport: clone(viewport) };
  return result;
}

export function changesBetween(original, scene) {
  return scene.tracks.flatMap((track) => {
    const previous = original.tracks.find((item) => item.id === track.id);
    if (!previous) return [{ id: track.id, name: track.name, field: "新增元素", before: null, after: track }];
    const fields = ["delay", "duration", "easing", "from", "to", "keyframes", "enabled", "disabledProperties"];
    return fields.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(track[key]))
      .map((field) => ({ id: track.id, name: track.property ? `${track.name} / ${track.property}` : track.name, field, before: previous[field], after: track[field] }));
  });
}

const neutral = { x: 0, y: 0, scale: 1, opacity: 1 };
const propertyTrack = (id, elementId, name, property, delay, duration, from, to, extra = {}) => ({
  id, elementId, name, property, type: "属性", color: "#0080ff",
  source: `public/design-demo/index.html · [data-motion-id="${elementId}"] · ${property}`,
  delay, duration, easing: [.42, 0, 1, 1], from: { ...neutral, [property]: from }, to: { ...neutral, [property]: to },
  keyframes: [{ offset: .05, value: from }, { offset: .5, value: (from + to) / 2 }, { offset: .95, value: to }],
  ...extra
});
export const designScene = {
  id: "profile-motion", name: "Profile", trigger: "页面进入", previewUrl: "/design-demo/",
  tracks: [
    propertyTrack("title-opacity", "title", "Title", "opacity", 96, 548, .9, 1),
    propertyTrack("title-y", "title", "Title", "y", 96, 548, 24, 0),
    propertyTrack("avatar-opacity", "avatar", "Avatar", "opacity", 488, 650, 0, 1, { keyframes: [{ offset: .022, value: 0 }, { offset: .397, value: .5 }, { offset: .772, value: 1 }] }),
    propertyTrack("avatar-scale", "avatar", "Avatar", "scale", 658, 454, .9, 1, { enabled: false, keyframes: [{ offset: 0, value: .9 }, { offset: .5, value: .95 }, { offset: 1, value: 1 }] })
  ]
};

// 使用原来的真实示例网页，各属性分别注册，方便演示错开的位移和缩放。
export const studioScene = {
  ...demoScene,
  id: 'studio-intro-properties',
  tracks: demoScene.tracks.flatMap((item) => ['opacity', 'y', 'scale'].filter((property) => item.from[property] !== item.to[property]).map((property) => {
    const delayedScale = item.id === 'action' && property === 'scale';
    const from = delayedScale ? .9 : item.from[property];
    const to = item.to[property];
    return propertyTrack(`${item.id}-${property}`, item.id, item.name, property,
      item.delay + (delayedScale ? 160 : 0), delayedScale ? 700 : item.duration, from, to, {
        source: `${item.source} · ${property}`,
        easing: [...item.easing],
        keyframes: [{ offset: 0, value: from }, { offset: 1, value: to }]
      });
  }))
};

export function bezierProgress(progress, points) {
  const p = Math.max(0, Math.min(1, progress));
  const [x1, y1, x2, y2] = points;
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (cubic(t, x1, x2) < p) low = t; else high = t;
  }
  return p === 0 || p === 1 ? p : cubic((low + high) / 2, y1, y2);
}
export function sampleTrack(track, time) {
  const progress = Math.max(0, Math.min(1, (time - track.delay) / track.duration));
  if (track.property && track.keyframes?.length) {
    const frames = track.keyframes;
    if (progress <= frames[0].offset) return frames[0].value;
    for (let i = 1; i < frames.length; i++) {
      if (progress <= frames[i].offset) {
        const a = frames[i - 1], b = frames[i];
        return a.value + (b.value - a.value) * bezierProgress((progress - a.offset) / (b.offset - a.offset), track.easing);
      }
    }
    return frames.at(-1).value;
  }
  const eased = bezierProgress(progress, track.easing);
  const interpolate = (key) => track.from[key] + (track.to[key] - track.from[key]) * eased;
  return track.property ? interpolate(track.property) : Object.fromEntries(Object.keys(neutral).map((key) => [key, interpolate(key)]));
}
export function sampleScene(scene, time, origins = scene.positioning?.origins) {
  const result = new Map();
  for (const track of scene.tracks) {
    const id = track.elementId || track.id;
    const origin = origins?.[id] || scene.positioning?.origins[id];
    const state = result.get(id) || { ...neutral };
    if (track.enabled !== false) {
      const value = sampleTrack(track, time);
      if (track.property) {
        state[track.property] = scene.positioning && ['x', 'y'].includes(track.property)
          ? value - origin[track.property] : value;
      } else {
        for (const property of Object.keys(neutral)) {
          if (!isPropertyEnabled(track, property)) continue;
          state[property] = scene.positioning && ['x', 'y'].includes(property) ? value[property] - origin[property] : value[property];
        }
      }
    }
    result.set(id, state);
  }
  return result;
}
