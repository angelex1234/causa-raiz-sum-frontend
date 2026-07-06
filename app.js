const API_URL = "https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec";

const state = {
  dashboard: null,
  rechazos: [],
  rechazosMeta: null,
  rechazoEstado: "PENDIENTE",
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

const finalSubcauses = {
  NUEVO_DANO: ["RAYON_RECIENTE", "ABOLLADURA_RECIENTE", "ARANONES", "PORTAZO_MOVILIZACION", "DANO_ZAPATO", "DANO_NO_IDENTIFICADO"],
  PINTURA_NO_CONFORME: ["FALLA_PINTURA", "GRUMO", "PULVERIZADO", "MAL_PULIDO", "TRABAJO_INCOMPLETO", "DANO_NO_SUBSANADO"],
  RECEPCION_NO_DETECTO: ["DANO_PREEXISTENTE_NO_MARCADO", "SECCION_PASA_CON_EVIDENCIA", "FOTO_INICIAL_INSUFICIENTE", "CHECKLIST_INCOMPLETO"],
  FALLA_ACONDICIONADO: ["TECHO_SUCIO", "TAPIZ_MANCHADO", "SUCIEDAD_INTERIOR", "RESIDUOS", "LIMPIEZA_INCOMPLETA"],
  ERROR_IMPORTADOR: ["MALA_VALIDACION_IMPORTADOR", "DEFECTO_ORIGEN_NO_REPORTADO", "UNIDAD_VALIDADA_CON_DEFECTO"],
  NO_CONCLUYENTE: ["SIN_COINCIDENCIA", "SIN_EVIDENCIA", "FOTO_NO_CLARA", "TEXTO_NO_NORMALIZABLE"],
};

const workCatalog = {
  P01: { description: "Pulido Regular", diagnosis: "Ray", type: "Solo estetica / Leve", panos: 0, severity: 1, timeText: "20min", hours: 0.3333 },
  P02A: { description: "Pulido + Pano Puntual (< 0.5 panos)", diagnosis: "Quine", type: "Dano puntual leve", panos: 0.5, severity: 2, timeText: "35min", hours: 0.5833 },
  P02B: { description: "Pulido + Pano Simple (+1 pano)", diagnosis: "Ray", type: "Pintura estandar (1 pano)", panos: 1, severity: 3, timeText: "45min", hours: 0.75 },
  P03: { description: "PDR + Pulido", diagnosis: "Abolladura", type: "Reparacion estandar", panos: 1, severity: 4, timeText: "1h 15min", hours: 1.25 },
  P02C: { description: "Pulido + Pano Doble (1-2 panos)", diagnosis: "Ray", type: "Pintura estandar (2 panos)", panos: 2, severity: 5, timeText: "1h 30min", hours: 1.5 },
  P04: { description: "Pulido + Pano Doble (1-2 panos)", diagnosis: "Ray / Aboll", type: "Combinado (PDR + Pintura)", panos: 2, severity: 6, timeText: "1.5 dias", hours: 12 },
  P05: { description: "Pulido + Pano Triple (3 panos + Planchado)", diagnosis: "Abolladura grave", type: "Reparacion mayor", panos: 3, severity: 7, timeText: "2.5 dias", hours: 20 },
  "N/A": { description: "En revision", diagnosis: "", type: "En revision", panos: 0, severity: 0, timeText: "0", hours: 0 },
  OK: { description: "Sin intervencion", diagnosis: "", type: "Sin intervencion", panos: 0, severity: 0, timeText: "0", hours: 0 },
};

const laborCost = {
  PINTOR: { salary: 2000 },
  DESABOLLADOR: { salary: 4000 },
  MIXTO: { salary: 3000 },
  NO_APLICA: { salary: 0 },
};

const laborParams = {
  workDays: 26,
  hoursPerDay: 8,
  hoursMonth: 208,
  factor: 1,
};

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
  document.querySelectorAll("[data-rechazo-estado]").forEach((button) => {
    button.addEventListener("click", () => {
      state.rechazoEstado = button.dataset.rechazoEstado || "PENDIENTE";
      loadRechazos();
    });
  });

  document.getElementById("validationForm").addEventListener("submit", saveLocalValidation);
  document.getElementById("markRejectDoneBtn").addEventListener("click", markRejectState);
  document.getElementById("finalCauseSelect").addEventListener("change", () => updateFinalSubcauses());
  document.getElementById("workCodeSelect").addEventListener("change", () => updateOperationalImpact({ manualCode: true }));
  document.getElementById("laborRoleSelect").addEventListener("change", () => updateOperationalImpact({ manualRole: true }));
  document.getElementById("impactTypeSelect").addEventListener("change", () => updateOperationalImpact({ manualType: true }));
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

  if (viewName === "rechazos") loadRechazos();
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
      estado: state.rechazoEstado,
      q: document.getElementById("searchInput").value.trim(),
    });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar rechazos");
    state.rechazos = payload.items || [];
    state.rechazosMeta = payload;
    renderRechazos(state.rechazos, payload);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderRechazos(items, meta = {}) {
  const tbody = document.getElementById("rechazosTableBody");
  const rows = rechazoRowsForTable(items);
  renderRechazosStatus(meta, rows.length);
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
    const stateTag = item.Analizado_Rechazo ? `<br><span class="tag done">Hecho</span>` : "";

    return `
    <tr>
      <td><strong>${escapeHtml(item.VIN)}</strong></td>
      <td>${escapeHtml([item.Marca, item.Modelo].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(display(item.Origen_Rechazo))}</td>
      <td>${escapeHtml(item.Fuente_Nombre || item.Fuente || "-")}</td>
      <td>${escapeHtml(item.Revision || "-")}</td>
      <td class="description-cell">${escapeHtml(description)}${damageCount}${stateTag}</td>
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

function renderRechazosStatus(meta = {}, visibleRows = 0) {
  document.querySelectorAll("[data-rechazo-estado]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rechazoEstado === state.rechazoEstado);
  });
  const pendientes = Number(meta.total_pendientes || 0);
  const hechos = Number(meta.total_hechos || 0);
  const mostrando = Number(meta.total || visibleRows || 0);
  document.getElementById("rechazosCountSummary").textContent =
    `Mostrando ${mostrando} · Pendientes ${pendientes} · Hechos ${hechos}`;
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
    "Estado analisis": item.Estado_Rechazo || "PENDIENTE",
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
  configureValidationForm(data, flow);
  hydrateLocalValidation(item.ID_Item);
  configureValidationForm(data, flow);
  updateManualDamageState();
  renderRejectStateButton(item);
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

function configureValidationForm(data, flow) {
  const item = data.item_seleccionado || {};
  const form = document.getElementById("validationForm");
  const hasLocalValidation = form.dataset.hasLocalValidation === "1";
  const causeSelect = document.getElementById("finalCauseSelect");
  const currentCause = hasLocalValidation
    ? (causeSelect.value || item.Causa_Sugerida || "NUEVO_DANO")
    : (item.Causa_Sugerida || causeSelect.value || "NUEVO_DANO");
  causeSelect.value = finalSubcauses[currentCause] ? currentCause : "NUEVO_DANO";
  updateFinalSubcauses();

  const panel = document.getElementById("operationalImpactPanel");
  const note = document.getElementById("operationalImpactNote");
  const isControlQuality = Boolean(flow && flow.isControlQuality);
  panel.classList.toggle("hidden", !isControlQuality);
  note.classList.toggle("hidden", isControlQuality);
  panel.querySelectorAll("input, select").forEach((field) => {
    field.disabled = !isControlQuality;
  });

  const codeSelect = document.getElementById("workCodeSelect");
  if (!codeSelect.options.length) {
    codeSelect.innerHTML = Object.entries(workCatalog).map(([code, info]) => `
      <option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(info.description)}</option>
    `).join("");
  }

  [codeSelect, document.getElementById("laborRoleSelect"), document.getElementById("impactTypeSelect")].forEach((field) => {
    field.required = isControlQuality;
  });

  if (!isControlQuality) {
    clearOperationalImpact();
    return;
  }

  const suggestedCode = item.Codigo_Trabajo_Sugerido || suggestWorkCode(item);
  document.getElementById("suggestedWorkCodeInput").value = suggestedCode;
  document.getElementById("suggestedWorkCodeTag").textContent = `Sugerido: ${suggestedCode || "N/A"}`;
  if (!hasLocalValidation) codeSelect.value = suggestedCode || "N/A";
  if (!workCatalog[codeSelect.value]) codeSelect.value = suggestedCode || "N/A";
  updateOperationalImpact({ manualRole: hasLocalValidation, manualType: hasLocalValidation });
}

function updateFinalSubcauses() {
  const causeSelect = document.getElementById("finalCauseSelect");
  const subcauseSelect = document.getElementById("finalSubcauseSelect");
  const current = subcauseSelect.value;
  const subcauses = finalSubcauses[causeSelect.value] || finalSubcauses.NUEVO_DANO;
  subcauseSelect.innerHTML = subcauses.map((subcause) => `
    <option value="${escapeHtml(subcause)}">${escapeHtml(subcause)}</option>
  `).join("");
  if (subcauses.includes(current)) {
    subcauseSelect.value = current;
  }
}

function updateOperationalImpact(options = {}) {
  const item = state.detail && state.detail.item_seleccionado;
  const codeSelect = document.getElementById("workCodeSelect");
  const roleSelect = document.getElementById("laborRoleSelect");
  const typeSelect = document.getElementById("impactTypeSelect");
  const code = workCatalog[codeSelect.value] ? codeSelect.value : (suggestWorkCode(item) || "N/A");
  const catalog = workCatalog[code] || workCatalog["N/A"];

  if (!options.manualRole) {
    roleSelect.value = suggestedRoleForCode(code);
  }
  if (!options.manualType) {
    typeSelect.value = suggestedInterventionForCode(code);
  }

  const role = laborCost[roleSelect.value] ? roleSelect.value : "NO_APLICA";
  const salary = laborCost[role].salary;
  const costHour = laborParams.hoursMonth ? salary / laborParams.hoursMonth * laborParams.factor : 0;
  const costTotal = catalog.hours * costHour;
  const impact = {
    Descripcion_Trabajo: catalog.description,
    Diagnostico_Trabajo: catalog.diagnosis,
    Panos_Estimados: catalog.panos,
    Gravedad: catalog.severity,
    Tiempo_Estimado_Texto: catalog.timeText,
    Tiempo_Estimado_Horas: round(catalog.hours, 4),
    Sueldo_Mensual_Usado: round(salary, 2),
    Horas_Mes_Usadas: laborParams.hoursMonth,
    Factor_Costo_Usado: laborParams.factor,
    Costo_Hora_Usado: round(costHour, 2),
    Costo_Mano_Obra_Estimado: round(costTotal, 2),
  };

  Object.entries(impact).forEach(([name, value]) => {
    const field = document.querySelector(`#validationForm [name="${name}"]`);
    if (field) field.value = value;
  });

  document.getElementById("impactSummary").innerHTML = `
    <div class="impact-card"><span>Codigo</span><strong>${escapeHtml(code)}</strong></div>
    <div class="impact-card"><span>Trabajo</span><strong>${escapeHtml(catalog.description)}</strong></div>
    <div class="impact-card"><span>Diagnostico</span><strong>${escapeHtml(catalog.diagnosis || "-")}</strong></div>
    <div class="impact-card"><span>Panos</span><strong>${escapeHtml(catalog.panos)}</strong></div>
    <div class="impact-card"><span>Gravedad</span><strong>${escapeHtml(catalog.severity)}</strong></div>
    <div class="impact-card"><span>Tiempo</span><strong>${escapeHtml(catalog.timeText)}</strong></div>
    <div class="impact-card"><span>Rol</span><strong>${escapeHtml(role)}</strong></div>
    <div class="impact-card"><span>Costo hora</span><strong>${money(costHour)}</strong></div>
    <div class="impact-card"><span>Costo estimado</span><strong>${money(costTotal)}</strong></div>
  `;
}

function clearOperationalImpact() {
  const form = document.getElementById("validationForm");
  [
    "Codigo_Trabajo_Sugerido",
    "Codigo_Trabajo_Validado",
    "Descripcion_Trabajo",
    "Diagnostico_Trabajo",
    "Panos_Estimados",
    "Gravedad",
    "Tiempo_Estimado_Texto",
    "Tiempo_Estimado_Horas",
    "Rol_Mano_Obra",
    "Sueldo_Mensual_Usado",
    "Horas_Mes_Usadas",
    "Factor_Costo_Usado",
    "Costo_Hora_Usado",
    "Costo_Mano_Obra_Estimado",
  ].forEach((name) => {
    if (form.elements[name]) form.elements[name].value = "";
  });
  document.getElementById("impactSummary").innerHTML = "";
}

function suggestWorkCode(item) {
  if (!item) return "N/A";
  const text = plainText([
    item.Tipo_Dano_Normalizado,
    item.Texto_Normalizado,
    item.Descripcion_Original,
  ].join(" "));
  const panos = estimatedPanos(text);
  const hasRayon = /\bRAYON\b/.test(text);
  const hasAbolladura = /\b(ABOLLADURA|GOLPE)\b/.test(text);

  if (/\b(SUCIEDAD ACONDICIONADO|SUCIO|SUCIEDAD|LIMPIEZA|RESIDUO|TAPIZ|MANCHA)\b/.test(text)) return "N/A";
  if (/\b(GRAVE|PLANCHADO|FUERTE)\b/.test(text)) return "P05";
  if (hasAbolladura && hasRayon) return "P04";
  if (/\bQUINE\b/.test(text)) return "P02A";
  if (hasAbolladura) return "P03";
  if (hasRayon) {
    if (panos >= 2) return "P02C";
    if (panos === 1) return "P02B";
    return "P01";
  }
  return "N/A";
}

function estimatedPanos(text) {
  const match = plainText(text).match(/\b([0-9]+(?:[.,][0-9]+)?)\s*PANO(S)?\b/);
  return match ? Number(String(match[1]).replace(",", ".")) || 0 : 0;
}

function suggestedRoleForCode(code) {
  if (["P01", "P02A", "P02B", "P02C"].includes(code)) return "PINTOR";
  if (code === "P03") return "DESABOLLADOR";
  if (code === "P04" || code === "P05") return "MIXTO";
  return "NO_APLICA";
}

function suggestedInterventionForCode(code) {
  if (["P01", "P02A", "P02B", "P02C"].includes(code)) return "PINTURA";
  if (code === "P03") return "DESABOLLADO";
  if (code === "P04" || code === "P05") return "PINTURA_DESABOLLADO";
  if (code === "OK") return "SIN_INTERVENCION";
  return "EN_REVISION";
}

function renderRejectStateButton(item) {
  const button = document.getElementById("markRejectDoneBtn");
  if (!button) return;
  const done = Boolean(item && item.Analizado_Rechazo);
  button.textContent = done ? "Reabrir rechazo" : "Marcar rechazo analizado";
  button.classList.toggle("danger-lite", done);
  button.disabled = false;
}

async function saveLocalValidation(event) {
  event.preventDefault();
  const item = state.detail && state.detail.item_seleccionado;
  if (!item) return;

  const flow = detailFlow(state.detail || {});
  if (flow.isControlQuality) updateOperationalImpact();
  if (!event.currentTarget.checkValidity()) {
    event.currentTarget.reportValidity();
    return;
  }

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

async function markRejectState() {
  const item = state.detail && state.detail.item_seleccionado;
  if (!item) return;

  const button = document.getElementById("markRejectDoneBtn");
  const status = document.getElementById("validationSaveStatus");
  const form = document.getElementById("validationForm");
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const nextState = item.Analizado_Rechazo ? "PENDIENTE" : "HECHO";
  const scope = isDealerItem(item) ? "EVENTO" : "ITEM";
  const manualDamage = document.getElementById("manualDamageInput").value.trim();

  payload.ID_Item = item.ID_Item;
  payload.ID_Evento = item.ID_Evento;
  payload.VIN = item.VIN;
  payload.Origen_Rechazo = item.Origen_Rechazo;
  payload.Fuente = item.Fuente;
  payload.Revision = item.Revision;
  payload.Descripcion_Item = item.Descripcion_Original;
  payload.Dano_Validado = manualDamage || selectedDamageText();
  payload.Dano_Manual = manualDamage;
  payload.Causa_Sugerida = item.Causa_Sugerida;
  payload.Subcausa_Sugerida = item.Subcausa_Sugerida;
  payload.Confianza_Sugerida = item.Confianza_Sugerida;
  payload.Responsable_Item = item.Responsable || "";
  payload.Fecha_Item = item.Fecha_Item || "";
  payload.Estado_Rechazo = nextState;
  payload.Alcance_Analisis = scope;

  try {
    button.disabled = true;
    status.textContent = nextState === "HECHO" ? "Marcando rechazo como analizado..." : "Reabriendo rechazo...";
    const response = await jsonpRequest("marcar_rechazo_estado", payload);
    if (!response.ok) throw new Error(response.error || "No se pudo actualizar el estado");

    state.detailCache = {};
    state.rechazos = [];
    status.textContent = response.mensaje || "Estado actualizado.";
    toast(response.mensaje || "Estado actualizado.");
    await loadDetalle(item.ID_Item, item.VIN, item.ID_Evento);
  } catch (error) {
    status.textContent = "No se pudo actualizar el estado del rechazo.";
    toast(error.message);
    renderRejectStateButton(item);
  }
}

function hydrateLocalValidation(idItem) {
  const raw = localStorage.getItem(`cr_validation_${idItem}`);
  const form = document.getElementById("validationForm");
  const manual = document.getElementById("manualDamageInput");
  const status = document.getElementById("validationSaveStatus");
  form.reset();
  form.dataset.hasLocalValidation = raw ? "1" : "";
  manual.value = "";
  status.textContent = "Se guarda en la hoja dedicada de validaciones.";
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (saved.causa_final_validada && form.elements.causa_final_validada) {
      form.elements.causa_final_validada.value = saved.causa_final_validada;
      updateFinalSubcauses();
    }
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

function plainText(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function money(value) {
  return `S/ ${round(value, 2).toFixed(2)}`;
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
