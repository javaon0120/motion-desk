export const isRowSelected = (rows, id, property = null) => rows.some((row) => row.id === id && row.property === property);

export function updateSelection(rows, id, property = null, { additive = false, preserve = false } = {}) {
  if (!id) return [];
  const exists = isRowSelected(rows, id, property);
  const rest = rows.filter((row) => row.id !== id || row.property !== property);
  if (additive) return exists ? rest : [...rows, { id, property }];
  if (preserve && exists) return [...rest, { id, property }];
  return [{ id, property }];
}

export function selectionTracks(scene, rows) {
  const ids = new Set(), elements = new Set();
  for (const row of rows) {
    const item = scene.tracks.find((track) => track.id === row.id);
    if (!item) continue;
    if (row.property) ids.add(item.id);
    else elements.add(item.elementId || item.id);
  }
  return scene.tracks.filter((item) => ids.has(item.id) || elements.has(item.elementId || item.id));
}
