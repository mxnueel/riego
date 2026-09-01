import { test } from "node:test";
import assert from "node:assert/strict";
import { windSpeedAt2m, adjustKc, kcForDay, buildSchedule, CROPS } from "../js/fao56.js";

// Every "expected" value below is copied from a worked example printed in the
// FAO-56 PDF itself (not derived from my own implementation), so these tests
// check the formulas against the textbook, not against themselves.

test("windSpeedAt2m matches the FAO-56 worked example (3.2 m/s at 10m -> 2.4 m/s)", () => {
  assert.equal(Math.round(windSpeedAt2m(3.2, 10) * 10) / 10, 2.4);
});

test("adjustKc matches the FAO-56 Example 27 worked cases for maize Kc mid", () => {
  // Taipei (humid climate): u2=1.3, RHmin=75, h=2 -> Kc mid = 1.07
  assert.equal(Math.round(adjustKc(1.2, 1.3, 75, 2) * 100) / 100, 1.07);
  // Mocha (arid climate): u2=4.6, RHmin=44, h=2 -> Kc mid = 1.30
  assert.equal(Math.round(adjustKc(1.2, 4.6, 44, 2) * 100) / 100, 1.3);
});

test("kcForDay stays flat at Kc ini during the initial stage", () => {
  const stages = { ini: 25, dev: 40, mid: 45, late: 30 };
  assert.equal(kcForDay(1, stages, 0.3, 1.2, 0.6), 0.3);
  assert.equal(kcForDay(25, stages, 0.3, 1.2, 0.6), 0.3);
});

test("kcForDay ramps linearly through the development stage", () => {
  const stages = { ini: 20, dev: 40, mid: 45, late: 30 };
  const midpoint = kcForDay(40, stages, 0.4, 1.2, 0.6); // halfway through dev
  assert.ok(midpoint > 0.4 && midpoint < 1.2, `expected a value between Kc ini and Kc mid, got ${midpoint}`);
  assert.equal(kcForDay(20 + 40, stages, 0.4, 1.2, 0.6), 1.2, "Kc should reach Kc mid exactly at the end of dev");
});

test("kcForDay stays flat at Kc mid throughout the mid-season stage", () => {
  const stages = { ini: 20, dev: 40, mid: 45, late: 30 };
  assert.equal(kcForDay(61, stages, 0.4, 1.2, 0.6), 1.2);
  assert.equal(kcForDay(100, stages, 0.4, 1.2, 0.6), 1.2);
});

test("kcForDay ramps down to Kc end during the late-season stage, then holds", () => {
  const stages = { ini: 20, dev: 40, mid: 45, late: 30 };
  const seasonEnd = 20 + 40 + 45 + 30;
  assert.equal(kcForDay(seasonEnd, stages, 0.4, 1.2, 0.6), 0.6);
  assert.equal(kcForDay(seasonEnd + 10, stages, 0.4, 1.2, 0.6), 0.6, "past harvest, Kc should hold at Kc end");
});

test("every listed crop has physically sane Kc and stage-length values", () => {
  for (const [key, crop] of Object.entries(CROPS)) {
    assert.ok(crop.kcIni > 0 && crop.kcIni < 1.5, `${key} kcIni out of range`);
    assert.ok(crop.kcMid > 0 && crop.kcMid < 1.5, `${key} kcMid out of range`);
    assert.ok(crop.kcEnd > 0 && crop.kcEnd < 1.5, `${key} kcEnd out of range`);
    assert.ok(crop.height > 0 && crop.height < 5, `${key} height out of range`);
    const total = crop.stages.ini + crop.stages.dev + crop.stages.mid + crop.stages.late;
    assert.ok(total > 30 && total < 400, `${key} total season length looks wrong: ${total} days`);
  }
});

test("buildSchedule computes ETc from real-shaped weather and never recommends negative irrigation", () => {
  const dailyWeather = [
    { date: "2026-06-15", et0: 6.05, precipitation: 0, rhMin: 39, windSpeed10m: 1.5 },
    { date: "2026-06-16", et0: 6.01, precipitation: 2.1, rhMin: 51, windSpeed10m: 2.1 },
    { date: "2026-06-17", et0: 5.5, precipitation: 12, rhMin: 60, windSpeed10m: 1.8 },
  ];

  const result = buildSchedule("maiz", "2026-05-01", dailyWeather);

  assert.equal(result.days.length, 3);
  for (const day of result.days) {
    assert.ok(day.netRequirement >= 0, "net irrigation requirement must never be negative");
    assert.ok(day.etc > 0, "ETc must be positive for a growing crop with positive ET0");
  }
  // Day 3 has heavy rain (12mm) exceeding ETc, so net requirement that day must be exactly 0
  assert.equal(result.days[2].netRequirement, 0);
  assert.equal(result.totalNetRequirement, round2(result.days[0].netRequirement + result.days[1].netRequirement));
  assert.equal(result.litersPerHectare, Math.round(result.totalNetRequirement * 10000));
});

test("buildSchedule flags days past the crop's harvest date", () => {
  const farFuture = [{ date: "2027-01-01", et0: 4, precipitation: 0, rhMin: 40, windSpeed10m: 2 }];
  const result = buildSchedule("frijol", "2026-01-01", farFuture); // beans: ~110-day season
  assert.equal(result.days[0].pastHarvest, true);
});

test("buildSchedule rejects an unknown crop", () => {
  assert.throws(() => buildSchedule("aguacate", "2026-01-01", []), /Unknown crop/);
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
