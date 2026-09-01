import { CROPS, buildSchedule } from "./fao56.js";
import { searchLocation, fetchForecast } from "./weather.js";
import { formatMm, formatLitersPerHectare, formatShortDate, stageLabel } from "./format.js";

const PRESETS = [
  { name: "Culiacán, Sinaloa", latitude: 24.8021, longitude: -107.3942 },
  { name: "Cd. Obregón, Sonora", latitude: 27.4894, longitude: -109.9303 },
  { name: "Celaya, Guanajuato", latitude: 20.5233, longitude: -100.8151 },
  { name: "Torreón, Coahuila", latitude: 25.5428, longitude: -103.4068 },
];

const cropSelect = document.getElementById("crop-select");
const plantingDateInput = document.getElementById("planting-date");
const locationInput = document.getElementById("location-input");
const locationResults = document.getElementById("location-results");
const locationPresets = document.getElementById("location-presets");
const locationSelected = document.getElementById("location-selected");
const submitBtn = document.getElementById("submit-btn");
const form = document.getElementById("calc-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const daysTbody = document.getElementById("days-tbody");

let selectedLocation = null;

function populateCrops() {
  for (const [key, crop] of Object.entries(CROPS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = crop.label;
    cropSelect.appendChild(opt);
  }
}

function populatePresets() {
  PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.name;
    btn.addEventListener("click", () => selectLocation(preset));
    locationPresets.appendChild(btn);
  });
}

function selectLocation(loc) {
  selectedLocation = loc;
  locationInput.value = loc.name;
  locationResults.hidden = true;
  locationResults.innerHTML = "";
  locationSelected.hidden = false;
  locationSelected.textContent = `${loc.name} — ${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}`;
  updateSubmitState();
}

function updateSubmitState() {
  submitBtn.disabled = !selectedLocation || !cropSelect.value || !plantingDateInput.value;
}

let searchDebounce;
locationInput.addEventListener("input", () => {
  selectedLocation = null;
  locationSelected.hidden = true;
  updateSubmitState();

  clearTimeout(searchDebounce);
  const query = locationInput.value.trim();
  if (query.length < 3) {
    locationResults.hidden = true;
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const results = await searchLocation(query);
      renderLocationResults(results);
    } catch {
      locationResults.hidden = true;
    }
  }, 350);
});

function renderLocationResults(results) {
  locationResults.innerHTML = "";
  if (!results.length) {
    locationResults.hidden = true;
    return;
  }
  results.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.admin1 ? `${r.name}, ${r.admin1}` : r.name;
    li.addEventListener("click", () => selectLocation({ name: li.textContent, latitude: r.latitude, longitude: r.longitude }));
    locationResults.appendChild(li);
  });
  locationResults.hidden = false;
}

cropSelect.addEventListener("change", updateSubmitState);
plantingDateInput.addEventListener("change", updateSubmitState);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedLocation) return;

  resultsEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "Consultando el pronóstico real…";
  submitBtn.disabled = true;

  try {
    const weather = await fetchForecast(selectedLocation.latitude, selectedLocation.longitude);
    const schedule = buildSchedule(cropSelect.value, plantingDateInput.value, weather);
    renderResults(schedule);
    statusEl.hidden = true;
  } catch (err) {
    statusEl.textContent = `No se pudo calcular: ${err.message}`;
    console.error(err);
  } finally {
    updateSubmitState();
  }
});

function renderResults(schedule) {
  document.getElementById("summary-mm").textContent = formatMm(schedule.totalNetRequirement);
  document.getElementById("summary-lha").textContent = formatLitersPerHectare(schedule.litersPerHectare);

  const crop = CROPS[cropSelect.value];
  const firstDay = schedule.days[0];
  document.getElementById("summary-stage").textContent = firstDay
    ? stageLabel(firstDay.dayIndex, crop.stages)
    : "—";

  daysTbody.innerHTML = "";
  for (const day of schedule.days) {
    const tr = document.createElement("tr");
    if (day.pastHarvest) tr.classList.add("past-harvest");
    tr.innerHTML = `
      <td>${formatShortDate(day.date)}</td>
      <td>${stageLabel(day.dayIndex, crop.stages)}</td>
      <td>${day.kc}</td>
      <td>${formatMm(day.et0)}</td>
      <td>${formatMm(day.etc)}</td>
      <td>${formatMm(day.precipitation)}</td>
      <td class="net-req">${formatMm(day.netRequirement)}</td>
    `;
    daysTbody.appendChild(tr);
  }

  resultsEl.hidden = false;
}

function setDefaultPlantingDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  plantingDateInput.value = d.toISOString().slice(0, 10);
}

populateCrops();
populatePresets();
setDefaultPlantingDate();
updateSubmitState();
