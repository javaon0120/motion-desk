import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { studioScene, demoScene, clone, documentPositions, sampleScene, changesBetween } from '../public/scene.js';
import { Store, sceneSchema } from '../server/store.mjs';

const origins = Object.fromEntries(demoScene.tracks.map((track, i) => [track.id, { x: 100 + i * 50, y: 3200 + i * 100 }]));
const viewport = { width: 1440, height: 900 };

test('旧位移和中间关键帧换算成页面坐标，时序、曲线和动画位移保持一致', () => {
  const before = clone(studioScene);
  const after = documentPositions(before, origins, viewport);
  for (const time of [0, 120, 500, 750, 1100]) {
    const expected = sampleScene(before, time), actual = sampleScene(after, time);
    for (const [id, state] of expected) {
      for (const property of ['x', 'y', 'opacity', 'scale']) assert.ok(Math.abs(actual.get(id)[property] - state[property]) < 1e-8);
    }
  }
  const y = after.tracks.find((track) => track.id === 'title-y');
  assert.equal(y.from.y, 3234);
  assert.equal(y.to.y, 3200);
  assert.deepEqual(y.keyframes.map((frame) => frame.value), [3234, 3200]);
  assert.deepEqual(documentPositions(after, origins, viewport), after);
  assert.deepEqual(before, studioScene);
  assert.equal(changesBetween(documentPositions(studioScene, origins, viewport), after).length, 0);
});

test('布局改变时绝对位置保持，停用位置轨道后回到网页布局位置', () => {
  const scene = documentPositions(studioScene, origins, viewport);
  const movedOrigins = clone(origins);
  movedOrigins.title.y += 150;
  assert.equal(sampleScene(scene, 1100, movedOrigins).get('title').y, -150);
  assert.equal(documentPositions(scene, movedOrigins, viewport).tracks[1].to.y, 3200);
  scene.tracks.find((track) => track.id === 'title-y').enabled = false;
  assert.equal(sampleScene(scene, 1100, movedOrigins).get('title').y, 0);
  const legacy = documentPositions(demoScene, origins, viewport);
  assert.equal(sampleScene(legacy, 1100).get('title').x, 0);
  assert.equal(sampleScene(legacy, 1100).get('title').y, 0);
});

test('页面坐标保存和交接不丢失，原始版本同步换算，缺失原点被拒绝', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'motion-position-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new Store(directory), session = store.create({ scene: studioScene });
  const scene = documentPositions(session.scene, origins, viewport);
  store.update(session.id, scene, 0);
  assert.deepEqual(store.get(session.id).original, scene);
  const y = scene.tracks.find((track) => track.id === 'title-y');
  y.to.y = 3300;
  y.keyframes.at(-1).value = 3300;
  store.update(session.id, scene, 1);
  const handoff = store.handoff(session.id, 2);
  assert.equal(handoff.scene.tracks.find((track) => track.id === 'title-y').to.y, 3300);
  assert.match(handoff.prompt, /绝对坐标/);
  assert.ok(handoff.changes.some((change) => change.field === 'to' && change.before.y === 3200 && change.after.y === 3300));
  const invalid = clone(scene);
  delete invalid.positioning.origins.title;
  assert.equal(sceneSchema.safeParse(invalid).success, false);
});
