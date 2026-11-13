import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 全局安装的缓存会在升级时替换，用户草稿需要保存在版本目录之外。
const isGlobalInstall = pluginRoot.startsWith(path.join(homedir(), '.codex', 'plugins') + path.sep);
export const runtimeDirectory = process.env.MOTION_DESK_DATA_DIR
  ? path.resolve(process.env.MOTION_DESK_DATA_DIR)
  : isGlobalInstall ? path.join(homedir(), '.local', 'share', 'motion-desk') : path.join(pluginRoot, '.motion-desk');
