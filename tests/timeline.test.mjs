import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeGroup, moveTrack, moveTracks } from '../public/timeline.js';
import { clone, studioScene } from '../public/scene.js';
import { sceneSchema } from '../server/store.mjs';

const actionTracks = () => clone(studioScene.tracks.filter((track) => track.elementId === 'action'));

test('多轨道平移共用零点边界，所有关键帧移动相同距离', () => {
  const tracks = [
    { delay: 0, duration: 600, keyframes: [{ offset: .2, value: 24 }, { offset: 1, value: 0 }] },
    { delay: 250, duration: 800, keyframes: [{ offset: 0, value: 0 }, { offset: .5, value: .5 }, { offset: 1, value: 1 }] }
  ];
  const result = moveTracks(tracks, -500);
  result.forEach((timing, i) => timing.keyframes.forEach((frame, j) => {
    const before = tracks[i].delay + tracks[i].keyframes[j].offset * tracks[i].duration;
    assert.ok(Math.abs(timing.delay + frame.offset * timing.duration - before + 120) < 1e-8);
  }));
  assert.equal(result[0].keyframes[0].offset, 0);
  assert.equal(tracks[1].delay, 250);
});

test('多轨道右移到上限时一起停止，保留各自时长和间距', () => {
  const tracks = [{ delay: 9900, duration: 100 }, { delay: 250, duration: 700 }];
  const result = moveTracks(tracks, 500);
  assert.deepEqual(result, [{ delay: 10000, duration: 100 }, { delay: 350, duration: 700 }]);
});

test('属性整段平移保持所有节点间距、数值和曲线，其他属性不动', () => {
  const tracks = actionTracks(), before = clone(tracks), item = tracks[1];
  Object.assign(item, moveTrack(item, 150));
  assert.equal(item.delay, before[1].delay + 150);
  assert.equal(item.duration, before[1].duration);
  assert.deepEqual(item.keyframes, before[1].keyframes);
  assert.deepEqual(item.easing, before[1].easing);
  assert.deepEqual(tracks[0], before[0]);
  assert.deepEqual(tracks[2], before[2]);
});

test('有前置空白的子轨道可向左移动，首节点停在零且所有节点等距平移', () => {
  const track = { delay: 0, duration: 830, keyframes: [{ offset: 178 / 830, value: 280 }, { offset: 504 / 830, value: 270 }, { offset: 1, value: 260 }] };
  for (const [delta, shift] of [[-100, -100], [-1000, -178], [200, 200]]) {
    const result = moveTrack(track, delta);
    result.keyframes.forEach((frame, i) => {
      const originalTime = track.delay + track.keyframes[i].offset * track.duration;
      assert.ok(Math.abs(result.delay + frame.offset * result.duration - originalTime - shift) < 1e-8);
      assert.equal(frame.value, track.keyframes[i].value);
    });
    assert.ok(result.delay >= 0 && result.duration >= 10);
  }
});

test('拖动右端固定起点，错开的属性与关键帧按同一比例伸长', () => {
  const tracks = actionTracks(), before = clone(tracks);
  const timings = resizeGroup(tracks, 'end', 860);
  assert.deepEqual(timings, [{ delay: 240, duration: 1120 }, { delay: 240, duration: 1120 }, { delay: 560, duration: 1400 }]);
  const scale = tracks.findIndex((track) => track.property === 'scale');
  const middleTime = timings[scale].delay + .5 * timings[scale].duration;
  assert.equal(middleTime, 240 + ((tracks[scale].delay + .5 * tracks[scale].duration) - 240) * 2);
  assert.deepEqual(tracks, before);
});

test('拖动左端固定终点，整组内的属性一起压缩', () => {
  const timings = resizeGroup(actionTracks(), 'start', 430);
  assert.deepEqual(timings, [{ delay: 670, duration: 280 }, { delay: 670, duration: 280 }, { delay: 750, duration: 350 }]);
  assert.equal(Math.max(...timings.map((track) => track.delay + track.duration)), 1100);
});

test('两端不能交叉、越过零或产生超范围时序', () => {
  for (const tracks of [actionTracks(), [{ delay: 0, duration: 10 }, { delay: 9999, duration: 10000 }], [{ delay: 10000, duration: 10 }]]) {
    for (const edge of ['start', 'end']) {
      for (const delta of [-100000, -333, 0, 333, 100000]) {
        const resized = resizeGroup(tracks, edge, delta);
        for (const track of resized) {
          assert.ok(Number.isInteger(track.delay) && track.delay >= 0 && track.delay <= 10000);
          assert.ok(Number.isInteger(track.duration) && track.duration >= 10 && track.duration <= 10000);
        }
        const boundary = (items) => edge === 'start' ? Math.max(...items.map((track) => track.delay + track.duration)) : Math.min(...items.map((track) => track.delay));
        assert.equal(boundary(resized), boundary(tracks));
      }
    }
  }
});

test('缩放后的完整场景能保存，关键帧数值和曲线保持原样', () => {
  const scene = clone(studioScene), tracks = scene.tracks.filter((track) => track.elementId === 'action');
  const before = clone(tracks), timings = resizeGroup(tracks, 'end', 1230);
  tracks.forEach((track, i) => Object.assign(track, timings[i]));
  assert.equal(sceneSchema.safeParse(scene).success, true);
  tracks.forEach((track, i) => {
    for (const field of ['keyframes', 'from', 'to', 'easing']) assert.deepEqual(track[field], before[i][field]);
  });
});
