// ─────────────────────────────────────────
// RUTINA: un día por vista, con chips arriba
// El día que le toca al alumno (según su última sesión) se marca con un punto.
// Usa variables y funciones de app.js
// ─────────────────────────────────────────

let diaElegido = null;            // índice del día que estás mirando (null = el sugerido)
let diasUltimaSesion = null;      // { alumnoId, dias: ["Día 1 - …"] } de la última vez que entrenó

// ── Leer qué días hizo en su última sesión ──
async function cargarUltimaSesionAlumno(alumnoId) {
  diasUltimaSesion = null;

  const respuesta = await db
    .from("registros")
    .select("fecha, ejercicios(dia)")
    .eq("alumno_id", alumnoId)
    .order("fecha", { ascending: false })
    .limit(50);

  if (respuesta.error || !respuesta.data.length) {
    diasUltimaSesion = { alumnoId, dias: [] };
  } else {
    const ultimaFecha = respuesta.data[0].fecha;
    const dias = respuesta.data
      .filter(r => r.fecha === ultimaFecha && r.ejercicios)
      .map(r => r.ejercicios.dia);
    diasUltimaSesion = { alumnoId, dias };
  }

  if (vista === "alumno") render();
}

// ── ¿Qué día le toca? El siguiente al último que hizo ──
function diaSugerido(dias) {
  if (!diasUltimaSesion || !alumnoActual || diasUltimaSesion.alumnoId !== alumnoActual.id) return 0;
  const hechos = diasUltimaSesion.dias.map(d => dias.indexOf(d)).filter(i => i >= 0);
  if (!hechos.length) return 0;
  return (Math.max(...hechos) + 1) % dias.length;
}

// "Día 1 - Glúteos + isquios" → { corto: "Día 1", nombre: "Glúteos + isquios" }
function partesDelDia(dia, i) {
  const numero = String(dia).match(/d[ií]a\s*\d+/i);
  const corto = numero ? numero[0].replace(/^d[ií]a\s*/i, "Día ") : `Día ${i + 1}`;
  const nombre = String(dia)
    .replace(/d[ií]a\s*\d+/i, "")
    .replace(/^\s*[-–—:·|]\s*/, "")
    .trim();
  return { corto, nombre: nombre || dia };
}

// ── La rutina con chips ──
function seccionRutinaChips() {
  if (cargandoEjercicios) {
    return `<p class="subtitulo">Cargando rutina…</p>`;
  }

  const grupos = agruparPorDia(ejercicios);
  const dias = Object.keys(grupos);

  if (!dias.length) {
    return `<p class="vacio">Todavía no tiene rutina.<br>Agregá el primer ejercicio 👆</p>`;
  }

  const sugerido = diaSugerido(dias);
  const actual = diaElegido !== null && diaElegido < dias.length ? diaElegido : sugerido;
  const { nombre } = partesDelDia(dias[actual], actual);

  const chips = dias.map((dia, i) => `
    <button class="chip-dia ${i === actual ? "on" : ""} ${i === sugerido ? "sugerido" : ""}"
            type="button" data-accion="elegir-dia" data-dia="${i}" aria-pressed="${i === actual}">
      ${partesDelDia(dia, i).corto}
      ${i === sugerido ? `<span class="punto" aria-label="le toca hoy"></span>` : ""}
    </button>
  `).join("");

  const tarjetas = grupos[dias[actual]].map(ej => `
    <div class="card ejercicio">
      <button class="ej-info" data-accion="ver-progreso" data-id="${ej.id}">
        <span class="ej-texto">
          <h3>${ej.nombre}</h3>
          <p class="presc">${ej.series} × ${ej.reps || "—"}</p>
        </span>
        <span class="chev">›</span>
      </button>
      <button class="borrar" data-accion="borrar-ejercicio" data-id="${ej.id}" aria-label="Borrar ${ej.nombre}">✕</button>
    </div>
  `).join("");

  return `
    <div class="chips-dias">${chips}</div>
    <div class="dia-titulo">
      <h3>${nombre}</h3>
      ${actual === sugerido ? `<span class="le-toca">Le toca hoy</span>` : ""}
    </div>
    <div class="lista">${tarjetas}</div>
    <button class="btn iniciar" data-accion="entrenar" data-dia="${actual}">Iniciar entrenamiento</button>
  `;
}

// ── Botones ──
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // Al abrir un alumno (desde Alumnos o desde un turno de Hoy): empieza en el día sugerido
  if (accion === "abrir") {
    diaElegido = null;
    cargarUltimaSesionAlumno(Number(boton.dataset.id));
  }

  if (accion === "elegir-dia") {
    diaElegido = Number(boton.dataset.dia);
    render();
  }
});
