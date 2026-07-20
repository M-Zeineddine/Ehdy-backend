'use strict';

const { escapeHtml, escapeJsonForScript } = require('../../utils/html');

/**
 * Derives everything the map card and its Leaflet script need
 * from the raw branch rows. `hasMap` is false when no branch
 * has coordinates — callers skip the map entirely then.
 */
function buildMapModel(branches, merchantName) {
  const mapBranches = branches.filter(b => b.latitude && b.longitude);
  const hasMap = mapBranches.length > 0;
  if (!hasMap) return { hasMap };

  const centerLat = mapBranches.reduce((s, b) => s + parseFloat(b.latitude), 0) / mapBranches.length;
  const centerLng = mapBranches.reduce((s, b) => s + parseFloat(b.longitude), 0) / mapBranches.length;
  const searchQuery = mapBranches.length === 1
    ? `${centerLat},${centerLng}`
    : [merchantName, branches[0]?.city].filter(Boolean).join(' ') || `${centerLat},${centerLng}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

  const branchesJson = escapeJsonForScript(JSON.stringify(mapBranches.map(b => ({
    lat: parseFloat(b.latitude),
    lng: parseFloat(b.longitude),
    name: b.name || '',
    address: b.address || '',
    city: b.city || '',
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${parseFloat(b.latitude)},${parseFloat(b.longitude)}`)}`,
  }))));

  return {
    hasMap,
    centerLat,
    centerLng,
    zoom: mapBranches.length === 1 ? 15 : 13,
    googleMapsUrl,
    branchesJson,
  };
}

function renderMapCard(map, merchantName, styleIndex) {
  return `
    <!-- Branches map -->
    <div class="map-card" style="--i:${styleIndex}">
      <div id="branch-map" class="map-canvas" aria-label="Branches map"></div>
      <div class="map-footer">
        <span class="map-merchant-name">${escapeHtml(merchantName)}</span>
        <a href="${map.googleMapsUrl}" class="map-open-btn" target="_blank" rel="noopener">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          Open Map
        </a>
      </div>
    </div>`;
}

function renderMapScripts(map) {
  return `
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      var branches = ${map.branchesJson};
      var googleMapsUrl = ${JSON.stringify(map.googleMapsUrl)};
      function openMaps(url) {
        if (!url) return;
        window.location.href = url;
      }
      function initMap() {
        var leafletMap = L.map('branch-map', {
          zoomControl: false,
          scrollWheelZoom: false
        }).setView([${map.centerLat}, ${map.centerLng}], ${map.zoom});

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(leafletMap);

        var bounds = [];

        branches.forEach(function(branch) {
          var locationLine = [branch.address, branch.city].filter(Boolean).join(', ');
          var popupContent = document.createElement('div');
          var title = document.createElement('strong');
          title.textContent = branch.name;
          popupContent.appendChild(title);

          if (locationLine) {
            popupContent.appendChild(document.createElement('br'));
            popupContent.appendChild(document.createTextNode(locationLine));
          }

          L.marker([branch.lat, branch.lng])
            .addTo(leafletMap)
            .bindPopup(popupContent)
            .on('click', function() {
              openMaps(branch.mapsUrl || googleMapsUrl);
            });

          bounds.push([branch.lat, branch.lng]);
        });

        if (bounds.length > 1) {
          leafletMap.fitBounds(bounds, { padding: [24, 24] });
        }
      }

      // The map lives inside the hidden reveal-content — Leaflet can't
      // measure a display:none container, so wait for the unwrap.
      if (document.body.classList.contains('opened')) {
        initMap();
      } else {
        document.addEventListener('gift:opened', function() {
          setTimeout(initMap, 400);
        }, { once: true });
      }
    })();
  </script>`;
}

module.exports = { buildMapModel, renderMapCard, renderMapScripts };
