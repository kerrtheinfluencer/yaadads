#!/usr/bin/env node
'use strict';

const fs = require('fs');

const OUT_FILE = 'gas-stations-snapshot.json';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];
const TILES = [
  [17.50,-78.50,17.95,-77.70],
  [17.50,-77.70,17.95,-76.90],
  [17.95,-78.50,18.30,-77.70],
  [17.95,-77.70,18.30,-76.90],
  [18.30,-78.50,18.60,-77.70],
  [18.30,-77.70,18.60,-76.10],
];
const JAMAICA_BOUNDS = { minLat:17.45, maxLat:18.65, minLng:-78.55, maxLng:-76.05 };

function q(tile) {
  return '[out:json][timeout:35];(' +
    'node["amenity"="fuel"](' + tile.join(',') + ');' +
    'way["amenity"="fuel"](' + tile.join(',') + ');' +
    'relation["amenity"="fuel"](' + tile.join(',') + ');' +
  ');out center tags;';
}

async function fetchTile(endpoint, tile) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'data=' + encodeURIComponent(q(tile))
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + endpoint);
  const data = await r.json();
  return Array.isArray(data.elements) ? data.elements : [];
}

async function fetchAll() {
  for (const ep of ENDPOINTS) {
    try {
      const chunks = await Promise.all(TILES.map(t => fetchTile(ep, t)));
      const merged = chunks.flat();
      if (merged.length) return merged;
    } catch (e) {
      console.warn('Endpoint failed:', ep, e.message);
    }
  }
  return [];
}

function normalize(elements) {
  const seen = new Set();
  const stations = [];
  for (const el of elements) {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    if (!lat || !lon) continue;
    if (lat < JAMAICA_BOUNDS.minLat || lat > JAMAICA_BOUNDS.maxLat || lon < JAMAICA_BOUNDS.minLng || lon > JAMAICA_BOUNDS.maxLng) continue;
    const key = lat.toFixed(5) + ',' + lon.toFixed(5);
    if (seen.has(key)) continue;
    seen.add(key);
    const tags = el.tags || {};
    const rawName = tags.name || tags['name:en'] || tags.brand || '';
    if (!rawName) continue;
    stations.push({
      id: 'osm_' + el.id,
      name: rawName,
      brand: tags.brand || tags.operator || '',
      parish: '',
      lat: Number(lat.toFixed(6)),
      lng: Number(lon.toFixed(6))
    });
  }
  return stations;
}

(async function run() {
  const elements = await fetchAll();
  if (!elements.length) {
    console.error('No OSM stations fetched.');
    process.exit(1);
  }
  const stations = normalize(elements);
  const payload = {
    updated_at: new Date().toISOString().slice(0,10),
    source: 'Overpass public OSM snapshot',
    stations
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log('Wrote', stations.length, 'stations to', OUT_FILE);
})();
