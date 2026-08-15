import "./style.css";
import "./editor.css";
import { db, stats, searchable } from "./db.js";
import { processImage } from "./imageProcessor.js";
import { ai, MODEL, MODEL_VERSION } from "./aiImageService.js";
import { searchWorker } from "./similaritySearch.js";
import { exportBackup, importBackup } from "./backup.js";
import { sanitizeContentHtml, contentToText } from "./content.js";
const app = document.querySelector("#app");
let route = "home",
  selected = null,
  editId = null,
  filter = { q: "", sort: "new", cat: "" },
  searchFile = null;
const urls = new Set();
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const objUrl = (b) => {
  const u = URL.createObjectURL(b);
  urls.add(u);
  return u;
};
const clearUrls = () => {
  urls.forEach(URL.revokeObjectURL);
  urls.clear();
};
function toast(s) {
  const t = document.querySelector("#toast");
  t.textContent = s;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function nav() {
  return `<nav class="bottom-nav">${[
    ["home", "🏠", "Trang chủ"],
    ["list", "📦", "Kho đồ"],
    ["add", "📷", "Thêm"],
    ["find", "🔎", "Tìm ảnh"],
    ["data", "⚙️", "Dữ liệu"],
  ]
    .map(
      (x) =>
        `<button data-route="${x[0]}" class="${route === x[0] ? "active" : ""}"><span>${x[1]}</span>${x[2]}</button>`,
    )
    .join("")}</nav>`;
}
async function render() {
  clearUrls();
  const state =
    ai.state === "ready"
      ? "Sẵn sàng"
      : ai.state === "loading"
        ? "Đang tải…"
        : ai.state === "error"
          ? "Lỗi"
          : "Chưa tải";
  app.innerHTML = `<div class="app"><header><div class="brand">Kho Đồ AI</div><div class="ai-pill">🤖 AI: ${state}</div></header><main id="page"></main>${nav()}</div>`;
  document
    .querySelectorAll("[data-route]")
    .forEach((b) => (b.onclick = () => go(b.dataset.route)));
  const p = document.querySelector("#page");
  try {
    if (route === "home") await home(p);
    if (route === "list") await list(p);
    if (route === "add") await form(p);
    if (route === "detail") await detail(p);
    if (route === "find") find(p);
    if (route === "data") await dataPage(p);
  } catch (e) {
    p.innerHTML = `<div class="panel"><h2>Đã xảy ra lỗi</h2><p>${esc(e.message)}</p><button data-route="home">Về trang chủ</button></div>`;
  }
}
function go(r, arg) {
  route = r;
  selected = arg ?? selected;
  render();
  scrollTo(0, 0);
}
async function home(p) {
  const s = await stats();
  p.innerHTML = `<section class="hero"><h1>KHO ĐỒ AI</h1><p>Nhớ vị trí mọi đồ vật bằng hình ảnh. Riêng tư, lưu ngay trên thiết bị.</p></section><section class="stats"><div class="stat"><b>${s.count}</b><small>đồ vật</small></div><div class="stat"><b>${s.favorites}</b><small>yêu thích</small></div><div class="stat"><b>${formatBytes(s.bytes)}</b><small>dữ liệu</small></div></section><div class="actions"><button data-go="add">📷 THÊM ĐỒ VẬT</button><button data-go="find">🔎 TÌM BẰNG HÌNH ẢNH</button><button class="secondary" data-go="list">📦 XEM KHO ĐỒ</button></div>`;
  p.querySelectorAll("[data-go]").forEach(
    (x) => (x.onclick = () => go(x.dataset.go)),
  );
}
async function list(p) {
  let all = await db.items.toArray(),
    cats = [...new Set(all.map((x) => x.category).filter(Boolean))].sort();
  if (filter.q)
    all = all.filter((x) => searchable(x).includes(normalize(filter.q)));
  if (filter.cat) all = all.filter((x) => x.category === filter.cat);
  if (filter.sort === "az")
    all.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  else if (filter.sort === "old") all.sort((a, b) => a.createdAt - b.createdAt);
  else if (filter.sort === "fav") all = all.filter((x) => x.favorite);
  else all.sort((a, b) => b.createdAt - a.createdAt);
  p.innerHTML = `<h2>📦 Kho đồ</h2><div class="toolbar"><input id="q" value="${esc(filter.q)}" placeholder="Tìm nội dung, vị trí, tag…"><select id="sort"><option value="new">Mới nhất</option><option value="old">Cũ nhất</option><option value="az">A-Z</option><option value="fav">Yêu thích</option></select></div><select id="cat"><option value="">Tất cả danh mục</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select><div class="item-list">${all.length ? all.map((x) => card(x)).join("") : '<div class="empty">Chưa có đồ vật phù hợp.</div>'}</div>`;
  p.querySelector("#sort").value = filter.sort;
  p.querySelector("#cat").value = filter.cat;
  p.querySelector("#q").oninput = (e) => {
    filter.q = e.target.value;
    debounce(() => list(p));
  };
  p.querySelector("#sort").onchange = (e) => {
    filter.sort = e.target.value;
    list(p);
  };
  p.querySelector("#cat").onchange = (e) => {
    filter.cat = e.target.value;
    list(p);
  };
  bindViews(p);
}
function card(x, score) {
  return `<article class="card item"><img loading="lazy" src="${objUrl(x.thumbnailBlob)}"><div><h3>${x.favorite ? "⭐ " : ""}${esc(x.name)}</h3>${score != null ? `<div class="score">Độ tương đồng: ${(score * 100).toFixed(1)}%</div>` : ""}<div class="muted">📍 ${esc(x.location || "Chưa ghi vị trí")}<br>🏷️ ${esc(x.category || "Chưa phân loại")}</div><button class="ghost" data-view="${x.id}">Xem chi tiết</button></div></article>`;
}
function bindViews(el) {
  el.querySelectorAll("[data-view]").forEach(
    (b) => (b.onclick = () => go("detail", Number(b.dataset.view))),
  );
}
async function form(p, item = {}) {
  const editing = !!item.id;
  let savedCategories = [];
  try {
    savedCategories = await db.categories.orderBy("name").toArray();
  } catch (error) {
    console.warn(
      "Chưa đọc được danh mục riêng, dùng danh mục từ dữ liệu cũ.",
      error,
    );
  }
  const legacyCategories = (await db.items.toArray())
    .map((x) => x.category)
    .filter(Boolean);
  const categories = [
    ...new Set([
      ...savedCategories.map((x) => x.name),
      ...legacyCategories.filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  p.innerHTML = `<h2>📷 ${editing ? "Sửa" : "Thêm"} ảnh</h2><form class="panel" id="form"><div class="upload"><button type="button" id="camera">📷 Chụp ảnh</button><button type="button" class="secondary" id="library">🖼 Chọn thư viện</button></div><input hidden type="file" id="cameraFile" accept="image/*" capture="environment"><input hidden type="file" id="libraryFile" accept="image/*">${item.thumbnailBlob ? `<img class="preview" src="${objUrl(item.thumbnailBlob)}">` : '<img class="preview" id="preview" hidden>'}<label>Nội dung liên quan đến ảnh *</label><textarea required name="name" placeholder="Ví dụ: Ly nước chanh trên bàn, dùng trong phòng họp">${esc(item.name)}</textarea><label>Danh mục</label><div class="row"><select name="category" id="category"><option value="">Chưa phân loại</option>${categories.map((c) => `<option value="${esc(c)}" ${c === item.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><button type="button" class="secondary" id="newCategory">+ Tạo</button></div><div id="categoryCreator" hidden><label>Tên danh mục mới</label><div class="row"><input id="categoryName" placeholder="Ví dụ: Đồ uống"><button type="button" id="saveCategory">Lưu danh mục</button></div></div><label>Vị trí</label><input name="location" value="${esc(item.location)}"><label>Ghi chú bổ sung</label><textarea name="description">${esc(item.description)}</textarea><label>Tags (cách nhau bằng dấu phẩy)</label><input name="tags" value="${esc((item.tags || []).join(", "))}"><label class="switch"><input type="checkbox" name="favorite" ${item.favorite ? "checked" : ""}> Yêu thích</label><button id="save">${editing ? "Lưu thay đổi" : "Tạo embedding & lưu"}</button><div id="status" class="muted"></div></form>`;
  const plainContent = p.querySelector('textarea[name="name"]');
  const editorBox = document.createElement("div");
  editorBox.innerHTML = `<div class="editor-toolbar"><button type="button" data-command="bold"><b>B</b></button><button type="button" data-command="italic"><i>I</i></button><button type="button" data-command="insertUnorderedList">• Danh sách</button>${["📦", "📌", "⭐", "⚠️", "✅", "🔧", "🏠", "📝"].map((icon) => `<button type="button" data-icon="${icon}">${icon}</button>`).join("")}</div><div id="contentEditor" class="content-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Ví dụ: Ly nước chanh trên bàn, dùng trong phòng họp"></div>`;
  plainContent.replaceWith(editorBox);
  const contentEditor = p.querySelector("#contentEditor");
  contentEditor.innerHTML = sanitizeContentHtml(
    item.contentHtml || esc(item.name || ""),
  );
  p.querySelectorAll("[data-command]").forEach((button) => {
    button.onclick = () => {
      contentEditor.focus();
      document.execCommand(button.dataset.command, false);
    };
  });
  p.querySelectorAll("[data-icon]").forEach((button) => {
    button.onclick = () => {
      contentEditor.focus();
      document.execCommand("insertText", false, button.dataset.icon);
    };
  });
  let geoData = {
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    locationAccuracy: item.locationAccuracy ?? null,
  };
  const locationInput = p.querySelector('input[name="location"]');
  const locationButton = document.createElement("button");
  locationButton.type = "button";
  locationButton.className = "secondary location-button";
  locationButton.textContent = "📍 Lấy vị trí hiện tại";
  locationInput.insertAdjacentElement("afterend", locationButton);
  const locationStatus = document.createElement("div");
  locationStatus.className = "muted";
  locationButton.insertAdjacentElement("afterend", locationStatus);
  locationButton.onclick = () => {
    if (!navigator.geolocation)
      return toast("Thiết bị không hỗ trợ lấy vị trí.");
    locationButton.disabled = true;
    locationStatus.textContent = "Đang xin quyền và xác định vị trí…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        geoData = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          locationAccuracy: coords.accuracy,
        };
        locationInput.value = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        locationStatus.textContent = `Đã lấy vị trí, độ chính xác khoảng ${Math.round(coords.accuracy)} m.`;
        locationButton.disabled = false;
      },
      (error) => {
        const messages = {
          1: "Bạn chưa cho phép ứng dụng truy cập vị trí.",
          2: "iPhone chưa xác định được vị trí.",
          3: "Quá thời gian lấy vị trí. Hãy thử lại.",
        };
        locationStatus.textContent =
          messages[error.code] || "Không thể lấy vị trí.";
        locationButton.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  p.querySelector("#newCategory").onclick = () => {
    p.querySelector("#categoryCreator").hidden = false;
    p.querySelector("#categoryName").focus();
  };
  p.querySelector("#saveCategory").onclick = async () => {
    const name = p.querySelector("#categoryName").value.trim();
    if (!name) return toast("Hãy nhập tên danh mục.");
    try {
      await db.categories.add({ name, createdAt: Date.now() });
    } catch (error) {
      if (error.name !== "ConstraintError") throw error;
    }
    const option = new Option(name, name, true, true);
    p.querySelector("#category").add(option);
    p.querySelector("#categoryCreator").hidden = true;
    toast("Đã tạo và chọn danh mục.");
  };
  let file = null;
  const choose = (id) => p.querySelector(id).click();
  p.querySelector("#camera").onclick = () => choose("#cameraFile");
  p.querySelector("#library").onclick = () => choose("#libraryFile");
  p.querySelectorAll("input[type=file]").forEach(
    (i) =>
      (i.onchange = (e) => {
        file = e.target.files[0];
        const v = p.querySelector(".preview");
        if (v.src?.startsWith("blob:")) URL.revokeObjectURL(v.src);
        v.src = URL.createObjectURL(file);
        v.hidden = false;
      }),
  );
  p.querySelector("#form").onsubmit = async (e) => {
    e.preventDefault();
    if (!file && !editing) return toast("Bạn cần chọn hoặc chụp ảnh.");
    const btn = p.querySelector("#save"),
      st = p.querySelector("#status");
    btn.disabled = true;
    try {
      let imageData = {};
      if (file) {
        st.textContent = "Đang tối ưu ảnh…";
        imageData = await processImage(file);
        st.textContent = "Đang tạo embedding AI trên thiết bị…";
        imageData.embedding = await ai.embed(imageData.imageBlob);
        imageData.embeddingModel = MODEL;
        imageData.embeddingVersion = MODEL_VERSION;
      }
      const contentHtml = sanitizeContentHtml(contentEditor.innerHTML);
      const contentText = contentToText(contentHtml);
      if (!contentText) {
        btn.disabled = false;
        return toast("Hãy nhập nội dung liên quan đến ảnh.");
      }
      const fd = new FormData(e.target),
        now = Date.now(),
        record = {
          ...item,
          ...imageData,
          name: contentText,
          contentHtml,
          category: fd.get("category").trim(),
          location: fd.get("location").trim(),
          ...geoData,
          description: fd.get("description").trim(),
          tags: fd
            .get("tags")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          favorite: fd.get("favorite") === "on",
          updatedAt: now,
          createdAt: item.createdAt || now,
        };
      await db.items.put(record);
      toast("Đã lưu an toàn trên thiết bị.");
      go("list");
    } catch (err) {
      toast(err.message || "Không thể lưu.");
      btn.disabled = false;
      st.textContent = "Lỗi: " + err.message;
    }
  };
}
async function detail(p) {
  const x = await db.items.get(selected);
  if (!x) return go("list");
  p.innerHTML = `<img class="detail-img" src="${objUrl(x.imageBlob)}"><h2>${x.favorite ? "⭐ " : ""}${esc(x.name)}</h2><div class="panel"><p><b>📍 Vị trí:</b> ${esc(x.location || "—")}</p><p><b>Danh mục:</b> ${esc(x.category || "—")}</p><p><b>Tags:</b> ${esc((x.tags || []).join(", ") || "—")}</p><p><b>Ghi chú:</b> ${esc(x.description || "—")}</p><p class="muted">Tạo: ${date(x.createdAt)} · Sửa: ${date(x.updatedAt)}<br>Ảnh: ${x.imageWidth}×${x.imageHeight} · ${formatBytes(x.imageSize)}</p></div><div class="row"><button id="edit">Sửa</button><button id="fav" class="secondary">${x.favorite ? "Bỏ yêu thích" : "⭐ Yêu thích"}</button><button id="delete" class="danger">Xóa</button></div>`;
  p.querySelector("h2").innerHTML =
    `${x.favorite ? "⭐ " : ""}${sanitizeContentHtml(x.contentHtml || esc(x.name))}`;
  p.querySelector("#edit").onclick = () => form(p, x);
  p.querySelector("#fav").onclick = async () => {
    await db.items.update(x.id, {
      favorite: !x.favorite,
      updatedAt: Date.now(),
    });
    render();
  };
  p.querySelector("#delete").onclick = async () => {
    if (confirm("Bạn có chắc muốn xóa đồ vật này?")) {
      await db.items.delete(x.id);
      toast("Đã xóa đồ vật.");
      go("list");
    }
  };
}
function find(p) {
  if (localStorage.thresholdModel !== MODEL_VERSION) {
    localStorage.threshold = ".65";
    localStorage.thresholdModel = MODEL_VERSION;
  }
  p.innerHTML = `<h2>🔎 Tìm bằng hình ảnh</h2><div class="panel"><p>Chụp lại đồ vật. MobileCLIP sẽ tạo embedding ngay trên máy và so sánh cosine với kho.</p><div class="upload"><button id="cam">📷 Chụp</button><button id="lib" class="secondary">🖼 Thư viện</button></div><input hidden id="cf" type="file" accept="image/*" capture="environment"><input hidden id="lf" type="file" accept="image/*"><img id="pv" class="preview" hidden><label>Ngưỡng tương đồng</label><input id="threshold" type="range" min="0" max="1" step=".01" value="${localStorage.threshold}"><div id="tv">${localStorage.threshold}</div><button id="run" disabled>AI tìm Top 5</button><p id="fs" class="muted"></p></div><div id="results"></div>`;
  const setFile = (e) => {
    searchFile = e.target.files[0];
    if (!searchFile) return;
    const v = p.querySelector("#pv");
    v.src = URL.createObjectURL(searchFile);
    v.hidden = false;
    p.querySelector("#run").disabled = false;
  };
  p.querySelector("#cam").onclick = () => p.querySelector("#cf").click();
  p.querySelector("#lib").onclick = () => p.querySelector("#lf").click();
  p.querySelectorAll("input[type=file]").forEach((x) => (x.onchange = setFile));
  p.querySelector("#threshold").oninput = (e) => {
    localStorage.threshold = e.target.value;
    p.querySelector("#tv").textContent = e.target.value;
  };
  p.querySelector("#run").onclick = async () => {
    const st = p.querySelector("#fs"),
      out = p.querySelector("#results");
    try {
      st.textContent = "Đang tạo query embedding MobileCLIP local…";
      const processed = await processImage(searchFile),
        q = await ai.embed(processed.imageBlob);
      st.textContent = "Đang so sánh embedding…";
      const rows = await db.items
        .where("embeddingModel")
        .equals(MODEL)
        .and((x) => x.embeddingVersion === MODEL_VERSION)
        .toArray();
      if (!rows.length)
        throw new Error(
          "Chưa có embedding MobileCLIP. Vào Dữ liệu → Tạo lại embedding trước.",
        );
      const ranked = await searchWorker(
        q,
        rows.map((x) => ({ id: x.id, embedding: x.embedding })),
      );
      const threshold = Number(p.querySelector("#threshold").value),
        good = ranked.filter((x) => x.score >= threshold),
        items = await Promise.all(
          good.map(async (r) => ({
            ...(await db.items.get(r.id)),
            score: r.score,
          })),
        );
      out.innerHTML = `<h2>Kết quả</h2>${items.length ? items.map((x) => card(x, x.score)).join("") : '<div class="panel">Không tìm thấy kết quả đủ giống. Hãy thử góc chụp khác hoặc giảm ngưỡng.</div>'}`;
      bindViews(out);
      st.textContent =
        "Điểm hiển thị là cosine similarity, không phải xác suất.";
    } catch (e) {
      st.textContent = "Lỗi: " + e.message;
    }
  };
}
async function dataPage(p) {
  const s = await stats(),
    est = (await navigator.storage?.estimate?.()) || {},
    persisted = await navigator.storage?.persisted?.();
  const mismatched = await db.items
    .filter(
      (x) => x.embeddingModel !== MODEL || x.embeddingVersion !== MODEL_VERSION,
    )
    .count();
  p.innerHTML = `<h2>⚙️ Dữ liệu & cài đặt</h2><div class="panel"><p><b>Số đồ vật:</b> ${s.count}</p><p><b>Dung lượng dữ liệu:</b> ${formatBytes(s.bytes)}</p><p><b>Storage trình duyệt:</b> ${formatBytes(est.usage || 0)} / ${formatBytes(est.quota || 0)}</p><p>${persisted ? "✅ Persistent storage được cấp" : "⚠️ Persistent storage chưa được cấp"}</p><button id="persist" class="secondary">Yêu cầu lưu trữ bền vững</button></div><div class="panel"><h3>Sao lưu & khôi phục</h3><button id="backup">📤 Sao lưu toàn bộ</button><button id="restore" class="secondary">📥 Khôi phục ZIP</button><input hidden id="zip" type="file" accept=".zip,application/zip"><p id="prog" class="muted"></p></div><div class="panel"><h3>AI model</h3><p>${esc(MODEL)}<br>Phiên bản embedding: ${MODEL_VERSION}<br>${mismatched} mục cần tạo lại embedding.</p><button id="reembed" ${mismatched ? "" : "disabled"}>Tạo lại embedding</button></div><div class="panel"><h3>Quyền riêng tư</h3><p>Ảnh và dữ liệu được lưu trong IndexedDB trên thiết bị. Ứng dụng không upload ảnh cá nhân lên máy chủ. AI image search chạy local trong trình duyệt.</p></div>`;
  const prog = p.querySelector("#prog");
  p.querySelector("#persist").onclick = async () =>
    toast(
      (await navigator.storage?.persist?.())
        ? "Đã cấp lưu trữ bền vững."
        : "Trình duyệt chưa cấp quyền.",
    );
  p.querySelector("#backup").onclick = async () => {
    try {
      prog.textContent = "Đang đóng gói…";
      await exportBackup(
        (a, b) => (prog.textContent = `Đang sao lưu ${a} / ${b}`),
      );
      prog.textContent = "Sao lưu hoàn tất.";
    } catch (e) {
      prog.textContent = "Lỗi: " + e.message;
    }
  };
  p.querySelector("#restore").onclick = () => p.querySelector("#zip").click();
  p.querySelector("#zip").onchange = async (e) => {
    if (!confirm("Khôi phục sẽ nhập/ghi đè các ID trùng. Tiếp tục?")) return;
    try {
      const n = await importBackup(
        e.target.files[0],
        (a, b) => (prog.textContent = `Đang khôi phục ${a} / ${b}`),
      );
      toast(`Đã khôi phục ${n} đồ vật.`);
      render();
    } catch (e) {
      prog.textContent = "Lỗi: " + e.message;
    }
  };
  p.querySelector("#reembed").onclick = async () => {
    const rows = await db.items
      .filter(
        (x) =>
          x.embeddingModel !== MODEL || x.embeddingVersion !== MODEL_VERSION,
      )
      .toArray();
    for (let i = 0; i < rows.length; i++) {
      prog.textContent = `Tạo lại embedding ${i + 1} / ${rows.length}`;
      const embedding = await ai.embed(rows[i].imageBlob);
      await db.items.update(rows[i].id, {
        embedding,
        embeddingModel: MODEL,
        embeddingVersion: MODEL_VERSION,
        updatedAt: Date.now(),
      });
      await new Promise(requestAnimationFrame);
    }
    render();
  };
}
const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
const formatBytes = (n) =>
  !n
    ? "0 B"
    : n > 1073741824
      ? (n / 1073741824).toFixed(1) + " GB"
      : n > 1048576
        ? (n / 1048576).toFixed(1) + " MB"
        : n > 1024
          ? (n / 1024).toFixed(1) + " KB"
          : n + " B";
const date = (n) => new Date(n).toLocaleString("vi-VN");
let timer;
const debounce = (f) => {
  clearTimeout(timer);
  timer = setTimeout(f, 180);
};
ai.on(() => {
  if (app.children.length)
    document
      .querySelector(".ai-pill")
      ?.replaceChildren(
        document.createTextNode(
          `🤖 AI: ${ai.state === "ready" ? "Sẵn sàng" : ai.state === "loading" ? "Đang tải…" : ai.state === "error" ? "Lỗi" : "Chưa tải"}`,
        ),
      );
});
if ("serviceWorker" in navigator)
  addEventListener("load", () =>
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(console.error),
  );
if (!localStorage.onboarded) {
  app.insertAdjacentHTML(
    "afterend",
    `<div class="modal" id="onboard"><div><h2>Kho Đồ AI</h2><p>Ảnh và thông tin được lưu trực tiếp trên thiết bị.</p><p>AI chạy local. Ảnh không được gửi lên server.</p><button>Bắt đầu</button></div></div>`,
  );
  document.querySelector("#onboard button").onclick = () => {
    localStorage.onboarded = "1";
    document.querySelector("#onboard").remove();
    ai.load().catch(() => toast("Chưa tải được AI. Kiểm tra mạng lần đầu."));
  };
} else ai.load().catch(() => {});
render();
