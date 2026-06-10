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
let selectedBulkProductIds = new Set();

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
    const price = Number(row.querySelector('[name="price"]').value);
    return {
      id: row.dataset.variantId || undefined,
      name: row.querySelector('[name="variantName"]').value,
      barcode: row.querySelector('[name="barcode"]').value,
      price,
      boxPrice: price,
      cost: Number(row.querySelector('[name="cost"]').value),
      stock: Number(row.querySelector('[name="stock"]').value),
      boxStock: 0,
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
      <button type="button" class="drag-handle" data-drag-variant title="拖曳排序" aria-label="拖曳排序">
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
      <label>
        售價
        <input name="price" type="number" min="0" step="1" placeholder="售價" value="${escapeHtml(variant.price ?? "")}" required>
      </label>
      <label>
        &#25104;&#26412;
        <input name="cost" type="number" min="0" step="1" placeholder="&#25104;&#26412;" value="${escapeHtml(variant.cost ?? 0)}" required>
      </label>
      <label>
        庫存
        <input name="stock" type="number" min="0" step="1" placeholder="庫存" value="${escapeHtml(variant.stock ?? 0)}" required>
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

function variantBulkEditor() {
  return `
    <section class="variant-bulk-editor" aria-label="批次修改品項">
      <strong>批次修改品項</strong>
      <div class="variant-bulk-fields">
        <label>
          <span>價格</span>
          <input type="number" min="0" step="1" placeholder="NT$｜價格" data-bulk-variant-price>
        </label>
        <label>
          <span>庫存</span>
          <input type="number" min="0" step="1" placeholder="商品數量" data-bulk-variant-stock>
        </label>
        <label>
          <span>品項貨號前綴</span>
          <input placeholder="例如 AZ0436" data-bulk-variant-barcode>
        </label>
        <button type="button" data-apply-variant-bulk>全部套用</button>
      </div>
    </section>
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

function clearVariantDropMarkers(editor = document) {
  editor.querySelectorAll("[data-variant-row]").forEach((row) => {
    row.classList.remove("is-drop-before", "is-drop-after");
  });
}

function moveDraggedVariant(clientY, targetRow = null) {
  if (!draggedVariantRow) return;
  dragPointerY = clientY || dragPointerY || window.innerHeight / 2;

  const sourceEditor = draggedVariantRow.closest(".variant-editor");
  const row = targetRow || document.elementFromPoint(window.innerWidth / 2, dragPointerY)?.closest?.("[data-variant-row]");
  if (!row || row === draggedVariantRow || row.closest(".variant-editor") !== sourceEditor) return;

  const targetRect = row.getBoundingClientRect();
  const shouldPlaceAfter = dragPointerY > targetRect.top + targetRect.height / 2;
  clearVariantDropMarkers(sourceEditor);
  row.classList.add(shouldPlaceAfter ? "is-drop-after" : "is-drop-before");
  sourceEditor.insertBefore(draggedVariantRow, shouldPlaceAfter ? row.nextSibling : row);
}

function startVariantDrag(row, clientY) {
  if (!row) return;
  draggedVariantRow = row;
  dragPointerY = clientY || window.innerHeight / 2;
  draggedVariantRow.classList.add("is-dragging");
  document.body.classList.add("is-variant-dragging");
  stopDragAutoScroll();
  dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
}

function endVariantDrag() {
  clearVariantDropMarkers();
  if (draggedVariantRow) draggedVariantRow.classList.remove("is-dragging");
  draggedVariantRow = null;
  document.body.classList.remove("is-variant-dragging");
  stopDragAutoScroll();
}

function productStockType(product) {
  return product?.stockType === "preOrder" ? "preOrder" : "inStock";
}

function productStockLabel(product) {
  return productStockType(product) === "preOrder" ? "預購" : "現貨";
}

function formatMoney(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function productAdminPriceLabel(product) {
  const prices = (product.variants || [])
    .map((variant) => Number(variant.price ?? 0))
    .filter((price) => Number.isFinite(price) && price >= 0);
  if (prices.length === 0) return "NT$0";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
}

function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => {
    const activeRankA = a.isActive === false ? 1 : 0;
    const activeRankB = b.isActive === false ? 1 : 0;
    if (activeRankA !== activeRankB) return activeRankA - activeRankB;

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

function productInactiveField(isActive = true) {
  return `
    <label class="toggle-field product-inactive-toggle">
      <input type="checkbox" name="isHidden" ${isActive === false ? "checked" : ""}>
      <span>下架</span>
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
  const visibleProductIds = products.map((product) => product.id);
  const selectedVisibleCount = visibleProductIds.filter((id) => selectedBulkProductIds.has(id)).length;
  const selectedTotalCount = selectedBulkProductIds.size;
  const allVisibleSelected = visibleProductIds.length > 0 && selectedVisibleCount === visibleProductIds.length;

  catalogEditorEl.innerHTML = `
    <article class="market-editor" data-market-id="${market.id}">
      <div class="admin-list-actions">
        <button type="button" class="add-product-button" data-open-new-product>&#65291; &#26032;&#22686;&#21830;&#21697;</button>
      </div>
      <div class="admin-bulk-actions">
        <label class="admin-bulk-select-all">
          <input type="checkbox" data-bulk-select-visible ${allVisibleSelected ? "checked" : ""} ${visibleProductIds.length === 0 ? "disabled" : ""}>
          <span>&#21246;&#36984;&#30446;&#21069;&#30059;&#38754;&#21830;&#21697;</span>
        </label>
        <span class="admin-bulk-count">&#24050;&#36984; ${selectedTotalCount} &#20214;</span>
        <button type="button" data-bulk-active-status="true" ${selectedTotalCount === 0 ? "disabled" : ""}>&#25209;&#37327;&#19978;&#26550;</button>
        <button type="button" data-bulk-active-status="false" ${selectedTotalCount === 0 ? "disabled" : ""}>&#25209;&#37327;&#19979;&#26550;</button>
        <button type="button" data-bulk-clear-selection ${selectedTotalCount === 0 ? "disabled" : ""}>&#28165;&#38500;&#21246;&#36984;</button>
      </div>
      <div class="product-overview-grid admin-product-overview">
        ${products.map((product) => `
          <article class="product-tile admin-product-tile ${selectedBulkProductIds.has(product.id) ? "is-selected" : ""}">
            <label class="admin-product-select" title="&#36984;&#21462;&#21830;&#21697;">
              <input type="checkbox" data-bulk-product-id="${escapeHtml(product.id)}" ${selectedBulkProductIds.has(product.id) ? "checked" : ""}>
            </label>
            <button type="button" class="admin-product-open" data-open-admin-product="${product.id}">
              <span class="product-image-wrap">
                <img src="${escapeHtml(productTileImage(product))}" alt="${escapeHtml(product.name)}" onerror="this.src='https://placehold.co/300x300/f2efe8/1e2720?text=No+Image';">
                <em class="stock-type-badge is-${productStockType(product)}">${productStockLabel(product)}</em>
                ${product.isActive === false ? '<em class="stock-type-badge is-inactive">&#19979;&#26550;</em>' : ""}
              </span>
              <strong>${escapeHtml(product.name)}</strong>
              <span class="admin-product-price">${escapeHtml(productAdminPriceLabel(product))}</span>
            </button>
          </article>
        `).join("") || '<p class="empty">???????</p>'}
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
      <form id="productForm" class="product-edit-form new-product-form" data-create-product>
        <input type="hidden" name="marketId" value="${escapeHtml(market.id)}">
        <h2>新增商品</h2>
        <label>
          商品名稱
          <input name="name" placeholder="例如 雲朵厚底拖鞋" required>
        </label>
        ${productStockTypeField()}
        ${productInactiveField(true)}
        ${variantBulkEditor()}
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
      <form id="productEditForm" class="product-edit-form" data-product-id="${product.id}">
        <div class="product-edit-head">
          <span class="product-image-wrap">
            <span class="inventory-top-controls">
              ${productInactiveField(product.isActive)}
            </span>
            <img src="${escapeHtml(productTileImage(product))}" alt="" onerror="this.src='https://placehold.co/120x90/f2efe8/1e2720?text=No+Image';">
          </span>
          <div>
            <h4>${escapeHtml(product.name)}</h4>
            <p><span class="stock-type-inline is-${productStockType(product)}">${productStockLabel(product)}</span> ${product.isActive === false ? '<span class="inactive-inline">下架</span>' : ""}</p>
          </div>
        </div>
        <label>
          商品名稱
          <input name="name" value="${escapeHtml(product.name)}" required>
        </label>
        ${productStockTypeField(product.stockType)}
        ${variantBulkEditor()}
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
  const productIds = new Set((catalog.markets || []).flatMap((market) => (market.products || []).map((product) => product.id)));
  selectedBulkProductIds = new Set([...selectedBulkProductIds].filter((id) => productIds.has(id)));
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

  if (event.target.matches("[data-bulk-clear-selection]")) {
    selectedBulkProductIds.clear();
    renderCatalog();
    return;
  }

  const bulkActiveStatusButton = event.target.closest("[data-bulk-active-status]");
  if (bulkActiveStatusButton) {
    const productIds = [...selectedBulkProductIds];
    if (productIds.length === 0) {
      alert("請先選擇商品");
      return;
    }
    const isActive = bulkActiveStatusButton.dataset.bulkActiveStatus === "true";
    const response = await fetch("/api/admin/products/active-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds, isActive })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.message || "批量更新失敗");
      return;
    }
    selectedBulkProductIds.clear();
    await loadCatalog();
    alert(`${isActive ? "上架" : "下架"} ${data.updatedCount || productIds.length} 件商品`);
    return;
  }

  if (event.target.matches("[data-apply-variant-bulk]")) {
    const form = event.target.closest(".product-edit-form");
    const price = form.querySelector("[data-bulk-variant-price]").value.trim();
    const stock = form.querySelector("[data-bulk-variant-stock]").value.trim();
    const barcodePrefix = form.querySelector("[data-bulk-variant-barcode]").value.trim();

    form.querySelectorAll("[data-variant-row]").forEach((row, index) => {
      if (price !== "") row.querySelector('[name="price"]').value = price;
      if (stock !== "") row.querySelector('[name="stock"]').value = stock;
      if (barcodePrefix !== "") {
        row.querySelector('[name="barcode"]').value = `${barcodePrefix}-${String(index + 1).padStart(2, "0")}`;
      }
    });
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

  startVariantDrag(handle.closest("[data-variant-row]"), event.clientY);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedVariantRow.dataset.variantId || "variant");
});

document.addEventListener("dragover", (event) => {
  if (!draggedVariantRow) return;
  event.preventDefault();
  moveDraggedVariant(event.clientY, event.target.closest("[data-variant-row]"));
});

document.addEventListener("drop", (event) => {
  if (!draggedVariantRow) return;
  event.preventDefault();
});

document.addEventListener("dragend", () => {
  endVariantDrag();
});

document.addEventListener("mousedown", (event) => {
  const handle = event.target.closest("[data-drag-variant]");
  if (!handle) return;
  event.preventDefault();
  startVariantDrag(handle.closest("[data-variant-row]"), event.clientY);
});

document.addEventListener("mousemove", (event) => {
  if (!draggedVariantRow) return;
  event.preventDefault();
  moveDraggedVariant(event.clientY, event.target.closest("[data-variant-row]"));
});

document.addEventListener("mouseup", () => {
  if (!draggedVariantRow) return;
  endVariantDrag();
});

document.addEventListener("wheel", (event) => {
  if (!draggedVariantRow) return;
  window.scrollBy(0, event.deltaY);
  moveDraggedVariant(dragPointerY);
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
        isActive: formData.get("isHidden") !== "on",
        stockType: formData.get("stockType"),
        boxEnabled: false,
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
        isActive: formData.get("isHidden") !== "on",
        stockType: formData.get("stockType"),
        boxEnabled: false,
        variants: await collectVariantsWithImages(event.target.querySelector(".variant-editor"))
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.message || "儲存商品失敗");
      return;
    }

    selectedProductId = "";
    isCreatingProduct = false;
    await loadCatalog();
    alert("更改成功");
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-bulk-product-id]")) {
    const productId = event.target.dataset.bulkProductId;
    if (event.target.checked) {
      selectedBulkProductIds.add(productId);
    } else {
      selectedBulkProductIds.delete(productId);
    }
    renderCatalog();
    return;
  }

  if (event.target.matches("[data-bulk-select-visible]")) {
    const market = primaryMarket();
    const products = market ? filteredProducts(market) : [];
    for (const product of products) {
      if (event.target.checked) {
        selectedBulkProductIds.add(product.id);
      } else {
        selectedBulkProductIds.delete(product.id);
      }
    }
    renderCatalog();
    return;
  }

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
