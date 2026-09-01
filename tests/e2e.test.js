import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

let server;
let baseUrl;
let browser;
let context;

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const urlPath = req.url.split("?")[0];
      const filePath = path.join(rootDir, urlPath === "/" ? "index.html" : urlPath);
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;

  browser = await chromium.launch();
  context = await browser.newContext();
});

after(async () => {
  await context.close();
  await browser.close();
  server.close();
});

test("calculates a real irrigation schedule from a real weather forecast", async () => {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(baseUrl);

  const cropOptionCount = await page.locator("#crop-select option").count();
  assert.ok(cropOptionCount >= 6, "expected all crops to populate the select");

  await page.click(".preset-btn >> nth=0");
  const locationText = await page.textContent("#location-selected");
  assert.match(locationText, /Culiacán/);

  await page.selectOption("#crop-select", "maiz");
  await page.fill("#planting-date", "2026-06-01");

  await page.click("#submit-btn");
  await page.waitForSelector("#results:not([hidden])", { timeout: 20000 });

  const summaryMm = await page.textContent("#summary-mm");
  assert.match(summaryMm, /^\d+\.\d mm$/, `expected a real mm value, got "${summaryMm}"`);
  assert.notEqual(summaryMm, "0.0 mm", "a week of real forecast data should recommend some irrigation or explicitly show 0.0 only if truly rained out — flag if this is suspiciously always zero");

  const summaryLha = await page.textContent("#summary-lha");
  assert.match(summaryLha, /L\/ha$/);

  const rowCount = await page.locator("#days-tbody tr").count();
  assert.equal(rowCount, 7, "Open-Meteo's default forecast window is 7 days");

  const netReqCells = await page.locator("#days-tbody .net-req").allTextContents();
  for (const cell of netReqCells) {
    const value = parseFloat(cell);
    assert.ok(value >= 0, `net irrigation requirement must never be negative, got "${cell}"`);
  }

  assert.deepEqual(consoleErrors, [], "no console errors while calling the real Open-Meteo API");

  await page.close();
});

test("searching a location hits the real geocoding API and lets you pick a result", async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  await page.fill("#location-input", "Hermosillo");
  await page.waitForSelector("#location-results:not([hidden]) li", { timeout: 10000 });

  const firstResult = page.locator("#location-results li").first();
  const resultText = await firstResult.textContent();
  assert.match(resultText, /Hermosillo/i);

  await firstResult.click();
  const selectedText = await page.textContent("#location-selected");
  assert.match(selectedText, /Hermosillo/i);

  const resultsHidden = await page.isHidden("#location-results");
  assert.equal(resultsHidden, true, "the dropdown should close after picking a result");

  await page.close();
});

test("the submit button stays disabled until crop, date, and location are all set", async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  assert.equal(await page.isDisabled("#submit-btn"), true, "should start disabled with no location chosen");

  await page.click(".preset-btn >> nth=1");
  await page.selectOption("#crop-select", "trigo");

  assert.equal(await page.isDisabled("#submit-btn"), false, "should enable once crop, date (defaulted), and location are set");

  await page.close();
});
