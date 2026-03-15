// ICML — Admin page logic

(function () {
  'use strict';

  let cafes = [];
  const gh = JSON.parse(sessionStorage.getItem('icml_gh') || '{}');
  let adminMap, adminMarker;
  let allMarkers = [];
  let selectedLat = null, selectedLng = null;
  let pendingPhotos = [];
  let existingPhotos = [];
  let isFormMode = false;

  // ===== Init =====
  async function init() {
    await loadCafes();
    renderAdminList();
    initAdminMap();
    showAllMarkers();

    document.getElementById('add-cafe-btn').addEventListener('click', () => openForm());
    document.getElementById('cafe-form').addEventListener('submit', handleSave);
    document.getElementById('cancel-form-btn').addEventListener('click', closeForm);
    document.getElementById('delete-cafe-btn').addEventListener('click', handleDelete);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('icml_gh');
      window.location.href = 'login.html';
    });

    // Locate button
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

    // Photo upload
    const uploadArea = document.getElementById('photo-upload-area');
    const fileInput = document.getElementById('cafe-photos');
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      handleFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });
    fileInput.addEventListener('change', e => handleFiles(Array.from(e.target.files)));

    // Rating buttons
    initRatingButtons('rating-buttons', 'cafe-rating');
    initRatingButtons('music-rating-buttons', 'cafe-music-rating');
  }

  function initRatingButtons(containerId, hiddenId) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById(hiddenId).value = btn.dataset.value;
      });
    });
  }

  function setRatingButton(containerId, value) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === String(value));
    });
  }

  function clearRatingButtons(containerId) {
    document.getElementById(containerId).querySelectorAll('button').forEach(b => b.classList.remove('selected'));
  }

  // ===== GitHub API helpers =====
  function ghApi(path, options = {}) {
    return fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${gh.token}`,
        Accept: 'application/vnd.github.v3+json',
        ...(options.headers || {})
      }
    });
  }

  async function getFileSha(path) {
    const res = await ghApi(`/repos/${gh.owner}/${gh.repo}/contents/${path}`);
    if (res.ok) {
      const data = await res.json();
      return data.sha;
    }
    return null;
  }

  async function commitFile(path, content, message, isBase64 = false) {
    const sha = await getFileSha(path);
    const body = {
      message,
      content: isBase64 ? content : btoa(unescape(encodeURIComponent(content))),
    };
    if (sha) body.sha = sha;
    const res = await ghApi(`/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Failed to commit ${path}`);
    return res.json();
  }

  // ===== Data =====
  async function loadCafes() {
    try {
      const res = await ghApi(`/repos/${gh.owner}/${gh.repo}/contents/data/cafes.json`);
      if (res.ok) {
        const data = await res.json();
        cafes = JSON.parse(atob(data.content));
      }
    } catch {
      cafes = [];
    }
  }

  async function saveCafes(message) {
    const json = JSON.stringify(cafes, null, 2) + '\n';
    await commitFile('data/cafes.json', json, message);
  }

  // ===== Map =====
  function initAdminMap() {
    if (adminMap) return;
    const container = document.getElementById('admin-map');
    adminMap = L.map(container).setView([37.5665, 126.978], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMap);

    adminMap.on('click', e => {
      if (!isFormMode) return;
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

  function showAllMarkers() {
    allMarkers.forEach(m => adminMap.removeLayer(m));
    allMarkers = [];
    cafes.forEach(cafe => {
      if (!cafe.lat || !cafe.lng) return;
      const marker = L.marker([cafe.lat, cafe.lng])
        .addTo(adminMap)
        .bindPopup(`<strong>${cafe.name}</strong>`);
      marker.on('click', () => {
        selectCafeOnList(cafe.id);
        panToMarker(cafe);
      });
      allMarkers.push(marker);
    });
    if (allMarkers.length) {
      adminMap.fitBounds(L.featureGroup(allMarkers).getBounds().pad(0.15));
    }
  }

  function panToMarker(cafe) {
    if (cafe.lat && cafe.lng) {
      adminMap.setView([cafe.lat, cafe.lng], 15);
    }
  }

  function updateCoordsDisplay() {
    document.getElementById('coords-display').textContent =
      selectedLat ? `Selected: ${selectedLat}, ${selectedLng}` : 'Selected coordinates: none';
  }

  // ===== Admin list =====
  function renderAdminList() {
    const list = document.getElementById('admin-cafe-list');
    if (!cafes.length) {
      list.innerHTML = '<p style="color:var(--color-text-light);padding:1rem 0;">No cafes yet.</p>';
      return;
    }
    list.innerHTML = cafes.map(cafe => {
      const thumb = cafe.photos && cafe.photos.length
        ? `<img src="${cafe.photos[0]}" alt="${cafe.name}">`
        : '';
      return `
        <div class="admin-list-item" data-id="${cafe.id}">
          ${thumb}
          <div class="item-info">
            <h4>${cafe.name}</h4>
            <small>${cafe.visitDate || ''} · ${cafe.rating ? cafe.rating + '/5' : ''}</small>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.admin-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const cafe = cafes.find(c => c.id === item.dataset.id);
        if (cafe) {
          openForm(cafe);
          panToMarker(cafe);
        }
      });
    });
  }

  function selectCafeOnList(id) {
    document.querySelectorAll('.admin-list-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });
  }

  // ===== Form =====
  function openForm(cafe = null) {
    const section = document.getElementById('cafe-form-section');
    const form = document.getElementById('cafe-form');
    form.reset();
    pendingPhotos = [];
    existingPhotos = [];
    document.getElementById('photo-preview').innerHTML = '';
    document.getElementById('cafe-rating').value = '';
    document.getElementById('cafe-music-rating').value = '';
    clearRatingButtons('rating-buttons');
    clearRatingButtons('music-rating-buttons');
    isFormMode = true;

    // Default date to today
    document.getElementById('cafe-date').value = new Date().toISOString().slice(0, 10);

    if (cafe) {
      document.getElementById('form-title').textContent = 'Edit Cafe';
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
      document.getElementById('delete-cafe-btn').classList.remove('hidden');
      selectCafeOnList(cafe.id);

      if (cafe.rating) {
        document.getElementById('cafe-rating').value = cafe.rating;
        setRatingButton('rating-buttons', cafe.rating);
      }
      if (cafe.musicRating) {
        document.getElementById('cafe-music-rating').value = cafe.musicRating;
        setRatingButton('music-rating-buttons', cafe.musicRating);
      }

      if (adminMarker) adminMap.removeLayer(adminMarker);
      if (selectedLat) {
        adminMarker = L.marker([selectedLat, selectedLng], { icon: redIcon() }).addTo(adminMap);
      }
    } else {
      document.getElementById('form-title').textContent = 'Add New Cafe';
      document.getElementById('cafe-id').value = '';
      selectedLat = null;
      selectedLng = null;
      document.getElementById('delete-cafe-btn').classList.add('hidden');
      if (adminMarker) { adminMap.removeLayer(adminMarker); adminMarker = null; }
    }

    updateCoordsDisplay();
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth' });
  }

  function closeForm() {
    document.getElementById('cafe-form-section').classList.add('hidden');
    isFormMode = false;
    if (adminMarker) { adminMap.removeLayer(adminMarker); adminMarker = null; }
    document.querySelectorAll('.admin-list-item').forEach(i => i.classList.remove('active'));
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

  function removePhoto(type, index) {
    if (type === 'existing') {
      existingPhotos.splice(index, 1);
    } else {
      pendingPhotos.splice(index, 1);
    }
    renderPhotoPreview();
  }

  function renderPhotoPreview() {
    const container = document.getElementById('photo-preview');
    const existingHtml = existingPhotos.map((url, i) =>
      `<div class="photo-thumb">
        <img src="${url}" alt="photo">
        <button type="button" class="photo-remove" data-type="existing" data-index="${i}">&times;</button>
      </div>`
    ).join('');
    const pendingHtml = pendingPhotos.map((p, i) =>
      `<div class="photo-thumb">
        <img src="${p.dataUrl}" alt="new photo">
        <button type="button" class="photo-remove" data-type="pending" data-index="${i}">&times;</button>
      </div>`
    ).join('');
    container.innerHTML = existingHtml + pendingHtml;

    container.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        removePhoto(btn.dataset.type, parseInt(btn.dataset.index));
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
        const base64 = p.dataUrl.split(',')[1];
        await commitFile(path, base64, `Add photo: ${cafeHash}/${filename}`, true);
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
        tags: document.getElementById('cafe-tags').value
          .split(',').map(t => t.trim()).filter(Boolean),
        description: document.getElementById('cafe-description').value.trim() || undefined,
        photos: [...existingPhotos, ...uploadedPhotos]
      };

      if (isNew) {
        cafes.push(cafe);
      } else {
        const idx = cafes.findIndex(c => c.id === id);
        if (idx !== -1) cafes[idx] = cafe;
      }

      await saveCafes(isNew ? `Add cafe: ${cafe.name}` : `Update cafe: ${cafe.name}`);
      closeForm();
      renderAdminList();
      showAllMarkers();
      alert('Saved!');
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  // ===== Delete =====
  async function handleDelete() {
    const id = document.getElementById('cafe-id').value;
    const cafe = cafes.find(c => c.id === id);
    if (!cafe || !confirm(`Delete "${cafe.name}"?`)) return;

    try {
      cafes = cafes.filter(c => c.id !== id);
      await saveCafes(`Delete cafe: ${cafe.name}`);
      closeForm();
      renderAdminList();
      showAllMarkers();
      alert('Deleted!');
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  // ===== Utils =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function hashString(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
