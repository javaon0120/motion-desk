import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { clone, demoScene, studioScene, sampleScene, documentPositions, changesBetween } from '../public/scene.js';
import { isPropertyEnabled, toggleProperty } from '../public/visibility.js';
import { Store, sceneSchema } from '../server/store.mjs';

test('旧版元素停用 Position Y，只停止位移，透明度和其他元素继续播放', () => {
  const scene = clone(demoScene), original = clone(scene);
  toggleProperty(scene.tracks[0], 'y');
  assert.equal(isPropertyEnabled(scene.tracks[0], 'y'), false);
  assert.equal(isPropertyEnabled(scene.tracks[0], 'opacity'), true);
  for (const time of [0, 200, 350, 600, 1100]) {
    const before = sampleScene(original, time), after = sampleScene(scene, time);
    assert.equal(after.get('title').y, 0);
    for (const property of ['x', 'scale', 'opacity']) assert.equal(after.get('title')[property], before.get('title')[property]);
    for (const id of ['description', 'action', 'composition']) assert.deepEqual(after.get(id), before.get(id));
  }
  toggleProperty(scene.tracks[0], 'y');
  assert.deepEqual(scene, original);
  assert.deepEqual(changesBetween(original, scene), []);
});

test('旧版多个属性可分别停用和恢复，页面坐标换算保留开关状态', () => {
  const scene = clone(demoScene);
  toggleProperty(scene.tracks[2], 'opacity');
  toggleProperty(scene.tracks[2], 'scale');
  toggleProperty(scene.tracks[2], 'scale');
  const origins = Object.fromEntries(scene.tracks.map((track, index) => [track.id, { x: 100 + index * 80, y: 200 + index * 90 }]));
  const positioned = documentPositions(scene, origins, { width: 1440, height: 900 });
  for (const time of [250, 450, 1100]) {
    assert.equal(sampleScene(positioned, time).get('action').opacity, 1);
    for (const property of ['x', 'y', 'scale', 'opacity']) assert.ok(Math.abs(sampleScene(positioned, time).get('action')[property] - sampleScene(scene, time).get('action')[property]) < 1e-8);
    assert.equal(sampleScene(positioned, time).get('action').scale, sampleScene(demoScene, time).get('action').scale);
  }
});

test('从旧版整组停用状态只恢复点中的一个属性', () => {
  const scene = clone(demoScene), track = scene.tracks[2];
  track.enabled = false;
  toggleProperty(track, 'y');
  assert.equal(isPropertyEnabled(track, 'y'), true);
  for (const property of ['x', 'opacity', 'scale']) assert.equal(isPropertyEnabled(track, property), false);
  const state = sampleScene(scene, 450).get('action');
  assert.equal(state.y, sampleScene(demoScene, 450).get('action').y);
  assert.deepEqual({ ...state, y: 0 }, { x: 0, y: 0, scale: 1, opacity: 1 });
});

test('独立属性轨道仍使用自己的开关，不影响同元素的其他属性', () => {
  const scene = clone(studioScene), original = clone(scene);
  const y = scene.tracks.find((track) => track.id === 'action-y');
  toggleProperty(y, 'y');
  assert.equal(y.enabled, false);
  assert.equal(y.disabledProperties, undefined);
  const before = sampleScene(original, 500), after = sampleScene(scene, 500);
  assert.equal(after.get('action').y, 0);
  assert.equal(after.get('action').opacity, before.get('action').opacity);
  assert.equal(after.get('action').scale, before.get('action').scale);
  for (const id of ['title', 'description', 'composition']) assert.deepEqual(after.get(id), before.get(id));
});

test('旧版属性开关保存、重新读取与交接后不丢失，之后的修改不改变已复制版本', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'motion-visibility-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new Store(directory), session = store.create({ scene: demoScene });
  const scene = clone(session.scene);
  toggleProperty(scene.tracks[0], 'opacity');
  store.update(session.id, scene, 0);
  const reopened = new Store(directory).get(session.id);
  assert.equal(isPropertyEnabled(reopened.scene.tracks[0], 'opacity'), false);
  assert.equal(isPropertyEnabled(reopened.scene.tracks[0], 'y'), true);
  const handoff = store.handoff(session.id, 1);
  assert.deepEqual(handoff.changes.map(({ field, after }) => ({ field, after })), [{ field: 'disabledProperties', after: ['opacity'] }]);
  assert.match(handoff.prompt, /停用属性/);
  toggleProperty(scene.tracks[0], 'opacity');
  store.update(session.id, scene, 1);
  assert.equal(isPropertyEnabled(store.getHandoff(session.id, 1).scene.tracks[0], 'opacity'), false);
  assert.equal(isPropertyEnabled(store.get(session.id).scene.tracks[0], 'opacity'), true);
});

test('停用属性必须有效且唯一，独立属性轨道不会混用旧版开关格式', () => {
  for (const invalid of [['unknown'], ['y', 'y'], ['opacity', 'x', 'y', 'scale', 'opacity']]) {
    const scene = clone(demoScene);
    scene.tracks[0].disabledProperties = invalid;
    assert.equal(sceneSchema.safeParse(scene).success, false);
  }
  const scene = clone(studioScene);
  scene.tracks[0].disabledProperties = ['opacity'];
  assert.equal(sceneSchema.safeParse(scene).success, false);
});
