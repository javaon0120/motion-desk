import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { createServer } from "../server/server.mjs";
import { clone, demoScene, designScene, sampleScene } from "../public/scene.js";

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "motion-desk-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new Store(path.join(directory, "sessions")) };
}

test("编辑保存后可恢复；交接版本不随后续修改改变", (t) => {
  const { directory, store } = fixture(t);
  const session = store.create({ scene: demoScene });
  const edited = clone(session.scene);
  edited.tracks[0].duration = 350;
  store.update(session.id, edited, 0);
  const handoff = store.handoff(session.id, 1, "保留移动端原样");
  assert.equal(handoff.changes[0].before, 720);
  assert.equal(handoff.changes[0].after, 350);
  assert.equal(handoff.scene.tracks[0].duration, 350);
  assert.match(handoff.prompt, /version=1/);
  edited.tracks[0].duration = 900;
  store.update(session.id, edited, 1);
  const recovered = new Store(path.join(directory, "sessions"));
  assert.equal(recovered.get(session.id).scene.tracks[0].duration, 900);
  assert.equal(recovered.getHandoff(session.id, 1).scene.tracks[0].duration, 350);
  assert.equal(recovered.get(session.id).original.tracks[0].duration, 720);
});

test("过期窗口不能覆盖新草稿或交接错误版本", (t) => {
  const { store } = fixture(t);
  const session = store.create({ scene: demoScene });
  const first = clone(session.scene);
  first.tracks[1].delay = 300;
  store.update(session.id, first, 0);
  assert.throws(() => store.update(session.id, session.scene, 0), (error) => error.status === 409);
  assert.throws(() => store.handoff(session.id, 0), (error) => error.status === 409);
  assert.equal(store.get(session.id).scene.tracks[1].delay, 300);
});

test("无效曲线、重复元素和危险网页地址在接入边界被拒绝", (t) => {
  const { store } = fixture(t);
  for (const mutate of [
    (scene) => { scene.tracks[0].easing[0] = 2; },
    (scene) => { scene.tracks[1].id = scene.tracks[0].id; },
    (scene) => { scene.previewUrl = "javascript:alert(1)"; },
    (scene) => { scene.tracks[0].color = "red;position:fixed"; },
    (scene) => { scene.tracks[0].duration = -50; }
  ]) {
    const scene = clone(demoScene);
    mutate(scene);
    assert.throws(() => store.create({ scene }));
  }
  assert.throws(() => store.get("../../package"), (error) => error.status === 400);
});

test("导入新场景与已有会话隔离，草稿不能偷偷替换目标网页", (t) => {
  const { store } = fixture(t);
  const session = store.create({ scene: demoScene });
  const imported = clone(demoScene);
  imported.previewUrl = "http://localhost:3000";
  imported.id = "new-scene";
  const next = store.create({ scene: imported });
  assert.notEqual(session.id, next.id);
  assert.throws(() => store.update(session.id, imported, 0), (error) => error.status === 400);
  assert.equal(store.get(session.id).scene.previewUrl, "/demo/");
});

test("同一元素的缩放和位移可以错开，停用属性不影响其他轨道", () => {
  const scene = clone(designScene);
  const title = scene.tracks[0];
  const y = scene.tracks[1];
  title.delay = 500; title.duration = 500; title.easing = [0, 0, 1, 1];
  title.from.opacity = 0; title.to.opacity = 1; title.keyframes = [{ offset: 0, value: 0 }, { offset: 1, value: 1 }];
  y.delay = 0; y.duration = 500; y.easing = [0, 0, 1, 1];
  y.keyframes = [{ offset: 0, value: 40 }, { offset: 1, value: 0 }];
  assert.ok(Math.abs(sampleScene(scene, 250).get('title').y - 20) < .001);
  assert.equal(sampleScene(scene, 250).get('title').opacity, 0);
  assert.equal(sampleScene(scene, 750).get('title').y, 0);
  assert.ok(Math.abs(sampleScene(scene, 750).get('title').opacity - .5) < .001);
  y.enabled = false;
  assert.equal(sampleScene(scene, 250).get('title').y, 0);
});

test("属性轨道和关键帧保存交接后不丢失，错误绑定与乱序关键帧被拒绝", (t) => {
  const { store } = fixture(t);
  const session = store.create();
  const edited = clone(session.scene);
  edited.tracks[1].delay += 200;
  edited.tracks[1].keyframes[1].offset = .6;
  store.update(session.id, edited, 0);
  const handoff = store.handoff(session.id, 1);
  assert.deepEqual(handoff.scene.tracks[1], edited.tracks[1]);
  assert.ok(handoff.changes.some((change) => change.field === 'keyframes'));
  const invalid = clone(edited);
  invalid.tracks[1].keyframes[1].offset = 0;
  assert.throws(() => store.create({scene: invalid}));
  const rebind = clone(edited);
  rebind.tracks[1].elementId = 'another-element';
  assert.throws(() => store.update(session.id, rebind, 1), (error) => error.status === 400);
});

test("HTTP 工作流支持创建、保存与交接，并拒绝无凭据或跨来源写入", async (t) => {
  const { directory } = fixture(t);
  const app = createServer({ dataDirectory: directory, token: "test-token" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); }));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { "Content-Type": "application/json", "X-Motion-Token": "test-token" };
  const unauthorized = await fetch(`${base}/api/sessions`, { method: "POST", body: "{}" });
  assert.equal(unauthorized.status, 401);
  const crossOrigin = await fetch(`${base}/api/sessions`, { method: "POST", headers: { ...headers, Origin: "https://unrelated.example" }, body: "{}" });
  assert.equal(crossOrigin.status, 403);
  const created = await fetch(`${base}/api/sessions`, { method: "POST", headers, body: "{}" });
  assert.equal(created.status, 201);
  const session = await created.json();
  session.scene.tracks[0].duration = 450;
  const saved = await fetch(`${base}/api/sessions/${session.id}`, { method: "PUT", headers, body: JSON.stringify({ scene: session.scene, expectedRevision: 0 }) });
  assert.equal(saved.status, 200);
  const committed = await fetch(`${base}/api/sessions/${session.id}/handoffs`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: 1, note: "测试交接" }) });
  assert.equal(committed.status, 201);
  const result = await committed.json();
  assert.equal(result.scene.tracks[0].duration, 450);
  assert.equal(result.version, 1);
  const read = await fetch(`${base}/api/sessions/${session.id}/handoffs/1`, { headers });
  assert.deepEqual(await read.json(), result);
  const bridge = await fetch(`${base}/bridge.js`);
  assert.equal(bridge.status, 200);
  assert.equal(bridge.headers.get("access-control-allow-origin"), "*");
  const root = await fetch(base, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.match(root.headers.get("location"), /session=.*&token=test-token/);
});
