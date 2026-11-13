import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { studioScene, clone, changesBetween, documentPositions } from "../public/scene.js";

const numeric = (min, max) => z.number().finite().min(min).max(max);
const coordinate = () => numeric(-1000000, 1000000);
const stateSchema = z.object({ x: coordinate(), y: coordinate(), scale: numeric(.01, 5), opacity: numeric(0, 1) });
export const sceneSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().min(1).max(100),
  trigger: z.string().min(1).max(100).default("页面进入"),
  positioning: z.object({
    space: z.literal('document'), anchor: z.literal('top-left'),
    origins: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.object({ x: coordinate(), y: coordinate() })),
    viewport: z.object({ width: numeric(1, 1000000), height: numeric(1, 1000000) })
  }).optional(),
  previewUrl: z.string().max(2048).refine((value) => {
    if (["/demo/", "/demo/index.html", "/design-demo/", "/design-demo/index.html"].includes(value)) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }, "网页地址必须是 http 或 https URL，或 /demo/"),
  tracks: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    elementId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
    property: z.enum(["x", "y", "scale", "opacity"]).optional(),
    enabled: z.boolean().optional(),
    keyframes: z.array(z.object({ offset: numeric(0, 1), value: coordinate() })).min(2).max(30).optional(),
    name: z.string().min(1).max(100),
    type: z.string().max(30).default("容器"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#66816c"),
    source: z.string().max(500).default(""),
    delay: numeric(0, 10000).int(),
    duration: numeric(10, 10000).int(),
    easing: z.tuple([numeric(0, 1), numeric(-1, 2), numeric(0, 1), numeric(-1, 2)]),
    from: stateSchema,
    to: stateSchema
  })).min(1).max(30)
}).refine((scene) => new Set(scene.tracks.map((track) => track.id)).size === scene.tracks.length, "轨道标识不能重复")
  .refine((scene) => scene.tracks.every((track) => !track.keyframes || (track.property && track.keyframes.every((frame, index, frames) =>
    (!index || frame.offset > frames[index - 1].offset) && (track.property === "opacity" ? frame.value >= 0 && frame.value <= 1 : track.property === "scale" ? frame.value >= .01 && frame.value <= 5 : true)))), "关键帧必须按时间递增，数值必须符合属性范围")
  .refine((scene) => !scene.positioning || scene.tracks.every((track) => Object.hasOwn(scene.positioning.origins, track.elementId || track.id)), "页面坐标必须包含所有元素的布局原点")
  .refine((scene) => {
    const channels = scene.tracks.map((track) => `${track.elementId || track.id}:${track.property || "all"}`);
    return new Set(channels).size === channels.length && scene.tracks.every((track) => track.property || !scene.tracks.some((other) => other !== track && (other.elementId || other.id) === (track.elementId || track.id)));
  }, "同一元素的属性不能由多条轨道重复驱动");

export class Store {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
  }
  file(id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Object.assign(new Error("会话标识无效"), { status: 400 });
    return path.join(this.directory, `${id}.json`);
  }
  write(id, value) {
    const file = this.file(id);
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporary, file);
  }
  get(id) {
    const file = this.file(id);
    if (!existsSync(file)) throw Object.assign(new Error("找不到这个编辑会话"), { status: 404 });
    return JSON.parse(readFileSync(file, "utf8"));
  }
  create({ scene = studioScene, workspace = "" } = {}) {
    const parsed = sceneSchema.parse(scene);
    const session = { id: randomUUID(), createdAt: new Date().toISOString(), workspace, revision: 0, scene: clone(parsed), original: clone(parsed), handoffs: [] };
    this.write(session.id, session);
    return session;
  }
  update(id, scene, expectedRevision) {
    const parsed = sceneSchema.parse(scene);
    const session = this.get(id);
    this.assertRevision(session, expectedRevision);
    // 编辑阶段只允许调节已注册元素的参数，场景替换应创建新会话。
    if (session.scene.positioning && !parsed.positioning) {
      throw Object.assign(new Error('此场景已使用页面坐标，请刷新旧窗口后继续编辑'), { status: 409 });
    }
    const bindings = (scene) => scene.tracks.map(({ id, elementId, property }) => ({ id, elementId, property }));
    if (parsed.id !== session.scene.id || parsed.previewUrl !== session.scene.previewUrl || JSON.stringify(bindings(parsed)) !== JSON.stringify(bindings(session.scene))) {
      throw Object.assign(new Error("场景或元素发生变化，请导入为新会话"), { status: 400 });
    }
    if (parsed.positioning && !session.original.positioning) {
      session.original = documentPositions(session.original, parsed.positioning.origins, parsed.positioning.viewport);
    }
    session.scene = parsed;
    session.revision++;
    this.write(id, session);
    return session;
  }
  assertRevision(session, revision) {
    if (revision !== session.revision) throw Object.assign(new Error("另一个窗口已修改该场景。当前修改仍保留在页面，请先导出 JSON，再刷新读取最新版本。"), { status: 409 });
  }
  handoff(id, expectedRevision, note = "") {
    if (typeof note !== "string" || note.length > 3000) throw Object.assign(new Error("补充说明最多 3000 字"), { status: 400 });
    const session = this.get(id);
    this.assertRevision(session, expectedRevision);
    const version = session.handoffs.length + 1;
    const filename = `handoff-${id}-v${version}`;
    const targetPath = this.file(filename);
    const changes = changesBetween(session.original, session.scene);
    const labels = { delay: "开始时间", duration: "时长", easing: "曲线", from: "起始状态", to: "结束状态" };
    const summary = changes.length
      ? changes.map((change) => `- ${change.name} / ${labels[change.field] || change.field}：${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`).join("\n")
      : "- 按当前完整场景实现，参数尚未调整。";
    const prompt = [
      `请把 Motion Desk 中确认的动效调整落地到项目代码。`,
      `会话：${id}；交接版本：${version}；编辑修订：${session.revision}。`,
      `交接文件：${targetPath}`,
      session.workspace ? `项目：${session.workspace}` : "",
      `可以调用 motion-desk 的 get_handoff，传入 sessionId="${id}"、version=${version}，或直接读取上述文件。`,
      session.scene.positioning ? `坐标定义：Position X/Y 和对应关键帧是元素左上角相对于网页左上角的绝对坐标，单位为 CSS px，包含页面滚动距离。参考视口 ${session.scene.positioning.viewport.width}×${session.scene.positioning.viewport.height}。positioning.origins 记录无动效时的布局原点，使用 transform 落地时须换算为位移，不能直接把页面坐标当作 translate 数值，也不要求改为 CSS 绝对定位。` : '',
      "", "修改摘要：", summary,
      note ? `\n补充说明：${note}` : "",
      "\n请使用这个确定版本的 scene 和 changes，核对 source 对应的真实代码，保留无关样式、交互和业务逻辑。修改后重新预览确认。"
    ].filter((line) => line !== "").join("\n");
    const handoff = {
      schemaVersion: 1, sessionId: id, version, revision: session.revision, createdAt: new Date().toISOString(),
      workspace: session.workspace, note, scene: clone(session.scene), original: clone(session.original), changes, summary, prompt, path: targetPath
    };
    // 先独立落盘，再更新索引。后续编辑只会修改会话，不会修改交接文件。
    this.write(filename, handoff);
    session.handoffs.push({ version, filename });
    this.write(id, session);
    return handoff;
  }
  getHandoff(id, version) {
    const session = this.get(id);
    const entry = version ? session.handoffs.find((item) => item.version === version) : session.handoffs.at(-1);
    if (!entry) throw Object.assign(new Error("还没有该版本的交接记录，请先在面板确认并保存"), { status: 404 });
    return this.get(entry.filename);
  }
  list() {
    return readdirSync(this.directory).filter((name) => name.endsWith(".json") && !name.startsWith("handoff-")).map((name) => {
      const session = this.get(name.slice(0, -5));
      return { id: session.id, name: session.scene.name, revision: session.revision, createdAt: session.createdAt, handoffs: session.handoffs.length };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
