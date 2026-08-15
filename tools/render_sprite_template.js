// Renders tools/sprite-template.html to sprite-template.png headlessly.
// Usage: node tools/render_sprite_template.js [out.png]
//   Needs a static server on :8123 serving the repo root (any range-capable
//   server, e.g. `npx http-server -p 8123`), and the playwright package.
//   Set CHROMIUM=/path/to/chromium if playwright's own download is missing.
const { chromium } = require("playwright");

(async () => {
  const out = process.argv[2] || "sprite-template.png";
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:8123/tools/sprite-template.html");
  await page.waitForFunction(() => document.title === "sprite template ready");
  const data = await page.evaluate(() =>
    document.getElementById("sheet").toDataURL("image/png").split(",")[1]);
  require("fs").writeFileSync(out, Buffer.from(data, "base64"));
  console.log("wrote", out);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
