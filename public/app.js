const CART_KEY = "line-slipper-cart";

const state = {
  markets: [],
  currentMarketId: "",
  currentProductId: "",
  orderType: "",
  selectedVariants: {},
  cart: readCart(),
  buyer: null
};

const marketSelectEl = document.querySelector("#marketSelect");
const marketDescriptionEl = document.querySelector("#marketDescription");
const productsEl = document.querySelector("#products");
const messageEl = document.querySelector("#message");
const cartCountEl = document.querySelector("#cartCount");
let messageTimer = null;

async function loadMarkets() {
  const data = await fetch("/api/markets").then((response) => response.json());
  state.markets = data.markets;
  state.currentMarketId = state.markets[0]?.id || "";
  renderMarketOptions();
  renderProducts();
  renderCartCount();
}

async function loadBuyerStatus() {
  try {
    const data = await fetch("/api/buyer/status").then((response) => response.json());
    state.buyer = data.authenticated ? data.buyer : null;
  } catch {
    state.buyer = null;
  }
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCartCount();
}

function reloadCart() {
  state.cart = readCart();
  renderCartCount();
}

function renderCartCount() {
  const count = Object.values(state.cart).reduce((sum, item) => sum + item.quantity, 0);
  cartCountEl.textContent = count;
}

function currentMarket() {
  return state.markets.find((market) => market.id === state.currentMarketId);
}

function currentProduct() {
  const market = currentMarket();
  return market?.products.find((product) => product.id === state.currentProductId);
}

function formatMoney(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeholderImage(name) {
  return `https://placehold.co/720x540/f2efe8/1e2720?text=${encodeURIComponent(name || "Slipper")}`;
}

function variantImage(product, variant) {
  return variant?.imageUrl || product?.imageUrl || placeholderImage(product?.name || variant?.name);
}

function firstVariant(product) {
  return product?.variants?.[0] || null;
}

function productStockType(product) {
  return product?.stockType === "preOrder" ? "preOrder" : "inStock";
}

function effectiveProductStockType(product) {
  return state.orderType === "box" ? "preOrder" : productStockType(product);
}

function productStockLabel(product) {
  return effectiveProductStockType(product) === "preOrder" ? "預購" : "現貨";
}

function variantDisplayStock(variant) {
  return state.orderType === "box" ? Number(variant?.boxStock || 0) : Number(variant?.stock || 0);
}

function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => {
    const rankA = effectiveProductStockType(a) === "preOrder" ? 0 : 1;
    const rankB = effectiveProductStockType(b) === "preOrder" ? 0 : 1;
    return rankA - rankB;
  });
}

function orderTypeLabel(orderType = state.orderType) {
  return orderType === "box" ? "整箱訂購" : "散貨訂購";
}

function showMessage(text, type = "success") {
  clearTimeout(messageTimer);
  messageEl.textContent = text;
  messageEl.classList.toggle("is-error", type === "error");
  messageEl.classList.add("is-visible");
  messageTimer = setTimeout(() => {
    messageEl.classList.remove("is-visible");
  }, 2200);
}

function renderMarketOptions() {
  if (!marketSelectEl) return;
  marketSelectEl.innerHTML = state.markets.map((market) => `
    <option value="${market.id}">${escapeHtml(market.name)}</option>
  `).join("");
  marketSelectEl.value = state.currentMarketId;
}

function selectedVariant(product) {
  const selectedId = state.selectedVariants[product.id] || firstVariant(product)?.id;
  return product.variants.find((variant) => variant.id === selectedId) || firstVariant(product);
}

function renderProducts() {
  const market = currentMarket();
  marketDescriptionEl.textContent = state.orderType
    ? `${orderTypeLabel()}${market?.description ? `｜${market.description}` : ""}`
    : "";

  if (!market) {
    productsEl.innerHTML = '<p class="empty">目前沒有商品資料</p>';
    return;
  }

  if (!state.orderType) {
    renderOrderTypeMenu();
    return;
  }

  if (market.products.length === 0) {
    productsEl.innerHTML = '<p class="empty">目前還沒有商品</p>';
    return;
  }

  const product = currentProduct();
  if (product) {
    renderProductDetail(market, product);
    return;
  }

  renderProductOverview(market);
}

function renderOrderTypeMenu() {
  productsEl.className = "order-type-menu";
  productsEl.innerHTML = `
    <button type="button" class="order-type-card" data-order-type="box">
      <strong>整箱訂購</strong>
      <span>進入商品列表</span>
    </button>
    <button type="button" class="order-type-card" data-order-type="loose">
      <strong>散貨訂購</strong>
      <span>進入商品列表</span>
    </button>
  `;
}

function renderProductOverview(market) {
  const products = sortProductsForDisplay(market.products);
  productsEl.className = "product-overview-wrap";
  productsEl.innerHTML = `
    <button type="button" class="back-button" data-back-to-order-types>返回訂購選單</button>
    <div class="product-overview-grid">
      ${products.map((product) => {
    const variant = firstVariant(product);
    const imageUrl = variantImage(product, variant);

    return `
      <button type="button" class="product-tile" data-open-product="${product.id}">
        <span class="product-image-wrap">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}">
          <em class="stock-type-badge is-${effectiveProductStockType(product)}">${productStockLabel(product)}</em>
        </span>
        <strong>${escapeHtml(product.name)}</strong>
      </button>
    `;
  }).join("")}
    </div>
  `;
}

function renderProductDetail(market, product) {
  const selected = selectedVariant(product);
  const imageUrl = variantImage(product, selected);
  const isPreOrder = effectiveProductStockType(product) === "preOrder";
  const selectedStock = variantDisplayStock(selected);
  const disabled = !selected || selectedStock <= 0;

  productsEl.className = "product-detail-wrap";
  productsEl.innerHTML = `
    <button type="button" class="back-button" data-back-to-products>回商品列表</button>
    <article class="product product-detail">
      <span class="product-image-wrap product-detail-image-wrap">
        <img class="product-image" src="${escapeHtml(imageUrl || market.imageUrl || placeholderImage(product.name))}" alt="${escapeHtml(product.name)}" data-product-image="${product.id}">
        <em class="stock-type-badge is-${effectiveProductStockType(product)}">${productStockLabel(product)}</em>
      </span>
      <div class="product-body">
        <h3>${escapeHtml(product.name)} <span class="stock-type-inline is-${effectiveProductStockType(product)}">${productStockLabel(product)}</span></h3>
        ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
        <div class="variant-card-grid" role="list" aria-label="${escapeHtml(product.name)}選項">
          ${product.variants.map((variant) => {
            const isSelected = selected?.id === variant.id;
            return `
              <button
                type="button"
                class="variant-card ${isSelected ? "is-selected" : ""}"
                data-select-variant="${product.id}"
                data-variant-id="${variant.id}"
                ${variantDisplayStock(variant) <= 0 ? "data-sold-out=\"true\"" : ""}
              >
                <img src="${escapeHtml(variantImage(product, variant))}" alt="${escapeHtml(variant.name)}">
                <span>${escapeHtml(variant.name)}</span>
                <small>${escapeHtml(variant.barcode)}</small>
                <strong>${formatMoney(variant.price)}</strong>
                <em>${state.orderType === "box" ? "整箱庫存" : "散貨庫存"} ${variantDisplayStock(variant)}</em>
              </button>
            `;
          }).join("")}
        </div>
      </div>
      <div class="product-actions">
        <strong data-price-line="${product.id}">${formatMoney(selected?.price || 0)}</strong>
        <p class="stock-line" data-stock-line="${product.id}">${state.orderType === "box" ? "整箱庫存" : "散貨庫存"} ${selectedStock}</p>
        <label class="quantity-field">
          數量
          <input type="number" min="1" max="${selectedStock || 1}" value="1" data-add-quantity="${product.id}" ${disabled ? "disabled" : ""}>
        </label>
        <button type="button" data-add-product="${product.id}" ${disabled ? "disabled" : ""}>${disabled ? "缺貨" : "加入購物車"}</button>
      </div>
    </article>
  `;
}

function cartKey(marketId, productId, variantId, orderType = state.orderType) {
  return `${orderType || "loose"}|${marketId}|${productId}|${variantId}`;
}

function addToCart(productId) {
  reloadCart();

  const market = currentMarket();
  const product = market?.products.find((entry) => entry.id === productId);
  const variant = product ? selectedVariant(product) : null;
  const isPreOrder = effectiveProductStockType(product) === "preOrder";
  const availableStock = variantDisplayStock(variant);
  if (!market || !product || !variant || availableStock <= 0) return;

  const key = cartKey(market.id, product.id, variant.id);
  const quantityInput = document.querySelector(`[data-add-quantity="${product.id}"]`);
  const addQuantity = Math.max(1, Number(quantityInput?.value || 1));
  const currentQuantity = state.cart[key]?.quantity || 0;
  if (!Number.isInteger(addQuantity) || addQuantity <= 0) {
    showMessage("請輸入正確數量", "error");
    return;
  }

  if (currentQuantity + addQuantity > availableStock) {
    showMessage(`庫存不足，目前剩 ${availableStock}`, "error");
    return;
  }

  state.cart[key] = {
    marketId: market.id,
    marketName: market.name,
    orderType: state.orderType || "loose",
    orderTypeLabel: orderTypeLabel(),
    stockType: effectiveProductStockType(product),
    stockTypeLabel: productStockLabel(product),
    stockSource: state.orderType === "box" ? "box" : "loose",
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    variantName: variant.name,
    barcode: variant.barcode,
    price: variant.price,
    stock: availableStock,
    imageUrl: variant.imageUrl || product.imageUrl,
    quantity: currentQuantity + addQuantity
  };

  saveCart();
  showMessage(`${product.name} - ${variant.name} x ${addQuantity} 已加入購物車`);
}

marketSelectEl?.addEventListener("change", () => {
  state.currentMarketId = marketSelectEl.value;
  state.currentProductId = "";
  state.selectedVariants = {};
  renderProducts();
});

document.addEventListener("click", (event) => {
  const orderTypeButton = event.target.closest("[data-order-type]");
  if (orderTypeButton) {
    state.orderType = orderTypeButton.dataset.orderType;
    state.currentProductId = "";
    state.selectedVariants = {};
    renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (event.target.closest("[data-back-to-order-types]")) {
    state.orderType = "";
    state.currentProductId = "";
    state.selectedVariants = {};
    renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const openProductButton = event.target.closest("[data-open-product]");
  if (openProductButton) {
    const productId = openProductButton.dataset.openProduct;
    const market = currentMarket();
    const product = market?.products.find((entry) => entry.id === productId);
    state.currentProductId = productId;
    if (product) state.selectedVariants[productId] = selectedVariant(product)?.id;
    renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (event.target.closest("[data-back-to-products]")) {
    state.currentProductId = "";
    renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const variantButton = event.target.closest("[data-select-variant]");
  if (variantButton) {
    state.selectedVariants[variantButton.dataset.selectVariant] = variantButton.dataset.variantId;
    renderProducts();
    return;
  }

  const productId = event.target.dataset.addProduct;
  if (productId) addToCart(productId);
});

window.addEventListener("pageshow", reloadCart);
window.addEventListener("focus", reloadCart);

loadBuyerStatus().finally(loadMarkets);
