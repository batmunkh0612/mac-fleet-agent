"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_child_process2 = require("child_process");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/self-update.ts
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var LAUNCHCTL_LABEL = "com.company.mac-agent";
var isManifest = (body) => {
  const t = body.trim();
  return t.startsWith("{") && (t.includes('"url"') || t.includes('"version"'));
};
var fetchUpdatePayload = async (updateUrl) => {
  const res = await fetch(updateUrl, { method: "GET" });
  if (!res.ok)
    throw new Error(`Update fetch: ${res.status}`);
  const body = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json") || isManifest(body)) {
    const json = JSON.parse(body);
    if (json.url) {
      const r2 = await fetch(json.url, { method: "GET" });
      if (!r2.ok)
        throw new Error(`Update download: ${r2.status}`);
      return r2.text();
    }
  }
  return body;
};
var checkAndApplyUpdate = async (options) => {
  const { agentUpdateUrl, log: log2, getInstallDir: getInstallDir2, launchdLabel = LAUNCHCTL_LABEL } = options;
  if (!agentUpdateUrl || !agentUpdateUrl.startsWith("http"))
    return false;
  const installDir = getInstallDir2();
  const currentPath = path.join(installDir, "agent.js");
  const newPath = path.join(installDir, "agent.js.new");
  if (!fs.existsSync(currentPath))
    return false;
  let newBody;
  try {
    newBody = await fetchUpdatePayload(agentUpdateUrl);
  } catch (err) {
    log2(`Update check failed: ${err}`);
    return false;
  }
  try {
    fs.writeFileSync(newPath, newBody, "utf-8");
  } catch (err) {
    log2(`Update write failed: ${err}`);
    return false;
  }
  const currentStat = fs.statSync(currentPath);
  const newStat = fs.statSync(newPath);
  if (currentStat.size === newStat.size) {
    try {
      fs.unlinkSync(newPath);
    } catch {
    }
    return false;
  }
  log2("Applying update and restarting");
  const scriptPath = path.join("/tmp", `mac-agent-updater-${process.pid}.sh`);
  const escapeSh = (s) => s.replace(/'/g, "'\\''");
  const oldPath = path.join(installDir, "agent.js.old");
  const script = [
    "#!/bin/bash",
    "sleep 2",
    `mv '${escapeSh(currentPath)}' '${escapeSh(oldPath)}'`,
    `mv '${escapeSh(newPath)}' '${escapeSh(currentPath)}'`,
    `launchctl kick -k -p ${launchdLabel}`
  ].join("\n");
  fs.writeFileSync(scriptPath, script, { mode: 493 });
  (0, import_child_process.spawn)("sh", [scriptPath], { detached: true, stdio: "ignore" }).unref();
  return true;
};

// src/index.ts
var getDefaultConfigDir = () => {
  const home = process.env.HOME || "/tmp";
  return path2.join(home, ".mac-fleet-agent");
};
var CONFIG_PATH = "";
var LOG_PATH = "";
var EXECUTED_PATH = "";
var initPaths = () => {
  const envConfig = process.env.MAC_AGENT_CONFIG || process.env.CONFIG_PATH;
  const cwdConfig = path2.join(process.cwd(), "config", "mac-agent.json");
  const defaultConfig = path2.join(getDefaultConfigDir(), "mac-agent.json");
  if (envConfig) {
    CONFIG_PATH = path2.resolve(envConfig);
  } else if (fs2.existsSync(cwdConfig)) {
    CONFIG_PATH = cwdConfig;
  } else {
    CONFIG_PATH = defaultConfig;
  }
  const stateDir = path2.dirname(CONFIG_PATH);
  LOG_PATH = path2.join(stateDir, "mac-agent.log");
  EXECUTED_PATH = path2.join(stateDir, "executed.json");
  if (!fs2.existsSync(stateDir)) {
    fs2.mkdirSync(stateDir, { recursive: true });
  }
};
var STREAM_PREFIX = "cmd:stream:";
var CONSUMER_GROUP = "mac-agents";
var getStreamName = () => `${STREAM_PREFIX}${serialNumber}`;
var MAX_LOG_SIZE = 10 * 1024 * 1024;
var config;
var serialNumber;
var executedCommands = {};
var getSerialNumber = () => {
  try {
    const output = (0, import_child_process2.execSync)(
      `ioreg -l | grep IOPlatformSerialNumber | awk -F'"' '{print $4}'`,
      { encoding: "utf-8" }
    );
    return output.trim();
  } catch {
    throw new Error("Failed to get Mac serial number");
  }
};
var log = (message) => {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const line = `[${timestamp}] [${serialNumber}] ${message}
`;
  process.stdout.write(line);
  try {
    fs2.appendFileSync(LOG_PATH, line);
  } catch {
  }
};
var rotateLogIfNeeded = () => {
  try {
    const stats = fs2.statSync(LOG_PATH);
    if (stats.size > MAX_LOG_SIZE) {
      fs2.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
  } catch {
  }
};
var loadConfig = () => {
  const data = fs2.readFileSync(CONFIG_PATH, "utf-8");
  const cfg = JSON.parse(data);
  if (!cfg.apiBaseUrl || !cfg.redisUrl || !cfg.redisToken) {
    throw new Error("Missing required config: apiBaseUrl, redisUrl, redisToken");
  }
  cfg.pollIntervalMs = cfg.pollIntervalMs || 5e3;
  cfg.updateCheckIntervalMs = cfg.updateCheckIntervalMs ?? 0;
  return cfg;
};
var loadExecutedCommands = () => {
  try {
    const data = fs2.readFileSync(EXECUTED_PATH, "utf-8");
    executedCommands = JSON.parse(data);
  } catch {
    executedCommands = {};
  }
};
var saveExecutedCommands = () => {
  const dir = path2.dirname(EXECUTED_PATH);
  if (!fs2.existsSync(dir)) {
    fs2.mkdirSync(dir, { recursive: true });
  }
  fs2.writeFileSync(EXECUTED_PATH, JSON.stringify(executedCommands, null, 2));
};
var isCommandExecuted = (cmdId) => cmdId in executedCommands;
var markCommandExecuted = (cmdId) => {
  executedCommands[cmdId] = (/* @__PURE__ */ new Date()).toISOString();
  saveExecutedCommands();
};
var redisExecute = async (command) => {
  const response = await fetch(config.redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    throw new Error(`Redis error: ${response.status}`);
  }
  return response.json();
};
var checkRedisConnection = async () => {
  try {
    const response = await redisExecute(["PING"]);
    const pong = response?.result === "PONG";
    log(pong ? "Redis: connection up" : `Redis: unexpected response ${JSON.stringify(response)}`);
    return pong;
  } catch (error) {
    log(`Redis: connection down - ${error}`);
    return false;
  }
};
var initConsumerGroup = async () => {
  try {
    await redisExecute(["XGROUP", "CREATE", getStreamName(), CONSUMER_GROUP, "0", "MKSTREAM"]);
    log("Consumer group created");
  } catch {
    log("Consumer group ready");
  }
};
var readCommands = async () => {
  try {
    const response = await redisExecute([
      "XREADGROUP",
      "GROUP",
      CONSUMER_GROUP,
      serialNumber,
      "COUNT",
      "10",
      "BLOCK",
      "5000",
      "STREAMS",
      getStreamName(),
      ">"
    ]);
    if (!response.result || response.result.length === 0) {
      return [];
    }
    const commands = [];
    const streamData = response.result[0];
    if (streamData && streamData.length > 1) {
      const entries = streamData[1];
      for (const entry of entries) {
        const messageId = entry[0];
        const fields = entry[1];
        const cmd = { messageId };
        for (let i = 0; i < fields.length; i += 2) {
          const key = fields[i];
          const val = fields[i + 1];
          switch (key) {
            case "cmdId":
              cmd.cmdId = val;
              break;
            case "deviceId":
              cmd.deviceId = val;
              break;
            case "script":
              cmd.script = val;
              break;
            case "argsJson":
              cmd.argsJson = val;
              break;
            case "timeoutSec":
              cmd.timeoutSec = parseInt(val, 10);
              break;
          }
        }
        if (cmd.cmdId && cmd.messageId && cmd.script) {
          commands.push(cmd);
        }
      }
    }
    return commands;
  } catch (error) {
    log(`Error reading commands: ${error}`);
    return [];
  }
};
var ackCommand = async (messageId) => {
  try {
    await redisExecute(["XACK", getStreamName(), CONSUMER_GROUP, messageId]);
  } catch (error) {
    log(`Error ACKing command: ${error}`);
  }
};
var executeScript = (script, argsJson, timeoutSec) => {
  return new Promise((resolve2) => {
    const tmpPath = `/tmp/fleet-cmd-${Date.now()}.sh`;
    try {
      fs2.writeFileSync(tmpPath, script, { mode: 493 });
    } catch (err) {
      resolve2({ stdout: "", stderr: `Failed to write script: ${err}`, exitCode: 1 });
      return;
    }
    const args = JSON.parse(argsJson || "{}");
    const env = { ...process.env };
    for (const [key, value] of Object.entries(args)) {
      env[`ARG_${key}`] = value;
    }
    const proc = (0, import_child_process2.spawn)("/bin/bash", [tmpPath], {
      env,
      timeout: timeoutSec * 1e3
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      try {
        fs2.unlinkSync(tmpPath);
      } catch {
      }
      resolve2({
        stdout: stdout.slice(0, 65536),
        stderr: stderr.slice(0, 65536),
        exitCode: code ?? 1
      });
    });
    proc.on("error", (error) => {
      try {
        fs2.unlinkSync(tmpPath);
      } catch {
      }
      resolve2({ stdout: "", stderr: error.message, exitCode: 1 });
    });
  });
};
var submitResult = async (cmdId, exitCode, stdout, stderr) => {
  const mutation = `
    mutation SubmitResult($input: SubmitFleetResultInput!) {
      submitFleetResult(input: $input) {
        id
        duplicate
      }
    }
  `;
  const variables = {
    input: {
      serial: serialNumber,
      cmdId,
      exitCode,
      stdout,
      stderr,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  log(`Submitting result for cmd: ${cmdId}`);
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mutation, variables })
    });
    const data = await response.json();
    if (data.errors) {
      log(`Result submission failed: ${JSON.stringify(data.errors)}`);
    } else {
      log(`Result submitted: ${data.data?.submitFleetResult?.id}`);
    }
  } catch (error) {
    log(`Failed to submit result: ${error}`);
  }
};
var processCommand = async (cmd) => {
  log(`Processing command: ${cmd.cmdId}`);
  if (isCommandExecuted(cmd.cmdId)) {
    log(`Command ${cmd.cmdId} already executed, skipping`);
    await ackCommand(cmd.messageId);
    return;
  }
  const startTime = Date.now();
  const { stdout, stderr, exitCode } = await executeScript(
    cmd.script,
    cmd.argsJson,
    cmd.timeoutSec || 300
  );
  const duration = Date.now() - startTime;
  await submitResult(cmd.cmdId, exitCode, stdout, stderr);
  markCommandExecuted(cmd.cmdId);
  await ackCommand(cmd.messageId);
  log(`Command ${cmd.cmdId} completed (exit: ${exitCode}, duration: ${duration}ms)`);
};
var getInstallDir = () => path2.dirname(process.argv[1] || process.cwd());
var pollLoop = async () => {
  let backoff = config.pollIntervalMs;
  const maxBackoff = 6e4;
  let lastUpdateCheck = 0;
  while (true) {
    try {
      const commands = await readCommands();
      backoff = config.pollIntervalMs;
      const interval = config.updateCheckIntervalMs ?? 0;
      if (config.agentUpdateUrl && interval > 0 && Date.now() - lastUpdateCheck >= interval) {
        lastUpdateCheck = Date.now();
        const updated = await checkAndApplyUpdate({
          agentUpdateUrl: config.agentUpdateUrl,
          log,
          getInstallDir,
          launchdLabel: config.launchdLabel
        });
        if (updated)
          process.exit(0);
      }
      for (const cmd of commands) {
        await processCommand(cmd);
      }
    } catch (error) {
      log(`Poll error: ${error}`);
      backoff = Math.min(backoff * 2, maxBackoff);
    }
    await new Promise((resolve2) => setTimeout(resolve2, backoff));
  }
};
var main = async () => {
  initPaths();
  rotateLogIfNeeded();
  serialNumber = getSerialNumber();
  console.log(`Mac Fleet Agent starting...`);
  console.log(`Serial: ${serialNumber}`);
  try {
    config = loadConfig();
    log(`Config loaded, polling ${config.apiBaseUrl}`);
    loadExecutedCommands();
    log("Ready");
    process.on("SIGINT", () => {
      log("Shutdown");
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      log("Shutdown");
      process.exit(0);
    });
    const redisUp = await checkRedisConnection();
    if (!redisUp) {
      log("Starting anyway; will retry Redis on each poll.");
    }
    await initConsumerGroup();
    log(`Listening on stream: ${getStreamName()}`);
    if (config.agentUpdateUrl) {
      const updated = await checkAndApplyUpdate({
        agentUpdateUrl: config.agentUpdateUrl,
        log,
        getInstallDir,
        launchdLabel: config.launchdLabel
      });
      if (updated)
        process.exit(0);
    }
    await pollLoop();
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
};
main();
