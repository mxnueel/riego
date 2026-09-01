const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchLocation(query) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "es");
  url.searchParams.set("country", "MX");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding falló: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export async function fetchForecast(latitude, longitude, timezone = "auto") {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set(
    "daily",
    [
      "et0_fao_evapotranspiration",
      "precipitation_sum",
      "relative_humidity_2m_min",
      "wind_speed_10m_mean",
      "temperature_2m_max",
      "temperature_2m_min",
    ].join(",")
  );

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pronóstico falló: ${res.status}`);
  const data = await res.json();

  const d = data.daily;
  return d.time.map((date, i) => ({
    date,
    et0: d.et0_fao_evapotranspiration[i],
    precipitation: d.precipitation_sum[i],
    rhMin: d.relative_humidity_2m_min[i],
    windSpeed10m: d.wind_speed_10m_mean[i],
    tempMax: d.temperature_2m_max[i],
    tempMin: d.temperature_2m_min[i],
  }));
}
