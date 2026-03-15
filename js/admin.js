// ICML — Admin page logic

(function () {
  'use strict';

  let cafes = [];
  let gh = { owner: '', repo: '', token: '' };
  let adminMap, adminMarker;
  let allMarkers = [];
  let selectedLat = null, selectedLng = null;
  let pendingPhotos = [];
  let existingPhotos = [];
  let isFormMode = false;

  // ===== Init =====
  function init() {
    const saved = sessionStorage.getItem('icml_gh');
    if (saved) {
      gh = JSON.parse(saved);
      document.getElementById('gh-owner').value = gh.owner;
      document.getElementById('gh-repo').value = gh.repo;
      document.getElementById('gh-token').value = gh.token;
      loginSuccess();
    }
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('add-cafe-btn').addEventListener('click', () => openForm());
    document.getElementById('cafe-form').addEventListener('submit', handleSave);
    document.getElementById('cafe-photos').addEventListener('change', handlePhotoSelect);
    document.getElementById('cancel-form-btn').addEventListener('click', closeForm);
    document.getElementById('delete-cafe-btn').addEventListener('click', handleDelete);
  }

  // ===== GitHub Auth =====
  async function handleLogin() {
    gh.owner = document.getElementById('gh-owner').value.trim();
    gh.repo = document.getElementById('gh-repo').value.trim();
    gh.token = document.getElementById('gh-token').value.trim();
    if (!gh.owner || !gh.repo || !gh.token) {
      alert('모든 필드를 입력해주세요.');
      return;
    }
    try {
      const res = await ghApi(`/repos/${gh.owner}/${gh.repo}`);
      if (!res.ok) throw new Error('Repository not found');
      sessionStorage.setItem('icml_gh', JSON.stringify(gh));
      loginSuccess();
    } catch (err) {
      alert('로그인 실패: ' + err.message);
    }
  }

  async function loginSuccess() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('editor-section').classList.remove('hidden');
    await loadCafes();
    renderAdminList();
    initAdminMap();
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
    const container = document.getElementById('admin-map');
    adminMap = L.map(container).setView([37.5665, 126.978], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMap);
    showAllMarkers();

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
      html: '<div style="width:14px;height:14px;background:var(--bh-red,#e05a4a);border:2px solid #1a1a1a;border-radius:50%;"></div>',
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
      selectedLat ? `선택된 좌표: ${selectedLat}, ${selectedLng}` : '선택된 좌표: 없음';
  }

  // ===== Admin list =====
  function renderAdminList() {
    const list = document.getElementById('admin-cafe-list');
    if (!cafes.length) {
      list.innerHTML = '<p style="color:var(--color-text-light);padding:1rem 0;">아직 카페가 없습니다.</p>';
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
            <h4>${cafe.name}${cafe.nameKr ? ` <span style="font-weight:400">${cafe.nameKr}</span>` : ''}</h4>
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
    isFormMode = true;

    if (cafe) {
      document.getElementById('form-title').textContent = '카페 수정';
      document.getElementById('cafe-id').value = cafe.id;
      document.getElementById('cafe-name').value = cafe.name || '';
      document.getElementById('cafe-name-kr').value = cafe.nameKr || '';
      document.getElementById('cafe-address').value = cafe.address || '';
      document.getElementById('cafe-date').value = cafe.visitDate || '';
      document.getElementById('cafe-rating').value = cafe.rating || '';
      document.getElementById('cafe-music-rating').value = cafe.musicRating || '';
      document.getElementById('cafe-tags').value = (cafe.tags || []).join(', ');
      document.getElementById('cafe-description').value = cafe.description || '';
      selectedLat = cafe.lat || null;
      selectedLng = cafe.lng || null;
      existingPhotos = cafe.photos ? [...cafe.photos] : [];
      renderPhotoPreview();
      document.getElementById('delete-cafe-btn').classList.remove('hidden');
      selectCafeOnList(cafe.id);

      // Show selected pin on map
      if (adminMarker) adminMap.removeLayer(adminMarker);
      if (selectedLat) {
        adminMarker = L.marker([selectedLat, selectedLng], { icon: redIcon() }).addTo(adminMap);
      }
    } else {
      document.getElementById('form-title').textContent = '새 카페 추가';
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
  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
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
    const existingHtml = existingPhotos.map(url =>
      `<img src="${url}" alt="photo">`
    ).join('');
    const pendingHtml = pendingPhotos.map(p =>
      `<img src="${p.dataUrl}" alt="new photo">`
    ).join('');
    container.innerHTML = existingHtml + pendingHtml;
  }

  // ===== Save =====
  async function handleSave(e) {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      const id = document.getElementById('cafe-id').value || generateId();
      const isNew = !document.getElementById('cafe-id').value;

      const uploadedPhotos = [];
      for (const p of pendingPhotos) {
        const ext = p.file.name.split('.').pop().toLowerCase();
        const filename = `${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const path = `images/${filename}`;
        const base64 = p.dataUrl.split(',')[1];
        await commitFile(path, base64, `Add photo: ${filename}`, true);
        uploadedPhotos.push(path);
      }

      const cafe = {
        id,
        name: document.getElementById('cafe-name').value.trim(),
        nameKr: document.getElementById('cafe-name-kr').value.trim() || undefined,
        address: document.getElementById('cafe-address').value.trim() || undefined,
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
      alert('저장 완료!');
    } catch (err) {
      alert('저장 실패: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '저장';
    }
  }

  // ===== Delete =====
  async function handleDelete() {
    const id = document.getElementById('cafe-id').value;
    const cafe = cafes.find(c => c.id === id);
    if (!cafe || !confirm(`"${cafe.name}" 카페를 삭제하시겠습니까?`)) return;

    try {
      cafes = cafes.filter(c => c.id !== id);
      await saveCafes(`Delete cafe: ${cafe.name}`);
      closeForm();
      renderAdminList();
      showAllMarkers();
      alert('삭제 완료!');
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  }

  // ===== Utils =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
