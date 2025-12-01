import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import { exec, spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as net from "net";

interface PathCandidate {
  source: string;
  raw: string;
  resolved: string;
  exists: boolean;
}

const envCache: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (!key) continue;
    const lower = key.toLowerCase();
    map.set(lower, String(value ?? ""));
  }
  return map;
})();

/**
 * 展开 Windows 环境变量占位符（例如 %ProgramFiles%）。
 */
function expandWindowsEnvVariables(input: string): string {
  return input.replace(/%([^%]+)%/g, (match, name) => {
    const token = name.trim();
    if (!token) return match;
    const lower = token.toLowerCase();
    if (envCache.has(lower)) {
      return envCache.get(lower) as string;
    }
    return match;
  });
}

/**
 * 标准化可能的路径字符串，去除首尾引号并统一分隔符。
 */
function normalizePathValue(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const unquoted = trimmed.replace(/^"+|"+$/g, "");
  const expanded = expandWindowsEnvVariables(unquoted);
  const withBackslashes = expanded.replace(/\//g, "\\");
  try {
    const normalized = path.win32.normalize(withBackslashes);
    return normalized.trim() || null;
  } catch (err) {
    return withBackslashes.trim() || null;
  }
}

/**
 * 将路径字符串转为可能的安装目录；若路径指向文件则返回其上级目录。
 */
function normalizeDirectoryCandidate(value: string): string | null {
  const normalized = normalizePathValue(value);
  if (!normalized) return null;
  const isAbsolute =
    /^[A-Za-z]:\\/.test(normalized) || normalized.startsWith("\\\\");
  if (!isAbsolute) return null;

  let candidate = normalized;
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      candidate = path.win32.dirname(candidate);
    }
  } catch (err) {
    const basename = path.win32.basename(candidate);
    if (/\.(exe|bat|cmd|msi|lnk)$/i.test(basename)) {
      candidate = path.win32.dirname(candidate);
    }
  }

  const normalizedDir = path.win32.normalize(candidate);
  const isRoot = /^[A-Za-z]:\\?$/.test(normalizedDir);
  if (isRoot) {
    return `${normalizedDir.replace(/\\?$/, "")}\\`;
  }
  return normalizedDir.replace(/[\\]+$/, "");
}

/**
 * 从卸载命令等字符串中提取可推断的安装目录。
 */
function deriveDirectoryFromCommand(commandLine: string): string | null {
  if (!commandLine) return null;
  const trimmed = commandLine.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("msiexec")) return null;

  const iconAdjusted = trimmed.replace(/,\s*\d+$/, "");

  const quoted = iconAdjusted.match(/^"([^"]+)"/);
  if (quoted && quoted[1]) {
    return normalizeDirectoryCandidate(quoted[1]);
  }

  if (lower.startsWith("rundll32")) {
    const argsPart = iconAdjusted.slice("rundll32".length).trim();
    const dllQuoted = argsPart.match(/^"([^"]+)"/);
    if (dllQuoted && dllQuoted[1]) {
      return normalizeDirectoryCandidate(dllQuoted[1]);
    }
    const dllToken = argsPart.split(/[,\s]+/).find((tok) => tok);
    if (dllToken) {
      return normalizeDirectoryCandidate(dllToken);
    }
    return null;
  }

  const firstToken = iconAdjusted.split(/\s+/)[0];
  const cleanedToken = firstToken.replace(/,\s*\d+$/, "");
  return normalizeDirectoryCandidate(cleanedToken);
}

// 移除写入磁盘日志文件的功能 — 只保留控制台输出
function ensureLogFilePath() {
  return null;
}

function sanitizeForLog(
  value: any,
  depth = 0,
  seen = new WeakSet<object>()
): any {
  try {
    if (value == null) return value;
    if (typeof value === "string") {
      const maxLength = 2048;
      return value.length > maxLength
        ? `${value.slice(0, maxLength)}...<truncated>`
        : value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      if (depth >= 3) return `[array(${value.length})]`;
      return value
        .slice(0, 8)
        .map((item) => sanitizeForLog(item, depth + 1, seen));
    }
    if (typeof value === "object") {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
      if (depth >= 3) return "[object]";
      const out: Record<string, any> = {};
      const entries = Object.entries(value).slice(0, 12);
      for (const [k, v] of entries) {
        out[k] = sanitizeForLog(v, depth + 1, seen);
      }
      return out;
    }
    return String(value);
  } catch (err) {
    return `[sanitize error: ${String(err)}]`;
  }
}

function writeLog(event: string, meta?: Record<string, unknown>) {
  try {
    const payload =
      meta && Object.keys(meta).length > 0 ? sanitizeForLog(meta) : undefined;
    const line = `[${new Date().toISOString()}] ${event}` +
      `${payload ? ` ${JSON.stringify(payload)}` : ""}\n`;
    // 不再写入日志文件，改为仅输出到控制台（保留结构化信息）
    if (payload !== undefined) {
      console.log(`[LOG] ${event}`, payload);
    } else {
      console.log(`[LOG] ${event}`);
    }
  } catch (err) {
    console.error("[LOG] writeLog error", err);
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    // 增大窗口尺寸，开发/打包/可执行文件均适用
    width: 1500,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 检测本地 Vite dev server (5173) 是否可达；尝试多个主机名以提高可靠性
  async function isDevServerAvailable(port = 5173, timeout = 500) {
    const hosts = ["localhost", "127.0.0.1", "::1"];
    for (const host of hosts) {
      const ok = await new Promise<boolean>((resolve) => {
        const socket = net.connect({ port, host }, () => {
          socket.end();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
        socket.setTimeout(timeout, () => {
          socket.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    }
    return false;
  }

  try {
    const devAvailable = await isDevServerAvailable();
    if (devAvailable) {
      win.loadURL("http://localhost:5173");
    } else {
      win.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
  } catch (e) {
    // fallback to packaged file on any error
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  try {
    win.setMenu(null);
  } catch (err) {
    console.warn("[LOG] setMenu null failed", err);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 已移除基于磁盘的日志准备逻辑。

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Helper to run winget commands and return stdout
function runWinget(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`winget ${args}`, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>();
const cancelledOperations = new Set<string>();

function spawnWingetStream(
  args: string[],
  context: {
    action?: string;
    id?: string;
    name?: string;
    trackId?: string;
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = BrowserWindow.getAllWindows()[0];
    const child = spawn("winget", args, {
      windowsHide: true,
    });
    let out = "";
    const trackId = context?.trackId ? String(context.trackId) : null;
    if (trackId) {
      runningProcesses.set(trackId, child);
    }
    const cleanup = () => {
      if (trackId) runningProcesses.delete(trackId);
    };
    const sendChunk = (stream: "stdout" | "stderr", data: string) => {
      if (!win) return;
      const payload: Record<string, unknown> = {
        data,
        stream,
        args,
        timestamp: Date.now(),
        action: context?.action ?? null,
        id: context?.id ?? null,
        name: context?.name ?? null,
        trackId,
      };
      if (context && Object.keys(context).length > 0) {
        payload.context = context;
      }
      try {
        win.webContents.send("winget:stream", payload);
      } catch (err) {
        console.error("[spawnWingetStream] send error", err);
      }
    };
    child.stdout.on("data", (data) => {
      const s = data.toString();
      out += s;
      sendChunk("stdout", s);
    });
    child.stderr.on("data", (data) => {
      const s = data.toString();
      out += s;
      sendChunk("stderr", s);
    });
    child.on("error", (err) => {
      cleanup();
      reject(new Error(String(err)));
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (trackId && cancelledOperations.has(trackId)) {
        cancelledOperations.delete(trackId);
        return reject(new Error("__CANCELLED__"));
      }
      if (code === 0 || code === null) {
        return resolve(out);
      }
      const errorMessage =
        out && out.trim().length > 0
          ? out
          : `winget exited with code ${code}${signal ? ` (${signal})` : ""}`;
      reject(new Error(errorMessage));
    });
  });
}

function parseWingetList(output: string) {
  // More robust parse to support localized headers and summary lines.
  const lines = output.split(/\r?\n/).map((l) => l.trim());
  const data: any[] = [];
  // debug: capture sample of original lines for diagnosis
  try {
    const sampleLines = lines.filter((l) => l && !/^\s*$/.test(l)).slice(0, 12);
    if (sampleLines.length > 0) {
      console.log(
        "[DEV] parseWingetList sampleLines:",
        JSON.stringify(sampleLines, null, 2)
      );
    }
  } catch (e) {
    // ignore logging errors
  }

  // helper: detect header-like line (English or common localized headers)
  function isHeaderLine(line: string) {
    if (!line) return false;
    // common English header
    if (/^Name\s+Id\s+Version/i.test(line)) return true;
    // common Chinese header contains 名称/ID/版本/可用/源
    if (/名称|可用|版本|源|ID|Id|PackageIdentifier/i.test(line)) return true;
    // dashed separator
    if (/^[-=\s]{3,}$/.test(line) || /^[-]{10,}/.test(line)) return true;
    return false;
  }

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // drop lines that do not contain any letter/number/CJK characters
    if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(line)) continue;
    // drop lines that are only separators/punctuation/backslashes
    if (/^[\-\|\\\/\s\u0000-\u001F\u007F]+$/.test(line)) continue;

    // skip header lines and summary lines like '3 升级可用。' or '3 upgrades available.'
    if (isHeaderLine(line)) continue;
    if (/^\d+\s*(升级可用|upgrades available|升级|upgrades)/i.test(line))
      continue;
    if (/^找不到与输入条件匹配的已安装程序包/i.test(line)) continue;

    // winget list typically separates columns by two or more spaces
    const parts = line
      .split(/\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    // helper to detect junk-only tokens (e.g. '-', '\\', '|', or control chars)
    function isJunkToken(tok: string) {
      if (!tok) return true;
      const cleaned = tok.replace(/[\x00-\x1F\x7F]+/g, "").trim();
      if (!cleaned) return true;
      // tokens that are only punctuation/slashes/backslashes/dashes
      if (/^[\-\|\\\/\s]+$/.test(cleaned)) return true;
      // tokens that are too short and not useful
      if (cleaned.length <= 1 && !/\d/.test(cleaned)) return true;
      return false;
    }

    // If the entire line is just separators or junk, skip it
    if (parts.length === 0 || parts.every((p) => isJunkToken(p))) continue;

    // Heuristics: parts may be [name, id, version, available] or shorter.
    if (parts.length >= 4) {
      // sanity checks: name should contain at least one letter/number; id should not be junk
      if (/[A-Za-z0-9\u4e00-\u9fff]/.test(parts[0]) && !isJunkToken(parts[1])) {
        data.push({
          name: parts[0],
          id: parts[1],
          version: parts[2],
          available: parts[3],
        });
      } else {
        continue;
      }
    } else if (parts.length === 3) {
      // Could be name, id, version OR name, version, available depending on locale.
      // Heuristic: require name to have letters/digits and id not to be junk.
      if (/[A-Za-z0-9\u4e00-\u9fff]/.test(parts[0]) && !isJunkToken(parts[1])) {
        data.push({
          name: parts[0],
          id: parts[1],
          version: parts[2],
          available: "",
        });
      } else {
        continue;
      }
    } else if (parts.length === 2) {
      if (/[A-Za-z0-9\u4e00-\u9fff]/.test(parts[0]) && !isJunkToken(parts[1])) {
        data.push({ name: parts[0], id: parts[1], version: "", available: "" });
      } else {
        continue;
      }
    } else {
      // single column lines (unlikely) — ignore
      continue;
    }
  }

  try {
    // show a small sample of parsed results for debugging
    if (data.length > 0) {
      console.log(
        "[DEV] parseWingetList parsedCount:",
        data.length,
        "sample:",
        JSON.stringify(data.slice(0, 6), null, 2)
      );
    } else {
      console.log("[DEV] parseWingetList parsedCount: 0");
    }
  } catch (e) {
    // ignore
  }

  // Final defensive filter: remove any rows where name or id look like junk
  const cleaned = data.filter((row) => {
    try {
      const name = String(row.name || "").trim();
      const id = String(row.id || "").trim();
      const junkPattern = /^[\-\|\\\/\s\x00-\x1F\x7F]+$/;
      const hasAlphaNum =
        /[A-Za-z0-9\u4e00-\u9fff]/.test(name) ||
        /[A-Za-z0-9\u4e00-\u9fff]/.test(id);
      if (!hasAlphaNum) return false;
      if (junkPattern.test(name)) return false;
      if (junkPattern.test(id)) return false;
      return true;
    } catch (e) {
      return false;
    }
  });

  try {
    if (cleaned.length !== data.length) {
      console.log(
        "[DEV] parseWingetList removed junk rows:",
        data.length - cleaned.length
      );
    }
  } catch (e) {}

  return cleaned;
}

ipcMain.handle("winget:list", async () => {
  try {
    // Prefer structured JSON output when available
    try {
      const out = await runWinget("list --output json");
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) {
        return parsed.map((it: any) => ({
          name: it.Name || it.name || it.PackageName || "",
          id: it.Id || it.Id || it.PackageIdentifier || it.PackageId || "",
          version:
            it.Version || it.InstalledVersion || it.installedVersion || "",
          available:
            it.AvailableVersion || it.Available || it.sourceVersion || "",
        }));
      }
      // fallback to text parsing if JSON not as expected
      return parseWingetList(out);
    } catch (e) {
      // fallback: plain text parsing
      const out = await runWinget("list");
      return parseWingetList(out);
    }
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle(
  "winget:upgrade",
  async (_event, id: string, trackId?: string) => {
    try {
      const out = await spawnWingetStream(
        ["upgrade", "--id", String(id), "-e"],
        {
          action: "upgrade",
          id: String(id),
          trackId: trackId ? String(trackId) : undefined,
        }
      );
      return out;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
);

ipcMain.handle("winget:upgradeAll", async () => {
  try {
    const out = await spawnWingetStream(["upgrade", "--all", "-e"], {
      action: "upgradeAll",
    });
    return out;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
});

ipcMain.handle("winget:uninstall", async (_event, id: string) => {
  try {
    const out = await spawnWingetStream(
      ["uninstall", "--id", String(id), "-e"],
      { action: "uninstall", id: String(id) }
    );
    return out;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
});

ipcMain.handle("winget:cancel", async (_event, trackId: string) => {
  const key = String(trackId || "");
  if (!key) return { ok: false, error: "invalid_track_id" };
  const child = runningProcesses.get(key);
  if (!child) {
    return { ok: false, error: "not_running" };
  }
  try {
    let killIssued = false;
    try {
      if (child.kill()) {
        killIssued = true;
      }
    } catch (err) {
      // ignore direct kill errors
    }
    if (process.platform === "win32" && child.pid) {
      try {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
        });
        killIssued = true;
      } catch (err) {
        // ignore taskkill errors
      }
    }
    if (!killIssued) {
      return { ok: false, error: "unable_to_terminate" };
    }
    cancelledOperations.add(key);
    return { ok: true, killed: true };
  } catch (err) {
    cancelledOperations.delete(key);
    return { ok: false, error: String(err) };
  }
});
