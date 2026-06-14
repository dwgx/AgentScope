import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import type { App, IpcMainEvent } from "electron";

export async function runIpcNegativeSmoke(options: {
  app: App;
  appHome: string;
  registeredIpcChannels: Set<string>;
}): Promise<void> {
  const outputPath = process.env.AGENTSCOPE_SMOKE_IPC_NEGATIVE_RESULT?.trim();
  if (!outputPath) throw new Error("AGENTSCOPE_SMOKE_IPC_NEGATIVE_RESULT is required.");
  const probeDir = path.join(options.app.getPath("userData"), "ipc-negative-smoke");
  const preload = path.join(probeDir, "malicious-preload.cjs");
  const html = path.join(probeDir, "malicious.html");
  const channels = [
    ["session:delete", ["codex", "11111111-1111-4111-8111-111111111111"]],
    ["session:import", [path.join(options.appHome, ".agentscope", "backups", "missing")]],
    ["session:restore", [path.join(options.appHome, ".agentscope", "quarantine", "missing")]],
    ["codexControl:executeMutation", [{ expectedSha256: "0".repeat(64), mutations: [{ itemId: "config.model", keyPath: "model", value: "gpt-5.5" }] }]],
    ["diagnostic:repair", ["native.better_sqlite3"]],
    ["shell:openPath", [path.join(options.appHome, ".codex", "auth.json")]]
  ] as const;
  const missing = channels.map(([channel]) => channel).filter((channel) => !options.registeredIpcChannels.has(channel));
  if (missing.length) throw new Error(`IPC negative smoke channel is not registered: ${missing.join(", ")}`);
  await fs.promises.mkdir(probeDir, { recursive: true });
  await fs.promises.writeFile(
    preload,
    [
      'const { ipcRenderer } = require("electron");',
      `const channels = ${JSON.stringify(channels)};`,
      "(async () => {",
      "  const results = [];",
      "  for (const [channel, args] of channels) {",
      "    try {",
      "      await ipcRenderer.invoke(channel, ...args);",
      "      results.push({ channel, ok: true, message: 'unexpected success' });",
      "    } catch (error) {",
      "      results.push({ channel, ok: false, message: error && error.message ? String(error.message) : String(error) });",
      "    }",
      "  }",
      "  ipcRenderer.send('agentscope:ipc-negative-result', results);",
      "})();"
    ].join("\n"),
    "utf8"
  );
  await fs.promises.writeFile(html, "<!doctype html><title>AgentScope IPC negative smoke</title>\n", "utf8");
  const result = await new Promise<Array<{ channel: string; ok: boolean; message: string }>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("IPC negative smoke timed out."));
    }, 15_000);
    const cleanup = () => {
      clearTimeout(timeout);
      ipcMain.removeListener("agentscope:ipc-negative-result", onResult);
    };
    const onResult = (_event: IpcMainEvent, results: Array<{ channel: string; ok: boolean; message: string }>) => {
      cleanup();
      resolve(results);
    };
    ipcMain.once("agentscope:ipc-negative-result", onResult);
    const probe = new BrowserWindow({
      show: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    probe.loadFile(html).catch((error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, `${JSON.stringify({ ok: true, results: result }, null, 2)}\n`, "utf8");
  const failures = result.filter((item) => item.ok || !/IPC sender rejected/i.test(item.message));
  if (failures.length) {
    throw new Error(`IPC negative smoke expected sender rejection: ${JSON.stringify(failures)}`);
  }
  options.app.quit();
}
