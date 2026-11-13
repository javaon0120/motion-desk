#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callTool } from "./tools.mjs";
import { sceneSchema } from "./store.mjs";

const server = new McpServer({ name: "motion-desk", version: "0.2.0" });
const register = (name, description, inputSchema, readOnlyHint) => server.registerTool(name, {
  description, inputSchema,
  annotations: { readOnlyHint, destructiveHint: false, openWorldHint: false }
}, async (args) => {
  try {
    const result = await callTool(name, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
});
register("open_workbench", "打开网页动效调试台。可创建已接入的场景，或通过 sessionId 恢复会话。不传场景时使用示例。在浏览器打开返回的 url；宿主支持 Codex 侧面板时也可使用 openInCodex。", {
  workspace: z.string().optional().describe("当前项目绝对路径"),
  sessionId: z.string().optional().describe("要恢复的现有会话；提供后忽略 scene"),
  scene: sceneSchema.optional().describe("已绑定真实网页元素的动效规格")
}, false);
register("get_session", "读取当前草稿和原版。草稿可能仍在编辑，落地应优先读取用户确认的 get_handoff 版本。", { sessionId: z.string() }, true);
register("list_sessions", "列出本地动效编辑会话及交接数量。", {}, true);
register("get_handoff", "读取用户确认的不可变交接版本，包含精确参数、差异、补充说明和源码位置。", { sessionId: z.string(), version: z.number().int().positive().optional().describe("指定确认版本；省略时读取最新交接") }, true);
await server.connect(new StdioServerTransport());
