const bridge = window.quickaddBridge;

const elements = {
  choiceView: document.querySelector("#choice-view"),
  settingsView: document.querySelector("#settings-view"),
  choiceTitle: document.querySelector("#choice-title"),
  choiceDescription: document.querySelector("#choice-description"),
  choiceVariable: document.querySelector("#choice-variable"),
  choiceValue: document.querySelector("#choice-value"),
  runChoice: document.querySelector("#run-choice"),
  choiceStatus: document.querySelector("#choice-status"),
  detectedVaults: document.querySelector("#detected-vaults"),
  detectVaults: document.querySelector("#detect-vaults"),
  manualVaultFields: document.querySelector("#manual-vault-fields"),
  vaultName: document.querySelector("#vault-name"),
  vaultPath: document.querySelector("#vault-path"),
  defaultVariable: document.querySelector("#default-variable"),
  saveSettings: document.querySelector("#save-settings"),
  settingsStatus: document.querySelector("#settings-status"),
  choiceCount: document.querySelector("#choice-count"),
  choiceList: document.querySelector("#choice-list")
};

let currentAction = { view: "settings" };
let detectedVaults = [];

function setStatus(element, message, isError) {
  element.textContent = message || "";
  element.classList.toggle("error", Boolean(isError));
}

function showView(view) {
  elements.choiceView.classList.toggle("hidden", view !== "choice");
  elements.settingsView.classList.toggle("hidden", view !== "settings");
}

function renderChoices(choices) {
  const safeChoices = Array.isArray(choices) ? choices : [];
  elements.choiceCount.textContent = String(safeChoices.length);

  if (safeChoices.length === 0) {
    elements.choiceList.className = "choice-list empty";
    elements.choiceList.textContent = "暂无 choices，请先保存 vault 配置。";
    return;
  }

  elements.choiceList.className = "choice-list";
  elements.choiceList.innerHTML = safeChoices
    .map((choice) => {
      const group = choice.group ? ` · ${escapeHtml(choice.group)}` : "";
      return `
        <article class="choice-item">
          <strong>${escapeHtml(choice.name)}</strong>
          <small>${escapeHtml(choice.type || "Choice")}${group}</small>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderVaultOptions(vaults) {
  const currentPath = elements.vaultPath.value;
  elements.detectedVaults.innerHTML = `<option value="">手动填写</option>`;

  vaults.forEach((vault, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${vault.name} (${vault.path})`;
    if (vault.path === currentPath) option.selected = true;
    elements.detectedVaults.appendChild(option);
  });

  updateManualVaultVisibility();
}

function getSelectedVault() {
  if (elements.detectedVaults.value === "") return null;
  const selectedIndex = Number(elements.detectedVaults.value);
  return Number.isInteger(selectedIndex) ? detectedVaults[selectedIndex] : null;
}

function updateManualVaultVisibility() {
  const hasSelectedVault = Boolean(getSelectedVault());
  elements.manualVaultFields.classList.toggle("hidden", hasSelectedVault);
}

function loadDetectedVaults() {
  try {
    detectedVaults = bridge.detectVaults();
    renderVaultOptions(detectedVaults);
    if (detectedVaults.length === 0) {
      setStatus(elements.settingsStatus, "没有从 Obsidian 配置中检测到 vault，可以手动填写。");
    }
  } catch (error) {
    setStatus(elements.settingsStatus, error.message, true);
  }
}

function renderSettings(message, isError) {
  const settings = bridge.loadSettings();
  elements.vaultName.value = settings.vaultName || "";
  elements.vaultPath.value = settings.vaultPath || "";
  elements.defaultVariable.value = settings.defaultVariableName || "value";
  renderChoices(settings.choices || []);
  renderVaultOptions(detectedVaults);
  setStatus(elements.settingsStatus, message || "", isError);
  showView("settings");
}

function renderChoice(action) {
  const choice = action.choice || {};
  elements.choiceTitle.textContent = choice.name || "输入内容";
  elements.choiceDescription.textContent = action.vaultName
    ? `将执行 vault「${action.vaultName}」中的 QuickAdd choice。`
    : "将执行默认 Obsidian vault 中的 QuickAdd choice。";
  elements.choiceVariable.value = action.defaultVariableName || "value";
  elements.choiceValue.value = action.initialValue || "";
  setStatus(elements.choiceStatus, "");
  showView("choice");
  setTimeout(() => elements.choiceValue.focus(), 50);
}

function handleAction(action) {
  currentAction = action || { view: "settings" };
  if (currentAction.view === "choice") {
    renderChoice(currentAction);
  } else {
    renderSettings(currentAction.error || (currentAction.refreshed ? "QuickAdd 指令已刷新。" : ""), Boolean(currentAction.error));
  }
}

async function runCurrentChoice() {
  try {
    setStatus(elements.choiceStatus, "正在调用 Obsidian...");
    await bridge.runChoice({
      code: currentAction.code,
      variableName: elements.choiceVariable.value,
      value: elements.choiceValue.value
    });
    setStatus(elements.choiceStatus, "已发送到 Obsidian。");
  } catch (error) {
    setStatus(elements.choiceStatus, error.message, true);
  }
}

function saveSettings() {
  try {
    setStatus(elements.settingsStatus, "正在保存并刷新 QuickAdd 指令...");
    const settings = bridge.saveSettings({
      vaultName: elements.vaultName.value.trim(),
      vaultPath: elements.vaultPath.value.trim(),
      defaultVariableName: elements.defaultVariable.value.trim() || "value"
    });
    renderChoices(settings.choices || []);
    setStatus(elements.settingsStatus, `已加载并注册 ${settings.choices.length} 个 QuickAdd 指令。`);
  } catch (error) {
    const settings = bridge.loadSettings();
    renderChoices(settings.choices || []);
    setStatus(elements.settingsStatus, error.message, true);
  }
}

function bindEvents() {
  elements.detectedVaults.addEventListener("change", () => {
    const vault = getSelectedVault();
    if (vault) {
      elements.vaultName.value = vault.name;
      elements.vaultPath.value = vault.path;
    }
    updateManualVaultVisibility();
    if (vault) saveSettings();
  });

  elements.detectVaults.addEventListener("click", () => {
    loadDetectedVaults();
    setStatus(elements.settingsStatus, `已检测到 ${detectedVaults.length} 个 vault。`);
  });

  elements.saveSettings.addEventListener("click", saveSettings);
  elements.runChoice.addEventListener("click", runCurrentChoice);

  elements.choiceValue.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runCurrentChoice();
    }
  });

  window.addEventListener("quickadd-enter", (event) => handleAction(event.detail));
}

function bootstrap() {
  bindEvents();
  loadDetectedVaults();
  handleAction(bridge.getInitialAction());
}

bootstrap();
