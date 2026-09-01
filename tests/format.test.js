import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMm, formatLitersPerHectare, formatShortDate, stageLabel } from "../js/format.js";

test("formatMm shows one decimal with a unit", () => {
  assert.equal(formatMm(4.567), "4.6 mm");
  assert.equal(formatMm(0), "0.0 mm");
});

test("formatLitersPerHectare groups thousands", () => {
  assert.equal(formatLitersPerHectare(12345), "12,345 L/ha");
});

test("formatShortDate renders weekday and day/month", () => {
  // 2026-06-15 is a Monday
  assert.equal(formatShortDate("2026-06-15"), "lun 15/6");
});

test("stageLabel names each FAO-56 growth stage boundary correctly", () => {
  const stages = { ini: 20, dev: 40, mid: 45, late: 30 };
  assert.equal(stageLabel(1, stages), "Inicial");
  assert.equal(stageLabel(20, stages), "Inicial");
  assert.equal(stageLabel(21, stages), "Desarrollo");
  assert.equal(stageLabel(60, stages), "Desarrollo");
  assert.equal(stageLabel(61, stages), "Mediados de temporada");
  assert.equal(stageLabel(105, stages), "Mediados de temporada");
  assert.equal(stageLabel(106, stages), "Final de temporada");
  assert.equal(stageLabel(135, stages), "Final de temporada");
  assert.equal(stageLabel(136, stages), "Después de cosecha");
});
