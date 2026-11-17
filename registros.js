// ─────────────────────────────────────────
// REGISTROS: corregir o eliminar una sesión ya guardada
// (por ejemplo, si anotaste 600 kg en vez de 60)
// Usa variables y funciones de app.js y avisos.js
// ─────────────────────────────────────────

let registroFecha = null;   // la fecha de la sesión que estás corrigiendo

function sesionDelRegistro() {
  return historial.find(s => s.fecha === registroFecha);
}

// ── Pantalla: corregir registro ──
function pantallaRegistro() {
  const ej = ejercicioActual;
  const sesion = sesionDelRegistro();
  const volver = `<button class="volver" type="button" data-accion="volver-progreso">← ${textoSeguro(ej.nombre)}</button>`;

  if (!sesion) return volver + `<p class="vacio">Este registro ya no existe.</p>`;

  const filas = sesion.series.map(r => `
    <span class="n">${r.serie}</span>
    <input data-reg="${r.id}" data-dato="kg" inputmode="decimal" value="${r.kg ?? ""}" placeholder="kg">
    <input data-reg="${r.id}" data-dato="reps" inputmode="numeric" value="${r.reps ?? ""}" placeholder="reps">
  `).join("");

  return `
    ${volver}
    <h1 class="titulo">Registro del ${fechaLarga(sesion.fecha)}</h1>
    <p class="subtitulo">${textoSeguro(ej.nombre)} · ${textoSeguro(partesDelDia(ej.dia, 0).corto)}</p>

    <div class="card sesion-ej">
      <div class="series">
        <span class="h">Serie</span><span class="h">Kg</span><span class="h">Reps</span>
        ${filas}
      </div>
    </div>

    <p class="ayuda izq">Si dejás kg y reps vacíos, esa serie se borra. Los récords y el gráfico se recalculan al guardar.</p>

    <div class="lista">
      <button class="btn" data-accion="guardar-registro">Guardar corrección</button>
      <button class="btn peligro" data-accion="eliminar-registro">Eliminar este registro</button>
    </div>
  `;
}

// ── Guardar los cambios ──
async function guardarRegistro(boton) {
  const sesion = sesionDelRegistro();
  const cambios = [];
  const aBorrar = [];

  sesion.series.forEach(r => {
    const kgTexto = document.querySelector(`[data-reg="${r.id}"][data-dato="kg"]`).value;
    const repsTexto = document.querySelector(`[data-reg="${r.id}"][data-dato="reps"]`).value;
    const kg = numero(kgTexto);
    const reps = numero(repsTexto);

    if (kg === null && reps === null) {
      aBorrar.push(r.id);
    } else if (kg !== r.kg || reps !== r.reps) {
      cambios.push({ id: r.id, kg, reps: reps === null ? null : Math.round(reps) });
    }
  });

  if (!cambios.length && !aBorrar.length) {
    vista = "progreso";
    render();
    return;
  }

  boton.disabled = true;
  boton.textContent = "Guardando…";

  // .select() nos devuelve las filas que cambiaron: si vuelve vacío, Supabase no dio permiso
  for (const c of cambios) {
    const r = await db.from("registros").update({ kg: c.kg, reps: c.reps }).eq("id", c.id).select();
    if (r.error) return falloRegistro(boton, r.error.message);
    if (!r.data.length) return falloRegistro(boton, "Supabase no dio permiso para modificar registros.");
  }
  if (aBorrar.length) {
    const r = await db.from("registros").delete().in("id", aBorrar).select();
    if (r.error) return falloRegistro(boton, r.error.message);
    if (!r.data.length) return falloRegistro(boton, "Supabase no dio permiso para borrar registros.");
  }

  vista = "progreso";
  await cargarHistorial();
  mostrarToast("✓ Registro corregido");
}

function falloRegistro(boton, mensaje) {
  boton.disabled = false;
  boton.textContent = "Guardar corrección";
  mostrarToast("No se pudo guardar: " + mensaje);
}

// ── Eliminar la sesión entera de este ejercicio ──
async function eliminarRegistro() {
  const fecha = registroFecha;
  const respuesta = await db
    .from("registros")
    .delete()
    .eq("ejercicio_id", ejercicioActual.id)
    .eq("fecha", fecha)
    .select();

  if (respuesta.error) {
    mostrarToast("No se pudo eliminar: " + respuesta.error.message);
    return;
  }
  if (!respuesta.data.length) {
    mostrarToast("No se pudo eliminar: Supabase no dio permiso para borrar registros.");
    return;
  }

  vista = "progreso";
  await cargarHistorial();
  mostrarToast(`Registro del ${fechaLarga(fecha)} eliminado`);
}

// ── Botones ──
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // Tocar una sesión del historial
  if (accion === "abrir-registro") {
    registroFecha = boton.dataset.fecha;
    vista = "registro";
    render();
  }

  if (accion === "guardar-registro") {
    guardarRegistro(boton);
  }

  if (accion === "eliminar-registro") {
    const sesion = sesionDelRegistro();
    pedirConfirmacion({
      titulo: "¿Eliminar este registro?",
      texto: `Se borran las <strong>${sesion.series.length} series</strong> de ${textoSeguro(ejercicioActual.nombre)} del ${fechaLarga(sesion.fecha)}. El progreso se recalcula. No se puede deshacer.`,
      no: "Conservar registro",
      si: "Sí, eliminar registro",
      accion: "confirmar-eliminar-registro",
      peligro: true,
    });
  }

  if (accion === "confirmar-eliminar-registro") {
    eliminarRegistro();
  }
});
