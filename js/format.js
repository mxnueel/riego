export function formatMm(value) {
  return `${value.toFixed(1)} mm`;
}

export function formatLitersPerHectare(value) {
  return new Intl.NumberFormat("es-MX").format(value) + " L/ha";
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function formatShortDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${WEEKDAYS[d.getDay()]} ${day}/${month}`;
}

export function stageLabel(dayIndex, stages) {
  if (dayIndex <= stages.ini) return "Inicial";
  if (dayIndex <= stages.ini + stages.dev) return "Desarrollo";
  if (dayIndex <= stages.ini + stages.dev + stages.mid) return "Mediados de temporada";
  const total = stages.ini + stages.dev + stages.mid + stages.late;
  if (dayIndex <= total) return "Final de temporada";
  return "Después de cosecha";
}
