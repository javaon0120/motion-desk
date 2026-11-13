import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { Store } from "./store.mjs";
import { runtimeDirectory } from "./paths.mjs";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".otf": "font/otf", ".woff2": "font/woff2" };

export function createServer({ dataDirectory = runtimeDirectory, token = randomBytes(24).toString("hex") } = {}) {
  const store = new Store(path.join(dataDirectory, "sessions"));
  const instanceId = randomBytes(12).toString("hex");
  const json = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  const readBody = async (req) => {
    const buffers = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 250000) throw Object.assign(new Error("场景数据过大，请限制在 250KB 内"), { status: 413 });
      buffers.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(buffers).toString("utf8") || "{}"); }
    catch { throw Object.assign(new Error("请求不是有效的 JSON"), { status: 400 }); }
  };
  const server = http.createServer(async (req, res) => {
    const ownOrigin = `http://127.0.0.1:${server.address().port}`;
    try {
      const acceptedHosts = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
      if (!acceptedHosts.includes(req.headers.host)) return json(res, 403, { error: "工作台只接受本机访问" });
      const url = new URL(req.url, ownOrigin);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/api/health") return json(res, 200, { name: "motion-desk", instanceId, version: "0.2.0" });
      if (pathname.startsWith("/api/")) {
        const origin = req.headers.origin;
        if (origin && !acceptedHosts.some((host) => origin === `http://${host}`)) return json(res, 403, { error: "不接受其他网页的跨来源请求" });
        if (req.headers["x-motion-token"] !== token) return json(res, 401, { error: "工作台凭据失效，请重新打开插件" });
        if (pathname === "/api/sessions") {
          if (req.method === "GET") return json(res, 200, store.list());
          if (req.method === "POST") {
            const body = await readBody(req);
            if (body.workspace !== undefined && (typeof body.workspace !== "string" || body.workspace.length > 2048)) return json(res, 400, { error: "项目路径无效" });
            return json(res, 201, store.create({ ...body, workspace: body.workspace || projectRoot }));
          }
        }
        const match = pathname.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)(?:\/(handoffs))?(?:\/(\d+|latest))?$/);
        if (match) {
          const [, id, handoffs, version] = match;
          if (req.method === "GET") return json(res, 200, handoffs ? store.getHandoff(id, version === "latest" ? undefined : Number(version) || undefined) : store.get(id));
          if (req.method === "PUT" && !handoffs) {
            const body = await readBody(req);
            return json(res, 200, store.update(id, body.scene, body.expectedRevision));
          }
          if (req.method === "POST" && handoffs && !version) {
            const body = await readBody(req);
            return json(res, 201, store.handoff(id, body.expectedRevision, body.note));
          }
        }
        return json(res, 404, { error: "没有这个接口" });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "不支持这个请求方法" });
      if (pathname === "/" && (!url.searchParams.get("session") || url.searchParams.get("token") !== token)) {
        const session = store.create({ workspace: projectRoot });
        res.writeHead(302, { Location: `/?session=${session.id}&token=${token}`, "Referrer-Policy": "no-referrer" });
        return res.end();
      }
      const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = path.resolve(publicRoot, `.${relative}`);
      if (!file.startsWith(`${publicRoot}${path.sep}`) || !existsSync(file)) return json(res, 404, { error: "页面不存在" });
      const content = readFileSync(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...(path.extname(file) === ".js" ? { "Access-Control-Allow-Origin": "*" } : {})
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      const status = error.name === "ZodError" ? 400 : error.status || 500;
      json(res, status, { error: error.name === "ZodError" ? `场景参数不正确：${error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("；")}` : error.message });
    }
  });
  return { server, store, token, instanceId, dataDirectory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createServer();
  const port = Number(process.env.MOTION_DESK_PORT ?? 4318);
  app.server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${app.server.address().port}`;
    mkdirSync(app.dataDirectory, { recursive: true });
    writeFileSync(path.join(app.dataDirectory, "runtime.json"), JSON.stringify({ url, token: app.token, instanceId: app.instanceId, pid: process.pid }), { mode: 0o600 });
    console.log(`动效工作台已启动：${url}`);
  });
  app.server.on("error", (error) => { console.error(`启动失败：${error.message}`); process.exit(1); });
}
