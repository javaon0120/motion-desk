const properties = ['x', 'y', 'scale', 'opacity'];

export function isPropertyEnabled(track, property) {
  return track.enabled !== false && !track.disabledProperties?.includes(property);
}

export function toggleProperty(track, property) {
  if (!properties.includes(property) || (track.property && track.property !== property)) return;
  if (track.property) {
    track.enabled = !isPropertyEnabled(track, property);
    return;
  }
  const enabled = isPropertyEnabled(track, property);
  // 旧格式的多个属性共用一条记录；从整组停用恢复时，也只恢复被点击的属性。
  const disabled = new Set(track.enabled === false ? properties : track.disabledProperties || []);
  if (enabled) disabled.add(property); else disabled.delete(property);
  if (track.enabled === false) track.enabled = true;
  if (disabled.size) track.disabledProperties = properties.filter((key) => disabled.has(key));
  else delete track.disabledProperties;
}
