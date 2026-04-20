import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const dom = {
  locationLabel: document.querySelector('#locationLabel'),
  lastUpdate: document.querySelector('#lastUpdate'),
  newsList: document.querySelector('#newsList'),
  newsItemTemplate: document.querySelector('#newsItemTemplate'),
  refreshBtn: document.querySelector('#refreshBtn'),
  canvas: document.querySelector('#globeCanvas')
};

const REFRESH_MS = 5 * 60 * 1000;

const state = {
  location: null,
  articles: [],
  mapPoints: []
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010513, 0.07);

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(0, 0, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.5;
controls.maxDistance = 6;
controls.enablePan = false;

scene.add(new THREE.AmbientLight(0x8bb5ff, 1.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(5, 3, 6);
scene.add(keyLight);

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshPhongMaterial({
    color: 0x183a8a,
    emissive: 0x07163f,
    shininess: 14,
    wireframe: false
  })
);
globeGroup.add(globe);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.03, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x4ea0ff, transparent: true, opacity: 0.16 })
);
globeGroup.add(atmosphere);

const meridians = new THREE.Mesh(
  new THREE.SphereGeometry(1.001, 22, 16),
  new THREE.MeshBasicMaterial({ wireframe: true, color: 0x5eaaff, transparent: true, opacity: 0.2 })
);
globeGroup.add(meridians);

const markerGroup = new THREE.Group();
globeGroup.add(markerGroup);

function latLonToVector3(lat, lon, radius = 1.02) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function updateMapMarkers(points) {
  while (markerGroup.children.length) {
    markerGroup.remove(markerGroup.children[0]);
  }

  points.slice(0, 30).forEach((point) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6786 })
    );
    marker.position.copy(latLonToVector3(point.lat, point.lon));
    marker.userData = point;
    markerGroup.add(marker);
  });
}

function renderNews(items, note = '') {
  dom.newsList.innerHTML = '';

  if (note) {
    const warning = document.createElement('li');
    warning.className = 'news-item error-note';
    warning.textContent = note;
    dom.newsList.appendChild(warning);
  }

  items.forEach((article) => {
    const entry = dom.newsItemTemplate.content.firstElementChild.cloneNode(true);
    entry.querySelector('h3').textContent = article.title;
    entry.querySelector('.meta').textContent = `${article.source} • ${new Date(article.date).toLocaleString('it-IT')}`;
    entry.querySelector('.summary').textContent = article.summary;
    const link = entry.querySelector('a');
    link.href = article.url;
    dom.newsList.appendChild(entry);
  });
}

function setLastUpdate() {
  dom.lastUpdate.textContent = new Date().toLocaleTimeString('it-IT');
}

async function detectLocation() {
  const fallback = { country: 'Italy', countryCode: 'it', label: 'Italia (fallback)' };

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000
      });
    });

    const { latitude, longitude } = position.coords;
    const nominatim = new URL('https://nominatim.openstreetmap.org/reverse');
    nominatim.searchParams.set('format', 'jsonv2');
    nominatim.searchParams.set('lat', latitude);
    nominatim.searchParams.set('lon', longitude);

    const locationResponse = await fetch(nominatim, {
      headers: { Accept: 'application/json' }
    });

    if (!locationResponse.ok) throw new Error('Reverse geocoding non disponibile');

    const locationData = await locationResponse.json();
    const country = locationData.address?.country || fallback.country;
    const countryCode = (locationData.address?.country_code || fallback.countryCode).toLowerCase();

    return {
      country,
      countryCode,
      label: `${locationData.address?.city || locationData.address?.town || locationData.address?.state || country}`
    };
  } catch {
    return fallback;
  }
}

function createGdeltQuery() {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const end = now.toISOString().slice(0, 10).replace(/-/g, '');

  return {
    start,
    end
  };
}

async function fetchLocalizedNews(location) {
  const { start, end } = createGdeltQuery();
  const query = `("${location.country}" OR "${location.label}")`; 

  const articleUrl = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  articleUrl.searchParams.set('query', query);
  articleUrl.searchParams.set('mode', 'ArtList');
  articleUrl.searchParams.set('maxrecords', '20');
  articleUrl.searchParams.set('format', 'json');
  articleUrl.searchParams.set('sort', 'datedesc');
  articleUrl.searchParams.set('startdatetime', `${start}000000`);
  articleUrl.searchParams.set('enddatetime', `${end}235959`);

  const geoUrl = new URL('https://api.gdeltproject.org/api/v2/geo/geo');
  geoUrl.searchParams.set('query', query);
  geoUrl.searchParams.set('format', 'json');
  geoUrl.searchParams.set('maxrecords', '30');

  const [articleResponse, geoResponse] = await Promise.all([fetch(articleUrl), fetch(geoUrl)]);

  if (!articleResponse.ok || !geoResponse.ok) {
    throw new Error('Fonte notizie non raggiungibile');
  }

  const articleData = await articleResponse.json();
  const geoData = await geoResponse.json();

  const articles = (articleData.articles || []).slice(0, 12).map((item) => ({
    title: item.title || 'Titolo non disponibile',
    summary: item.seendate
      ? `Evento segnalato il ${new Date(item.seendate).toLocaleString('it-IT')}.`
      : 'Nessun sommario disponibile.',
    source: item.domain || 'Fonte sconosciuta',
    date: item.seendate || Date.now(),
    url: item.url || '#'
  }));

  const mapPoints = (geoData.features || [])
    .map((f) => ({
      lat: Number(f?.properties?.lat),
      lon: Number(f?.properties?.lon),
      title: f?.properties?.name || 'Evento'
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (!articles.length) {
    throw new Error('Nessuna notizia trovata per l’area selezionata');
  }

  return { articles, mapPoints };
}

function fallbackNews(location) {
  const now = Date.now();
  return {
    articles: [
      {
        title: `Aggiornamenti locali in ${location.country}`,
        summary: 'Nessun feed live disponibile ora: riprova tra qualche minuto per ricevere nuovi articoli.',
        source: 'Globe Daily fallback',
        date: now,
        url: 'https://www.gdeltproject.org/'
      }
    ],
    mapPoints: [
      { lat: 41.9028, lon: 12.4964, title: 'Roma' },
      { lat: 45.4642, lon: 9.19, title: 'Milano' },
      { lat: 40.8518, lon: 14.2681, title: 'Napoli' }
    ]
  };
}

async function refreshNews() {
  dom.refreshBtn.disabled = true;

  try {
    if (!state.location) {
      state.location = await detectLocation();
      dom.locationLabel.textContent = state.location.label;
    }

    const { articles, mapPoints } = await fetchLocalizedNews(state.location);
    state.articles = articles;
    state.mapPoints = mapPoints;
    renderNews(articles);
    updateMapMarkers(mapPoints);
  } catch (error) {
    const backup = fallbackNews(state.location || { country: 'Italia' });
    state.articles = backup.articles;
    state.mapPoints = backup.mapPoints;
    renderNews(backup.articles, `Live feed non disponibile: ${error.message}`);
    updateMapMarkers(backup.mapPoints);
  } finally {
    setLastUpdate();
    dom.refreshBtn.disabled = false;
  }
}

function handleResize() {
  const { clientWidth, clientHeight } = dom.canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', handleResize);
dom.refreshBtn.addEventListener('click', refreshNews);

function animate() {
  globeGroup.rotation.y += 0.001;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

handleResize();
animate();
await refreshNews();
setInterval(refreshNews, REFRESH_MS);
