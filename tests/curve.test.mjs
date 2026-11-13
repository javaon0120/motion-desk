import test from 'node:test';
import assert from 'node:assert/strict';
import { curveGeometry, dragCurveControl, curveBadgePath } from '../public/curve.js';
import { bezierProgress } from '../public/scene.js';

test('普通曲线保持原始画布位置', () => {
  const geometry = curveGeometry([.42, 0, 1, 1]);
  assert.deepEqual(geometry.start, [16, 170]);
  assert.deepEqual(geometry.end, [174, 20]);
});

test('回弹、负值和极限控制点的完整把手都位于画布内', () => {
  for (const points of [[.34, 1.35, .64, 1], [.3, -.5, .7, 1], [0, -1, 1, 2]]) {
    const original = [...points];
    const geometry = curveGeometry(points);
    for (const [x, y] of [...geometry.handles, geometry.start, geometry.end]) {
      assert.ok(x >= 8 && x <= 182 && y >= 8 && y <= 182);
    }
    assert.deepEqual(points, original);
  }
});

test('缩放后把手跟随鼠标位移，拖动时坐标范围保持稳定', () => {
  const points = [.34, 1.35, .64, 1];
  const geometry = curveGeometry(points);
  const edited = dragCurveControl(points, 0, 15.8, 20, geometry);
  const next = curveGeometry(edited, geometry);
  assert.equal(edited[0], .44);
  assert.equal(edited[1], 1.15);
  assert.ok(Math.abs(next.handles[0][0] - geometry.handles[0][0] - 15.8) < .001);
  assert.ok(Math.abs(next.handles[0][1] - geometry.handles[0][1] - 20) < .001);
});

test('节点缩略曲线表达实际缓动进度，回弹部分也完整保留', () => {
  for (const points of [[0, 0, 1, 1], [.42, 0, 1, 1], [0, 0, .58, 1], [.34, 1.35, .64, 1], [.3, -.5, .7, 1]]) {
    const values = curveBadgePath(points).match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(values.length, 8);
    assert.ok(values.every((value) => value >= 2 && value <= 12));
    const [sx, sy, ax, ay, bx, by, ex, ey] = values;
    const displayed = [(ax - sx) / (ex - sx), (sy - ay) / (sy - ey), (bx - sx) / (ex - sx), (sy - by) / (sy - ey)];
    for (const progress of [.25, .5, .75]) {
      assert.ok(Math.abs(bezierProgress(progress, displayed) - bezierProgress(progress, points)) < .002);
    }
  }
});
