// ─────────────────────────────────────────
// ENTRENO: la sesión en el gimnasio
// Un ejercicio por vez · "Última vez" · la serie se marca sola · timer de descanso flotante
// Usa variables y funciones de app.js y rutina.js
// ─────────────────────────────────────────

const DESCANSO_SEGUNDOS = 90;   // descanso por defecto entre series

let ejercicioIdx = 0;           // qué ejercicio de la sesión estás mirando
let seriesConDescanso = new Set();  // series que ya dispararon el timer (para no repetirlo)
let descanso = null;            // { fin: hora en que termina } o null
let relojDescanso = null;       // el setInterval que actualiza el número
let pidiendoSalir = false;      // ¿está abierto el sheet de "¿Salir del entrenamiento?"

// ─────────────────────────────────────────
// BORRADOR: lo que vas anotando se guarda en el teléfono
// Si la app se cierra sin querer, al volver te ofrece retomarlo (solo el mismo día)
// ─────────────────────────────────────────
function leerBorrador() {
  try {
    const b = JSON.parse(localStorage.getItem("reps-borrador"));
    if (!b || b.fecha !== hoy()) return null;   // los de otro día no sirven
    return b;
  } catch {
    return null;
  }
}

function guardarBorrador() {
  if (vista !== "sesion" || !alumnoActual || !sesionDia) return;
  try {
    localStorage.setItem("reps-borrador", JSON.stringify({
      alumnoId: alumnoActual.id,
      alumnoNombre: alumnoActual.nombre,
      dia: sesionDia,
      datos: sesionDatos,
      ejercicioIdx,
      fecha: hoy(),
      hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    }));
  } catch {}
}

function borrarBorrador() {
  try { localStorage.removeItem("reps-borrador"); } catch {}
}

function contarSeries(datos) {
  let n = 0;
  Object.values(datos || {}).forEach(series => Object.values(series).forEach(s => { if (s.kg || s.reps) n++; }));
  return n;
}

// Tarjeta "Tenés un entrenamiento sin terminar" (se muestra en Hoy y en la rutina del alumno)
function tarjetaBorrador(soloAlumnoId) {
  const b = leerBorrador();
  if (!b || (soloAlumnoId && b.alumnoId !== soloAlumnoId)) return "";
  if (vista === "sesion") return "";
  const n = contarSeries(b.datos);
  if (!n) return "";
  return `
    <div class="card borrador">
      <p class="borrador-tag">ENTRENAMIENTO SIN TERMINAR</p>
      <h3>${textoSeguro(b.alumnoNombre)} · ${textoSeguro(partesDelDia(b.dia, 0).corto)}</h3>
      <p>${n} ${n === 1 ? "serie anotada" : "series anotadas"} · hoy a las ${b.hora}. Todavía no está en el historial.</p>
      <div class="acciones-fila">
        <button class="btn-chico" data-accion="retomar-borrador">Retomar</button>
        <button class="btn-chico fantasma" data-accion="descartar-borrador">Descartar</button>
      </div>
    </div>
  `;
}

async function retomarBorrador() {
  const b = leerBorrador();
  if (!b) return;
  const alumno = alumnos.find(a => a.id === b.alumnoId);
  if (!alumno) { borrarBorrador(); render(); return; }

  alumnoActual = alumno;
  seccionAlumno = "rutina";

  // Si venimos de Hoy, todavía no tenemos su rutina: la pedimos
  const respuesta = await db.from("ejercicios").select("*")
    .eq("alumno_id", alumno.id).eq("activo", true).order("dia").order("orden");
  if (respuesta.error) { alert("No se pudo cargar la rutina: " + respuesta.error.message); return; }
  ejercicios = respuesta.data;

  const delDia = agruparPorDia(ejercicios)[b.dia];
  if (!delDia) {
    alert("Ese día ya no está en la rutina, así que no se puede retomar.");
    borrarBorrador();
    render();
    return;
  }

  sesionDia = b.dia;
  sesionEjercicios = delDia;
  sesionDatos = b.datos;
  ejercicioIdx = b.ejercicioIdx || 0;
  pidiendoSalir = false;
  seriesConDescanso = new Set();
  Object.keys(sesionDatos).forEach(ej => Object.keys(sesionDatos[ej]).forEach(s => seriesConDescanso.add(`${ej}-${s}`)));
  vista = "sesion";
  cargarUltimaVez();   // trae "la última vez" y dibuja la pantalla
}

// ── Ayudantes ──
function serieCompleta(ejId, serie) {
  const s = sesionDatos[ejId] && sesionDatos[ejId][serie];
  return !!(s && s.kg && s.reps);
}

function seriesCompletasDe(ej) {
  let n = 0;
  for (let s = 1; s <= ej.series; s++) if (serieCompleta(ej.id, s)) n++;
  return n;
}

function mmss(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ── Pantalla de entrenamiento ──
function pantallaEntreno() {
  const volver = `<button class="volver" data-accion="pedir-salir">← Salir del entrenamiento</button>`;

  if (cargandoSesion) {
    return volver + `<p class="subtitulo">Preparando la sesión…</p>`;
  }

  const total = sesionEjercicios.length;
  if (ejercicioIdx >= total) ejercicioIdx = total - 1;
  const ej = sesionEjercicios[ejercicioIdx];
  const anterior = ultimaVez[ej.id] || [];
  const siguiente = sesionEjercicios[ejercicioIdx + 1];
  const esUltimo = ejercicioIdx === total - 1;

  // "LAURA / DÍA 1"
  const contexto = `${alumnoActual.nombre} / ${partesDelDia(sesionDia, 0).corto}`.toUpperCase();

  // Barritas del 1 / 3
  const pasos = sesionEjercicios.map((e, i) => {
    const clase = i === ejercicioIdx ? "actual" : seriesCompletasDe(e) === e.series ? "hecho" : "";
    return `<i class="${clase}"></i>`;
  }).join("");

  // Tarjeta "Última vez"
  const ultimaVezHtml = anterior.length
    ? `
      <div class="ultima-vez">
        <p>ÚLTIMA VEZ · ${fechaLarga(anterior[0].fecha).toUpperCase()}</p>
        <strong>${anterior.map(r => `${r.kg ?? "–"}×${r.reps ?? "–"}`).join(" · ")}</strong>
      </div>`
    : `<div class="ultima-vez"><p>PRIMERA VEZ 🎉</p><span class="ultima-ayuda">Elegí una carga que te deje 2-3 reps en reserva.</span></div>`;

  // Filas de series: número · kg · reps · ✓
  let filas = "";
  for (let s = 1; s <= ej.series; s++) {
    const previa = anterior.find(r => r.serie === s) || {};
    const actual = (sesionDatos[ej.id] && sesionDatos[ej.id][s]) || {};
    filas += `
      <span class="n">${s}</span>
      <input data-ej="${ej.id}" data-serie="${s}" data-campo="kg"
             inputmode="decimal" placeholder="${previa.kg ?? "kg"}"
             value="${actual.kg ?? ""}" class="${actual.kg ? "lleno" : ""}">
      <input data-ej="${ej.id}" data-serie="${s}" data-campo="reps"
             inputmode="numeric" placeholder="${previa.reps ?? "reps"}"
             value="${actual.reps ?? ""}" class="${actual.reps ? "lleno" : ""}">
      <span class="check ${serieCompleta(ej.id, s) ? "on" : ""}" id="check-${ej.id}-${s}">✓</span>
    `;
  }

  const hechas = seriesHechas();
  const totalSeries = seriesTotales();

  // < Anterior (no aparece en el primero) · Siguiente > (en el último pasa a "Terminar")
  const botones = `
    <div class="nav-entreno">
      ${ejercicioIdx > 0 ? `<button class="btn secundario" data-accion="ejercicio-anterior">‹ Anterior</button>` : ""}
      ${esUltimo
        ? `<button class="btn" data-accion="pedir-salir">Terminar</button>`
        : `<button class="btn" data-accion="ejercicio-siguiente" aria-label="Siguiente: ${textoSeguro(siguiente.nombre)}">Siguiente ›</button>`}
    </div>
  `;

  return `
    ${volver}
    <div class="entreno" id="entreno">
      <div class="entreno-contexto">
        <span>${contexto}</span>
        <span class="pasos-ej"><b>${ejercicioIdx + 1} / ${total}</b>${pasos}</span>
      </div>

      <h1 class="titulo">${ej.nombre}</h1>
      <p class="subtitulo">Objetivo: ${ej.series} × ${ej.reps || "—"}</p>

      ${ultimaVezHtml}

      <div class="card sesion-ej">
        <div class="series con-check">
          <span class="h">Serie</span><span class="h">Kg</span><span class="h">Reps</span><span class="h"></span>
          ${filas}
        </div>
      </div>

      ${botones}

      <div class="progreso-chico">
        <span id="progreso-texto">${hechas} de ${totalSeries} series</span>
        <div class="barra"><i id="progreso-barra" style="width:${totalSeries ? (hechas / totalSeries) * 100 : 0}%"></i></div>
      </div>
    </div>
    ${pidiendoSalir ? sheetSalir(hechas, totalSeries) : ""}
  `;
}

// ── Sheet: salir a la mitad ──
function sheetSalir(hechas, totalSeries) {
  return `
    <div class="sheet-fondo" data-accion="cerrar-sheet"></div>
    <div class="sheet" role="dialog" aria-label="Salir del entrenamiento">
      <span class="sheet-manija"></span>
      <h2>¿Terminar el entrenamiento?</h2>
      <p>Hiciste <strong>${hechas} de ${totalSeries} series</strong>. Podés guardar lo que hiciste: va al historial y a Progreso como cualquier sesión.</p>
      <button class="btn" data-accion="guardar-sesion">Guardar ${hechas} ${hechas === 1 ? "serie" : "series"} y terminar</button>
      <button class="btn secundario" data-accion="cerrar-sheet">Seguir entrenando</button>
      <button class="btn peligro" data-accion="descartar-sesion">Salir sin guardar</button>
    </div>
  `;
}

function salirDelEntreno() {
  borrarBorrador();
  pidiendoSalir = false;
  sesionDatos = {};
  terminarDescanso();
  vista = "alumno";
  render();
}

// ─────────────────────────────────────────
// TIMER DE DESCANSO (vive afuera de #app para que no se borre al re-dibujar)
// ─────────────────────────────────────────
function empezarDescanso() {
  descanso = { fin: Date.now() + DESCANSO_SEGUNDOS * 1000 };
  dibujarTimer();
  clearInterval(relojDescanso);
  relojDescanso = setInterval(tickDescanso, 500);
}

function terminarDescanso() {
  descanso = null;
  clearInterval(relojDescanso);
  const timer = document.getElementById("timer");
  if (timer) timer.remove();
}

function tickDescanso() {
  if (!descanso || vista !== "sesion") return terminarDescanso();
  const quedan = (descanso.fin - Date.now()) / 1000;
  if (quedan <= 0) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);   // en Android vibra; en iPhone no hace nada
    return terminarDescanso();
  }
  const numero = document.getElementById("timer-tiempo");
  if (numero) numero.textContent = mmss(quedan);
}

function dibujarTimer() {
  let timer = document.getElementById("timer");
  if (!timer) {
    timer = document.createElement("div");
    timer.id = "timer";
    timer.className = "timer";
    document.body.appendChild(timer);
  }
  timer.innerHTML = `
    <div class="timer-tiempo"><small>DESCANSO</small><b id="timer-tiempo">${mmss((descanso.fin - Date.now()) / 1000)}</b></div>
    <button data-accion="descanso-menos">−15</button>
    <button data-accion="descanso-mas">+15</button>
    <button class="on" data-accion="descanso-saltar">Saltar</button>
  `;
}

// ─────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // Arranca una sesión nueva: primer ejercicio, sin timer
  if (accion === "entrenar") {
    ejercicioIdx = 0;
    pidiendoSalir = false;
    seriesConDescanso = new Set();
    terminarDescanso();
  }

  // "← Salir del entrenamiento": si no anotaste nada, sale directo; si no, pregunta
  if (accion === "pedir-salir") {
    if (seriesHechas() === 0) {
      salirDelEntreno();
    } else {
      pidiendoSalir = true;
      render();
    }
  }

  if (accion === "cerrar-sheet") {
    pidiendoSalir = false;
    render();
  }

  if (accion === "descartar-sesion") {
    salirDelEntreno();
  }

  if (accion === "ejercicio-siguiente") {
    ejercicioIdx++;
    guardarBorrador();
    render();
  }

  if (accion === "ejercicio-anterior") {
    ejercicioIdx--;
    guardarBorrador();
    render();
  }

  if (accion === "retomar-borrador") {
    retomarBorrador();
  }

  if (accion === "descartar-borrador") {
    if (!confirm("¿Descartar las series anotadas? No se guardan en el historial.")) return;
    borrarBorrador();
    render();
  }

  if (accion === "descanso-menos" && descanso) {
    descanso.fin -= 15000;
    tickDescanso();
  }
  if (accion === "descanso-mas" && descanso) {
    descanso.fin += 15000;
    tickDescanso();
  }
  if (accion === "descanso-saltar") {
    terminarDescanso();
  }

  // Al guardar, se cierran el sheet y el timer
  if (accion === "guardar-sesion") {
    pidiendoSalir = false;
    setTimeout(() => { if (vista !== "sesion") terminarDescanso(); }, 0);
  }
});

// Mientras escribís: la ✓ se prende al instante
document.addEventListener("input", (evento) => {
  const campo = evento.target;
  if (!campo.dataset.campo || vista !== "sesion") return;
  guardarBorrador();   // cada cosa que escribís queda guardada en el teléfono
  const check = document.getElementById(`check-${campo.dataset.ej}-${campo.dataset.serie}`);
  if (check) check.classList.toggle("on", serieCompleta(campo.dataset.ej, campo.dataset.serie));
});

// Cuando terminás de escribir (salís del campo): si la serie está completa, arranca el descanso
document.addEventListener("change", (evento) => {
  const campo = evento.target;
  if (!campo.dataset.campo || vista !== "sesion") return;
  const clave = `${campo.dataset.ej}-${campo.dataset.serie}`;
  if (serieCompleta(campo.dataset.ej, campo.dataset.serie) && !seriesConDescanso.has(clave)) {
    seriesConDescanso.add(clave);
    empezarDescanso();
  }
});

// Deslizar el dedo ← → para cambiar de ejercicio
let toqueX = null;
document.addEventListener("touchstart", (evento) => {
  toqueX = evento.target.closest("#entreno") && evento.target.tagName !== "INPUT" ? evento.touches[0].clientX : null;
}, { passive: true });

document.addEventListener("touchend", (evento) => {
  if (toqueX === null || vista !== "sesion") return;
  const distancia = evento.changedTouches[0].clientX - toqueX;
  toqueX = null;
  if (Math.abs(distancia) < 60) return;
  if (distancia < 0 && ejercicioIdx < sesionEjercicios.length - 1) ejercicioIdx++;
  else if (distancia > 0 && ejercicioIdx > 0) ejercicioIdx--;
  else return;
  render();
});

// ─────────────────────────────────────────
// PANTALLA SIEMPRE ENCENDIDA durante el entrenamiento
// (Wake Lock: le pide al teléfono que no se bloquee mientras estás en la sesión)
// ─────────────────────────────────────────
let pantallaEncendida = null;   // el "permiso" que nos da el teléfono, o null

async function controlarPantalla() {
  if (!("wakeLock" in navigator)) return;   // teléfonos viejos: no hacemos nada

  if (vista === "sesion" && !pantallaEncendida) {
    try {
      pantallaEncendida = await navigator.wakeLock.request("screen");
      pantallaEncendida.addEventListener("release", () => { pantallaEncendida = null; });
    } catch {}
  }

  if (vista !== "sesion" && pantallaEncendida) {
    pantallaEncendida.release();
    pantallaEncendida = null;
  }
}

// Si salís de la app y volvés, el teléfono suelta el permiso solo: lo pedimos de nuevo
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") controlarPantalla();
});