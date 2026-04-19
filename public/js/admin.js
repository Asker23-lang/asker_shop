// ===== Auth check =====
const ADMIN_TOKEN = localStorage.getItem('admin_token');

if (!ADMIN_TOKEN) {
  window.location.href = '/login.html';
}

// Check token validity
fetch('/api/auth/check', {
  headers: { 'X-Admin-Token': ADMIN_TOKEN }
})
.then(r => r.json())
.then(data => {
  if (!data.authenticated) {
    localStorage.removeItem('admin_token');
    window.location.href = '/login.html';
  }
})
.catch(() => {
  localStorage.removeItem('admin_token');
  window.location.href = '/login.html';
});

// XSS protection
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Helper: fetch with auth token
function adminFetch(url, options = {}) {
  if (options.headers instanceof Headers) {
    options.headers.set('X-Admin-Token', ADMIN_TOKEN);
  } else {
    options.headers = options.headers || {};
    options.headers['X-Admin-Token'] = ADMIN_TOKEN;
  }
  return fetch(url, options);
}

// ===== Logout =====
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await adminFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('admin_token');
    window.location.href = '/login.html';
  });
}

// ===== Custom confirm popup =====
function customConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.add('active');

    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    function cleanup() {
      overlay.classList.remove('active');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onOverlay);
    }
    function onYes() { cleanup(); resolve(true); }
    function onNo() { cleanup(); resolve(false); }
    function onOverlay(e) {
      if (e.target === overlay) { cleanup(); resolve(false); }
    }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    overlay.addEventListener('click', onOverlay);
  });
}

// ===== Tab switching =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

const PAYMENT_LABELS = {
  card: 'Картой',
  sbp: 'СБП',
  cash: 'При получении',
};

// ===== PRODUCTS =====
const productForm = document.getElementById('product-form');
const formWrap = document.getElementById('product-form-wrap');

async function loadProducts() {
  const list = document.getElementById('products-list');
  let products;
  try {
    const res = await adminFetch('/api/admin/products');
    if (!res.ok) throw new Error('Ошибка загрузки');
    products = await res.json();
  } catch {
    list.innerHTML = '<p class="empty-msg">Ошибка загрузки товаров</p>';
    return;
  }
  if (products.length === 0) {
    list.innerHTML = '<p class="empty-msg">Товаров пока нет. Добавьте первый!</p>';
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Фото</th>
          <th>Название</th>
          <th>Цена</th>
          <th>Размеры</th>
          <th>Теги</th>
          <th>Статус</th>
          <th>Остаток</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        ${products.map(p => {
          const imgSrc = p.image || `https://placehold.co/60x60/f0f0f0/999?text=...`;
          return `<tr>
            <td><img src="${imgSrc}" class="admin-thumb" alt=""></td>
            <td>${esc(p.name)}</td>
            <td>${p.price.toLocaleString('ru-RU')} ₸</td>
            <td>${p.sizes.map(s => esc(s)).join(', ')}</td>
            <td>${p.tags.map(t => `<span class="tag tag-sm">${esc(t)}</span>`).join(' ')}</td>
            <td>${p.in_stock ? '<span class="status-ok">В наличии</span>' : '<span class="status-out">Нет</span>'}</td>
            <td>${p.stock_quantity != null ? p.stock_quantity + ' шт.' : '∞'}</td>
            <td class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-edit" data-id="${p.id}">Ред.</button>
              <button class="btn btn-sm btn-danger btn-del" data-id="${p.id}">Удал.</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  // Edit / Delete (use onclick to avoid listener accumulation)
  list.onclick = async (e) => {
    const editBtn = e.target.closest('.btn-edit');
    if (editBtn) {
      const p = products.find(x => x.id === parseInt(editBtn.dataset.id));
      if (p) editProduct(p);
      return;
    }
    const delBtn = e.target.closest('.btn-del');
    if (delBtn) {
      const ok = await customConfirm('Удалить этот товар?');
      if (!ok) return;
      await adminFetch('/api/admin/products/' + delBtn.dataset.id, { method: 'DELETE' });
      loadProducts();
    }
  };
}

function editProduct(p) {
  document.getElementById('form-title').textContent = 'Редактировать товар';
  document.getElementById('product-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-price').value = p.price;
  document.getElementById('p-desc').value = p.description || '';
  document.getElementById('p-in-stock').checked = !!p.in_stock;
  document.getElementById('p-stock-qty').value = p.stock_quantity != null ? p.stock_quantity : '';

  // Sizes
  document.querySelectorAll('#sizes-group input').forEach(cb => {
    cb.checked = p.sizes.includes(cb.value);
  });
  // Tags
  document.querySelectorAll('#tags-group input').forEach(cb => {
    cb.checked = p.tags.includes(cb.value);
  });
  // Image preview
  const preview = document.getElementById('p-image-preview');
  const previewWrap = document.getElementById('image-preview-wrap');
  const placeholder = document.getElementById('image-upload-placeholder');
  if (p.image) {
    preview.src = p.image;
    previewWrap.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    previewWrap.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
  document.getElementById('p-image').value = '';

  formWrap.classList.remove('hidden');
  formWrap.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('add-product-btn').addEventListener('click', () => {
  document.getElementById('form-title').textContent = 'Новый товар';
  productForm.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('p-stock-qty').value = '';
  document.getElementById('image-preview-wrap').classList.add('hidden');
  document.getElementById('image-upload-placeholder').classList.remove('hidden');
  // Default sizes
  document.querySelectorAll('#sizes-group input').forEach(cb => {
    cb.checked = (cb.value === 'M' || cb.value === 'L');
  });
  formWrap.classList.remove('hidden');
  formWrap.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('cancel-form').addEventListener('click', () => {
  formWrap.classList.add('hidden');
});

// Image preview & upload area
function showImagePreview(src) {
  const preview = document.getElementById('p-image-preview');
  const previewWrap = document.getElementById('image-preview-wrap');
  const placeholder = document.getElementById('image-upload-placeholder');
  preview.src = src;
  previewWrap.classList.remove('hidden');
  placeholder.classList.add('hidden');
}

function resetImageUpload() {
  const previewWrap = document.getElementById('image-preview-wrap');
  const placeholder = document.getElementById('image-upload-placeholder');
  const preview = document.getElementById('p-image-preview');
  const fileInput = document.getElementById('p-image');
  preview.src = '';
  previewWrap.classList.add('hidden');
  placeholder.classList.remove('hidden');
  fileInput.value = '';
}

document.getElementById('p-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    showImagePreview(URL.createObjectURL(file));
  }
});

// Remove image button
document.getElementById('remove-image').addEventListener('click', () => {
  resetImageUpload();
});

// Drag and drop
const uploadArea = document.getElementById('image-upload-area');
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const fileInput = document.getElementById('p-image');
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    showImagePreview(URL.createObjectURL(file));
  }
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('product-id').value;

  if (id) {
    const ok = await customConfirm('Сохранить изменения в товаре?');
    if (!ok) return;
  }
  const sizes = Array.from(document.querySelectorAll('#sizes-group input:checked')).map(cb => cb.value);
  const tags = Array.from(document.querySelectorAll('#tags-group input:checked')).map(cb => cb.value);

  const formData = new FormData();
  formData.append('name', document.getElementById('p-name').value);
  formData.append('price', document.getElementById('p-price').value);
  formData.append('description', document.getElementById('p-desc').value);
  formData.append('sizes', JSON.stringify(sizes));
  formData.append('tags', JSON.stringify(tags));
  formData.append('in_stock', document.getElementById('p-in-stock').checked ? '1' : '0');
  formData.append('stock_quantity', document.getElementById('p-stock-qty').value);

  const imageFile = document.getElementById('p-image').files[0];
  if (imageFile) {
    formData.append('image', imageFile);
  }

  const url = id ? '/api/admin/products/' + id : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';

  const res = await adminFetch(url, { method, body: formData });
  const result = await res.json();

  if (result.success) {
    formWrap.classList.add('hidden');
    loadProducts();
  } else {
    alert(result.error || 'Ошибка');
  }
});

// ===== ORDERS =====
async function loadOrders() {
  const list = document.getElementById('orders-list');
  let orders;
  try {
    const res = await adminFetch('/api/admin/orders');
    if (!res.ok) throw new Error('Ошибка загрузки');
    orders = await res.json();
  } catch {
    list.innerHTML = '<p class="empty-msg">Ошибка загрузки заказов</p>';
    return;
  }
  if (orders.length === 0) {
    list.innerHTML = '<p class="empty-msg">Заказов пока нет.</p>';
    return;
  }

  list.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <span class="order-num">Заказ #${order.id}</span>
        <span class="order-date">${new Date(order.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}</span>
        <span class="order-payment">${PAYMENT_LABELS[order.payment_method] || order.payment_method || 'Картой'}</span>
        <select class="status-select" data-id="${order.id}" data-current="${order.status}" ${order.status === 'отменён' || order.status === 'ожидает оплаты' ? 'disabled' : ''}>
          ${order.status === 'ожидает оплаты' ? '<option value="ожидает оплаты" selected>Ожидает оплаты</option>' : ''}
          <option value="новый" ${order.status === 'новый' ? 'selected' : ''}>Новый</option>
          <option value="обработан" ${order.status === 'обработан' ? 'selected' : ''}>Обработан</option>
          <option value="отправлен" ${order.status === 'отправлен' ? 'selected' : ''}>Отправлен</option>
          <option value="отменён" ${order.status === 'отменён' ? 'selected' : ''}>Отменён</option>
        </select>
      </div>
      <div class="order-customer">
        <strong>${esc(order.customer_name)}</strong> &mdash;
        ${esc(order.customer_phone)} &mdash;
        ${esc(order.customer_address)}
      </div>
      <table class="order-items-table">
        <thead><tr><th>Товар</th><th>Размер</th><th>Кол-во</th><th>Цена</th></tr></thead>
        <tbody>
          ${order.items.map(item => `
            <tr>
              <td>${esc(item.product_name)}</td>
              <td>${esc(item.size)}</td>
              <td>${item.quantity}</td>
              <td>${(item.price * item.quantity).toLocaleString('ru-RU')} ₸</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="order-total">Итого: ${order.total.toLocaleString('ru-RU')} ₸</div>
    </div>
  `).join('');

  // Status change
  list.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (sel.value === 'отменён') {
        const confirmed = await customConfirm('Отменить заказ #' + sel.dataset.id + '? Это действие необратимо.');
        if (!confirmed) {
          sel.value = sel.dataset.current;
          return;
        }
      }
      const res = await adminFetch('/api/admin/orders/' + sel.dataset.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      const result = await res.json();
      if (!result.success) {
        sel.value = sel.dataset.current;
        alert(result.error || 'Ошибка');
      } else {
        sel.dataset.current = sel.value;
        if (sel.value === 'отменён') {
          sel.disabled = true;
        }
      }
    });
  });
}

// ===== STATISTICS =====
const STATUS_LABELS = {
  'новый': 'Новый',
  'обработан': 'Обработан',
  'отправлен': 'Отправлен',
  'отменён': 'Отменён',
  'ожидает оплаты': 'Ожидает оплаты',
};

async function loadStats() {
  let data;
  try {
    const res = await adminFetch('/api/admin/stats');
    if (!res.ok) throw new Error('Ошибка загрузки');
    data = await res.json();
  } catch {
    document.getElementById('stats-daily-chart').innerHTML = '<p class="empty-msg">Ошибка загрузки статистики</p>';
    return;
  }

  // Summary cards
  document.getElementById('stat-total-orders').textContent = data.summary.totalOrders;
  document.getElementById('stat-revenue').textContent = data.summary.totalRevenue.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('stat-avg').textContent = data.summary.avgCheck.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('stat-customers').textContent = data.summary.totalCustomers;

  // By status
  document.getElementById('stats-by-status').innerHTML = data.byStatus.map(s => `
    <div class="stat-row">
      <span class="stat-row-label">${STATUS_LABELS[s.status] || s.status}</span>
      <span class="stat-row-value">${s.cnt}</span>
    </div>
  `).join('') || '<p class="empty-msg">Нет данных</p>';

  // By payment
  document.getElementById('stats-by-payment').innerHTML = data.byPayment.map(p => `
    <div class="stat-row">
      <span class="stat-row-label">${PAYMENT_LABELS[p.payment_method] || p.payment_method}</span>
      <span class="stat-row-value">${p.cnt} зак. / ${p.total.toLocaleString('ru-RU')} ₸</span>
    </div>
  `).join('') || '<p class="empty-msg">Нет данных</p>';

  // Sizes
  document.getElementById('stats-sizes').innerHTML = data.topSizes.map(s => `
    <div class="stat-row">
      <span class="stat-row-label">${s.size}</span>
      <span class="stat-row-value">${s.sold} шт.</span>
    </div>
  `).join('') || '<p class="empty-msg">Нет данных</p>';

  // Daily chart (bar chart via CSS)
  const chartEl = document.getElementById('stats-daily-chart');
  if (data.daily.length === 0) {
    chartEl.innerHTML = '<p class="empty-msg">Нет данных за 30 дней</p>';
  } else {
    const maxRev = Math.max(...data.daily.map(d => d.revenue), 1);
    const steps = 4;
    const yLabels = Array.from({ length: steps + 1 }, (_, i) => {
      const val = Math.round((maxRev / steps) * (steps - i));
      return val >= 1000 ? Math.round(val / 1000) + 'k' : val;
    });

    const fmtShort = v => v >= 1000 ? Math.round(v / 1000) + 'k' : v;

    chartEl.innerHTML = `
      <div class="chart-y-axis">${yLabels.map(l => `<span>${l}</span>`).join('')}</div>
      <div class="bar-chart">${data.daily.map((d, i) => {
        const pct = Math.max(Math.round((d.revenue / maxRev) * 100), 3);
        const day = d.day.slice(5);
        return `<div class="bar-col">
          <div class="bar-tooltip">${d.cnt} заказ. &mdash; ${d.revenue.toLocaleString('ru-RU')} ₸</div>
          <span class="bar-value">${fmtShort(d.revenue)} ₸</span>
          <div class="bar-fill" style="--bar-h:${pct}%"></div>
          <span class="bar-label">${day}</span>
        </div>`;
      }).join('')}</div>`;

    // Trigger animation after DOM paint
    setTimeout(() => {
      chartEl.querySelectorAll('.bar-col').forEach((col, i) => {
        setTimeout(() => {
          col.querySelector('.bar-fill').classList.add('grown');
          col.querySelector('.bar-value').classList.add('visible');
        }, i * 60);
      });
    }, 50);
  }

  // Top products
  document.getElementById('stats-top-products').innerHTML = data.topProducts.length > 0 ? `
    <table class="admin-table">
      <thead><tr><th>Товар</th><th>Продано</th><th>Выручка</th></tr></thead>
      <tbody>${data.topProducts.map(p => `
        <tr>
          <td>${esc(p.product_name)}</td>
          <td>${p.sold} шт.</td>
          <td>${p.revenue.toLocaleString('ru-RU')} ₸</td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '<p class="empty-msg">Нет данных</p>';

  // Top customers
  document.getElementById('stats-top-customers').innerHTML = data.topCustomers.length > 0 ? `
    <table class="admin-table">
      <thead><tr><th>Имя</th><th>Телефон</th><th>Адрес</th><th>Заказов</th><th>Сумма</th></tr></thead>
      <tbody>${data.topCustomers.map(c => `
        <tr>
          <td>${esc(c.customer_name)}</td>
          <td>${esc(c.customer_phone)}</td>
          <td>${esc(c.customer_address)}</td>
          <td>${c.orders_count}</td>
          <td>${c.total_spent.toLocaleString('ru-RU')} ₸</td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '<p class="empty-msg">Нет данных</p>';

  // Cancellations
  const c = data.cancellations;
  document.getElementById('stats-cancel-summary').innerHTML = `
    <div class="stat-row">
      <span class="stat-row-label">Отменено заказов</span>
      <span class="stat-row-value">${c.count}</span>
    </div>
    <div class="stat-row">
      <span class="stat-row-label">Сумма отмен</span>
      <span class="stat-row-value">${c.sum.toLocaleString('ru-RU')} ₸</span>
    </div>
  `;

  document.getElementById('stats-cancel-products').innerHTML = c.products.length > 0 ? `
    <h4 class="cancel-sub">Отменённые товары</h4>
    <table class="admin-table">
      <thead><tr><th>Товар</th><th>Кол-во</th><th>Упущено</th></tr></thead>
      <tbody>${c.products.map(p => `
        <tr>
          <td>${esc(p.product_name)}</td>
          <td>${p.qty} шт.</td>
          <td>${p.lost.toLocaleString('ru-RU')} ₸</td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '';
}

// ===== SLIDER =====
const slideForm = document.getElementById('slide-form');
const slideFormWrap = document.getElementById('slide-form-wrap');

async function loadSlides() {
  const list = document.getElementById('slides-list');
  let slides;
  try {
    const res = await adminFetch('/api/admin/slides');
    if (!res.ok) throw new Error();
    slides = await res.json();
  } catch {
    list.innerHTML = '<p class="empty-msg">Ошибка загрузки слайдов</p>';
    return;
  }
  if (slides.length === 0) {
    list.innerHTML = '<p class="empty-msg">Слайдов пока нет. Добавьте первый!</p>';
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Фото</th>
          <th>Заголовок</th>
          <th>Подзаголовок</th>
          <th>Кнопка</th>
          <th>Порядок</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        ${slides.map(s => {
          const imgSrc = s.image || 'https://placehold.co/80x40/f0f0f0/999?text=...';
          return `<tr>
            <td><img src="${imgSrc}" class="admin-thumb" alt="" style="width:80px;height:40px;object-fit:cover;"></td>
            <td>${esc(s.title)}</td>
            <td>${esc(s.subtitle)}</td>
            <td>${esc(s.btn_text)}</td>
            <td>${s.sort_order}</td>
            <td class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-slide-edit" data-id="${s.id}">Ред.</button>
              <button class="btn btn-sm btn-danger btn-slide-del" data-id="${s.id}">Удал.</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  list.onclick = async (e) => {
    const editBtn = e.target.closest('.btn-slide-edit');
    if (editBtn) {
      const s = slides.find(x => x.id === parseInt(editBtn.dataset.id));
      if (s) editSlide(s);
      return;
    }
    const delBtn = e.target.closest('.btn-slide-del');
    if (delBtn) {
      const ok = await customConfirm('Удалить этот слайд?');
      if (!ok) return;
      await adminFetch('/api/admin/slides/' + delBtn.dataset.id, { method: 'DELETE' });
      loadSlides();
    }
  };
}

function editSlide(s) {
  document.getElementById('slide-form-title').textContent = 'Редактировать слайд';
  document.getElementById('slide-id').value = s.id;
  document.getElementById('s-title').value = s.title;
  document.getElementById('s-subtitle').value = s.subtitle;
  document.getElementById('s-btn-text').value = s.btn_text;
  document.getElementById('s-btn-link').value = s.btn_link;
  document.getElementById('s-sort').value = s.sort_order;
  document.getElementById('s-image-url').value = s.image && !s.image.startsWith('/uploads/') ? s.image : '';

  const preview = document.getElementById('s-image-preview');
  const previewWrap = document.getElementById('slide-image-preview-wrap');
  const placeholder = document.getElementById('slide-image-placeholder');
  if (s.image) {
    preview.src = s.image;
    previewWrap.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    previewWrap.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
  document.getElementById('s-image').value = '';

  slideFormWrap.classList.remove('hidden');
  slideFormWrap.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('add-slide-btn').addEventListener('click', () => {
  document.getElementById('slide-form-title').textContent = 'Новый слайд';
  slideForm.reset();
  document.getElementById('slide-id').value = '';
  document.getElementById('s-btn-link').value = '#products';
  document.getElementById('s-sort').value = '0';
  document.getElementById('s-image-url').value = '';
  document.getElementById('slide-image-preview-wrap').classList.add('hidden');
  document.getElementById('slide-image-placeholder').classList.remove('hidden');
  slideFormWrap.classList.remove('hidden');
  slideFormWrap.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('cancel-slide-form').addEventListener('click', () => {
  slideFormWrap.classList.add('hidden');
});

document.getElementById('s-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const preview = document.getElementById('s-image-preview');
    const previewWrap = document.getElementById('slide-image-preview-wrap');
    const placeholder = document.getElementById('slide-image-placeholder');
    preview.src = URL.createObjectURL(file);
    previewWrap.classList.remove('hidden');
    placeholder.classList.add('hidden');
    document.getElementById('s-image-url').value = '';
  }
});

document.getElementById('slide-remove-image').addEventListener('click', () => {
  document.getElementById('s-image-preview').src = '';
  document.getElementById('slide-image-preview-wrap').classList.add('hidden');
  document.getElementById('slide-image-placeholder').classList.remove('hidden');
  document.getElementById('s-image').value = '';
  document.getElementById('s-image-url').value = '';
});

// Drag and drop for slide image
const slideUploadArea = document.getElementById('slide-image-upload-area');
slideUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  slideUploadArea.classList.add('dragover');
});
slideUploadArea.addEventListener('dragleave', () => {
  slideUploadArea.classList.remove('dragover');
});
slideUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  slideUploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const fileInput = document.getElementById('s-image');
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    const preview = document.getElementById('s-image-preview');
    const previewWrap = document.getElementById('slide-image-preview-wrap');
    const placeholder = document.getElementById('slide-image-placeholder');
    preview.src = URL.createObjectURL(file);
    previewWrap.classList.remove('hidden');
    placeholder.classList.add('hidden');
    document.getElementById('s-image-url').value = '';
  }
});

slideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('slide-id').value;
  if (id) {
    const ok = await customConfirm('Сохранить изменения в слайде?');
    if (!ok) return;
  }

  const formData = new FormData();
  formData.append('title', document.getElementById('s-title').value);
  formData.append('subtitle', document.getElementById('s-subtitle').value);
  formData.append('btn_text', document.getElementById('s-btn-text').value);
  formData.append('btn_link', document.getElementById('s-btn-link').value || '#products');
  formData.append('sort_order', document.getElementById('s-sort').value || '0');

  const imageFile = document.getElementById('s-image').files[0];
  const imageUrl = document.getElementById('s-image-url').value.trim();
  if (imageFile) {
    formData.append('image', imageFile);
  } else if (imageUrl) {
    formData.append('image_url', imageUrl);
  }

  const url = id ? '/api/admin/slides/' + id : '/api/admin/slides';
  const method = id ? 'PUT' : 'POST';
  const res = await adminFetch(url, { method, body: formData });
  const result = await res.json();

  if (result.success) {
    slideFormWrap.classList.add('hidden');
    loadSlides();
  } else {
    alert(result.error || 'Ошибка');
  }
});

// Init — load all
loadProducts();
loadOrders();
loadStats();
loadSlides();

// ===== Theme toggle =====
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) {
    console.log('Theme toggle button not found');
    return;
  }

  const savedTheme = localStorage.getItem('theme') || 'light';
  console.log('initTheme called, savedTheme:', savedTheme);
  document.body.classList.toggle('dark-theme', savedTheme === 'dark');

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    console.log('Theme toggled to:', isDark ? 'dark' : 'light');
  });
}

initTheme();
