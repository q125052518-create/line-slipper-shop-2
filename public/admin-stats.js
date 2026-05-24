const summaryEl = document.querySelector("#statsSummary");
const dailyEl = document.querySelector("#dailyStats");
const statusEl = document.querySelector("#statusStats");
const topProductsEl = document.querySelector("#topProducts");
const topVariantsEl = document.querySelector("#topVariants");
const lowStockEl = document.querySelector("#lowStock");
const outOfStockEl = document.querySelector("#outOfStock");
const messageEl = document.querySelector("#statsMessage");
const refreshButtonEl = document.querySelector("#refreshStatsButton");

const statusLabels = {
  pending: "待處理",
  processing: "處理中",
  shipped: "已出貨",
  cancelled: "已取消"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-TW");
}

function renderSummary(summary) {
  const cards = [
    ["總營收", formatMoney(summary.revenue)],
    ["今日營收", formatMoney(summary.todayRevenue)],
    ["有效訂單", formatNumber(summary.activeOrders)],
    ["今日訂單", formatNumber(summary.todayOrders)],
    ["售出件數", formatNumber(summary.soldQuantity)],
    ["平均客單", formatMoney(summary.averageOrderValue)],
    ["商品數", formatNumber(summary.productCount)],
    ["選項數", formatNumber(summary.variantCount)],
    ["總庫存", formatNumber(summary.totalStock)],
    ["低庫存", formatNumber(summary.lowStockCount)],
    ["缺貨", formatNumber(summary.outOfStockCount)],
    ["取消訂單", formatNumber(summary.cancelledOrders)]
  ];

  summaryEl.innerHTML = cards.map(([label, value]) => `
    <article class="stats-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderDaily(rows) {
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.revenue || 0)));
  dailyEl.innerHTML = rows.map((row) => {
    const percent = Math.max(2, Math.round(Number(row.revenue || 0) / maxRevenue * 100));
    return `
      <div class="daily-row">
        <span>${escapeHtml(row.date.slice(5))}</span>
        <div><i style="width: ${percent}%"></i></div>
        <strong>${formatMoney(row.revenue)}</strong>
        <small>${formatNumber(row.orders)} 單 / ${formatNumber(row.quantity)} 件</small>
      </div>
    `;
  }).join("");
}

function renderStatus(statusCounts) {
  const entries = Object.entries(statusLabels);
  const total = Math.max(1, entries.reduce((sum, [key]) => sum + Number(statusCounts[key] || 0), 0));
  statusEl.innerHTML = entries.map(([key, label]) => {
    const count = Number(statusCounts[key] || 0);
    const percent = Math.round(count / total * 100);
    return `
      <div class="status-row">
        <span>${escapeHtml(label)}</span>
        <div><i style="width: ${Math.max(2, percent)}%"></i></div>
        <strong>${formatNumber(count)}</strong>
      </div>
    `;
  }).join("");
}

function renderSalesTable(container, rows, type) {
  if (!rows.length) {
    container.innerHTML = '<p class="empty">目前沒有銷售資料</p>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>名稱</th>
          ${type === "variant" ? "<th>條碼</th>" : ""}
          <th>數量</th>
          <th>營收</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>
              <strong>${escapeHtml(type === "variant" ? row.variantName : row.productName)}</strong>
              ${type === "variant" ? `<small>${escapeHtml(row.productName)}</small>` : ""}
            </td>
            ${type === "variant" ? `<td>${escapeHtml(row.barcode || "-")}</td>` : ""}
            <td>${formatNumber(row.quantity)}</td>
            <td>${formatMoney(row.revenue)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderStockTable(container, rows, emptyText) {
  if (!rows.length) {
    container.innerHTML = `<p class="empty">${escapeHtml(emptyText)}</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>圖片</th>
          <th>商品 / 選項</th>
          <th>條碼</th>
          <th>庫存</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${row.imageUrl ? `<img class="stats-thumb" src="${escapeHtml(row.imageUrl)}" alt="">` : ""}</td>
            <td>
              <strong>${escapeHtml(row.productName)}</strong>
              <small>${escapeHtml(row.variantName)}</small>
            </td>
            <td>${escapeHtml(row.barcode || "-")}</td>
            <td>${formatNumber(row.stock)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadStats() {
  refreshButtonEl.disabled = true;
  messageEl.textContent = "讀取中...";
  try {
    const data = await fetch("/api/admin/stats").then((response) => response.json());
    renderSummary(data.summary);
    renderDaily(data.daily);
    renderStatus(data.statusCounts);
    renderSalesTable(topProductsEl, data.topProducts, "product");
    renderSalesTable(topVariantsEl, data.topVariants, "variant");
    renderStockTable(lowStockEl, data.lowStock, "目前沒有低庫存品項");
    renderStockTable(outOfStockEl, data.outOfStock, "目前沒有缺貨品項");
    messageEl.textContent = `最後更新：${new Date(data.generatedAt).toLocaleString("zh-TW", { hour12: false })}`;
  } catch (error) {
    messageEl.textContent = "統計資料讀取失敗";
  } finally {
    refreshButtonEl.disabled = false;
  }
}

refreshButtonEl.addEventListener("click", loadStats);
loadStats();
