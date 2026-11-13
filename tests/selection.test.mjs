import test from 'node:test';
import assert from 'node:assert/strict';
import { isRowSelected, updateSelection, selectionTracks } from '../public/selection.js';
import { studioScene } from '../public/scene.js';

test('Shift 逐条添加、取消选择，取消最后一条后清空', () => {
  let rows = updateSelection([], 'title-y', 'y');
  rows = updateSelection(rows, 'description-y', 'y', { additive: true });
  assert.equal(rows.length, 2);
  assert.ok(isRowSelected(rows, 'title-y', 'y'));
  rows = updateSelection(rows, 'title-y', 'y', { additive: true });
  assert.deepEqual(rows, [{ id: 'description-y', property: 'y' }]);
  assert.deepEqual(updateSelection(rows, 'description-y', 'y', { additive: true }), []);
});

test('拖动已选轨道保留多选，普通单选和空白点击重置选择', () => {
  const rows = [{ id: 'title-y', property: 'y' }, { id: 'description-y', property: 'y' }];
  const dragging = updateSelection(rows, 'title-y', 'y', { preserve: true });
  assert.equal(dragging.length, 2);
  assert.deepEqual(dragging.at(-1), rows[0]);
  assert.deepEqual(updateSelection(rows, 'title-y', 'y'), [rows[0]]);
  assert.deepEqual(updateSelection(rows, 'action-scale', 'scale', { preserve: true }), [{ id: 'action-scale', property: 'scale' }]);
  assert.deepEqual(updateSelection(rows, null), []);
  assert.equal(rows.length, 2);
});

test('跨元素多选只包含指定属性', () => {
  const rows = [{ id: 'title-y', property: 'y' }, { id: 'action-scale', property: 'scale' }];
  assert.deepEqual(selectionTracks(studioScene, rows).map((item) => item.id), ['title-y', 'action-scale']);
});

test('父级与子属性混合选择时，同一轨道只参与一次移动', () => {
  const rows = [{ id: 'action-opacity', property: null }, { id: 'action-y', property: 'y' }, { id: 'title-y', property: 'y' }];
  assert.deepEqual(selectionTracks(studioScene, rows).map((item) => item.id), ['title-y', 'action-opacity', 'action-y', 'action-scale']);
});
