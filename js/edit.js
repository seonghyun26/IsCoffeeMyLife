// ICML — Edit/Add cafe page

(function () {
  'use strict';

  let cafes = [];
  let adminMap, adminMarker;
  let selectedLat = null, selectedLng = null;
  let pendingPhotos = [];
  let existingPhotos = [];
  const editId = new URLSearchParams(window.location.search).get('id');

  async function init() {
    cafes = await icmlGh.loadCafes();
    initMap();

    document.getElementById('admin-locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        adminMap.setView([latitude, longitude], 14);
        L.circleMarker([latitude, longitude], {
          radius: 8, color: '#e05a4a', fillColor: '#e05a4a', fillOpacity: 0.9, weight: 2
        }).addTo(adminMap).bindPopup('Current location').openPopup();
      });
    });

    document.getElementById('naver-search-btn').addEventListener('click', parseNaverLink);

    // Use current location button
    document.getElementById('use-current-location').addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(pos => {
        setCoordinates(pos.coords.latitude, pos.coords.longitude);
      }, () => alert('Could not get location.'));
    });

    // Photo upload
    const uploadArea = document.getElementById('photo-upload-area');
    const fileInput = document.getElementById('cafe-photos');
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
    });
    fileInput.addEventListener('change', e => handleFiles([...e.target.files]));

    // Ratings
    initRatingButtons('rating-buttons', 'cafe-rating');
    initRatingButtons('music-rating-buttons', 'cafe-music-rating');
    initRatingButtons('study-rating-buttons', 'cafe-study-rating');

    document.getElementById('cafe-form').addEventListener('submit', handleSave);
    document.getElementById('cafe-date').value = new Date().toISOString().slice(0, 10);

    if (editId) {
      const cafe = cafes.find(c => c.id === editId);
      if (cafe) loadCafeIntoForm(cafe);
    }
  }

  // ===== Map =====
  function initMap() {
    adminMap = L.map('admin-map').setView([37.5665, 126.978], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMap);

    cafes.forEach(cafe => {
      if (!cafe.lat || !cafe.lng) return;
      L.circleMarker([cafe.lat, cafe.lng], {
        radius: 5, color: '#999', fillColor: '#999', fillOpacity: 0.5, weight: 1
      }).addTo(adminMap).bindPopup(cafe.name);
    });

    adminMap.on('click', e => {
      selectedLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      selectedLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      if (adminMarker) adminMap.removeLayer(adminMarker);
      adminMarker = L.marker([selectedLat, selectedLng], { icon: redIcon() }).addTo(adminMap);
      updateCoordsDisplay();
    });
  }

  function redIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#e05a4a;border:2px solid #1a1a1a;border-radius:50%;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function updateCoordsDisplay() {
    document.getElementById('coords-display').textContent =
      selectedLat ? `${selectedLat}, ${selectedLng}` : 'No location selected';
  }

  // ===== Load cafe into form =====
  function loadCafeIntoForm(cafe) {
    document.getElementById('cafe-id').value = cafe.id;
    document.getElementById('cafe-name').value = cafe.name || '';
    document.getElementById('cafe-naver-link').value = cafe.naverLink || '';
    document.getElementById('cafe-date').value = cafe.visitDate || '';
    document.getElementById('cafe-tags').value = (cafe.tags || []).join(', ');
    document.getElementById('cafe-description').value = cafe.description || '';
    selectedLat = cafe.lat || null;
    selectedLng = cafe.lng || null;
    existingPhotos = cafe.photos ? [...cafe.photos] : [];
    renderPhotoPreview();

    if (cafe.rating) setRatingValue('rating-buttons', 'cafe-rating', cafe.rating);
    if (cafe.musicRating) setRatingValue('music-rating-buttons', 'cafe-music-rating', cafe.musicRating);
    if (cafe.studyRating) setRatingValue('study-rating-buttons', 'cafe-study-rating', cafe.studyRating);

    if (selectedLat) {
      adminMarker = L.marker([selectedLat, selectedLng], { icon: redIcon() }).addTo(adminMap);
      adminMap.setView([selectedLat, selectedLng], 15);
    }
    updateCoordsDisplay();
  }

  // ===== Rating buttons =====
  function initRatingButtons(containerId, hiddenId) {
    document.getElementById(containerId).querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById(hiddenId).value = btn.dataset.value;
      });
    });
  }

  function setRatingValue(containerId, hiddenId, value) {
    document.getElementById(hiddenId).value = value;
    document.getElementById(containerId).querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === String(value));
    });
  }

  // ===== Photos =====
  function handleFiles(files) {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        pendingPhotos.push({ file, dataUrl: reader.result });
        renderPhotoPreview();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPhotoPreview() {
    const container = document.getElementById('photo-preview');
    const thumbs = existingPhotos.map((url, i) =>
      `<div class="photo-thumb">
        <img src="${url}" alt="photo">
        <button type="button" class="photo-remove" data-type="existing" data-index="${i}">&times;</button>
      </div>`
    ).concat(pendingPhotos.map((p, i) =>
      `<div class="photo-thumb">
        <img src="${p.dataUrl}" alt="new photo">
        <button type="button" class="photo-remove" data-type="pending" data-index="${i}">&times;</button>
      </div>`
    ));
    container.innerHTML = thumbs.join('');
    container.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const arr = btn.dataset.type === 'existing' ? existingPhotos : pendingPhotos;
        arr.splice(parseInt(btn.dataset.index), 1);
        renderPhotoPreview();
      });
    });
  }

  // ===== Save =====
  async function handleSave(e) {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const id = document.getElementById('cafe-id').value || generateId();
      const isNew = !document.getElementById('cafe-id').value;

      const uploadedPhotos = [];
      const cafeHash = await hashString(id);
      for (const p of pendingPhotos) {
        const ext = p.file.name.split('.').pop().toLowerCase();
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const path = `images/${cafeHash}/${filename}`;
        await icmlGh.commitFile(path, p.dataUrl.split(',')[1], `Add photo: ${cafeHash}/${filename}`, true);
        uploadedPhotos.push(path);
      }

      const cafe = {
        id,
        name: document.getElementById('cafe-name').value.trim(),
        naverLink: document.getElementById('cafe-naver-link').value.trim() || undefined,
        lat: selectedLat,
        lng: selectedLng,
        visitDate: document.getElementById('cafe-date').value,
        rating: parseFloat(document.getElementById('cafe-rating').value) || undefined,
        musicRating: parseFloat(document.getElementById('cafe-music-rating').value) || undefined,
        studyRating: parseFloat(document.getElementById('cafe-study-rating').value) || undefined,
        tags: document.getElementById('cafe-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        description: document.getElementById('cafe-description').value.trim() || undefined,
        photos: [...existingPhotos, ...uploadedPhotos]
      };

      if (isNew) cafes.push(cafe);
      else {
        const idx = cafes.findIndex(c => c.id === id);
        if (idx !== -1) cafes[idx] = cafe;
      }

      await icmlGh.commitFile('data/cafes.json', JSON.stringify(cafes, null, 2) + '\n',
        `${isNew ? 'Add' : 'Update'} cafe: ${cafe.name}`);
      window.location.href = 'admin.html';
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  // ===== Naver Link Parser =====
  function parseNaverLink() {
    const url = document.getElementById('cafe-naver-link').value.trim();
    if (!url) return;

    try {
      const parsed = new URL(url);
      const path = decodeURIComponent(parsed.pathname);
      const searchMatch = path.match(/\/search\/([^/]+)/);
      if (searchMatch) {
        const name = document.getElementById('cafe-name');
        if (!name.value) name.value = searchMatch[1];
      }

      const c = parsed.searchParams.get('c');
      if (c) {
        const [x, y] = c.split(',').map(Number);
        if (x && y) {
          if (Math.abs(x) > 180 || Math.abs(y) > 90) {
            const coords = epsg3857ToWgs84(x, y);
            setCoordinates(coords.lat, coords.lng);
          } else {
            setCoordinates(y, x);
          }
          return;
        }
      }

      const lat = parseFloat(parsed.searchParams.get('lat') || parsed.searchParams.get('y') || '');
      const lng = parseFloat(parsed.searchParams.get('lng') || parsed.searchParams.get('x') || '');
      if (lat && lng) { setCoordinates(lat, lng); return; }

      alert('Could not extract coordinates. Click the map to set location manually.');
    } catch {
      alert('Invalid URL.');
    }
  }

  function epsg3857ToWgs84(x, y) {
    const lng = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return { lat, lng };
  }

  function setCoordinates(lat, lng) {
    selectedLat = Math.round(lat * 1e6) / 1e6;
    selectedLng = Math.round(lng * 1e6) / 1e6;
    if (adminMarker) adminMap.removeLayer(adminMarker);
    adminMarker = L.marker([selectedLat, selectedLng], { icon: redIcon() }).addTo(adminMap);
    adminMap.setView([selectedLat, selectedLng], 15);
    updateCoordsDisplay();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function hashString(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
