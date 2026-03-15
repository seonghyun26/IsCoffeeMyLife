// ICML — Admin list page

(function () {
  'use strict';

  let cafes = [];

  async function init() {
    document.getElementById('logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('icml_gh');
      window.location.href = 'login.html';
    });

    document.getElementById('add-cafe-btn').addEventListener('click', () => {
      window.location.href = 'edit.html';
    });

    cafes = await icmlGh.loadCafes();
    renderList();
  }

  function renderList() {
    const list = document.getElementById('admin-cafe-list');
    if (!cafes.length) {
      list.innerHTML = '<p style="color:var(--color-muted);padding:1rem 0;">No cafes yet.</p>';
      return;
    }
    list.innerHTML = cafes.map(cafe => {
      const thumb = cafe.photos?.length
        ? `<img src="${icmlGh.imageUrl(cafe.photos[0])}" alt="${cafe.name}">`
        : '';
      return `
        <div class="admin-list-item" data-id="${cafe.id}">
          ${thumb}
          <div class="item-info">
            <h4>${cafe.name}</h4>
            <small>${cafe.visitDate || ''} · ${cafe.rating ? cafe.rating + '/5' : ''}</small>
          </div>
          <div class="list-actions">
            <button class="list-action-btn edit" data-id="${cafe.id}" aria-label="Edit">&#9998;</button>
            <button class="list-action-btn delete" data-id="${cafe.id}" aria-label="Delete">&times;</button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.admin-list-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.list-action-btn.delete')) return;
        window.location.href = `edit.html?id=${item.dataset.id}`;
      });
    });

    list.querySelectorAll('.list-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const cafe = cafes.find(c => c.id === btn.dataset.id);
        if (!cafe || !confirm(`Delete "${cafe.name}"?`)) return;
        try {
          cafes = cafes.filter(c => c.id !== cafe.id);
          await icmlGh.commitFile('data/cafes.json', JSON.stringify(cafes, null, 2) + '\n', `Delete cafe: ${cafe.name}`);
          renderList();
        } catch (err) {
          alert('Delete failed: ' + err.message);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
