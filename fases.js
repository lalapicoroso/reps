// ─────────────────────────────────────────
// FASES: cada fase puede tener fecha de fin.
// Cuando se cumple, Reps avisa (en Hoy y en el alumno) y con un toque pasa a la siguiente.
// Usa variables y funciones de app.js y avisos.js
// Columnas en Supabase: alumnos.fase_hasta (date) y alumnos.fase_semanas (int)
// ─────────────────────────────────────────

const DURACIONES = [4, 6, 8, 12];   // semanas que se ofrecen como chips

// Fecha de dentro de N días, en formato "2026-12-31"
function sumarDias(n) {
  return haceDias(-n);
}

// "Fase 1" → "Fase 2". Si no tiene número, no sabemos cuál sigue → null
function siguienteFase(fase) {
  const numero = String(fase || "").match(/(\d+)\s*$/);
  if (!numero) return null;
  return fase.replace(/(\d+)\s*$/, String(Number(numero[1]) + 1));
}

function faseVencida(alumno) {
  return !!(alumno && alumno.fase_hasta && alumno.fase_hasta <= hoy());
}

// ── Campo "Duración de la fase" (en Nuevo y Editar alumno) ──
function campoDuracion(alumno) {
  const hasta = (alumno && alumno.fase_hasta) || "";
  const semanas = (alumno && alumno.fase_semanas) || "";
  const esFecha = hasta && !DURACIONES.includes(Number(semanas));

  const chips = DURACIONES.map(n => `
    <button type="button" class="chip-dia ${Number(semanas) === n && !esFecha ? "on" : ""}"
            data-accion="elegir-duracion" data-semanas="${n}">${n} sem</button>`).join("");

  return `
    <div class="campo-duracion">
      <span class="campo-titulo">Duración de la fase</span>
      <div class="chips-dias">
        ${chips}
        <button type="button" class="chip-dia ${esFecha ? "on" : ""}" data-accion="elegir-duracion" data-semanas="fecha">Fecha</button>
      </div>
      <input type="date" class="fecha-fase" value="${hasta}" ${esFecha ? "" : "hidden"} aria-label="Fecha de fin de la fase">
      <input type="hidden" name="fase_hasta" value="${hasta}">
      <input type="hidden" name="fase_semanas" value="${semanas}">
      <p class="ayuda izq" id="fase-ayuda">${textoAyudaFase(hasta)}</p>
    </div>
  `;
}

function textoAyudaFase(hasta, fase) {
  if (!hasta) return "Opcional. Si la elegís, te avisamos cuando termine.";
  const siguiente = siguienteFase(fase) || "la fase siguiente";
  return `Termina el ${fechaLarga(hasta)}. Ese día te avisamos para pasar a ${siguiente.startsWith("la ") ? siguiente : "la " + siguiente}.`;
}

function actualizarCampoDuracion(caja, hasta, semanas) {
  caja.querySelector('[name="fase_hasta"]').value = hasta;
  caja.querySelector('[name="fase_semanas"]').value = semanas;
  const fase = caja.closest("form").querySelector('[name="fase"]').value;
  caja.querySelector("#fase-ayuda").textContent = textoAyudaFase(hasta, fase);
}

// ── Tarjeta "Terminó la Fase 1" ──
function tarjetaFase(alumno, conNombre) {
  if (!faseVencida(alumno)) return "";
  const siguiente = siguienteFase(alumno.fase);
  const fase = textoSeguro(alumno.fase || "la fase");
  const quien = conNombre ? `${textoSeguro(alumno.nombre)} terminó` : "Terminó";
  const duracion = alumno.fase_semanas ? `Fueron ${alumno.fase_semanas} semanas. ` : "";
  const pregunta = siguiente ? `¿Pasa a la ${textoSeguro(siguiente)}?` : "¿Cuál es la fase que sigue?";
  const principal = siguiente
    ? `<button class="btn-chico" data-accion="pasar-fase" data-id="${alumno.id}">Pasar a ${textoSeguro(siguiente)}</button>`
    : `<button class="btn-chico" data-accion="editar-fase" data-id="${alumno.id}">Elegir fase</button>`;

  return `
    <div class="card borrador fase-card">
      <p class="borrador-tag">CAMBIO DE FASE</p>
      <h3>${quien} la ${fase.replace(/^la /, "")}</h3>
      <p>${duracion}${pregunta}</p>
      <div class="acciones-fila">
        ${principal}
        <button class="btn-chico fantasma" data-accion="extender-fase" data-id="${alumno.id}">Extender 2 semanas</button>
      </div>
    </div>
  `;
}

// En Hoy: una tarjeta por cada alumno con la fase cumplida
function tarjetasFaseHoy() {
  return alumnos.filter(faseVencida).map(a => tarjetaFase(a, true)).join("");
}

// Guarda el cambio y actualiza la lista de alumnos
async function actualizarFase(alumno, cambios, mensaje) {
  const respuesta = await db.from("alumnos").update(cambios).eq("id", alumno.id).select().single();
  if (respuesta.error) {
    alert("No se pudo guardar: " + respuesta.error.message);
    return;
  }
  alumnos = alumnos.map(a => a.id === alumno.id ? respuesta.data : a);
  if (alumnoActual && alumnoActual.id === alumno.id) alumnoActual = respuesta.data;
  render();
  mostrarToast(mensaje);
}

// ── Botones ──
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // Chips de duración en el formulario
  if (accion === "elegir-duracion") {
    const caja = boton.closest(".campo-duracion");
    const fecha = caja.querySelector(".fecha-fase");
    const yaEstaba = boton.classList.contains("on");
    caja.querySelectorAll(".chip-dia").forEach(c => c.classList.remove("on"));
    fecha.hidden = true;

    if (yaEstaba) {                       // tocarlo de nuevo lo apaga: sin aviso
      actualizarCampoDuracion(caja, "", "");
      return;
    }
    boton.classList.add("on");
    if (boton.dataset.semanas === "fecha") {
      fecha.hidden = false;
      fecha.focus();
      actualizarCampoDuracion(caja, fecha.value, "");
    } else {
      const semanas = Number(boton.dataset.semanas);
      actualizarCampoDuracion(caja, sumarDias(semanas * 7), semanas);
    }
  }

  const alumno = alumnos.find(a => a.id === Number(boton.dataset.id));
  if (!alumno) return;

  if (accion === "pasar-fase") {
    const siguiente = siguienteFase(alumno.fase);
    const semanas = alumno.fase_semanas;
    await actualizarFase(alumno,
      { fase: siguiente, fase_hasta: semanas ? sumarDias(semanas * 7) : null },
      `✓ ${alumno.nombre} pasó a la ${siguiente}`);
  }

  if (accion === "extender-fase") {
    await actualizarFase(alumno,
      { fase_hasta: sumarDias(14) },
      `✓ ${alumno.fase || "Fase"} extendida 2 semanas`);
  }

  if (accion === "editar-fase") {
    alumnoActual = alumno;
    vista = "editar";
    render();
  }
});

// La fecha elegida a mano
document.addEventListener("change", (evento) => {
  if (!evento.target.classList.contains("fecha-fase")) return;
  const caja = evento.target.closest(".campo-duracion");
  const hasta = evento.target.value;
  const semanas = hasta ? Math.max(1, Math.round((new Date(hasta) - new Date(hoy())) / (7 * 86400000))) : "";
  actualizarCampoDuracion(caja, hasta, semanas);
});

// Si cambiás el nombre de la fase, el texto de ayuda se actualiza ("…pasar a la Fase 3")
document.addEventListener("input", (evento) => {
  if (evento.target.name !== "fase") return;
  const caja = evento.target.closest("form").querySelector(".campo-duracion");
  if (caja) actualizarCampoDuracion(caja, caja.querySelector('[name="fase_hasta"]').value, caja.querySelector('[name="fase_semanas"]').value);
});
