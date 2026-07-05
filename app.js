const API_URL = "https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec";

const state = {
  dashboard: null,
  rechazos: [],
  detail: null,
  charts: {},
};

const labels = {
  NUEVO_DANO: "Nuevo dano",
  PINTURA_NO_CONFORME: "Pintura no conforme",
  RECEPCION_NO_DETECTO: "Recepcion no detecto",
  FALLA_ACONDICIONADO: "Falla de acondicionado",
  ERROR_IMPORTADOR: "Error importador",
  NO_CONCLUYENTE: "No concluyente",
  CONTROL_CALIDAD: "Control Calidad",
  IMPORTADOR_VARI_REVO: "VARI / REVO",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

const palette = ["#1f7ae0", "#22c55e", "#f4c430", "#ef4444", "#38bdf8", "#0b1f3a", "#8b5cf6", "#f97316"];

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindControls();
  loadStatus();
  loadDashboard();
});

function jsonpRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callback = `cr_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const query = new URLSearchParams({ action, callback });

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        query.set(key, value);
      }
    });

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Tiempo agotado consultando ${action}`));
    }, 45000);

    window[callback] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`No se pudo consultar ${action}`));
    };

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callback];
      script.remove();
    }

    script.src = `${API_URL}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function bindControls() {
  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadDashboard();
    if (getActiveView() === "rechazos") {
      loadRechazos();
    }
  });

  document.getElementById("applyFiltersBtn").addEventListener("click", loadRechazos);
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadRechazos();
  });

  document.getElementById("validationForm").addEventListener("submit", saveLocalValidation);
}

function showView(viewName) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${viewName}View`);
  });

  const titles = {
    dashboard: ["Dashboard", "KPIs sugeridos por sistema. No se escribe en las fuentes."],
    rechazos: ["Rechazos pendientes", "Lista completa con scroll propio y filtros."],
    detalle: ["Detalle / Validacion", "Analisis manual con evidencia e historial por VIN."],
    kpis: ["KPIs sugeridos", "Distribuciones calculadas por el sistema."],
  };
  document.getElementById("pageTitle").textContent = titles[viewName][0];
  document.getElementById("pageSubtitle").textContent = titles[viewName][1];

  if (viewName === "rechazos" && !state.rechazos.length) loadRechazos();
  if (viewName === "kpis" && state.dashboard) renderKpiTables(state.dashboard);
}

function getActiveView() {
  const active = document.querySelector(".nav-item.active");
  return active ? active.dataset.view : "dashboard";
}

async function loadStatus() {
  try {
    const payload = await jsonpRequest("status");
    if (!payload.ok) throw new Error(payload.error || "Estado no disponible");
    document.querySelector(".status-dot").style.background = "#22c55e";
    document.getElementById("statusText").textContent = payload.estado_demo || payload.modo || "Solo lectura";
    document.getElementById("statusSubtext").textContent = payload.sistema || "Apps Script JSONP";
  } catch (error) {
    document.querySelector(".status-dot").style.background = "#ef4444";
    document.getElementById("statusText").textContent = "Sin conexion";
    document.getElementById("statusSubtext").textContent = error.message;
  }
}

async function loadDashboard() {
  try {
    setBusy(true);
    const dias = document.getElementById("daysSelect").value;
    const payload = await jsonpRequest("dashboard", { dias });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar dashboard");
    state.dashboard = payload;
    renderDashboard(payload);
    renderKpiTables(payload);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderDashboard(data) {
  setText("kpiCasos", data.total_casos_rechazo);
  setText("kpiItems", data.total_items_danos);
  setText("kpiCc", data.items_control_calidad);
  setText("kpiDealer", data.items_vari_revo);
  setText("kpiNoConcluyente", data.total_no_concluyente);

  renderDoughnut("causasChart", data.causa_raiz_sugerida, "causa");
  renderDoughnut("subcausasChart", data.subcausas_sugeridas, "subcausa");
  renderDoughnut("origenChart", data.origen_rechazo, "origen");
  renderDoughnut("fuenteChart", data.fuente_rechazo, "fuente");
}

async function loadRechazos() {
  try {
    setBusy(true);
    const payload = await jsonpRequest("rechazos", {
      dias: document.getElementById("daysSelect").value,
      origen: document.getElementById("originFilter").value,
      fuente: document.getElementById("sourceFilter").value,
      causa: document.getElementById("causeFilter").value,
      confianza: document.getElementById("confidenceFilter").value,
      q: document.getElementById("searchInput").value.trim(),
    });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar rechazos");
    state.rechazos = payload.items || [];
    renderRechazos(state.rechazos);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderRechazos(items) {
  const tbody = document.getElementById("rechazosTableBody");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="10">No hay rechazos para los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.VIN)}</strong></td>
      <td>${escapeHtml([item.Marca, item.Modelo].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(display(item.Origen_Rechazo))}</td>
      <td>${escapeHtml(item.Fuente_Nombre || item.Fuente || "-")}</td>
      <td>${escapeHtml(item.Revision || "-")}</td>
      <td>${escapeHtml(item.Descripcion_Original || "-")}</td>
      <td>${escapeHtml(display(item.Causa_Sugerida))}</td>
      <td>${escapeHtml(item.Subcausa_Sugerida || "-")}</td>
      <td><span class="pill ${String(item.Confianza_Sugerida || "").toLowerCase()}">${escapeHtml(display(item.Confianza_Sugerida))}</span></td>
      <td><button class="secondary-btn" type="button" data-action="analizar" data-id="${escapeHtml(item.ID_Item)}" data-vin="${escapeHtml(item.VIN)}" data-evento="${escapeHtml(item.ID_Evento)}">Analizar</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-action='analizar']").forEach((button) => {
    button.addEventListener("click", () => loadDetalle(button.dataset.id, button.dataset.vin, button.dataset.evento));
  });
}

async function loadDetalle(idItem, vin, idEvento) {
  try {
    setBusy(true);
    const payload = await jsonpRequest("detalle", { id_item: idItem, vin, id_evento: idEvento });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar detalle");
    state.detail = payload;
    renderDetalle(payload);
    showView("detalle");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderDetalle(data) {
  document.getElementById("detailEmpty").classList.add("hidden");
  document.getElementById("detailContent").classList.remove("hidden");

  const item = data.item_seleccionado || {};
  const vin = data.datos_vin || {};
  const confidence = document.getElementById("detailConfidence");
  confidence.textContent = display(item.Confianza_Sugerida);
  confidence.className = `pill ${String(item.Confianza_Sugerida || "").toLowerCase()}`;

  renderInfo("vinInfo", {
    VIN: vin.VIN,
    Marca: vin.Marca,
    Modelo: vin.Modelo,
    Color: vin.Color,
    Origen: display(vin.Origen_Actual),
    Fuente: vin.Fuente_Actual,
    Fecha: vin.Fecha_Rechazo,
    Responsable: vin.Responsable,
    "Causa sugerida": display(item.Causa_Sugerida),
    "Motivo sugerencia": item.Motivo_Sugerencia,
  });

  renderInfo("itemInfo", {
    "Descripcion original": item.Descripcion_Original,
    "Texto normalizado": item.Texto_Normalizado,
    Parte: item.Parte_Normalizada,
    Zona: item.Zona_Normalizada,
    Lado: item.Lado_Normalizado,
    Posicion: item.Posicion_Normalizada,
    "Tipo dano": item.Tipo_Dano_Normalizado,
    Subcausa: item.Subcausa_Sugerida,
  });

  renderItemSelector(data.items_evento || [], item.ID_Item);
  renderCurrentReject(data);
  renderHistory("ccHistory", data.historial_control_calidad || []);
  renderEsum(data.inspeccion_inicial_esum || []);
  hydrateLocalValidation(item.ID_Item);
}

function renderItemSelector(items, selectedId) {
  const select = document.getElementById("eventItemSelector");
  select.innerHTML = items.map((item) => `
    <option value="${escapeHtml(item.ID_Item)}" ${item.ID_Item === selectedId ? "selected" : ""}>
      ${escapeHtml(`${item.Parte_Normalizada || "Item"} - ${item.Descripcion_Original || ""}`)}
    </option>
  `).join("");

  select.onchange = () => {
    const current = state.detail;
    const next = (current.items_evento || []).find((item) => item.ID_Item === select.value);
    if (next) loadDetalle(next.ID_Item, next.VIN, next.ID_Evento);
  };
}

function renderCurrentReject(data) {
  const container = document.getElementById("currentReject");
  const item = data.item_seleccionado || {};
  const event = data.evento_actual || {};
  const photos = data.fotos_rechazo_actual || [];

  const description = item.Fuente === "CONTROL_CALIDAD"
    ? `
      <p><strong>Descripcion:</strong> ${escapeHtml(item.Descripcion_Original || "-")}</p>
      <p><strong>Responsable:</strong> ${escapeHtml(item.Responsable || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(item.Fecha_Item || "-")}</p>
    `
    : `
      <p><strong>Observacion completa:</strong> ${escapeHtml(event.Descripcion_Evento || item.Descripcion_Original || "-")}</p>
      <p><strong>Revisor:</strong> ${escapeHtml(item.Responsable || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(item.Fecha_Item || "-")}</p>
      <p><span class="tag">Fotos de la revision completa</span></p>
    `;

  container.innerHTML = `
    <div class="history-card">${description}</div>
    ${renderPhotos(photos)}
  `;
}

function renderHistory(targetId, items) {
  const target = document.getElementById(targetId);
  if (!items.length) {
    target.innerHTML = `<div class="history-card">Sin registros.</div>`;
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="history-card">
      <strong>${escapeHtml(item.Fecha_Item || "-")} · ${escapeHtml(item.Fuente || "-")}</strong>
      <p>${escapeHtml(item.Descripcion_Original || "-")}</p>
      <p>${escapeHtml(display(item.Causa_Sugerida))} · ${escapeHtml(display(item.Confianza_Sugerida))}</p>
      ${renderPhotos((item._foto_refs || []).map((ref) => ({ Original: ref, Url: imageUrl(ref), Etiqueta: "Evidencia" })))}
    </article>
  `).join("");
}

function renderEsum(rows) {
  const target = document.getElementById("esumHistory");
  if (!rows.length) {
    target.innerHTML = `<div class="history-card">Sin evidencias eSUM para este VIN.</div>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <article class="history-card">
      <strong>${escapeHtml(row.Seccion || "-")} · <span class="tag">${escapeHtml(row.Validacion || "-")}</span></strong>
      <p><strong>Diagnostico:</strong> ${escapeHtml(row.Diag_eSUM || "-")}</p>
      <p><strong>Comentario:</strong> ${escapeHtml(row.Comentario || "-")}</p>
      <p>${escapeHtml(row.Colaborador || "-")} · ${escapeHtml(row.Fecha_Hora || "-")}</p>
      ${renderPhotos(row.Fotos || [])}
    </article>
  `).join("");
}

function renderPhotos(photos) {
  if (!photos || !photos.length) return `<div class="media-grid"></div>`;

  return `
    <div class="media-grid">
      ${photos.map((photo) => {
        const url = photo.Url || imageUrl(photo.Original || "");
        if (!url) {
          return `
            <div class="media-card">
              <div>
                <strong>${escapeHtml(photo.Etiqueta || "Foto")}</strong><br>
                <a href="${escapeHtml(photo.Abrir_Foto || photo.Original || "#")}" target="_blank" rel="noopener">Abrir foto</a>
              </div>
            </div>
          `;
        }
        return `
          <div class="media-card">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(photo.Etiqueta || "Foto")}" loading="lazy" referrerpolicy="no-referrer">
            <div>
              <strong>${escapeHtml(photo.Etiqueta || "Foto")}</strong><br>
              <a href="${escapeHtml(photo.Abrir_Foto || url)}" target="_blank" rel="noopener">Abrir foto</a>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDoughnut(canvasId, rows, keyField) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;
  if (state.charts[canvasId]) state.charts[canvasId].destroy();

  const labelsForChart = (rows || []).map((row) => display(row.nombre || row[keyField]));
  const values = (rows || []).map((row) => Number(row.cantidad || 0));

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labelsForChart,
      datasets: [{
        data: values,
        backgroundColor: palette,
        borderWidth: 2,
        borderColor: "#ffffff",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12 } },
      },
      cutout: "62%",
    },
  });
}

function renderKpiTables(data) {
  renderDistributionTable("causaTable", data.causa_raiz_sugerida || [], "causa");
  renderDistributionTable("subcausaTable", data.subcausas_sugeridas || [], "subcausa");
  renderDistributionTable("fuenteTable", data.fuente_rechazo || [], "fuente");
}

function renderDistributionTable(targetId, rows, keyField) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<p>Sin datos.</p>`;
    return;
  }
  target.innerHTML = `
    <table class="mini-table">
      <thead><tr><th>Categoria</th><th>Cantidad</th><th>%</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(display(row.nombre || row[keyField]))}</td>
            <td>${escapeHtml(row.cantidad)}</td>
            <td>${escapeHtml(row.porcentaje)}%</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderInfo(targetId, data) {
  document.getElementById(targetId).innerHTML = Object.entries(data).map(([key, value]) => `
    <div class="info-item">
      <span>${escapeHtml(key)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
}

function saveLocalValidation(event) {
  event.preventDefault();
  const item = state.detail && state.detail.item_seleccionado;
  if (!item) return;

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  payload.ID_Item = item.ID_Item;
  payload.VIN = item.VIN;
  payload.guardado_el = new Date().toISOString();
  localStorage.setItem(`cr_validation_${item.ID_Item}`, JSON.stringify(payload));
  toast("Validacion local guardada en este navegador.");
}

function hydrateLocalValidation(idItem) {
  const raw = localStorage.getItem(`cr_validation_${idItem}`);
  const form = document.getElementById("validationForm");
  form.reset();
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.entries(saved).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
  } catch (error) {
    console.warn(error);
  }
}

function imageUrl(value) {
  const raw = String(value || "");
  const byId = raw.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  const byFile = raw.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  const loose = raw.match(/\b([A-Za-z0-9_-]{25,})\b/);
  const id = byId?.[1] || byFile?.[1] || loose?.[1];
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function setText(id, value) {
  document.getElementById(id).textContent = value ?? "-";
}

function display(value) {
  return labels[value] || value || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setBusy(isBusy) {
  document.getElementById("refreshBtn").disabled = isBusy;
  document.getElementById("applyFiltersBtn").disabled = isBusy;
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => element.classList.add("hidden"), 4200);
}
