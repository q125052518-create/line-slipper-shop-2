const catalogEditorEl = document.querySelector("#catalogEditor");
const marketFormEl = document.querySelector("#marketForm");
const productFormEl = document.querySelector("#productForm");
const newVariantsEl = document.querySelector("#newVariants");
const refreshCatalogEl = document.querySelector("#refreshCatalog");
const productSearchInputEl = document.querySelector("#productSearchInput");
const productSearchCountEl = document.querySelector("#productSearchCount");

let catalog = { markets: [] };
let draggedVariantRow = null;
let dragAutoScrollFrame = 0;
let dragPointerY = 0;
let selectedProductId = "";
let isCreatingProduct = false;
let productSearchQuery = "";
let adminInventoryMode = "loose";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function collectVariantsWithImages(container) {
  const rows = Array.from(container.querySelectorAll("[data-variant-row]"));
  return Promise.all(rows.map(async (row) => {
    const file = row.querySelector('[name="variantImageFile"]')?.files?.[0];
    return {
      id: row.dataset.variantId || undefined,
      name: row.querySelector('[name="variantName"]').value,
      barcode: row.querySelector('[name="barcode"]').value,
      price: Number(row.querySelector('[name="price"]').value),
      boxPrice: Number(row.querySelector('[name="boxPrice"]').value),
      stock: Number(row.querySelector('[name="stock"]').value),
      boxStock: Number(row.querySelector('[name="boxStock"]').value),
      imageUrl: file ? await readFileAsDataUrl(file) : row.querySelector('[name="variantImageUrl"]').value
    };
  }));
}

async function productImageFromForm(form, formData) {
  const file = form.elements.imageFile?.files?.[0];
  if (file) return readFileAsDataUrl(file);
  return formData.get("imageUrl") || "";
}

async function marketImageFromForm(form, formData) {
  const file = form.elements.imageFile?.files?.[0];
  if (file) return readFileAsDataUrl(file);
  return formData.get("imageUrl") || "";
}

function imagePreviewMarkup(value, emptyText = "尚未選擇") {
  if (!value) return `<span class="image-preview empty" data-image-preview>${emptyText}</span>`;
  return `<span class="image-preview" data-image-preview><img src="${escapeHtml(value)}" alt="" onerror="this.parentElement.classList.add('empty'); this.parentElement.textContent='圖片載入失敗';"></span>`;
}

function resetImageUploaders(form) {
  form.querySelectorAll(".image-uploader").forEach((uploader) => {
    uploader.querySelector('input[type="hidden"]').value = "";
    uploader.querySelector("[data-image-preview]").outerHTML =
      '<span class="image-preview empty" data-image-preview>尚未選擇</span>';
  });
}

function variantRow(variant = {}) {
  return `
    <div class="variant-row" data-variant-row data-variant-id="${escapeHtml(variant.id || "")}">
      <button type="button" class="drag-handle" draggable="true" data-drag-variant title="拖曳排序" aria-label="拖曳排序">
        <span aria-hidden="true"></span>
      </button>
      <label>
        款式
        <input name="variantName" placeholder="例如 橙色 / M(40-41)" value="${escapeHtml(variant.name || "")}" required>
      </label>
      <label>
        品項條碼
        <input name="barcode" placeholder="例如 AA0077-01" value="${escapeHtml(variant.barcode || "")}" required>
      </label>
      <label data-stock-field="loose">
        散貨售價
        <input name="price" type="number" min="0" step="1" placeholder="散貨售價" value="${escapeHtml(variant.price ?? "")}" required>
      </label>
      <label data-stock-field="box">
        整箱售價
        <input name="boxPrice" type="number" min="0" step="1" placeholder="整箱售價" value="${escapeHtml(variant.boxPrice ?? variant.price ?? "")}" required>
      </label>
      <label data-stock-field="loose">
        散貨庫存
        <input name="stock" type="number" min="0" step="1" placeholder="散貨庫存" value="${escapeHtml(variant.stock ?? 0)}" required>
      </label>
      <label data-stock-field="box">
        整箱庫存
        <input name="boxStock" type="number" min="0" step="1" placeholder="整箱庫存" value="${escapeHtml(variant.boxStock ?? 0)}" required>
      </label>
      <label>
        品項圖片
        <span class="image-uploader">
          ${imagePreviewMarkup(variant.imageUrl || "")}
          <input type="file" name="variantImageFile" accept="image/*">
          <input type="hidden" name="variantImageUrl" value="${escapeHtml(variant.imageUrl || "")}">
          <button type="button" data-clear-image>刪除圖片</button>
        </span>
      </label>
      <button type="button" data-remove-variant>刪除</button>
    </div>
  `;
}
function primaryMarket() {
  return catalog.markets[0] || null;
}

function firstVariant(product) {
  return product?.variants?.[0] || null;
}

function productTileImage(product) {
  const variant = firstVariant(product);
  return variant?.imageUrl || product?.imageUrl || "https://placehold.co/300x300/f2efe8/1e2720?text=Slipper";
}

function stopDragAutoScroll() {
  if (dragAutoScrollFrame) cancelAnimationFrame(dragAutoScrollFrame);
  dragAutoScrollFrame = 0;
}

function runDragAutoScroll() {
  if (!draggedVariantRow) {
    stopDragAutoScroll();
    return;
  }

  const edgeSize = 120;
  const maxSpeed = 24;
  let delta = 0;
  if (dragPointerY < edgeSize) {
    delta = -Math.ceil(((edgeSize - dragPointerY) / edgeSize) * maxSpeed);
  } else if (dragPointerY > window.innerHeight - edgeSize) {
    delta = Math.ceil(((dragPointerY - (window.innerHeight - edgeSize)) / edgeSize) * maxSpeed);
  }

  if (delta) window.scrollBy(0, delta);
  dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
}

function productStockType(product) {
  return product?.stockType === "preOrder" ? "preOrder" : "inStock";
}

function productStockLabel(product) {
  return productStockType(product) === "preOrder" ? "預購" : "現貨";
}

function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => {
    const rankA = productStockType(a) === "preOrder" ? 0 : 1;
    const rankB = productStockType(b) === "preOrder" ? 0 : 1;
    return rankA - rankB;
  });
}

function productStockTypeField(value = "inStock") {
  const cleanValue = value === "preOrder" ? "preOrder" : "inStock";
  return `
    <label>
      販售狀態
      <select name="stockType" required>
        <option value="inStock" ${cleanValue === "inStock" ? "selected" : ""}>現貨</option>
        <option value="preOrder" ${cleanValue === "preOrder" ? "selected" : ""}>預購</option>
      </select>
    </label>
  `;
}

function productBoxEnabledField(checked = false) {
  return `
    <label class="toggle-field box-enabled-toggle">
      <input type="checkbox" name="boxEnabled" ${checked ? "checked" : ""}>
      <span>整箱上架</span>
    </label>
  `;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function productSearchText(product) {
  return [
    product.id,
    product.name,
    productStockLabel(product),
    product.boxEnabled ? "整箱上架" : "",
    product.barcode,
    ...(product.variants || []).flatMap((variant) => [
      variant.id,
      variant.name,
      variant.barcode
    ])
  ].map(normalizeSearchText).join(" ");
}

function filteredProducts(market) {
  const query = normalizeSearchText(productSearchQuery);
  const products = query ? market.products.filter((product) => {
    const haystack = productSearchText(product);
    const keywords = query.split(/\s+/).filter(Boolean);
    return keywords.every((keyword) => haystack.includes(keyword));
  }) : market.products;
  return sortProductsForDisplay(products);
}

function updateProductSearchCount(visibleCount, totalCount) {
  if (!productSearchCountEl) return;
  productSearchCountEl.textContent = productSearchQuery
    ? `${visibleCount.toLocaleString("zh-TW")} / ${totalCount.toLocaleString("zh-TW")} 件商品`
    : `${totalCount.toLocaleString("zh-TW")} 件商品`;
}

function selectedProduct(market) {
  if (!selectedProductId) return null;
  return market.products.find((product) => product.id === selectedProductId) || null;
}

function renderMarketOptions() {
  const form = document.querySelector("#productForm");
  const field = form?.elements?.marketId;
  if (!field) return;
  const market = primaryMarket();
  if (field.tagName === "SELECT") {
    field.innerHTML = market ? `<option value="${market.id}">${escapeHtml(market.name)}</option>` : "";
  }
  field.value = market?.id || "";
}

function renderCatalog() {
  renderMarketOptions();

  const market = primaryMarket();
  if (!market) {
    catalogEditorEl.innerHTML = '<p class="empty">尚未建立資料，無法新增商品</p>';
    return;
  }

  if (isCreatingProduct) {
    renderNewProductEditor(market);
    return;
  }

  const product = selectedProduct(market);
  if (!product) {
    selectedProductId = "";
    renderProductOverview(market);
    return;
  }

  renderProductEditor(market, product);
}

function renderProductOverview(market) {
  const products = filteredProducts(market);
  updateProductSearchCount(products.length, market.products.length);

  catalogEditorEl.innerHTML = `
    <article class="market-editor" data-market-id="${market.id}">
      <div class="admin-list-actions">
        <button type="button" class="add-product-button" data-open-new-product>＋ 新增商品</button>
      </div>
      <div class="product-overview-grid admin-product-overview">
        ${products.map((product) => `
          <button type="button" class="product-tile admin-product-tile" data-open-admin-product="${product.id}">
            <span class="product-image-wrap">
              <img src="${escapeHtml(productTileImage(product))}" alt="${escapeHtml(product.name)}" onerror="this.src='https://placehold.co/300x300/f2efe8/1e2720?text=No+Image';">
              <em class="stock-type-badge is-${productStockType(product)}">${productStockLabel(product)}</em>
            </span>
            <strong>${escapeHtml(product.name)}</strong>
          </button>
        `).join("") || '<p class="empty">找不到符合條件的商品</p>'}
      </div>
    </article>
  `;
}

function renderNewProductEditor(market) {
  updateProductSearchCount(0, market.products.length);

  catalogEditorEl.innerHTML = `
    <article class="market-editor admin-product-detail" data-market-id="${market.id}">
      <div class="admin-product-detail-head">
        <button type="button" class="back-button" data-back-to-admin-products>返回商品列表</button>
      </div>
      <form id="productForm" class="product-edit-form new-product-form" data-create-product data-inventory-mode="${adminInventoryMode}">
        <input type="hidden" name="marketId" value="${escapeHtml(market.id)}">
        <h2>新增商品</h2>
        <label>
          商品名稱
          <input name="name" placeholder="例如 雲朵厚底拖鞋" required>
        </label>
        ${productStockTypeField()}
        ${productBoxEnabledField(false)}
        <div class="variant-editor">
          ${variantRow()}
        </div>
        <button type="button" data-add-variant>新增品項</button>
        <button type="submit">新增商品</button>
      </form>
    </article>
  `;
}

function renderProductEditor(market, product) {
  updateProductSearchCount(1, market.products.length);

  catalogEditorEl.innerHTML = `
    <article class="market-editor admin-product-detail" data-market-id="${market.id}">
      <div class="admin-product-detail-head">
        <button type="button" class="back-button" data-back-to-admin-products>返回商品列表</button>
        <div class="admin-product-detail-actions">
          <button type="submit" form="productEditForm">儲存商品</button>
          <button type="button" data-delete-product="${product.id}">刪除商品</button>
        </div>
      </div>
      <form id="productEditForm" class="product-edit-form" data-product-id="${product.id}" data-inventory-mode="${adminInventoryMode}">
        <div class="product-edit-head">
          <span class="product-image-wrap">
            <span class="inventory-top-controls">
              <span class="inventory-mode-switch" aria-label="庫存模式">
                <button type="button" data-admin-inventory-mode="loose" class="${adminInventoryMode === "loose" ? "is-active" : ""}">散貨</button>
                <button type="button" data-admin-inventory-mode="box" class="${adminInventoryMode === "box" ? "is-active" : ""}">整箱</button>
              </span>
              ${productBoxEnabledField(product.boxEnabled)}
            </span>
            <img src="${escapeHtml(productTileImage(product))}" alt="" onerror="this.src='https://placehold.co/120x90/f2efe8/1e2720?text=No+Image';">
          </span>
          <div>
            <h4>${escapeHtml(product.name)}</h4>
            <p><span class="stock-type-inline is-${productStockType(product)}">${productStockLabel(product)}</span> ${product.boxEnabled ? '<span class="box-enabled-inline">整箱上架</span>' : ""}</p>
          </div>
        </div>
        <label>
          商品名稱
          <input name="name" value="${escapeHtml(product.name)}" required>
        </label>
        ${productStockTypeField(product.stockType)}
        <div class="variant-editor">
          ${product.variants.map((variant) => variantRow(variant)).join("")}
        </div>
        <button type="button" data-add-variant>新增品項</button>
      </form>
    </article>
  `;
}

async function loadCatalog() {
  catalog = await fetch("/api/admin/catalog").then((response) => response.json());
  renderCatalog();
}

marketFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(marketFormEl);
  const imageUrl = await marketImageFromForm(marketFormEl, formData);

  await fetch("/api/admin/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: formData.get("name"),
      imageUrl,
      description: formData.get("description"),
      isActive: formData.get("isActive") === "on"
    })
  });

  marketFormEl.reset();
  resetImageUploaders(marketFormEl);
  marketFormEl.elements.isActive.checked = true;
  await loadCatalog();
});

document.addEventListener("click", async (event) => {
  const inventoryModeButton = event.target.closest("[data-admin-inventory-mode]");
  if (inventoryModeButton) {
    adminInventoryMode = inventoryModeButton.dataset.adminInventoryMode === "box" ? "box" : "loose";
    document.querySelectorAll(".product-edit-form").forEach((form) => {
      form.dataset.inventoryMode = adminInventoryMode;
    });
    document.querySelectorAll("[data-admin-inventory-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminInventoryMode === adminInventoryMode);
    });
    return;
  }

  if (event.target.closest("[data-open-new-product]")) {
    isCreatingProduct = true;
    selectedProductId = "";
    renderCatalog();
    window.scrollTo({ top: catalogEditorEl.offsetTop - 16, behavior: "smooth" });
    return;
  }

  const openProductButton = event.target.closest("[data-open-admin-product]");
  if (openProductButton) {
    isCreatingProduct = false;
    selectedProductId = openProductButton.dataset.openAdminProduct;
    renderCatalog();
    window.scrollTo({ top: catalogEditorEl.offsetTop - 16, behavior: "smooth" });
    return;
  }

  if (event.target.closest("[data-back-to-admin-products]")) {
    isCreatingProduct = false;
    selectedProductId = "";
    renderCatalog();
    window.scrollTo({ top: catalogEditorEl.offsetTop - 16, behavior: "smooth" });
    return;
  }

  if (event.target.matches("[data-add-variant]")) {
    const editor = event.target.closest("form").querySelector(".variant-editor");
    editor.insertAdjacentHTML("beforeend", variantRow());
  }

  if (event.target.matches("[data-clear-image]")) {
    const row = event.target.closest("[data-variant-row]");
    const uploader = row?.querySelector(".image-uploader") || event.target.closest(".image-uploader");
    uploader.querySelector('input[type="hidden"]').value = "";
    const fileInput = uploader.querySelector('input[type="file"]');
    fileInput.value = "";
    uploader.querySelector("[data-image-preview]").outerHTML =
      '<span class="image-preview empty" data-image-preview>尚未選擇</span>';
  }

  if (event.target.matches("[data-remove-variant]")) {
    const editor = event.target.closest(".variant-editor");
    if (editor.querySelectorAll("[data-variant-row]").length > 1) {
      event.target.closest("[data-variant-row]").remove();
    }
  }

  const marketId = event.target.dataset.deleteMarket;
  if (marketId && confirm("確定刪除這個賣場？")) {
    await fetch(`/api/admin/markets/${marketId}`, { method: "DELETE" });
    isCreatingProduct = false;
    selectedProductId = "";
    await loadCatalog();
  }

  const productId = event.target.dataset.deleteProduct;
  if (productId && confirm("確定刪除這個商品？")) {
    await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
    isCreatingProduct = false;
    selectedProductId = "";
    await loadCatalog();
  }
});

document.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag-variant]");
  if (!handle) return;

  draggedVariantRow = handle.closest("[data-variant-row]");
  dragPointerY = event.clientY || window.innerHeight / 2;
  draggedVariantRow.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedVariantRow.dataset.variantId || "variant");
  stopDragAutoScroll();
  dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
});

document.addEventListener("dragover", (event) => {
  if (!draggedVariantRow) return;
  dragPointerY = event.clientY;

  const targetRow = event.target.closest("[data-variant-row]");
  if (!targetRow || targetRow === draggedVariantRow) return;

  const sourceEditor = draggedVariantRow.closest(".variant-editor");
  if (targetRow.closest(".variant-editor") !== sourceEditor) return;

  event.preventDefault();
  const targetRect = targetRow.getBoundingClientRect();
  const shouldPlaceAfter = event.clientY > targetRect.top + targetRect.height / 2;
  sourceEditor.querySelectorAll("[data-variant-row]").forEach((row) => {
    row.classList.remove("is-drop-before", "is-drop-after");
  });
  targetRow.classList.add(shouldPlaceAfter ? "is-drop-after" : "is-drop-before");
  sourceEditor.insertBefore(draggedVariantRow, shouldPlaceAfter ? targetRow.nextSibling : targetRow);
});

document.addEventListener("drop", (event) => {
  if (!draggedVariantRow) return;
  event.preventDefault();
});

document.addEventListener("dragend", () => {
  document.querySelectorAll("[data-variant-row]").forEach((row) => {
    row.classList.remove("is-drop-before", "is-drop-after");
  });
  if (draggedVariantRow) draggedVariantRow.classList.remove("is-dragging");
  draggedVariantRow = null;
  stopDragAutoScroll();
});

document.addEventListener("wheel", (event) => {
  if (!draggedVariantRow) return;
  window.scrollBy(0, event.deltaY);
}, { passive: true });

document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-create-product]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const marketId = formData.get("marketId") || primaryMarket()?.id;
    if (!marketId) {
      alert("尚未建立資料，無法新增商品");
      return;
    }
    const imageUrl = await productImageFromForm(event.target, formData);

    const response = await fetch(`/api/admin/markets/${marketId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        imageUrl,
        stockType: formData.get("stockType"),
        boxEnabled: formData.get("boxEnabled") === "on",
        variants: await collectVariantsWithImages(event.target.querySelector(".variant-editor"))
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.message || "新增商品失敗");
      return;
    }

    isCreatingProduct = false;
    selectedProductId = data.product?.id || "";
    await loadCatalog();
    return;
  }

  if (event.target.matches(".market-edit-form")) {
    event.preventDefault();
    const marketId = event.target.closest("[data-market-id]").dataset.marketId;
    const formData = new FormData(event.target);
    const imageUrl = await marketImageFromForm(event.target, formData);

    await fetch(`/api/admin/markets/${marketId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        imageUrl,
        description: formData.get("description"),
        isActive: formData.get("isActive") === "on"
      })
    });

    await loadCatalog();
  }

  if (event.target.matches(".product-edit-form")) {
    event.preventDefault();
    const productId = event.target.dataset.productId;
    const formData = new FormData(event.target);
    const imageUrl = await productImageFromForm(event.target, formData);

    const response = await fetch(`/api/admin/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        imageUrl,
        stockType: formData.get("stockType"),
        boxEnabled: formData.get("boxEnabled") === "on",
        variants: await collectVariantsWithImages(event.target.querySelector(".variant-editor"))
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.message || "儲存商品失敗");
      return;
    }

    selectedProductId = productId;
    await loadCatalog();
  }
});

document.addEventListener("change", async (event) => {
  if (!event.target.matches('.image-uploader input[type="file"]')) return;

  const file = event.target.files[0];
  if (!file) return;
  const uploader = event.target.closest(".image-uploader");
  const dataUrl = await readFileAsDataUrl(file);
  uploader.querySelector('input[type="hidden"]').value = dataUrl;
  uploader.querySelector("[data-image-preview]").outerHTML =
    `<span class="image-preview" data-image-preview><img src="${dataUrl}" alt=""></span>`;
});

refreshCatalogEl.addEventListener("click", () => {
  isCreatingProduct = false;
  selectedProductId = "";
  loadCatalog();
});

productSearchInputEl?.addEventListener("input", () => {
  productSearchQuery = productSearchInputEl.value;
  isCreatingProduct = false;
  selectedProductId = "";
  renderCatalog();
});

if (newVariantsEl) newVariantsEl.innerHTML = variantRow();
loadCatalog();
