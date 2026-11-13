#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

try {
  const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = path.join(skillDirectory, 'installation.json');
  const installation = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : null;
  const root = installation?.root || path.resolve(skillDirectory, '../..');
  const entry = path.join(root, 'server', 'cli.mjs');
  if (!existsSync(entry)) throw new Error('找不到 Motion Desk 源码目录；请回到克隆目录重新运行 npm run setup。');
  if (installation?.dataDirectory && !process.env.MOTION_DESK_DATA_DIR) process.env.MOTION_DESK_DATA_DIR = installation.dataDirectory;
  await import(pathToFileURL(entry).href);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
