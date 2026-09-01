// Crop coefficients (Kc ini/mid/end), max height (h, m), and stage lengths
// (days) straight from FAO Irrigation and Drainage Paper 56, Table 12 and
// Table 11 — cross-checked against the primary PDF, not a paraphrase.
// Stage-length rows were picked for the region closest to Mexican growing
// conditions available in Table 11 (arid/semi-arid where FAO published one).
export const CROPS = {
  maiz: {
    label: "Maíz (grano)",
    kcIni: 0.3,
    kcMid: 1.2,
    kcEnd: 0.6, // Table 12 footnote 11: harvested at high grain moisture
    height: 2,
    stages: { ini: 25, dev: 40, mid: 45, late: 30 }, // Table 11: Dec/Jan, arid climate
  },
  jitomate: {
    label: "Jitomate",
    kcIni: 0.6,
    kcMid: 1.15,
    kcEnd: 0.8, // Table 12 range is 0.70-0.90; 0.80 used as the representative value
    height: 0.6,
    stages: { ini: 30, dev: 40, mid: 40, late: 25 }, // Table 11: January, arid region
  },
  chile: {
    label: "Chile (pimiento)",
    kcIni: 0.6,
    kcMid: 1.05,
    kcEnd: 0.9,
    height: 0.7,
    stages: { ini: 30, dev: 40, mid: 110, late: 30 }, // Table 11: October, arid region
  },
  frijol: {
    label: "Frijol (seco)",
    kcIni: 0.4,
    kcMid: 1.15,
    kcEnd: 0.35,
    height: 0.4,
    stages: { ini: 20, dev: 30, mid: 40, late: 20 }, // Table 11: June, continental climate
  },
  trigo: {
    label: "Trigo",
    kcIni: 0.7, // Table 12: winter wheat, non-frozen soils (fits Mexican winter-wheat regions)
    kcMid: 1.15,
    kcEnd: 0.3, // Table 12 range is 0.25-0.41
    height: 1,
    stages: { ini: 30, dev: 140, mid: 40, late: 30 }, // Table 11: November, Mediterranean
  },
  alfalfa: {
    label: "Alfalfa (por corte)",
    // Table 12 "individual cutting periods" row (footnote 14) — paired with
    // the matching per-cutting-cycle stage lengths below, not the
    // whole-season-averaged Kc row, which assumes a different model.
    kcIni: 0.4,
    kcMid: 1.2,
    kcEnd: 1.15,
    height: 0.7,
    stages: { ini: 10, dev: 30, mid: 25, late: 10 }, // Table 11: 1st cutting cycle, Idaho
  },
};

/**
 * FAO-56 Equation 47: converts wind speed measured at height z (m) to the
 * standard 2 m reference height used by the crop-coefficient equations.
 * Verified against the FAO-56 worked example: uz=3.2 m/s at z=10m -> u2=2.4 m/s.
 */
export function windSpeedAt2m(uz, z = 10) {
  const factor = 4.87 / Math.log(67.8 * z - 5.42);
  return uz * factor;
}

/**
 * FAO-56 Equations 62 (Kc mid) and 65 (Kc end): adjusts the Table 12 value
 * for climates where RHmin or u2 differ from the subhumid reference
 * conditions (RHmin ~= 45%, u2 ~= 2 m/s) the table was built for.
 * Verified against the FAO-56 worked example (maize, Taipei/Mocha):
 * Taipei (u2=1.3, RHmin=75, h=2) -> 1.07; Mocha (u2=4.6, RHmin=44, h=2) -> 1.30.
 */
export function adjustKc(kcTable, u2, rhMin, height) {
  const correction = 0.04 * (u2 - 2) - 0.004 * (rhMin - 45);
  return kcTable + correction * Math.pow(height / 3, 0.3);
}

/**
 * Standard FAO-56 dual-linear crop coefficient curve: flat at Kc ini during
 * the initial stage, linear ramp to Kc mid over the development stage, flat
 * at Kc mid during mid-season, linear ramp to Kc end over the late stage.
 * `day` is 1-indexed days since planting. kcMid/kcEnd passed in should
 * already be the climate-adjusted values for that point in the season.
 */
export function kcForDay(day, stages, kcIni, kcMid, kcEnd) {
  const { ini, dev, mid } = stages;
  if (day <= ini) return kcIni;
  if (day <= ini + dev) {
    const t = (day - ini) / dev;
    return kcIni + t * (kcMid - kcIni);
  }
  const midEnd = ini + dev + mid;
  if (day <= midEnd) return kcMid;
  const lateEnd = midEnd + stages.late;
  if (day <= lateEnd) {
    const t = (day - midEnd) / stages.late;
    return kcMid + t * (kcEnd - kcMid);
  }
  return kcEnd;
}

export function daysSince(plantingDate, onDate) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const planted = new Date(plantingDate + "T00:00:00");
  const target = new Date(onDate + "T00:00:00");
  return Math.round((target - planted) / MS_PER_DAY) + 1;
}

const totalSeasonDays = (stages) => stages.ini + stages.dev + stages.mid + stages.late;

/**
 * Builds the day-by-day irrigation schedule for the forecast window.
 * dailyWeather: array of { date, et0, precipitation, rhMin, windSpeed10m }
 * (windSpeed10m in m/s). Net irrigation requirement per day is a
 * deliberately simple ETc-minus-rainfall balance (no runoff/effective-
 * rainfall model), noted as a conservative simplification, not FAO's more
 * elaborate effective-rainfall procedure from a different publication.
 */
export function buildSchedule(cropKey, plantingDate, dailyWeather) {
  const crop = CROPS[cropKey];
  if (!crop) throw new Error(`Unknown crop: ${cropKey}`);

  const seasonLength = totalSeasonDays(crop.stages);

  const days = dailyWeather.map((w) => {
    const dayIndex = daysSince(plantingDate, w.date);
    const u2 = windSpeedAt2m(w.windSpeed10m);
    const kcMidAdj = adjustKc(crop.kcMid, u2, w.rhMin, crop.height);
    const kcEndAdj = adjustKc(crop.kcEnd, u2, w.rhMin, crop.height);
    const kc = kcForDay(dayIndex, crop.stages, crop.kcIni, kcMidAdj, kcEndAdj);
    const etc = w.et0 * kc;
    const netRequirement = Math.max(etc - w.precipitation, 0);

    return {
      date: w.date,
      dayIndex,
      kc: round2(kc),
      et0: round2(w.et0),
      etc: round2(etc),
      precipitation: round2(w.precipitation),
      netRequirement: round2(netRequirement),
      pastHarvest: dayIndex > seasonLength,
    };
  });

  const totalEtc = round2(days.reduce((s, d) => s + d.etc, 0));
  const totalPrecipitation = round2(days.reduce((s, d) => s + d.precipitation, 0));
  const totalNetRequirement = round2(days.reduce((s, d) => s + d.netRequirement, 0));

  return {
    crop: crop.label,
    seasonLength,
    days,
    totalEtc,
    totalPrecipitation,
    totalNetRequirement,
    litersPerHectare: Math.round(totalNetRequirement * 10000),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
