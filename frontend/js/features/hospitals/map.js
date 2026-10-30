import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { getNearbyHospitals } from '../../api/public.js';

let map = null;
let userMarker = null;
let accuracyCircle = null;
let markers = [];
let userLat = null;
let userLng = null;
let inited = false;
let currentRequestId = 0;

function setStatus(iconName, msg, visible = true) {
  const el = byId('mapStatus');
  if (!el) return;
  el.innerHTML = msg ? `${icon(iconName)} ${esc(msg)}` : '';
  el.style.display = visible ? 'block' : 'none';
}

export function initMap() {
  if (inited) {
    map?.invalidateSize();
    if (userLat !== null && userLng !== null) {
      map.setView([userLat, userLng], 14);
    }
    return;
  }
  if (typeof window.L === 'undefined') {
    setStatus('circle-x', 'The map library could not be loaded.');
    return;
  }
  inited = true;
  map = window.L.map('hospitalMap', { zoomControl: true, attributionControl: true });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  if (userLat !== null && userLng !== null) {
    const L = window.L;
    userMarker = L.marker([userLat, userLng], {
      icon: L.divIcon({ className: '', html: '<div class="user-pulse-icon"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      zIndexOffset: 1000,
    }).addTo(map).bindPopup(`<strong>${icon('map-pin')} You are here</strong>`).openPopup();
    map.setView([userLat, userLng], 14);
    accuracyCircle = L.circle([userLat, userLng], {
      radius: 10000,
      color: '#2563b0',
      fillColor: '#bdd9f5',
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: '6,4',
    }).addTo(map);
    fetchHospitals(userLat, userLng);
  } else {
    map.setView([20.5937, 78.9629], 5);
    locateUser();
  }
}

const dist = (a, b, c, d) => {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (c - a) * r;
  const dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export function requestUserLocation(interactive = false) {
  if (!navigator.geolocation) {
    if (interactive) setStatus('circle-x', 'Geolocation is not supported by this browser.');
    return;
  }

  if (interactive) setStatus('loader-circle', 'Requesting your location…');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      window.HC_USER_LOCATION = { lat: userLat, lng: userLng };

      if (map) {
        setStatus('circle-check', 'Location found — loading nearby hospitals…');
        const L = window.L;
        if (userMarker) map.removeLayer(userMarker);
        if (accuracyCircle) map.removeLayer(accuracyCircle);
        userMarker = L.marker([userLat, userLng], {
          icon: L.divIcon({ className: '', html: '<div class="user-pulse-icon"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
          zIndexOffset: 1000,
        }).addTo(map).bindPopup(`<strong>${icon('map-pin')} You are here</strong>`).openPopup();
        map.setView([userLat, userLng], 14);
        accuracyCircle = L.circle([userLat, userLng], {
          radius: 10000,
          color: '#2563b0',
          fillColor: '#bdd9f5',
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '6,4',
        }).addTo(map);
        fetchHospitals(userLat, userLng);
      }
    },
    (err) => {
      console.warn('[geolocation] Request notice:', err.code, err.message);
      if (interactive) {
        if (userLat !== null && userLng !== null) {
          fetchHospitals(userLat, userLng);
          return;
        }
        const msgs = { 1: 'Location permission denied. Please allow access in browser settings.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
        setStatus('circle-x', msgs[err.code] || 'Could not get your location.');
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

export function locateUser() {
  if (!map) {
    initMap();
    return;
  }
  requestUserLocation(true);
}

export async function fetchHospitals(lat, lng) {
  const reqId = ++currentRequestId;
  const radius = 10000;
  setStatus('loader-circle', 'Loading nearby hospitals from server…');
  const listEl = byId('nearbyHospList');
  if (listEl) {
    listEl.innerHTML = `<div class="state-box">${icon('loader-circle')} Loading hospitals near you…</div>`;
  }
  const countEl = byId('hospCount');
  if (countEl) countEl.textContent = '';

  try {
    const data = await getNearbyHospitals(lat, lng, radius);
    if (reqId !== currentRequestId) return; // Prevent stale request from overwriting

    markers.forEach((m) => map.removeLayer(m));
    markers = [];

    const rawList = Array.isArray(data?.hospitals) ? data.hospitals : [];
    const hospitals = rawList
      .map((item) => {
        const hLat = Number(item.lat);
        const hLng = Number(item.lng);
        if (!Number.isFinite(hLat) || !Number.isFinite(hLng) || hLat < -90 || hLat > 90 || hLng < -180 || hLng > 180) {
          return null;
        }
        const itemDist = typeof item.dist === 'number' && Number.isFinite(item.dist)
          ? item.dist
          : dist(lat, lng, hLat, hLng);
        return {
          name: item.name ? String(item.name).trim() : 'Hospital',
          type: item.type ? String(item.type).trim() : 'Hospital',
          lat: hLat,
          lng: hLng,
          phone: item.phone ? String(item.phone).trim() : '',
          address: item.address ? String(item.address).trim() : '',
          website: item.website ? String(item.website).trim() : '',
          dist: Number(itemDist.toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    const L = window.L;
    const dot = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#e53e3e;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    hospitals.forEach((h) => {
      const details = [
        esc(h.type),
        h.phone ? `${icon('phone')} ${esc(h.phone)}` : '',
        h.address ? `<small>${esc(h.address)}</small>` : '',
        `<small>${h.dist.toFixed(1)} km away</small>`,
        `<a href="https://maps.google.com/?q=${h.lat},${h.lng}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`,
      ].filter(Boolean).join('<br>');

      markers.push(
        L.marker([h.lat, h.lng], { icon: dot })
          .addTo(map)
          .bindPopup(`<strong>${icon('hospital')} ${esc(h.name)}</strong><br>${details}`)
      );
    });

    renderList(hospitals);
    if (countEl) countEl.textContent = `(${hospitals.length} found)`;
    setStatus(
      'circle-check',
      hospitals.length
        ? `Showing ${hospitals.length} hospitals within 10 km (${data.source || 'Geoapify / OpenStreetMap data'})`
        : 'No hospitals found within 10 km in the map data.'
    );
  } catch (err) {
    if (reqId !== currentRequestId) return;
    const msg = err?.message || 'Could not load nearby hospitals.';
    setStatus('circle-x', msg);
    if (listEl) {
      listEl.innerHTML = `<div class="state-box" role="alert">${icon('circle-alert')} ${esc(msg)}<br><button type="button" class="btn-retry" data-action="locate-user">${icon('refresh-cw')} Try again</button></div>`;
    }
  }
}

function renderList(hospitals) {
  const box = byId('nearbyHospList');
  if (!box) return;
  if (!hospitals.length) {
    box.innerHTML = '<div class="state-box">No hospitals found nearby in the map data. Call 112 in an emergency.</div>';
    return;
  }
  box.innerHTML = hospitals.map((h) => {
    const subtitle = [
      esc(h.type),
      h.phone ? esc(h.phone) : '',
      h.address ? esc(h.address) : '',
    ].filter(Boolean).join(' · ');

    const distColor = h.dist < 2 ? '#6ec25b' : h.dist < 4 ? '#e6a817' : '#e53e3e';
    return `
    <a class="hospital-item" href="https://maps.google.com/?q=${h.lat},${h.lng}" target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
      <div class="hosp-icon">${icon(h.type === 'Clinic' ? 'store' : 'hospital')}</div>
      <div class="hosp-info">
        <div class="hosp-name">${esc(h.name)}</div>
        <div class="hosp-detail">${subtitle}</div>
      </div>
      <div class="hosp-dist" style="color:${distColor};font-weight:800;">${h.dist.toFixed(1)} km</div>
    </a>`;
  }).join('');
}

export function openGoogleMaps() {
  const url = userLat && userLng ? `https://www.google.com/maps/search/hospitals/@${userLat},${userLng},14z` : 'https://www.google.com/maps/search/hospitals+near+me';
  window.open(url, '_blank', 'noopener,noreferrer');
}
