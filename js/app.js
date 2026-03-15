// hyun — Public page logic

(function () {
  'use strict';

  let cafes = [];
  let featuredIds = new Set();
  let map;
  let markers = [];

  // ===== Init =====
  async function init() {
    await loadCafes();
    pickFeatured();
    initMap();
    renderCafes(getFeatured());
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

  function pickFeatured() {
    const withLocation = cafes.filter(c => c.lat && c.lng);
    const shuffled = [...withLocation].sort(() => Math.random() - 0.5).slice(0, 10);
    featuredIds = new Set(shuffled.map(c => c.id));
  }

  function getFeatured() {
    return cafes.filter(c => featuredIds.has(c.id));
  }

  // ===== Map =====
  function initMap() {
    map = L.map('map').setView([37.5665, 126.978], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>',
      maxZoom: 19
    }).addTo(map);
    addMarkers(getFeatured());
  }

  function cafePin(color) {
    return L.divIcon({
      className: '',
      html: `<svg width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`,
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36]
    });
  }

  function cafeTooltipHtml(cafe) {
    const img = cafe.photos?.length
      ? `<img src="${cafe.photos[0]}" style="width:140px;height:80px;object-fit:cover;display:block;margin-bottom:4px;">`
      : '';
    return `<div style="min-width:140px;">${img}<strong style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.03em;">${cafe.name}</strong></div>`;
  }

  function addMarkers(list) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const dotColors = ['#e05a4a', '#4a8ab5', '#e8b84a'];
    list.forEach(cafe => {
      if (!cafe.lat || !cafe.lng) return;
      const isFeatured = featuredIds.has(cafe.id);
      const marker = isFeatured
        ? L.marker([cafe.lat, cafe.lng], { icon: cafePin('#e05a4a'), zIndexOffset: 100 })
        : L.circleMarker([cafe.lat, cafe.lng], {
            radius: 6, color: '#fff', fillColor: dotColors[markers.length % 3], fillOpacity: 0.8, weight: 2
          });
      marker.addTo(map);
      marker.bindTooltip(cafeTooltipHtml(cafe), { direction: 'top', offset: isFeatured ? [0, -36] : [0, -8], opacity: 1, className: 'cafe-tooltip' });
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
      grid.innerHTML = '<p style="text-align:center;color:var(--color-text-light);grid-column:1/-1;">No cafes yet.</p>';
      return;
    }
    grid.innerHTML = list.map(cafe => {
      const thumb = cafe.photos && cafe.photos.length
        ? `<img src="${cafe.photos[0]}" alt="${cafe.name}" loading="lazy">`
        : '<div class="no-photo">☕</div>';
      const tags = (cafe.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
      return `
        <div class="cafe-card" data-id="${cafe.id}">
          ${thumb}
          <div class="card-body">
            <h3>${cafe.name}</h3>
            <div class="card-meta">${cafe.visitDate || ''}</div>
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
        ${cafe.rating ? `<p>☕ <span class="stars">${renderStars(cafe.rating)}</span> ${cafe.rating}/5</p>` : ''}
        ${cafe.musicRating ? `<p>♫ <span class="stars">${renderStars(cafe.musicRating)}</span> ${cafe.musicRating}/5</p>` : ''}
        ${cafe.studyRating ? `<p>✍ <span class="stars">${renderStars(cafe.studyRating)}</span> ${cafe.studyRating}/5</p>` : ''}
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
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(dm);
        L.marker([cafe.lat, cafe.lng]).addTo(dm);
      }, 100);
    }
  }

  function buildMapLinks(cafe) {
    const hasCoords = cafe.lat && cafe.lng;
    const naverUrl = cafe.naverLink || null;
    const kakaoUrl = cafe.kakaoLink || null;
    const googleUrl = cafe.googleLink || null;

    const naver = naverUrl
      ? `<a href="${naverUrl}" target="_blank" rel="noopener" class="link-naver">Naver</a>`
      : `<span class="link-disabled">Naver</span>`;
    const kakao = kakaoUrl
      ? `<a href="${kakaoUrl}" target="_blank" rel="noopener" class="link-kakao">Kakao</a>`
      : `<span class="link-disabled">Kakao</span>`;
    const google = googleUrl
      ? `<a href="${googleUrl}" target="_blank" rel="noopener" class="link-google">Google</a>`
      : `<span class="link-disabled">Google</span>`;
    return naver + kakao + google;
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
      if (!navigator.geolocation) return alert('Geolocation not supported.');
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 14);
          L.circleMarker([latitude, longitude], {
            radius: 8, color: '#c45142', fillColor: '#c45142', fillOpacity: 0.9, weight: 2
          }).addTo(map).bindPopup('Current location').openPopup();
        },
        () => alert('Could not get location.')
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
    const hasFilters = query || tag || sort !== 'date-desc';

    const source = hasFilters ? cafes : getFeatured();
    let filtered = source.filter(c => {
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
    addMarkers(hasFilters ? filtered : cafes);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
