const API_URL = "https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec";

const state = {
  dashboard: null,
  rechazos: [],
  rechazosMeta: null,
  rechazoEstado: "PENDIENTE",
  detail: null,
  detailCache: {},
  costos: null,
  costComparison: null,
  reprocessAutoEstimate: null,
  audit: null,
  validado3d: null,
  vehicleScene: null,
  charts: {},
};

const labels = {
  NUEVO_DANO: "Nuevo dano",
  PINTURA_NO_CONFORME: "Pintura no conforme",
  FALLA_ACONDICIONADO: "Falla de acondicionado",
  ERROR_IMPORTADOR: "Rechazo no procedente / criterio importador",
  NO_CONCLUYENTE: "No concluyente",

  RAYON_RECIENTE: "Rayon reciente",
  ABOLLADURA_RECIENTE: "Abolladura reciente",
  DANO_NO_IDENTIFICADO: "Dano no identificado",
  DANO_NO_SUBSANADO: "Dano no subsanado",
  FALLA_ACABADO: "Falla de acabado",
  TRABAJO_INCOMPLETO: "Trabajo incompleto",
  LIMPIEZA_INCOMPLETA: "Limpieza incompleta",
  INTERIOR_SUCIO: "Interior sucio",
  TAPIZ_TECHO_OBSERVADO: "Tapiz / techo observado",
  CRITERIO_NO_ALINEADO: "Criterio no alineado",
  RECHAZO_SIN_EVIDENCIA: "Rechazo sin evidencia",
  OBSERVACION_AMBIGUA: "Observacion ambigua",
  SIN_EVIDENCIA: "Sin evidencia",
  FOTO_NO_CLARA: "Foto no clara",
  SIN_COINCIDENCIA: "Sin coincidencia",

  CONTROL_CALIDAD: "Control Calidad",
  IMPORTADOR_VARI_REVO: "VARI / REVO",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

const definitions = {
  causas: {
    NUEVO_DANO: "Dano que no estaba contemplado en la revision inicial y aparece despues durante el flujo operativo.",
    PINTURA_NO_CONFORME: "Zona que debia trabajarse o ya fue reprocesada, pero el resultado no quedo conforme.",
    FALLA_ACONDICIONADO: "Observacion relacionada con limpieza, interior, tapiz, techo, residuos o acondicionado.",
    ERROR_IMPORTADOR: "Rechazo no procedente o con criterio no alineado, especialmente cuando eSUM indicaba PASA o no existe evidencia clara.",
    NO_CONCLUYENTE: "No hay evidencia suficiente para determinar una causa raiz confiable.",
  },
  subcausas: {
    RAYON_RECIENTE: "Rayon detectado despues de la revision inicial.",
    ABOLLADURA_RECIENTE: "Abolladura o golpe detectado despues de la revision inicial.",
    DANO_NO_IDENTIFICADO: "Dano fisico que no puede clasificarse con mayor precision.",
    DANO_NO_SUBSANADO: "Dano que debia corregirse pero sigue presente.",
    FALLA_ACABADO: "Defecto de acabado como grumo, pulverizado, mal pulido, tono o pintura no conforme.",
    TRABAJO_INCOMPLETO: "Intervencion realizada parcialmente o no finalizada correctamente.",
    LIMPIEZA_INCOMPLETA: "Limpieza o acondicionado terminado de forma incompleta.",
    INTERIOR_SUCIO: "Suciedad o residuos en zonas interiores.",
    TAPIZ_TECHO_OBSERVADO: "Observacion en tapiz, techo o cielo raso.",
    CRITERIO_NO_ALINEADO: "El criterio del dealer/importador no coincide con el criterio interno o evidencia disponible.",
    RECHAZO_SIN_EVIDENCIA: "El rechazo no tiene evidencia visual suficiente.",
    OBSERVACION_AMBIGUA: "La observacion es vaga o poco precisa.",
    SIN_EVIDENCIA: "No hay fotos o registros suficientes.",
    FOTO_NO_CLARA: "La foto existe, pero no permite confirmar el dano.",
    SIN_COINCIDENCIA: "No se encontro relacion clara con eSUM, Control Calidad o historial.",
  },
};

const AUTHUSER_CACHE_KEY = "cr_working_authuser";
const AUTHUSER_MAX_TRIES = 5;
const READ_CACHE_TTL_MS = 45000;
const readRequestCache = new Map();

const palette = ["#1f7ae0", "#22c55e", "#f4c430", "#ef4444", "#38bdf8", "#0b1f3a", "#8b5cf6", "#f97316"];
let chartJsPromise = null;

const finalSubcauses = {
  NUEVO_DANO: ["RAYON_RECIENTE", "ABOLLADURA_RECIENTE", "DANO_NO_IDENTIFICADO"],
  PINTURA_NO_CONFORME: ["DANO_NO_SUBSANADO", "FALLA_ACABADO", "TRABAJO_INCOMPLETO"],
  FALLA_ACONDICIONADO: ["LIMPIEZA_INCOMPLETA", "INTERIOR_SUCIO", "TAPIZ_TECHO_OBSERVADO"],
  ERROR_IMPORTADOR: ["CRITERIO_NO_ALINEADO", "RECHAZO_SIN_EVIDENCIA", "OBSERVACION_AMBIGUA"],
  NO_CONCLUYENTE: ["SIN_EVIDENCIA", "FOTO_NO_CLARA", "SIN_COINCIDENCIA"],
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
  PINTOR: { costHour: 42 },
  DESABOLLADOR: { costHour: 45 },
  MIXTO: { costHour: 43.5 },
  NO_APLICA: { costHour: 0 },
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

async function jsonpRequest(action, params = {}) {
  const cacheable = isReadAction(action);
  const cacheKey = cacheable ? requestCacheKey(action, params) : "";

  if (cacheable) {
    const cached = readRequestCache.get(cacheKey);
    if (cached && Date.now() - cached.time < READ_CACHE_TTL_MS) {
      return structuredCloneSafe(cached.payload);
    }
  }

  const attempts = authuserAttempts();
  let lastError = null;

  for (const authuser of attempts) {
    try {
      const payload = await jsonpRequestOnce(action, params, authuser);
      rememberWorkingAuthuser(authuser);
      if (cacheable && payload && payload.ok) {
        readRequestCache.set(cacheKey, { time: Date.now(), payload });
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (authuser !== null) {
        localStorage.removeItem(AUTHUSER_CACHE_KEY);
      }
    }
  }

  throw lastError || new Error(`No se pudo consultar ${action}`);
}

function isReadAction(action) {
  return [
    "status",
    "dashboard",
    "dashboard_costos",
    "comparativa_costos",
    "dashboard_validado_3d",
    "rechazos",
    "detalle",
    "auditoria_causa_raiz",
    "auditoria_causa_raiz_export",
  ].includes(String(action || ""));
}

function requestCacheKey(action, params = {}) {
  const clean = new URLSearchParams({ action });
  Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      clean.set(key, value);
    }
  });
  return clean.toString();
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}

function clearReadCache() {
  readRequestCache.clear();
}

function jsonpRequestOnce(action, params = {}, authuser = null) {
  return new Promise((resolve, reject) => {
    const callback = `cr_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const query = new URLSearchParams({ action, callback });

    if (authuser !== null && authuser !== undefined && authuser !== "") {
      query.set("authuser", authuser);
    }

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

function authuserAttempts() {
  const cached = localStorage.getItem(AUTHUSER_CACHE_KEY);
  const attempts = [];

  if (cached !== null && cached !== "") attempts.push(cached);

  // Primero URL normal; si falla, prueba authuser=0..5.
  attempts.push(null);
  for (let i = 0; i <= AUTHUSER_MAX_TRIES; i += 1) attempts.push(String(i));

  return attempts.filter((value, index) => attempts.indexOf(value) === index);
}

function rememberWorkingAuthuser(authuser) {
  if (authuser === null || authuser === undefined || authuser === "") return;
  localStorage.setItem(AUTHUSER_CACHE_KEY, String(authuser));
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function bindControls() {
  document.getElementById("refreshBtn").addEventListener("click", () => {
    const activeView = getActiveView();
    loadDashboard();
    if (activeView === "rechazos") {
      loadRechazos();
    }
    if (activeView === "costos") {
      loadCostDashboard();
    }
    if (activeView === "kpis") {
      loadAuditDashboard();
    }
    if (activeView === "validado3d") {
      loadValidated3dDashboard();
    }
  });

  document.getElementById("applyFiltersBtn").addEventListener("click", loadRechazos);
  const causeRootModeBtn = document.getElementById("causeRootModeBtn");
  const costReviewModeBtn = document.getElementById("costReviewModeBtn");
  const loadAutoReprocessEstimateBtn = document.getElementById("loadAutoReprocessEstimateBtn");
  if (causeRootModeBtn) causeRootModeBtn.addEventListener("click", () => setRechazosMode("causa"));
  if (costReviewModeBtn) costReviewModeBtn.addEventListener("click", () => setRechazosMode("costos"));
  if (loadAutoReprocessEstimateBtn) loadAutoReprocessEstimateBtn.addEventListener("click", loadAutoReprocessEstimate);
  const loadAuditBtn = document.getElementById("loadAuditBtn");
  const downloadAuditBtn = document.getElementById("downloadAuditBtn");
  if (loadAuditBtn) loadAuditBtn.addEventListener("click", loadAuditDashboard);
  if (downloadAuditBtn) downloadAuditBtn.addEventListener("click", downloadAuditExcel);
  document.getElementById("applyCostFiltersBtn").addEventListener("click", loadCostDashboard);
  document.getElementById("applyValidated3dFiltersBtn").addEventListener("click", loadValidated3dDashboard);
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

  const calculateReprocessCostSelect = document.getElementById("calculateReprocessCostSelect");
  const reprocessCodeSelect = document.getElementById("reprocessCodeSelect");
  const reprocessRoleSelect = document.getElementById("reprocessRoleSelect");
  if (calculateReprocessCostSelect) {
    calculateReprocessCostSelect.addEventListener("change", () => updateReprocessCost());
  }
  if (reprocessCodeSelect) {
    reprocessCodeSelect.addEventListener("change", () => updateReprocessCost({ manualRole: false }));
  }
  if (reprocessRoleSelect) {
    reprocessRoleSelect.addEventListener("change", () => updateReprocessCost({ manualRole: true }));
  }

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
    costos: ["Analisis de costos", "Comparativa entre flujo inicial eSUM y reprocesos validados manualmente."],
    validado3d: ["Mapa 3D validado", "Causas validadas manualmente ubicadas por zona."],
  };
  document.getElementById("pageTitle").textContent = titles[viewName][0];
  document.getElementById("pageSubtitle").textContent = titles[viewName][1];

  if (viewName === "rechazos") loadRechazos();
  if (viewName === "kpis") {
    if (state.dashboard) renderKpiTables(state.dashboard);
    loadAuditDashboard();
  }
  if (viewName === "costos") loadCostDashboard();
  if (viewName === "validado3d") loadValidated3dDashboard();
}

function getActiveView() {
  const active = document.querySelector(".nav-item.active");
  return active ? active.dataset.view : "dashboard";
}

async function loadStatus() {
  try {
    const payload = await jsonpRequest("status");
    if (!payload.ok) throw new Error(payload.error || "Estado no disponible");
    hydrateStatusMetadata(payload);
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
    setBusy(true, "Cargando dashboard", "Calculando KPIs sugeridos...");
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

async function loadCostDashboard() {
  try {
    setBusy(true, "Cargando costos", "Leyendo eSUM y comparativa...");
    const commonFilters = {
      dias: document.getElementById("daysSelect").value,
      marca: document.getElementById("costBrandFilter").value.trim(),
      modelo: document.getElementById("costModelFilter").value.trim(),
    };

    const [costPayload, comparisonPayload] = await Promise.all([
      jsonpRequest("dashboard_costos", {
        ...commonFilters,
        codigo: document.getElementById("costCodeFilter").value,
        rol: document.getElementById("costRoleFilter").value,
        tipoTrabajo: document.getElementById("costTypeFilter").value,
      }),
      jsonpRequest("comparativa_costos", commonFilters),
    ]);

    if (!costPayload.ok) throw new Error(costPayload.error || "No se pudo cargar analisis de costos");
    if (!comparisonPayload.ok) throw new Error(comparisonPayload.error || "No se pudo cargar comparativa de costos");

    state.costos = costPayload;
    state.costComparison = comparisonPayload;
    renderCostDashboard(costPayload);
    renderCostComparison(comparisonPayload);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderCostDashboard(data) {
  setText("costKpiRegistros", data.total_registros);
  setText("costKpiVins", data.total_vins);
  setText("costKpiCosto", money(data.total_costo_estimado));
  setText("costKpiHoras", round(data.total_horas_estimadas, 2));
  setText("costKpiPanos", round(data.total_panos_estimados, 2));
  setText("costKpiCodigo", data.codigo_mas_costoso || "-");

  renderDoughnut("costCodeChart", data.por_codigo || [], "codigo", { legendPosition: "right", cutout: "58%" });
  renderBarChart("costRoleChart", data.por_rol || [], "rol", "horas_estimadas", { label: "Horas", horizontal: true });
  renderBarChart("costDayChart", data.por_dia || [], "fecha", "costo_estimado", { label: "Costo S/" });
  renderMetricTable("costVinCostTable", data.top_vins_costo || [], [
    ["VIN", "vin"],
    ["Costo", "costo_estimado", money],
    ["Horas", "horas_estimadas"],
    ["Trabajos", "cantidad"],
  ]);
  renderCostDetail(data.detalle_tabla || []);
}

function renderCostComparison(data) {
  if (!data) return;

  setText("comparisonKpiInitialCost", money(data.costo_inicial_esum));
  setText("comparisonKpiReprocessCost", money(data.costo_reprocesos));
  setText("comparisonKpiRealCost", money(data.costo_operativo_real));
  setText("comparisonKpiOvercostPct", `${round(data.porcentaje_sobrecosto, 2)}%`);
  setText("comparisonKpiReprocessHours", round(data.horas_reprocesos, 2));
  setText("comparisonKpiReprocessVins", data.total_vins_con_reproceso_validado || 0);

  const tag = document.getElementById("costComparisonTag");
  if (tag) {
    tag.textContent = Number(data.costo_reprocesos || 0) > 0
      ? `Sobrecosto: ${money(data.costo_reprocesos)}`
      : "Sin reprocesos validados";
  }

  const conclusions = document.getElementById("comparisonConclusions");
  if (conclusions) {
    const rows = data.conclusiones || [];
    conclusions.innerHTML = rows.length
      ? rows.map((text) => `<div class="history-card">${escapeHtml(text)}</div>`).join("")
      : `<div class="history-card">Aun no hay conclusiones de costos.</div>`;
  }

  renderMetricTable("comparisonTopOvercostTable", data.top_vins_sobrecosto || [], [
    ["VIN", "VIN"],
    ["Modelo", "Modelo", (value) => value || "-"],
    ["Sobrecosto", "sobrecosto", money],
    ["Horas", "horas_reproceso", (value) => round(value, 2)],
    ["Reprocesos", "cantidad_reprocesos_validados"],
  ]);

  const topTarget = document.getElementById("comparisonTopOvercostTable");
  if (topTarget && !(data.top_vins_sobrecosto || []).length) {
    topTarget.innerHTML = `<p>Sin reprocesos validados manualmente.</p>`;
  }
}


async function loadAutoReprocessEstimate() {
  try {
    setBusy(true, "Estimando reprocesos", "Leyendo todos los rechazos y aplicando reglas por texto...");
    setText("autoEstimateKpiItems", "...");
    setText("autoEstimateKpiCost", "...");
    setText("autoEstimateKpiHours", "...");
    setText("autoEstimateKpiCoded", "...");
    setText("autoEstimateKpiUncertain", "...");
    setText("autoEstimateKpiVins", "...");

    const payload = await jsonpRequest("rechazos", {
      dias: document.getElementById("daysSelect").value,
      origen: "TODOS",
      fuente: "TODOS",
      causa: "",
      confianza: "",
      estado: "TODOS",
      q: "",
    });

    if (!payload.ok) throw new Error(payload.error || "No se pudo leer rechazos para estimar costos");
    const estimate = buildAutoReprocessEstimate(payload.items || []);
    state.reprocessAutoEstimate = estimate;
    renderAutoReprocessEstimate(estimate);
    toast("Estimacion automatica lista. Revisa los N/A antes de usarlo como dato oficial.");
  } catch (error) {
    toast(error.message);
    const target = document.getElementById("autoEstimateTopTable");
    if (target) target.innerHTML = `<p>No se pudo calcular la estimacion.</p>`;
  } finally {
    setBusy(false);
  }
}

function buildAutoReprocessEstimate(items) {
  const rows = [];
  const byVin = new Map();
  let coded = 0;
  let uncertain = 0;
  let totalCost = 0;
  let totalHours = 0;

  (items || []).forEach((item) => {
    const code = suggestWorkCode(item);
    const catalog = workCatalog[code] || workCatalog["N/A"];
    const role = suggestedRoleForCode(code);
    const costHour = (laborCost[role] || laborCost.NO_APLICA).costHour * laborParams.factor;
    const hours = Number(catalog.hours || 0);
    const cost = round(hours * costHour, 2);
    const isCoded = code && code !== "N/A" && code !== "OK" && cost > 0;

    if (isCoded) coded += 1;
    else uncertain += 1;

    totalCost += cost;
    totalHours += hours;

    const vin = item.VIN || "SIN_VIN";
    if (!byVin.has(vin)) {
      byVin.set(vin, {
        VIN: vin,
        Modelo: item.Modelo || item.Marca || "-",
        costo_estimado: 0,
        horas_estimadas: 0,
        cantidad: 0,
        codificados: 0,
        inciertos: 0,
      });
    }
    const row = byVin.get(vin);
    row.costo_estimado += cost;
    row.horas_estimadas += hours;
    row.cantidad += 1;
    if (isCoded) row.codificados += 1;
    else row.inciertos += 1;

    rows.push({
      ...item,
      Codigo_Estimado: code,
      Rol_Estimado: role,
      Horas_Estimadas: hours,
      Costo_Estimado: cost,
      Es_Codificado: isCoded,
    });
  });

  const topVins = Array.from(byVin.values())
    .map((row) => ({
      ...row,
      costo_estimado: round(row.costo_estimado, 2),
      horas_estimadas: round(row.horas_estimadas, 2),
    }))
    .filter((row) => row.costo_estimado > 0)
    .sort((a, b) => b.costo_estimado - a.costo_estimado)
    .slice(0, 15);

  return {
    total_items: rows.length,
    total_costo: round(totalCost, 2),
    total_horas: round(totalHours, 2),
    codificados: coded,
    inciertos: uncertain,
    vins_con_costo: topVins.length,
    top_vins: topVins,
    rows,
  };
}

function renderAutoReprocessEstimate(data) {
  setText("autoEstimateKpiItems", data.total_items);
  setText("autoEstimateKpiCost", money(data.total_costo));
  setText("autoEstimateKpiHours", round(data.total_horas, 2));
  setText("autoEstimateKpiCoded", data.codificados);
  setText("autoEstimateKpiUncertain", data.inciertos);
  setText("autoEstimateKpiVins", data.vins_con_costo);

  renderMetricTable("autoEstimateTopTable", data.top_vins || [], [
    ["VIN", "VIN"],
    ["Modelo", "Modelo", (value) => value || "-"],
    ["Costo", "costo_estimado", money],
    ["Horas", "horas_estimadas", (value) => round(value, 2)],
    ["Items", "cantidad"],
    ["N/A", "inciertos"],
  ]);

  const notes = document.getElementById("autoEstimateNotes");
  if (notes) {
    notes.innerHTML = [
      `Se estimaron ${data.codificados} items con codigo automatico y ${data.inciertos} quedaron como N/A o no seguros.`,
      `El costo estimado total no es oficial: sirve para priorizar validaciones y ver magnitud aproximada.`,
      `Para costo oficial se usa la validacion manual: Calcular_Costo_Reproceso = SI y Codigo_Reproceso_Validado lleno.`,
    ].map((text) => `<div class="history-card">${escapeHtml(text)}</div>`).join("");
  }
}


async function loadValidated3dDashboard() {
  try {
    setBusy(true, "Cargando mapa 3D", "Leyendo validaciones manuales...");
    const payload = await jsonpRequest("dashboard_validado_3d", {
      dias: document.getElementById("daysSelect").value,
      causa: document.getElementById("validCauseFilter").value,
      subcausa: document.getElementById("validSubcauseFilter").value.trim(),
      zona: document.getElementById("validZoneFilter").value.trim(),
      marca: document.getElementById("validBrandFilter").value.trim(),
      modelo: document.getElementById("validModelFilter").value.trim(),
    });
    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar dashboard validado 3D");
    state.validado3d = payload;
    renderValidated3dDashboard(payload);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderValidated3dDashboard(data) {
  setText("validKpiTotal", data.total_validaciones);
  setText("validKpiVins", data.total_vins);
  setText("validKpiCausa", display(data.causa_principal));
  setText("validKpiSubcausa", display(data.subcausa_principal));
  setText("validKpiZona", zoneName(data.zona_mas_afectada, data.zonas_3d));
  setText("validKpiModelo", data.modelo_visualizado || "JETOUR X70");
  setText("vehicleModelTag", data.modelo_visualizado || "JETOUR X70");

  renderDoughnut("validCauseChart", data.por_causa_validada || [], "causa", { legendPosition: "right", cutout: "58%" });
  renderDoughnut("validSubcauseChart", data.por_subcausa_validada || [], "subcausa", { legendPosition: "right", cutout: "58%" });
  renderMetricTable("validZoneTable", data.top_zonas || [], [
    ["Zona", "nombre"],
    ["Cantidad", "cantidad"],
    ["%", "porcentaje", (value) => `${round(value, 2)}%`],
    ["Causa", "causa_principal", display],
  ]);
  renderValidatedDetail(data.ultimas_validaciones || []);
  renderVehicle3d(data.zonas_3d || []);
}

function setRechazosMode(mode) {
  const cause = document.getElementById("causeFilter");
  const confidence = document.getElementById("confidenceFilter");
  const origin = document.getElementById("originFilter");
  const source = document.getElementById("sourceFilter");
  const search = document.getElementById("searchInput");

  if (mode === "causa") {
    if (cause) cause.value = "NO_CONCLUYENTE";
    if (confidence) confidence.value = "";
    if (origin) origin.value = "TODOS";
    if (source) source.value = "TODOS";
    if (search) search.value = "";
    state.rechazoEstado = "PENDIENTE";
    toast("Modo causa raiz: se priorizan los NO_CONCLUYENTES pendientes.");
  } else {
    if (cause) cause.value = "";
    if (confidence) confidence.value = "";
    if (origin) origin.value = "TODOS";
    if (source) source.value = "TODOS";
    if (search) search.value = "";
    state.rechazoEstado = "PENDIENTE";
    toast("Modo costos: se muestran todas las causas pendientes para validar reprocesos.");
  }

  loadRechazos();
}

function showRechazosLoading() {
  const tbody = document.getElementById("rechazosTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="10">Cargando rechazos con los filtros seleccionados...</td></tr>`;
  const summary = document.getElementById("rechazosCountSummary");
  if (summary) summary.textContent = "Cargando...";
}

async function loadRechazos() {
  try {
    setBusy(true, "Cargando rechazos", "Aplicando filtros seleccionados...");
    showRechazosLoading();
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
    setBusy(true, "Cargando detalle", "Buscando evidencia del VIN...");
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
  updateFinalSubcauses();
  updateReprocessCost({ manualRole: true });
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

function ensureChartJs() {
  if (window.Chart) return Promise.resolve(true);
  if (chartJsPromise) return chartJsPromise;

  chartJsPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(ready && window.Chart));
    };
    script.src = "./vendor/chart.umd.min.js";
    script.async = true;
    script.dataset.chartLoader = "retry";
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    window.setTimeout(() => finish(Boolean(window.Chart)), 12000);
    document.head.appendChild(script);
  });

  return chartJsPromise;
}

function renderDoughnut(canvasId, rows, keyField, config = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (!window.Chart) {
    ensureChartJs().then((ready) => {
      if (ready) renderDoughnut(canvasId, rows, keyField, config);
    });
    return;
  }
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

async function loadAuditDashboard() {
  const sourceFilter = document.getElementById("auditSourceFilter");
  const subcauseFocus = document.getElementById("auditSubcauseFocus");
  if (!sourceFilter || !subcauseFocus) return;

  try {
    setBusy(true, "Cargando auditoria", "Separando listas por Control Calidad, VARI y REVO...");
    const payload = await jsonpRequest("auditoria_causa_raiz", {
      dias: document.getElementById("daysSelect").value,
      fuente: sourceFilter.value,
      subcausa_focus: subcauseFocus.value,
      limit_vins: 80,
      sample: 5,
    });

    if (!payload.ok) throw new Error(payload.error || "No se pudo cargar auditoria de causa raiz");
    state.audit = payload;
    renderAuditDashboard(payload);
  } catch (error) {
    toast(error.message);
    const tag = document.getElementById("auditStatusTag");
    if (tag) tag.textContent = "Error al cargar";
  } finally {
    setBusy(false);
  }
}

function renderAuditDashboard(data) {
  const tag = document.getElementById("auditStatusTag");
  if (tag) {
    tag.textContent = `${data.total_items || 0} items · ${display(data.subcausa_focus || "")} enfocada`;
  }
  renderAuditSourceGrid(data.fuentes || [], data.subcausa_focus);
  renderAuditCauseSamples(data.muestras_por_causa || []);
}

function renderAuditSourceGrid(fuentes, subcauseFocus) {
  const target = document.getElementById("auditSourceGrid");
  if (!target) return;
  if (!fuentes.length) {
    target.innerHTML = `<div class="empty-state">Sin datos para los filtros seleccionados.</div>`;
    return;
  }

  target.innerHTML = fuentes.map((fuente) => {
    const focus = fuente.subcausa_focus || {};
    const topSub = (fuente.por_subcausa || []).slice(0, 6);
    const focusItems = focus.items || [];
    return `
      <article class="audit-source-card">
        <div class="section-heading">
          <h4>${escapeHtml(fuente.nombre || fuente.fuente)}</h4>
          <span class="tag">${escapeHtml(fuente.total_items || 0)} items</span>
        </div>
        <div class="audit-mini-kpis">
          <div><span>No concluyentes</span><strong>${escapeHtml(fuente.total_no_concluyente || 0)}</strong></div>
          <div><span>${escapeHtml(display(subcauseFocus))}</span><strong>${escapeHtml(focus.cantidad || 0)}</strong></div>
          <div><span>VINs</span><strong>${escapeHtml((focus.vins || []).length)}</strong></div>
        </div>
        <h5>Subcausas principales</h5>
        ${auditSmallTable(topSub, "subcausa")}
        <h5>VINs con ${escapeHtml(display(subcauseFocus))}</h5>
        ${auditItemsTable(focusItems)}
      </article>
    `;
  }).join("");

  bindAuditAnalyzeButtons(target);
}

function auditSmallTable(rows, keyField) {
  if (!rows || !rows.length) return `<p class="local-note">Sin datos.</p>`;
  return `
    <table class="mini-table audit-mini-table">
      <thead><tr><th>Categoria</th><th>Cantidad</th><th>%</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(display(row.nombre || row[keyField]))}</td>
            <td>${escapeHtml(row.cantidad || 0)}</td>
            <td>${escapeHtml(round(row.porcentaje, 2))}%</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function auditItemsTable(items) {
  if (!items || !items.length) return `<p class="local-note">Sin VINs en esta subcausa.</p>`;
  return `
    <div class="audit-items-list">
      ${items.slice(0, 12).map((item) => `
        <div class="audit-item-row">
          <div>
            <strong>${escapeHtml(item.VIN || "-")}</strong>
            <small>${escapeHtml([item.Modelo, item.Revision].filter(Boolean).join(" · ") || item.Fuente || "-")}</small>
            <p>${escapeHtml(item.Descripcion_Original || "-")}</p>
          </div>
          <button class="secondary-btn" type="button" data-audit-analizar="1" data-id="${escapeHtml(item.ID_Item || "")}" data-vin="${escapeHtml(item.VIN || "")}" data-evento="${escapeHtml(item.ID_Evento || "")}">Ver</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAuditCauseSamples(samples) {
  const target = document.getElementById("auditCauseSamples");
  if (!target) return;
  if (!samples.length) {
    target.innerHTML = `<div class="empty-state">Sin muestras para revisar.</div>`;
    return;
  }

  target.innerHTML = samples.map((group) => `
    <article class="audit-sample-card">
      <div class="section-heading">
        <h4>${escapeHtml(display(group.causa))}</h4>
        <span class="tag">${escapeHtml(group.total || 0)} casos</span>
      </div>
      <p class="local-note">${escapeHtml(group.definicion || "")}</p>
      ${auditItemsTable(group.muestras || [])}
    </article>
  `).join("");

  bindAuditAnalyzeButtons(target);
}

function bindAuditAnalyzeButtons(root) {
  root.querySelectorAll("[data-audit-analizar]").forEach((button) => {
    button.addEventListener("click", () => loadDetalle(button.dataset.id, button.dataset.vin, button.dataset.evento));
  });
}


async function downloadAuditExcel() {
  const sourceFilter = document.getElementById("auditSourceFilter");
  const subcauseFocus = document.getElementById("auditSubcauseFocus");

  try {
    setBusy(true, "Preparando Excel", "Generando auditoria por fuente y decision...");
    const payload = await jsonpRequest("auditoria_causa_raiz_export", {
      dias: document.getElementById("daysSelect").value,
      fuente: sourceFilter ? sourceFilter.value : "TODOS",
      subcausa: subcauseFocus ? subcauseFocus.value : "",
      limit: 8000,
    });

    if (!payload.ok) throw new Error(payload.error || "No se pudo preparar el Excel de auditoria");

    const workbook = buildAuditWorkbookXml(payload);
    const filename = payload.filename || `auditoria_causa_raiz_${document.getElementById("daysSelect").value}d.xls`;
    downloadTextFile(filename, workbook, "application/vnd.ms-excel;charset=utf-8");
    toast(`Excel generado con ${payload.total_exportados || 0} filas.`);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

function buildAuditWorkbookXml(payload) {
  const columns = payload.columnas || [];
  const rows = payload.filas || [];
  const bySource = {
    CONTROL_CALIDAD: rows.filter((row) => row.Fuente === "CONTROL_CALIDAD"),
    VARI: rows.filter((row) => row.Fuente === "VARI"),
    REVO: rows.filter((row) => row.Fuente === "REVO"),
  };

  const sheets = [];
  sheets.push(xmlSheet("Resumen", summaryRowsForAudit(payload), [
    { key: "Campo", label: "Campo" },
    { key: "Valor", label: "Valor" },
  ]));
  sheets.push(xmlSheet("Control Calidad", bySource.CONTROL_CALIDAD, columns));
  sheets.push(xmlSheet("VARI", bySource.VARI, columns));
  sheets.push(xmlSheet("REVO", bySource.REVO, columns));
  sheets.push(xmlSheet("Muestras", payload.muestras_por_causa || [], [
    { key: "Muestra_Causa", label: "Muestra causa" },
    { key: "Muestra_Causa_Nombre", label: "Muestra causa nombre" },
    ...columns,
  ]));

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/></Style>
 </Styles>
 ${sheets.join("\n")}
</Workbook>`;
}

function summaryRowsForAudit(payload) {
  const rows = [
    { Campo: "Fecha inicio", Valor: payload.fecha_inicio || "" },
    { Campo: "Fecha fin", Valor: payload.fecha_fin || "" },
    { Campo: "Total items", Valor: payload.total_items || 0 },
    { Campo: "Total exportados", Valor: payload.total_exportados || 0 },
    { Campo: "Nota", Valor: payload.nota || "" },
  ];

  (payload.resumen_fuente || []).forEach((row) => {
    rows.push({ Campo: `${row.Nombre_Fuente} - Total items`, Valor: row.Total_Items || 0 });
    rows.push({ Campo: `${row.Nombre_Fuente} - VINs`, Valor: row.Total_VINs || 0 });
    rows.push({ Campo: `${row.Nombre_Fuente} - Nuevo dano`, Valor: row.Nuevo_Dano || 0 });
    rows.push({ Campo: `${row.Nombre_Fuente} - Pintura no conforme`, Valor: row.Pintura_No_Conforme || 0 });
    rows.push({ Campo: `${row.Nombre_Fuente} - Error importador`, Valor: row.Error_Importador || 0 });
    rows.push({ Campo: `${row.Nombre_Fuente} - No concluyente`, Valor: row.No_Concluyente || 0 });
  });

  return rows;
}

function xmlSheet(name, rows, columns) {
  const safeName = xmlEscape(String(name || "Hoja").slice(0, 31));
  const header = `<Row>${columns.map((col) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(col.label || col.key)}</Data></Cell>`).join("")}</Row>`;
  const body = (rows || []).map((row) => `
    <Row>${columns.map((col) => xmlCell(row[col.key])).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${safeName}"><Table>${header}${body}</Table></Worksheet>`;
}

function xmlCell(value) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  return `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${xmlEscape(value ?? "")}</Data></Cell>`;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function renderBarChart(canvasId, rows, keyField, valueField, config = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (!window.Chart) {
    ensureChartJs().then((ready) => {
      if (ready) renderBarChart(canvasId, rows, keyField, valueField, config);
    });
    return;
  }
  if (state.charts[canvasId]) state.charts[canvasId].destroy();

  const labelsForChart = (rows || []).map((row) => display(row.nombre || row[keyField]));
  const values = (rows || []).map((row) => Number(row[valueField] || 0));

  state.charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labelsForChart,
      datasets: [{
        label: config.label || "Valor",
        data: values,
        backgroundColor: palette,
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: config.horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#526070" }, grid: { color: "#edf2f7" } },
        y: { beginAtZero: true, ticks: { color: "#526070" }, grid: { color: "#edf2f7" } },
      },
    },
  });
}

function renderMetricTable(targetId, rows, columns) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<p>Sin datos.</p>`;
    return;
  }

  target.innerHTML = `
    <table class="mini-table metric-table">
      <thead>
        <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map(([, field, formatter]) => {
              const raw = row[field];
              const value = formatter ? formatter(raw, row) : raw;
              return `<td>${escapeHtml(value ?? "-")}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCostDetail(rows) {
  const target = document.getElementById("costDetailBody");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<tr><td colspan="9">Sin registros eSUM para los filtros seleccionados.</td></tr>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.Fecha || "-")}</td>
      <td><strong>${escapeHtml(row.VIN || "-")}</strong></td>
      <td>${escapeHtml([row.Marca, row.Modelo].filter(Boolean).join(" / ") || "-")}</td>
      <td class="description-cell">${escapeHtml(row.Diagnostico_eSUM || row.Comentario || "-")}</td>
      <td><span class="tag">${escapeHtml(row.Codigo_Trabajo || "-")}</span></td>
      <td>${escapeHtml(row.Rol_Mano_Obra || "-")}</td>
      <td>${escapeHtml(round(row.Tiempo_Estimado_Horas, 2))}</td>
      <td>${escapeHtml(money(row.Costo_Mano_Obra_Estimado))}</td>
      <td>${escapeHtml(row.Operario || "-")}</td>
    </tr>
  `).join("");
}

function renderValidatedDetail(rows) {
  const target = document.getElementById("validDetailBody");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<tr><td colspan="8">Sin validaciones manuales para los filtros seleccionados.</td></tr>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.Fecha_Validacion || "-")}</td>
      <td><strong>${escapeHtml(row.VIN || "-")}</strong></td>
      <td>${escapeHtml(row.Revision || row.Fuente || "-")}</td>
      <td class="description-cell">${escapeHtml(row.Dano_Validado || row.Descripcion_Item || "-")}</td>
      <td>${escapeHtml(display(row.Causa_Final_Validada))}</td>
      <td>${escapeHtml(display(row.Subcausa_Final_Validada))}</td>
      <td>${escapeHtml(row.Zona_3D_Nombre || row.Zona_3D || "-")}</td>
      <td>${escapeHtml(row.Analista || "-")}</td>
    </tr>
  `).join("");
}

async function renderVehicle3d(zonas) {
  const canvas = document.getElementById("vehicle3dCanvas");
  const fallback = document.getElementById("vehicle3dFallback");
  if (!canvas || !fallback) return;

  disposeVehicleScene();
  const zoneMap = new Map((zonas || []).map((zone) => [zone.zona_id, zone]));
  renderZoneDetail(null);

  try {
    const THREE = await import("./vendor/three.module.js");
    const controlsModule = await import("./vendor/OrbitControls.js");
    fallback.classList.add("hidden");
    canvas.classList.remove("hidden");
    initVehicleScene(THREE, controlsModule.OrbitControls, canvas, zoneMap);
  } catch (error) {
    canvas.classList.add("hidden");
    fallback.classList.remove("hidden");
    renderVehicleFallback(fallback, zonas || []);
  }
}

function initVehicleScene(THREE, OrbitControls, canvas, zoneMap) {
  const stage = document.getElementById("vehicle3dStage");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fbff);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(4.6, 3.2, 6.2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.45, 0);
  controls.maxDistance = 11;
  controls.minDistance = 3.5;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(4, 6, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  addVehicleBase(THREE, scene);
  const zoneMeshes = addVehicleZones(THREE, scene, zoneMap);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const onClick = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(zoneMeshes, false);
    if (hits.length) {
      renderZoneDetail(hits[0].object.userData.zone);
    }
  };
  canvas.addEventListener("click", onClick);

  const resize = () => {
    const width = Math.max(320, stage.clientWidth || 760);
    const height = Math.max(360, stage.clientHeight || 520);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  let active = true;
  const animate = () => {
    if (!active) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  state.vehicleScene = {
    dispose() {
      active = false;
      observer.disconnect();
      canvas.removeEventListener("click", onClick);
      controls.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}

function addVehicleBase(THREE, scene) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd7e3ee, roughness: 0.62, metalness: 0.08 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.25, metalness: 0.25 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });

  addBox(THREE, scene, bodyMaterial, [0, 0.42, 0], [2.45, 0.65, 4.3]);
  addBox(THREE, scene, glassMaterial, [0, 0.95, -0.15], [1.75, 0.58, 2.1]);
  addBox(THREE, scene, bodyMaterial, [0, 0.34, -2.35], [2.2, 0.5, 0.42]);
  addBox(THREE, scene, bodyMaterial, [0, 0.34, 2.35], [2.2, 0.5, 0.42]);

  [
    [-1.25, 0.05, -1.55],
    [1.25, 0.05, -1.55],
    [-1.25, 0.05, 1.55],
    [1.25, 0.05, 1.55],
  ].forEach((position) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 32), darkMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(position[0], position[1], position[2]);
    scene.add(wheel);
  });
}

function addVehicleZones(THREE, scene, zoneMap) {
  const meshes = [];
  vehicleZoneDefinitions().forEach((def) => {
    const data = zoneMap.get(def.id) || {
      zona_id: def.id,
      nombre: def.name,
      cantidad: 0,
      porcentaje: 0,
      causa_principal: "",
      subcausa_principal: "",
      color_level: "gris",
      causas: [],
      subcausas: [],
      vins_recientes: [],
    };
    const material = new THREE.MeshStandardMaterial({
      color: zoneColor(data.color_level),
      transparent: true,
      opacity: data.cantidad ? 0.9 : 0.2,
      roughness: 0.48,
      metalness: 0.04,
    });
    const mesh = addBox(THREE, scene, material, def.position, def.scale);
    mesh.userData.zone = { ...data, nombre: data.nombre || def.name };
    meshes.push(mesh);
  });
  return meshes;
}

function addBox(THREE, scene, material, position, scale) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(scale[0], scale[1], scale[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function renderVehicleFallback(target, zonas) {
  const rows = zonas.length ? zonas : vehicleZoneDefinitions().map((def) => ({
    zona_id: def.id,
    nombre: def.name,
    cantidad: 0,
    porcentaje: 0,
    color_level: "gris",
  }));
  target.innerHTML = rows.map((zone) => `
    <button class="zone-chip zone-${escapeHtml(zone.color_level || "gris")}" type="button" data-zone="${escapeHtml(zone.zona_id)}">
      <strong>${escapeHtml(zone.nombre || zone.zona_id)}</strong>
      <span>${escapeHtml(zone.cantidad || 0)}</span>
    </button>
  `).join("");
  target.querySelectorAll("[data-zone]").forEach((button) => {
    button.addEventListener("click", () => {
      const zone = rows.find((row) => row.zona_id === button.dataset.zone);
      renderZoneDetail(zone);
    });
  });
}

function renderZoneDetail(zone) {
  const target = document.getElementById("zoneDetail");
  if (!target) return;
  if (!zone) {
    target.innerHTML = `<strong>Zona seleccionada</strong><p>Sin zona seleccionada.</p>`;
    return;
  }

  target.innerHTML = `
    <strong>${escapeHtml(zone.nombre || zone.zona_id || "Zona")}</strong>
    <div class="zone-stats">
      <span>Casos</span><b>${escapeHtml(zone.cantidad || 0)}</b>
      <span>Porcentaje</span><b>${escapeHtml(round(zone.porcentaje, 2))}%</b>
      <span>Causa</span><b>${escapeHtml(display(zone.causa_principal))}</b>
      <span>Subcausa</span><b>${escapeHtml(display(zone.subcausa_principal))}</b>
    </div>
    <p>${escapeHtml((zone.vins_recientes || []).slice(0, 6).join(", ") || "Sin VINs recientes.")}</p>
  `;
}

function disposeVehicleScene() {
  if (state.vehicleScene && typeof state.vehicleScene.dispose === "function") {
    state.vehicleScene.dispose();
  }
  state.vehicleScene = null;
}

function vehicleZoneDefinitions() {
  return [
    { id: "hood", name: "Capot", position: [0, 0.83, -1.82], scale: [1.7, 0.08, 0.9] },
    { id: "roof", name: "Techo", position: [0, 1.32, -0.15], scale: [1.55, 0.08, 1.1] },
    { id: "trunk", name: "Maletera", position: [0, 0.82, 1.88], scale: [1.7, 0.08, 0.82] },
    { id: "front_bumper", name: "Parachoque delantero", position: [0, 0.48, -2.58], scale: [2.0, 0.16, 0.18] },
    { id: "rear_bumper", name: "Parachoque posterior", position: [0, 0.48, 2.58], scale: [2.0, 0.16, 0.18] },
    { id: "front_left_door", name: "Puerta delantera izquierda", position: [-1.24, 0.58, -0.75], scale: [0.08, 0.58, 0.92] },
    { id: "rear_left_door", name: "Puerta posterior izquierda", position: [-1.24, 0.58, 0.42], scale: [0.08, 0.58, 0.92] },
    { id: "front_right_door", name: "Puerta delantera derecha", position: [1.24, 0.58, -0.75], scale: [0.08, 0.58, 0.92] },
    { id: "rear_right_door", name: "Puerta posterior derecha", position: [1.24, 0.58, 0.42], scale: [0.08, 0.58, 0.92] },
    { id: "front_left_fender", name: "Guardafango delantero izquierdo", position: [-1.25, 0.56, -1.75], scale: [0.08, 0.48, 0.62] },
    { id: "front_right_fender", name: "Guardafango delantero derecho", position: [1.25, 0.56, -1.75], scale: [0.08, 0.48, 0.62] },
    { id: "rear_left_fender", name: "Guardafango posterior izquierdo", position: [-1.25, 0.56, 1.5], scale: [0.08, 0.48, 0.62] },
    { id: "rear_right_fender", name: "Guardafango posterior derecho", position: [1.25, 0.56, 1.5], scale: [0.08, 0.48, 0.62] },
    { id: "left_side_skirt", name: "Estribo izquierdo", position: [-1.24, 0.2, -0.15], scale: [0.08, 0.16, 2.65] },
    { id: "right_side_skirt", name: "Estribo derecho", position: [1.24, 0.2, -0.15], scale: [0.08, 0.16, 2.65] },
    { id: "left_body", name: "Carroceria izquierda", position: [-1.28, 0.82, 0.98], scale: [0.08, 0.46, 0.8] },
    { id: "right_body", name: "Carroceria derecha", position: [1.28, 0.82, 0.98], scale: [0.08, 0.46, 0.8] },
    { id: "body_general", name: "Carroceria general", position: [0, 0.88, 0.86], scale: [1.4, 0.08, 0.74] },
    { id: "left_mirror", name: "Espejo izquierdo", position: [-1.38, 0.92, -1.12], scale: [0.12, 0.18, 0.24] },
    { id: "right_mirror", name: "Espejo derecho", position: [1.38, 0.92, -1.12], scale: [0.12, 0.18, 0.24] },
    { id: "front_left_wheel", name: "Aro/llanta delantera izquierda", position: [-1.28, 0.08, -1.55], scale: [0.12, 0.52, 0.52] },
    { id: "front_right_wheel", name: "Aro/llanta delantera derecha", position: [1.28, 0.08, -1.55], scale: [0.12, 0.52, 0.52] },
    { id: "rear_left_wheel", name: "Aro/llanta posterior izquierda", position: [-1.28, 0.08, 1.55], scale: [0.12, 0.52, 0.52] },
    { id: "rear_right_wheel", name: "Aro/llanta posterior derecha", position: [1.28, 0.08, 1.55], scale: [0.12, 0.52, 0.52] },
  ];
}

function zoneColor(level) {
  const colors = {
    rojo: 0xef4444,
    naranja: 0xf97316,
    amarillo: 0xf4c430,
    verde: 0x22c55e,
    gris: 0x94a3b8,
  };
  return colors[level] || colors.gris;
}

function zoneName(zoneId, zonas = []) {
  const found = (zonas || []).find((zone) => zone.zona_id === zoneId);
  if (found) return found.nombre || found.zona_id;
  const def = vehicleZoneDefinitions().find((zone) => zone.id === zoneId);
  return def ? def.name : (zoneId || "-");
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
    updateReprocessCost({ forceNo: !hasLocalValidation });
    return;
  }

  const suggestedCode = item.Codigo_Trabajo_Sugerido || suggestWorkCode(item);
  document.getElementById("suggestedWorkCodeInput").value = suggestedCode;
  document.getElementById("suggestedWorkCodeTag").textContent = `Sugerido: ${suggestedCode || "N/A"}`;
  if (!hasLocalValidation) codeSelect.value = suggestedCode || "N/A";
  if (!workCatalog[codeSelect.value]) codeSelect.value = suggestedCode || "N/A";
  updateOperationalImpact({ manualRole: hasLocalValidation, manualType: hasLocalValidation });
  updateReprocessCost({ forceNo: !hasLocalValidation });
}

function updateFinalSubcauses() {
  const causeSelect = document.getElementById("finalCauseSelect");
  const subcauseSelect = document.getElementById("finalSubcauseSelect");
  const current = subcauseSelect.value;
  const subcauses = finalSubcauses[causeSelect.value] || finalSubcauses.NUEVO_DANO;

  subcauseSelect.innerHTML = subcauses.map((subcause) => {
    const label = display(subcause);
    const definition = definitions.subcausas[subcause] || "";
    return `<option value="${escapeHtml(subcause)}" title="${escapeHtml(definition)}">${escapeHtml(subcause)} - ${escapeHtml(label)}</option>`;
  }).join("");

  if (subcauses.includes(current)) {
    subcauseSelect.value = current;
  }

  const help = document.getElementById("causeDefinitionHelp");
  if (help) {
    const cause = causeSelect.value;
    const causeDefinition = definitions.causas[cause] || "Selecciona una causa para ver sus subcausas permitidas.";
    const subcauseLabels = subcauses.map((code) => display(code)).join(" · ");
    help.textContent = `${causeDefinition} Subcausas: ${subcauseLabels}.`;
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
  const costHour = laborCost[role].costHour * laborParams.factor;
  const costTotal = catalog.hours * costHour;
  const impact = {
    Descripcion_Trabajo: catalog.description,
    Diagnostico_Trabajo: catalog.diagnosis,
    Panos_Estimados: catalog.panos,
    Gravedad: catalog.severity,
    Tiempo_Estimado_Texto: catalog.timeText,
    Tiempo_Estimado_Horas: round(catalog.hours, 4),
    Sueldo_Mensual_Usado: "",
    Horas_Mes_Usadas: "",
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

function updateReprocessCost(options = {}) {
  const calcSelect = document.getElementById("calculateReprocessCostSelect");
  const codeSelect = document.getElementById("reprocessCodeSelect");
  const roleSelect = document.getElementById("reprocessRoleSelect");
  const summary = document.getElementById("reprocessCostSummary");
  const tag = document.getElementById("reprocessCostTag");

  if (!calcSelect || !codeSelect || !roleSelect || !summary) return;

  if (options.forceNo) {
    calcSelect.value = "NO";
    codeSelect.value = "";
    roleSelect.value = "NO_APLICA";
  }

  const calculate = calcSelect.value === "SI";

  codeSelect.disabled = !calculate;
  roleSelect.disabled = !calculate;
  const comment = document.getElementById("reprocessCostComment");
  if (comment) comment.disabled = !calculate;

  if (!calculate) {
    summary.innerHTML = "Sin costo de reproceso seleccionado.";
    if (tag) tag.textContent = "No aplica";
    return;
  }

  const code = codeSelect.value;
  if (!code || !workCatalog[code]) {
    summary.innerHTML = `<div class="history-card">Selecciona un codigo P01, P02A, P02B, P02C, P03, P04 o P05 para calcular el costo.</div>`;
    if (tag) tag.textContent = "Pendiente codigo";
    return;
  }

  if (!options.manualRole) {
    roleSelect.value = suggestedRoleForCode(code);
  }

  const role = laborCost[roleSelect.value] ? roleSelect.value : "NO_APLICA";
  const catalog = workCatalog[code] || workCatalog["N/A"];
  const costHour = laborCost[role].costHour * laborParams.factor;
  const costTotal = catalog.hours * costHour;

  if (tag) tag.textContent = `Costo reproceso: ${money(costTotal)}`;

  summary.innerHTML = `
    <div class="impact-card"><span>Codigo</span><strong>${escapeHtml(code)}</strong></div>
    <div class="impact-card"><span>Trabajo</span><strong>${escapeHtml(catalog.description)}</strong></div>
    <div class="impact-card"><span>Panos</span><strong>${escapeHtml(catalog.panos)}</strong></div>
    <div class="impact-card"><span>Tiempo</span><strong>${escapeHtml(catalog.timeText)}</strong></div>
    <div class="impact-card"><span>Horas</span><strong>${escapeHtml(round(catalog.hours, 4))}</strong></div>
    <div class="impact-card"><span>Rol</span><strong>${escapeHtml(role)}</strong></div>
    <div class="impact-card"><span>Costo hora</span><strong>${money(costHour)}</strong></div>
    <div class="impact-card"><span>Costo reproceso</span><strong>${money(costTotal)}</strong></div>
  `;
}

function validateReprocessCostForm() {
  const calcSelect = document.getElementById("calculateReprocessCostSelect");
  const codeSelect = document.getElementById("reprocessCodeSelect");
  if (!calcSelect || !codeSelect) return true;

  if (calcSelect.value === "SI" && !codeSelect.value) {
    toast("Selecciona el codigo del reproceso o cambia Calcular costo de reproceso a NO.");
    codeSelect.focus();
    return false;
  }

  return true;
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
  updateReprocessCost({ manualRole: true });
  if (!validateReprocessCostForm()) return;
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
  payload.Marca = item.Marca || "";
  payload.Modelo = item.Modelo || "";
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
    setBusy(true, "Guardando validacion", "Escribiendo en la hoja VALIDACIONES...");
    status.textContent = "Guardando validacion...";
    const response = await jsonpRequest("guardar_validacion", payload);
    if (!response.ok) throw new Error(response.error || "No se pudo guardar la validacion");
    clearReadCache();
    status.textContent = `Guardado en hoja de validaciones, fila ${response.row}.`;
    toast("Validacion guardada en Excel/Sheets.");
  } catch (error) {
    status.textContent = "No se pudo guardar en la hoja. Quedo respaldo local en este navegador.";
    toast(error.message);
  } finally {
    button.disabled = false;
    setBusy(false);
  }
}

async function markRejectState() {
  const item = state.detail && state.detail.item_seleccionado;
  if (!item) return;

  const button = document.getElementById("markRejectDoneBtn");
  const status = document.getElementById("validationSaveStatus");
  const form = document.getElementById("validationForm");
  updateReprocessCost({ manualRole: true });
  if (!validateReprocessCostForm()) return;
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
  payload.Marca = item.Marca || "";
  payload.Modelo = item.Modelo || "";
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
    setBusy(true, nextState === "HECHO" ? "Marcando rechazo" : "Reabriendo rechazo", "Actualizando estado en VALIDACIONES...");
    status.textContent = nextState === "HECHO" ? "Marcando rechazo como analizado..." : "Reabriendo rechazo...";
    const response = await jsonpRequest("marcar_rechazo_estado", payload);
    if (!response.ok) throw new Error(response.error || "No se pudo actualizar el estado");

    clearReadCache();
    state.detailCache = {};
    state.rechazos = [];
    status.textContent = response.mensaje || "Estado actualizado.";
    toast(response.mensaje || "Estado actualizado.");
    await loadDetalle(item.ID_Item, item.VIN, item.ID_Evento);
  } catch (error) {
    status.textContent = "No se pudo actualizar el estado del rechazo.";
    toast(error.message);
    renderRejectStateButton(item);
  } finally {
    button.disabled = false;
    setBusy(false);
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
    updateReprocessCost({ manualRole: true });
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

function hydrateStatusMetadata(payload) {
  const causasRaiz = payload && payload.causas_raiz ? payload.causas_raiz : null;
  if (!causasRaiz) return;

  if (causasRaiz.causas) Object.assign(labels, causasRaiz.causas);
  if (causasRaiz.subcausas) Object.assign(labels, causasRaiz.subcausas);
  if (causasRaiz.definiciones_causas) Object.assign(definitions.causas, causasRaiz.definiciones_causas);
  if (causasRaiz.definiciones_subcausas) Object.assign(definitions.subcausas, causasRaiz.definiciones_subcausas);

  if (causasRaiz.subcausas_por_causa) {
    Object.keys(finalSubcauses).forEach((key) => delete finalSubcauses[key]);
    Object.assign(finalSubcauses, causasRaiz.subcausas_por_causa);
  }

  if (payload.costos && payload.costos.catalogo_trabajo) {
    Object.entries(payload.costos.catalogo_trabajo).forEach(([code, item]) => {
      if (!item) return;
      workCatalog[code] = {
        description: item.Descripcion || item.description || "",
        diagnosis: item.Diagnostico || item.diagnosis || "",
        type: item.TipoTrabajo || item.type || "",
        panos: Number(item.Panos || item.panos || 0),
        severity: Number(item.Gravedad || item.severity || 0),
        timeText: item.TiempoTexto || item.timeText || "0",
        hours: Number(item.TiempoHoras || item.hours || 0),
      };
    });
  }

  if (payload.costos && payload.costos.costos_roles) {
    Object.entries(payload.costos.costos_roles).forEach(([role, item]) => {
      if (!item) return;
      laborCost[role] = {
        costHour: Number(item.CostoHora || item.costHour || 0),
      };
    });
  }
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
  return `S/${round(value, 2).toFixed(2)}`;
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

function setBusy(isBusy, title = "Cargando...", subtitle = "Consultando Apps Script") {
  [
    "refreshBtn",
    "applyFiltersBtn",
    "applyCostFiltersBtn",
    "applyValidated3dFiltersBtn",
    "causeRootModeBtn",
    "costReviewModeBtn",
    "loadAutoReprocessEstimateBtn",
    "loadAuditBtn",
    "downloadAuditBtn",
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });

  const indicator = document.getElementById("loadingIndicator");
  if (indicator) {
    indicator.classList.toggle("hidden", !isBusy);
    const titleEl = document.getElementById("loadingTitle");
    const subtitleEl = document.getElementById("loadingSubtitle");
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
  }

  const statusSubtext = document.getElementById("statusSubtext");
  if (statusSubtext && isBusy) statusSubtext.textContent = subtitle;
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => element.classList.add("hidden"), 4200);
}
