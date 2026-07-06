const API_URL = "https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec";

const state = {
  dashboard: null,
  rechazos: [],
  detail: null,
  detailCache: {},
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
    }, 60000);

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
  document.getElementById("manualDamageInput").addEventListener("input", updateManualDamageState);
  document.getElementById("photoModalClose").addEventListener("click", closePhotoModal);
  document.getElementById("photoModal").addEventListener("click", (event) => {
    if (event.target.id === "photoModal") closePhotoModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePhotoModal();
  });
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo-open]");
    if (card) {
      openPhotoModal(card.dataset.photoOpen, card.dataset.photoKind, card.dataset.photoLabel);
    }
  });
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

  renderDoughnut("causasChart", data.causa_raiz_sugerida, "causa", { legendPosition: "bottom" });
  renderDoughnut("subcausasChart", data.subcausas_sugeridas, "subcausa", { legendPosition: "right", cutout: "58%" });
  renderDoughnut("origenChart", data.origen_rechazo, "origen", { legendPosition: "bottom", cutout: "60%" });
  renderDoughnut("fuenteChart", data.fuente_rechazo, "fuente", { legendPosition: "right", cutout: "60%" });
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
  const rows = rechazoRowsForTable(items);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10">No hay rechazos para los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((item) => {
    const isDealer = isDealerItem(item);
    const description = isDealer
      ? item.Descripcion_Evento || item.Descripcion_Original || "-"
      : item.Descripcion_Original || "-";
    const damageCount = isDealer && Number(item.Cantidad_Danos_Evento || 0) > 1
      ? `<br><span class="tag">${escapeHtml(item.Cantidad_Danos_Evento)} danos</span>`
      : "";

    return `
    <tr>
      <td><strong>${escapeHtml(item.VIN)}</strong></td>
      <td>${escapeHtml([item.Marca, item.Modelo].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(display(item.Origen_Rechazo))}</td>
      <td>${escapeHtml(item.Fuente_Nombre || item.Fuente || "-")}</td>
      <td>${escapeHtml(item.Revision || "-")}</td>
      <td class="description-cell">${escapeHtml(description)}${damageCount}</td>
      <td>${escapeHtml(display(item.Causa_Sugerida))}</td>
      <td>${escapeHtml(item.Subcausa_Sugerida || "-")}</td>
      <td><span class="pill ${String(item.Confianza_Sugerida || "").toLowerCase()}">${escapeHtml(display(item.Confianza_Sugerida))}</span></td>
      <td><button class="secondary-btn" type="button" data-action="analizar" data-id="${escapeHtml(item.ID_Item)}" data-vin="${escapeHtml(item.VIN)}" data-evento="${escapeHtml(item.ID_Evento)}">Analizar</button></td>
    </tr>
  `;
  }).join("");

  tbody.querySelectorAll("[data-action='analizar']").forEach((button) => {
    button.addEventListener("click", () => loadDetalle(button.dataset.id, button.dataset.vin, button.dataset.evento));
  });
}

function rechazoRowsForTable(items) {
  const seenDealerEvents = new Set();
  return (items || []).filter((item) => {
    if (!isDealerItem(item)) return true;
    if (seenDealerEvents.has(item.ID_Evento)) return false;
    seenDealerEvents.add(item.ID_Evento);
    return true;
  });
}

async function loadDetalle(idItem, vin, idEvento) {
  const cacheKey = `${idItem || ""}|${vin || ""}|${idEvento || ""}`;
  showView("detalle");
  setDetailLoading("Cargando detalle y evidencias...");

  if (state.detailCache[cacheKey]) {
    state.detail = state.detailCache[cacheKey];
    renderDetalle(state.detail);
    return;
  }

  try {
    setBusy(true);
    const payload = await jsonpRequest("detalle", { id_item: idItem, vin, id_evento: idEvento });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar detalle");
    state.detail = payload;
    state.detailCache[cacheKey] = payload;
    renderDetalle(payload);
  } catch (error) {
    setDetailLoading("No se pudo cargar el detalle. Reintenta desde Rechazos pendientes.");
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function setDetailLoading(message) {
  document.getElementById("detailContent").classList.add("hidden");
  const empty = document.getElementById("detailEmpty");
  empty.textContent = message;
  empty.classList.remove("hidden");
}

function renderDetalle(data) {
  document.getElementById("detailEmpty").classList.add("hidden");
  document.getElementById("detailContent").classList.remove("hidden");

  const item = data.item_seleccionado || {};
  const vin = data.datos_vin || {};
  const flow = detailFlow(data);
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

  renderItemSelector(data.items_evento || [], item.ID_Item, flow.showSelector);
  renderCurrentReject(data);
  renderControlQualityHistory(data, flow);
  renderInitialEsum(data.inspeccion_inicial_esum || []);
  hydrateLocalValidation(item.ID_Item);
  updateManualDamageState();
}

function detailFlow(data) {
  const item = data.item_seleccionado || {};
  const meta = data.flujo_detalle || {};
  const isControlQuality = meta.es_control_calidad ?? item.Fuente === "CONTROL_CALIDAD";
  const isDealer = meta.es_vari_revo ?? isDealerItem(item);
  return {
    isControlQuality,
    isDealer,
    showSelector: meta.requiere_selector_dano ?? isDealer,
    showControlQualityHistory: meta.mostrar_historial_control_calidad ?? isDealer,
  };
}

function renderItemSelector(items, selectedId, showSelector) {
  const panel = document.getElementById("eventItemSelectorPanel");
  const select = document.getElementById("eventItemSelector");
  const manual = document.getElementById("manualDamageInput");
  panel.classList.toggle("hidden", !showSelector);
  if (!showSelector) {
    select.innerHTML = "";
    select.onchange = null;
    manual.value = "";
    return;
  }

  select.innerHTML = items.map((item) => `
    <option value="${escapeHtml(item.ID_Item)}" ${item.ID_Item === selectedId ? "selected" : ""}>
      ${escapeHtml(itemLabel(item, items))}
    </option>
  `).join("");
  select.disabled = items.length <= 1;

  select.onchange = () => {
    const current = state.detail;
    const next = (current.items_evento || []).find((item) => item.ID_Item === select.value);
    if (next) loadDetalle(next.ID_Item, next.VIN, next.ID_Evento);
  };
}

function itemLabel(item, items) {
  const index = Math.max(0, (items || []).findIndex((candidate) => candidate.ID_Item === item.ID_Item)) + 1;
  const description = item.Descripcion_Original || item.Texto_Normalizado || "Dano";
  return `${index}. ${description}`;
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
      <p><strong>Revision:</strong> ${escapeHtml(item.Revision || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(item.Fecha_Item || "-")}</p>
    `
    : `
      <p><strong>Observacion completa:</strong> ${escapeHtml(event.Descripcion_Evento || item.Descripcion_Original || "-")}</p>
      <p><strong>Revisor:</strong> ${escapeHtml(item.Responsable || "-")}</p>
      <p><strong>Revision:</strong> ${escapeHtml(item.Revision || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(item.Fecha_Item || "-")}</p>
    `;

  container.innerHTML = `
    <div class="history-card">${description}</div>
    ${renderPhotos(photos)}
  `;
}

function renderHistory(targetId, items) {
  const target = document.getElementById(targetId);
  if (!items.length) {
    target.innerHTML = `<div class="history-card">Sin fotos de Control Calidad para este VIN.</div>`;
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="history-card">
      <strong>${escapeHtml(item.Fecha_Item || "-")} · ${escapeHtml(item.Fuente || "-")}</strong>
      <p>${escapeHtml(item.Descripcion_Original || "-")}</p>
      <p>${escapeHtml(display(item.Causa_Sugerida))} · ${escapeHtml(display(item.Confianza_Sugerida))}</p>
      ${renderPhotos((item._foto_refs || []).map((ref) => controlQualityPhoto(ref, "Evidencia")))}
    </article>
  `).join("");
}

function renderControlQualityHistory(data, flow) {
  const panel = document.getElementById("ccHistoryPanel");
  const evidenceGrid = document.getElementById("evidenceGrid");
  panel.classList.toggle("hidden", !flow.showControlQualityHistory);
  evidenceGrid.classList.toggle("cc-flow", !flow.showControlQualityHistory);

  if (!flow.showControlQualityHistory) {
    document.getElementById("ccHistory").innerHTML = "";
    return;
  }

  renderCcHistory("ccHistory", data.historial_control_calidad || []);
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

function renderCcHistory(targetId, items) {
  const target = document.getElementById(targetId);
  if (!items.length) {
    target.innerHTML = `<div class="history-card">Sin fotos de Control Calidad para este VIN.</div>`;
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="history-card">
      <strong>${escapeHtml(item.Revision || item.Fuente || "-")}</strong>
      <p>${escapeHtml(item.Descripcion_Original || "-")}</p>
      <p><strong>Responsable:</strong> ${escapeHtml(item.Responsable || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(item.Fecha_Item || "-")}</p>
      <p>${escapeHtml(display(item.Causa_Sugerida))} - ${escapeHtml(display(item.Confianza_Sugerida))}</p>
      ${renderPhotos(controlQualityPhotosForItem(item))}
    </article>
  `).join("");
}

function renderInitialEsum(rows) {
  const target = document.getElementById("esumHistory");
  if (!rows.length) {
    target.innerHTML = `<div class="history-card">Sin evidencias eSUM para este VIN.</div>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <article class="history-card">
      <strong>${escapeHtml(row.Seccion || "-")} <span class="tag">${escapeHtml(row.Validacion || "-")}</span></strong>
      <p><strong>Diagnostico:</strong> ${escapeHtml(row.Diag_eSUM || "-")}</p>
      <p><strong>Comentario:</strong> ${escapeHtml(row.Comentario || "-")}</p>
      <p><strong>Colaborador:</strong> ${escapeHtml(row.Colaborador || "-")}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(row.Fecha_Hora || "-")}</p>
      ${renderPhotos(row.Fotos || [])}
    </article>
  `).join("");
}

function controlQualityPhotosForItem(item) {
  return (item._foto_refs || []).map((ref, index) => {
    const label = index === 0 ? "Evidencia inicial del dano" : "Evidencia despues del reproceso";
    return controlQualityPhoto(ref, label);
  });
}

function renderPhotos(photos) {
  if (!photos || !photos.length) return `<div class="media-grid"></div>`;

  return `
    <div class="media-grid">
      ${photos.map((photo) => {
        const endpointUrl = absoluteApiUrl(photo.Endpoint_Sugerido || "");
        const rawOpenUrl = endpointUrl || safeOpenUrl(photo.Abrir_Foto || photo.Original || "");
        const thumbnailUrl = photo.Url || imageUrl(photo.Original || "");
        const frameUrl = endpointUrl || photo.Preview_Url || drivePreviewUrl(photo.Url || photo.Abrir_Foto || photo.Original || "");
        const openUrl = rawOpenUrl || thumbnailUrl || frameUrl || "#";
        const label = photo.Etiqueta || "Foto";
        const showCaption = shouldShowPhotoCaption(label);
        const modalUrl = frameUrl || thumbnailUrl || openUrl;
        const modalKind = frameUrl ? "frame" : "image";

        if (frameUrl) {
          return `
            <button class="media-card media-button" type="button" data-photo-open="${escapeHtml(modalUrl)}" data-photo-kind="${escapeHtml(modalKind)}" data-photo-label="${escapeHtml(label)}">
              <iframe src="${escapeHtml(frameUrl)}" title="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
              ${showCaption ? `<span class="media-caption"><strong>${escapeHtml(label)}</strong></span>` : ""}
            </button>
          `;
        }

        if (!thumbnailUrl) {
          return `
            <button class="media-card media-button no-preview" type="button" data-photo-open="${escapeHtml(openUrl)}" data-photo-kind="frame" data-photo-label="${escapeHtml(label)}">
              ${showCaption ? `<span class="media-caption"><strong>${escapeHtml(label)}</strong></span>` : ""}
            </button>
          `;
        }

        return `
          <button class="media-card media-button" type="button" data-photo-open="${escapeHtml(modalUrl)}" data-photo-kind="${escapeHtml(modalKind)}" data-photo-label="${escapeHtml(label)}">
            <img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.media-card').classList.add('image-error'); this.remove();">
            ${showCaption ? `<span class="media-caption"><strong>${escapeHtml(label)}</strong></span>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function shouldShowPhotoCaption(label) {
  return !/^fotos de la revision completa$/i.test(String(label || "").trim());
}

function controlQualityPhoto(ref, label) {
  const raw = String(ref || "").trim();
  const name = fileNameFromPath(raw);
  const endpoint = name ? `?action=foto_cc&nombre=${encodeURIComponent(name)}` : "";
  return {
    Original: raw,
    Nombre: name,
    Etiqueta: label,
    Endpoint_Sugerido: endpoint,
    Abrir_Foto: endpoint,
  };
}

function fileNameFromPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || raw;
}

function renderDoughnut(canvasId, rows, keyField, config = {}) {
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
        legend: {
          position: config.legendPosition || "bottom",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            usePointStyle: true,
            font: { size: 12 },
          },
        },
      },
      layout: { padding: 4 },
      cutout: config.cutout || "62%",
    },
  });
}

function isDealerItem(item) {
  return item && (item.Fuente === "VARI" || item.Fuente === "REVO" || item.Origen_Rechazo === "IMPORTADOR_VARI_REVO");
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

async function saveLocalValidation(event) {
  event.preventDefault();
  const item = state.detail && state.detail.item_seleccionado;
  if (!item) return;

  const button = document.getElementById("saveValidationBtn");
  const status = document.getElementById("validationSaveStatus");
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  const manualDamage = document.getElementById("manualDamageInput").value.trim();
  const finalDamage = manualDamage || selectedDamageText();

  payload.ID_Item = item.ID_Item;
  payload.ID_Evento = item.ID_Evento;
  payload.VIN = item.VIN;
  payload.Origen_Rechazo = item.Origen_Rechazo;
  payload.Fuente = item.Fuente;
  payload.Revision = item.Revision;
  payload.Descripcion_Item = item.Descripcion_Original;
  payload.Dano_Validado = finalDamage;
  payload.Dano_Manual = manualDamage;
  payload.Causa_Sugerida = item.Causa_Sugerida;
  payload.Subcausa_Sugerida = item.Subcausa_Sugerida;
  payload.Confianza_Sugerida = item.Confianza_Sugerida;
  payload.Responsable_Item = item.Responsable || "";
  payload.Fecha_Item = item.Fecha_Item || "";
  payload.guardado_el = new Date().toISOString();
  localStorage.setItem(`cr_validation_${item.ID_Item}`, JSON.stringify(payload));

  try {
    button.disabled = true;
    status.textContent = "Guardando validacion...";
    const response = await jsonpRequest("guardar_validacion", payload);
    if (!response.ok) throw new Error(response.error || "No se pudo guardar la validacion");
    status.textContent = `Guardado en hoja de validaciones, fila ${response.row}.`;
    toast("Validacion guardada en Excel/Sheets.");
  } catch (error) {
    status.textContent = "No se pudo guardar en la hoja. Quedo respaldo local en este navegador.";
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function hydrateLocalValidation(idItem) {
  const raw = localStorage.getItem(`cr_validation_${idItem}`);
  const form = document.getElementById("validationForm");
  const manual = document.getElementById("manualDamageInput");
  const status = document.getElementById("validationSaveStatus");
  form.reset();
  manual.value = "";
  status.textContent = "Se guarda en la hoja dedicada de validaciones.";
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.entries(saved).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
    manual.value = saved.Dano_Manual || saved.dano_manual || "";
  } catch (error) {
    console.warn(error);
  }
}

function selectedDamageText() {
  const manual = document.getElementById("manualDamageInput").value.trim();
  if (manual) return manual;

  const select = document.getElementById("eventItemSelector");
  if (select && select.value && select.options.length) {
    return select.options[select.selectedIndex].textContent.replace(/^\d+\.\s*/, "").trim();
  }

  const item = state.detail && state.detail.item_seleccionado;
  return item ? (item.Descripcion_Original || item.Texto_Normalizado || "") : "";
}

function updateManualDamageState() {
  const manual = document.getElementById("manualDamageInput");
  if (!manual) return;
  manual.classList.toggle("has-value", Boolean(manual.value.trim()));
}

function openPhotoModal(url, kind, label) {
  if (!url || url === "#") return;
  const modal = document.getElementById("photoModal");
  const body = document.getElementById("photoModalBody");
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label || "Foto");
  body.innerHTML = kind === "image"
    ? `<img src="${safeUrl}" alt="${safeLabel}">`
    : `<iframe src="${safeUrl}" title="${safeLabel}" referrerpolicy="no-referrer"></iframe>`;
  modal.classList.remove("hidden");
}

function closePhotoModal() {
  const modal = document.getElementById("photoModal");
  const body = document.getElementById("photoModalBody");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  body.innerHTML = "";
}

function imageUrl(value) {
  const raw = String(value || "");
  const id = driveIdFrom(raw);
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function drivePreviewUrl(value) {
  const id = driveIdFrom(value);
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : "";
}

function driveIdFrom(value) {
  const raw = String(value || "");
  const byId = raw.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  const byFile = raw.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (/^https?:\/\//i.test(raw)) return byId?.[1] || byFile?.[1] || "";
  const loose = raw.match(/\b([A-Za-z0-9_-]{25,})\b/);
  return byId?.[1] || byFile?.[1] || loose?.[1] || "";
}

function safeOpenUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("?")) return absoluteApiUrl(raw);
  return "";
}

function absoluteApiUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("?")) return "";
  return `${API_URL}${raw}`;
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
