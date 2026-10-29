// Loads static JSON content shipped with the frontend (js/data/*.json). Throws on failure (callers show an error state).
const cache = new Map();
export async function loadData(name) {
  if (cache.has(name)) return cache.get(name);
  const res = await fetch(new URL(`../data/${name}.json`, import.meta.url));
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  const data = await res.json();
  cache.set(name, data);
  return data;
}
