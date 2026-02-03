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
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var getDefaultConfigDir = () => {
  const home = process.env.HOME || "/tmp";
  return path.join(home, ".mac-fleet-agent");
};
var CONFIG_PATH = "";
var LOG_PATH = "";
var EXECUTED_PATH = "";
var initPaths = () => {
  const envConfig = process.env.MAC_AGENT_CONFIG || process.env.CONFIG_PATH;
  const cwdConfig = path.join(process.cwd(), "config", "mac-agent.json");
  const defaultConfig = path.join(getDefaultConfigDir(), "mac-agent.json");
  if (envConfig) {
    CONFIG_PATH = path.resolve(envConfig);
  } else if (fs.existsSync(cwdConfig)) {
    CONFIG_PATH = cwdConfig;
  } else {
    CONFIG_PATH = defaultConfig;
  }
  const stateDir = path.dirname(CONFIG_PATH);
  LOG_PATH = path.join(stateDir, "mac-agent.log");
  EXECUTED_PATH = path.join(stateDir, "executed.json");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
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
    const output = (0, import_child_process.execSync)(
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
    fs.appendFileSync(LOG_PATH, line);
  } catch {
  }
};
var rotateLogIfNeeded = () => {
  try {
    const stats = fs.statSync(LOG_PATH);
    if (stats.size > MAX_LOG_SIZE) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
  } catch {
  }
};
var loadConfig = () => {
  const data = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cfg = JSON.parse(data);
  if (!cfg.apiBaseUrl || !cfg.redisUrl || !cfg.redisToken) {
    throw new Error("Missing required config: apiBaseUrl, redisUrl, redisToken");
  }
  cfg.pollIntervalMs = cfg.pollIntervalMs || 5e3;
  return cfg;
};
var loadExecutedCommands = () => {
  try {
    const data = fs.readFileSync(EXECUTED_PATH, "utf-8");
    executedCommands = JSON.parse(data);
  } catch {
    executedCommands = {};
  }
};
var saveExecutedCommands = () => {
  const dir = path.dirname(EXECUTED_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(EXECUTED_PATH, JSON.stringify(executedCommands, null, 2));
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
      fs.writeFileSync(tmpPath, script, { mode: 493 });
    } catch (err) {
      resolve2({ stdout: "", stderr: `Failed to write script: ${err}`, exitCode: 1 });
      return;
    }
    const args = JSON.parse(argsJson || "{}");
    const env = { ...process.env };
    for (const [key, value] of Object.entries(args)) {
      env[`ARG_${key}`] = value;
    }
    const proc = (0, import_child_process.spawn)("/bin/bash", [tmpPath], {
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
        fs.unlinkSync(tmpPath);
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
        fs.unlinkSync(tmpPath);
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
var pollLoop = async () => {
  let backoff = config.pollIntervalMs;
  const maxBackoff = 6e4;
  while (true) {
    try {
      const commands = await readCommands();
      backoff = config.pollIntervalMs;
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
    await initConsumerGroup();
    log(`Listening on stream: ${getStreamName()}`);
    await pollLoop();
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
};
main();
