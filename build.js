const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, ".dist");
const files = [
  "plugin.json",
  "index.html",
  "preload.js",
  "renderer.js",
  "styles.css",
  "logo.png",
  "package.json",
  "README.md",
  "LICENSE"
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir);

for (const file of files) {
  fs.copyFileSync(path.join(__dirname, file), path.join(distDir, file));
}

console.log("已生成 .dist 发布目录");
