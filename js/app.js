// ICML — Public page logic

(function () {
  'use strict';

  let cafes = [];
  let map;
  let markers = [];

  // ===== Init =====
  async function init() {
    await loadCafes();
    initMap();
    renderCafes(cafes);
    populateTagFilter();
    bindControls();
  }

  async function loadCafes() {
    try {
      const res = await fetch('data/cafes.json');
      cafes = await res.json();
    } catch {
      cafes = [];
    }
  }

  // ===== Map =====
  function initMap() {
    map = L.map('map').setView([37.5665, 126.978], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    addMarkers(cafes);
  }

  function addMarkers(list) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    list.forEach(cafe => {
      if (!cafe.lat || !cafe.lng) return;
      const marker = L.marker([cafe.lat, cafe.lng])
        .addTo(map)
        .bindPopup(`<strong>${cafe.name}</strong>`);
      marker.on('click', () => openDetail(cafe));
      markers.push(marker);
    });
    if (markers.length) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }

  // ===== Render cards =====
  function renderCafes(list) {
    const grid = document.getElementById('cafe-grid');
    if (!list.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--color-text-light);grid-column:1/-1;">등록된 카페가 없습니다.</p>';
      return;
    }
    grid.innerHTML = list.map(cafe => {
      const thumb = cafe.photos && cafe.photos.length
        ? `<img src="${cafe.photos[0]}" alt="${cafe.name}" loading="lazy">`
        : '<div class="no-photo">☕</div>';
      const stars = renderStars(cafe.rating);
      const tags = (cafe.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
      return `
        <div class="cafe-card" data-id="${cafe.id}">
          ${thumb}
          <div class="card-body">
            <h3>${cafe.name}</h3>
            <div class="card-meta">
              <span class="stars">${stars}</span> ${cafe.rating || ''} &middot; ${cafe.visitDate || ''}
            </div>
            <div class="tags">${tags}</div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.cafe-card').forEach(card => {
      card.addEventListener('click', () => {
        const cafe = cafes.find(c => c.id === card.dataset.id);
        if (cafe) openDetail(cafe);
      });
    });
  }

  function renderStars(rating) {
    if (!rating) return '';
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
  }

  // ===== Detail modal =====
  function openDetail(cafe) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');

    const gallery = (cafe.photos || []).map(p =>
      `<img src="${p}" alt="${cafe.name}">`
    ).join('');

    const mapLinks = buildMapLinks(cafe);

    body.innerHTML = `
      ${gallery ? `<div class="detail-gallery">${gallery}</div>` : ''}
      <div class="detail-info">
        <h2>${cafe.name}</h2>
        ${cafe.nameKr ? `<p class="kr-name">${cafe.nameKr}</p>` : ''}
        <p><span class="stars">${renderStars(cafe.rating)}</span> ${cafe.rating || '-'} / 5
          ${cafe.musicRating ? ` &middot; 음악 ${renderStars(cafe.musicRating)} ${cafe.musicRating}` : ''}</p>
        <p>📅 ${cafe.visitDate || '-'}</p>
        ${cafe.address ? `<p>📍 ${cafe.address}</p>` : ''}
        ${cafe.description ? `<p>${cafe.description}</p>` : ''}
        <div class="tags">${(cafe.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <div class="detail-links">${mapLinks}</div>
        ${cafe.lat ? '<div id="detail-map"></div>' : ''}
      </div>`;

    modal.classList.remove('hidden');

    if (cafe.lat && cafe.lng) {
      setTimeout(() => {
        const dm = L.map('detail-map').setView([cafe.lat, cafe.lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(dm);
        L.marker([cafe.lat, cafe.lng]).addTo(dm);
      }, 100);
    }
  }

  function buildMapLinks(cafe) {
    if (!cafe.lat || !cafe.lng) return '';
    const naver = `https://map.naver.com/v5/search/${encodeURIComponent(cafe.nameKr || cafe.name)}`;
    const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(cafe.nameKr || cafe.name)},${cafe.lat},${cafe.lng}`;
    const google = `https://www.google.com/maps/search/?api=1&query=${cafe.lat},${cafe.lng}`;
    return `
      <a href="${naver}" target="_blank" rel="noopener">네이버 지도</a>
      <a href="${kakao}" target="_blank" rel="noopener">카카오맵</a>
      <a href="${google}" target="_blank" rel="noopener">Google Maps</a>`;
  }

  // ===== Controls =====
  function populateTagFilter() {
    const select = document.getElementById('tag-filter');
    const allTags = [...new Set(cafes.flatMap(c => c.tags || []))].sort();
    allTags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });
  }

  function bindControls() {
    document.getElementById('search').addEventListener('input', applyFilters);
    document.getElementById('tag-filter').addEventListener('change', applyFilters);
    document.getElementById('sort-by').addEventListener('change', applyFilters);

    // Current location
    document.getElementById('locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) return alert('이 브라우저에서는 위치 서비스를 사용할 수 없습니다.');
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 14);
          L.circleMarker([latitude, longitude], {
            radius: 8, color: '#c45142', fillColor: '#c45142', fillOpacity: 0.9, weight: 2
          }).addTo(map).bindPopup('현재 위치').openPopup();
        },
        () => alert('위치를 가져올 수 없습니다.')
      );
    });

    // Close modal
    document.getElementById('modal').addEventListener('click', e => {
      if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close')) {
        document.getElementById('modal').classList.add('hidden');
      }
    });
  }

  function applyFilters() {
    const query = document.getElementById('search').value.toLowerCase();
    const tag = document.getElementById('tag-filter').value;
    const sort = document.getElementById('sort-by').value;

    let filtered = cafes.filter(c => {
      const matchName = c.name.toLowerCase().includes(query) ||
        (c.nameKr && c.nameKr.includes(query));
      const matchTag = !tag || (c.tags && c.tags.includes(tag));
      return matchName && matchTag;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'date-desc': return (b.visitDate || '').localeCompare(a.visitDate || '');
        case 'date-asc': return (a.visitDate || '').localeCompare(b.visitDate || '');
        case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
        case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
        default: return 0;
      }
    });

    renderCafes(filtered);
    addMarkers(filtered);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
