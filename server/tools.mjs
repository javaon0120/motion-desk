import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import { runtimeDirectory } from "./paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFile = path.join(runtimeDirectory, "runtime.json");
let startup;

async function readRuntime() {
  if (!existsSync(runtimeFile)) return null;
  try {
    const runtime = JSON.parse(readFileSync(runtimeFile, "utf8"));
    const response = await fetch(`${runtime.url}/api/health`, { signal: AbortSignal.timeout(700) });
    const health = await response.json();
    return health.name === "motion-desk" && health.instanceId === runtime.instanceId ? runtime : null;
  } catch { return null; }
}
export async function ensureServer() {
  const current = await readRuntime();
  if (current) return current;
  if (startup) return startup;
  startup = (async () => {
    mkdirSync(runtimeDirectory, { recursive: true });
    const log = openSync(path.join(runtimeDirectory, "server.log"), "a", 0o600);
    const child = spawn(process.execPath, [path.join(root, "server/server.mjs")], {
      cwd: root, detached: true, stdio: ["ignore", log, log], env: { ...process.env, MOTION_DESK_PORT: "0" }
    });
    closeSync(log);
    child.unref();
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const runtime = await readRuntime();
      if (runtime) return runtime;
    }
    throw new Error(`工作台未能启动，请检查 ${path.join(runtimeDirectory, "server.log")}`);
  })().finally(() => { startup = null; });
  return startup;
}

export async function callTool(name, args = {}) {
  const runtime = await ensureServer();
  const request = async (endpoint, body) => {
    const response = await fetch(`${runtime.url}/api${endpoint}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Motion-Token": runtime.token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  if (name === "open_workbench") {
    const session = args.sessionId ? await request(`/sessions/${encodeURIComponent(args.sessionId)}`) : await request("/sessions", { workspace: args.workspace || root, ...(args.scene ? { scene: args.scene } : {}) });
    const url = `${runtime.url}/?session=${session.id}&token=${runtime.token}`;
    return { sessionId: session.id, url, openInCodex: { placement: "right", target: { type: "browser", url } }, revision: session.revision, scene: session.scene, message: "请用 openInCodex 参数在对话右侧打开工作台。用户确认后用 get_handoff 读取指定版本。" };
  }
  if (name === "get_session") return request(`/sessions/${encodeURIComponent(args.sessionId)}`);
  if (name === "list_sessions") return request("/sessions");
  if (name === "get_handoff") return request(`/sessions/${encodeURIComponent(args.sessionId)}/handoffs/${args.version || "latest"}`);
  throw new Error(`未知工具：${name}`);
}
