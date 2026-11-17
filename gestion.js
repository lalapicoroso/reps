// ─────────────────────────────────────────
// GESTIÓN: borrar alumnos y editar ejercicios
// Usa variables y funciones de app.js y nutricion.js
// ─────────────────────────────────────────

// ── Pantalla: editar un ejercicio ──
function pantallaEditarEjercicio(ej) {
  const dias = Object.keys(agruparPorDia(ejercicios))
    .map(d => `<option value="${textoSeguro(d)}">`)
    .join("");

  return `
    <button class="volver" type="button" data-accion="volver-progreso">← ${textoSeguro(ej.nombre)}</button>
    <h1 class="titulo">Editar ejercicio</h1>

    <form id="form-editar-ejercicio" class="form">
      <label>Día
        <input name="dia" required list="dias-editar" value="${textoSeguro(ej.dia)}">
        <datalist id="dias-editar">${dias}</datalist>
      </label>
      <label>Ejercicio
        <input name="nombre" required value="${textoSeguro(ej.nombre)}">
      </label>
      <div class="dos-columnas">
        <label>Series <input name="series" type="number" min="1" max="10" inputmode="numeric" value="${ej.series}"></label>
        <label>Reps   <input name="reps" value="${textoSeguro(ej.reps || "")}" placeholder="8-10"></label>
      </div>
      <p class="error"></p>
      <button class="btn" type="submit">Guardar cambios</button>
    </form>

    <p class="ayuda">El historial no cambia: las series que ya registraste quedan como estaban.</p>
  `;
}

// ── Botones ──
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // Ir a editar el ejercicio que estás mirando
  if (accion === "editar-ejercicio") {
    vista = "editar-ejercicio";
    render();
  }

  // Volver del formulario a la pantalla de progreso
  if (accion === "volver-progreso") {
    vista = "progreso";
    render();
  }

  // Borrar alumno (con todo lo suyo)
  // (el sheet de "¿Borrar a …?" lo abre avisos.js; esto corre cuando tocás "Sí, borrar")
  if (accion === "confirmar-borrar-alumno") {
    const nombre = alumnoActual.nombre;

    boton.disabled = true;
    boton.textContent = "Borrando…";

    // "on delete cascade" en las tablas hace que se borren solos sus ejercicios y registros
    const respuesta = await db.from("alumnos").delete().eq("id", alumnoActual.id);

    if (respuesta.error) {
      alert("No se pudo borrar: " + respuesta.error.message);
      boton.disabled = false;
      boton.textContent = "🗑 Borrar alumno";
      return;
    }

    alumnos = alumnos.filter(a => a.id !== alumnoActual.id);
    alumnoActual = null;
    ejercicios = [];
    vista = "inicio";
    render();
    mostrarToast(`${nombre} fue eliminado de Reps`);
  }
});

// ── Guardar el ejercicio editado ──
document.addEventListener("submit", async (evento) => {
  const form = evento.target;
  if (form.id !== "form-editar-ejercicio") return;
  evento.preventDefault();

  const datos = Object.fromEntries(new FormData(form));
  const boton = form.querySelector("button[type=submit]");
  const mensaje = form.querySelector(".error");

  const cambios = {
    dia: datos.dia.trim(),
    nombre: datos.nombre.trim(),
    series: Math.max(1, Math.min(10, Number(datos.series) || 3)),
    reps: datos.reps.trim(),
  };

  boton.disabled = true;
  boton.textContent = "Guardando…";

  const respuesta = await db
    .from("ejercicios")
    .update(cambios)
    .eq("id", ejercicioActual.id)
    .select()
    .single();

  if (respuesta.error) {
    mensaje.textContent = "No se pudo guardar: " + respuesta.error.message;
    boton.disabled = false;
    boton.textContent = "Guardar cambios";
    return;
  }

  // Reemplazamos el ejercicio viejo por el editado
  ejercicios = ejercicios.map(e => (e.id === respuesta.data.id ? respuesta.data : e));
  ejercicioActual = respuesta.data;
  vista = "progreso";
  render();
});