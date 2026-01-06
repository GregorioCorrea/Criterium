const fs = require("node:fs");
const path = require("node:path");

const srcDir = path.join(__dirname, "..", "src", "ai-prompts");
const outDir = path.join(__dirname, "..", "dist", "ai-prompts");

if (!fs.existsSync(srcDir)) {
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(srcDir)) {
  const from = path.join(srcDir, file);
  const to = path.join(outDir, file);
  fs.copyFileSync(from, to);
}
