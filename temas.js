// ─────────────────────────────────────────
// TEMAS: las paletas de color de Reps
// Cada tema cambia las variables de style.css (--bg, --lime, etc.)
// Se carga en el <head> para que la app arranque ya con tu paleta.
// ─────────────────────────────────────────

const TEMAS = {
  volt:         { nombre: "Volt",         modo: "Oscuro", bg: "#0c0e0b", surface: "#151913", surface2: "#1c2119", line: "#272d22", text: "#eef2e8", muted: "#8d967f", lime: "#c6f432", ink: "#0c0e0b", danger: "#ff7a6b" },
  ultravioleta: { nombre: "Ultravioleta", modo: "Oscuro", bg: "#0b0a10", surface: "#15131d", surface2: "#1c1927", line: "#2a2638", text: "#efeaff", muted: "#8f88a6", lime: "#a685ff", ink: "#0b0a10", danger: "#ff7a6b" },
  infrarrojo:   { nombre: "Infrarrojo",   modo: "Oscuro", bg: "#0e0a08", surface: "#1a1310", surface2: "#221915", line: "#33251e", text: "#f6ece6", muted: "#a08d82", lime: "#ff5a1f", ink: "#0e0a08", danger: "#ff8a80" },
  hielo:        { nombre: "Hielo",        modo: "Oscuro", bg: "#080c0f", surface: "#111a20", surface2: "#16222a", line: "#22323c", text: "#e6f6fb", muted: "#7f97a3", lime: "#5ce1ff", ink: "#080c0f", danger: "#ff7a6b" },
  rosa:         { nombre: "Rosa ácido",   modo: "Oscuro", bg: "#0f0a0c", surface: "#1b1216", surface2: "#24181d", line: "#35242b", text: "#fbe9f0", muted: "#a48a95", lime: "#ff3d8b", ink: "#0f0a0c", danger: "#ff8a6b" },
  senal:        { nombre: "Señal",        modo: "Oscuro", bg: "#000000", surface: "#111111", surface2: "#1a1a1a", line: "#2a2a2a", text: "#ffffff", muted: "#8a8a8a", lime: "#ff3b2f", ink: "#000000", danger: "#ff8a80" },
  cobalto:      { nombre: "Cobalto",      modo: "Claro",  bg: "#f1eee7", surface: "#ffffff", surface2: "#e8e4da", line: "#d9d4c7", text: "#111111", muted: "#6b6759", lime: "#2747ff", ink: "#ffffff", danger: "#d6342a" },
};

// Qué variable de CSS cambia cada color
const VARIABLES_TEMA = ["bg", "surface", "surface2", "line", "text", "muted", "lime", "ink", "danger"];

let temaActual = leerTema();
aplicarTema(temaActual);

// ── Guardar y leer el tema elegido (queda en este teléfono) ──
function leerTema() {
  try {
    const guardado = localStorage.getItem("reps-tema");
    return TEMAS[guardado] ? guardado : "volt";
  } catch (e) {
    return "volt";
  }
}

function guardarTema(id) {
  try { localStorage.setItem("reps-tema", id); } catch (e) { /* si no se puede guardar, sigue igual */ }
}

// ── Aplicar un tema: cambia las variables de CSS ──
function aplicarTema(id) {
  const tema = TEMAS[id] || TEMAS.volt;
  const raiz = document.documentElement;

  VARIABLES_TEMA.forEach((clave) => raiz.style.setProperty("--" + clave, tema[clave]));
  raiz.style.colorScheme = tema.modo === "Claro" ? "light" : "dark";

  // El color de la barra del navegador / del iPhone
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema.bg);

  temaActual = TEMAS[id] ? id : "volt";
}

// ── Pantalla: Apariencia ──
function pantallaApariencia() {
  const tarjetas = Object.entries(TEMAS).map(([id, t]) => `
    <button class="tema ${id === temaActual ? "on" : ""}" type="button" data-accion="elegir-tema" data-tema="${id}">
      <span class="tema-muestra" style="background:${t.bg}">
        <span class="tema-linea" style="background:${t.text}"></span>
        <span class="tema-card" style="background:${t.surface}">
          <span class="tema-punto" style="background:${t.lime}"></span>
          <span class="tema-linea corta" style="background:${t.muted}"></span>
        </span>
        <span class="tema-boton" style="background:${t.lime}"></span>
      </span>
      <span class="tema-nombre">
        <strong>${t.nombre}</strong>
        <small>${id === temaActual ? "✓ En uso" : t.modo}</small>
      </span>
    </button>
  `).join("");

  return `
    <button class="volver" type="button" data-accion="volver-ajustes">← Ajustes</button>
    <h1 class="titulo">Apariencia</h1>
    <p class="subtitulo">Elegí la paleta de Reps. El cambio se ve al instante y queda guardado en este teléfono.</p>
    <div class="temas">${tarjetas}</div>
  `;
}

// ── Botones ──
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  if (accion === "abrir-apariencia") {
    vista = "apariencia";
    render();
  }

  if (accion === "elegir-tema") {
    aplicarTema(boton.dataset.tema);
    guardarTema(temaActual);
    render();
  }

  if (accion === "volver-ajustes") {
    vista = "ajustes";
    render();
  }
});
