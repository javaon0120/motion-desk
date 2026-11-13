const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function moveTrack(track, delta) {
  const first = track.delay + (track.keyframes?.[0].offset || 0) * track.duration;
  const shift = clamp(delta, -first, 10000 - track.delay);
  const desiredDelay = track.delay + shift;
  const delay = Math.max(0, Math.round(desiredDelay));
  const duration = Math.max(10, Math.round(track.duration + Math.min(0, desiredDelay)));
  const result = { delay, duration };
  // 首个节点可能位于时间区间内部，向左拖时先消耗这段空白，保持节点间距不变。
  if (track.keyframes) result.keyframes = track.keyframes.map((frame) => ({
    ...frame, offset: clamp((track.delay + frame.offset * track.duration + shift - delay) / duration, 0, 1)
  }));
  return result;
}

export function moveTracks(tracks, delta) {
  const min = Math.max(...tracks.map((track) => -(track.delay + (track.keyframes?.[0].offset || 0) * track.duration)));
  const max = Math.min(...tracks.map((track) => 10000 - track.delay));
  // 所有轨道共用边界，避免某条到达零点后其他轨道继续移动、破坏相对时序。
  const shift = clamp(delta, Math.ceil(min), Math.floor(max));
  return tracks.map((track) => moveTrack(track, shift));
}

export function resizeGroup(tracks, edge, delta) {
  const start = Math.min(...tracks.map((track) => track.delay));
  const end = Math.max(...tracks.map((track) => track.delay + track.duration));
  const span = end - start;
  let minScale = Math.max(...tracks.map((track) => 10 / track.duration));
  let maxScale = Math.min(...tracks.map((track) => 10000 / track.duration));
  for (const track of tracks) {
    if (edge === 'start') {
      const distance = end - track.delay;
      minScale = Math.max(minScale, (end - 10000) / distance);
      maxScale = Math.min(maxScale, end / distance);
    } else if (track.delay > start) {
      maxScale = Math.min(maxScale, (10000 - start) / (track.delay - start));
    }
  }
  const scale = clamp((span + (edge === 'start' ? -delta : delta)) / span, minScale, maxScale);
  const pivot = edge === 'start' ? end : start;
  // 以另一端为锚点缩放整个时间区间，关键帧 offset、数值和曲线保持原样。
  return tracks.map((track) => {
    const delay = Math.round(pivot + (track.delay - pivot) * scale);
    const finish = Math.round(pivot + (track.delay + track.duration - pivot) * scale);
    return { delay, duration: finish - delay };
  });
}
