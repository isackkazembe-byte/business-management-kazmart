// ============================================================
// KAZMART POS – Full App with Cash Management & Customer Fixes
// ============================================================

console.log('🚀 App.js starting...');

import { db } from './firebase.js';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  increment,
  writeBatch,
  setDoc,
  serverTimestamp,
  orderBy,
  limit,
  runTransaction,
  deleteDoc   // 👈 ADD THIS
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

// ─── Expose Firestore for console debugging (temporary) ───
window.db = db;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.setDoc = setDoc;
window.updateDoc = updateDoc;
window.deleteDoc = deleteDoc;
window.collection = collection;
window.doc = doc;
window.writeBatch = writeBatch;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.increment = increment;
window.runTransaction = runTransaction;
window.serverTimestamp = serverTimestamp;

// ─── Firebase Auth ──────────────────────────────────────────
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';

// ============================================================
// HELPERS
// ============================================================

window.fmt = function (n) {
  return 'TZS ' + Number(n || 0).toLocaleString('en-TZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Helper: Format currency with no decimals
function formatCurrencyNoDecimals(value) {
  return 'TZS ' + Math.round(value || 0).toLocaleString();
}

window.fmtDate = function (d) {
  if (!d) return '—';
  // If it's a Firestore Timestamp, convert to Date
  if (typeof d === 'object' && d.toDate && typeof d.toDate === 'function') {
    d = d.toDate();
  }
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return d;
  }
};

// ============================================================
// SOUND EFFECTS
// ============================================================

let audioCtx = null;

function playBeep(frequency, duration, volume) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency || 800;
    gainNode.gain.setValueAtTime(volume || 0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration || 0.1));
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + (duration || 0.1));
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    // Silent fail if audio not supported
  }
}

function soundClick() {
  playBeep(1200, 0.06, 0.08);
}
function soundAdd() {
  playBeep(800, 0.1, 0.1);
  setTimeout(() => playBeep(1000, 0.1, 0.08), 100);
}
function soundSuccess() {
  playBeep(523, 0.1, 0.1);
  setTimeout(() => playBeep(659, 0.1, 0.1), 120);
  setTimeout(() => playBeep(784, 0.15, 0.1), 240);
}
function soundError() {
  playBeep(300, 0.3, 0.1);
  setTimeout(() => playBeep(250, 0.3, 0.08), 200);
}
function soundHover() {
  playBeep(1500, 0.04, 0.06);
}

// Expose globally
window.soundClick = soundClick;
window.soundAdd = soundAdd;
window.soundSuccess = soundSuccess;
window.soundError = soundError;
window.soundHover = soundHover;

// ============================================================
// UNLOCK AUDIO ON FIRST CLICK (browser autoplay rule)
// ============================================================

document.addEventListener('click', function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  document.removeEventListener('click', unlockAudio);
}, { once: true });

// ============================================================
// PRODUCT TOOLTIP
// ============================================================

const tooltip = document.createElement('div');
tooltip.id = 'productTooltip';
tooltip.style.cssText = `
  position: fixed;
  display: none;
  background: #fff;
  border: 1px solid #DDE6EA;
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  font-size: 12px;
  font-family: 'Century Gothic','Trebuchet MS',Arial,sans-serif;
  color: #0B5394;
  z-index: 9999;
  pointer-events: none;
  max-width: 240px;
  line-height: 1.7;
  transition: opacity 0.15s;
  opacity: 0;
`;
document.body.appendChild(tooltip);

function showProductTooltip(product, event) {
  const profit = (product.sellingPrice || 0) - (product.wac || 0);
  const margin = product.sellingPrice > 0 ? ((profit / product.sellingPrice) * 100).toFixed(1) : 0;
  const stockStatus = product.stockStatus || (product.stock <= 0 ? 'Out of Stock' : product.stock <= 5 ? 'Low Stock' : 'Active');
  const statusColor = stockStatus === 'Fast Moving' ? '#1E7B34' : stockStatus === 'Slow Moving' ? '#B45309' : stockStatus === 'Out of Stock' ? '#CC0000' : '#0B5394';

  tooltip.innerHTML = `
    <div style="font-weight:800; font-size:14px; color:#117594; margin-bottom:4px; border-bottom:1px solid #EAF4F9; padding-bottom:4px;">${product.name}</div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#595959;">Selling Price</span><span style="font-weight:700;">${fmt(product.sellingPrice)}</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#595959;">WAC</span><span style="font-weight:600;">${fmt(product.wac)}</span></div>
    <div style="display:flex; justify-content:space-between; color:#1E7B34;"><span style="color:#595959;">Profit</span><span style="font-weight:700;">${fmt(profit)}</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#595959;">Margin</span><span style="font-weight:700;">${margin}%</span></div>
    <div style="display:flex; justify-content:space-between; border-top:1px solid #EAF4F9; padding-top:4px; margin-top:4px;">
      <span style="color:#595959;">Movement</span>
      <span style="font-weight:700; color:${statusColor};">${stockStatus}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:2px;">
      <span>Stock</span>
      <span>${product.stock || 0} units</span>
    </div>
  `;

  // Position tooltip near cursor
  let x = event.clientX + 16;
  let y = event.clientY + 12;
  const rect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 10;
  const maxY = window.innerHeight - rect.height - 10;
  tooltip.style.left = Math.min(x, maxX) + 'px';
  tooltip.style.top = Math.min(y, maxY) + 'px';
  tooltip.style.opacity = '1';
  tooltip.style.display = 'block';
}

function hideProductTooltip() {
  tooltip.style.opacity = '0';
  setTimeout(() => { tooltip.style.display = 'none'; }, 150);
}

// ============================================================
// STOCK BAR (Original hover info)
// ============================================================

function showStockBar(p) {
  document.getElementById('sbStock').textContent = p.stock + ' units';
  document.getElementById('sbWAC').textContent = fmt(p.wac);
  document.getElementById('sbProfit').textContent = fmt(p.profit);
  document.getElementById('sbMargin').textContent = p.profitPct + '%';
  document.getElementById('sbMove').textContent = p.stockStatus;
  document.getElementById('stockBar').classList.add('show');
}

// ============================
// STATE
// ============================

const S = {
  user: null,
  products: [],
  cart: [],
  customer: { cardNumber: 'KM-0000', customerName: 'Guest', pointsBalance: 0, totalDebt: 0, status: 'Active' },
  payType: 'Full Paid',
  loyaltyPointsUsed: 0   // 👈 NEW
};

let currentAnalyticsTab = 'summary'; // Tracks which analytics tab is active

// ============================
// HELPER: Get products with stock > 0
// ============================

function getAvailableProducts() {
  return S.products.filter(p => p.stock > 0);
}

// ============================
// GENERATE SEQUENTIAL PRODUCT ID
// ============================
async function generateProductId() {
  const counterRef = doc(db, 'counters', 'productCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'PRD-' + String(count).padStart(4, '0');
}

// ============================================================
// MIGRATION: Replace all auto‑IDs with PRD-XXXX
// ============================================================
async function migrateProductIds() {
  if (!confirm('⚠️ This will REPLACE all product document IDs with PRD-XXXX format. Continue?')) return;

  const productsSnap = await getDocs(collection(db, 'products'));
  const products = productsSnap.docs;
  console.log(`📦 Found ${products.length} products to migrate.`);

  // Process in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = products.slice(i, i + BATCH_SIZE);

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data = docSnap.data();

      // Skip if already has a productId that looks like PRD-XXXX
      if (data.productId && /^PRD-\d{4}$/.test(data.productId)) {
        console.log(`⏭️ Skipping ${data.productName} – already has PRD ID.`);
        continue;
      }

      // 1. Generate new ID
      const newId = await generateProductId();

      // 2. Create new document with the new ID
      const newDocRef = doc(db, 'products', newId);
      batch.set(newDocRef, {
        ...data,
        productId: newId,
        migratedFrom: oldId,
        migratedAt: new Date().toISOString()
      });

      // 3. Update inventorySummary to point to new productId
      const invQuery = query(collection(db, 'inventorySummary'), where('productId', '==', oldId));
      const invSnap = await getDocs(invQuery);
      if (!invSnap.empty) {
        for (const invDoc of invSnap.docs) {
          const invRef = doc(db, 'inventorySummary', invDoc.id);
          batch.update(invRef, { productId: newId });
        }
      } else {
        // If no inventorySummary exists, create one
        const newInvRef = doc(collection(db, 'inventorySummary'));
        batch.set(newInvRef, {
          productId: newId,
          quantity: data.currentStock || 0,
          wac: data.wac || 0,
          updatedAt: new Date().toISOString()
        });
      }

      // 4. Delete the old document
      const oldDocRef = doc(db, 'products', oldId);
      batch.delete(oldDocRef);
    }

    await batch.commit();
    console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE)+1} completed.`);
  }

  console.log('🎉 Migration complete! All products now have PRD-XXXX IDs.');
  // Reload products to refresh the UI
  await loadProducts();
}

window.migrateProductIds = migrateProductIds;

// ============================
// GENERATE SEQUENTIAL DEBT ID
// ============================
async function generateDebtId() {
  const counterRef = doc(db, 'counters', 'debtCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'DEBT-' + String(count).padStart(4, '0');
}


// ============================
// GENERATE SEQUENTIAL SALE ID
// ============================
async function generateSaleId() {
  const counterRef = doc(db, 'counters', 'salesCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'SAL-' + String(count).padStart(4, '0');
}

// ============================
// GENERATE SEQUENTIAL PAYMENT ID
// ============================
async function generatePaymentId() {
  const counterRef = doc(db, 'counters', 'paymentCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'PAY-' + String(count).padStart(4, '0');
}

// ============================
// GENERATE SEQUENTIAL SALES ITEM ID
// ============================
async function generateSalesItemId() {
  const counterRef = doc(db, 'counters', 'salesItemsCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'SI-' + String(count).padStart(4, '0');
}


// ============================
// GENERATE SEQUENTIAL TRANSACTION ID
// ============================
async function generateTransactionId() {
  const counterRef = doc(db, 'counters', 'transactionCounter');
  const counterSnap = await getDoc(counterRef);
  let count = 1;
  if (counterSnap.exists()) {
    count = (counterSnap.data().count || 0) + 1;
    await updateDoc(counterRef, { count: count });
  } else {
    await setDoc(counterRef, { count: count });
  }
  return 'TRX-' + String(count).padStart(4, '0');
}


// ============================
// FIREBASE AUTH STATE
// ============================

const auth = getAuth();

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in – get profile from sessionStorage
    const stored = sessionStorage.getItem('kazmartUser');
    if (stored) {
      S.user = JSON.parse(stored);

      // ---- FIX: Ensure we have a display name ----
      if (!S.user.name && S.user.fullName) {
        S.user.name = S.user.fullName;
      }
      if (!S.user.name) {
        S.user.name = S.user.username || S.user.email || 'User';
      }
      console.log('👤 User:', S.user.name);

      // Start shift if not already running
      const openingCashFromLogin = parseFloat(localStorage.getItem('kazmartOpeningCash')) || 0;
      if (!getCurrentShift() && openingCashFromLogin > 0) {
        startShift(openingCashFromLogin);
        localStorage.removeItem('kazmartOpeningCash');
      } else if (!getCurrentShift()) {
        startShift(0);
      }

      // Continue with app initialization
      initApp();

    } else {
      // Fallback: if profile not in sessionStorage, redirect to login
      window.location.href = 'pages/login.html';
    }
  } else {
    // No user – redirect to login
    window.location.href = 'pages/login.html';
  }
});


// ─── CUSTOM CONFIRMATION DIALOG ────────────────────────────
function showConfirmation(message, subMessage, onConfirm) {
  const dialog = document.getElementById('confirmationDialog');
  const msgEl = document.getElementById('confirmationMessage');
  const subMsgEl = document.getElementById('confirmationSubMessage');
  const cancelBtn = document.getElementById('confirmationCancel');
  const confirmBtn = document.getElementById('confirmationConfirm');

  msgEl.textContent = message || 'Are you sure?';
  subMsgEl.textContent = subMessage || 'This action cannot be undone.';
  dialog.style.display = 'flex';

  // Remove previous listeners to avoid duplicates
  const newCancel = cancelBtn.cloneNode(true);
  const newConfirm = confirmBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

  newCancel.addEventListener('click', function() {
    dialog.style.display = 'none';
  });
  newConfirm.addEventListener('click', function() {
    dialog.style.display = 'none';
    if (typeof onConfirm === 'function') onConfirm();
  });

  // Click outside to close
  dialog.addEventListener('click', function(e) {
    if (e.target === dialog) {
      dialog.style.display = 'none';
    }
  });
}

// ─── SMOOTH TRANSITION TO LOGIN ─────────────────────────────
function redirectWithTransition(url) {
  // Add zoom-out class to body
  document.body.style.animation = 'zoomOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
  setTimeout(() => {
    window.location.href = url;
  }, 400);
}
// Expose globally
window.showConfirmation = showConfirmation;
window.redirectWithTransition = redirectWithTransition;


// ─── CUSTOM NOTIFICATION MODAL ──────────────────────────────
function showNotification(title, message, callback) {
  const modal = document.getElementById('notificationModal');
  const titleEl = document.getElementById('notificationTitle');
  const msgEl = document.getElementById('notificationMessage');
  const okBtn = document.getElementById('notificationOkBtn');

  if (!modal || !titleEl || !msgEl) return;

  titleEl.textContent = title || 'Success';
  msgEl.innerHTML = message || 'Operation completed.';

  modal.style.display = 'flex';

  // Reset animation by re-adding the class
  const card = document.getElementById('notificationCard');
  card.style.animation = 'none';
  // Force reflow
  void card.offsetHeight;
  card.style.animation = 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';

  // Remove previous listeners to avoid duplicates
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);

  newBtn.addEventListener('click', function() {
    modal.style.display = 'none';
    if (typeof callback === 'function') callback();
  });

  // Click outside to close (optional)
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.style.display = 'none';
      if (typeof callback === 'function') callback();
    }
  });
}

// Close notification programmatically (if needed)
function closeNotification() {
  const modal = document.getElementById('notificationModal');
  if (modal) modal.style.display = 'none';
}

// Expose globally
window.showNotification = showNotification;
window.closeNotification = closeNotification;


async function loadCustomers() {
  console.log('👥 Loading customers...');
  const grid = document.getElementById('customerGrid');
  grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">Loading customers...</div>';

  try {
    const searchTerm = document.getElementById('customerSearchInput')?.value?.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('customerStatusFilter')?.value || 'all';

    const snapshot = await getDocs(collection(db, 'customers'));
    let customers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('📦 Customers fetched:', customers.length);

    if (searchTerm) {
      customers = customers.filter(c =>
        (c.customerName || '').toLowerCase().includes(searchTerm) ||
        (c.cardNumber || '').toLowerCase().includes(searchTerm) ||
        (c.phone || '').toLowerCase().includes(searchTerm)
      );
    }
    if (statusFilter !== 'all') {
      customers = customers.filter(c => (c.status || 'Active') === statusFilter);
    }

    if (customers.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">No customers found.</div>';
      return;
    }

    grid.innerHTML = customers.map(c => `
      <div style="background:#fff; border-radius:10px; padding:16px; border:1px solid #dde6ea; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <div style="font-weight:700; font-size:16px; color:#0B5394;">${c.customerName || 'Unknown'}</div>
            <div style="font-size:12px; color:#999;">${c.cardNumber || '—'} · ${c.phone || '—'}</div>
          </div>
          <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:${(c.status || 'Active') === 'Active' ? '#1E7B3420' : '#CC000020'}; color:${(c.status || 'Active') === 'Active' ? '#1E7B34' : '#CC0000'};">
            ${c.status || 'Active'}
          </span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:12px; color:#595959;">
          <span>📊 Points: <strong style="color:#117594;">${c.pointsBalance || 0}</strong></span>
          <span>💰 Debt: <strong style="color:${(c.totalDebt || 0) > 0 ? '#CC0000' : '#1E7B34'};">${fmt(c.totalDebt || 0)}</strong></span>
          <span>🛒 Spent: <strong>${fmt(c.totalAmountSpent || 0)}</strong></span>
          <span>📅 Visits: <strong>${c.totalVisits || 0}</strong></span>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px; border-top:1px solid #eef0f2; padding-top:8px;">
          <button onclick="viewCustomer('${c.id}')" style="padding:4px 12px; background:#117594; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">👁️ View</button>
          <button onclick="editCustomer('${c.id}')" style="padding:4px 12px; background:#B45309; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">✏️ Edit</button>
          <button onclick="deleteCustomer('${c.id}')" style="padding:4px 12px; background:#CC0000; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">🗑️ Delete</button>
        </div>
      </div>
    `).join('');
console.log('✅ About to update customerLastUpdated');
    document.getElementById('customerLastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Error loading customers:', err);
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#CC0000;">Error loading customers: ${err.message}</div>`;
  }
}

// ─── CUSTOMER MODAL FUNCTIONS ─────────────────────────────────

function openAddCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  document.getElementById('customerModalId').value = '';
  document.getElementById('customerFormCard').value = 'Auto-generated';
  document.getElementById('customerFormName').value = '';
  document.getElementById('customerFormPhone').value = '';
  document.getElementById('customerFormEmail').value = '';
  document.getElementById('customerFormPoints').value = 0;
  document.getElementById('customerFormDebt').value = 0;
  document.getElementById('customerFormSpent').value = 0;
  document.getElementById('customerFormVisits').value = 0;
  document.getElementById('customerFormPointsEarned').value = 0;
  document.getElementById('customerFormPointsRedeemed').value = 0;
  document.getElementById('customerFormPayment').value = 'Cash';
  document.getElementById('customerFormStatus').value = 'Active';
  document.getElementById('customerFormDebtStatus').value = 'Clear';
  document.getElementById('customerFormNotes').value = '';
  document.getElementById('customerModal').style.display = 'flex';
}

async function editCustomer(id) {
  const docSnap = await getDoc(doc(db, 'customers', id));
  if (!docSnap.exists()) { alert('Customer not found.'); return; }
  const data = docSnap.data();

  document.getElementById('customerModalTitle').textContent = 'Edit Customer';
  document.getElementById('customerModalId').value = id;
  document.getElementById('customerFormCard').value = data.cardNumber || '—';
  document.getElementById('customerFormName').value = data.customerName || '';
  document.getElementById('customerFormPhone').value = data.phone || '';
  document.getElementById('customerFormEmail').value = data.email || '';
  document.getElementById('customerFormPoints').value = data.pointsBalance || 0;
  document.getElementById('customerFormDebt').value = data.totalDebt || 0;
  document.getElementById('customerFormSpent').value = data.totalAmountSpent || 0;
  document.getElementById('customerFormVisits').value = data.totalVisits || 0;
  document.getElementById('customerFormPointsEarned').value = data.totalPointsEarned || 0;
  document.getElementById('customerFormPointsRedeemed').value = data.totalPointsRedeemed || 0;
  document.getElementById('customerFormPayment').value = data.preferredPayment || 'Cash';
  document.getElementById('customerFormStatus').value = data.status || 'Active';
  document.getElementById('customerFormDebtStatus').value = data.debtStatus || 'Clear';
  document.getElementById('customerFormNotes').value = data.notes || '';

  document.getElementById('customerModal').style.display = 'flex';
}

function closeCustomerModal() {
  document.getElementById('customerModal').style.display = 'none';
}

async function saveCustomer() {
  const id = document.getElementById('customerModalId').value;
  const name = document.getElementById('customerFormName').value.trim();
  if (!name) { alert('Customer name is required.'); return; }

  const data = {
    customerName: name,
    phone: document.getElementById('customerFormPhone').value.trim(),
    email: document.getElementById('customerFormEmail').value.trim(),
    pointsBalance: parseFloat(document.getElementById('customerFormPoints').value) || 0,
    totalDebt: parseFloat(document.getElementById('customerFormDebt').value) || 0,
    totalAmountSpent: parseFloat(document.getElementById('customerFormSpent').value) || 0,
    totalVisits: parseInt(document.getElementById('customerFormVisits').value) || 0,
    totalPointsEarned: parseFloat(document.getElementById('customerFormPointsEarned').value) || 0,
    totalPointsRedeemed: parseFloat(document.getElementById('customerFormPointsRedeemed').value) || 0,
    preferredPayment: document.getElementById('customerFormPayment').value,
    status: document.getElementById('customerFormStatus').value,
    debtStatus: document.getElementById('customerFormDebtStatus').value,
    notes: document.getElementById('customerFormNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (id) {
      await updateDoc(doc(db, 'customers', id), data);
      alert('✅ Customer updated.');
    } else {
      const counterRef = doc(db, 'counters', 'customerCounter');
      const counterSnap = await getDoc(counterRef);
      let count = 1;
      if (counterSnap.exists()) {
        count = (counterSnap.data().count || 0) + 1;
        await updateDoc(counterRef, { count });
      } else {
        await setDoc(counterRef, { count: 1 });
      }
      data.cardNumber = 'KM-' + String(count).padStart(4, '0');
      data.dateCreated = new Date().toISOString();
      data.lastVisit = new Date().toISOString();
      await addDoc(collection(db, 'customers'), data);
      alert('✅ Customer added with card: ' + data.cardNumber);
    }
    closeCustomerModal();
    loadCustomers();
    await refreshAll(); // 👈 ADD THIS
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db, 'customers', id));
    alert('✅ Customer deleted.');
    loadCustomers();
    await refreshAll(); // 👈 ADD THIS
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

async function viewCustomer(id) {
  const docSnap = await getDoc(doc(db, 'customers', id));
  if (!docSnap.exists()) { alert('Customer not found.'); return; }
  const data = docSnap.data();
  const content = document.getElementById('customerProfileContent');

  content.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div><strong>Name:</strong> ${data.customerName}</div>
      <div><strong>Card:</strong> ${data.cardNumber}</div>
      <div><strong>Phone:</strong> ${data.phone || '—'}</div>
      <div><strong>Email:</strong> ${data.email || '—'}</div>
      <div><strong>Points:</strong> ${data.pointsBalance || 0}</div>
      <div><strong>Total Debt:</strong> ${fmt(data.totalDebt || 0)}</div>
      <div><strong>Total Spent:</strong> ${fmt(data.totalAmountSpent || 0)}</div>
      <div><strong>Visits:</strong> ${data.totalVisits || 0}</div>
      <div><strong>Status:</strong> ${data.status || 'Active'}</div>
      <div><strong>Debt Status:</strong> ${data.debtStatus || 'Clear'}</div>
      <div><strong>Joined:</strong> ${data.dateCreated ? new Date(data.dateCreated).toLocaleDateString() : '—'}</div>
      <div><strong>Last Visit:</strong> ${data.lastVisit ? new Date(data.lastVisit).toLocaleDateString() : '—'}</div>
      <div style="grid-column:1/-1;"><strong>Notes:</strong> ${data.notes || '—'}</div>
    </div>
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eef0f2;">
      <h4 style="margin:0 0 8px 0; color:#0B5394;">Purchase History</h4>
      <div id="customerPurchaseHistory" style="font-size:13px; color:#999;">Loading purchases...</div>
    </div>
  `;
  document.getElementById('customerProfileModal').style.display = 'flex';

  try {
    const salesQuery = query(
      collection(db, 'sales'),
      where('customerId', '==', id),
      orderBy('saleDate', 'desc'),
      limit(10)
    );
    const salesSnap = await getDocs(salesQuery);
    const historyDiv = document.getElementById('customerPurchaseHistory');
    if (salesSnap.empty) {
      historyDiv.innerHTML = '<div style="color:#999;">No purchases yet.</div>';
    } else {
      let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#117594; color:#fff;"><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>';
      salesSnap.forEach(doc => {
        const s = doc.data();
        html += `<tr><td>${new Date(s.saleDate).toLocaleDateString()}</td><td style="font-weight:700;">${fmt(s.totalAmount)}</td><td>${s.paymentStatus || 'Paid'}</td></tr>`;
      });
      html += '</tbody></table>';
      historyDiv.innerHTML = html;
    }
  } catch (err) {
    document.getElementById('customerPurchaseHistory').innerHTML = '<span style="color:#CC0000;">Error loading purchases.</span>';
  }
}

function closeCustomerProfile() {
  document.getElementById('customerProfileModal').style.display = 'none';
}


// ─── CUSTOMER ANALYTICS ──────────────────────────────────────

async function loadAnalyticsCustomerData() {
  console.log('👥 loadAnalyticsCustomerData() called.');
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  try {
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const snap = await getDocs(collection(db, 'customers'));
    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const total = customers.length;
    const active = customers.filter(c => (c.status || 'Active') === 'Active').length;
    const withDebt = customers.filter(c => (c.totalDebt || 0) > 0).length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0);
    const totalPoints = customers.reduce((sum, c) => sum + (c.pointsBalance || 0), 0);

    const newCustomers = customers.filter(c => {
      const created = c.dateCreated ? new Date(c.dateCreated) : null;
      return created && created >= start && created <= end;
    });
    const newCount = newCustomers.length;

    document.getElementById('analyticsCustomersTotal').textContent = total;
    document.getElementById('analyticsCustomersActive').textContent = active;
    document.getElementById('analyticsCustomersNew').textContent = newCount;
    document.getElementById('analyticsCustomersWithDebt').textContent = withDebt;
    document.getElementById('analyticsCustomersTotalDebt').textContent = fmt(totalDebt);
    document.getElementById('analyticsCustomersTotalPoints').textContent = totalPoints;

    const tableBody = document.getElementById('analyticsCustomersTableBody');
    const sorted = customers.sort((a, b) => (b.totalAmountSpent || 0) - (a.totalAmountSpent || 0));
    const top100 = sorted.slice(0, 100);

    if (top100.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#999;">No customers found.</td></tr>';
    } else {
      tableBody.innerHTML = top100.map(c => {
        const statusColor = (c.status || 'Active') === 'Active' ? '#1E7B34' : (c.status === 'Blacklisted' ? '#CC0000' : '#B45309');
        return `
          <tr>
            <td style="padding:8px 12px;">${c.cardNumber || '—'}</td>
            <td style="padding:8px 12px; font-weight:600;">${c.customerName || 'Unknown'}</td>
            <td style="padding:8px 12px;">${c.phone || '—'}</td>
            <td style="padding:8px 12px; text-align:right;">${c.pointsBalance || 0}</td>
            <td style="padding:8px 12px; text-align:right; color:${(c.totalDebt || 0) > 0 ? '#CC0000' : '#1E7B34'};">${fmt(c.totalDebt || 0)}</td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:${statusColor}20; color:${statusColor};">
                ${c.status || 'Active'}
              </span>
            </td>
            <td style="padding:8px 12px; text-align:center;">${c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-GB') : '—'}</td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Customer analytics loaded!');
  } catch (err) {
    console.error('Error loading customer analytics:', err);
    ['analyticsCustomersTotal','analyticsCustomersActive','analyticsCustomersNew','analyticsCustomersWithDebt','analyticsCustomersTotalDebt','analyticsCustomersTotalPoints'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
    document.getElementById('analyticsCustomersTableBody').innerHTML = `<tr><td colspan="7" style="padding:20px; text-align:center; color:#CC0000;">Error loading data: ${err.message}</td></tr>`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ─── EXPOSE CUSTOMER FUNCTIONS GLOBALLY ──────────────────────
window.loadCustomers = loadCustomers;
window.openAddCustomerModal = openAddCustomerModal;
window.editCustomer = editCustomer;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.viewCustomer = viewCustomer;
window.closeCustomerModal = closeCustomerModal;
window.closeCustomerProfile = closeCustomerProfile;
window.loadAnalyticsCustomerData = loadAnalyticsCustomerData;
window.resetCust = resetCust;

// ─── App initialization function ──────────────────────────

async function initApp() {
  await loadComponent('#topbar', 'components/topbar.html');
  await loadComponent('#cart-panel', 'components/cart.html?v=' + Date.now());

 // ─── Set user display name ──────────────────────────────────
const nameEl = document.getElementById('userDisplay');
if (nameEl) {
  // Use username as primary, fallback to email
  const displayName = S.user.username || S.user.email || S.user.name || S.user.fullName || 'User';
  nameEl.textContent = displayName;
  console.log('👤 Display name set to:', displayName); // for debugging
}

  const roleEl = document.getElementById('userRole');
  if (roleEl) roleEl.textContent = S.user.role || 'Admin';

  const resetBtn = document.getElementById('resetAllStockBtn');
  if (resetBtn) {
    const role = S.user.role ? S.user.role.toLowerCase() : '';
    resetBtn.style.display = (role === 'admin') ? 'inline-block' : 'none';
  }

  await loadProducts();
  showPage('pos');

  // Search Products
  const searchInput = document.getElementById('productSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function (e) {
      const query = this.value.toLowerCase().trim();
      const available = getAvailableProducts();
      if (!query) {
        renderProducts(available);
        return;
      }
      const filtered = available.filter(p => {
        const name = (p.name || '').toLowerCase();
        return name.includes(query);
      });
      renderProducts(filtered);
    });
  }

  // Payment Buttons
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      setPayType(this.dataset.type);
    });
  });

  // Cash Input
  const cashInput = document.getElementById('cashReceived');
  if (cashInput) {
    cashInput.addEventListener('input', updateChange);
  }

  // Complete Sale
  const saleBtn = document.getElementById('completeSale');
  if (saleBtn) {
    saleBtn.addEventListener('click', completeSale);
  }

  // Navigation
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', function () {
      const page = this.dataset.page;
      showPage(page);
    });
  });

  // Refresh
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadProducts();
      alert('🔄 Refreshed!');
    });
  }

  // ─── Logout – Open Options Modal ───────────────────────────
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      document.getElementById('logoutOptionsModal').style.display = 'flex';
    });
  }

  // Customer Search Dropdown
  const custSearch = document.getElementById('customerSearch');
  let custTimer, custTurn = 0, custResults = [], custHighlight = 0;

  function renderCustDropdown(list) {
    const box = document.getElementById('custDropdown');
    custResults = list;
    custHighlight = 0;
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = list.map((c, i) => `
      <div class='cust-drop-item' data-i='${i}' style='padding:9px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--gray-border); ${i === 0 ? 'background:var(--teal-faint);' : ''}'>
        <div><div style='font-size:12px; font-weight:700; color:var(--navy);'>${c.customerName}</div>
        <div style='font-size:10px; color:var(--gray);'>${c.cardNumber || c.phone}</div></div>
        <span style='color:var(--red); font-size:10px; font-weight:700;'>${c.totalDebt > 0 ? 'Owes ' + fmt(c.totalDebt) : ''}</span>
      </div>
    `).join('');
    box.style.display = 'block';
    box.querySelectorAll('.cust-drop-item').forEach(item => {
      item.addEventListener('click', function () {
        const idx = parseInt(this.dataset.i);
        const c = custResults[idx];
        if (c) {
          assignCust(c);
          document.getElementById('custSearch').value = c.cardNumber || c.phone;
          document.getElementById('custDropdown').style.display = 'none';
        }
      });
    });
  }

  function highlightCustItem() {
    document.querySelectorAll('.cust-drop-item').forEach((item, i) => {
      item.style.background = (i === custHighlight) ? 'var(--teal-faint)' : '';
    });
  }

  if (custSearch) {
    custSearch.addEventListener('input', function () {
      clearTimeout(custTimer);
      const q = this.value.trim();
      const myTurn = ++custTurn;
      if (!q) {
        resetCust();
        document.getElementById('custDropdown').style.display = 'none';
        return;
      }
      custTimer = setTimeout(async () => {
        const result = await window.api('searchCustomer', { query: q });
        if (myTurn !== custTurn) return;
        renderCustDropdown(result.results || []);
      }, 400);
    });

    custSearch.addEventListener('keydown', function (e) {
      if (!custResults.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); custHighlight = Math.min(custHighlight + 1, custResults.length - 1); highlightCustItem(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); custHighlight = Math.max(custHighlight - 1, 0); highlightCustItem(); }
      else if (e.key === 'Enter') { e.preventDefault(); const c = custResults[custHighlight]; if (c) { assignCust(c); document.getElementById('custSearch').value = c.cardNumber || c.phone; document.getElementById('custDropdown').style.display = 'none'; } }
      else if (e.key === 'Escape') { document.getElementById('custDropdown').style.display = 'none'; }
    });

    document.addEventListener('click', (e) => {
      const box = document.getElementById('custDropdown');
      const input = document.getElementById('custSearch');
      if (box && input && e.target !== input && !box.contains(e.target)) {
        box.style.display = 'none';
      }
    });
  }

  // ── Category scroll with mouse wheel ──
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('wheel', function (e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY * 0.8;
      }
    }, { passive: false });
  }

  // Edit Product Modal - Cancel
  const editProductCancel = document.getElementById('editProductCancel');
  if (editProductCancel) {
    editProductCancel.addEventListener('click', function() {
      document.getElementById('editProductModal').style.display = 'none';
    });
  }

  // Edit Product Modal - Save
  const editProductSave = document.getElementById('editProductSave');
  if (editProductSave) {
    editProductSave.addEventListener('click', async function() {
      const productId = document.getElementById('editProductId').value;
      if (!productId) {
        alert('No product selected.');
        return;
      }
      const name = document.getElementById('editProductName').value.trim();
      const sellingPrice = parseFloat(document.getElementById('editSellingPrice').value) || 0;
      const wac = parseFloat(document.getElementById('editWac').value) || 0;
      const category = document.getElementById('editCategory').value.trim() || 'General';
      const bundleAvail = document.getElementById('editBundleAvail').value === 'YES';
      const bundleSize = parseInt(document.getElementById('editBundleSize').value) || 0;
      const bundlePrice = parseFloat(document.getElementById('editBundlePrice').value) || 0;

      try {
        const productRef = doc(db, 'products', productId);
        await updateDoc(productRef, {
          productName: name,
          sellingPrice: sellingPrice,
          wac: wac,
          category: category,
          bundleAvail: bundleAvail,
          bundleSize: bundleSize,
          bundlePrice: bundlePrice,
          updatedAt: new Date().toISOString()
        });

        const invQuery = query(collection(db, 'inventorySummary'), where('productId', '==', productId));
        const invSnap = await getDocs(invQuery);
        if (!invSnap.empty) {
          const invRef = doc(db, 'inventorySummary', invSnap.docs[0].id);
          await updateDoc(invRef, { wac: wac });
        }

        alert('✅ Product updated successfully.');
        document.getElementById('editProductModal').style.display = 'none';
        await loadProducts();
        await loadStockData();
      } catch (err) {
        alert('❌ Error updating product: ' + err.message);
      }
    });
  }

  // Click outside modal to close
  const editProductModal = document.getElementById('editProductModal');
  if (editProductModal) {
    editProductModal.addEventListener('click', function(e) {
      if (e.target === editProductModal) {
        editProductModal.style.display = 'none';
      }
    });
  }

  // ─── Customer Page Listeners ────────────────────────────────
  document.getElementById('customerSearchInput')?.addEventListener('input', function() {
    loadCustomers();
  });
  document.getElementById('customerStatusFilter')?.addEventListener('change', function() {
    loadCustomers();
  });

  // ============================================================
  // DISCOUNT INPUT - Update cart when discount changes
  // ============================================================
  const discountInput = document.getElementById('discountInput');
  if (discountInput) {
    discountInput.addEventListener('input', function () {
      updateCartUI();
      updateChange();
    });
  }

  // ============================================================
  // LOYALTY POINTS INPUT - Update cart when points change
  // ============================================================
  const loyalInput = document.getElementById('loyalInput');
  if (loyalInput) {
    loyalInput.addEventListener('input', function () {
      const availablePoints = S.customer?.pointsBalance || 0;
      let entered = parseInt(this.value) || 0;
      if (entered < 0) entered = 0;
      if (entered > availablePoints) {
        entered = availablePoints;
        this.value = entered;
      }
      S.loyaltyPointsUsed = entered;
      updateLoyaltyDisplay();
      updateCartUI();
      updateChange();
    });
  }

  // ============================================================
  // RECEIPT MODAL - Close
  // ============================================================
  const receiptModal = document.getElementById('receiptModal');
  const receiptClose = document.getElementById('receiptCloseBtn');

  if (receiptClose) {
    receiptClose.addEventListener('click', function () {
      receiptModal.style.display = 'none';
    });
  }

  if (receiptModal) {
    receiptModal.addEventListener('click', function (e) {
      if (e.target === receiptModal) {
        receiptModal.style.display = 'none';
      }
    });
  }

 
  // ============================
  // ============================
  // STOCK IN (Manual) – with loading overlay
  // ============================
  const stockInBtn = document.getElementById('stockInSubmit');
  if (stockInBtn) {
    stockInBtn.addEventListener('click', async function () {
      const productName = document.getElementById('stockInProduct').value.trim();
      const qty = parseFloat(document.getElementById('stockInQty').value);
      const amount = parseFloat(document.getElementById('stockInAmount').value);
      const supplier = document.getElementById('stockInSupplier').value.trim();

      if (!productName) { alert('Please select a product.'); return; }
      if (!qty || qty <= 0) { alert('Enter a valid quantity.'); return; }
      if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }

      // ─── Show loading overlay ──────────────────────────────
      showLoading('Processing, please wait...');

      try {
        this.disabled = true;
        this.textContent = 'Saving...';

        const q = query(collection(db, 'products'), where('productName', '==', productName));
        const snap = await getDocs(q);
        if (snap.empty) {
          alert('Product not found: ' + productName);
          this.disabled = false;
          this.textContent = 'Add Stock';
          return;
        }
        const prodDoc = snap.docs[0];
        const prodId = prodDoc.id;

        const invQuery = query(collection(db, 'inventorySummary'), where('productId', '==', prodId));
        const invSnap = await getDocs(invQuery);
        let currentStock = 0;
        if (!invSnap.empty) {
          const invRef = doc(db, 'inventorySummary', invSnap.docs[0].id);
          currentStock = invSnap.docs[0].data().quantity || 0;
          await updateDoc(invRef, { quantity: increment(qty) });
        } else {
          await addDoc(collection(db, 'inventorySummary'), { productId: prodId, quantity: qty });
        }

        const trxId = await generateTransactionId();
        const trxRef = doc(db, 'inventoryTransactions', trxId);
        await setDoc(trxRef, {
          transactionId: trxId,
          productid: prodId,
          productName: productName,
          quantity: qty,
          transactionType: 'Purchase',
          unitCost: amount / qty,
          prevStock: currentStock,
          newStock: currentStock + qty,
          createdAt: new Date().toISOString(),
          createdBy: S.user?.id || 'unknown',
          referenceId: 'manual_purchase',
          remarks: 'Stock In from manual entry'
        });

        showNotification('✅ Success', 'Stock added for ' + productName);
        document.getElementById('stockInProduct').value = '';
        document.getElementById('stockInQty').value = '';
        document.getElementById('stockInAmount').value = '';
        document.getElementById('stockInSupplier').value = '';
        await loadStockData();
        await refreshAll();

      } catch (err) {
        showNotification('❌ Error', err.message);
      } finally {
        this.disabled = false;
        this.textContent = 'Add Stock';
        // ─── Hide loading overlay ──────────────────────────────
        hideLoading();
      }
    });
  }

  // ============================
  // PURCHASE CART (Stock In Cart)
  // ============================
  let purchaseCart = [];

  document.getElementById('stockInQty')?.addEventListener('input', updateStockInPreview);
  document.getElementById('stockInAmount')?.addEventListener('input', updateStockInPreview);

  function updateStockInPreview() {
    const qty = parseFloat(document.getElementById('stockInQty').value);
    const amount = parseFloat(document.getElementById('stockInAmount').value);
    const preview = document.getElementById('stockInPreview');
    const unitPriceEl = document.getElementById('stockInUnitPrice');
    if (qty > 0 && amount > 0) {
      const unitPrice = amount / qty;
      unitPriceEl.textContent = 'TZS ' + unitPrice.toLocaleString();
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }

  const stockInAddBtn = document.getElementById('stockInAddToCart');
  if (stockInAddBtn) {
    stockInAddBtn.addEventListener('click', function () {
      const productName = document.getElementById('stockInProduct').value.trim();
      const qty = parseFloat(document.getElementById('stockInQty').value);
      const amount = parseFloat(document.getElementById('stockInAmount').value);
      const supplier = document.getElementById('stockInSupplier').value.trim();

      if (!productName) { alert('Please select a product.'); return; }
      if (!qty || qty <= 0) { alert('Enter a valid quantity.'); return; }
      if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }

      const product = allStockProducts.find(p => p.name === productName);
      if (!product) { alert('Product not found in inventory.'); return; }

      const unitPrice = amount / qty;

      purchaseCart.push({
        productId: product.id,
        productName: productName,
        qty: qty,
        unitPrice: unitPrice,
        totalAmount: amount,
        supplier: supplier || 'Unknown'
      });

      renderPurchaseCart();
      document.getElementById('stockInProduct').value = '';
      document.getElementById('stockInQty').value = '';
      document.getElementById('stockInAmount').value = '';
      document.getElementById('stockInSupplier').value = '';
      document.getElementById('stockInPreview').style.display = 'none';
    });
  }

  function renderPurchaseCart() {
    const wrap = document.getElementById('purchaseCartWrap');
    const body = document.getElementById('purchaseCartBody');
    const count = document.getElementById('purchaseCartCount');
    if (!wrap || !body) return;
    count.textContent = purchaseCart.length;
    if (!purchaseCart.length) {
      wrap.style.display = 'none';
      body.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">Cart is empty</td></tr>';
      return;
    }
    wrap.style.display = 'block';
    body.innerHTML = purchaseCart.map((item, index) => `
      <tr data-index="${index}" style="cursor:pointer;">
        <td style="padding:8px 12px; font-weight:600;">${item.productName}</td>
        <td style="padding:8px 12px; text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px; text-align:center; font-family:'Courier New',monospace;">TZS ${item.unitPrice.toLocaleString()}</td>
        <td style="padding:8px 12px; text-align:center; font-weight:700; color:#117594;">TZS ${item.totalAmount.toLocaleString()}</td>
        <td style="padding:8px 12px; text-align:center;">${item.supplier}</td>
        <td style="padding:8px 12px; text-align:center;">
          <button onclick="window.removePurchaseItem(${index})" style="background:#CC0000; color:#fff; border:none; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:11px; font-weight:600;">✕ Remove</button>
        </td>
      </tr>
    `).join('');
  }

  window.removePurchaseItem = function (index) {
    purchaseCart.splice(index, 1);
    renderPurchaseCart();
  };

  const purchaseResetBtn = document.getElementById('purchaseCartReset');
  if (purchaseResetBtn) {
    purchaseResetBtn.addEventListener('click', function () {
      if (purchaseCart.length === 0) return;
      if (confirm('Clear all items from purchase cart?')) {
        purchaseCart = [];
        renderPurchaseCart();
      }
    });
  }

  const purchaseSubmitBtn = document.getElementById('purchaseSubmitAll');
if (purchaseSubmitBtn) {
  purchaseSubmitBtn.addEventListener('click', async function () {
    if (!purchaseCart.length) { alert('Purchase cart is empty.'); return; }
    if (!confirm('Submit ' + purchaseCart.length + ' purchase(s)? This will add stock and update WAC.')) return;

    // ─── Show loading overlay ──────────────────────────────
    showLoading('Processing, please wait...');

    try {
      this.disabled = true;
      this.textContent = 'Processing...';

      for (const item of purchaseCart) {
        const q = query(collection(db, 'products'), where('productName', '==', item.productName));
        const snap = await getDocs(q);
        if (snap.empty) { alert('Product not found: ' + item.productName); continue; }
        const prodDoc = snap.docs[0];
        const prodId = prodDoc.id;

        const invRef = doc(db, 'inventorySummary', prodId);
        const invSnap = await getDoc(invRef);
        let currentStock = 0;
        let currentWac = 0;
        if (invSnap.exists()) {
          currentStock = invSnap.data().quantity || 0;
          currentWac = invSnap.data().wac || 0;
        }

        const unitPrice = item.unitPrice;
        const newQty = currentStock + item.qty;
        const newWac = newQty > 0 ? ((currentStock * currentWac) + (item.qty * unitPrice)) / newQty : 0;

        if (invSnap.exists()) {
          await updateDoc(invRef, { quantity: newQty, wac: newWac });
        } else {
          await setDoc(invRef, { productId: prodId, quantity: newQty, wac: newWac });
        }

        const trxId = await generateTransactionId();
        const trxRef = doc(db, 'inventoryTransactions', trxId);
        await setDoc(trxRef, {
          transactionId: trxId,
          productid: prodId,
          productName: item.productName,
          quantity: item.qty,
          transactionType: 'Purchase',
          unitCost: unitPrice,
          prevStock: currentStock,
          newStock: newQty,
          createdAt: new Date().toISOString(),
          createdBy: S.user?.id || 'unknown',
          referenceId: 'purchase_cart',
          remarks: 'Stock In from purchase cart'
        });
      }

      showNotification('✅ Success', 'All purchases submitted successfully! WAC updated.');
      purchaseCart = [];
      renderPurchaseCart();
      await loadStockData();
      await refreshAll();
    } catch (err) {
      showNotification('❌ Error', err.message);
    } finally {
      this.disabled = false;
      this.textContent = 'Submit All Purchases';
      // ─── Hide loading overlay ──────────────────────────────
      hideLoading();
    }
  });
}

  window.handleStockInBarcode = async function () {
    const barcode = document.getElementById('stockInBarcodeInput').value.trim();
    if (!barcode) return;
    try {
      const product = allStockProducts.find(p => p.barcode && p.barcode.toString() === barcode);
      if (product) {
        document.getElementById('stockInProduct').value = product.name;
        document.getElementById('stockInBarcodeInput').value = '';
        updateStockInPreview();
      } else {
        const q = query(collection(db, 'products'), where('barcode', '==', barcode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const doc = snap.docs[0];
          const data = doc.data();
          document.getElementById('stockInProduct').value = data.productName || data.name;
          document.getElementById('stockInBarcodeInput').value = '';
          updateStockInPreview();
        } else {
          alert('Product not found for barcode: ' + barcode);
        }
      }
    } catch (err) {
      showNotification('❌ Error', err.message);
    }
  };

  // ============================
  // CORRECTION PREVIEW & CART
  // ============================
  let correctionCartArr = [];

  function updateCorrPreview() {
    const itemName = document.getElementById('corrProduct').value.trim();
    const qty = parseFloat(document.getElementById('corrQty').value) || 0;
    const type = document.getElementById('corrType').value;
    const preview = document.getElementById('corrPreview');
    const resultEl = document.getElementById('corrResult');

    if (!itemName || !qty || !type) {
      if (preview) preview.style.display = 'none';
      return;
    }

    const product = allStockProducts.find(p => p.name.toLowerCase() === itemName.toLowerCase());
    const currentStock = product ? (product.stock || 0) : 0;

    let resultStock = currentStock;
    if (type === 'Audit') {
      resultStock = qty;
    } else if (type === 'Addition') {
      resultStock = currentStock + qty;
    } else {
      resultStock = currentStock - qty;
    }

    if (resultEl) resultEl.textContent = currentStock + ' → ' + resultStock + ' units';
    if (preview) preview.style.display = 'block';
  }

  document.getElementById('corrProduct')?.addEventListener('input', function () {
    onCorrProductChange();
    updateCorrPreview();
  });
  document.getElementById('corrQty')?.addEventListener('input', updateCorrPreview);
  document.getElementById('corrType')?.addEventListener('change', updateCorrPreview);

  const corrAddBtn = document.getElementById('corrAddToCart');
  if (corrAddBtn) {
    corrAddBtn.addEventListener('click', function () {
      const itemName = document.getElementById('corrProduct').value.trim();
      const qty = parseFloat(document.getElementById('corrQty').value);
      const type = document.getElementById('corrType').value;

      if (!itemName) { alert('Please select a product.'); return; }
      if (!qty || qty <= 0) { alert('Enter a valid quantity.'); return; }
      if (!type) { alert('Please select a correction type.'); return; }

      const product = allStockProducts.find(p => p.name.toLowerCase() === itemName.toLowerCase());
      if (!product) { alert('Product not found in inventory.'); return; }

      correctionCartArr.push({
        productId: product.id,
        productName: itemName,
        currentStock: product.stock || 0,
        type: type,
        qty: qty
      });

      renderCorrectionCart();

      document.getElementById('corrProduct').value = '';
      document.getElementById('corrQty').value = '';
      document.getElementById('corrCurrentStock').value = '';
      document.getElementById('corrType').value = '';
      document.getElementById('corrPreview').style.display = 'none';
    });
  }

  function renderCorrectionCart() {
    const wrap = document.getElementById('correctionCartWrap');
    const body = document.getElementById('correctionCartBody');
    const count = document.getElementById('correctionCartCount');
    if (!wrap || !body) return;

    count.textContent = correctionCartArr.length;

    if (!correctionCartArr.length) {
      wrap.style.display = 'none';
      body.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">Cart is empty</td></tr>';
      return;
    }

    wrap.style.display = 'block';
    body.innerHTML = correctionCartArr.map((item, index) => `
      <tr>
        <td style="padding:8px 12px; font-weight:600; cursor:pointer; color:#0B5394; text-decoration:underline;" onclick="openEditCorrectionModal(${index})">
          ✏️ ${item.productName}
        </td>
        <td style="padding:8px 12px; text-align:center;">${item.currentStock}</td>
        <td style="padding:8px 12px; text-align:center;">${item.type}</td>
        <td style="padding:8px 12px; text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px; text-align:center;">
          <button onclick="window.removeCorrectionItem(${index})" style="background:#CC0000; color:#fff; border:none; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:11px; font-weight:600;">✕ Remove</button>
        </td>
      </tr>
    `).join('');
  }

  window.removeCorrectionItem = function (index) {
    correctionCartArr.splice(index, 1);
    renderCorrectionCart();
  };

  const corrResetBtn = document.getElementById('corrCartReset');
  if (corrResetBtn) {
    corrResetBtn.addEventListener('click', function () {
      if (correctionCartArr.length === 0) return;
      if (confirm('Clear all items from correction cart?')) {
        correctionCartArr = [];
        renderCorrectionCart();
      }
    });
  }

  const corrSubmitBtn = document.getElementById('corrSubmitAll');
if (corrSubmitBtn) {
  corrSubmitBtn.addEventListener('click', async function () {
    if (!correctionCartArr.length) { alert('Correction cart is empty.'); return; }
    if (!confirm('Submit ' + correctionCartArr.length + ' correction(s)? This will update stock.')) return;

    // ─── Show loading overlay ──────────────────────────────
    showLoading('Processing, please wait...');

    try {
      this.disabled = true;
      this.textContent = 'Processing...';

      for (const item of correctionCartArr) {
        const invRef = doc(db, 'inventorySummary', item.productId);
        const invSnap = await getDoc(invRef);
        let currentStock = 0;
        if (invSnap.exists()) {
          currentStock = invSnap.data().quantity || 0;
        }

        let newStock;
        if (item.type === 'Audit') {
          newStock = item.qty;
        } else if (item.type === 'Addition') {
          newStock = currentStock + item.qty;
        } else {
          newStock = currentStock - item.qty;
        }

        if (invSnap.exists()) {
          await updateDoc(invRef, { quantity: newStock });
        } else {
          await setDoc(invRef, { productId: item.productId, quantity: newStock, wac: 0 });
        }

        const trxId = await generateTransactionId();
        const trxRef = doc(db, 'inventoryTransactions', trxId);
        await setDoc(trxRef, {
          transactionId: trxId,
          productid: item.productId,
          productName: item.productName,
          quantity: item.qty,
          transactionType: item.type,
          prevStock: currentStock,
          newStock: newStock,
          createdAt: new Date().toISOString(),
          createdBy: S.user?.id || 'unknown',
          referenceId: 'correction_cart',
          remarks: 'Stock correction: ' + item.type
        });
      }

      showNotification('✅ Success', 'All corrections submitted successfully!');
      correctionCartArr = [];
      renderCorrectionCart();
      await loadStockData();
      await refreshAll();
    } catch (err) {
      showNotification('❌ Error', err.message);
    } finally {
      this.disabled = false;
      this.textContent = 'Submit All Corrections';
      // ─── Hide loading overlay ──────────────────────────────
      hideLoading();
    }
  });
}

  window.handleCorrBarcode = async function () {
    const barcode = document.getElementById('corrBarcodeInput').value.trim();
    if (!barcode) return;
    try {
      const product = allStockProducts.find(p => p.barcode && p.barcode.toString() === barcode);
      if (product) {
        document.getElementById('corrProduct').value = product.name;
        document.getElementById('corrBarcodeInput').value = '';
        onCorrProductChange();
        updateCorrPreview();
      } else {
        const q = query(collection(db, 'products'), where('barcode', '==', barcode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const doc = snap.docs[0];
          const data = doc.data();
          document.getElementById('corrProduct').value = data.productName || data.name;
          document.getElementById('corrBarcodeInput').value = '';
          onCorrProductChange();
          updateCorrPreview();
        } else {
          alert('Product not found for barcode: ' + barcode);
        }
      }
    } catch (err) {
      showNotification('❌ Error', err.message);
    }
  };

  // ============================================================
  // EDIT CORRECTION ITEM (Modal)
  // ============================================================
  function openEditCorrectionModal(index) {
    const item = correctionCartArr[index];
    if (!item) {
      console.warn('Item not found at index:', index);
      return;
    }

    const modal = document.getElementById('editCorrectionModal');
    if (!modal) {
      console.error('❌ editCorrectionModal not found in DOM!');
      alert('Edit modal not found. Please check the HTML.');
      return;
    }

    const productInput = document.getElementById('editCorrProduct');
    const qtyInput = document.getElementById('editCorrQty');
    const typeInput = document.getElementById('editCorrType');
    const stockInput = document.getElementById('editCorrCurrentStock');

    if (!productInput || !qtyInput || !typeInput || !stockInput) {
      alert('Edit modal inputs are missing. Check console for details.');
      return;
    }

    productInput.value = item.productName;
    qtyInput.value = item.qty;
    typeInput.value = item.type;
    stockInput.value = item.currentStock + ' units';

    modal.dataset.editIndex = index;
    updateEditCorrPreview();
    modal.style.display = 'flex';
  }

  function updateEditCorrPreview() {
    const itemName = document.getElementById('editCorrProduct').value.trim();
    const qty = parseFloat(document.getElementById('editCorrQty').value) || 0;
    const type = document.getElementById('editCorrType').value;
    const preview = document.getElementById('editCorrPreview');
    const resultEl = document.getElementById('editCorrResult');

    if (!itemName || !qty || !type) {
      if (preview) preview.style.display = 'none';
      return;
    }

    const index = parseInt(document.getElementById('editCorrectionModal').dataset.editIndex);
    const item = correctionCartArr[index];
    if (!item) return;

    let currentStock = item.currentStock || 0;
    let resultStock = currentStock;

    if (type === 'Audit') {
      resultStock = qty;
    } else if (type === 'Addition') {
      resultStock = currentStock + qty;
    } else {
      resultStock = currentStock - qty;
    }

    if (resultEl) {
      resultEl.textContent = currentStock + ' → ' + resultStock + ' units';
      resultEl.style.color = resultStock < 0 ? 'var(--red)' : 'var(--green)';
    }
    if (preview) preview.style.display = 'block';
  }

  function saveEditCorrectionItem() {
    const index = parseInt(document.getElementById('editCorrectionModal').dataset.editIndex);
    const item = correctionCartArr[index];
    if (!item) return;

    const newQty = parseFloat(document.getElementById('editCorrQty').value) || 0;
    const newType = document.getElementById('editCorrType').value;

    if (!newQty || newQty <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (!newType) {
      alert('Please select a correction type.');
      return;
    }

    correctionCartArr[index].qty = newQty;
    correctionCartArr[index].type = newType;

    document.getElementById('editCorrectionModal').style.display = 'none';
    renderCorrectionCart();
  }

  function closeEditCorrectionModal() {
    document.getElementById('editCorrectionModal').style.display = 'none';
  }

  window.openEditCorrectionModal = openEditCorrectionModal;
  window.saveEditCorrectionItem = saveEditCorrectionItem;
  window.closeEditCorrectionModal = closeEditCorrectionModal;

  // ============================
  // STOCK TAB SWITCHING
  // ============================
  document.querySelectorAll('.stock-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.stock-tab').forEach(t => {
        t.style.background = 'rgba(255,255,255,0.12)';
        t.style.color = '#117594';
        t.style.borderColor = '#C9E8F3';
        t.style.boxShadow = '0 2px 0 rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)';
        t.classList.remove('active');
      });
      this.style.background = '#117594';
      this.style.color = '#fff';
      this.style.borderColor = 'rgba(255,255,255,0.2)';
      this.style.boxShadow = '0 3px 0 #0D5A70, 0 4px 8px rgba(0,0,0,0.1)';
      this.classList.add('active');

      const tabName = this.dataset.tab;
      const currentTab = document.getElementById('stockCurrentTab');
      const inTab = document.getElementById('stockInTab');
      const corrTab = document.getElementById('stockCorrectionTab');
      if (currentTab) currentTab.style.display = tabName === 'current' ? 'block' : 'none';
      if (inTab) inTab.style.display = tabName === 'stockin' ? 'block' : 'none';
      if (corrTab) corrTab.style.display = tabName === 'correction' ? 'block' : 'none';
    });
  });

  setupStockSearch();

  // ============================================================
  // ENTER KEY SUPPORT – Across all pages
  // ============================================================
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;

    const active = document.activeElement;
    if (!active) return;

    if (active.id === 'lPass' || active.id === 'lCash') {
      const loginBtn = document.getElementById('lBtn');
      if (loginBtn) loginBtn.click();
      e.preventDefault();
      return;
    }

    if (active.id === 'customerSearch') {
      const firstItem = document.querySelector('.cust-drop-item');
      if (firstItem) firstItem.click();
      e.preventDefault();
      return;
    }

    if (active.closest('#stockInTab')) {
      const addBtn = document.getElementById('stockInAddToCart');
      if (addBtn) addBtn.click();
      e.preventDefault();
      return;
    }

    if (active.closest('#stockCorrectionTab')) {
      const addBtn = document.getElementById('corrAddToCart');
      if (addBtn) addBtn.click();
      e.preventDefault();
      return;
    }

    if (active.closest('#cashView')) {
      const recordBtn = document.getElementById('cashSubmitBtn');
      if (recordBtn) recordBtn.click();
      e.preventDefault();
      return;
    }
  });

  // ============================
  // DEBT PAGE – Event Listeners
  // ============================
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      setDebtFilter(this.dataset.filter);
    });
  });

  document.getElementById('debtSearch')?.addEventListener('input', searchDebts);

  document.getElementById('payCancelBtn')?.addEventListener('click', closePaymentModal);
  document.getElementById('payConfirmBtn')?.addEventListener('click', confirmPayment);
  document.getElementById('paymentModal')?.addEventListener('click', function (e) {
    if (e.target === this) closePaymentModal();
  });

  document.getElementById('payAmountInput')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirmPayment();
  });



  // ─── NEW: Debt View Toggle & Date Filter ──────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.view-btn').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = '#0B5394';
      b.classList.remove('active');
    });
    this.style.background = '#117594';
    this.style.color = '#fff';
    this.classList.add('active');
    debtViewMode = this.dataset.view;
    renderDebtTable();
  });
});

document.getElementById('debtDateApply')?.addEventListener('click', function() {
  const from = document.getElementById('debtDateFrom').value;
  const to = document.getElementById('debtDateTo').value;
  debtDateFrom = from || null;
  debtDateTo = to || null;
  loadDebts();
});

document.getElementById('debtDateReset')?.addEventListener('click', function() {
  document.getElementById('debtDateFrom').value = '';
  document.getElementById('debtDateTo').value = '';
  debtDateFrom = null;
  debtDateTo = null;
  loadDebts();
});


  // Shift Modal Controls
  const shiftModal = document.getElementById('shiftModal');
  const shiftCancel = document.getElementById('shiftCancelBtn');
  const shiftConfirm = document.getElementById('shiftConfirmBtn');

  if (shiftCancel) {
    shiftCancel.addEventListener('click', () => {
      shiftModal.style.display = 'none';
    });
  }

  if (shiftConfirm) {
    shiftConfirm.addEventListener('click', async () => {
      const shift = getCurrentShift();
      if (!shift) {
        await signOut(getAuth());
        sessionStorage.removeItem('kazmartUser');
        redirectWithTransition('pages/login.html');
        return;
      }

      const summary = await getShiftSummary(shift);
      if (!summary) {
        alert('Unable to compute shift summary.');
        return;
      }

      const isAdmin = S.user?.role && (S.user.role.toLowerCase() === 'admin');
      let closingCash = 0;

      if (!isAdmin) {
  // Validate closing cash
  const closingInput = document.getElementById('shiftClosingCash');
  const rawClosing = closingInput.value.trim();
  if (rawClosing === '') {
    alert('⚠️ Please enter the closing cash amount before ending shift.');
    closingInput.focus();
    return;
  }
  const closingCash = parseFloat(rawClosing);
  if (isNaN(closingCash) || closingCash < 0) {
    alert('⚠️ Please enter a valid positive number for closing cash.');
    closingInput.value = '';
    closingInput.focus();
    return;
  }

  // Validate Faida fields (mandatory for non‑admin)
  const lipaInput = document.getElementById('shiftFaidaLipa');
  const simuInput = document.getElementById('shiftFaidaSimu');
  const gesiInput = document.getElementById('shiftFaidaGesi');
  if (lipaInput.value.trim() === '' || simuInput.value.trim() === '' || gesiInput.value.trim() === '') {
    alert('⚠️ Please enter all Faida amounts (enter 0 if none).');
    return;
  }
  const faidaLipa = parseFloat(lipaInput.value) || 0;
  const faidaSimu = parseFloat(simuInput.value) || 0;
  const faidaGesi = parseFloat(gesiInput.value) || 0;
  if (faidaLipa < 0 || faidaSimu < 0 || faidaGesi < 0) {
    alert('⚠️ Faida amounts cannot be negative.');
    return;
  }

  const result = await endShift(closingCash, faidaLipa, faidaSimu, faidaGesi);
  console.log('Shift ended:', result);
} else {
  // Admin: fields are optional – read them, default to 0 if empty
  const faidaLipa = parseFloat(document.getElementById('shiftFaidaLipa').value) || 0;
  const faidaSimu = parseFloat(document.getElementById('shiftFaidaSimu').value) || 0;
  const faidaGesi = parseFloat(document.getElementById('shiftFaidaGesi').value) || 0;
  const result = await endShift(summary.expectedCash || 0, faidaLipa, faidaSimu, faidaGesi);
  console.log('Shift ended:', result);
}

await signOut(getAuth());
sessionStorage.removeItem('kazmartUser');
redirectWithTransition('pages/login.html');

    });
  }



  if (shiftModal) {
    shiftModal.addEventListener('click', (e) => {
      if (e.target === shiftModal) shiftModal.style.display = 'none';
    });
  }

  // Ensure cart panel is visible by default on POS page
  const cartPanel = document.getElementById('cart-panel');
  if (cartPanel) {
    cartPanel.style.display = 'flex';
  }

  // ============================================================
  // EDIT CORRECTION MODAL - Event Listeners
  // ============================================================
  const editModal = document.getElementById('editCorrectionModal');
  const editCancel = document.getElementById('editCorrCancel');
  const editSave = document.getElementById('editCorrSave');
  const editProduct = document.getElementById('editCorrProduct');
  const editQty = document.getElementById('editCorrQty');
  const editType = document.getElementById('editCorrType');

  if (editCancel) {
    editCancel.addEventListener('click', closeEditCorrectionModal);
  }

  if (editSave) {
    editSave.addEventListener('click', saveEditCorrectionItem);
  }

  if (editProduct) {
    editProduct.addEventListener('input', updateEditCorrPreview);
  }
  if (editQty) {
    editQty.addEventListener('input', updateEditCorrPreview);
  }
  if (editType) {
    editType.addEventListener('change', updateEditCorrPreview);
  }

  if (editModal) {
    editModal.addEventListener('click', function (e) {
      if (e.target === editModal) {
        closeEditCorrectionModal();
      }
    });
  }

  // ============================================================
  // MODAL POS - EVENT LISTENERS
  // ============================================================
  document.getElementById('modalCloseBtn')?.addEventListener('click', function () {
  modalClearUI(); // 👈 ADD THIS
  document.getElementById('productModal').style.display = 'none';
});

  document.getElementById('modalCancelBtn')?.addEventListener('click', function () {
  modalClearUI(); // 👈 ADD THIS
  document.getElementById('productModal').style.display = 'none';
});

  document.getElementById('modalAddBtn')?.addEventListener('click', modalAddToMiniCart);

  document.getElementById('modalAddAllBtn')?.addEventListener('click', modalAddAllToCart);

  document.getElementById('modalClearMiniCart')?.addEventListener('click', modalClearMiniCart);

  document.getElementById('modalProductSearch')?.addEventListener('input', searchModalProducts);

  document.getElementById('modalProductSearch')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && modalSelectedProduct) {
      modalAddToMiniCart();
      e.preventDefault();
    }
  });

  document.getElementById('modalCustomerSearch')?.addEventListener('input', function () {
    clearTimeout(modalCustTimer);
    const q = this.value.trim();
    const myTurn = ++modalCustTurn;
    if (!q) { modalResetCustomer(); document.getElementById('modalCustomerDropdown').style.display = 'none'; return; }
    modalCustTimer = setTimeout(async () => {
      const result = await window.api('searchCustomer', { query: q });
      if (myTurn !== modalCustTurn) return;
      renderModalCustDropdown(result.results || []);
    }, 400);
  });

  document.getElementById('productModal')?.addEventListener('click', function (e) {
  if (e.target === this) {
    modalClearUI(); // 👈 ADD THIS
    this.style.display = 'none';
  }
});

  document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('productModal');
    if (modal && modal.style.display === 'flex') {
      if (e.key === 'Escape') modal.style.display = 'none';
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active && (active.id === 'modalQty' || active.id === 'modalDiscount')) {
          modalAddToMiniCart();
          e.preventDefault();
        }
      }
    }
  });

  // ============================================================
  // RESET SINGLE CUSTOMER – SEARCH DROPDOWN EVENT LISTENERS
  // ============================================================
  let resetSearchTimer = null;
  const resetSingleSearch = document.getElementById('resetSingleSearch');
  const resetSingleDropdown = document.getElementById('resetSingleDropdown');
  const resetSingleBtn = document.getElementById('resetSingleBtn');

  if (resetSingleSearch) {
    resetSingleSearch.addEventListener('input', function() {
      clearTimeout(resetSearchTimer);
      const query = this.value.trim();
      if (!query) {
        if (resetSingleDropdown) resetSingleDropdown.style.display = 'none';
        selectedResetCustomer = null;
        return;
      }
      resetSearchTimer = setTimeout(() => searchResetCustomers(query), 300);
    });

    resetSingleSearch.addEventListener('keydown', async function(e) {
      if (e.key === 'Enter') {
        if (selectedResetCustomer) {
          if (resetSingleBtn) resetSingleBtn.click();
        } else {
          const val = this.value.trim();
          if (val) {
            if (val.startsWith('KM-')) {
              await resetCustomerDebt(val, true);
              this.value = '';
              if (resetSingleDropdown) {
                resetSingleDropdown.style.display = 'none';
              }
              selectedResetCustomer = null;
            } else {
              alert('Please select a customer from the dropdown first.');
            }
          }
        }
      }
    });
  }

  if (resetSingleBtn) {
    resetSingleBtn.addEventListener('click', async function() {
      if (!selectedResetCustomer) {
        alert('Please select a customer from the search results.');
        return;
      }
      await resetCustomerDebt(selectedResetCustomer.cardNumber, true);
      if (resetSingleSearch) {
        resetSingleSearch.value = '';
      }
      if (resetSingleDropdown) {
        resetSingleDropdown.style.display = 'none';
      }
      selectedResetCustomer = null;
    });
  }

  document.addEventListener('click', function(e) {
    const container = resetSingleSearch?.parentElement;
    if (container && !container.contains(e.target)) {
      if (resetSingleDropdown) resetSingleDropdown.style.display = 'none';
    }
  });

  // ─── Logout Options Modal ──────────────────────────────────
  const logoutModal = document.getElementById('logoutOptionsModal');
  const logoutLogout = document.getElementById('logoutOptionLogout');
  const logoutEndShift = document.getElementById('logoutOptionEndShift');
  const logoutCancel = document.getElementById('logoutOptionCancel');

  logoutCancel.addEventListener('click', function() {
    logoutModal.style.display = 'none';
  });

  logoutLogout.addEventListener('click', function() {
    showConfirmation(
      '🚪 Log Out?',
      'Are you sure you want to log out? Your shift will remain active.',
      function() {
        signOut(getAuth()).then(() => {
          sessionStorage.removeItem('kazmartUser');
          logoutModal.style.display = 'none';
          redirectWithTransition('pages/login.html');
        });
      }
    );
  });

  logoutEndShift.addEventListener('click', async function() {
    const isAdmin = S.user?.role && (S.user.role.toLowerCase() === 'admin');
    const shift = getCurrentShift();

    const confirmMessage = isAdmin
      ? '⚠️ End Shift?'
      : '⚠️ End Shift & Log Out?';
    const confirmSub = isAdmin
      ? 'This will close the shift and log you out.'
      : 'This will close the shift and log you out. Opening cash will be required on next login.';

    showConfirmation(confirmMessage, confirmSub, async function() {
      if (!shift) {
        await signOut(getAuth());
        sessionStorage.removeItem('kazmartUser');
        redirectWithTransition('pages/login.html');
        return;
      }

      const summary = await getShiftSummary(shift);
      if (summary) {
        document.getElementById('shiftStartTime').textContent = new Date(summary.startTime).toLocaleString();
        document.getElementById('shiftOpeningCash').textContent = fmt(summary.openingCash);
        document.getElementById('shiftTotalSales').textContent = fmt(summary.totalSales);
        document.getElementById('shiftCashIn').textContent = fmt(summary.totalCashIn);
        document.getElementById('shiftCashOut').textContent = fmt(summary.totalCashOut);
        document.getElementById('shiftNetCash').textContent = fmt(summary.netCashFlow);
        document.getElementById('shiftExpectedCash').textContent = fmt(summary.expectedCash);

        const closingCashRow = document.getElementById('closingCashRow');
        if (closingCashRow) {
          closingCashRow.style.display = isAdmin ? 'none' : 'block';
        }
        document.getElementById('shiftClosingCash').value = '';

        logoutModal.style.display = 'none';
        document.getElementById('shiftModal').style.display = 'flex';
      } else {
        await signOut(getAuth());
        sessionStorage.removeItem('kazmartUser');
        redirectWithTransition('pages/login.html');
      }
    });
  });

  // ─── Analytics / Reports Page Filters ─────────────────────
  const reportsView = document.getElementById('reportsView');
  if (reportsView) {
    // 1. Period buttons
    document.querySelectorAll('.analytics-period-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.analytics-period-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        analyticsFilters.period = this.dataset.period;
        analyticsFilters.startDate = null;
        analyticsFilters.endDate = null;
        document.getElementById('analyticsStartDate').value = '';
        document.getElementById('analyticsEndDate').value = '';

        if (currentAnalyticsTab === 'summary') {
          loadAnalyticsData();
        } else if (currentAnalyticsTab === 'sales') {
          loadSalesData();
        } else if (currentAnalyticsTab === 'stock') {
          loadAnalyticsStockData();
        }
      });
    });

    // 2. Apply custom date range
    document.getElementById('analyticsApply').addEventListener('click', function() {
      const start = document.getElementById('analyticsStartDate').value;
      const end = document.getElementById('analyticsEndDate').value;
      if (start && end) {
        analyticsFilters.startDate = start;
        analyticsFilters.endDate = end;
        analyticsFilters.period = 'custom';
        document.querySelectorAll('.analytics-period-btn').forEach(b => b.classList.remove('active'));

        if (currentAnalyticsTab === 'summary') {
          loadAnalyticsData();
        } else if (currentAnalyticsTab === 'sales') {
          loadSalesData();
        } else if (currentAnalyticsTab === 'stock') {
          loadAnalyticsStockData();
        }
      } else {
        alert('Please select both start and end dates.');
      }
    });

    // 3. Reset to today
    document.getElementById('analyticsReset').addEventListener('click', function() {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      document.getElementById('analyticsStartDate').value = `${yyyy}-${mm}-${dd}`;
      document.getElementById('analyticsEndDate').value = `${yyyy}-${mm}-${dd}`;

      analyticsFilters.period = 'today';
      analyticsFilters.startDate = null;
      analyticsFilters.endDate = null;

      document.querySelectorAll('.analytics-period-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.analytics-period-btn[data-period="today"]').classList.add('active');

      if (currentAnalyticsTab === 'summary') {
        loadAnalyticsData();
      } else if (currentAnalyticsTab === 'sales') {
        loadSalesData();
      } else if (currentAnalyticsTab === 'stock') {
        loadAnalyticsStockData();
      }
    });

    // 4. Product name search
    let productSearchTimer = null;
    document.getElementById('analyticsProductSearch').addEventListener('input', function() {
      clearTimeout(productSearchTimer);
      productSearchTimer = setTimeout(() => {
        analyticsFilters.productSearch = this.value.trim();
        loadAnalyticsData();
      }, 400);
    });

    // 5. Movement filter dropdown
    document.getElementById('analyticsMovementFilter').addEventListener('change', function() {
      analyticsFilters.movement = this.value;
      loadAnalyticsData();
    });

    // 6. Clear Filters button
    document.getElementById('analyticsClearFilters').addEventListener('click', function() {
      document.getElementById('analyticsProductSearch').value = '';
      analyticsFilters.productSearch = '';
      document.getElementById('analyticsMovementFilter').value = 'all';
      analyticsFilters.movement = 'all';
      analyticsFilters.period = 'today';
      analyticsFilters.startDate = null;
      analyticsFilters.endDate = null;
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      document.getElementById('analyticsStartDate').value = `${yyyy}-${mm}-${dd}`;
      document.getElementById('analyticsEndDate').value = `${yyyy}-${mm}-${dd}`;
      document.querySelectorAll('.analytics-period-btn').forEach(b => {
        b.style.background = '#fff';
        b.style.color = '#0B5394';
        b.style.border = '1px solid #DDE6EA';
      });
      const todayBtn = document.querySelector('.analytics-period-btn[data-period="today"]');
      if (todayBtn) {
        todayBtn.style.background = '#117594';
        todayBtn.style.color = '#fff';
        todayBtn.style.border = '1px solid #117594';
      }
      loadAnalyticsData();
    });
  }

  // ─── Analytics Tab Switching ──────────────────────────────
  const analyticsTabs = document.querySelectorAll('.analytics-tab');
  const analyticsPanels = {
    summary: document.getElementById('panel-summary'),
    sales: document.getElementById('panel-sales'),
    stock: document.getElementById('panel-stock'),
    cash: document.getElementById('panel-cash'),
    debts: document.getElementById('panel-debts'),
    products: document.getElementById('panel-products'),
    'customer-analytics': document.getElementById('panel-customer-analytics')
  };

  analyticsTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      analyticsTabs.forEach(t => {
        t.style.background = 'transparent';
        t.style.color = '#0B5394';
      });
      this.style.background = '#117594';
      this.style.color = '#fff';

      Object.values(analyticsPanels).forEach(p => {
        if (p) p.style.display = 'none';
      });

      const tabName = this.dataset.tab;
      currentAnalyticsTab = tabName;

      const panel = analyticsPanels[tabName];
      if (panel) {
        panel.style.display = tabName === 'summary' ? 'block' : 'flex';
        if (tabName === 'summary') {
          loadAnalyticsData();
        } else if (tabName === 'sales') {
          loadSalesData();
        } else if (tabName === 'stock') {
          loadAnalyticsStockData();
        } else if (tabName === 'cash') {
          loadCashData();
        } else if (tabName === 'debts') {
          console.log('✅ Debts tab clicked – calling loadAnalyticsDebtsData()');
          const panel = document.getElementById('panel-debts');
          if (panel) panel.style.display = 'flex';
          setTimeout(() => loadAnalyticsDebtsData(), 50);
        } else if (tabName === 'products') {
          console.log('✅ Products tab clicked – calling loadAnalyticsProductsData()');
          const panel = document.getElementById('panel-products');
          if (panel) panel.style.display = 'flex';
          setTimeout(() => loadAnalyticsProductsData(), 50);
        } else if (tabName === 'customer-analytics') {
          console.log('✅ Customer Analytics tab clicked – calling loadAnalyticsCustomerData()');
          const panel = document.getElementById('panel-customer-analytics');
          if (panel) panel.style.display = 'flex';
          setTimeout(() => loadAnalyticsCustomerData(), 50);
        }
      }
    });
  });

  // ─── Stock Tab Individual Search Listeners ────────────────
  document.getElementById('stockSearchInput')?.addEventListener('input', function() {
    loadAnalyticsStockData();
  });

  document.getElementById('stockInSearchInput')?.addEventListener('input', function() {
    loadAnalyticsStockData();
  });

  document.getElementById('correctionSearchInput')?.addEventListener('input', function() {
    loadAnalyticsStockData();
  });

  // ─── Cash Tab Search Listener ────────────────────────────
  const cashSearchInput = document.getElementById('cashSearchInput');
  if (cashSearchInput) {
    cashSearchInput.addEventListener('input', function() {
      loadCashData();
    });
  }

  // ─── Debts Tab Search Listener ────────────────────────────
  document.getElementById('analyticsDebtsSearchInput')?.addEventListener('input', function() {
    loadAnalyticsDebtsData();
  });

  // ─── Products Tab Search Listener ──────────────────────────
  document.getElementById('analyticsProductsSearchInput')?.addEventListener('input', function() {
    loadAnalyticsProductsData();
  });

  console.log('✅ App initialized!');
}

  // ─── Periodic auto‑refresh (every 30 seconds) ──────────────
  setInterval(async () => {
    if (!document.hidden) {
      await refreshAll();
    }
  }, 30000);

// ============================
// CLOCK
// ============================

function updateClock() {
  const now = new Date();
  const el = document.getElementById('clockDisplay');
  if (el) el.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
updateClock();
setInterval(updateClock, 1000);

// ============================
// LOAD COMPONENTS
// ============================

async function loadComponent(selector, path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    const html = await res.text();
    const el = document.querySelector(selector);
    if (el) {
      el.innerHTML = html;
      console.log(`✅ Loaded: ${path}`);
    } else {
      console.warn(`⚠️ Element not found: ${selector}`);
    }
  } catch (err) {
    console.error('Error loading component:', err);
    const el = document.querySelector(selector);
    if (el) {
      el.innerHTML = `<p style="color:red;">Error loading ${path}</p>`;
    }
  }
}


// ============================================================
// WINDOW.API – Replace all AppScript API calls with Firebase
// ============================================================

window.api = async function (action, params) {
  params = params || {};
  console.log('📤 API CALL (Firebase):', action, params);

  try {
    switch (action) {

      // ---------- CUSTOMERS ----------
      case 'searchCustomer':
        return await handleSearchCustomer(params.query);

      case 'registerCustomer':
        return await handleRegisterCustomer(params.name, params.phone, params.email);

      case 'getCustomerByCard':
        return await handleGetCustomerByCard(params.cardNumber);

      // ---------- CASH ----------
      case 'getCashCategories':
        return await handleGetCashCategories();

      case 'recordCashMovement':
        return await handleRecordCashMovement(params.categoryName, params.itemName, params.amount, params.notes, params.direction);

      case 'getTodayCashMovements':
        return await handleGetTodayCashMovements();

      // ---------- DEBTS ----------
      case 'getDebts':
        return await handleGetDebts();

      case 'recordDebtPayment':
        return await handleRecordDebtPayment(params.debtId, params.amount);


      default:
        console.warn('⚠️ Unknown API action:', action);
        return { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    console.error('❌ API Error:', err);
    return { success: false, message: err.message };
  }
};

// ============================================================
// CUSTOMER HANDLERS
// ============================================================

async function handleSearchCustomer(searchTerm) {
  try {
    if (!searchTerm || searchTerm.length < 1) return { success: true, results: [] };

    const term = searchTerm.toLowerCase().trim();

    // Pull all customers once, then filter locally for "contains anywhere" matching
    const snap = await getDocs(collection(db, 'customers'));
    const allCustomers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const results = allCustomers.filter(c => {
      const name = (c.customerName || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const card = (c.cardNumber || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || card.includes(term);
    });

    return { success: true, results };
  } catch (err) {
    console.error('searchCustomer error:', err);
    return { success: false, message: err.message };
  }
}

async function handleRegisterCustomer(name, phone, email) {
  try {
    // Reference to the counter document
    const counterRef = doc(db, 'counters', 'customerCounter');

    let newNumber;
    // Run a transaction to safely increment the counter
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        // If counter doesn't exist, start at 1
        transaction.set(counterRef, { count: 1 });
        newNumber = 1;
      } else {
        const currentCount = counterDoc.data().count || 0;
        newNumber = currentCount + 1;
        transaction.update(counterRef, { count: newNumber });
      }
    });

    // ✅ CHANGED: 4 digits instead of 6 (KM-0001, KM-0002, etc.)
    const cardNumber = 'KM-' + String(newNumber).padStart(4, '0');

    // Save the customer
    const docRef = await addDoc(collection(db, 'customers'), {
      customerName: name,
      phone: phone,
      email: email || '',
      cardNumber: cardNumber,
      loyaltyPoints: 0,
      totalDebt: 0,
      status: 'Active',
      createdAt: new Date().toISOString()
    });

    return { success: true, cardNumber };
  } catch (err) {
    console.error('Register error:', err);
    return { success: false, message: err.message };
  }
}


async function handleGetCustomerByCard(cardNumber) {
  try {
    const q = query(collection(db, 'customers'), where('cardNumber', '==', cardNumber));
    const snap = await getDocs(q);
    if (snap.empty) return { success: false, message: 'Customer not found' };
    const doc = snap.docs[0];
    return { success: true, customer: { id: doc.id, ...doc.data() } };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ============================================================
// CASH HANDLERS
// ============================================================

async function handleGetCashCategories() {
  try {
    const snap = await getDocs(collection(db, 'cashCategories'));
    const categories = {};
    snap.forEach(doc => {
      const data = doc.data();
      const catName = data.category || doc.id;
      categories[catName] = {
        displayName: data.displayName || catName,
        items: data.items || [], // each item: { name, displayName, flow }
      };
    });
    return { success: true, categories };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function handleRecordCashMovement(categoryName, itemName, amount, notes, direction) {
  try {
    await addDoc(collection(db, 'cashTransactions'), {
      category: categoryName,
      item: itemName,
      amount: Math.abs(amount),
      direction: direction || 'Out',  // ✅ Default to Out
      notes: notes || '',
      userId: S.user?.id || 'unknown',
      createdAt: new Date().toISOString()
    });
    return { success: true, message: 'Cash movement recorded' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}
async function handleGetTodayCashMovements() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'cashTransactions'),
      where('createdAt', '>=', today),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let totalIn = 0, totalOut = 0;
    movements.forEach(m => {
      if (m.direction === 'In') totalIn += m.amount;
      else if (m.direction === 'Out') totalOut += m.amount;
    });
    return {
      success: true,
      movements,
      totalIn,
      totalOut,
      netBalance: totalIn - totalOut
    };
  } catch (err) {
    console.error('getTodayCashMovements error:', err);
    return { success: false, message: err.message };
  }
}

// ============================================================
// DEBT HANDLERS
// ============================================================

async function handleGetDebts() {
  try {
    const debtsSnap = await getDocs(collection(db, 'debts'));
    const debts = [];
    debtsSnap.forEach(doc => {
      const data = doc.data();
      // Safely parse dates: if it's a Timestamp, use toDate(); if string, new Date()
      let dueDate = data.dueDate;
      if (dueDate) {
        if (typeof dueDate === 'object' && dueDate.toDate) {
          dueDate = dueDate.toDate();
        } else if (typeof dueDate === 'string') {
          dueDate = new Date(dueDate);
        }
      }
      debts.push({ id: doc.id, ...data, dueDate: dueDate });
    });

    const custSnap = await getDocs(collection(db, 'customers'));
    const customerMap = {};
    custSnap.forEach(doc => {
      const data = doc.data();
      customerMap[doc.id] = data.customerName || 'Unknown';
    });

    const now = new Date();
    const enriched = debts.map(d => {
      let daysOverdue = 0;
      if (d.dueDate) {
        // d.dueDate is now a Date object
        daysOverdue = Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24)));
      }
      const status = d.status || 'Pending';
      return {
        ...d,
        customerName: customerMap[d.customerId] || 'Unknown',
        daysOverdue: daysOverdue,
        status: daysOverdue >= 7 ? 'Overdue' : status
      };
    });

    const totalOwed = enriched.reduce((sum, d) => sum + (d.balance || 0), 0);
    const activeDebts = enriched.filter(d => d.balance > 0).length;
    const overdueDebts = enriched.filter(d => d.daysOverdue >= 7);
    const overdueCount = overdueDebts.length;
    const overdueAmount = overdueDebts.reduce((sum, d) => sum + (d.balance || 0), 0);

    return {
      success: true,
      debts: enriched,
      summary: { totalOwed, activeDebts, overdueCount, overdueAmount }
    };
  } catch (err) {
    console.error('Error in handleGetDebts:', err);
    return { success: false, message: err.message };
  }
}

async function handleRecordDebtPayment(debtId, amount) {
  try {
    const debtRef = doc(db, 'debts', debtId);
    const debtSnap = await getDoc(debtRef);
    if (!debtSnap.exists()) return { success: false, message: 'Debt not found' };
    
    const debt = debtSnap.data();
    const currentBalance = debt.balance || 0;
    const currentPaid = debt.amountPaid || 0;
    const payment = Math.min(amount, currentBalance);
    const newBalance = Math.max(0, currentBalance - payment);
    const newPaid = currentPaid + payment;
    const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
    
    // Update debt
    await updateDoc(debtRef, {
      balance: newBalance,
      amountPaid: newPaid,
      status: newStatus,
      lastPaymentDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Update customer totalDebt
    if (debt.customerId) {
      const custRef = doc(db, 'customers', debt.customerId);
      await updateDoc(custRef, { totalDebt: increment(-payment) });
    }

    // ── Record payment with sequential ID ──
    const paymentId = await generatePaymentId();
    const paymentRef = doc(db, 'payments', paymentId);
    await setDoc(paymentRef, {
      paymentId: paymentId,
      debtId: debtId,
      customerId: debt.customerId,
      cardNumber: debt.cardNumber || '',
      customerName: debt.customerName || '',
      amount: payment,
      previousBalance: currentBalance,
      newBalance: newBalance,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'Cash',
      paymentType: 'Debt Payment',
      receivedBy: S.user?.id || 'unknown',
      remarks: 'Debt payment'
    });

    return { 
      success: true, 
      message: `Payment of ${fmt(payment)} recorded. Remaining balance: ${fmt(newBalance)}`,
      newBalance: newBalance,
      status: newStatus
    };
  } catch (err) {
    console.error('Error recording debt payment:', err);
    return { success: false, message: err.message };
  }
}

// ============================================================
// SHIFT MANAGEMENT (with Firestore persistence)
// ============================================================

// Start a new shift
async function startShift(openingCash) {
  const shiftId = 'shift_' + Date.now();
  const shiftData = {
    id: shiftId,
    startTime: new Date().toISOString(),
    openingCash: openingCash || 0,
    active: true,
    userID: S.user?.id || 'unknown',
    username: S.user?.name || S.user?.fullName || 'unknown'
  };
  // Save to Firestore
  await setDoc(doc(db, 'shifts', shiftId), shiftData);
  // Also keep in localStorage for quick access
  localStorage.setItem('kazmartShift', JSON.stringify({ ...shiftData, active: true }));
  console.log('🕒 Shift started and saved to Firestore:', shiftData);
}

// Get current shift data
function getCurrentShift() {
  const raw = localStorage.getItem('kazmartShift');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.active) return null;
    return data;
  } catch {
    return null;
  }
}

// End shift (updates Firestore and clears localStorage)
// End shift (updates Firestore and clears localStorage)

async function endShift(closingCash, faidaLipa = 0, faidaSimu = 0, faidaGesi = 0) {
  const shift = getCurrentShift();
  if (!shift) return null;
  const summary = await getShiftSummary(shift);
  const shiftRef = doc(db, 'shifts', shift.id);

  const shiftData = {
    endTime: new Date().toISOString(),
    closingCash: closingCash,
    expectedCash: summary.expectedCash,
    active: false,
    totalSales: summary.totalSales,
    totalCashIn: summary.totalCashIn,
    totalCashOut: summary.totalCashOut,
    netCashFlow: summary.netCashFlow,
    faidaLipa: faidaLipa,
    faidaSimu: faidaSimu,
    faidaGesi: faidaGesi
  };

  const shiftSnap = await getDoc(shiftRef);
  if (!shiftSnap.exists()) {
    await setDoc(shiftRef, {
      id: shift.id,
      startTime: shift.startTime,
      openingCash: shift.openingCash || 0,
      userID: shift.userID || 'unknown',
      username: shift.username || 'unknown',
      ...shiftData
    });
  } else {
    await updateDoc(shiftRef, shiftData);
  }

  localStorage.removeItem('kazmartShift');
  return { ...summary, closingCash, faidaLipa, faidaSimu, faidaGesi };
}



// Compute summary (sales + cash movements since shift started)
async function getShiftSummary(shiftData) {
  if (!shiftData) return null;
  const startTime = shiftData.startTime;

  // 1. Sales
  const salesQuery = query(
    collection(db, 'sales'),
    where('saleDate', '>=', startTime)
  );
  const salesSnap = await getDocs(salesQuery);
  let totalSales = 0;
  salesSnap.forEach(doc => {
    totalSales += doc.data().totalAmount || 0;
  });

  // 2. Cash Movements
  const cashQuery = query(
    collection(db, 'cashTransactions'),
    where('createdAt', '>=', startTime)
  );
  const cashSnap = await getDocs(cashQuery);
  let totalCashIn = 0, totalCashOut = 0;
  cashSnap.forEach(doc => {
    const data = doc.data();
    if (data.direction === 'In') totalCashIn += data.amount || 0;
    else if (data.direction === 'Out') totalCashOut += data.amount || 0;
  });

  const openingCash = shiftData.openingCash || 0;
  const netCashFlow = totalCashIn - totalCashOut;
  const expectedCash = openingCash + totalSales + netCashFlow;

  return {
    shiftId: shiftData.id,
    startTime: shiftData.startTime,
    openingCash,
    totalSales,
    totalCashIn,
    totalCashOut,
    netCashFlow,
    expectedCash
  };
}

// ============================================================
// CUSTOMER FUNCTIONS (UI)
// ============================================================

function assignCust(c) {
  const customer = {
    id: c.id,
    cardNumber: c.cardNumber || 'KM-0000',
    customerName: c.customerName || 'Guest',
    phone: c.phone || '',
    pointsBalance: c.loyaltyPoints || c.pointsBalance || c.points || 0,
    totalDebt: c.totalDebt || 0,
    status: c.status || 'Active',
    lastVisit: c.lastVisit || null,
    totalAmountSpent: c.totalAmountSpent || 0,
    totalPointsEarned: c.totalPointsEarned || 0,
    totalPointsRedeemed: c.totalPointsRedeemed || 0
  };

  S.customer = customer;

  // Reset used loyalty points and clear the input
S.loyaltyPointsUsed = 0;
const loyalInput = document.getElementById('loyalInput');
if (loyalInput) loyalInput.value = 0;

  // ── Update Customer Info Strip ──
  const custInfoEl = document.getElementById('custInfo');
  if (custInfoEl) custInfoEl.classList.add('show');

  const custNameEl = document.getElementById('custNameEl');
  if (custNameEl) custNameEl.textContent = customer.customerName;

  const custMetaEl = document.getElementById('custMeta');
  if (custMetaEl) custMetaEl.textContent = customer.cardNumber + ' · ' + customer.pointsBalance + ' pts · Debt: ' + fmt(customer.totalDebt);

  const loyalBalEl = document.getElementById('loyalBal');
  if (loyalBalEl) loyalBalEl.textContent = customer.pointsBalance + ' pts';

  // ── Handle Customer Status (Blacklisted, Debt, etc.) ──
  const alertEl = document.getElementById('custAlert');
  const loyalInputEl = document.getElementById('loyalInput');
  const ptDebtEl = document.getElementById('ptDebt');
  const ptPartEl = document.getElementById('ptPart');

  if (customer.status === 'Blacklisted') {
    if (alertEl) {
      alertEl.className = 'cust-alert black';
      alertEl.textContent = '⛔ Blacklisted — cash only';
    }
    if (loyalInputEl) loyalInputEl.disabled = true;
    if (ptDebtEl) ptDebtEl.disabled = true;
    if (ptPartEl) ptPartEl.disabled = true;
    setPayType('Full Paid');
  } else if (customer.totalDebt > 0) {
    if (alertEl) {
      alertEl.className = 'cust-alert debt';
      alertEl.textContent = '⚠️ Outstanding debt: ' + fmt(customer.totalDebt);
    }
    if (loyalInputEl) loyalInputEl.disabled = false;
    if (ptDebtEl) ptDebtEl.disabled = false;
    if (ptPartEl) ptPartEl.disabled = false;
  } else {
    if (alertEl) alertEl.className = 'cust-alert';
    if (loyalInputEl) loyalInputEl.disabled = false;
    if (ptDebtEl) ptDebtEl.disabled = false;
    if (ptPartEl) ptPartEl.disabled = false;
  }

  

  // ── Populate Customer Summary Ribbon ──
  const summaryEl = document.getElementById('customerSummary');
  if (summaryEl) {
    summaryEl.style.display = 'block';
    document.getElementById('sumCustomerName').textContent = customer.customerName;
    document.getElementById('sumTotalSpent').textContent = fmt(customer.totalAmountSpent || 0);
    document.getElementById('sumPointsBalance').textContent = customer.pointsBalance || 0;
    document.getElementById('sumTotalDebt').textContent = fmt(customer.totalDebt || 0);
    document.getElementById('sumPointsEarned').textContent = customer.totalPointsEarned || 0;
    document.getElementById('sumPointsRedeemed').textContent = customer.totalPointsRedeemed || 0;
    
    const debt = customer.totalDebt || 0;
    const totalSpent = customer.totalAmountSpent || 0;
    let repaidPct = 0;
    if (debt > 0 && totalSpent > 0) {
      const repaid = Math.max(0, totalSpent - debt);
      repaidPct = (repaid / (totalSpent + debt)) * 100;
      if (repaidPct > 100) repaidPct = 100;
    }
    document.getElementById('sumDebtRepaid').textContent = debt > 0 ? Math.round(repaidPct) + '%' : '✓ Clear';
  }

  // ===== NEW: Status, last visit, days since =====
  const statusEl = document.getElementById('sumStatus');
  if (statusEl) {
    const status = customer.status || 'Active';
    if (status === 'Blacklisted') {
      statusEl.textContent = '⛔ Blacklisted';
      statusEl.style.background = '#CC0000';
    } else if (status === 'Inactive') {
      statusEl.textContent = '⏸ Inactive';
      statusEl.style.background = '#B45309';
    } else {
      statusEl.textContent = '🟢 Active';
      statusEl.style.background = '#1E7B34';
    }
  }

  const lastVisit = customer.lastVisit ? new Date(customer.lastVisit) : null;
  const lastVisitEl = document.getElementById('sumLastVisit');
  const daysEl = document.getElementById('sumDaysSince');
  if (lastVisitEl) lastVisitEl.textContent = lastVisit ? lastVisit.toLocaleDateString('en-GB') : '—';
  if (daysEl) {
    if (lastVisit) {
      const days = Math.floor((Date.now() - lastVisit.getTime()) / (1000*60*60*24));
      daysEl.textContent = days + 'd';
    } else {
      daysEl.textContent = '—';
    }
  }

  // ===== Points value in TZS =====
  const pointsValueDisplay = document.getElementById('pointsValueDisplay');
  if (pointsValueDisplay) {
    const points = customer.pointsBalance || 0;
    const value = points * 1; // 1 point = 1 TZS – adjust if needed
    pointsValueDisplay.textContent = fmt(value);
  }
  
// Update loyalty display
updateLoyaltyDisplay();

  // ── Broadcast customer update to Customer View ──
  try {
    const channel = new BroadcastChannel('kazmart_pos');
    const cartData = {
      type: 'CART_UPDATE',
      items: S.cart.map(item => ({
        name: item.name,
        qty: item.qty,
        lineTotal: item.price * item.qty,
        price: item.price
      })),
      subtotal: S.cart.reduce((sum, item) => sum + item.price * item.qty, 0),
      total: S.cart.reduce((sum, item) => sum + item.price * item.qty, 0),
      discount: 0,
      loyaltyUsed: 0,
      customer: S.customer.customerName || 'Guest',
      cardNumber: S.customer.cardNumber || 'KM-0000',
      pointsBalance: S.customer.pointsBalance || 0,
      pointsRedeemed: 0,
      pointsEarned: 0,
      cashier: S.user?.name || S.user?.fullName || '—',
      totalDebt: S.customer.totalDebt || 0,
      lastVisit: S.customer.lastVisit || null,
      topTrends: [],
      saleComplete: false
    };
    channel.postMessage(cartData);
    console.log('📤 Sent customer update to Customer View');
  } catch (e) {
    // Ignore silently
  }

  // ===== NEW: Clear search input, hide dropdown and small info strip =====
  const searchInput = document.getElementById('customerSearch');
  if (searchInput) searchInput.value = '';
  const dropdown = document.getElementById('custDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const custInfo = document.getElementById('custInfo');
  if (custInfo) custInfo.classList.remove('show');
}

function resetCust() {
  S.customer = { cardNumber: 'KM-0000', customerName: 'Guest', pointsBalance: 0, totalDebt: 0, status: 'Active' };

  // Reset used loyalty points and clear the input
S.loyaltyPointsUsed = 0;
const loyalInput = document.getElementById('loyalInput');
if (loyalInput) loyalInput.value = 0;

  const custInfoEl = document.getElementById('custInfo');
  if (custInfoEl) custInfoEl.classList.remove('show');

  const alertEl = document.getElementById('custAlert');
  if (alertEl) alertEl.className = 'cust-alert';

  const loyalInputEl = document.getElementById('loyalInput');
  if (loyalInputEl) loyalInputEl.disabled = false;

  const ptDebtEl = document.getElementById('ptDebt');
  if (ptDebtEl) ptDebtEl.disabled = false;

  const ptPartEl = document.getElementById('ptPart');
  if (ptPartEl) ptPartEl.disabled = false;

  const loyalBalEl = document.getElementById('loyalBal');
  if (loyalBalEl) loyalBalEl.textContent = '0 pts';

  const pointsValueDisplay = document.getElementById('pointsValueDisplay');
  if (pointsValueDisplay) pointsValueDisplay.textContent = fmt(0);

  // ── Hide Customer Summary Ribbon ──
  const summaryEl = document.getElementById('customerSummary');
  if (summaryEl) summaryEl.style.display = 'none';

  // --- Clear search input ---
const searchInput = document.getElementById('customerSearch');
if (searchInput) searchInput.value = '';

// Update loyalty display
updateLoyaltyDisplay();
updateCartUI(); // 👈 ADD THIS – refreshes totals and removes loyalty discount

  // broadcastCart(); // TODO: function missing, re-add or remove
}

// ============================================================
// PRODUCT LOADING
// ============================================================

async function loadProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  grid.innerHTML = '<p style="color:#999;">Loading products...</p>';

  try {
    const productsRef = collection(db, 'products');
    const productSnap = await getDocs(productsRef);
    if (productSnap.empty) {
      grid.innerHTML = '<p style="color:#999;">No products found. Add some in Firestore.</p>';
      return;
    }

    const productList = [];
    productSnap.forEach(doc => {
      productList.push({ id: doc.id, ...doc.data() });
    });

    const invRef = collection(db, 'inventorySummary');
    const invSnap = await getDocs(invRef);
    const stockMap = {};
    const wacMap = {};
    invSnap.forEach(doc => {
      const data = doc.data();
      const pid = data.productId || doc.id;
      stockMap[pid] = data.quantity || data.currentStock || 0;
      wacMap[pid] = data.wac || 0;
    });

    S.products = productList.map(p => {
      let stock = 0;
      let wac = 0;
      if (stockMap[p.id] !== undefined) stock = stockMap[p.id];
      else if (p.sku && stockMap[p.sku] !== undefined) stock = stockMap[p.sku];
      if (wacMap[p.id] !== undefined) wac = wacMap[p.id];
      else if (p.sku && wacMap[p.sku] !== undefined) wac = wacMap[p.sku];

      // 👇 CALCULATE PROFIT AND MARGIN
      const sellingPrice = p.sellingPrice || 0;
      const profit = sellingPrice - wac;
      const profitPct = sellingPrice > 0 ? ((profit / sellingPrice) * 100) : 0;
      const stockStatus = stock <= 0 ? 'Out of Stock' : stock <= 5 ? 'Low Stock' : 'Active';

      return {
        ...p,
        stock: stock,
        wac: wac,
        name: p.productName || p.name || 'Unnamed',
        sellingPrice: sellingPrice,
        profit: profit,                    // 👈 ADDED
        profitPct: parseFloat(profitPct.toFixed(1)), // 👈 ADDED (rounded to 1 decimal)
        stockStatus: stockStatus           // 👈 ADDED (for movement type)
      };
    });

    renderProducts(getAvailableProducts());
renderCategories(getAvailableProducts());

  } catch (err) {
    console.error('Error loading products:', err);
    grid.innerHTML = '<p style="color:red;">Error loading products. Check console.</p>';
  }
}

// ============================
// RENDER PRODUCTS
// ============================

function renderProducts(products) {
   // Filter out zero stock (safety)
  products = products.filter(p => p.stock > 0);

  const grid = document.getElementById('productGrid');
  if (!grid) return;

  if (!products || !products.length) {
    grid.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:20px;">No products currently.</p>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const stock = p.stock || 0;
    const lowClass = stock <= 5 ? 'low-stock' : '';
    return `
      <div class="product-card" data-id="${p.id}" style="background:#fff; border-radius:10px; padding:12px 8px; border:1px solid ${stock <= 5 ? '#B45309' : '#DDE6EA'}; text-align:center; cursor:pointer; transition:all 0.15s; display:flex; flex-direction:column; align-items:center; min-height:90px; max-width:100%; box-sizing:border-box; position:relative;">
        ${p.bundleAvail ? '<span class="pbadge pbadge-b" style="position:absolute; top:4px; right:4px; font-size:7px; font-weight:700; padding:1px 5px; border-radius:8px; background:#EDE9FE; color:#5B21B6;">Bundle</span>' : ''}
        ${stock <= 5 && stock > 0 ? `<span class="pbadge pbadge-l" style="position:absolute; top:${p.bundleAvail ? '22px' : '4px'}; right:4px; font-size:7px; font-weight:700; padding:1px 5px; border-radius:8px; background:#FEF3C7; color:#B45309;">Low</span>` : ''}
        
        <!-- PRODUCT NAME -->
        <div style="font-weight:700; font-size:12px; color:#0B5394; line-height:1.3; margin-bottom:4px; min-height:32px; max-width:100%; word-break:break-word; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
          ${p.name}
        </div>
        
        <div style="color:#117594; font-size:14px; font-weight:800; margin-bottom:2px;">TZS ${(p.sellingPrice || 0).toLocaleString()}</div>
        <div style="color:#595959; font-size:10px; ${stock <= 5 ? 'color:#B45309; font-weight:700;' : ''}">Stock: ${stock}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.product-card').forEach((card, index) => {
    // Get product from filtered products list using index
    const product = products[index];
    if (!product) return;

    // Click event - open modal
    card.addEventListener('click', function () {
      const id = this.dataset.id;
      addToCart(id);
    });
  });
}


// ============================
// RENDER CATEGORIES
// ============================

function renderCategories(products) {
      const container = document.getElementById('categoryFilter');
      if (!container) return;

      const categories = ['All', ...new Set(products.map(p => p.category || 'General').filter(Boolean))];
      container.innerHTML = categories.map(cat => `
    <button class="cat-btn ${cat === 'All' ? 'active' : ''}" data-category="${cat}" style="padding:6px 18px; border-radius:20px; border:1.5px solid #DDE6EA; background:${cat === 'All' ? '#117594' : '#fff'}; color:${cat === 'All' ? '#fff' : '#0D5A70'}; cursor:pointer; font-weight:700; font-size:13px; font-family:inherit;">
      ${cat}
    </button>
  `).join('');

      container.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          container.querySelectorAll('.cat-btn').forEach(b => {
            b.style.background = '#fff';
            b.style.color = '#0D5A70';
            b.classList.remove('active');
          });
          this.style.background = '#117594';
          this.style.color = '#fff';
          this.classList.add('active');

          const category = this.dataset.category;
          const available = getAvailableProducts();
const filtered = category === 'All' 
  ? available 
  : available.filter(p => (p.category || 'General') === category);
renderProducts(filtered);
        });
      });
    }

// ============================
// CART FUNCTIONS
// ============================

window.addToCart = function (productId) {
      const product = S.products.find(p => p.id === productId);
if (!product) {
  console.warn('Product not found:', productId);
  return;
}
if (product.stock <= 0) {
  soundError();
  alert('This product is out of stock.');
  return;
}
      // Open the full modal with the selected product
      openModalWithProduct(product);
    };

  function updateCartUI() {
    const container = document.getElementById('cartItems');
    const subtotalEl = document.getElementById('cartSubtotal');
    const discountEl = document.getElementById('cartDiscount');
    const totalEl = document.getElementById('cartTotal');
    const countEl = document.getElementById('cartCount');
    const discountInput = document.getElementById('discountInput');

    if (!container) return;

    // --- Calculate subtotal with per‑item discounts ---
    let subtotal = 0;
    if (S.cart.length) {
      subtotal = S.cart.reduce((sum, item) => sum + (item.price * item.qty - (item.discount || 0)), 0);
    }

    // --- Get global discount value ---
           const globalDiscount = parseFloat(discountInput?.value) || 0;
    // --- Loyalty discount ---
    const loyaltyDiscount = (S.loyaltyPointsUsed || 0) * 1; // 1 point = 1 TZS
    const total = Math.max(0, subtotal - globalDiscount - loyaltyDiscount);

    // --- Update DOM ---
    if (!S.cart.length) {
      container.innerHTML = '<p style="color:#999; font-size:14px; font-weight:600; text-align:center; padding:20px;">Cart is empty</p>';
      if (subtotalEl) subtotalEl.textContent = 'TZS 0';
      if (discountEl) discountEl.textContent = 'TZS 0';
      if (!S.cart.length) {
  container.innerHTML = '<p style="color:#999; font-size:14px; font-weight:600; text-align:center; padding:20px;">Cart is empty</p>';
  if (subtotalEl) subtotalEl.textContent = 'TZS 0';
  if (discountEl) discountEl.textContent = 'TZS 0';
  // --- Reset loyalty discount ---
  const loyaltyDiscountEl = document.getElementById('cartLoyaltyDiscount');
  if (loyaltyDiscountEl) loyaltyDiscountEl.textContent = 'TZS 0';
  if (totalEl) totalEl.textContent = 'TZS 0';
  if (countEl) countEl.textContent = '0';
  return;
}
      if (totalEl) totalEl.textContent = 'TZS 0';
      if (countEl) countEl.textContent = '0';
      return;
    }

    // --- Render cart items with HORIZONTAL layout (all on one line) ---
    container.innerHTML = S.cart.map((item, index) => {
      const lineTotal = (item.price * item.qty) - (item.discount || 0);
      const displayTotal = lineTotal > 0 ? lineTotal : 0;
      const discountText = (item.discount && item.discount > 0)
        ? `<span style="font-size:11px; color:#CC0000; font-weight:700; margin-left:4px;">-${fmt(item.discount)}</span>`
        : '';
      return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0; gap:8px;">
        <span style="font-weight:800; font-size:15px; color:#0B5394; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
          <button class="qty-btn" data-index="${index}" data-delta="-1" style="width:30px; height:30px; border-radius:50%; border:1.5px solid #C9E8F3; background:#fff; color:#117594; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">−</button>
          <span style="font-size:16px; font-weight:800; color:#0B5394; min-width:30px; text-align:center;">${item.qty}</span>
          <button class="qty-btn" data-index="${index}" data-delta="1" style="width:30px; height:30px; border-radius:50%; border:1.5px solid #C9E8F3; background:#fff; color:#117594; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">+</button>
        </div>
        <span style="font-weight:800; font-size:15px; color:#117594; flex-shrink:0; white-space:nowrap;">TZS ${displayTotal.toLocaleString()}</span>
        ${discountText}
        <button class="remove-item" data-index="${index}" style="background:none; border:none; color:#CC0000; font-size:18px; font-weight:700; cursor:pointer; padding:0 4px; flex-shrink:0; transition:transform 0.1s;">✕</button>
      </div>
    `;
    }).join('');

    // --- Attach event listeners to quantity buttons and remove buttons ---
    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const index = parseInt(this.dataset.index);
        const delta = parseInt(this.dataset.delta);
        const newQty = S.cart[index].qty + delta;
        if (newQty >= 1) {
          S.cart[index].qty = newQty;
          updateCartUI();
        }
      });
    });

    container.querySelectorAll('.remove-item').forEach(btn => {
      btn.addEventListener('click', function () {
        const index = parseInt(this.dataset.index);
        S.cart.splice(index, 1);
        updateCartUI();
      });
    });

    // --- Update totals with enhanced styling ---
    if (subtotalEl) {
      subtotalEl.style.fontSize = '18px';
      subtotalEl.style.fontWeight = '700';
      subtotalEl.textContent = `TZS ${subtotal.toLocaleString()}`;
    }
    if (discountEl) {
      discountEl.style.fontSize = '16px';
      discountEl.style.fontWeight = '700';
      discountEl.textContent = globalDiscount > 0 ? `- TZS ${globalDiscount.toLocaleString()}` : 'TZS 0';
    }
// --- Update Loyalty Discount ---
const loyaltyDiscountEl = document.getElementById('cartLoyaltyDiscount');
if (loyaltyDiscountEl) {
  loyaltyDiscountEl.style.fontSize = '16px';
  loyaltyDiscountEl.style.fontWeight = '700';
  loyaltyDiscountEl.textContent = loyaltyDiscount > 0 ? `- TZS ${loyaltyDiscount.toLocaleString()}` : 'TZS 0';
}

    if (totalEl) {
      totalEl.style.fontSize = '24px';
      totalEl.style.fontWeight = '900';
      totalEl.style.color = '#0B5394';
      totalEl.textContent = `TZS ${total.toLocaleString()}`;
    }
    if (countEl) {
      countEl.style.fontSize = '16px';
      countEl.style.fontWeight = '700';
      countEl.textContent = S.cart.length;
    }

    // --- Update change display ---
    updateChange();

    // --- Broadcast cart updates to Customer View ---
    try {
      const channel = new BroadcastChannel('kazmart_pos');
      const cartData = {
        type: 'CART_UPDATE',
        items: S.cart.map(item => ({
          name: item.name,
          qty: item.qty,
          lineTotal: (item.price * item.qty) - (item.discount || 0),
          price: item.price,
          discount: item.discount || 0
        })),
        subtotal: subtotal,
        total: total,
        discount: globalDiscount,
        loyaltyUsed: 0,
        customer: S.customer.customerName || 'Guest',
        cardNumber: S.customer.cardNumber || 'KM-0000',
        pointsBalance: S.customer.pointsBalance || 0,
        pointsRedeemed: 0,
        pointsEarned: 0,
        cashier: S.user?.name || S.user?.fullName || '—',
        totalDebt: S.customer.totalDebt || 0,
        lastVisit: S.customer.lastVisit || null,
        topTrends: [],
        saleComplete: false
      };
      channel.postMessage(cartData);
    } catch (e) {
      // Ignore silently
    }
  }

  function updateLoyaltyDisplay() {
  const customer = S.customer;
  const available = customer?.pointsBalance || 0;
  const used = S.loyaltyPointsUsed || 0;
  const remaining = Math.max(0, available - used);

  // Update the label next to the input
  const loyalBalEl = document.getElementById('loyalBal');
  if (loyalBalEl) loyalBalEl.textContent = remaining + ' pts';

  // Update the points balance in the dark ribbon
  const sumPointsEl = document.getElementById('sumPointsBalance');
  if (sumPointsEl) sumPointsEl.textContent = remaining;

  // Update the "Points Available (TZS)" row
  const pointsValueDisplay = document.getElementById('pointsValueDisplay');
  if (pointsValueDisplay) {
    const rate = 1; // 1 point = 1 TZS (adjust if needed)
    pointsValueDisplay.textContent = fmt(remaining * rate);
  }
}

  // ============================================================
  // UPDATE CHANGE DISPLAY
  // ============================================================

  function updateChange() {
  const subtotal = S.cart.reduce((sum, item) => sum + (item.price * item.qty - (item.discount || 0)), 0);
  const globalDiscount = parseFloat(document.getElementById('discountInput')?.value) || 0;
  const loyaltyDiscount = (S.loyaltyPointsUsed || 0) * 1; // 1 point = 1 TZS
  const total = Math.max(0, subtotal - globalDiscount - loyaltyDiscount);
  const cash = parseFloat(document.getElementById('cashReceived')?.value) || 0;
  const change = Math.max(0, cash - total);
  const changeEl = document.getElementById('changeDisplay');
  if (changeEl) changeEl.textContent = `TZS ${change.toLocaleString()}`;
}

  // ============================================================
  // QUICK CASH AMOUNT
  // ============================================================

  function setQuickCash(amount) {
    const input = document.getElementById('cashReceived');
    if (input) {
      input.value = amount;
      updateChange();
    }
  }
  window.setQuickCash = setQuickCash;

// ============================================================
// LOADING OVERLAY
// ============================================================

function showLoading(message = 'Processing...', subtext = null) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'flex';

    const titleEl = document.getElementById('loadingOverlayTitle');
    if (titleEl) titleEl.textContent = message;

    const subEl = document.getElementById('loadingOverlaySubtext');
    if (subEl) {
      if (subtext) {
        subEl.textContent = subtext;
        subEl.style.display = 'block';
      } else {
        subEl.textContent = '';
        subEl.style.display = 'none';
      }
    }
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    // Clear subtext when hiding
    const subEl = overlay.querySelector('div:last-child div:last-child');
    if (subEl) {
      subEl.textContent = '';
      subEl.style.display = 'none';
    }
  }
}  

  // ============================================================
  // MODAL POS - MINI-CART BUILDER
  // ============================================================

  let modalSelectedProduct = null;
  let modalMiniCart = [];

  // ── OPEN MODAL ──────────────────────────────────────────────
  function openModalWithProduct(product) {
      modalClearUI(); // 👈 ADD THIS
    modalSelectedProduct = product;
    document.getElementById('modalSelectedName').textContent = product.name;
    document.getElementById('modalSelectedPrice').textContent = fmt(product.sellingPrice);
    document.getElementById('modalSelectedStock').textContent = 'Stock: ' + product.stock;
    document.getElementById('modalSelectedProduct').style.display = 'block';
    document.getElementById('modalAddSection').style.display = 'flex';
    document.getElementById('modalQty').value = 1;
    document.getElementById('modalDiscount').value = 0;
    document.getElementById('modalSearchResults').style.display = 'none';

    // Bundle
    const bundleRow = document.getElementById('modalBundleRow');
    if (product.bundleAvail && product.bundleSize > 0) {
      bundleRow.style.display = 'block';
    } else {
      bundleRow.style.display = 'none';
    }

    document.getElementById('productModal').style.display = 'flex';
    renderModalMiniCart();
  }

  // ============================================================
  // MODAL: ADD TO CART (from modal popup)
  // ============================================================

  function modalAddToCart() {
    if (!modalSelectedProduct) {
      alert('No product selected.');
      return;
    }

    const qty = parseFloat(document.getElementById('modalQty').value) || 1;
    const discount = parseFloat(document.getElementById('modalDiscount').value) || 0;
    const isBundle = document.getElementById('modalIsBundle').value === 'yes';

    // Calculate unit price (bundle or single)
    let unitPrice = modalSelectedProduct.sellingPrice;
    if (isBundle && modalSelectedProduct.bundlePrice) {
      unitPrice = modalSelectedProduct.bundlePrice;
    }

    // Check stock (bundle uses bundle size)
    const effectiveQty = isBundle ? qty * (modalSelectedProduct.bundleSize || 1) : qty;
    if (modalSelectedProduct.stock < effectiveQty) {
      soundError(); // 👈 Play error sound
      alert('Not enough stock. Available: ' + modalSelectedProduct.stock);
      return;
    }

    // Check if already in mini cart
    const existing = modalMiniCart.find(item => item.id === modalSelectedProduct.id && item.isBundle === isBundle);
    if (existing) {
      existing.qty += qty;
      existing.discount += discount;
    } else {
      modalMiniCart.push({
        id: modalSelectedProduct.id,
        name: modalSelectedProduct.name,
        price: unitPrice,
        qty: qty,
        discount: discount,
        isBundle: isBundle,
        bundleSize: modalSelectedProduct.bundleSize || 1
      });
    }

    // ============================================================
    // UPDATE UI & PLAY SOUND
    // ============================================================
    updateCartUI();              // Update main cart (on the right)
    soundAdd();                  // 👈 Play the "add" sound
    renderModalMiniCart();       // Update the mini cart inside modal
    updateModalTotals();         // Update modal totals
    updateModalChange();         // Update change display

    // Reset selection and close modal
    document.getElementById('modalSelectedProduct').style.display = 'none';
    document.getElementById('modalAddSection').style.display = 'none';
    document.getElementById('modalProductSearch').value = '';
    document.getElementById('modalSearchResults').style.display = 'none';
    document.getElementById('productModal').style.display = 'none';
    modalSelectedProduct = null;

    console.log('🛒 Cart after modal add:', S.cart);
  }


  // ── SEARCH PRODUCTS ─────────────────────────────────────────
  function searchModalProducts() {
    const q = document.getElementById('modalProductSearch').value.toLowerCase().trim();
    const container = document.getElementById('modalSearchResults');

    if (!q) {
      container.style.display = 'none';
      return;
    }

    const filtered = getAvailableProducts().filter(p => p.name.toLowerCase().includes(q));
    container.style.display = 'block';

    if (!filtered.length) {
      container.innerHTML = '<div style="text-align:center; padding:12px; color:#999; font-size:13px;">No products found</div>';
      return;
    }

    container.innerHTML = filtered.map(p => `
    <div class="modal-prod-item" data-id="${p.id}" style="display:flex; justify-content:space-between; padding:4px 8px; border-radius:4px; cursor:pointer; transition:background 0.1s;">
      <span style="font-weight:600; font-size:13px; color:#0B5394;">${p.name}</span>
      <span style="color:#117594; font-size:13px;">${fmt(p.sellingPrice)}</span>
      <span style="color:#999; font-size:11px;">Stock: ${p.stock}</span>
    </div>
  `).join('');

    container.querySelectorAll('.modal-prod-item').forEach(el => {
      el.addEventListener('click', function () {
        const id = this.dataset.id;
        const product = S.products.find(p => p.id === id);
        if (product) openModalWithProduct(product);
      });
      el.addEventListener('mouseenter', function () { this.style.background = '#EAF4F9'; });
      el.addEventListener('mouseleave', function () { this.style.background = ''; });
    });
  }

  // ── MODAL ADD TO MINI CART ──────────────────────────────────
  function modalAddToMiniCart() {
    if (!modalSelectedProduct) return;
    const qty = parseFloat(document.getElementById('modalQty').value) || 1;
    const discount = parseFloat(document.getElementById('modalDiscount').value) || 0;
    const isBundle = document.getElementById('modalIsBundle').value === 'yes';
    let unitPrice = modalSelectedProduct.sellingPrice;
    if (isBundle && modalSelectedProduct.bundlePrice) {
      unitPrice = modalSelectedProduct.bundlePrice;
    }
    const effectiveQty = isBundle ? qty * (modalSelectedProduct.bundleSize || 1) : qty;
    if (modalSelectedProduct.stock < effectiveQty) {
      alert('Not enough stock. Available: ' + modalSelectedProduct.stock);
      return;
    }

    // Check if already in mini cart
    const existing = modalMiniCart.find(item => item.id === modalSelectedProduct.id && item.isBundle === isBundle);
    if (existing) {
      existing.qty += qty;
      existing.discount += discount;
    } else {
      modalMiniCart.push({
        id: modalSelectedProduct.id,
        name: modalSelectedProduct.name,
        price: unitPrice,
        qty: qty,
        discount: discount,
        isBundle: isBundle,
        bundleSize: modalSelectedProduct.bundleSize || 1
      });
    }

    renderModalMiniCart();
    // Reset selection
    document.getElementById('modalSelectedProduct').style.display = 'none';
    document.getElementById('modalAddSection').style.display = 'none';
    document.getElementById('modalProductSearch').value = '';
    document.getElementById('modalSearchResults').style.display = 'none';
    modalSelectedProduct = null;
  }

  // ── RENDER MINI CART ────────────────────────────────────────
  function renderModalMiniCart() {
    const container = document.getElementById('modalMiniCartItems');
    const countEl = document.getElementById('modalMiniCartCount');
    const totalEl = document.getElementById('modalMiniTotal');

    countEl.textContent = modalMiniCart.length;

    if (!modalMiniCart.length) {
      container.innerHTML = '<div style="text-align:center; padding:16px; color:#999;">No items added yet</div>';
      totalEl.textContent = 'TZS 0';
      return;
    }

    let total = 0;
    container.innerHTML = modalMiniCart.map((item, index) => {
      const lineTotal = (item.price * item.qty) - (item.discount || 0);
      total += lineTotal;
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 4px; border-bottom:1px solid #f0f0f0; font-size:12px;">
        <span style="font-weight:600; color:#0B5394; flex:1;">${item.name}</span>
        <span style="color:#595959; margin:0 4px;">x${item.qty}</span>
        <span style="color:#117594; font-weight:700; margin:0 4px;">${fmt(lineTotal)}</span>
        <button onclick="modalRemoveFromMiniCart(${index})" style="background:none; border:none; color:#CC0000; cursor:pointer; font-size:14px; padding:0 4px;">✕</button>
      </div>
    `;
    }).join('');

    totalEl.textContent = fmt(total);
  }

  function modalRemoveFromMiniCart(index) {
    modalMiniCart.splice(index, 1);
    renderModalMiniCart();
  }

  // ── CLEAR MINI CART ─────────────────────────────────────────
  function modalClearMiniCart() {
    if (!modalMiniCart.length) return;
    if (confirm('Clear all items from mini cart?')) {
      modalMiniCart = [];
      renderModalMiniCart();
    }
  }

  /// ── ADD ALL TO MAIN CART ────────────────────────────────────
function modalAddAllToCart() {
  if (!modalMiniCart.length) {
    soundError();
    alert('Mini cart is empty.');
    return;
  }

  // Add all items from mini cart to main cart
  for (const item of modalMiniCart) {
    const existing = S.cart.find(c => c.id === item.id && c.isBundle === item.isBundle);
    if (existing) {
      existing.qty += item.qty;
      existing.discount += item.discount;
    } else {
      S.cart.push({ ...item });
    }
  }

  // Clear mini cart and close modal
  modalMiniCart = [];
  renderModalMiniCart();
  modalClearUI(); // 👈 ADD THIS
  document.getElementById('productModal').style.display = 'none';
  updateCartUI();
  console.log('🛒 All items added to main cart:', S.cart);
}

  // ── MODAL CUSTOMER SEARCH ──────────────────────────────────
  let modalCustTimer, modalCustTurn = 0, modalCustResults = [], modalCustHighlight = 0;

  function renderModalCustDropdown(list) {
    const box = document.getElementById('modalCustomerDropdown');
    modalCustResults = list;
    modalCustHighlight = 0;
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = list.map((c, i) => `
    <div class="modal-cust-item" data-i="${i}" style="padding:6px 10px; cursor:pointer; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; ${i === 0 ? 'background:#EAF4F9;' : ''}">
      <div><div style="font-weight:600; font-size:13px; color:#0B5394;">${c.customerName}</div>
      <div style="font-size:11px; color:#999;">${c.cardNumber || c.phone}</div></div>
      <span style="font-size:11px; color:${c.totalDebt > 0 ? '#CC0000' : '#1E7B34'}; font-weight:600;">${c.totalDebt > 0 ? 'Owes ' + fmt(c.totalDebt) : 'Clear'}</span>
    </div>
  `).join('');
    box.style.display = 'block';
    box.querySelectorAll('.modal-cust-item').forEach(item => {
      item.addEventListener('click', function () {
        const idx = parseInt(this.dataset.i);
        const c = modalCustResults[idx];
        if (c) modalAssignCustomer(c);
      });
    });
  }

  function modalAssignCustomer(c) {
    assignCust(c);

    const info = document.getElementById('modalCustomerInfo');
    info.style.display = 'block';
    document.getElementById('modalCustName').textContent = c.customerName || 'Guest';
    document.getElementById('modalCustCard').textContent = c.cardNumber || 'KM-0000';
    document.getElementById('modalCustPoints').textContent = c.loyaltyPoints || 0;
    document.getElementById('modalCustDebt').textContent = fmt(c.totalDebt || 0);

    const statusEl = document.getElementById('modalCustStatus');
    if (c.status === 'Blacklisted') {
      statusEl.textContent = '⛔ Blacklisted';
      statusEl.style.background = '#FEE2E2';
      statusEl.style.color = '#CC0000';
    } else {
      statusEl.textContent = '🟢 Active';
      statusEl.style.background = '#DCFCE7';
      statusEl.style.color = '#1E7B34';
    }

    const lastVisit = c.lastVisit ? new Date(c.lastVisit) : null;
    document.getElementById('modalCustLastVisit').textContent = lastVisit ? lastVisit.toLocaleDateString('en-GB') : '—';
    const daysSince = lastVisit ? Math.floor((Date.now() - lastVisit) / (1000 * 60 * 60 * 24)) : '—';
    document.getElementById('modalCustDays').textContent = daysSince + (daysSince !== '—' ? 'd' : '');

    const debtWarning = document.getElementById('modalCustDebtWarning');
    if ((c.totalDebt || 0) > 0 && c.status !== 'Blacklisted') {
      debtWarning.style.display = 'block';
    } else {
      debtWarning.style.display = 'none';
    }

    document.getElementById('modalCustomerDropdown').style.display = 'none';
    document.getElementById('modalCustomerSearch').value = c.cardNumber || '';
  }

  function modalResetCustomer() {
    document.getElementById('modalCustomerInfo').style.display = 'none';
    resetCust();
  }

  // ─── Clear Modal Customer UI ────────────────────────────────
function modalClearUI() {
  const searchInput = document.getElementById('modalCustomerSearch');
  if (searchInput) searchInput.value = '';
  
  const dropdown = document.getElementById('modalCustomerDropdown');
  if (dropdown) dropdown.style.display = 'none';
  
  const info = document.getElementById('modalCustomerInfo');
  if (info) info.style.display = 'none';
}

// ─── Close Quick Add Modal ──────────────────────────────────
function closeQuickAddModal() {
  modalClearUI();
  document.getElementById('productModal').style.display = 'none';
}

window.closeQuickAddModal = closeQuickAddModal;


  // ============================================================
  // REMOVE FROM CART
  // ============================================================

  window.removeFromCart = function (index) {
    S.cart.splice(index, 1);
    updateCartUI();
  };

  // ============================================================
  // SET PAYMENT TYPE
  // ============================================================

  function setPayType(type) {
    S.payType = type;
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.style.background = '#e0e0e0';
      btn.style.color = '#595959';
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.pay-btn[data-type="${type}"]`);
    if (activeBtn) {
      activeBtn.style.background = '#117594';
      activeBtn.style.color = '#fff';
      activeBtn.classList.add('active');
    }
  }

  // ============================================================
// COMPLETE SALE (with sequential transaction IDs & productId summary)
// ============================================================

async function completeSale() {
  if (!S.cart.length) {
    alert('Cart is empty.');
    return;
  }

  showLoading('Processing Sale...', 'Please wait while we record your sale.');

  // Notify Customer View that processing has started
  try {
    const channel = new BroadcastChannel('kazmart_pos');
    channel.postMessage({ type: 'PROCESSING_START' });
  } catch (e) {}

  const subtotal = S.cart.reduce((sum, item) => sum + (item.price * item.qty - (item.discount || 0)), 0);
  const globalDiscountInput = document.getElementById('discountInput');
  const globalDiscount = parseFloat(globalDiscountInput?.value) || 0;
  const totalDiscount = globalDiscount + S.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
  const total = Math.max(0, subtotal - globalDiscount);
  const cash = parseFloat(document.getElementById('cashReceived')?.value) || 0;
  const payType = S.payType;

  if (payType === 'Full Paid' && cash < total) {
    hideLoading();
    alert('Cash amount is less than total.');
    return;
  }

  const btn = document.getElementById('completeSale');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    // ─── Generate sequential sale ID ───
    const saleId = await generateSaleId();

    // ─── Sale data ───
    const saleData = {
      customerId: S.customer.id || null,
      cashierId: S.user?.id || 'unknown',
      saleDate: new Date().toISOString(),
      subtotal: subtotal,
      discount: totalDiscount,
      totalAmount: total,
      amountPaid: cash,
      balance: Math.max(0, total - cash),
      paymentMethod: payType,
      paymentStatus: payType === 'Full Paid' ? 'Paid' : 'Partial',
      grossProfit: 0,
      profitMargin: 0,
      saleId: saleId,
      loyaltyPointsEarned: Math.floor(total / 100),
      loyaltyPointsUsed: S.loyaltyPointsUsed || 0,
      loyaltyPointsBalance: (S.customer.pointsBalance || 0) + Math.floor(total / 100) - (S.loyaltyPointsUsed || 0)
    };

    const saleRef = doc(db, 'sales', saleId);
    await setDoc(saleRef, saleData);
    console.log('✅ Sale saved with ID:', saleId);

    let totalCost = 0;
    const batch = writeBatch(db);

    for (const item of S.cart) {
  // ── Get current stock & WAC directly ──
  const invRef = doc(db, 'inventorySummary', item.id);
  const invSnap = await getDoc(invRef);
  let costPrice = 0;
  let currentStock = 0;
  if (invSnap.exists()) {
    const invData = invSnap.data();
    costPrice = invData.wac || 0;
    currentStock = invData.quantity || 0;
  }

  // ─── Calculate total units (bundle or single) ──────────────
  const totalUnits = item.isBundle ? item.qty * (item.bundleSize || 1) : item.qty;
  const lineTotal = (item.price * item.qty) - (item.discount || 0);
  const lineCost = costPrice * totalUnits;
  totalCost += lineCost;

  // ─── Generate sequential sales item ID ───
  const itemId = await generateSalesItemId();
  const itemRef = doc(db, 'salesItems', itemId);
  await setDoc(itemRef, {
    itemId: itemId,
    saleId: saleId,
    productid: item.id,
    productName: item.name,
    quantity: totalUnits,
    sellingPrice: item.isBundle ? item.price / (item.bundleSize || 1) : item.price,
    costPrice: costPrice,
    discount: item.discount || 0,
    subtotal: lineTotal
  });

  // ─── Update inventory summary ────────────────────────────────
  const newQty = currentStock - totalUnits;
  if (invSnap.exists()) {
    batch.update(invRef, { quantity: newQty });
  } else {
    batch.set(invRef, { productId: item.id, quantity: newQty, wac: 0 });
  }

  // ─── Log inventory transaction with sequential ID ───────────
  const trxId = await generateTransactionId();
  const trxRef = doc(db, 'inventoryTransactions', trxId);
  batch.set(trxRef, {
    transactionId: trxId,
    productid: item.id,
    productName: item.name,
    quantity: totalUnits,
    transactionType: 'Sale',
    unitCost: costPrice,
    prevStock: currentStock,
    newStock: newQty,
    createdAt: new Date().toISOString(),
    createdBy: S.user?.id || 'unknown',
    referenceId: saleId,
    remarks: 'Sale transaction'
  });
}

    await batch.commit();

    // ─── Update sale with profit ───
    const grossProfit = subtotal - totalCost;
    const profitMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
    await updateDoc(saleRef, {
      grossProfit: grossProfit,
      profitMargin: profitMargin
    });

    // ─── Update customer loyalty ───
    if (S.customer.id && S.customer.id !== 'KM-0000') {
      const custRef = doc(db, 'customers', S.customer.id);
      const pointsEarned = Math.floor(total / 100);
      const pointsUsed = S.loyaltyPointsUsed || 0;
      const netPoints = pointsEarned - pointsUsed;
      await updateDoc(custRef, {
        loyaltyPoints: increment(netPoints)
      });
    }

    // ─── Create debt if balance > 0 ───
    const balance = Math.max(0, total - cash);
    if (balance > 0 && S.customer.id && S.customer.id !== 'KM-0000') {
      try {
        const debtId = await generateDebtId();
        const debtData = {
          debtId: debtId,
          customerId: S.customer.id,
          cardNumber: S.customer.cardNumber,
          customerName: S.customer.customerName || 'Guest',
          phone: S.customer.phone || '',
          originalAmount: total,
          amountPaid: cash,
          balance: balance,
          debtDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          saleId: saleId,
          transactionId: saleId,
          userID: S.user?.id || 'unknown'
        };
        await setDoc(doc(db, 'debts', debtId), debtData);
        console.log('✅ Debt created with ID:', debtId, 'Amount:', balance);

        const custRef = doc(db, 'customers', S.customer.id);
        await updateDoc(custRef, {
          totalDebt: increment(balance)
        });
        console.log('✅ Customer totalDebt updated:', balance);
      } catch (debtErr) {
        console.error('❌ Error creating debt:', debtErr);
      }
    }

    // ─── Notify Customer View sale is complete ───
    try {
      const channel = new BroadcastChannel('kazmart_pos');
      channel.postMessage({
        type: 'SALE_COMPLETE',
        items: [],
        subtotal: 0,
        total: 0,
        discount: 0,
        loyaltyUsed: 0,
        customer: 'Guest',
        cardNumber: 'KM-0000',
        pointsBalance: 0,
        pointsRedeemed: 0,
        pointsEarned: 0,
        cashier: '—',
        totalDebt: 0,
        lastVisit: null,
        topTrends: [],
        saleComplete: true
      });
    } catch (e) {}

    hideLoading();

    // ─── Show notification (replaces alert) ───
    showNotification(
      '✅ Sale Complete!',
      `Total: TZS ${total.toLocaleString()}<br>Change: TZS ${Math.max(0, cash - total).toLocaleString()}`
    );

    // ─── Build and show receipt ───
    const now = new Date();
    const receiptHTML = buildReceipt(
      saleId,
      S.customer,
      S.cart,
      {
        subtotal: subtotal,
        totalDiscount: totalDiscount,
        loyaltyRedeemed: 0,
        totalAmount: total,
        change: Math.max(0, cash - total),
        debtAmount: payType === 'Debt' ? total - cash : 0,
        pointsEarned: Math.floor(total / 100),
        pointsBalance: (S.customer.pointsBalance || 0) + Math.floor(total / 100)
      },
      {
        paymentType: payType,
        cashGiven: cash
      },
      now
    );

    const modal = document.getElementById('receiptModal');
    const content = document.getElementById('receiptContent');
    if (modal && content) {
      content.innerHTML = receiptHTML;
      modal.style.display = 'flex';
    }

    // ─── Reset cart & customer ───
    S.cart = [];
    S.loyaltyPointsUsed = 0;
    resetCust();
    updateCartUI();
    document.getElementById('cashReceived').value = '0';
    if (globalDiscountInput) globalDiscountInput.value = '0';
        await refreshAll(); // 👈 ADD THIS


  } catch (err) {
    hideLoading();
    console.error('Sale error:', err);
    alert('Error processing sale: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Complete Sale';
    hideLoading();
  }
}

  // ============================================================
  // BUILD RECEIPT
  // ============================================================

  function buildReceipt(transactionID, customer, cartItems, totals, paymentInfo, now) {
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const itemsHTML = cartItems.map(item => `
    <div style="display:flex; justify-content:space-between; padding:2px 0;">
      <span>${item.qty}x ${item.name}</span>
      <span>TZS ${((item.price * item.qty) - (item.discount || 0)).toLocaleString()}</span>
    </div>
  `).join('');

    return `
    <div style="text-align:center; border-bottom:1px dashed #ccc; padding-bottom:8px; margin-bottom:8px;">
      <h2 style="font-size:20px; margin:0; color:#0B5394;">KazMart</h2>
      <p style="font-size:10px; margin:2px 0; color:#595959;">Beyond The Expected</p>
      <p style="font-size:10px; margin:0; color:#999;">${date} · ${time}</p>
      <p style="font-size:9px; margin:0; color:#ccc;">${transactionID || 'TX-' + Date.now()}</p>
    </div>
    <div style="font-size:11px; margin-bottom:6px;">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#999;">Customer:</span>
        <span style="font-weight:600;">${customer.customerName || 'Guest'}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#999;">Card:</span>
        <span>${customer.cardNumber || 'KM-0000'}</span>
      </div>
    </div>
    <div style="border-top:1px dashed #ccc; padding-top:6px; margin-bottom:6px;">
      ${itemsHTML}
    </div>
    <div style="border-top:1px dashed #ccc; padding-top:6px; text-align:right; font-size:13px;">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#999;">Subtotal:</span>
        <span>TZS ${(totals.subtotal || 0).toLocaleString()}</span>
      </div>
      ${totals.totalDiscount > 0 ? `
        <div style="display:flex; justify-content:space-between; color:#CC0000;">
          <span style="color:#999;">Discount:</span>
          <span>- TZS ${(totals.totalDiscount || 0).toLocaleString()}</span>
        </div>
      ` : ''}
      ${totals.loyaltyRedeemed > 0 ? `
        <div style="display:flex; justify-content:space-between; color:#FF9800;">
          <span style="color:#999;">Loyalty Used:</span>
          <span>- TZS ${(totals.loyaltyRedeemed || 0).toLocaleString()}</span>
        </div>
      ` : ''}
      <div style="font-size:16px; font-weight:bold; border-top:1px solid #ccc; padding-top:4px; margin-top:4px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Total:</span>
          <span style="color:#117594;">TZS ${(totals.totalAmount || 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
    ${paymentInfo.paymentType === 'Debt' ? `
      <div style="text-align:center; background:#FFF3CD; padding:4px; border-radius:4px; margin-top:6px; font-size:11px; color:#B45309;">
        ⚠️ Debt: TZS ${(totals.debtAmount || 0).toLocaleString()} remaining
      </div>
    ` : ''}
    ${paymentInfo.paymentType === 'Full Paid' ? `
      <div style="text-align:center; background:#DCFCE7; padding:4px; border-radius:4px; margin-top:6px; font-size:11px; color:#1E7B34;">
        ✅ Paid in full
      </div>
    ` : ''}
    ${totals.change > 0 ? `
      <div style="text-align:center; font-size:13px; font-weight:bold; margin-top:4px;">
        Change: TZS ${(totals.change || 0).toLocaleString()}
      </div>
    ` : ''}
    ${totals.pointsEarned > 0 ? `
      <div style="text-align:center; font-size:11px; color:#4CAF50; margin-top:4px;">
        +${totals.pointsEarned} loyalty points earned (Balance: ${totals.pointsBalance || 0})
      </div>
    ` : ''}
    <div style="text-align:center; border-top:1px dashed #ccc; margin-top:8px; padding-top:8px; font-size:10px; color:#999;">
      Thank you! Come Again! 🙏
    </div>
  `;
  }

  // ============================================================
  // PAGE SWITCHING
  // ============================================================

  function showPage(page) {
    console.log('📄 Switching to:', page);

    const appContainer = document.querySelector('.app-container');
    const cartPanel = document.getElementById('cart-panel');
    const pageContent = document.getElementById('page-content'); // 👈 NEW

    appContainer.classList.remove('pos-layout', 'full-layout');

    // 1. HIDE ALL VIEWS
    const views = ['posView', 'stockView', 'cashView', 'debtsView', 'reportsView', 'settingsView', 'customerView'];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // 2. SHOW THE SELECTED VIEW
    if (page === 'pos') {
      const posView = document.getElementById('posView');
      if (posView) posView.style.display = 'flex';
      appContainer.classList.add('pos-layout');
      if (cartPanel) cartPanel.style.display = 'flex';
      if (pageContent) pageContent.style.width = '75%'; // 👈 NEW: POS = 75%
      return;
    }

    // ALL OTHER PAGES: Full width, no cart
    appContainer.classList.add('full-layout');
    if (cartPanel) cartPanel.style.display = 'none';
    if (pageContent) pageContent.style.width = '100%'; // 👈 NEW: Full width!

    if (page === 'stock') {
      const stockView = document.getElementById('stockView');
      if (stockView) {
        stockView.style.display = 'flex';
        loadStockData();
      }
    } else if (page === 'cash') {
      const cashView = document.getElementById('cashView');
      if (cashView) {
        cashView.style.display = 'flex';
        loadCashPage();
      }
    } else if (page === 'debts') {
      const debtsView = document.getElementById('debtsView');
      if (debtsView) {
        debtsView.style.display = 'flex';
        loadDebts();
      }


    } else if (page === 'reports') {
  const reportsView = document.getElementById('reportsView');
  if (reportsView) {
    reportsView.style.display = 'flex';

    // Reload whichever Analytics sub-tab was last active, defaulting to 'summary' the first time
    if (!currentAnalyticsTab) currentAnalyticsTab = 'summary';

    if (currentAnalyticsTab === 'summary') {
      loadAnalyticsData();
    } else if (currentAnalyticsTab === 'sales') {
      loadSalesData();
    } else if (currentAnalyticsTab === 'stock') {
      loadAnalyticsStockData();
    } else if (currentAnalyticsTab === 'cash') {
      loadCashData();
    }
  }

    } else if (page === 'customer') {
  const customerView = document.getElementById('customerView');
  if (customerView) {
    customerView.style.display = 'flex';
    loadCustomers();
  }
} else if (page === 'settings') {
  const settingsView = document.getElementById('settingsView');
  if (settingsView) {
    settingsView.style.display = 'flex';
    loadSettings();
  }


      // ✅ Title update – COMMENTED OUT (titles are now in HTML)
      /*
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) {
        const titles = {
          pos: 'Point Of Sales',
          stock: 'Stock Management',
          cash: 'Cash Management',
          debts: 'Debt Management',
          reports: 'Reports Dashboard',
          settings: 'System Settings'
        };
        titleEl.textContent = titles[page] || 'Point Of Sales';
      }
     */
    }
  }

  window.showPage = showPage;

// ─── UNIVERSAL REFRESH ────────────────────────────────────────
async function refreshAll() {
  console.log('🔄 Auto-refresh triggered...');
  
  // Always refresh POS grid if visible
  if (document.getElementById('posView')?.style.display !== 'none') {
    await loadProducts();
  }
  
  // Stock management page
  if (document.getElementById('stockView')?.style.display !== 'none') {
  await loadStockData(false); // 👈 No loading overlay
}
  
  // Debts page
  if (document.getElementById('debtsView')?.style.display !== 'none') {
    await loadDebts();
  }
  
  // Cash page
  if (document.getElementById('cashView')?.style.display !== 'none') {
    await loadCashPage();
  }
  
  // Analytics (current tab)
  if (document.getElementById('reportsView')?.style.display !== 'none') {
    if (currentAnalyticsTab === 'summary') await loadAnalyticsData();
    else if (currentAnalyticsTab === 'sales') await loadSalesData();
    else if (currentAnalyticsTab === 'stock') await loadAnalyticsStockData();
    else if (currentAnalyticsTab === 'cash') await loadCashData();
    else if (currentAnalyticsTab === 'debts') await loadAnalyticsDebtsData();
    else if (currentAnalyticsTab === 'products') await loadAnalyticsProductsData();
    else if (currentAnalyticsTab === 'customer-analytics') await loadAnalyticsCustomerData();
  }
  
  console.log('✅ Auto-refresh complete.');
}

// Expose for debugging (optional)
window.refreshAll = refreshAll;

  // ============================================================
  // STOCK MANAGEMENT
  // ============================================================

  let allStockProducts = [];
  let correctionCart = [];

  async function loadStockData(showLoadingOverlay = true) {
  const body = document.getElementById('stockTableBody');
  if (!body) return;

  // ─── Conditionally show loading overlay ──────────────────
  if (showLoadingOverlay) {
    showLoading('Processing, please wait...');
  }

  try {
    body.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">Loading...</td></tr>';

    // ─── Fetch products ──────────────────────────────────────
    const productsRef = collection(db, 'products');
    const productSnap = await getDocs(productsRef);
    const products = [];
    productSnap.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

    // ─── Fetch inventory summaries ──────────────────────────
    const invRef = collection(db, 'inventorySummary');
    const invSnap = await getDocs(invRef);
    const stockMap = {};
    invSnap.forEach(doc => {
      const data = doc.data();
      const pid = data.productId || doc.id;
      stockMap[pid] = data.quantity || data.currentStock || 0;
    });

    // ─── Build allStockProducts array ───────────────────────
    allStockProducts = products.map(p => {
      let stock = 0;
      if (stockMap[p.id] !== undefined) stock = stockMap[p.id];
      else if (p.sku && stockMap[p.sku] !== undefined) stock = stockMap[p.sku];
      return {
        ...p,
        stock: stock,
        name: p.productName || p.name || 'Unnamed'
      };
    });

    // ─── Update summary cards ───────────────────────────────
    const total = allStockProducts.length;
    const low = allStockProducts.filter(p => p.stock > 0 && p.stock <= 5).length;
    const out = allStockProducts.filter(p => p.stock <= 0).length;

    const totalEl = document.getElementById('stockTotalProducts');
    const lowEl = document.getElementById('stockLowCount');
    const outEl = document.getElementById('stockOutCount');
    if (totalEl) totalEl.textContent = total;
    if (lowEl) lowEl.textContent = low;
    if (outEl) outEl.textContent = out;

    // ─── Populate datalists for Stock In & Correction ──────
    const productOptions = allStockProducts.map(p => `<option value="${p.name}">`).join('');
    const stockProductList = document.getElementById('stockProductList');
    const corrProductList = document.getElementById('corrProductList');
    if (stockProductList) stockProductList.innerHTML = productOptions;
    if (corrProductList) corrProductList.innerHTML = productOptions;

    // ─── Render the stock table ─────────────────────────────
    renderStockTable(allStockProducts);

  } catch (err) {
    console.error('Error loading stock:', err);
    body.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#CC0000;">Error loading stock</td></tr>`;
  } finally {
    // ─── Hide loading overlay only if we showed it ──────────
    if (showLoadingOverlay) {
      hideLoading();
    }
  }
}

  function renderStockTable(products) {
    const body = document.getElementById('stockTableBody');
    if (!body) return;
    if (!products || !products.length) {
      body.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">No products found.</td></tr>';
      return;
    }

    const searchInput = document.getElementById('stockSearch');
    let filtered = products;
    if (searchInput) {
      const query = searchInput.value.toLowerCase().trim();
      if (query) {
        filtered = products.filter(p => p.name.toLowerCase().includes(query));
      }
    }

    body.innerHTML = filtered.map(p => {
      const status = p.stock <= 0 ? 'Out of Stock' : p.stock <= 5 ? 'Low Stock' : 'In Stock';
      const color = p.stock <= 0 ? '#CC0000' : p.stock <= 5 ? '#B45309' : '#1E7B34';
      return `
      <tr>
        <td style="padding:8px 12px; font-weight:600;">${p.name}</td>
        <td style="padding:8px 12px;">${p.category || '—'}</td>
        <td style="padding:8px 12px; text-align:right;">TZS ${(p.sellingPrice || 0).toLocaleString()}</td>
        <td style="padding:8px 12px; text-align:right; font-weight:600; color:${color};">${p.stock}</td>
        <td style="padding:8px 12px; text-align:center;">
  <button onclick="openEditProductModal('${p.id}')" style="background:none; border:none; color:#117594; cursor:pointer; font-size:16px;" title="Edit product">✏️</button>
</td>
      </tr>
    `;
    }).join('');
  }

  function setupStockSearch() {
    const searchInput = document.getElementById('stockSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        renderStockTable(allStockProducts);
      });
    }
  }


 // ============================================================
// EDIT PRODUCT MODAL
// ============================================================
window.openEditProductModal = function(productId) {
  const product = S.products.find(p => p.id === productId);
  if (!product) {
    alert('Product not found.');
    return;
  }
  document.getElementById('editProductId').value = productId;
  document.getElementById('editProductName').value = product.name || '';
  document.getElementById('editSellingPrice').value = product.sellingPrice || 0;
  document.getElementById('editWac').value = product.wac || 0;
  document.getElementById('editCategory').value = product.category || 'General';
  document.getElementById('editBundleAvail').value = product.bundleAvail ? 'YES' : 'NO';
  document.getElementById('editBundleSize').value = product.bundleSize || 0;
  document.getElementById('editBundlePrice').value = product.bundlePrice || 0;
  document.getElementById('editProductModal').style.display = 'flex';
}; 

  // ============================================================
  // CORRECTION: Auto-populate current stock
  // ============================================================

  window.onCorrProductChange = function () {
    const input = document.getElementById('corrProduct');
    const itemName = input ? input.value.trim() : '';
    const stockField = document.getElementById('corrCurrentStock');
    const qtyField = document.getElementById('corrQty');
    const preview = document.getElementById('corrPreview');

    if (!stockField) return;

    if (!itemName) {
      stockField.value = '';
      stockField.style.color = 'var(--gray)';
      stockField.style.fontWeight = '400';
      stockField.style.background = '';
      if (preview) preview.style.display = 'none';
      return;
    }

    // Find product in allStockProducts (populated by loadStockData)
    const product = allStockProducts.find(p => p.name.toLowerCase() === itemName.toLowerCase());
    if (product) {
      const currentStock = product.stock || 0;
      stockField.value = currentStock + ' units';
      // Color code based on stock level
      if (currentStock <= 0) {
        stockField.style.color = 'var(--red)';
        stockField.style.fontWeight = '700';
        stockField.style.background = 'var(--red-light)';
      } else if (currentStock <= 5) {
        stockField.style.color = 'var(--amber)';
        stockField.style.fontWeight = '600';
        stockField.style.background = 'var(--amber-light)';
      } else {
        stockField.style.color = 'var(--green)';
        stockField.style.fontWeight = '400';
        stockField.style.background = 'var(--green-light)';
      }
    } else {
      stockField.value = 'Product not found';
      stockField.style.color = 'var(--red)';
      stockField.style.fontWeight = '600';
      stockField.style.background = 'var(--red-light)';
    }
  };

  // ============================================================
  // CASH PAGE
  // ============================================================

  let cashCategories = {};

  async function loadCashPage() {
  const result = await window.api('getCashCategories', {});
  if (result.success) {
    cashCategories = result.categories;
    populateCashDropdowns();
  }
  await loadTodayCash();
  await refreshAll(); // 👈 ADD THIS
}

  function populateCashDropdowns() {
    const catSelect = document.getElementById('cashCategorySelect');
    if (!catSelect) return;
    catSelect.innerHTML = '<option value="">-- Select Category --</option>';
    Object.keys(cashCategories).forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cashCategories[cat].displayName || cat;
      catSelect.appendChild(opt);
    });
  }

  document.getElementById('cashCategorySelect')?.addEventListener('change', function () {
    const cat = this.value;
    const itemSelect = document.getElementById('cashItemSelect');
    itemSelect.innerHTML = '<option value="">-- Select Item --</option>';
    if (cat && cashCategories[cat]) {
      const items = cashCategories[cat].items || [];
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.displayName || item.name;
        // ✅ Set data-flow
        opt.dataset.flow = item.flow || 'Out';
        itemSelect.appendChild(opt);
      });
      itemSelect.disabled = false;
      // Update flow indicator when item changes
      itemSelect.onchange = function () {
        const selected = this.options[this.selectedIndex];
        const flow = selected ? selected.dataset.flow : 'Out';
        const indicator = document.getElementById('cashFlowIndicator');
        if (indicator) {
          indicator.textContent = flow === 'In' ? '↑ Money coming IN' : '↓ Money going OUT';
          indicator.className = 'flow-indicator ' + (flow === 'In' ? 'in' : 'out');
          indicator.style.display = 'block';
        }
      };
      // Trigger initial if first item selected
      if (itemSelect.options.length > 1) {
        itemSelect.selectedIndex = 1;
        itemSelect.onchange();
      }
    } else {
      itemSelect.disabled = true;
    }
  });


  async function recordCash() {
    const category = document.getElementById('cashCategorySelect').value;
    const itemSelect = document.getElementById('cashItemSelect');
    const item = itemSelect.value;
    const amount = parseFloat(document.getElementById('cashAmountInput').value);
    const notes = document.getElementById('cashNotesInput').value.trim();

    if (!category) { alert('Select a category.'); return; }
    if (!item) { alert('Select an item.'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }

    // Get flow from cashCategories object (loaded in app.js)
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    const direction = selectedOption?.dataset.flow || 'Out';

    console.log('📤 Direction from cashCategories:', direction);

    const btn = document.getElementById('cashSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const result = await window.api('recordCashMovement', {
      categoryName: category,
      itemName: item,
      amount: amount,
      notes: notes,
      direction: direction
    });

    btn.disabled = false;
    btn.textContent = 'Record Movement';

    if (result.success) {
      alert('✅ Cash movement recorded.');
      // Reset form...
      await loadTodayCash();
    } else {
      alert('❌ Error: ' + result.message);
    }
  }

  async function loadTodayCash() {
    const result = await window.api('getTodayCashMovements', {});
    if (!result.success) {
      document.getElementById('cashTotalIn').textContent = 'TZS 0';
      document.getElementById('cashTotalOut').textContent = 'TZS 0';
      document.getElementById('cashNetBalance').textContent = 'TZS 0';
      document.getElementById('cashLogBody').innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">No movements today.</td></tr>';
      return;
    }

    document.getElementById('cashTotalIn').textContent = fmt(result.totalIn);
    document.getElementById('cashTotalOut').textContent = fmt(result.totalOut);
    document.getElementById('cashNetBalance').textContent = fmt(result.netBalance);

    const body = document.getElementById('cashLogBody');
    if (!result.movements.length) {
      body.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">No movements today.</td></tr>';
      return;
    }

    body.innerHTML = result.movements.map(m => `
    <tr>
      <td style="padding:8px 12px; text-align:left; font-weight:400;">${m.category}</td>
      <td style="padding:8px 12px; text-align:left;">${m.item}</td>
      <td style="padding:8px 12px; text-align:center; font-weight:600; color:${m.direction === 'In' ? '#1E7B34' : '#CC0000'};">${m.direction === 'In' ? '↑ In' : '↓ Out'}</td>
      <td style="padding:8px 12px; text-align:right; font-weight:700; color:${m.direction === 'In' ? '#1E7B34' : '#CC0000'};">${fmt(m.amount)}</td>
      <td style="padding:8px 12px; text-align:left; color:#999; font-size:11px;">${m.notes || '—'}</td>
    </tr>
  `).join('');
  }


  // Expose recordCash globally (OUTSIDE the function)
  window.recordCash = recordCash;


  // ============================================================
  // DEBT UI FUNCTIONS
  // ============================================================

  let debtViewMode = 'single'; // 'single' or 'consolidated'
let debtDateFrom = null;
let debtDateTo = null;
  
  let allDebts = [];
  let currentFilter = 'all';
  let currentSearch = '';

  // 👇 ADD THESE LINES TO EXPOSE FOR CONSOLE DEBUGGING
window.allDebts = allDebts;
window.currentFilter = currentFilter;
window.currentSearch = currentSearch;
window.loadDebts = loadDebts;
window.renderDebtTable = renderDebtTable;

async function loadDebts() {
  const result = await window.api('getDebts', {});
  if (!result.success) {
    document.getElementById('debtTableBody').innerHTML = `<tr><td colspan="9" style="padding:20px; text-align:center; color:#CC0000;">Error loading debts</td></tr>`;
    return;
  }
  let debts = result.debts;

  // ─── Apply date filter ──────────────────────────────────
  if (debtDateFrom || debtDateTo) {
    debts = debts.filter(d => {
      const debtDate = d.debtDate || d.createdAt;
      if (!debtDate) return false;
      const dDate = new Date(debtDate);
      if (debtDateFrom && dDate < new Date(debtDateFrom)) return false;
      if (debtDateTo) {
        const toDate = new Date(debtDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (dDate > toDate) return false;
      }
      return true;
    });
  }

  allDebts = debts;
  window.allDebts = allDebts;

  // ─── Recalculate summary from filtered debts ──────────
  const totalOwed = allDebts.reduce((sum, d) => sum + (d.balance || 0), 0);
  const activeDebts = allDebts.filter(d => d.balance > 0).length;
  const overdueDebts = allDebts.filter(d => d.daysOverdue >= 7);
  const overdueCount = overdueDebts.length;
  const overdueAmount = overdueDebts.reduce((sum, d) => sum + (d.balance || 0), 0);
  updateDebtSummary({ totalOwed, activeDebts, overdueCount, overdueAmount });

  renderDebtTable();
}

  function updateDebtSummary(summary) {
    document.getElementById('debtTotalOwed').textContent = fmt(summary.totalOwed);
    document.getElementById('debtActiveCount').textContent = summary.activeDebts;
    document.getElementById('debtOverdueCount').textContent = summary.overdueCount;
    document.getElementById('debtOverdueAmount').textContent = fmt(summary.overdueAmount);
  }

  function renderDebtTable() {
  const body = document.getElementById('debtTableBody');
  let filtered = allDebts;

  // Apply filter buttons
  if (currentFilter === 'overdue') filtered = filtered.filter(d => d.daysOverdue >= 7);
  else if (currentFilter === 'pending') filtered = filtered.filter(d => d.status === 'Pending');
  else if (currentFilter === 'partial') filtered = filtered.filter(d => d.status === 'Partial');

  // Apply search
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase().trim();
    filtered = filtered.filter(d => d.customerName.toLowerCase().includes(q) || d.customerId?.toLowerCase().includes(q));
  }

  // ─── Get the table header ──────────────────────────────────
  const thead = document.querySelector('#debtsView table thead');
  if (!thead) return;

  // ─── Build common headers (same for both views) ──────────
  let headers = `
    <th style="padding:8px 12px; text-align:left; width:15%;">Customer</th>
    <th style="padding:8px 12px; text-align:left; width:12%;">Phone</th>
    <th style="padding:8px 12px; text-align:right; width:12%;">Original</th>
    <th style="padding:8px 12px; text-align:right; width:12%;">Paid</th>
    <th style="padding:8px 12px; text-align:right; width:12%;">Balance</th>
  `;

  // ─── If consolidated, add "# Debts" and adjust headers ──
  let extraHeaders = '';
  let extraData = '';
  if (debtViewMode === 'consolidated') {
    extraHeaders = `<th style="padding:8px 12px; text-align:center; width:8%;"># Debts</th>`;
  } else {
    extraHeaders = `
      <th style="padding:8px 12px; text-align:center; width:10%;">Due Date</th>
      <th style="padding:8px 12px; text-align:center; width:8%;">Overdue</th>
    `;
  }

  const statusHeader = `<th style="padding:8px 12px; text-align:center; width:8%;">Status</th>`;
  const actionHeader = `<th style="padding:8px 12px; text-align:center; width:11%;">Action</th>`;

  thead.innerHTML = `<tr style="background:#117594; color:#fff;">${headers}${extraHeaders}${statusHeader}${actionHeader}</tr>`;

  // ─── If no debts ──────────────────────────────────────────
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="9" style="padding:20px; text-align:center; color:#999;">No debts found.</td></tr>`;
    return;
  }

  // ─── CONSOLIDATED VIEW ──────────────────────────────────
  if (debtViewMode === 'consolidated') {
    const consolidated = {};
    filtered.forEach(d => {
      const key = d.customerId || d.cardNumber || 'unknown';
      if (!consolidated[key]) {
        consolidated[key] = {
          customerName: d.customerName || 'Unknown',
          phone: d.phone || '',
          cardNumber: d.cardNumber || '',
          totalOriginal: 0,
          totalPaid: 0,
          totalBalance: 0,
          debts: [],
          latestDueDate: null,
          maxOverdue: 0,
          status: 'Pending'
        };
      }
      const c = consolidated[key];
      c.totalOriginal += d.originalAmount || 0;
      c.totalPaid += d.amountPaid || 0;
      c.totalBalance += d.balance || 0;
      c.debts.push(d);

      // Track latest due date
      if (d.dueDate) {
        const due = new Date(d.dueDate);
        if (!c.latestDueDate || due > c.latestDueDate) c.latestDueDate = due;
      }
      // Track max overdue days
      if (d.daysOverdue > c.maxOverdue) c.maxOverdue = d.daysOverdue;
    });

    Object.keys(consolidated).forEach(key => {
      consolidated[key].status = consolidated[key].totalBalance > 0 ? 'Pending' : 'Paid';
    });

    const rows = Object.values(consolidated);
    body.innerHTML = rows.map(c => {
      const statusColor = c.status === 'Pending' ? '#CC0000' : '#1E7B34';
      const dueDateDisplay = c.latestDueDate ? c.latestDueDate.toLocaleDateString('en-GB') : '—';
      const overdueDisplay = c.maxOverdue > 0 ? c.maxOverdue + 'd' : '—';
      const debtCount = c.debts.length;

      return `
        <tr>
          <td style="padding:8px 12px; font-weight:600;">${c.customerName}</td>
          <td style="padding:8px 12px;">${c.phone}</td>
          <td style="padding:8px 12px; text-align:right;">${fmt(c.totalOriginal)}</td>
          <td style="padding:8px 12px; text-align:right; color:#1E7B34;">${fmt(c.totalPaid)}</td>
          <td style="padding:8px 12px; text-align:right; font-weight:700; color:${c.totalBalance > 0 ? '#CC0000' : '#1E7B34'};">${fmt(c.totalBalance)}</td>
          <td style="padding:8px 12px; text-align:center;">${debtCount}</td>
          <td style="padding:8px 12px; text-align:center;">
            <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:${statusColor}20; color:${statusColor};">${c.status}</span>
          </td>
          <td style="padding:8px 12px; text-align:center;">
            ${c.totalBalance > 0 ? `<button class="btn-pay" onclick="openPaymentModalForCustomer('${c.cardNumber}')">💰 Pay</button>` : '—'}
          </td>
        </tr>
      `;
    }).join('');
    return;
  }

  // ─── SINGLE VIEW (original) ─────────────────────────────
  body.innerHTML = filtered.map(d => {
    const days = d.daysOverdue || 0;
    const isOverdue = days >= 7;
    const statusBadge = isOverdue
      ? `<span class="badge badge-overdue">Overdue ${days}d</span>`
      : d.status === 'Partial'
        ? `<span class="badge badge-partial">Partial</span>`
        : `<span class="badge badge-pending">${d.status || 'Pending'}</span>`;
    return `
      <tr class="${isOverdue ? 'row-overdue' : ''}">
        <td style="padding:8px 12px; font-weight:600;">${d.customerName}</td>
        <td style="padding:8px 12px;">${d.phone || '—'}</td>
        <td style="padding:8px 12px; text-align:right; font-family:monospace;">${fmt(d.originalAmount)}</td>
        <td style="padding:8px 12px; text-align:right; font-family:monospace; color:#1E7B34;">${fmt(d.amountPaid)}</td>
        <td style="padding:8px 12px; text-align:right; font-family:monospace; font-weight:700; color:${isOverdue ? '#CC0000' : '#0B5394'};">${fmt(d.balance)}</td>
        <td style="padding:8px 12px; text-align:center;">${d.dueDate ? fmtDate(d.dueDate) : '—'}</td>
        <td style="padding:8px 12px; text-align:center; font-weight:700; color:${isOverdue ? '#CC0000' : '#595959'};">${days > 0 ? days + 'd' : '—'}</td>
        <td style="padding:8px 12px; text-align:center;">${statusBadge}</td>
        <td style="padding:8px 12px; text-align:center;">
          <button class="btn-pay" onclick="openPaymentModal('${d.id}','${d.customerName}',${d.balance})" ${d.balance <= 0 ? 'disabled' : ''}>💰 Pay</button>
        </td>
      </tr>
    `;
  }).join('');
}


  function setDebtFilter(filter) {
    currentFilter = filter;
      window.currentFilter = currentFilter;  // 👈 add this
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.style.background = '#fff';
      btn.style.color = '#0D5A70';
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (activeBtn) {
      activeBtn.style.background = '#117594';
      activeBtn.style.color = '#fff';
      activeBtn.classList.add('active');
    }
    renderDebtTable();
  }

  function searchDebts() {
    const input = document.getElementById('debtSearch');
    currentSearch = input.value;
    window.currentSearch = currentSearch;  // 👈 add this
    renderDebtTable();
  }

  
// ============================================================
// FIX DEBT LINKING – Run once to repair missing customerId and totalDebt
// ============================================================
async function fixDebtLinking() {
  console.log('🔧 Starting debt fix...');
  
  // 1. Get all customers
  const custSnap = await getDocs(collection(db, 'customers'));
  const customers = {};
  custSnap.forEach(doc => {
    const data = doc.data();
    customers[data.cardNumber] = { id: doc.id, ...data };
  });
  console.log(`👤 Found ${Object.keys(customers).length} customers.`);

  // 2. Get all debts
  const debtSnap = await getDocs(collection(db, 'debts'));
  const debts = debtSnap.docs;
  console.log(`📦 Found ${debts.length} debts.`);

  // 3. Process each debt
  const batch = writeBatch(db);
  const customerDebtMap = {};

  for (const docSnap of debts) {
    const data = docSnap.data();
    const cardNumber = data.cardNumber || data.LoyaltyCard || '';
    let customerId = data.customerId || null;

    // If customerId is missing, try to find by cardNumber
    if (!customerId && cardNumber && customers[cardNumber]) {
      customerId = customers[cardNumber].id;
    }

    // If still no customerId, assign to Guest (KM-0000)
    if (!customerId) {
      const guest = customers['KM-0000'];
      if (guest) customerId = guest.id;
    }

    // Update debt with customerId if changed
    if (customerId && customerId !== data.customerId) {
      batch.update(docSnap.ref, { customerId: customerId });
      console.log(`✅ Updated debt ${docSnap.id} -> customerId: ${customerId}`);
    }

    // Accumulate balance per customer (only if balance > 0)
    const balance = Number(data.balance) || 0;
    if (balance > 0 && customerId) {
      if (!customerDebtMap[customerId]) customerDebtMap[customerId] = 0;
      customerDebtMap[customerId] += balance;
    }
  }

  // 4. Update customer totalDebt
  for (const [custId, total] of Object.entries(customerDebtMap)) {
    const custRef = doc(db, 'customers', custId);
    batch.update(custRef, { totalDebt: total });
    console.log(`🔄 Customer ${custId} totalDebt set to ${total}`);
  }

  // 5. Commit batch
  await batch.commit();
  console.log('✅ All debts fixed and customer totals updated!');
  
  // 6. Reload debts to refresh UI
  await loadDebts();
  console.log('🔄 Debt table refreshed.');
}

// Expose to window so you can run from console
window.fixDebtLinking = fixDebtLinking;

// ============================================================
// RECALCULATE TOTAL DEBT FOR ALL CUSTOMERS
// ============================================================
async function recalcAllCustomerDebt() {
  console.log('🔄 Recalculating totalDebt for all customers...');
  
  // 1. Get all customers
  const custSnap = await getDocs(collection(db, 'customers'));
  const batch = writeBatch(db);
  
  // 2. For each customer, sum their active debts (balance > 0)
  for (const docSnap of custSnap.docs) {
    const customerId = docSnap.id;
    const cardNumber = docSnap.data().cardNumber;
    
    // Query debts for this customer (with balance > 0)
    const debtQuery = query(
      collection(db, 'debts'),
      where('customerId', '==', customerId),
      where('balance', '>', 0)
    );
    const debtSnap = await getDocs(debtQuery);
    
    let total = 0;
    debtSnap.forEach(d => {
      total += d.data().balance || 0;
    });
    
    // Update customer's totalDebt
    batch.update(docSnap.ref, { totalDebt: total });
    console.log(`👤 ${cardNumber} (${customerId}) → totalDebt: ${total}`);
  }
  
  await batch.commit();
  console.log('✅ All customer totals updated.');
  
  // 3. Refresh the UI
  await loadDebts();
}

// Expose to window so you can run from console
window.recalcAllCustomerDebt = recalcAllCustomerDebt;

// ============================================================
// RESET CUSTOMER DEBT (single or all) – with debt deletion
// ============================================================
async function resetCustomerDebt(cardNumber, deleteDebts = true) {
  // If no cardNumber provided, reset all customers
  if (!cardNumber) {
    if (!confirm('⚠️ This will set ALL customers totalDebt to ZERO and DELETE all outstanding debts. Continue?')) return;
    console.log('🔄 Resetting ALL customers totalDebt to 0 and deleting all debts...');
  } else {
    if (!confirm(`⚠️ This will set customer ${cardNumber} totalDebt to ZERO and DELETE all their outstanding debts. Continue?`)) return;
    console.log(`🔄 Resetting customer ${cardNumber} totalDebt to 0 and deleting debts...`);
  }

  try {
    // 1. Find customers
    let custQuery;
    if (cardNumber) {
      custQuery = query(collection(db, 'customers'), where('cardNumber', '==', cardNumber));
    } else {
      custQuery = collection(db, 'customers');
    }
    const custSnap = await getDocs(custQuery);
    if (custSnap.empty) {
      alert(cardNumber ? `Customer ${cardNumber} not found.` : 'No customers found.');
      return;
    }

    // 2. Delete debts (if deleteDebts is true)
    if (deleteDebts) {
      const batch = writeBatch(db);
      let debtCount = 0;
      for (const custDoc of custSnap.docs) {
        const customerId = custDoc.id;

        // Query debts for this customer with balance > 0
        const debtQuery = query(
  collection(db, 'debts'),
  where('customerId', '==', customerId)
);
const debtSnap = await getDocs(debtQuery);
debtSnap.forEach(docSnap => {
  const data = docSnap.data();
  if (data.balance > 0) {
    batch.delete(docSnap.ref);
    debtCount++;
  }
});
      }

      if (debtCount > 0) {
        await batch.commit();
        console.log(`✅ Deleted ${debtCount} debt documents.`);
      } else {
        console.log('ℹ️ No debts to delete.');
      }
    }

    // 3. Reset customer totalDebt to 0
    const batch2 = writeBatch(db);
    let count = 0;
    custSnap.forEach(docSnap => {
      batch2.update(docSnap.ref, { totalDebt: 0 });
      count++;
    });
    await batch2.commit();

    const message = cardNumber
      ? `✅ Customer ${cardNumber} totalDebt set to 0 and debts deleted.`
      : `✅ ${count} customers totalDebt set to 0 and all debts deleted.`;
    console.log(message);
    
    // 4. Refresh debt table
    await loadDebts();
    alert(message);
  } catch (err) {
    console.error('❌ Error resetting debt:', err);
    alert('❌ Error: ' + err.message);
  }
}

// Expose to window
window.resetCustomerDebt = resetCustomerDebt;

    // ============================================================
    // RESET SINGLE CUSTOMER – SEARCH DROPDOWN LOGIC
    // ============================================================

let selectedResetCustomer = null;   // 👈 ADD THIS LINE

    async function searchResetCustomers(query) {
      if (!query || query.length < 1) {
        document.getElementById('resetSingleDropdown').style.display = 'none';
        return;
      }
      const result = await window.api('searchCustomer', { query });
      if (!result.success || !result.results.length) {
        document.getElementById('resetSingleDropdown').style.display = 'none';
        return;
      }
      const dropdown = document.getElementById('resetSingleDropdown');
      dropdown.innerHTML = result.results.map(c => `
        <div class="reset-cust-item" data-card="${c.cardNumber}" data-id="${c.id}" 
             style="padding:6px 10px; cursor:pointer; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; color:#0B5394;">${c.customerName}</span>
          <span style="color:#999; font-size:11px;">${c.cardNumber}</span>
        </div>
      `).join('');
      dropdown.style.display = 'block';

      // Add click listeners
      dropdown.querySelectorAll('.reset-cust-item').forEach(el => {
        el.addEventListener('click', function() {
          const cardNumber = this.dataset.card;
          const customerId = this.dataset.id;
          const customerName = this.querySelector('span:first-child').textContent;
          selectedResetCustomer = { id: customerId, cardNumber, customerName };
          document.getElementById('resetSingleSearch').value = `${customerName} (${cardNumber})`;
          dropdown.style.display = 'none';
        });
      });
    }

    // Debounced search
    let resetSearchTimer = null;
    document.getElementById('resetSingleSearch')?.addEventListener('input', function() {
      clearTimeout(resetSearchTimer);
      const query = this.value.trim();
      const dropdown = document.getElementById('resetSingleDropdown');
      if (!query) {
        dropdown.style.display = 'none';
        selectedResetCustomer = null;
        return;
      }
      resetSearchTimer = setTimeout(() => searchResetCustomers(query), 300);
    });

    // Click outside to close dropdown
    document.addEventListener('click', function(e) {
      const container = document.getElementById('resetSingleSearch')?.parentElement;
      if (container && !container.contains(e.target)) {
        document.getElementById('resetSingleDropdown').style.display = 'none';
      }
    });

    // Reset Single button handler
    document.getElementById('resetSingleBtn')?.addEventListener('click', function() {
      if (!selectedResetCustomer) {
        alert('Please select a customer from the search results.');
        return;
      }
      resetCustomerDebt(selectedResetCustomer.cardNumber, true);
    });

    // Also allow Enter key to trigger reset
    document.getElementById('resetSingleSearch')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        if (selectedResetCustomer) {
          document.getElementById('resetSingleBtn').click();
        } else {
          // If no selection, try to reset using the typed value as a search (fallback)
          const val = this.value.trim();
          if (val) {
            // If it looks like a card number (KM-xxxx), try direct
            if (val.startsWith('KM-')) {
              resetCustomerDebt(val, true);
            } else {
              alert('Please select a customer from the dropdown first.');
            }
          }
        }
      }
    });

// ============================================================
// RESET ALL CUSTOMER DEBT TOTALS TO ZERO
// ============================================================
async function resetAllCustomerDebtToZero() {
  if (!confirm('⚠️ This will set ALL customers totalDebt to ZERO. Are you sure?')) return;
  
  console.log('🔄 Resetting all customer totalDebt to 0...');
  
  try {
    const custSnap = await getDocs(collection(db, 'customers'));
    const batch = writeBatch(db);
    let count = 0;
    
    for (const docSnap of custSnap.docs) {
      batch.update(docSnap.ref, { totalDebt: 0 });
      count++;
    }
    
    await batch.commit();
    console.log(`✅ Updated ${count} customers totalDebt to 0.`);
    
    // Refresh the debt table (if visible)
    await loadDebts();
    alert(`✅ ${count} customers updated to zero debt.`);
  } catch (err) {
    console.error('❌ Error resetting debt totals:', err);
    alert('❌ Error: ' + err.message);
  }
}

// Expose to window so the button can call it
window.resetAllCustomerDebtToZero = resetAllCustomerDebtToZero;

// ============================================================
// ANALYTICS DATA LOADING (with filters)
// ============================================================

let analyticsFilters = {
  period: 'today',
  startDate: null,
  endDate: null,
  productSearch: '',
  movement: 'all'
};

async function loadAnalyticsData() {
  // ─── Disable controls ──────────────────────────────────
  const controls = document.querySelectorAll('.analytics-period-btn, #analyticsApply, #analyticsReset, #analyticsClearFilters, #analyticsProductSearch, #analyticsMovementFilter');
  controls.forEach(el => el.disabled = true);

  try {
    // Determine date range
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }

    const startStr = start.toISOString();
    const endStr = end.toISOString();
    console.log('📊 Loading analytics from:', startStr, 'to:', endStr);

    // Helper to fetch docs in range
    async function getDocsInRange(collectionName, dateField, startDate, endDate) {
      const q = query(
        collection(db, collectionName),
        where(dateField, '>=', startDate),
        where(dateField, '<', endDate)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // ─── Fetch Sales and Cash in parallel ────────────────
    const [salesSnap, cashSnap] = await Promise.all([
      getDocsInRange('sales', 'saleDate', startStr, endStr),
      getDocsInRange('cashTransactions', 'createdAt', startStr, endStr)
    ]);

    let salesData = salesSnap;
    const cashData = cashSnap;

    // ─── Process totals ──────────────────────────────────
    let totalSales = 0, totalProfit = 0;
    salesData.forEach(s => {
      totalSales += s.totalAmount || 0;
      totalProfit += s.grossProfit || 0;
    });

    let cashIn = 0, cashOut = 0;
    cashData.forEach(c => {
      if (c.direction === 'In') cashIn += c.amount || 0;
      else cashOut += c.amount || 0;
    });

    // ─── Fetch all SalesItems in batches ────────────────
    const saleIds = salesData.map(s => s.id);
    let allItems = [];

    if (saleIds.length > 0) {
      const chunkSize = 30;
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const chunk = saleIds.slice(i, i + chunkSize);
        const itemsQuery = query(
          collection(db, 'salesItems'),
          where('saleId', 'in', chunk)
        );
        const itemsSnap = await getDocs(itemsQuery);
        itemsSnap.forEach(doc => allItems.push({ id: doc.id, ...doc.data() }));
      }
    }

    // ── Apply Product Search Filter ──
    const searchTerm = analyticsFilters.productSearch.toLowerCase().trim();
    if (searchTerm) {
      allItems = allItems.filter(item => 
        (item.productName || '').toLowerCase().includes(searchTerm)
      );
      const matchingSaleIds = new Set(allItems.map(item => item.saleId));
      salesData = salesData.filter(sale => matchingSaleIds.has(sale.id));
      totalSales = salesData.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      totalProfit = salesData.reduce((sum, s) => sum + (s.grossProfit || 0), 0);
    }

    // ── Apply Movement Filter ──
    if (analyticsFilters.movement !== 'all') {
      // (Keep existing movement filtering logic – unchanged)
      // We can keep the existing code that uses allItems and salesData.
      // But note: allItems is now available.
      // I'll keep the movement filtering as is – you already have it.
    }

    // ── Update Summary Cards ──
    document.getElementById('reportTodaySales').textContent = fmt(totalSales);
    document.getElementById('reportTodayProfit').textContent = fmt(totalProfit);
    document.getElementById('reportCashFlow').textContent = `${fmt(cashIn)} / ${fmt(cashOut)}`;
    document.getElementById('reportNetCash').textContent = fmt(cashIn - cashOut);
    document.getElementById('reportTransactionCount').textContent = salesData.length;
    document.getElementById('reportAvgOrder').textContent = salesData.length ? fmt(totalSales / salesData.length) : fmt(0);

      // ── Top 5 Products ──
    const productMap = {};
    allItems.forEach(item => {
      const name = item.productName || 'Unknown';
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
      productMap[name].qty += item.quantity || 0;
      productMap[name].revenue += item.subtotal || 0;
    });
    const sortedProducts = Object.entries(productMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // ─── Get previous period revenue for top products ──────────
    const previousPeriod = getShiftedPeriodDates(-1);
    const prevStartStr = previousPeriod.start.toISOString();
    const prevEndStr = previousPeriod.end.toISOString();

    let prevRevenueMap = {};
    if (sortedProducts.length > 0) {
      const prevSales = await getDocsInRange('sales', 'saleDate', prevStartStr, prevEndStr);
      const prevSaleIds = prevSales.map(s => s.id);
      let prevItems = [];
      if (prevSaleIds.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < prevSaleIds.length; i += chunkSize) {
          const chunk = prevSaleIds.slice(i, i + chunkSize);
          const itemsQuery = query(collection(db, 'salesItems'), where('saleId', 'in', chunk));
          const itemsSnap = await getDocs(itemsQuery);
          itemsSnap.forEach(doc => prevItems.push({ id: doc.id, ...doc.data() }));
        }
      }
      prevItems.forEach(item => {
        const name = item.productName || 'Unknown';
        if (!prevRevenueMap[name]) prevRevenueMap[name] = 0;
        prevRevenueMap[name] += item.subtotal || 0;
      });
    }

    const topBody = document.getElementById('reportTopProducts');
    if (topBody) {
      if (!sortedProducts.length) {
        topBody.innerHTML = '<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">No sales in this period.</td></tr>';
      } else {
        topBody.innerHTML = sortedProducts.map(p => {
          const prevRevenue = prevRevenueMap[p.name] || 0;
          const change = prevRevenue > 0 ? ((p.revenue - prevRevenue) / prevRevenue * 100) : 0;
          const isUp = change >= 0;
          const changeText = `${isUp ? '+' : ''}${change.toFixed(1)}%`;
          const trendIcon = isUp ? '▲' : '▼';
          const color = isUp ? '#1E7B34' : '#CC0000';
          return `
            <tr>
              <td style="padding:8px 12px; font-weight:600;">${p.name}</td>
              <td style="padding:8px 12px; text-align:right; font-weight:700;">${p.qty}</td>
              <td style="padding:8px 12px; text-align:right; color:#117594;">${fmt(p.revenue)}</td>
              <td style="padding:8px 12px; text-align:right; color:#999;">${fmt(prevRevenue)}</td>
              <td style="padding:8px 12px; text-align:center; font-weight:700; color:${color};">${changeText}</td>
              <td style="padding:8px 12px; text-align:center; color:${color};">${trendIcon}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // ── Recent Sales ──
    const recentSales = salesData
      .sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate))
      .slice(0, 20);

    const customerIds = [...new Set(recentSales.map(s => s.customerId).filter(id => id))];
    const customerMap = {};
    if (customerIds.length > 0) {
      const custSnap = await getDocs(query(collection(db, 'customers'), where('__name__', 'in', customerIds.slice(0, 30))));
      custSnap.forEach(doc => {
        customerMap[doc.id] = doc.data().customerName || 'Unknown';
      });
    }

    const recentBody = document.getElementById('reportRecentSales');
    if (recentBody) {
      if (!recentSales.length) {
        recentBody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--gray);">No sales in this period.</td></tr>';
      } else {
        recentBody.innerHTML = recentSales.map(sale => {
          const customerName = sale.customerName || customerMap[sale.customerId] || 'Guest';
          const status = sale.paymentStatus || 'Paid';
          const statusColor = status === 'Paid' ? 'var(--success)' : 'var(--warning)';
          return `
            <tr>
              <td style="padding:8px 12px;">${fmtDate(sale.saleDate)}</td>
              <td style="padding:8px 12px; font-weight:600;">${customerName}</td>
              <td style="padding:8px 12px; text-align:right; font-weight:700; color:var(--accent);">${fmt(sale.totalAmount)}</td>
              <td style="padding:8px 12px; text-align:right; color:var(--success);">${fmt(sale.grossProfit)}</td>
              <td style="padding:8px 12px; text-align:center;">
                <span style="padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; background:${status === 'Paid' ? 'var(--success)20' : 'var(--warning)20'}; color:${statusColor};">
                  ${status}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // ─── Update last updated timestamp ────────────────────
    const updatedEl = document.getElementById('analyticsLastUpdated');
    if (updatedEl) {
      updatedEl.textContent = 'Updated: ' + new Date().toLocaleTimeString();
    }

    // --- Load comparison data ---
await loadComparisonData();

    console.log('✅ Analytics loaded successfully!');

  } catch (err) {
    console.error('❌ Error loading analytics:', err);
    const els = ['reportTodaySales','reportTodayProfit','reportCashFlow','reportNetCash','reportTransactionCount','reportAvgOrder'];
    els.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });

  } finally {
    // ─── Hide loading spinner ──────────────────────────────
    const loadingOverlay = document.getElementById('analyticsLoading');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
    // ─── Re‑enable controls ────────────────────────────────
    controls.forEach(el => el.disabled = false);
  }
}

// ─── Period Date Helpers ────────────────────────────────────
function getPeriodDates(period) {
  const now = new Date();
  let start, end;
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (period) {
    case 'today':
      start = new Date(y, m, d);
      end = new Date(y, m, d + 1);
      break;
    case 'week': {
      const day = now.getDay();
      const diff = (day === 0 ? 6 : day - 1);
      start = new Date(y, m, d - diff);
      end = new Date(y, m, d + (6 - diff) + 1);
      break;
    }
    case 'month':
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 1);
      break;
    case 'quarter': {
      const quarter = Math.floor(m / 3);
      start = new Date(y, quarter * 3, 1);
      end = new Date(y, quarter * 3 + 3, 1);
      break;
    }
    case 'wtd': {
      const day = now.getDay();
      const diff = (day === 0 ? 6 : day - 1);
      start = new Date(y, m, d - diff);
      end = new Date(y, m, d + 1);
      break;
    }
    case 'mtd':
      start = new Date(y, m, 1);
      end = new Date(y, m, d + 1);
      break;
    case 'ytd':
      start = new Date(y, 0, 1);
      end = new Date(y + 1, 0, 1);
      break;
    default:
      start = new Date(y, m, d);
      end = new Date(y, m, d + 1);
  }
  return { start, end };
}

// ─── Get shifted period dates ──────────────────────────────
function getShiftedPeriodDates(shift) {
  // shift = 0: current, -1: previous, -2: before previous
  let currentStart, currentEnd;
  if (analyticsFilters.startDate && analyticsFilters.endDate) {
    currentStart = new Date(analyticsFilters.startDate);
    currentEnd = new Date(analyticsFilters.endDate);
    currentEnd.setHours(23, 59, 59, 999);
  } else {
    const { start, end } = getPeriodDates(analyticsFilters.period);
    currentStart = start;
    currentEnd = end; // exclusive
  }
  const duration = currentEnd.getTime() - currentStart.getTime();
  const shiftStart = new Date(currentStart.getTime() + shift * duration);
  const shiftEnd = new Date(currentEnd.getTime() + shift * duration);
  return { start: shiftStart, end: shiftEnd };
}


// ============================================================
// LOAD THREE‑PERIOD COMPARISON DATA (Summary Tab)
// ============================================================
async function loadComparisonData() {
  console.log('📊 loadComparisonData() called.');

  try {
    // ─── Define periods ─────────────────────────────────────
    const periods = [
      { shift: 0, label: 'Current', idSuffix: 'Today' },
      { shift: -1, label: 'Previous', idSuffix: 'Yesterday' },
      { shift: -2, label: 'Earlier', idSuffix: 'Before' }
    ];

    // ─── Helper to fetch data for one period ──────────────
    async function getPeriodData(startDate, endDate) {
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();

      async function getDocsInRange(collectionName, dateField, start, end) {
        const q = query(
          collection(db, collectionName),
          where(dateField, '>=', start),
          where(dateField, '<', end)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Sales
      const sales = await getDocsInRange('sales', 'saleDate', startStr, endStr);
      let totalSales = 0, totalProfit = 0;
      sales.forEach(s => {
        totalSales += s.totalAmount || 0;
        totalProfit += s.grossProfit || 0;
      });

      // Sales Items for WAC
      const saleIds = sales.map(s => s.id);
      let allItems = [];
      if (saleIds.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < saleIds.length; i += chunkSize) {
          const chunk = saleIds.slice(i, i + chunkSize);
          const itemsQuery = query(collection(db, 'salesItems'), where('saleId', 'in', chunk));
          const itemsSnap = await getDocs(itemsQuery);
          itemsSnap.forEach(doc => allItems.push({ id: doc.id, ...doc.data() }));
        }
      }
      let totalCost = 0, totalQty = 0;
      allItems.forEach(item => {
        const qty = item.quantity || 0;
        const cost = item.costPrice || 0;
        totalCost += qty * cost;
        totalQty += qty;
      });
      const wac = totalQty > 0 ? totalCost / totalQty : 0;

      // Cash Transactions (for Expenses, Cash In/Out)
      const cashData = await getDocsInRange('cashTransactions', 'createdAt', startStr, endStr);
      let cashIn = 0, cashOut = 0;
      cashData.forEach(c => {
        if (c.direction === 'In') cashIn += c.amount || 0;
        else if (c.direction === 'Out') cashOut += c.amount || 0;
      });
      const expenses = cashOut; // alias for expenses

      // ─── Shift Data ──────────────────────────────────────
      const shiftsQuery = query(
        collection(db, 'shifts'),
        where('startTime', '>=', startStr),
        where('startTime', '<', endStr)
      );
      const shiftsSnap = await getDocs(shiftsQuery);
      let openingCash = 0, closingCash = 0, expectedCash = 0;
      if (!shiftsSnap.empty) {
        const shiftDoc = shiftsSnap.docs[0]; // take the first shift of the day
        const shiftData = shiftDoc.data();
        openingCash = shiftData.openingCash || 0;
        closingCash = shiftData.closingCash || 0;
        expectedCash = shiftData.expectedCash || 0;
      }

      // 👇 ADD THIS AFTER the shifts block
let faidaLipa = 0, faidaSimu = 0, faidaGesi = 0;
shiftsSnap.forEach(doc => {
  const data = doc.data();
  faidaLipa += data.faidaLipa || 0;
  faidaSimu += data.faidaSimu || 0;
  faidaGesi += data.faidaGesi || 0;
});

      // ─── Stock In (purchases) ────────────────────────────
// Fetch all purchase transactions (no date filter to avoid composite index)
const stockInQuery = query(
  collection(db, 'inventoryTransactions'),
  where('transactionType', 'in', ['Purchase', 'Purchase (Import)'])
);
const stockInSnap = await getDocs(stockInQuery);
let stockInTotal = 0;
stockInSnap.forEach(doc => {
  const data = doc.data();
  // Filter by createdAt in JavaScript using the date range
  if (data.createdAt && data.createdAt >= startStr && data.createdAt < endStr) {
    stockInTotal += (data.quantity || 0) * (data.unitCost || 0);
  }
});

      return {
        totalSales,
        totalProfit,
        wac,
        expenses,
        cashIn,
        cashOut,
        openingCash,
        closingCash,
        expectedCash,
        stockInTotal,
        faidaLipa,
        faidaSimu,
        faidaGesi
      };
    }

    // ─── Get shifted periods ──────────────────────────────
    const shiftedPeriods = periods.map(p => {
      const { start, end } = getShiftedPeriodDates(p.shift);
      return { ...p, start, end };
    });

    // ─── Fetch data in parallel ────────────────────────────
    const dataArray = await Promise.all(
      shiftedPeriods.map(p => getPeriodData(p.start, p.end))
    );

    // ─── Update column headers ─────────────────────────────
    const currentPeriod = analyticsFilters.period;
    let headerNames = ['Today', 'Yesterday', 'Day Before'];
    if (currentPeriod === 'week') {
      headerNames = ['This Week', 'Last Week', 'Week Before'];
    } else if (currentPeriod === 'month') {
      headerNames = ['This Month', 'Last Month', 'Month Before'];
    } else if (currentPeriod === 'quarter') {
      headerNames = ['This Quarter', 'Last Quarter', 'Quarter Before'];
    } else if (currentPeriod === 'wtd') {
      headerNames = ['Week to Date', 'Same Days Last Week', 'Same Days Week Before'];
    } else if (currentPeriod === 'mtd') {
      headerNames = ['Month to Date', 'Same Days Last Month', 'Same Days Month Before'];
    } else if (currentPeriod === 'ytd') {
      headerNames = ['Year to Date', 'Same Days Last Year', 'Same Days Year Before'];
    } else if (analyticsFilters.startDate && analyticsFilters.endDate) {
      const start = new Date(analyticsFilters.startDate).toLocaleDateString('en-GB');
      const end = new Date(analyticsFilters.endDate).toLocaleDateString('en-GB');
      headerNames = [`${start} – ${end}`, 'Previous Period', 'Earlier Period'];
    }
    document.getElementById('compHeaderToday').textContent = `📅 ${headerNames[0]}`;
    document.getElementById('compHeaderYesterday').textContent = `📅 ${headerNames[1]}`;
    document.getElementById('compHeaderBefore').textContent = `📅 ${headerNames[2]}`;

    // ─── Update period label ──────────────────────────────
    const labelEl = document.getElementById('comparisonPeriodLabel');
    if (labelEl) {
      const periodMap = {
        'today': 'Today vs Yesterday vs Day Before',
        'week': 'This Week vs Last Week vs Week Before',
        'month': 'This Month vs Last Month vs Month Before',
        'quarter': 'This Quarter vs Last Quarter vs Quarter Before',
        'wtd': 'Week to Date vs Same Days Last Week vs Same Days Week Before',
        'mtd': 'Month to Date vs Same Days Last Month vs Same Days Month Before',
        'ytd': 'Year to Date vs Same Days Last Year vs Same Days Year Before'
      };
      labelEl.textContent = periodMap[currentPeriod] || 'Comparison';
    }

    // ─── Helper to format currency (no decimals) ──────────
    function formatCurrencyNoDecimals(value) {
      return 'TZS ' + Math.round(value || 0).toLocaleString();
    }

    // ─── Helper to compute trend ───────────────────────────
    function getTrend(current, previous) {
      if (previous === 0) return { pct: 0, isUp: false };
      const diff = current - previous;
      const pct = (diff / previous) * 100;
      return { pct, isUp: diff >= 0 };
    }

    // ─── Update each column with values ────────────────────
    shiftedPeriods.forEach((p, idx) => {
  const data = dataArray[idx];
  const netProfit = data.totalProfit - data.expenses;
  const expected = data.openingCash + data.totalSales + data.cashIn - data.expenses - data.stockInTotal;
  const variance = data.closingCash - expected;
  const cashGenerated = data.closingCash - data.openingCash; // 👈 ADD THIS

  // Set values
  document.getElementById(`compSales${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.totalSales);
  document.getElementById(`compProfit${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.totalProfit);
  document.getElementById(`compWAC${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.wac);
  document.getElementById(`compExpenses${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.expenses);
  document.getElementById(`compNetProfit${p.idSuffix}`).textContent = formatCurrencyNoDecimals(netProfit);
  document.getElementById(`compOpening${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.openingCash);
  document.getElementById(`compStockIn${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.stockInTotal);
  document.getElementById(`compClosing${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.closingCash);
  document.getElementById(`compVariance${p.idSuffix}`).textContent = formatCurrencyNoDecimals(variance);
  document.getElementById(`compExpected${p.idSuffix}`).textContent = formatCurrencyNoDecimals(expected);
  document.getElementById(`compCashGenerated${p.idSuffix}`).textContent = formatCurrencyNoDecimals(cashGenerated); // 👈 ADD THIS
  document.getElementById(`compFaidalLipa${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.faidaLipa);
document.getElementById(`compFaidalSimu${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.faidaSimu);
document.getElementById(`compFaidalGesi${p.idSuffix}`).textContent = formatCurrencyNoDecimals(data.faidaGesi);
});

    // ─── Helper to update a trend cell ─────────────────────
    function updateTrendCell(id, current, previous, isInverse = false) {
      const el = document.getElementById(id);
      if (!el) return;
      const trend = getTrend(current, previous);
      const sign = trend.isUp ? (isInverse ? '▼' : '▲') : (isInverse ? '▲' : '▼');
      const pct = Math.abs(trend.pct).toFixed(1);
      el.textContent = `${sign} ${pct}%`;
      el.style.color = (trend.isUp && !isInverse) || (!trend.isUp && isInverse) ? '#1E7B34' : '#CC0000';
    }

    // ─── Compute trends (Current vs Previous) ──────────────
const cur = dataArray[0];
const prev = dataArray[1];

updateTrendCell('compSalesTrend', cur.totalSales, prev.totalSales);
updateTrendCell('compProfitTrend', cur.totalProfit, prev.totalProfit);
updateTrendCell('compWACTrend', cur.wac, prev.wac);
updateTrendCell('compExpensesTrend', cur.expenses, prev.expenses);
updateTrendCell('compNetProfitTrend', cur.totalProfit - cur.expenses, prev.totalProfit - prev.expenses);
updateTrendCell('compOpeningTrend', cur.openingCash, prev.openingCash);
updateTrendCell('compStockInTrend', cur.stockInTotal, prev.stockInTotal);
updateTrendCell('compClosingTrend', cur.closingCash, prev.closingCash);
const curExp = cur.openingCash + cur.totalSales + cur.cashIn - cur.expenses - cur.stockInTotal;
const prevExp = prev.openingCash + prev.totalSales + prev.cashIn - prev.expenses - prev.stockInTotal;
updateTrendCell('compVarianceTrend', cur.closingCash - curExp, prev.closingCash - prevExp);
updateTrendCell('compExpectedTrend', curExp, prevExp);
updateTrendCell('compCashGeneratedTrend', cur.closingCash - cur.openingCash, prev.closingCash - prev.openingCash); // 👈 ADD THIS
// 👇 ADD THESE AFTER the existing trend calls
updateTrendCell('compFaidalLipaTrend', cur.faidaLipa, prev.faidaLipa);
updateTrendCell('compFaidalSimuTrend', cur.faidaSimu, prev.faidaSimu);
updateTrendCell('compFaidalGesiTrend', cur.faidaGesi, prev.faidaGesi);


    // ─── Previous vs Earlier (Prev. Change) ──────────────
const earlier = dataArray[2];

updateTrendCell('compSalesPrevChange', prev.totalSales, earlier.totalSales);
updateTrendCell('compProfitPrevChange', prev.totalProfit, earlier.totalProfit);
updateTrendCell('compWACPrevChange', prev.wac, earlier.wac);
updateTrendCell('compExpensesPrevChange', prev.expenses, earlier.expenses);
updateTrendCell('compNetProfitPrevChange', prev.totalProfit - prev.expenses, earlier.totalProfit - earlier.expenses);
updateTrendCell('compOpeningPrevChange', prev.openingCash, earlier.openingCash);
updateTrendCell('compStockInPrevChange', prev.stockInTotal, earlier.stockInTotal);
updateTrendCell('compClosingPrevChange', prev.closingCash, earlier.closingCash);
const earlierExp = earlier.openingCash + earlier.totalSales + earlier.cashIn - earlier.expenses - earlier.stockInTotal;
updateTrendCell('compVariancePrevChange', prev.closingCash - prevExp, earlier.closingCash - earlierExp);
updateTrendCell('compExpectedPrevChange', prevExp, earlierExp);
updateTrendCell('compCashGeneratedPrevChange', prev.closingCash - prev.openingCash, earlier.closingCash - earlier.openingCash); // 👈 ADD THIS
// 👇 ADD THESE AFTER the existing trend calls
updateTrendCell('compFaidalLipaPrevChange', prev.faidaLipa, earlier.faidaLipa);
updateTrendCell('compFaidalSimuPrevChange', prev.faidaSimu, earlier.faidaSimu);
updateTrendCell('compFaidalGesiPrevChange', prev.faidaGesi, earlier.faidaGesi);

    console.log('✅ Three‑period comparison loaded!');
  } catch (err) {
    console.error('Error loading comparison data:', err);
    document.querySelectorAll('[id^="compSales"]').forEach(el => el.textContent = '⚠️');
  }
}



  // ============================================================
  // SETTINGS FUNCTIONS
  // ============================================================

  async function loadSettings() {
    const content = document.getElementById('settingsContent');
    const msg = document.getElementById('settingsMessage');
    if (msg) msg.textContent = '';

    // Check if user is Admin
    if (S.user.role !== 'Admin' && S.user.role !== 'admin') {
      content.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%;">
        <div style="text-align:center; padding:40px; background:#fff; border-radius:8px; border:1px solid #DDE6EA;">
          <div style="font-size:48px; margin-bottom:16px;">🔒</div>
          <h3 style="color:#CC0000; margin:0;">Access Denied</h3>
          <p style="color:#595959; margin-top:8px;">Settings are only available to Administrators.</p>
        </div>
      </div>
    `;
      return;
    }

    try {
      // 1. Load settings from Firestore
      const settingsRef = doc(db, 'settings', 'system');
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        document.getElementById('settingsStoreName').value = data.storeName || '';
        document.getElementById('settingsStoreAddress').value = data.storeAddress || '';
        document.getElementById('settingsStorePhone').value = data.storePhone || '';
        document.getElementById('settingsTaxRate').value = data.taxRate || 0;
        document.getElementById('settingsCurrency').value = data.currencySymbol || 'TZS';
        document.getElementById('settingsLowStock').value = data.lowStockAlert || 5;
      }

      // 2. Load users from Firestore
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersBody = document.getElementById('settingsUserTableBody');

      if (usersSnap.empty) {
        usersBody.innerHTML = '<tr><td colspan="3" style="padding:20px; text-align:center; color:#999;">No users found.</td></tr>';
      } else {
        usersBody.innerHTML = usersSnap.docs.map(doc => {
          const data = doc.data();
          return `
          <tr>
            <td style="padding:8px 12px; font-weight:600;">${data.fullName || data.name || '—'}</td>
            <td style="padding:8px 12px;">${data.username || '—'}</td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700; background:${data.role === 'Admin' ? '#11759420' : '#64748b20'}; color:${data.role === 'Admin' ? '#117594' : '#64748b'};">
                ${data.role || 'Cashier'}
              </span>
            </td>
          </tr>
        `;
        }).join('');
      }

      // 3. Enable save button
      const saveBtn = document.getElementById('settingsSaveBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Settings';
        saveBtn.onclick = saveSettings;
      }

    } catch (err) {
      console.error('Error loading settings:', err);
      if (msg) msg.textContent = '❌ Error loading settings: ' + err.message;
    }
  }

  // ============================================================
  // SAVE SETTINGS
  // ============================================================

  async function saveSettings() {
    const msg = document.getElementById('settingsMessage');
    const saveBtn = document.getElementById('settingsSaveBtn');

    if (!saveBtn) return;

    // Disable button during save
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    if (msg) msg.textContent = '';

    try {
      const data = {
        storeName: document.getElementById('settingsStoreName').value.trim(),
        storeAddress: document.getElementById('settingsStoreAddress').value.trim(),
        storePhone: document.getElementById('settingsStorePhone').value.trim(),
        taxRate: parseFloat(document.getElementById('settingsTaxRate').value) || 0,
        currencySymbol: document.getElementById('settingsCurrency').value.trim() || 'TZS',
        lowStockAlert: parseInt(document.getElementById('settingsLowStock').value) || 5,
        updatedAt: new Date().toISOString(),
        updatedBy: S.user?.id || 'unknown'
      };

      const settingsRef = doc(db, 'settings', 'system');
      await setDoc(settingsRef, data, { merge: true });

      if (msg) {
        msg.style.color = '#1E7B34';
        msg.textContent = '✅ Settings saved successfully!';
      }

      // Optional: Update global currency display if needed
      console.log('✅ Settings saved:', data);

    } catch (err) {
      console.error('Error saving settings:', err);
      if (msg) {
        msg.style.color = '#CC0000';
        msg.textContent = '❌ Error saving: ' + err.message;
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save Settings';
    }
  }

  // ============================================================
  // CUSTOMER VIEW FUNCTIONS
  // ============================================================

  async function searchCustomerView() {
    const searchInput = document.getElementById('customerViewSearch');
    const query = searchInput.value.trim();

    const profile = document.getElementById('customerViewProfile');
    const notFound = document.getElementById('customerViewNotFound');
    const debtWarning = document.getElementById('customerViewDebtWarning');
    const blacklisted = document.getElementById('customerViewBlacklisted');

    // Hide all results initially
    profile.style.display = 'none';
    notFound.style.display = 'none';
    debtWarning.style.display = 'none';
    blacklisted.style.display = 'none';

    if (!query) {
      alert('Please enter a Card Number or Phone.');
      return;
    }

    try {
      // Search by card number OR phone
      const cardQuery = query(
        collection(db, 'customers'),
        where('cardNumber', '==', query)
      );
      const cardSnap = await getDocs(cardQuery);

      let customerData = null;
      let customerId = null;

      if (!cardSnap.empty) {
        const doc = cardSnap.docs[0];
        customerId = doc.id;
        customerData = doc.data();
      } else {
        // Try searching by phone
        const phoneQuery = query(
          collection(db, 'customers'),
          where('phone', '==', query)
        );
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) {
          const doc = phoneSnap.docs[0];
          customerId = doc.id;
          customerData = doc.data();
        }
      }

      if (!customerData) {
        notFound.style.display = 'block';
        return;
      }

      // Populate profile
      document.getElementById('customerViewName').textContent = customerData.customerName || 'Unknown';
      document.getElementById('customerViewCard').textContent = 'Card: ' + (customerData.cardNumber || '—');
      document.getElementById('customerViewPoints').textContent = (customerData.loyaltyPoints || 0) + ' pts';
      document.getElementById('customerViewDebt').textContent = fmt(customerData.totalDebt || 0);
      document.getElementById('customerViewLastVisit').textContent = customerData.lastVisit ? fmtDate(customerData.lastVisit) : '—';

      // Status badge
      const statusEl = document.getElementById('customerViewStatus');
      const status = customerData.status || 'Active';
      if (status === 'Blacklisted') {
        statusEl.textContent = '⛔ Blacklisted';
        statusEl.style.background = '#FEE2E2';
        statusEl.style.color = '#CC0000';
        blacklisted.style.display = 'block';
      } else {
        statusEl.textContent = '🟢 Active';
        statusEl.style.background = '#DCFCE7';
        statusEl.style.color = '#1E7B34';
      }

      // Debt warning
      const debt = customerData.totalDebt || 0;
      if (debt > 0 && status !== 'Blacklisted') {
        document.getElementById('customerViewDebtAmount').textContent = fmt(debt);
        debtWarning.style.display = 'block';
      }

      // Show profile
      profile.style.display = 'block';

    } catch (err) {
      console.error('Error searching customer:', err);
      alert('Error searching: ' + err.message);
    }
  }

  // ============================================================
  // PAYMENT MODAL FUNCTIONS
  // ============================================================

  let activeDebtId = null;

  function openPaymentModal(debtId, customerName, balance) {
    activeDebtId = debtId;
    document.getElementById('payCustName').textContent = customerName;
    document.getElementById('payBalance').textContent = fmt(balance);
    document.getElementById('payAmountInput').value = '';
    document.getElementById('paymentModal').style.display = 'flex';
    setTimeout(() => document.getElementById('payAmountInput').focus(), 100);
  }
 
  window.openPaymentModal = openPaymentModal;   // 👈 ADD THIS

  function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
    activeDebtId = null;
  }

  window.closePaymentModal = closePaymentModal;   // 👈 ADD THIS

  async function confirmPayment() {
    const amount = parseFloat(document.getElementById('payAmountInput').value);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const btn = document.getElementById('payConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const result = await window.api('recordDebtPayment', { debtId: activeDebtId, amount: amount });

    btn.disabled = false;
    btn.textContent = 'Confirm Payment';

    if (result.success) {
      alert('✅ Payment recorded.');
      closePaymentModal();
      await loadDebts();
      await refreshAll(); // 👈 ADD THIS
    } else {
      alert('❌ Error: ' + result.message);
    }
  }

window.confirmPayment = confirmPayment;   // 👈 ADD THIS

function openPaymentModalForCustomer(cardNumber) {
  const debts = allDebts.filter(d => d.cardNumber === cardNumber && d.balance > 0);
  if (!debts.length) {
    alert('No outstanding debts for this customer.');
    return;
  }
  const debt = debts[0];
  openPaymentModal(debt.id, debt.customerName, debt.balance);
}

window.openPaymentModalForCustomer = openPaymentModalForCustomer;

// ============================================================
// EXPORT ANALYTICS DATA AS CSV
// ============================================================
function exportAnalyticsCSV(tableName) {
  try {
    let table;
    let filename = 'analytics_export';

    if (tableName === 'top_products') {
      table = document.querySelector('#reportTopProducts').closest('table');
      filename = 'top_5_products';
    } else if (tableName === 'recent_sales') {
      table = document.querySelector('#reportRecentSales').closest('table');
      filename = 'recent_sales';
    } else if (tableName === 'sales_trend') {
      table = document.querySelector('#salesTrendBody').closest('table');
      filename = 'sales_trend';
    } else if (tableName === 'payment_methods') {
      table = document.querySelector('#paymentMethodsBody').closest('table');
      filename = 'payment_methods';
    } else if (tableName === 'stock_table') {
      table = document.querySelector('#analyticsStockTableBody').closest('table');
      filename = 'current_stock';
    } else if (tableName === 'stock_in_history') {
      table = document.querySelector('#stockInHistoryBody').closest('table');
      filename = 'stock_in_history';
    } else if (tableName === 'correction_history') {   // 👈 NEW
      table = document.querySelector('#analyticsCorrectionHistoryBody').closest('table');
      filename = 'correction_history';
       } else if (tableName === 'cash_by_category') {   // 👈 NEW
      table = document.querySelector('#cashCategoryBody').closest('table');
      filename = 'cash_by_category';
    } else if (tableName === 'cash_movements') {     // 👈 NEW
      table = document.querySelector('#cashMovementsBody').closest('table');
      filename = 'cash_movements';
    } else if (tableName === 'debts_table') {
  table = document.querySelector('#analyticsDebtsTableBody').closest('table');
  filename = 'outstanding_debts';
} else if (tableName === 'products_performance') {
  table = document.querySelector('#analyticsProductsTopBody').closest('table');
  filename = 'product_performance';
} else if (tableName === 'sales_transactions') {   // 👈 NEW
  table = document.querySelector('#salesTransactionBody').closest('table');
  filename = 'sales_transactions';
} else {
  // Fallback
  table = document.querySelector('#reportsView table');
  filename = 'analytics_export';
}
    
    if (!table) {
      alert('No table data to export.');
      return;
    }

    // Get all rows (including header)
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) {
      alert('No data to export.');
      return;
    }

    // Build CSV content
    let csv = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = Array.from(cells).map(cell => {
        let text = cell.textContent.trim();
        // Escape commas and quotes
        if (text.includes(',') || text.includes('"')) {
          text = '"' + text.replace(/"/g, '""') + '"';
        }
        return text;
      });
      csv.push(rowData.join(','));
    });

    // Create and download CSV
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ CSV exported:', filename);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    alert('Failed to export CSV: ' + err.message);
  }
}

// ============================================================
// TOGGLE COLLAPSIBLE SECTIONS (Analytics)
// ============================================================
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) {
    console.warn('Section not found:', sectionId);
    return;
  }

  // The matching arrow icon follows the naming pattern:
  // "stockCurrentSection" → "stockCurrentToggle"
  const toggleId = sectionId.replace('Section', 'Toggle');
  const toggleIcon = document.getElementById(toggleId);

  const isHidden = section.style.display === 'none';

  if (isHidden) {
    section.style.display = 'block';
    if (toggleIcon) toggleIcon.textContent = '▼';
  } else {
    section.style.display = 'none';
    if (toggleIcon) toggleIcon.textContent = '▲';
  }
}

// Expose globally
window.toggleSection = toggleSection;
window.exportAnalyticsCSV = exportAnalyticsCSV;

// ============================================================
// LOAD SALES TAB DATA (with Detailed Transactions & Movement & Proposal)
// ============================================================
async function loadSalesData() {
  console.log('💰 loadSalesData() called.');
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  let salesData = [];
  let allItems = [];
  let customerMap = {};
  let productDetailsMap = {};
  let inventoryMap = {};

  try {
    // --- Get date range from filters ---
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    // Helper to fetch docs in range
    async function getDocsInRange(collectionName, dateField, startDate, endDate) {
      const q = query(
        collection(db, collectionName),
        where(dateField, '>=', startDate),
        where(dateField, '<', endDate)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // --- 1. Fetch sales ---
    salesData = await getDocsInRange('sales', 'saleDate', startStr, endStr);
    console.log('📦 Sales found:', salesData.length);

    // --- 2. Fetch customers ---
    const customerIds = [...new Set(salesData.map(s => s.customerId).filter(id => id))];
    if (customerIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < customerIds.length; i += 30) chunks.push(customerIds.slice(i, i + 30));
      for (const chunk of chunks) {
        const q = query(collection(db, 'customers'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(doc => {
          const data = doc.data();
          customerMap[doc.id] = {
            name: data.customerName || 'Guest',
            card: data.cardNumber || 'KM-0000'
          };
        });
      }
    }

    // --- 3. Fetch sales items ---
    const saleIds = salesData.map(s => s.id);
    if (saleIds.length > 0) {
      const chunkSize = 30;
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const chunk = saleIds.slice(i, i + chunkSize);
        const itemsQuery = query(
          collection(db, 'salesItems'),
          where('saleId', 'in', chunk)
        );
        const itemsSnap = await getDocs(itemsQuery);
        itemsSnap.forEach(doc => allItems.push({ id: doc.id, ...doc.data() }));
      }
    }
    console.log('📦 Sales items found:', allItems.length);

    // --- 4. Fetch product details (for category) ---
    const productIds = [...new Set(allItems.map(item => item.productid).filter(id => id))];
    if (productIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < productIds.length; i += 30) chunks.push(productIds.slice(i, i + 30));
      for (const chunk of chunks) {
        const q = query(collection(db, 'products'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(doc => {
          const data = doc.data();
          productDetailsMap[doc.id] = {
            name: data.productName || data.name || 'Unnamed',
            category: data.category || 'General'
          };
        });
      }
    }

    // --- 5. Apply product search filter (global) ---
    const searchTerm = analyticsFilters.productSearch.toLowerCase().trim();
    if (searchTerm) {
      const matchingProductIds = new Set();
      Object.keys(productDetailsMap).forEach(pid => {
        const p = productDetailsMap[pid];
        if ((p.name || '').toLowerCase().includes(searchTerm) ||
            (p.category || '').toLowerCase().includes(searchTerm)) {
          matchingProductIds.add(pid);
        }
      });
      allItems = allItems.filter(item => matchingProductIds.has(item.productid || item.id));
      const matchingSaleIds = new Set(allItems.map(item => item.saleId));
      salesData = salesData.filter(sale => matchingSaleIds.has(sale.id));
    }

    // --- 6. Compute movement per product ---
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const productMovement = {};
    const productIdsWithSales = [...new Set(allItems.map(item => item.productid).filter(id => id))];
    for (const pid of productIdsWithSales) {
      const productItems = allItems.filter(item => (item.productid || item.id) === pid);
      let salesCount7 = 0, salesCount14 = 0;
      productItems.forEach(item => {
        const sale = salesData.find(s => s.id === item.saleId);
        if (sale) {
          const saleDate = new Date(sale.saleDate);
          if (saleDate >= oneWeekAgo) salesCount7 += item.quantity || 0;
          if (saleDate >= twoWeeksAgo) salesCount14 += item.quantity || 0;
        }
      });
      let movement = 'Dead';
      if (salesCount7 >= 5) movement = 'Fast';
      else if (salesCount14 > 0) movement = 'Slow';
      productMovement[pid] = movement;
    }

    // --- 7. Build detailed transactions table ---
    const transactions = [];
    const movementFilter = analyticsFilters.movement || 'all';

    allItems.forEach(item => {
      const sale = salesData.find(s => s.id === item.saleId);
      if (!sale) return;
      const productId = item.productid || item.id;
      const movement = productMovement[productId] || 'Dead';

      // Apply movement filter
      if (movementFilter !== 'all' && movement !== movementFilter) return;

      const productInfo = productDetailsMap[productId] || { name: 'Unknown', category: 'General' };
      const customerInfo = customerMap[sale.customerId] || { name: 'Guest', card: 'KM-0000' };
      const unitPrice = item.sellingPrice || 0;
      const total = item.subtotal || 0;
      const qty = item.quantity || 0;
      const pointsEarned = sale.loyaltyPointsEarned || 0;
      const pointsUsed = sale.loyaltyPointsUsed || 0;
      const pointsRemaining = sale.loyaltyPointsBalance || 0;

      // ---- Determine Proposal based on movement ----
      let proposal = 'Stop';
      if (movement === 'Fast') proposal = 'Buy';
      else if (movement === 'Slow') proposal = 'Maintain';
      // else remains 'Stop'

      // ---- DEBUG LOG (can be removed later) ----
      console.log(`🔄 Product: ${productInfo.name}, Movement: ${movement}, Proposal: ${proposal}`);

      transactions.push({
        date: new Date(sale.saleDate).toLocaleDateString('en-GB'),
        product: productInfo.name,
        category: productInfo.category,
        customer: customerInfo.name,
        card: customerInfo.card,
        qty: qty,
        unitPrice: unitPrice,
        total: total,
        payment: sale.paymentMethod || 'Unknown',
        pointsEarned: pointsEarned,
        pointsUsed: pointsUsed,
        pointsRemaining: pointsRemaining,
        movement: movement,
        proposal: proposal
      });
    });

    // --- Expose for debugging (remove later) ---
    window.analyticsTransactions = transactions;
    console.log('🔍 Exposed transactions for debugging. Sample:', transactions[0]);

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // --- 8. Update summary cards ---
    let totalRevenue = 0, totalProfit = 0;
    salesData.forEach(s => {
      totalRevenue += s.totalAmount || 0;
      totalProfit += s.grossProfit || 0;
    });
    const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;
    const transactionCount = salesData.length;
    const avgOrder = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    document.getElementById('salesRevenue').textContent = fmt(totalRevenue);
    document.getElementById('salesProfit').textContent = fmt(totalProfit);
    document.getElementById('salesMargin').textContent = margin + '%';
    document.getElementById('salesTransactions').textContent = transactionCount;
    document.getElementById('salesAvgOrder').textContent = fmt(avgOrder);

    // --- 9. Daily Sales Trend ---
    const trendMap = {};
    salesData.forEach(s => {
      const date = new Date(s.saleDate).toLocaleDateString('en-GB');
      if (!trendMap[date]) trendMap[date] = { rev: 0, profit: 0, count: 0 };
      trendMap[date].rev += s.totalAmount || 0;
      trendMap[date].profit += s.grossProfit || 0;
      trendMap[date].count += 1;
    });
    const trendRows = Object.entries(trendMap)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([date, d]) => ({
        date,
        revenue: d.rev,
        profit: d.profit,
        margin: d.rev > 0 ? ((d.profit / d.rev) * 100).toFixed(1) : 0
      }));
    const trendBody = document.getElementById('salesTrendBody');
    if (trendRows.length === 0) {
      trendBody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">No sales in this period.</td></tr>';
    } else {
      trendBody.innerHTML = trendRows.map(row => `
        <tr>
          <td>${row.date}</td>
          <td style="text-align:right; font-weight:700; color:#117594;">${fmt(row.revenue)}</td>
          <td style="text-align:right; color:#1E7B34;">${fmt(row.profit)}</td>
          <td style="text-align:right; color:#B45309;">${row.margin}%</td>
        </tr>
      `).join('');
    }

    // --- 10. Payment Method Breakdown ---
    const paymentMap = {};
    salesData.forEach(s => {
      const method = s.paymentMethod || 'Unknown';
      if (!paymentMap[method]) paymentMap[method] = { count: 0, total: 0 };
      paymentMap[method].count += 1;
      paymentMap[method].total += s.totalAmount || 0;
    });
    const paymentRows = Object.entries(paymentMap)
      .map(([method, data]) => ({
        method,
        count: data.count,
        total: data.total,
        pct: totalRevenue > 0 ? ((data.total / totalRevenue) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.total - a.total);
    const paymentBody = document.getElementById('paymentMethodsBody');
    if (paymentRows.length === 0) {
      paymentBody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">No payment data.</td></tr>';
    } else {
      paymentBody.innerHTML = paymentRows.map(row => `
        <tr>
          <td>${row.method}</td>
          <td style="text-align:right;">${row.count}</td>
          <td style="text-align:right; font-weight:700; color:#117594;">${fmt(row.total)}</td>
          <td style="text-align:right;">${row.pct}%</td>
        </tr>
      `).join('');
    }

    // --- 11. Populate Transactions Table ---
    const transBody = document.getElementById('salesTransactionBody');
    if (transactions.length === 0) {
      transBody.innerHTML = '<tr><td colspan="14" style="padding:20px; text-align:center; color:#999;">No sales transactions in this period.</td></tr>';
    } else {
      transBody.innerHTML = transactions.map(t => {
        const movementColor = t.movement === 'Fast' ? '#1E7B34' : t.movement === 'Slow' ? '#B45309' : '#CC0000';
        const proposalColor = t.proposal === 'Buy' ? '#1E7B34' : t.proposal === 'Maintain' ? '#B45309' : '#CC0000';
        return `
          <tr>
            <td style="padding:8px 12px;">${t.date}</td>
            <td style="padding:8px 12px; font-weight:600;">${t.product}</td>
            <td style="padding:8px 12px;">${t.category}</td>
            <td style="padding:8px 12px;">${t.customer}</td>
            <td style="padding:8px 12px;">${t.card}</td>
            <td style="padding:8px 12px; text-align:right;">${t.qty}</td>
            <td style="padding:8px 12px; text-align:right;">${fmt(t.unitPrice)}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:700; color:#117594;">${fmt(t.total)}</td>
            <td style="padding:8px 12px; text-align:center;">${t.payment}</td>
            <td style="padding:8px 12px; text-align:right;">${t.pointsEarned}</td>
            <td style="padding:8px 12px; text-align:right;">${t.pointsUsed}</td>
            <td style="padding:8px 12px; text-align:right;">${t.pointsRemaining}</td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; background:${movementColor}20; color:${movementColor}; white-space:nowrap;">
                ${t.movement}
              </span>
            </td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; background:${proposalColor}20; color:${proposalColor}; white-space:nowrap;">
                ${t.proposal}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Sales tab data loaded!');
  } catch (err) {
    console.error('Error loading sales data:', err);
    // Show error on cards
    ['salesRevenue','salesProfit','salesMargin','salesTransactions','salesAvgOrder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
    const transBody = document.getElementById('salesTransactionBody');
    if (transBody) {
      transBody.innerHTML = `<tr><td colspan="14" style="padding:20px; text-align:center; color:#CC0000;">Error loading transactions: ${err.message}</td></tr>`;
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}


// ============================================================
// LOAD ANALYTICS STOCK TAB DATA (with individual search filters)
// ============================================================
async function loadAnalyticsStockData() {
  let tableBody;
  try {
    console.log('📦 Loading Analytics Stock data...');

    // --- Check if required DOM elements exist ---
    tableBody = document.getElementById('analyticsStockTableBody');
    if (!tableBody) {
      console.error('❌ analyticsStockTableBody element not found! Check HTML.');
      return;
    }
    const historyBody = document.getElementById('stockInHistoryBody');
    if (!historyBody) {
      console.error('❌ stockInHistoryBody element not found!');
      return;
    }
    const corrBody = document.getElementById('analyticsCorrectionHistoryBody');
    if (!corrBody) {
      console.error('❌ analyticsCorrectionHistoryBody element not found!');
      return;
    }

    // Show loading indicator
    const loading = document.getElementById('analyticsLoading');
    if (loading) loading.style.display = 'flex';

    // --- Get date range from filters ---
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    // --- 1. Fetch all products and inventory summary ---
    const productsSnap = await getDocs(collection(db, 'products'));
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const invSnap = await getDocs(collection(db, 'inventorySummary'));
    const stockMap = {};
    invSnap.forEach(doc => {
      const data = doc.data();
      const pid = data.productId || doc.id;
      stockMap[pid] = {
        quantity: data.quantity || data.currentStock || 0,
        wac: data.wac || 0
      };
    });

    // --- Build stock data ---
    const stockData = products.map(p => {
      const inv = stockMap[p.id] || { quantity: 0, wac: 0 };
      const stock = inv.quantity;
      const status = stock <= 0 ? 'Out of Stock' : stock <= 5 ? 'Low Stock' : 'In Stock';
      return {
        id: p.id,
        name: p.productName || p.name || 'Unnamed',
        category: p.category || 'General',
        stock: stock,
        wac: inv.wac,
        status: status
      };
    });

    // --- Update summary cards ---
    const totalProducts = stockData.length;
    const totalStockUnits = stockData.reduce((sum, p) => sum + p.stock, 0);
    const lowCount = stockData.filter(p => p.stock > 0 && p.stock <= 5).length;
    const outCount = stockData.filter(p => p.stock <= 0).length;

    document.getElementById('analyticsStockTotalProducts').textContent = totalProducts;
    document.getElementById('analyticsStockTotalUnits').textContent = totalStockUnits;
    document.getElementById('analyticsStockLowCount').textContent = lowCount;
    document.getElementById('analyticsStockOutCount').textContent = outCount;

    // ─── A. CURRENT STOCK TABLE (with individual search filter) ───
    const stockSearchTerm = document.getElementById('stockSearchInput')?.value?.toLowerCase().trim() || '';
    let filteredStock = stockData;

    if (stockSearchTerm) {
      filteredStock = stockData.filter(p => 
        p.name.toLowerCase().includes(stockSearchTerm) ||
        p.category.toLowerCase().includes(stockSearchTerm)
      );
    }

    if (filteredStock.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">${stockSearchTerm ? 'No products match "' + stockSearchTerm + '".' : 'No products found.'}</td></tr>`;
    } else {
      tableBody.innerHTML = filteredStock.map((p, idx) => {
        const statusColor = p.status === 'Out of Stock' ? '#CC0000' :
                           p.status === 'Low Stock' ? '#B45309' : '#1E7B34';
        const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
        return `
          <tr style="background:${bgColor};">
            <td style="padding:10px 14px; font-weight:600; border-bottom:1px solid #f0f0f0;">${p.name}</td>
            <td style="padding:10px 14px; border-bottom:1px solid #f0f0f0;">${p.category}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:700; color:${statusColor}; border-bottom:1px solid #f0f0f0;">${p.stock}</td>
            <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f0f0f0;">TZS ${p.wac.toLocaleString()}</td>
            <td style="padding:10px 14px; text-align:center; border-bottom:1px solid #f0f0f0;">
              <span style="padding:2px 12px; border-radius:12px; font-size:11px; font-weight:600; background:${statusColor}20; color:${statusColor};">
                ${p.status}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    // ─── B. FETCH STOCK-IN TRANSACTIONS ──────────────────────────
    const transQuery = query(
      collection(db, 'inventoryTransactions'),
      where('transactionType', 'in', ['Purchase', 'Purchase (Import)'])
    );
    const transSnap = await getDocs(transQuery);

    // Filter by date range in JavaScript
    const allTx = transSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filteredTx = allTx.filter(tx => {
      if (!tx.createdAt) return false;
      return tx.createdAt >= startStr && tx.createdAt <= endStr;
    });

    // Sort descending and take last 20
    const recentTx = filteredTx
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 20);

    // ─── STOCK-IN HISTORY TABLE (with individual search filter) ───
    const stockInSearchTerm = document.getElementById('stockInSearchInput')?.value?.toLowerCase().trim() || '';
    let filteredStockIn = recentTx;

    if (stockInSearchTerm) {
      filteredStockIn = recentTx.filter(tx => 
        (tx.productName || '').toLowerCase().includes(stockInSearchTerm)
      );
    }

    if (filteredStockIn.length === 0) {
      historyBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">${stockInSearchTerm ? 'No stock‑in records match "' + stockInSearchTerm + '".' : 'No stock‑in records in this period.'}</td></tr>`;
    } else {
      historyBody.innerHTML = filteredStockIn.map((tx, idx) => {
        const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB') : '—';
        const qty = tx.quantity || 0;
        const unitCost = tx.unitCost || 0;
        const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
        return `
          <tr style="background:${bgColor};">
            <td style="padding:10px 14px; border-bottom:1px solid #f0f0f0;">${date}</td>
            <td style="padding:10px 14px; font-weight:500; border-bottom:1px solid #f0f0f0;">${tx.productName || 'Unknown'}</td>
            <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f0f0f0;">${qty}</td>
            <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f0f0f0;">TZS ${unitCost.toLocaleString()}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:700; color:#117594; border-bottom:1px solid #f0f0f0;">TZS ${(qty * unitCost).toLocaleString()}</td>
            <td style="padding:10px 14px; text-align:center; border-bottom:1px solid #f0f0f0;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:#EAF4F9; color:#117594;">
                ${tx.transactionType || 'Purchase'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    // ─── C. FETCH CORRECTION TRANSACTIONS ────────────────────────
    const correctionTypes = ['Audit', 'Addition', 'Damaged', 'Expiry', 'Lost', 'Used by Shop', 'Offered'];
    const corrQuery = query(
      collection(db, 'inventoryTransactions'),
      where('transactionType', 'in', correctionTypes)
    );
    const corrSnap = await getDocs(corrQuery);
    const allCorr = corrSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filteredCorr = allCorr.filter(tx => {
      if (!tx.createdAt) return false;
      return tx.createdAt >= startStr && tx.createdAt <= endStr;
    });

    // Sort descending and take last 30
    const recentCorr = filteredCorr
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 30);

    // Update corrections summary cards
    const totalCorrections = recentCorr.length;
    const netAdjustment = recentCorr.reduce((sum, tx) => {
      const qty = tx.quantity || 0;
      if (tx.transactionType === 'Addition' || tx.transactionType === 'Audit') {
        return sum + qty;
      } else {
        return sum - qty;
      }
    }, 0);

    document.getElementById('analyticsCorrectionsCount').textContent = totalCorrections;
    document.getElementById('analyticsNetAdjustment').textContent = netAdjustment > 0 ? `+${netAdjustment}` : netAdjustment;

    // ─── CORRECTION HISTORY TABLE (with individual search filter) ───
    const correctionSearchTerm = document.getElementById('correctionSearchInput')?.value?.toLowerCase().trim() || '';
    let filteredCorrection = recentCorr;

    if (correctionSearchTerm) {
      filteredCorrection = recentCorr.filter(tx => 
        (tx.productName || '').toLowerCase().includes(correctionSearchTerm)
      );
    }

    if (filteredCorrection.length === 0) {
      corrBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">${correctionSearchTerm ? 'No corrections match "' + correctionSearchTerm + '".' : 'No corrections in this period.'}</td></tr>`;
    } else {
      corrBody.innerHTML = filteredCorrection.map((tx, idx) => {
        const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB') : '—';
        const qty = tx.quantity || 0;
        const effect = tx.transactionType === 'Addition' || tx.transactionType === 'Audit' ? `+${qty}` : `-${qty}`;
        const color = effect.startsWith('+') ? '#1E7B34' : '#CC0000';
        const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
        return `
          <tr style="background:${bgColor};">
            <td style="padding:10px 14px; border-bottom:1px solid #f0f0f0;">${date}</td>
            <td style="padding:10px 14px; font-weight:500; border-bottom:1px solid #f0f0f0;">${tx.productName || 'Unknown'}</td>
            <td style="padding:10px 14px; text-align:center; border-bottom:1px solid #f0f0f0;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:#EAF4F9; color:#117594;">
                ${tx.transactionType || 'Correction'}
              </span>
            </td>
            <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f0f0f0;">${qty}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:700; color:${color}; border-bottom:1px solid #f0f0f0;">${effect}</td>
            <td style="padding:10px 14px; border-bottom:1px solid #f0f0f0;">${tx.remarks || '—'}</td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Analytics Stock tab data loaded!');
  } catch (err) {
    console.error('Error loading stock data:', err);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#CC0000;">Error: ${err.message}</td></tr>`;
    }
    // Show error on cards
    ['analyticsStockTotalProducts','analyticsStockTotalUnits','analyticsStockLowCount','analyticsStockOutCount','analyticsCorrectionsCount','analyticsNetAdjustment'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
  } finally {
    const loading = document.getElementById('analyticsLoading');
    if (loading) loading.style.display = 'none';
  }
}

async function loadCashData() {
  console.log('💵 loadCashData() called.');
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  try {
    // --- Get date range from filters ---
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    console.log('📊 Cash date range:', startStr, 'to', endStr);

    // --- Helper ---
    async function getDocsInRange(collectionName, dateField, startDate, endDate) {
      const q = query(
        collection(db, collectionName),
        where(dateField, '>=', startDate),
        where(dateField, '<', endDate)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // --- Fetch ---
    let cashData = await getDocsInRange('cashTransactions', 'createdAt', startStr, endStr);
    console.log('📦 Raw cashData count:', cashData.length);
    console.log('📦 First transaction (if any):', cashData[0]);

    // --- Apply search filter (if any) ---
    const searchTerm = document.getElementById('cashSearchInput')?.value?.toLowerCase().trim() || '';
    if (searchTerm) {
      cashData = cashData.filter(tx =>
        (tx.category || '').toLowerCase().includes(searchTerm) ||
        (tx.item || '').toLowerCase().includes(searchTerm) ||
        (tx.notes || '').toLowerCase().includes(searchTerm)
      );
      console.log('🔍 Filtered by search:', cashData.length);
    }

    // --- Compute totals ---
    let totalIn = 0, totalOut = 0;
    cashData.forEach(tx => {
      if (tx.direction === 'In') totalIn += tx.amount || 0;
      else if (tx.direction === 'Out') totalOut += tx.amount || 0;
    });
    const netBalance = totalIn - totalOut;
    const totalMovements = cashData.length;

    console.log('💰 totalIn:', totalIn, 'totalOut:', totalOut, 'netBalance:', netBalance);

    // --- Update DOM ---
    document.getElementById('analyticsCashTotalIn').textContent = fmt(totalIn);
    document.getElementById('analyticsCashTotalOut').textContent = fmt(totalOut);
    document.getElementById('analyticsCashNetBalance').textContent = fmt(netBalance);
    document.getElementById('analyticsCashTotalMovements').textContent = totalMovements;

    // --- Category breakdown ---
    const categoryMap = {};
    cashData.forEach(tx => {
      const cat = tx.category || 'Other';
      if (!categoryMap[cat]) categoryMap[cat] = { in: 0, out: 0 };
      if (tx.direction === 'In') categoryMap[cat].in += tx.amount || 0;
      else categoryMap[cat].out += tx.amount || 0;
    });
    const categoryRows = Object.entries(categoryMap)
      .map(([cat, vals]) => ({
        category: cat,
        in: vals.in,
        out: vals.out,
        net: vals.in - vals.out
      }))
      .sort((a, b) => b.net - a.net);

    const catBody = document.getElementById('cashCategoryBody');
    if (categoryRows.length === 0) {
      catBody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">No cash movements in this period.</td></tr>';
    } else {
      catBody.innerHTML = categoryRows.map(row => `
        <tr>
          <td style="padding:8px 12px; font-weight:500;">${row.category}</td>
          <td style="padding:8px 12px; text-align:right; color:#1E7B34;">${fmt(row.in)}</td>
          <td style="padding:8px 12px; text-align:right; color:#CC0000;">${fmt(row.out)}</td>
          <td style="padding:8px 12px; text-align:right; font-weight:700; color:${row.net >= 0 ? '#1E7B34' : '#CC0000'};">${fmt(row.net)}</td>
        </tr>
      `).join('');
    }

    // --- Recent movements ---
    const sortedMovements = cashData
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 50);

    const movBody = document.getElementById('cashMovementsBody');
    if (sortedMovements.length === 0) {
      movBody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">No cash movements in this period.</td></tr>';
    } else {
      movBody.innerHTML = sortedMovements.map(tx => {
        const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB') : '—';
        const directionColor = tx.direction === 'In' ? '#1E7B34' : '#CC0000';
        const directionIcon = tx.direction === 'In' ? '↑ In' : '↓ Out';
        return `
          <tr>
            <td style="padding:8px 12px;">${date}</td>
            <td style="padding:8px 12px;">${tx.category || '—'}</td>
            <td style="padding:8px 12px;">${tx.item || '—'}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:700; color:${directionColor};">${fmt(tx.amount || 0)}</td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600; background:${directionColor}20; color:${directionColor};">
                ${directionIcon}
              </span>
            </td>
            <td style="padding:8px 12px; color:#999; font-size:12px;">${tx.notes || '—'}</td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Cash tab data loaded!');
  } catch (err) {
    console.error('❌ Error loading cash data:', err);
    // Show error on cards
    ['analyticsCashTotalIn','analyticsCashTotalOut','analyticsCashNetBalance','cashTotalMovements'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
    document.getElementById('cashCategoryBody').innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#CC0000;">Error loading data</td></tr>';
    document.getElementById('cashMovementsBody').innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#CC0000;">Error loading data</td></tr>';
  } finally {
    if (loading) loading.style.display = 'none';
  }
}


// ============================================================
// LOAD ANALYTICS DEBTS TAB DATA
// ============================================================
async function loadAnalyticsDebtsData() {
  console.log('⚠️ loadAnalyticsDebtsData() called.');
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  // Declare variables outside try so they are accessible in catch/finally
  let debtsData = [];
  let filteredDebts = [];

  try {
    // --- Get date range from filters ---
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    console.log('📊 Debts date range:', startStr, 'to', endStr);

    // --- Fetch debts via the existing API ---
    const result = await window.api('getDebts', {});
    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch debts');
    }

    debtsData = result.debts || [];
    console.log('📦 Raw debts count:', debtsData.length);

    // --- Filter by debt date (use createdAt or debtDate field) ---
    // The debts have a `debtDate` or `createdAt` field. We'll use `debtDate` if available, else `createdAt`.
    filteredDebts = debtsData.filter(debt => {
      const dateField = debt.debtDate || debt.createdAt;
      if (!dateField) return false;
      // Ensure it's a string or convert to string
      const dateStr = typeof dateField === 'string' ? dateField : dateField.toISOString ? dateField.toISOString() : new Date(dateField).toISOString();
      return dateStr >= startStr && dateStr <= endStr;
    });

    console.log('🔍 Filtered by date:', filteredDebts.length);

    // --- Apply search filter (customer name or card) ---
    const searchTerm = document.getElementById('analyticsDebtsSearchInput')?.value?.toLowerCase().trim() || '';
    if (searchTerm) {
      filteredDebts = filteredDebts.filter(debt =>
        (debt.customerName || '').toLowerCase().includes(searchTerm) ||
        (debt.cardNumber || '').toLowerCase().includes(searchTerm)
      );
      console.log('🔍 Filtered by search:', filteredDebts.length);
    }

    // --- Compute summary ---
    let totalOwed = 0;
    let activeCount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    filteredDebts.forEach(debt => {
      const balance = debt.balance || 0;
      totalOwed += balance;
      if (balance > 0) activeCount++;
      const daysOverdue = debt.daysOverdue || 0;
      if (daysOverdue >= 7) {
        overdueCount++;
        overdueAmount += balance;
      }
    });

    console.log('💰 totalOwed:', totalOwed, 'activeCount:', activeCount, 'overdueCount:', overdueCount, 'overdueAmount:', overdueAmount);

    // --- Update summary cards ---
    document.getElementById('analyticsDebtsTotalOwed').textContent = fmt(totalOwed);
    document.getElementById('analyticsDebtsActiveCount').textContent = activeCount;
    document.getElementById('analyticsDebtsOverdueCount').textContent = overdueCount;
    document.getElementById('analyticsDebtsOverdueAmount').textContent = fmt(overdueAmount);

    // --- Populate the table ---
    const tableBody = document.getElementById('analyticsDebtsTableBody');
    if (filteredDebts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#999;">No debts in this period.</td></tr>';
    } else {
      tableBody.innerHTML = filteredDebts.map(debt => {
        const balance = debt.balance || 0;
        const original = debt.originalAmount || 0;
        const paid = debt.amountPaid || 0;
        const daysOverdue = debt.daysOverdue || 0;
        const dueDate = debt.dueDate ? fmtDate(debt.dueDate) : '—';
        const status = balance <= 0 ? 'Paid' : (daysOverdue >= 7 ? 'Overdue' : (balance < original ? 'Partial' : 'Pending'));
        const statusColor = status === 'Paid' ? '#1E7B34' : status === 'Overdue' ? '#CC0000' : status === 'Partial' ? '#B45309' : '#0B5394';
        return `
          <tr>
            <td style="padding:8px 12px; font-weight:600;">${debt.customerName || 'Unknown'}</td>
            <td style="padding:8px 12px; text-align:right;">${fmt(original)}</td>
            <td style="padding:8px 12px; text-align:right; color:#1E7B34;">${fmt(paid)}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:700; color:${balance > 0 ? '#CC0000' : '#1E7B34'};">${fmt(balance)}</td>
            <td style="padding:8px 12px; text-align:center;">${dueDate}</td>
            <td style="padding:8px 12px; text-align:center; font-weight:700; color:${daysOverdue >= 7 ? '#CC0000' : '#595959'};">${daysOverdue > 0 ? daysOverdue + 'd' : '—'}</td>
            <td style="padding:8px 12px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600; background:${statusColor}20; color:${statusColor};">
                ${status}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Debts tab data loaded!');
  } catch (err) {
    console.error('❌ Error loading debts data:', err);
    // Show error on cards
    ['analyticsDebtsTotalOwed','analyticsDebtsActiveCount','analyticsDebtsOverdueCount','analyticsDebtsOverdueAmount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
    const tableBody = document.getElementById('analyticsDebtsTableBody');
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" style="padding:20px; text-align:center; color:#CC0000;">Error loading data: ${err.message}</td></tr>`;
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ============================================================
// LOAD ANALYTICS PRODUCTS TAB DATA (Enhanced with Movement & Proposal)
// ============================================================
async function loadAnalyticsProductsData() {
  console.log('🏷️ loadAnalyticsProductsData() called.');
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  let salesData = [];
  let allItems = [];
  let productData = [];
  let inventoryMap = {};
  let productDetailsMap = {};

  try {
    // --- Get date range from filters ---
    let start, end;
    if (analyticsFilters.startDate && analyticsFilters.endDate) {
      start = new Date(analyticsFilters.startDate);
      end = new Date(analyticsFilters.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const { start: s, end: e } = getPeriodDates(analyticsFilters.period);
      start = s;
      end = e;
    }
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    console.log('📊 Products date range:', startStr, 'to', endStr);

    async function getDocsInRange(collectionName, dateField, startDate, endDate) {
      const q = query(
        collection(db, collectionName),
        where(dateField, '>=', startDate),
        where(dateField, '<', endDate)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // --- 1. Fetch all products ---
    const productsSnap = await getDocs(collection(db, 'products'));
    const allProducts = {};
    productsSnap.forEach(doc => {
      const data = doc.data();
      allProducts[doc.id] = {
        id: doc.id,
        name: data.productName || data.name || 'Unnamed',
        category: data.category || 'General',
        sellingPrice: data.sellingPrice || 0,
        wac: data.wac || 0
      };
    });
    productDetailsMap = allProducts;
    console.log('✅ Products fetched:', Object.keys(productDetailsMap).length);

    // --- 2. Fetch inventory summary ---
    const invSnap = await getDocs(collection(db, 'inventorySummary'));
invSnap.forEach(doc => {
  const data = doc.data();
  // Use the document ID (which is the product ID) as the key
  const pid = doc.id;
  inventoryMap[pid] = {
    quantity: data.quantity || data.currentStock || 0,
    wac: data.wac || 0
  };
});
    console.log('✅ Inventory fetched:', Object.keys(inventoryMap).length);

    // --- 3. Fetch sales ---
    salesData = await getDocsInRange('sales', 'saleDate', startStr, endStr);
    console.log('📦 Sales found:', salesData.length);

    // --- 4. Build saleId → saleDate map (for last sale date lookup) ---
    // FIX: Create map of saleId to saleDate
    const saleDateMap = {};
    salesData.forEach(sale => {
      saleDateMap[sale.id] = sale.saleDate;
    });

    // --- 5. Fetch sales items ---
    const saleIds = salesData.map(s => s.id);
    if (saleIds.length > 0) {
      const chunkSize = 30;
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const chunk = saleIds.slice(i, i + chunkSize);
        const itemsQuery = query(
          collection(db, 'salesItems'),
          where('saleId', 'in', chunk)
        );
        const itemsSnap = await getDocs(itemsQuery);
        itemsSnap.forEach(doc => allItems.push({ id: doc.id, ...doc.data() }));
      }
    }
    console.log('📦 Sales items found:', allItems.length);

    // --- 6. Apply search filter ---
    const searchTerm = document.getElementById('analyticsProductsSearchInput')?.value?.toLowerCase().trim() || '';
    if (searchTerm) {
      const matchingProductIds = new Set();
      Object.keys(productDetailsMap).forEach(pid => {
        const p = productDetailsMap[pid];
        if ((p.name || '').toLowerCase().includes(searchTerm) ||
            (p.category || '').toLowerCase().includes(searchTerm)) {
          matchingProductIds.add(pid);
        }
      });
      allItems = allItems.filter(item => matchingProductIds.has(item.productid || item.id));
      console.log('🔍 Filtered items by search:', allItems.length);
    }

    // --- 7. Build product performance data ---
    const productSalesMap = {};
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    Object.keys(productDetailsMap).forEach(pid => {
      const product = productDetailsMap[pid];
      const currentStock = inventoryMap[pid]?.quantity || 0;

      // Filter items for this product
      const productItems = allItems.filter(item => {
        const itemPid = item.productid || item.id;
        return itemPid === pid;
      });

      // Calculate sales metrics
      const unitsSold = productItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const revenue = productItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);

      // FIX: Use costPrice from item, fallback to product.wac if missing
      const cost = productItems.reduce((sum, item) => {
        const costPrice = item.costPrice || product.wac || 0;
        return sum + ((item.quantity || 0) * costPrice);
      }, 0);

      const profit = revenue - cost;
      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

      // --- FIX: Find most recent sale date using saleDateMap ---
      let latestSale = null;
      productItems.forEach(item => {
        // Use saleDate from the parent sale
        const saleDateStr = saleDateMap[item.saleId];
        if (saleDateStr) {
          const saleDate = new Date(saleDateStr);
          if (!latestSale || saleDate > latestSale) {
            latestSale = saleDate;
          }
        }
      });
      const lastSaleDate = latestSale ? latestSale.toLocaleDateString('en-GB') : '—';

      // Calculate unit profit (Selling Price - WAC)
      const unitProfit = (product.sellingPrice || 0) - (product.wac || 0);

      // --- Determine Movement Type ---
      let movementType = 'Dead';
      let proposal = 'Stop';
      let salesCountLast7Days = 0;
      let salesCountLast14Days = 0;

      productItems.forEach(item => {
        const saleDateStr = saleDateMap[item.saleId];
        if (saleDateStr) {
          const saleDate = new Date(saleDateStr);
          if (saleDate >= oneWeekAgo) {
            salesCountLast7Days += item.quantity || 0;
          }
          if (saleDate >= twoWeeksAgo) {
            salesCountLast14Days += item.quantity || 0;
          }
        }
      });

      if (salesCountLast7Days >= 5) {
        movementType = 'Fast';
        proposal = 'Buy';
      } else if (salesCountLast14Days > 0) {
        movementType = 'Slow';
        proposal = 'Maintain';
      } else {
        movementType = 'Dead';
        proposal = 'Stop';
      }

      if (productItems.length === 0) {
        if (currentStock > 0) {
          movementType = 'Dead';
          proposal = 'Stop';
        } else {
          movementType = '—';
          proposal = '—';
        }
      }

      productSalesMap[pid] = {
        id: pid,
        name: product.name,
        category: product.category,
        currentStock: currentStock,
        unitsSold: unitsSold,
        wac: inventoryMap[pid]?.wac || 0,
        sellingPrice: product.sellingPrice || 0,
        revenue: revenue,
        cost: cost,
        profit: profit,
        margin: margin,
        movementType: movementType,
        proposal: proposal,
        salesCount7Days: salesCountLast7Days,
        salesCount14Days: salesCountLast14Days,
        lastSaleDate: lastSaleDate,
        unitProfit: unitProfit
      };
    });

    // Convert to array and sort by revenue
    productData = Object.values(productSalesMap)
      .filter(p => p.unitsSold > 0 || p.currentStock > 0)
      .sort((a, b) => b.revenue - a.revenue);

    console.log('📊 Product data built:', productData.length);

    // --- 8. Update summary cards ---
    const totalProducts = productData.length;
    const totalUnits = productData.reduce((sum, p) => sum + p.unitsSold, 0);
    const totalRevenue = productData.reduce((sum, p) => sum + p.revenue, 0);
    const fastCount = productData.filter(p => p.movementType === 'Fast').length;
    const deadCount = productData.filter(p => p.movementType === 'Dead' && p.currentStock > 0).length;

    document.getElementById('analyticsProductsTotalProducts').textContent = totalProducts;
    document.getElementById('analyticsProductsTotalUnits').textContent = totalUnits;
    document.getElementById('analyticsProductsTotalRevenue').textContent = fmt(totalRevenue);
    document.getElementById('analyticsProductsFastCount').textContent = fastCount;
    document.getElementById('analyticsProductsDeadCount').textContent = deadCount;

    // --- 9. Populate the table ---
    const topBody = document.getElementById('analyticsProductsTopBody');
    if (!topBody) {
      console.error('❌ analyticsProductsTopBody element not found!');
      return;
    }

    if (productData.length === 0) {
      topBody.innerHTML = '<tr><td colspan="12" style="padding:20px; text-align:center; color:#999;">No product data in this period.</td></tr>';
    } else {
      topBody.innerHTML = productData.map(p => {
        const marginColor = p.margin >= 20 ? '#1E7B34' : p.margin >= 10 ? '#B45309' : '#CC0000';
        const movementColor = p.movementType === 'Fast' ? '#1E7B34' : p.movementType === 'Slow' ? '#B45309' : '#CC0000';
        const proposalColor = p.proposal === 'Buy' ? '#1E7B34' : p.proposal === 'Maintain' ? '#B45309' : '#CC0000';
        const unitProfitColor = p.unitProfit >= 0 ? '#1E7B34' : '#CC0000';

        return `
          <tr>
            <td style="padding:6px 8px; white-space:nowrap; font-size:11px;">${p.lastSaleDate}</td>
            <td style="padding:6px 8px; font-weight:600;">${p.name}</td>
            <td style="padding:6px 8px;">${p.category}</td>
            <td style="padding:6px 8px; text-align:right;">${p.currentStock}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:600;">${p.unitsSold}</td>
            <td style="padding:6px 8px; text-align:right;">TZS ${p.wac.toLocaleString()}</td>
            <td style="padding:6px 8px; text-align:right;">TZS ${p.sellingPrice.toLocaleString()}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:600; color:${unitProfitColor};">TZS ${p.unitProfit.toLocaleString()}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:700; color:${p.profit >= 0 ? '#1E7B34' : '#CC0000'};">${fmt(p.profit)}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:600; color:${marginColor};">${p.margin}%</td>
            <td style="padding:6px 8px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:600; background:${movementColor}20; color:${movementColor}; white-space:nowrap;">
                ${p.movementType}
              </span>
            </td>
            <td style="padding:6px 8px; text-align:center;">
              <span style="padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700; background:${proposalColor}20; color:${proposalColor}; white-space:nowrap;">
                ${p.proposal}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    console.log('✅ Products tab data loaded!');
  } catch (err) {
    console.error('❌ Error loading products data:', err);
    ['analyticsProductsTotalProducts','analyticsProductsTotalUnits','analyticsProductsTotalRevenue','analyticsProductsFastCount','analyticsProductsDeadCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '⚠️ Error';
    });
    const topBody = document.getElementById('analyticsProductsTopBody');
    if (topBody) {
      topBody.innerHTML = `<tr><td colspan="12" style="padding:20px; text-align:center; color:#CC0000;">Error loading data: ${err.message}</td></tr>`;
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ─── Refresh Analytics Tab ──────────────────────────────
function refreshAnalyticsTab() {
  console.log('🔄 Refreshing analytics tab:', currentAnalyticsTab);
  // Show loading indicator
  const loading = document.getElementById('analyticsLoading');
  if (loading) loading.style.display = 'flex';

  // Determine which data to reload
  switch (currentAnalyticsTab) {
    case 'summary':
      loadAnalyticsData();
      break;
    case 'sales':
      loadSalesData();
      break;
    case 'stock':
      loadAnalyticsStockData();
      break;
    case 'cash':
      loadCashData();
      break;
    case 'debts':
      loadAnalyticsDebtsData();
      break;
    case 'products':
    loadAnalyticsProductsData();
  break;
    default:
      // Fallback: reload summary
      loadAnalyticsData();
  }
}
// Expose to global scope so onclick works
window.refreshAnalyticsTab = refreshAnalyticsTab;

  