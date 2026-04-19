// XSS protection
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== Cart helpers (localStorage) =====
function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}
function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}
function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((s, i) => s + i.quantity, 0);
  document.querySelectorAll('#cart-count').forEach(el => {
    el.textContent = total;
    el.classList.toggle('hidden', total === 0);
  });
}

// ===== Favorites helpers =====
function getFavorites() {
  const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  // Convert to numbers and remove duplicates
  const normalized = [...new Set(favs.map(id => {
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    if (typeof id === 'number') return id;
    return null;
  }).filter(id => id !== null))];
  // Save back normalized
  if (normalized.length !== favs.length || normalized.some((id, i) => id !== favs[i])) {
    localStorage.setItem('favorites', JSON.stringify(normalized));
  }
  return normalized;
}
function updateFavCount() {
  const count = getFavorites().length;
  document.querySelectorAll('#fav-count').forEach(el => {
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  });
}
function toggleFavorite(productId) {
  const id = Number(productId);
  let favs = getFavorites();
  if (favs.includes(id)) {
    favs = favs.filter(item => item !== id);
  } else {
    favs.push(id);
  }
  localStorage.setItem('favorites', JSON.stringify(favs));
  updateFavCount();
  return favs.includes(id);
}

// ===== Format price =====
function formatPrice(price) {
  return price.toLocaleString('ru-RU') + ' ₸';
}

// ===== Render products =====
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return; // Skip if not on main page

  let products;
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error();
    products = await res.json();
  } catch {
    grid.innerHTML = '<p style="text-align:center;padding:2rem;color:#888">Ошибка загрузки товаров</p>';
    return;
  }
  const favs = getFavorites();
  const inStock = products.filter(p => p.in_stock);

  // Update count
  const countEl = document.getElementById('product-count');
  if (countEl) {
    countEl.textContent = inStock.length + ' ' + pluralize(inStock.length, 'товар', 'товара', 'товаров');
  }

  grid.innerHTML = inStock
    .map(product => {
      const isFav = favs.includes(product.id);
      const tagsHtml = product.tags.map(t => {
        let cls = 'tag';
        if (t === 'Новинка') cls += ' tag-new';
        else if (t === 'Скидка') cls += ' tag-sale';
        else if (t === 'Хит') cls += ' tag-hit';
        return `<span class="${cls}">${t}</span>`;
      }).join('');

      const sizesHtml = product.sizes.map(s => `<span class="size-badge">${s}</span>`).join('');

      const imgSrc = product.image || `https://placehold.co/300x400/f0f0f0/999?text=${encodeURIComponent(product.name)}`;
      const stockBadge = (product.stock_quantity != null && product.stock_quantity <= 5)
        ? `<span class="stock-badge">Осталось ${product.stock_quantity} шт.</span>` : '';

      return `
        <div class="product-card" data-id="${product.id}">
          <div class="product-image">
            <img src="${imgSrc}" alt="${esc(product.name)}" loading="lazy">
            ${tagsHtml ? `<div class="product-tags">${tagsHtml}</div>` : ''}
            ${stockBadge}
            <button class="btn-fav ${isFav ? 'active' : ''}" data-id="${product.id}" title="В избранное">
              ${isFav ? '&#9829;' : '&#9825;'}
            </button>
          </div>
          <div class="product-info">
            <h3 class="product-name">${esc(product.name)}</h3>
            ${product.description ? `<p class="product-desc">${esc(product.description)}</p>` : ''}
            <div class="product-sizes">${sizesHtml}</div>
            <div class="product-bottom">
              <span class="product-price">${formatPrice(product.price)}</span>
              <button class="btn btn-cart" data-id="${product.id}" data-name="${esc(product.name)}" data-price="${product.price}" data-sizes='${JSON.stringify(product.sizes)}' data-stock="${product.stock_quantity ?? ''}">
                В корзину
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

  // Event listeners (onclick prevents accumulation on reload)
  grid.onclick = (e) => {
    const favBtn = e.target.closest('.btn-fav');
    if (favBtn) {
      const id = parseInt(favBtn.dataset.id);
      const isNowFav = toggleFavorite(id);
      favBtn.classList.toggle('active', isNowFav);
      favBtn.innerHTML = isNowFav ? '&#9829;' : '&#9825;';
      return;
    }

    const cartBtn = e.target.closest('.btn-cart');
    if (cartBtn) {
      openSizeModal(cartBtn.dataset);
    }
  };
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// ===== Size selection modal =====
let pendingProduct = null;
let selectedSize = null;

function openSizeModal(data) {
  pendingProduct = {
    product_id: parseInt(data.id),
    product_name: data.name,
    price: parseFloat(data.price),
    sizes: JSON.parse(data.sizes),
    stock_quantity: data.stock !== '' ? parseInt(data.stock) : null,
  };
  selectedSize = null;

  const modal = document.getElementById('size-modal');
  const options = document.getElementById('size-options');
  const confirmBtn = document.getElementById('confirm-add');

  options.innerHTML = pendingProduct.sizes.map(s =>
    `<button type="button" class="size-btn" data-size="${s}">${s}</button>`
  ).join('');

  confirmBtn.disabled = true;
  modal.classList.remove('hidden');

  options.onclick = (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn) return;
    options.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSize = btn.dataset.size;
    confirmBtn.disabled = false;
  };
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('size-modal').classList.add('hidden');
});

document.getElementById('confirm-add').addEventListener('click', () => {
  if (!pendingProduct || !selectedSize) return;

  const cart = getCart();
  const existing = cart.find(
    i => i.product_id === pendingProduct.product_id && i.size === selectedSize
  );

  if (existing) {
    if (pendingProduct.stock_quantity !== null && existing.quantity >= pendingProduct.stock_quantity) return;
    existing.quantity++;
    existing.stock_quantity = pendingProduct.stock_quantity;
  } else {
    cart.push({
      product_id: pendingProduct.product_id,
      product_name: pendingProduct.product_name,
      price: pendingProduct.price,
      size: selectedSize,
      quantity: 1,
      stock_quantity: pendingProduct.stock_quantity,
    });
  }

  saveCart(cart);
  document.getElementById('size-modal').classList.add('hidden');
  flyToCart();
});

// Close modal on backdrop click
document.getElementById('size-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// ===== Slider =====
async function initSlider() {
  const track = document.getElementById('slider-track');
  if (!track) return;

  let slidesData = [];
  try {
    const res = await fetch('/api/products/slides');
    if (res.ok) slidesData = await res.json();
  } catch { /* use empty */ }

  if (slidesData.length === 0) return;

  track.innerHTML = slidesData.map(s => `
    <div class="slide">
      <img src="${s.image || ''}" alt="${esc(s.title)}">
      <div class="slide-overlay">
        ${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
        ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
        ${s.btn_text ? `<a href="${esc(s.btn_link || '#products')}" class="btn-slide">${esc(s.btn_text)}</a>` : ''}
      </div>
    </div>
  `).join('');

  const slides = track.querySelectorAll('.slide');
  const dotsContainer = document.getElementById('slider-dots');
  const prevBtn = document.getElementById('slider-prev');
  const nextBtn = document.getElementById('slider-next');
  let current = 0;
  let autoplayTimer;

  dotsContainer.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsContainer.querySelectorAll('.slider-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
    resetAutoplay();
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  function resetAutoplay() {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => goTo(current + 1), 5000);
  }

  resetAutoplay();
}

// ===== Fly-to-cart animation =====
function flyToCart() {
  const cartLink = document.querySelector('.cart-link');
  if (!cartLink) return;

  const cartRect = cartLink.getBoundingClientRect();
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;

  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.cssText = `left:${startX}px;top:${startY}px;`;
  document.body.appendChild(dot);

  const endX = cartRect.left + cartRect.width / 2;
  const endY = cartRect.top + cartRect.height / 2;

  // Force reflow to start animation
  dot.getBoundingClientRect();
  dot.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.2)`;
  dot.style.opacity = '0';

  dot.addEventListener('transitionend', () => {
    dot.remove();
    // Bounce the cart icon
    const countEl = document.getElementById('cart-count');
    if (countEl) {
      countEl.classList.add('cart-bounce');
      countEl.addEventListener('animationend', () => countEl.classList.remove('cart-bounce'), { once: true });
    }
    cartLink.classList.add('cart-bounce');
    cartLink.addEventListener('animationend', () => cartLink.classList.remove('cart-bounce'), { once: true });
  });
}

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

// Init
updateCartCount();
updateFavCount();
loadProducts();
initSlider();
initTheme();
