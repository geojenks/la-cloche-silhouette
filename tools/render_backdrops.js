// Renders tools/backdrop-template.html to backdrop-template.png headlessly.
// Usage: node tools/render_backdrops.js [out.png]   (server on :8123, playwright)
const { chromium } = require("playwright");

(async () => {
  const out = process.argv[2] || "backdrop-template.png";
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:8123/tools/backdrop-template.html");
  await page.waitForFunction(() => document.title === "backdrop template ready");
  const data = await page.evaluate(() =>
    document.getElementById("sheet").toDataURL("image/png").split(",")[1]);
  require("fs").writeFileSync(out, Buffer.from(data, "base64"));
  console.log("wrote", out);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
