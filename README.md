# uTools Obsidian QuickAdd

一个 uTools 插件，用于全局快速调用 Obsidian QuickAdd 中已经配置好的 choice，并把 uTools 中输入的内容通过 Obsidian URI 传给 QuickAdd。

## 功能

- 自动读取 Obsidian 的 vault 列表，支持手动填写 vault 名称和路径。
- 读取当前 vault 的 `.obsidian/plugins/quickadd/data.json`。
- 将 QuickAdd choices 动态注册为 uTools features。
- 在 uTools 主输入框输入内容后，直接选择某个 QuickAdd choice，调用：

```text
obsidian://quickadd?vault=<Vault>&choice=<Choice>&value-<变量名>=<输入内容>
```

## 使用

1. 在 uTools 开发者工具中导入本目录。
2. 在 uTools 中输入 `Obsidian QuickAdd` 或 `QuickAdd 配置` 打开配置页。
3. 选择检测到的 Obsidian vault，或手动填写：
   - `Vault 名称或 ID`：传给 Obsidian URI 的 `vault` 参数。
   - `Vault 路径`：用于读取 QuickAdd 配置文件。
   - `默认 QuickAdd 变量名`：例如 QuickAdd 模板中使用 `{{VALUE:value}}`，这里填 `value`。
4. 点击 `保存并刷新指令`。
5. 回到 uTools 搜索框，直接输入要发送给 QuickAdd 的内容。
6. 在候选项中选择对应的 QuickAdd choice，例如 `闪念-待办`，插件会直接执行并退出。

也可以直接搜索 QuickAdd choice 名称进入插件窗口，再在窗口里填写内容，这是兜底编辑模式。

## 注意

- QuickAdd URI 只能填充命名变量，例如 `{{VALUE:value}}`。裸 `{{VALUE}}` / `{{NAME}}` 仍会在 Obsidian 内部弹出输入框。
- 如果修改了 Obsidian 中的 QuickAdd choices，需要回到配置页重新点击 `保存并刷新指令`。
- 如果升级了插件代码，也需要在配置页重新保存，让动态指令更新到最新行为。
- 如果 Obsidian 没有被系统注册为 `obsidian://` 协议处理程序，请先打开一次 Obsidian 或重新安装 Obsidian。

## 开发检查

```bash
npm run check
```
