const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function curveGeometry(points, bounds = null) {
  // 按半格扩展范围，为回弹和负值控制点留出可点击的边距。
  const minY = Math.floor(Math.min(0, points[1], points[3], bounds?.minY ?? 0) * 2) / 2;
  const maxY = Math.ceil(Math.max(1, points[1], points[3], bounds?.maxY ?? 1) * 2) / 2;
  const scaleY = 150 / (maxY - minY);
  const position = (x, y) => [16 + x * 158, 20 + (maxY - y) * scaleY];
  return {
    minY, maxY, scaleY,
    start: position(0, 0), end: position(1, 1),
    handles: [position(points[0], points[1]), position(points[2], points[3])]
  };
}

export function dragCurveControl(points, index, deltaX, deltaY, geometry) {
  const result = [...points];
  result[index] = Math.round(clamp(points[index] + deltaX / 158, 0, 1) * 100) / 100;
  result[index + 1] = Math.round(clamp(points[index + 1] - deltaY / geometry.scaleY, -1, 2) * 100) / 100;
  return result;
}

export function curveBadgePath(points) {
  const geometry = curveGeometry(points);
  const miniature = ([x, y]) => [3 + (x - 16) / 158 * 8, 3 + (y - 20) / 150 * 8]
    .map((value) => Number(value.toFixed(3))).join(' ');
  return `M${miniature(geometry.start)} C${geometry.handles.map(miniature).join(' ')} ${miniature(geometry.end)}`;
}
