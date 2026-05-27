const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { shell } = require("electron");

const STORAGE_KEY = "obsidianQuickAdd.settings";
const STATIC_CODES = new Set(["settings"]);

function getDefaultSettings() {
  return {
    vaultName: "",
    vaultPath: "",
    defaultVariableName: "value",
    choices: [],
    featureMap: {},
    featureCodes: []
  };
}

function readSettings() {
  const saved = window.utools && window.utools.dbStorage
    ? window.utools.dbStorage.getItem(STORAGE_KEY)
    : null;
  return Object.assign(getDefaultSettings(), saved || {});
}

function writeSettings(settings) {
  const normalized = Object.assign(getDefaultSettings(), settings || {});
  if (!normalized.vaultName && normalized.vaultPath) {
    normalized.vaultName = path.basename(normalized.vaultPath);
  }
  if (window.utools && window.utools.dbStorage) {
    window.utools.dbStorage.setItem(STORAGE_KEY, normalized);
  }
  return normalized;
}

function hashFeatureCode(input) {
  return "qa_" + crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function normalizeVariableName(variableName) {
  const normalized = String(variableName || "").trim();
  return normalized || "value";
}

function getQuickAddConfigPath(vaultPath) {
  if (!vaultPath) return "";
  return path.join(vaultPath, ".obsidian", "plugins", "quickadd", "data.json");
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getObsidianConfigPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    return appData ? path.join(appData, "obsidian", "obsidian.json") : "";
  }

  const homeDir = process.env.HOME;
  if (!homeDir) return "";

  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "obsidian", "obsidian.json");
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  return path.join(configHome, "obsidian", "obsidian.json");
}

function detectVaults() {
  const obsidianConfigPath = getObsidianConfigPath();
  if (!obsidianConfigPath) return [];
  if (!fs.existsSync(obsidianConfigPath)) return [];

  const config = readJsonFile(obsidianConfigPath);
  const vaults = config && config.vaults ? config.vaults : {};

  return Object.entries(vaults)
    .map(([id, vault]) => {
      const vaultPath = vault && vault.path ? vault.path : "";
      return {
        id,
        name: vaultPath ? path.basename(vaultPath) : id,
        path: vaultPath,
        open: Boolean(vault && vault.open),
        ts: vault && vault.ts ? vault.ts : 0
      };
    })
    .filter((vault) => vault.path)
    .sort((a, b) => Number(b.open) - Number(a.open) || b.ts - a.ts || a.name.localeCompare(b.name));
}

function addChoice(result, seen, choice, group) {
  if (!choice || typeof choice.name !== "string") return;
  const name = choice.name.trim();
  if (!name || seen.has(name)) return;

  seen.add(name);
  result.push({
    name,
    type: choice.type || choice.choiceType || choice.formatType || "Choice",
    group: group || "",
    enabled: choice.enabled !== false
  });
}

function collectChoicesFromArray(items, result, seen, group) {
  if (!Array.isArray(items)) return;

  items.forEach((item) => {
    if (!item || typeof item !== "object") return;

    addChoice(result, seen, item, group);

    const nextGroup = item.name || group;
    ["choices", "children", "items"].forEach((key) => {
      if (Array.isArray(item[key])) {
        collectChoicesFromArray(item[key], result, seen, nextGroup);
      }
    });
  });
}

function findChoiceArrays(node, arrays) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item) => findChoiceArrays(item, arrays));
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key.toLowerCase() === "choices" && Array.isArray(value)) {
      arrays.push(value);
    } else if (value && typeof value === "object") {
      findChoiceArrays(value, arrays);
    }
  });
}

function extractChoices(data) {
  const result = [];
  const seen = new Set();
  const arrays = [];

  if (Array.isArray(data && data.choices)) arrays.push(data.choices);
  if (Array.isArray(data && data.settings && data.settings.choices)) arrays.push(data.settings.choices);
  if (arrays.length === 0) findChoiceArrays(data, arrays);

  arrays.forEach((items) => collectChoicesFromArray(items, result, seen, ""));

  return result
    .filter((choice) => choice.enabled)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function removeOldFeatures(featureCodes) {
  if (!Array.isArray(featureCodes) || featureCodes.length === 0) return;
  if (window.utools && typeof window.utools.removeFeature === "function") {
    const dynamicCodes = featureCodes.filter((code) => !STATIC_CODES.has(code));
    dynamicCodes.forEach((code) => window.utools.removeFeature(code));
  }
}

function registerChoiceFeatures(settings) {
  const vaultLabel = settings.vaultName || (settings.vaultPath ? path.basename(settings.vaultPath) : "Obsidian");
  const featureMap = {};
  const featureCodes = [];

  (settings.choices || []).forEach((choice) => {
    const code = hashFeatureCode(`${settings.vaultName}|${settings.vaultPath}|${choice.name}`);
    featureCodes.push(code);
    featureMap[code] = choice;

    window.utools.setFeature({
      code,
      explain: `在 ${vaultLabel} 中执行 QuickAdd: ${choice.name}`,
      icon: "quickadd.png",
      cmds: [
        choice.name,
        `QuickAdd ${choice.name}`,
        `闪念 ${choice.name}`,
        {
          type: "over",
          label: choice.name,
          minLength: 1
        }
      ]
    });
  });

  return Object.assign({}, settings, { featureMap, featureCodes });
}

function clearChoiceFeatures(settings) {
  removeOldFeatures(settings.featureCodes);
  return writeSettings(Object.assign({}, settings, {
    choices: [],
    featureMap: {},
    featureCodes: []
  }));
}

function refreshChoices(inputSettings) {
  const current = Object.assign(readSettings(), inputSettings || {});
  if (!current.vaultPath) {
    clearChoiceFeatures(current);
    throw new Error("请先配置 vault 路径。");
  }

  const configPath = getQuickAddConfigPath(current.vaultPath);
  if (!fs.existsSync(configPath)) {
    clearChoiceFeatures(current);
    throw new Error(`未找到 QuickAdd 配置文件：${configPath}`);
  }

  const data = readJsonFile(configPath);
  const choices = extractChoices(data);
  const settingsWithChoices = Object.assign({}, current, { choices });

  removeOldFeatures(current.featureCodes);
  const registered = registerChoiceFeatures(settingsWithChoices);
  return writeSettings(registered);
}

function encodeParam(value) {
  return encodeURIComponent(String(value));
}

function buildQuickAddUri(options) {
  const vaultName = String(options.vaultName || "").trim();
  const choiceName = String(options.choiceName || "").trim();
  const variableName = normalizeVariableName(options.variableName);
  const value = String(options.value || "");

  if (!choiceName) throw new Error("缺少 QuickAdd choice。");

  const parts = [];
  if (vaultName) parts.push(`vault=${encodeParam(vaultName)}`);
  parts.push(`choice=${encodeParam(choiceName)}`);
  parts.push(`value-${encodeParam(variableName)}=${encodeParam(value)}`);

  return `obsidian://quickadd?${parts.join("&")}`;
}

async function runChoice(payload) {
  const settings = readSettings();
  const choice = payload.choiceName
    ? { name: payload.choiceName }
    : settings.featureMap[payload.code];

  if (!choice || !choice.name) {
    throw new Error("未找到对应的 QuickAdd choice，请刷新指令后重试。");
  }

  const uri = buildQuickAddUri({
    vaultName: settings.vaultName,
    choiceName: choice.name,
    variableName: payload.variableName || settings.defaultVariableName,
    value: payload.value
  });

  await shell.openExternal(uri);
  if (window.utools) {
    window.utools.hideMainWindow();
    window.utools.outPlugin();
  }
  return { uri };
}

function publishAction(action) {
  window.__quickaddAction = action;
  window.dispatchEvent(new CustomEvent("quickadd-enter", { detail: action }));
}

function getChoiceAction(action) {
  const settings = readSettings();
  const code = action && action.code;
  const choice = settings.featureMap && settings.featureMap[code];
  if (!choice) return null;

  return {
    view: "choice",
    code,
    choice,
    vaultName: settings.vaultName,
    vaultPath: settings.vaultPath,
    defaultVariableName: settings.defaultVariableName,
    initialValue: action.type === "over" ? action.payload : ""
  };
}

if (window.utools) {
  try {
    const settings = readSettings();
    if (settings.choices && settings.choices.length > 0) {
      registerChoiceFeatures(settings);
    }
  } catch (error) {
    console.error("[obsidian-quickadd] register features failed", error);
  }

  window.utools.onPluginEnter(async (action) => {
    try {
      const choiceAction = getChoiceAction(action);
      if (choiceAction && action.type === "over" && String(action.payload || "").trim()) {
        await runChoice({
          code: action.code,
          value: action.payload,
          variableName: choiceAction.defaultVariableName
        });
        window.utools.showNotification(`已发送到 QuickAdd: ${choiceAction.choice.name}`);
        return;
      }

      publishAction(choiceAction || { view: "settings" });
    } catch (error) {
      publishAction({ view: "settings", error: error.message });
    }
  });
}

window.quickaddBridge = {
  getInitialAction() {
    return window.__quickaddAction || { view: "settings" };
  },
  loadSettings() {
    return readSettings();
  },
  saveSettings(settings) {
    const merged = writeSettings(Object.assign(readSettings(), settings || {}));
    return refreshChoices(merged);
  },
  refreshChoices() {
    return refreshChoices();
  },
  detectVaults() {
    return detectVaults();
  },
  getQuickAddConfigPath(vaultPath) {
    return getQuickAddConfigPath(vaultPath || readSettings().vaultPath);
  },
  openQuickAddConfig() {
    const configPath = getQuickAddConfigPath(readSettings().vaultPath);
    if (!configPath || !fs.existsSync(configPath)) {
      throw new Error("QuickAdd 配置文件不存在，请先保存正确的 vault 路径。");
    }
    return shell.openPath(configPath);
  },
  runChoice(payload) {
    return runChoice(payload || {});
  }
};
