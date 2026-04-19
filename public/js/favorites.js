// ===== Cart helpers =====
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
function removeFavorite(productId) {
  const id = Number(productId);
  let favs = getFavorites();
  favs = favs.filter(item => item !== id);
  localStorage.setItem('favorites', JSON.stringify(favs));
  updateFavCount();
  return favs;
}

function formatPrice(price) {
  return price.toLocaleString('ru-RU') + ' ₸';
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// ===== Load and render favorites =====
async function loadFavorites() {
  console.log('loadFavorites called at', new Date().toISOString());
  const favs = getFavorites();
  console.log('Favorites from localStorage:', favs, 'types:', favs.map(id => typeof id));
  console.log('Favorites from localStorage:', favs);
  console.log('Favorites from localStorage:', favs);
  const emptyEl = document.getElementById('fav-empty');
  const grid = document.getElementById('fav-products');
  const countEl = document.getElementById('fav-page-count');

  if (favs.length === 0) {
    emptyEl.classList.remove('hidden');
    grid.innerHTML = '';
    countEl.textContent = '';
    return;
  }

  emptyEl.classList.add('hidden');

  const res = await fetch('/api/products');
  const allProducts = await res.json();
  console.log('All products:', allProducts.length);
  const products = allProducts.filter(p => favs.includes(p.id));
  console.log('Filtered favorites:', products.length, 'from favs:', favs);

  if (favs.length > 0 && products.length === 0) {
    alert('Избранное содержит товары, но они не найдены в каталоге. Возможно, id не совпадают. Очищаю избранное.');
    localStorage.removeItem('favorites');
    window.location.reload();
    return;
  }

  if (products.length === 0) {
    emptyEl.classList.remove('hidden');
    grid.innerHTML = '';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = products.length + ' ' + pluralize(products.length, 'товар', 'товара', 'товаров');

  grid.innerHTML = products.map(product => {
    const tagsHtml = product.tags.map(t => {
      let cls = 'tag';
      if (t === 'Новинка') cls += ' tag-new';
      else if (t === 'Скидка') cls += ' tag-sale';
      else if (t === 'Хит') cls += ' tag-hit';
      return `<span class="${cls}">${t}</span>`;
    }).join('');

    const sizesHtml = product.sizes.map(s => `<span class="size-badge">${s}</span>`).join('');
    const imgSrc = product.image || `https://placehold.co/300x400/f0f0f0/999?text=${encodeURIComponent(product.name)}`;

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-image">
          <img src="${imgSrc}" alt="${product.name}" loading="lazy">
          ${tagsHtml ? `<div class="product-tags">${tagsHtml}</div>` : ''}
          <button class="btn-fav active" data-id="${product.id}" title="Убрать из избранного">&#9829;</button>
        </div>
        <div class="product-info">
          <h3 class="product-name">${product.name}</h3>
          ${product.description ? `<p class="product-desc">${product.description}</p>` : ''}
          <div class="product-sizes">${sizesHtml}</div>
          <div class="product-bottom">
            <span class="product-price">${formatPrice(product.price)}</span>
            <button class="btn btn-cart" data-id="${product.id}" data-name="${product.name}" data-price="${product.price}" data-sizes='${JSON.stringify(product.sizes)}'>
              В корзину
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Event listeners
  grid.onclick = (e) => {
    const favBtn = e.target.closest('.btn-fav');
    if (favBtn) {
      const id = parseInt(favBtn.dataset.id);
      removeFavorite(id);
      loadFavorites();
      return;
    }

    const cartBtn = e.target.closest('.btn-cart');
    if (cartBtn) {
      openSizeModal(cartBtn.dataset);
    }
  };
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
    existing.quantity++;
  } else {
    cart.push({
      product_id: pendingProduct.product_id,
      product_name: pendingProduct.product_name,
      price: pendingProduct.price,
      size: selectedSize,
      quantity: 1,
    });
  }

  saveCart(cart);
  document.getElementById('size-modal').classList.add('hidden');

  const card = document.querySelector(`.product-card[data-id="${pendingProduct.product_id}"]`);
  if (card) {
    card.classList.add('added');
    setTimeout(() => card.classList.remove('added'), 500);
  }
});

document.getElementById('size-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// Clear favorites button
document.getElementById('clear-favorites')?.addEventListener('click', () => {
  if (confirm('Очистить всё избранное?')) {
    localStorage.removeItem('favorites');
    updateFavCount();
    loadFavorites();
  }
});

// Debug favorites button
document.getElementById('debug-favorites')?.addEventListener('click', () => {
  const favs = getFavorites();
  console.log('Current favorites:', favs);
  console.log('localStorage favorites raw:', localStorage.getItem('favorites'));
  alert(`Избранное: ${favs.join(', ')}\nПроверьте консоль для деталей.`);
});

// Init
updateCartCount();
updateFavCount();
loadFavorites();
