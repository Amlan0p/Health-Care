import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';

let map = null; let userMarker = null; let accuracyCircle = null; let markers = [];
let userLat = null; let userLng = null; let inited = false;

function setStatus(iconName, msg, visible = true) {
  const el = byId('mapStatus'); if (!el) return;
  el.innerHTML = msg ? `${icon(iconName)} ${esc(msg)}` : '';
  el.style.display = visible ? 'block' : 'none';
}

export function initMap() {
  if (inited) { map?.invalidateSize(); return; }
  if (typeof window.L === 'undefined') { setStatus('circle-x', 'The map library could not be loaded.'); return; }
  inited = true;
  map = window.L.map('hospitalMap', { zoomControl: true, attributionControl: true });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  map.setView([20.5937, 78.9629], 5);
  locateUser();
}

const dist = (a, b, c, d) => {
  const R = 6371; const r = Math.PI / 180;
  const dLat = (c - a) * r; const dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export function locateUser() {
  if (!map) { initMap(); return; }
  if (!navigator.geolocation) { setStatus('circle-x', 'Geolocation is not supported by this browser.'); return; }
  setStatus('loader-circle', 'Getting your location…');
  navigator.geolocation.getCurrentPosition((pos) => {
    userLat = pos.coords.latitude; userLng = pos.coords.longitude;
    setStatus('circle-check', 'Location found — loading nearby hospitals…');
    const L = window.L;
    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    userMarker = L.marker([userLat, userLng], { icon: L.divIcon({ className: '', html: '<div class="user-pulse-icon"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1000 })
      .addTo(map).bindPopup(`<strong>${icon('map-pin')} You are here</strong>`).openPopup();
    map.setView([userLat, userLng], 14);
    accuracyCircle = L.circle([userLat, userLng], { radius: 5000, color: '#2563b0', fillColor: '#bdd9f5', fillOpacity: 0.12, weight: 1.5, dashArray: '6,4' }).addTo(map);
    fetchHospitals(userLat, userLng);
  }, (err) => {
    const msgs = { 1: 'Location permission denied. Please allow access.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
    setStatus('circle-x', msgs[err.code] || 'Could not get your location.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function fetchHospitals(lat, lng) {
  const radius = 5000;
  const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:${radius},${lat},${lng});way["amenity"="hospital"](around:${radius},${lat},${lng});node["amenity"="clinic"](around:${radius},${lat},${lng});node["healthcare"="hospital"](around:${radius},${lat},${lng}););out center;`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    // Only coordinates are sent to the public Overpass service (documented in the Privacy Notice).
    const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), { signal: ctl.signal });
    if (!res.ok) throw new Error(`Map data service returned ${res.status}`);
    const data = await res.json();
    markers.forEach((m) => map.removeLayer(m)); markers = [];
    const hospitals = (data.elements || []).map((el) => {
      const eLat = el.lat || el.center?.lat; const eLng = el.lon || el.center?.lon;
      if (!eLat || !eLng) return null;
      const tags = el.tags || {};
      return { name: tags.name || tags['name:en'] || 'Hospital', phone: tags.phone || tags['contact:phone'] || '', type: tags.amenity === 'clinic' ? 'Clinic' : 'Hospital', lat: eLat, lng: eLng, dist: dist(lat, lng, eLat, eLng) };
    }).filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 20);
    const L = window.L;
    const dot = L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#e53e3e;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
    hospitals.forEach((h) => {
      markers.push(L.marker([h.lat, h.lng], { icon: dot }).addTo(map).bindPopup(
        `<strong>${icon('hospital')} ${esc(h.name)}</strong><br>${esc(h.type)}${h.phone ? `<br>${icon('phone')} ${esc(h.phone)}` : ''}<br><small>${h.dist.toFixed(1)} km away</small><br><a href="https://maps.google.com/?q=${h.lat},${h.lng}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`));
    });
    renderList(hospitals);
    byId('hospCount').textContent = `(${hospitals.length} found)`;
    setStatus('circle-check', hospitals.length ? `Showing ${hospitals.length} places within 5 km (OpenStreetMap data, may be incomplete)` : 'No hospitals found within 5 km in the map data.');
  } catch (err) {
    setStatus('circle-x', ctl.signal.aborted ? 'The map data service timed out.' : 'Could not load nearby hospitals. Check your connection and try again.');
    byId('nearbyHospList').innerHTML = `<div class="state-box" role="alert">${icon('circle-alert')} Could not load hospitals.<br><button type="button" class="btn-retry" data-action="locate-user">${icon('refresh-cw')} Try again</button></div>`;
  } finally { clearTimeout(timer); }
}

function renderList(hospitals) {
  const box = byId('nearbyHospList');
  if (!hospitals.length) { box.innerHTML = '<div class="state-box">No hospitals found nearby in the map data. Call 112 in an emergency.</div>'; return; }
  box.innerHTML = hospitals.map((h) => `
    <a class="hospital-item" href="https://maps.google.com/?q=${h.lat},${h.lng}" target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
      <div class="hosp-icon">${icon(h.type === 'Clinic' ? 'store' : 'hospital')}</div>
      <div class="hosp-info"><div class="hosp-name">${esc(h.name)}</div><div class="hosp-detail">${esc(h.type)}${h.phone ? ' · ' + esc(h.phone) : ''}</div></div>
      <div class="hosp-dist" style="color:${h.dist < 2 ? '#6ec25b' : h.dist < 4 ? '#e6a817' : '#e53e3e'};font-weight:800;">${h.dist.toFixed(1)} km</div>
    </a>`).join('');
}

export function openGoogleMaps() {
  const url = userLat && userLng ? `https://www.google.com/maps/search/hospitals/@${userLat},${userLng},14z` : 'https://www.google.com/maps/search/hospitals+near+me';
  window.open(url, '_blank', 'noopener,noreferrer');
}
