// XSS protection
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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

// ===== Device ID =====
function getDeviceId() {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}

// ===== Favorites count =====
function updateFavCount() {
  const count = JSON.parse(localStorage.getItem('favorites') || '[]').length;
  document.querySelectorAll('#fav-count').forEach(el => {
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  });
}

// ===== Cart helpers =====
function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}
function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
  renderCart();
}
function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((s, i) => s + i.quantity, 0);
  document.querySelectorAll('#cart-count').forEach(el => {
    el.textContent = total;
    el.classList.toggle('hidden', total === 0);
  });
}

function formatPrice(price) {
  return price.toLocaleString('ru-RU') + ' ₸';
}

// ===== Render cart =====
function renderCart() {
  const cart = getCart();
  const emptyEl = document.getElementById('cart-empty');
  const contentEl = document.getElementById('cart-content');
  const successEl = document.getElementById('order-success');

  if (successEl && !successEl.classList.contains('hidden')) return;

  if (cart.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const itemsEl = document.getElementById('cart-items');
  itemsEl.innerHTML = cart.map((item, index) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <h3>${esc(item.product_name)}</h3>
        <div class="cart-item-meta">
          <span class="cart-item-size">Размер: ${esc(item.size)}</span>
          <span class="cart-item-price">${formatPrice(item.price)}</span>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="quantity-control">
          <button class="qty-btn" data-index="${index}" data-action="minus">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" data-index="${index}" data-action="plus" ${item.stock_quantity != null && item.quantity >= item.stock_quantity ? 'disabled title="Нет больше на складе"' : ''}>+</button>
        </div>
        <span class="cart-item-subtotal">${formatPrice(item.price * item.quantity)}</span>
        <button class="btn-remove" data-index="${index}" title="Удалить">&times;</button>
      </div>
    </div>
  `).join('');

  const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  document.getElementById('items-count').textContent = totalCount;
  document.getElementById('cart-subtotal').textContent = formatPrice(total);
  document.getElementById('cart-total').textContent = formatPrice(total);
  document.getElementById('btn-total').textContent = formatPrice(total);

  // Update submit button text based on payment method
  updateSubmitButton();

  // Event delegation
  itemsEl.onclick = (e) => {
    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) {
      const idx = parseInt(qtyBtn.dataset.index);
      const action = qtyBtn.dataset.action;
      const cart = getCart();
      if (action === 'plus') {
        if (cart[idx].stock_quantity != null && cart[idx].quantity >= cart[idx].stock_quantity) return;
        cart[idx].quantity++;
      } else {
        cart[idx].quantity--;
        if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      }
      saveCart(cart);
      return;
    }

    const removeBtn = e.target.closest('.btn-remove');
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.index);
      const cart = getCart();
      cart.splice(idx, 1);
      saveCart(cart);
    }
  };
}

// ===== Input filters =====
document.getElementById('name').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^a-zA-Zа-яА-ЯёЁәғқңөұүһіӘҒҚҢӨҰҮҺІ\s\-]/g, '');
});

document.getElementById('phone').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^\d\+\(\)\-\s]/g, '');
});

// ===== Payment method switching =====
function updateSubmitButton() {
  const method = document.querySelector('input[name="payment_method"]:checked');
  const submitBtn = document.getElementById('submit-btn');

  if (!method) return;

  if (method.value === 'card') {
    submitBtn.childNodes[0].textContent = 'Перейти к оплате ';
  } else if (method.value === 'sbp') {
    submitBtn.childNodes[0].textContent = 'Оплатить через СБП ';
  } else {
    submitBtn.childNodes[0].textContent = 'Оформить заказ ';
  }
}

// Payment method radio buttons
document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('selected'));
    radio.closest('.payment-option').classList.add('selected');
    updateSubmitButton();
  });
});

// ===== Order form submission =====
document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const cart = getCart();

  if (cart.length === 0) return;

  const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

  const data = {
    customer_name: form.customer_name.value.trim(),
    customer_phone: form.customer_phone.value.trim(),
    customer_address: form.customer_address.value.trim(),
    payment_method: paymentMethod,
    items: cart,
    device_id: getDeviceId(),
  };

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Обработка...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (result.success) {
      if (result.checkout_url) {
        // Card payment — redirect to Stripe Checkout
        // Don't clear cart yet (user might cancel on Stripe page)
        window.location.href = result.checkout_url;
      } else {
        // SBP / Cash — immediate success
        localStorage.removeItem('cart');
        updateCartCount();
        document.getElementById('cart-content').classList.add('hidden');
        document.getElementById('order-success').classList.remove('hidden');
        document.getElementById('order-id').textContent = result.order_id;
        loadMyOrders();
      }
    } else {
      alert(result.error || 'Ошибка при оформлении заказа');
      submitBtn.disabled = false;
      updateSubmitButton();
    }
  } catch {
    alert('Ошибка соединения с сервером');
    submitBtn.disabled = false;
    updateSubmitButton();
  }
});

// ===== Handle Stripe return =====
async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const sessionId = params.get('session_id');

  if (payment === 'success' && sessionId) {
    try {
      const res = await fetch('/api/orders/verify-payment?session_id=' + encodeURIComponent(sessionId));
      const data = await res.json();

      if (data.success) {
        // Payment verified — clear cart and show success
        localStorage.removeItem('cart');
        updateCartCount();
        document.getElementById('cart-empty').classList.add('hidden');
        document.getElementById('cart-content').classList.add('hidden');
        document.getElementById('order-success').classList.remove('hidden');
        document.getElementById('order-id').textContent = data.order_id;
        loadMyOrders();
      } else {
        alert('Оплата не подтверждена. Попробуйте позже или свяжитесь с нами.');
      }
    } catch {
      alert('Ошибка проверки оплаты');
    }
    // Clean URL
    window.history.replaceState({}, '', '/cart.html');
  } else if (payment === 'cancelled') {
    // User cancelled on Stripe — just clean URL, cart is preserved
    window.history.replaceState({}, '', '/cart.html');
  }
}

// ===== My Orders =====
async function loadMyOrders() {
  const section = document.getElementById('my-orders');
  const list = document.getElementById('my-orders-list');
  if (!section || !list) return;

  const deviceId = getDeviceId();
  try {
    const res = await fetch('/api/orders/my?device_id=' + encodeURIComponent(deviceId));
    const data = await res.json();
    if (!data.success || !data.orders || data.orders.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = data.orders.map(order => {
      const date = new Date(order.created_at + 'Z').toLocaleString('ru-RU', {
        timeZone: 'Asia/Almaty',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const canCancel = order.status === 'новый' || order.status === 'ожидает оплаты';
      return `
        <div class="my-order${order.status === 'отменён' ? ' cancelled' : ''}" data-id="${order.id}">
          <div class="my-order-header">
            <div>
              <span class="my-order-num">Заказ #${order.id}</span>
              <span class="my-order-date">${date}</span>
            </div>
            <div class="my-order-right">
              <span class="my-order-status">${order.status}</span>
              <span class="my-order-total">${formatPrice(order.total)}</span>
              <svg class="my-order-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="my-order-body">
            ${order.items.map(i =>
              `<div class="my-order-row">
                <span>${esc(i.product_name)}${i.size ? ' (' + esc(i.size) + ')' : ''}</span>
                <span>${i.quantity} × ${formatPrice(i.price)}</span>
              </div>`
            ).join('')}
            ${order.status === 'ожидает оплаты' ? `<button class="my-order-pay" data-id="${order.id}">Продолжить оплату</button>` : ''}
            ${canCancel ? `<button class="my-order-cancel" data-id="${order.id}">Отменить заказ</button>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch {
    section.classList.add('hidden');
  }
}

// Toggle order details + cancel
document.getElementById('my-orders-list')?.addEventListener('click', async (e) => {
  // Resume payment
  const payBtn = e.target.closest('.my-order-pay');
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.textContent = 'Загрузка...';
    try {
      const r = await fetch(`/api/orders/resume-payment?order_id=${payBtn.dataset.id}&device_id=${encodeURIComponent(getDeviceId())}`);
      const d = await r.json();
      if (d.success && d.checkout_url) {
        window.location.href = d.checkout_url;
        return;
      }
      alert(d.error || 'Ошибка');
    } catch { alert('Ошибка соединения'); }
    payBtn.disabled = false;
    payBtn.textContent = 'Продолжить оплату';
    return;
  }

  // Cancel
  const cancelBtn = e.target.closest('.my-order-cancel');
  if (cancelBtn) {
    if (!await customConfirm('Вы уверены, что хотите отменить заказ?')) return;
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Отмена...';
    try {
      const r = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(cancelBtn.dataset.id), device_id: getDeviceId() })
      });
      const d = await r.json();
      if (d.success) { loadMyOrders(); return; }
      alert(d.error || 'Ошибка');
    } catch { alert('Ошибка соединения'); }
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Отменить заказ';
    return;
  }

  // Toggle
  const order = e.target.closest('.my-order');
  if (!order || e.target.closest('.my-order-body')) return;
  order.classList.toggle('open');
});

// Init
updateCartCount();
updateFavCount();
handleStripeReturn();
renderCart();
loadMyOrders();
