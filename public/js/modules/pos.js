import { db } from '../firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

let products = [];
let cart = [];

export async function initPOS() {
  const ws = document.getElementById('posWorkspace');
  if (!ws) return;

  ws.innerHTML = `
    <div class="pos-search">
      <input type="text" id="productSearch" placeholder="Search product by name or barcode..." />
      <span class="barcode-badge">📷 Scan</span>
    </div>
    <div class="pos-categories" id="categoryFilter">
      <button class="cat-btn active" data-category="all">All</button>
    </div>
    <div class="pos-grid" id="productGrid"><p>Loading products...</p></div>
  `;

  await loadProducts();
  renderCategories();
  renderProducts('all');

  // Search listener
  document.getElementById('productSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = products.filter(p => {
      const name = (p.productName || p.name || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      return name.includes(q) || barcode.includes(q);
    });
    renderProductCards(filtered);
  });

  // Category listeners
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderProducts(e.target.dataset.category);
    });
  });
}

async function loadProducts() {
  try {
    // 1. Fetch products from Firestore
    const snap = await getDocs(collection(db, 'products'));
    const productData = [];
    snap.forEach(doc => productData.push({ id: doc.id, ...doc.data() }));
    console.log('✅ Products loaded:', productData.length);

    // 2. Fetch inventory summary (current stock)
    const invSnap = await getDocs(collection(db, 'inventorySummary'));
    const stockMap = {};
    invSnap.forEach(doc => {
      const data = doc.data();
      // Check if the doc has a productId field, or use the document ID
      const productId = data.productId || doc.id;
      stockMap[productId] = data.quantity || data.stock || 0;
    });
    console.log('✅ Stock data loaded:', Object.keys(stockMap).length);

    // 3. Merge products with stock data
    products = productData.map(p => {
      // Try to match by sku first, then by document ID
      const stock = stockMap[p.sku] || stockMap[p.id] || 0;
      return {
        ...p,
        stock: stock,
        // Ensure we have a 'name' field for display (fallback to productName)
        displayName: p.productName || p.name || 'Unnamed'
      };
    });

    console.log('✅ Final products with stock:', products);

    if (products.length === 0) {
      document.getElementById('productGrid').innerHTML = '<p style="color:#999;">No products found. Add some in Firestore.</p>';
    }

  } catch (err) {
    console.error('Firestore error:', err);
    document.getElementById('productGrid').innerHTML = '<p style="color:red;">⚠️ Error loading products. Check console.</p>';
  }
}

function renderCategories() {
  const container = document.getElementById('categoryFilter');
  const cats = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];
  container.innerHTML = cats.map(cat => 
    `<button class="cat-btn ${cat === 'all' ? 'active' : ''}" data-category="${cat}">
      ${cat.charAt(0).toUpperCase() + cat.slice(1)}
    </button>`
  ).join('');

  container.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderProducts(e.target.dataset.category);
    });
  });
}

function renderProducts(category) {
  const filtered = category === 'all' 
    ? products 
    : products.filter(p => p.category === category);
  renderProductCards(filtered);
}

function renderProductCards(list) {
  const grid = document.getElementById('productGrid');
  if (!list.length) {
    grid.innerHTML = '<p style="color:#999; text-align:center; margin-top:40px;">No products in this category.</p>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const name = p.displayName;
    const price = p.sellingPrice || 0;
    const stock = p.stock || 0;
    const isLow = stock < 5;
    return `
      <div class="product-card" data-id="${p.id}" data-sku="${p.sku || p.id}">
        <div class="product-name">${name}</div>
        <div class="product-price">TZS ${price.toLocaleString()}</div>
        <div class="product-stock ${isLow ? 'low-stock' : ''}">
          Stock: ${stock} ${isLow ? '⚠️ LOW' : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const product = products.find(p => p.id === id);
      if (!product) return;
      
      const existing = cart.find(item => item.id === id);
      if (existing) {
        existing.qty += 1;
      } else {
        cart.push({ 
          id: product.id,
          sku: product.sku || product.id,
          name: product.displayName,
          sellingPrice: product.sellingPrice || 0,
          qty: 1
        });
      }
      updateCartUI();
    });
  });
}

function updateCartUI() {
  const container = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');

  if (!cart.length) {
    container.innerHTML = '<p style="color:#999;">Cart is empty</p>';
    subtotalEl.textContent = '0.00';
    totalEl.textContent = '0.00';
    return;
  }

  let subtotal = 0;
  container.innerHTML = cart.map((item, idx) => {
    const total = (item.sellingPrice || 0) * item.qty;
    subtotal += total;
    return `
      <div class="cart-item">
        <span>${item.name} x ${item.qty}</span>
        <span>TZS ${total.toLocaleString()}</span>
        <button onclick="window.removeFromCart(${idx})" style="background:red;color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;">✕</button>
      </div>
    `;
  }).join('');

  subtotalEl.textContent = subtotal.toFixed(2);
  totalEl.textContent = subtotal.toFixed(2);
}

window.removeFromCart = function(index) {
  cart.splice(index, 1);
  updateCartUI();
};