#!/usr/bin/env node
import { callTool } from "./tools.mjs";
try {
  const name = process.argv[2] || "open_workbench";
  const args = JSON.parse(process.argv[3] || "{}");
  console.log(JSON.stringify(await callTool(name, args), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
