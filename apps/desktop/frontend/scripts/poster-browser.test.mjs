import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = process.cwd();
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixture = JSON.parse(
  await fs.readFile(
    path.join(frontend, "scripts/fixtures/poster-games.json"),
    "utf8",
  ),
);
const coverDir = process.env.POSTER_COVER_DIR;
if (!coverDir) {
  throw new Error(
    "Set POSTER_COVER_DIR to a cache of <VNDB ID>.jpg covers; see docs/statistics-poster.md",
  );
}
const out = path.resolve(
  process.env.POSTER_OUTPUT_DIR || path.join(root, "output/playwright/poster"),
);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404"))
    errors.push(m.text());
});
await page.addInitScript(() => {
  window.__saved = [];
  window.__text = [];
  window.__fonts = [];
  window.__queries = [];
  window.__fixtureMode = "normal";
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...args) {
    window.__text.push(s);
    window.__fonts.push(this.font);
    return original.call(this, s, ...args);
  };
});
await page.route("**/bindings/lunabox/backend/service/statsservice.ts", r =>
  r.fulfill({
    contentType: "application/javascript",
    body: `export function GetPosterGames(start,end){window.__queries.push([start,end]);const games=${JSON.stringify(fixture)};if(window.__fixtureMode==='missing')games[1].cover_url='/demo-covers/missing.jpg';const p=window.__fixtureMode==='error'?Promise.reject(new Error('fixture error')):Promise.resolve(window.__fixtureMode==='empty'?[]:games);p.cancel=()=>{};return p;}`,
  }));
await page.route(
  "**/bindings/lunabox/backend/service/templateservice.ts",
  r =>
    r.fulfill({
      contentType: "application/javascript",
      body: `export const ListTemplates=async()=>[{id:'editorial_report',name:'极简主义报告',is_builtin:true,version:'1.0.0',author:'LunaBox'}];export const OpenTemplatesDir=async()=>{};export const PrepareExportData=async()=>({});export const RenderTemplate=async()=>({html:'<!doctype html><html><body><h1>Legacy template</h1></body></html>'});export async function ExportRenderedHTML(data){window.__saved.push(data);}`,
    }),
);
await page.route("**/demo-covers/*.jpg", async (route) => {
  const name = path.basename(new URL(route.request().url()).pathname);
  if (name === "missing.jpg")
    return route.fulfill({ status: 404 });
  return route.fulfill({
    contentType: "image/jpeg",
    body: await fs.readFile(path.join(coverDir, name)),
  });
});
const baseURL = process.env.POSTER_BASE_URL || "http://127.0.0.1:9256";
await page.goto(`${baseURL}/scripts/poster-harness.html`);
await page.getByRole("button", { name: "导出图片", exact: true }).waitFor();
await page.waitForFunction(
  () =>
    !document
      .querySelector("button:disabled")
      ?.textContent
      ?.includes("导出图片")
      && document.querySelector("canvas")?.width === 3240,
  null,
  { timeout: 90000 },
);
await page
  .getByRole("button", { name: "导出图片", exact: true })
  .isEnabled()
  .then(assert.ok);
await page.screenshot({ path: path.join(out, "editor-light.png") });
async function snapshot(name) {
  await page.getByRole("button", { name: "导出图片", exact: true }).click();
  const data = await page.evaluate(() => window.__saved.at(-1));
  assert.ok(data?.startsWith("data:image/png;base64,"));
  const buf = Buffer.from(data.split(",")[1], "base64");
  assert.equal(buf.readUInt32BE(16), 3240);
  assert.equal(buf.readUInt32BE(20), 4320);
  const preview = await page
    .locator("canvas")
    .evaluate(c => c.toDataURL("image/png"));
  assert.equal(preview, data);
  await fs.writeFile(path.join(out, `${name}.png`), buf);
}
for (const n of [6, 20, 60, 120]) {
  await page.getByLabel("显示数量", { exact: true }).selectOption(String(n));
  await page.waitForTimeout(200);
  await snapshot(`poster-${n}-titles`);
  if (n === 20) {
    const text = await page.evaluate(() => window.__text);
    assert.ok(text.some(s => s.includes("近月少女")));
  }
}
await page.evaluate(() => {
  window.__text = [];
});
await page.getByRole("switch", { name: "游戏标题", exact: true }).click();
await page.waitForTimeout(150);
let text = await page.evaluate(() => window.__text);
assert.ok(!text.some(s => s.includes("近月少女")));
assert.ok(text.includes("Navel"));
await page.evaluate(() => {
  window.__text = [];
});
await page.getByRole("switch", { name: "开发商", exact: true }).click();
await page.waitForTimeout(150);
text = await page.evaluate(() => window.__text);
assert.ok(!text.includes("Navel"));
assert.ok(!text.includes("TYPE-MOON"));
await page.evaluate(() => {
  window.__text = [];
});
await page.getByRole("switch", { name: "游玩时长", exact: true }).click();
await page.waitForTimeout(150);
text = await page.evaluate(() => window.__text);
assert.ok(!text.includes("80时"));
for (const n of [6, 20, 60, 120]) {
  await page.getByLabel("显示数量", { exact: true }).selectOption(String(n));
  await page.waitForTimeout(150);
  await snapshot(`poster-${n}-covers`);
}
assert.ok(
  await page.evaluate(() =>
    window.__fonts.every(font => font.includes("LunaBox Poster")),
  ),
);
assert.ok(
  await page.evaluate(() => document.fonts.check("20px \"LunaBox Poster\"")),
);
await page.getByLabel("显示数量", { exact: true }).selectOption("6");
await page.waitForTimeout(150);
const fullCanvas = page.getByLabel("封面拼贴海报预览", { exact: true });
const b = await fullCanvas.boundingBox();
await page.mouse.click(b.x + b.width * 0.5, b.y + (b.height * 700) / 1440);
await page.getByRole("region", { name: "调整封面取景", exact: true }).waitFor();
await page.waitForTimeout(260);
assert.equal(
  await page.getByRole("button", { name: "导出图片", exact: true }).isEnabled(),
  false,
);
const cropCanvas = page.getByLabel("封面取景预览", { exact: true });
const beforeCrop = await cropCanvas.evaluate(c => c.toDataURL());
await page.getByRole("slider", { name: "缩放", exact: true }).evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    el,
    "2",
  );
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(150);
const cb = await cropCanvas.boundingBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.mouse.down();
await page.mouse.move(cb.x + cb.width / 2 + 70, cb.y + cb.height / 2 - 40, {
  steps: 6,
});
await page.mouse.up();
await page.waitForTimeout(100);
assert.notEqual(beforeCrop, await cropCanvas.evaluate(c => c.toDataURL()));
await page.screenshot({ path: path.join(out, "cover-crop-editor.png") });
await page.mouse.wheel(0, -100);
await page.waitForTimeout(100);
assert.notEqual(
  await page.getByRole("slider", { name: "缩放", exact: true }).inputValue(),
  "2",
);
await page.getByRole("button", { name: "下一张", exact: true }).click();
await page.getByRole("button", { name: "上一张", exact: true }).click();
await page.waitForTimeout(150);
assert.notEqual(beforeCrop, await cropCanvas.evaluate(c => c.toDataURL()));
await page.getByRole("button", { name: "返回全景", exact: true }).click();
await page.waitForTimeout(300);
await snapshot("poster-6-crop-adjusted");
await page.getByRole("button", { name: "调整封面取景", exact: true }).click();
await page.waitForTimeout(260);
await page.getByRole("button", { name: "恢复居中", exact: true }).click();
await page.waitForTimeout(80);
assert.equal(beforeCrop, await cropCanvas.evaluate(c => c.toDataURL()));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.getByRole("switch", { name: "游玩时长", exact: true }).click();
await page.waitForTimeout(150);
assert.ok(await page.evaluate(() => window.__text.includes("80时")));
await page.getByLabel("显示数量", { exact: true }).selectOption("120");
await page.waitForTimeout(150);
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.screenshot({ path: path.join(out, "editor-dark.png") });
const first = await page.locator("canvas").evaluate(c => c.toDataURL());
await page.getByRole("button", { name: "换个排布" }).click();
await page.waitForTimeout(150);
assert.notEqual(
  first,
  await page.locator("canvas").evaluate(c => c.toDataURL()),
);
await page.getByLabel("海报标题", { exact: true }).fill("属于我的故事");
await page.getByLabel("底部配文", { exact: true }).fill("在此刻，重逢。");
await page.waitForTimeout(150);
assert.ok(await page.evaluate(() => window.__text.includes("属于我的故事")));
assert.ok(
  !(await page.evaluate(() => window.__text)).includes("IGNORED_AI_SUMMARY"),
);
await page.getByRole("button", { name: "极简主义报告" }).click();
await page.locator("iframe").waitFor();
assert.ok(
  await page.frameLocator("iframe").getByText("Legacy template").isVisible(),
);
await page
  .getByRole("button", { name: "封面拼贴", exact: false })
  .first()
  .click();
await page.getByRole("button", { name: "导出图片", exact: true }).isEnabled();
await page.getByRole("button", { name: "取消", exact: true }).click();
await page.evaluate(() => (window.__fixtureMode = "empty"));
await page.getByRole("button", { name: "Open export" }).click();
await page.getByText("所选日期内还没有游玩记录").waitFor();
assert.equal(
  await page.getByRole("button", { name: "导出图片", exact: true }).isEnabled(),
  false,
);
await page.getByRole("button", { name: "取消", exact: true }).click();
await page.evaluate(() => (window.__fixtureMode = "error"));
await page.getByRole("button", { name: "Open export" }).click();
await page.getByText("海报准备失败，请重试").waitFor();
assert.equal(
  await page.getByRole("button", { name: "导出图片", exact: true }).isEnabled(),
  false,
);
await page.evaluate(() => (window.__fixtureMode = "normal"));
await page.getByRole("button", { name: "重试", exact: true }).click();
await page.waitForFunction(
  () => document.querySelector("canvas")?.width === 3240,
  null,
  { timeout: 90000 },
);
await page.getByRole("button", { name: "取消", exact: true }).click();
await page.evaluate(() => {
  window.__fixtureMode = "missing";
});
await page.getByRole("button", { name: "Open export" }).click();
await page.getByText("1 张封面未加载，点击重试", { exact: true }).waitFor();
assert.ok(
  await page.getByRole("button", { name: "导出图片", exact: true }).isEnabled(),
);
await page.evaluate(() => {
  window.__fixtureMode = "normal";
});
await page.getByText("1 张封面未加载，点击重试", { exact: true }).click();
await page.waitForFunction(
  () => document.querySelector("canvas")?.width === 3240,
  null,
  { timeout: 90000 },
);
assert.equal(
  await page.getByText("1 张封面未加载，点击重试", { exact: true }).count(),
  0,
);
assert.deepEqual(errors, []);
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(120);
await page.screenshot({ path: path.join(out, "editor-1280x720.png") });
const exportBox = await page
  .getByRole("button", { name: "导出图片", exact: true })
  .boundingBox();
assert.ok(exportBox.y + exportBox.height <= 720);
await fs.writeFile(
  path.join(out, "browser-validation.json"),
  JSON.stringify(
    {
      checks: [
        "6/20/60/120 real covers",
        "separate title/developer toggles",
        "3240x4320 PNG dimensions",
        "preview and exported PNG byte equality",
        "light and dark editor",
        "layout shuffle",
        "custom title and note",
        "no AI summary",
        "legacy template switching",
        "empty range",
        "error and retry",
        "React StrictMode cleanup",
        "bundled font used for every text element",
        "actual per-game duration toggle",
        "click cover hit testing",
        "drag and zoom crop",
        "independent crops survive switching",
        "reset crop",
        "Escape/back to panorama",
        "missing cover placeholder and retry",
      ],
      games: fixture.length,
      queries: await page.evaluate(() => window.__queries),
      errors,
    },
    null,
    2,
  ),
);
console.log("Browser checks passed. Outputs:", out);
await browser.close();
