// ─────────────────────────────────────────
// ASIGNACIONES EN LA NUBE
// Qué nombre del calendario es qué alumno ("sofi" → Sofía R.) y qué nombres ignoraste.
// Antes vivía solo en el teléfono; ahora se guarda también en Supabase,
// así aparece igual en cualquier dispositivo.
// Tabla: asignaciones (clave, alumno_id). alumno_id vacío = "no es alumno" (ignorado).
// Usa variables de hoy.js (asignados) y agenda.js (ignorados)
// ─────────────────────────────────────────

// Trae lo guardado en la nube y lo mezcla con lo del teléfono
async function cargarAsignaciones() {
  const respuesta = await db.from("asignaciones").select("clave, alumno_id");
  if (respuesta.error) return;   // si falla, seguimos con lo que hay en el teléfono

  const enLaNube = new Set();
  respuesta.data.forEach(fila => {
    enLaNube.add(fila.clave);
    if (fila.alumno_id) asignados[fila.clave] = fila.alumno_id;
    else if (!ignorados.includes(fila.clave)) ignorados.push(fila.clave);
  });

  // Lo que estaba solo en este teléfono (de antes de esta versión) lo subimos una vez
  const pendientes = [
    ...Object.entries(asignados).filter(([clave]) => !enLaNube.has(clave)).map(([clave, id]) => ({ clave, alumno_id: id })),
    ...ignorados.filter(clave => !enLaNube.has(clave)).map(clave => ({ clave, alumno_id: null })),
  ];
  if (pendientes.length) {
    await db.from("asignaciones").upsert(pendientes, { onConflict: "trainer_id,clave" });
  }

  guardarAsignados();
  guardarIgnorados();
  if (vista === "actividad") render();
}

// Guarda una sola asignación (o un ignorado, con alumnoId = null)
async function guardarEnLaNube(clave, alumnoId) {
  const respuesta = await db.from("asignaciones")
    .upsert({ clave, alumno_id: alumnoId }, { onConflict: "trainer_id,clave" });
  if (respuesta.error) console.warn("No se pudo guardar la asignación en la nube:", respuesta.error.message);
}
