// ─────────────────────────────────────────
// PERSONALIDAD: el saludo de Hoy y los récords 🏆
// Usa variables y funciones de app.js y avisos.js
// ─────────────────────────────────────────

// ── Tu nombre: lo guardás en Ajustes y queda en tu cuenta de Supabase (igual en todos tus dispositivos) ──
function nombreTrainer() {
  return (usuario && usuario.user_metadata && usuario.user_metadata.nombre) || "";
}

// ── El saludo cambia según la hora ──
function saludo() {
  const ahora = new Date();
  const h = ahora.getHours();
  const nombre = nombreTrainer();
  const coma = nombre ? `, ${nombre}` : "";

  if (h >= 5 && h < 12) {
    const dia = ahora.toLocaleDateString("es-AR", { weekday: "long" });
    return `¡Buen ${dia}${coma}!`;
  }
  if (h >= 12 && h < 20) return `Buenas tardes${coma}`;
  return `Buenas noches${coma}`;
}

// ─────────────────────────────────────────
// RÉCORDS: al guardar, ¿alguna serie superó el máximo de ese ejercicio?
// ─────────────────────────────────────────
async function buscarRecords(datos, ejerciciosSesion) {
  // El kg más alto que anotaste HOY en cada ejercicio
  const deHoy = ejerciciosSesion.map(ej => {
    const series = Object.values(datos[ej.id] || {});
    const kgs = series.map(s => numero(s.kg)).filter(k => k !== null && k > 0);
    return { ej, kg: kgs.length ? Math.max(...kgs) : null };
  }).filter(x => x.kg !== null);

  if (!deHoy.length) return [];

  // El máximo de antes de hoy, para esos mismos ejercicios
  const respuesta = await db
    .from("registros")
    .select("ejercicio_id, kg")
    .in("ejercicio_id", deHoy.map(x => x.ej.id))
    .lt("fecha", hoy());
  if (respuesta.error) return [];

  return deHoy.filter(({ ej, kg }) => {
    const antes = respuesta.data.filter(r => r.ejercicio_id === ej.id && r.kg !== null).map(r => r.kg);
    return antes.length > 0 && kg > Math.max(...antes);   // la primera vez no cuenta como récord
  });
}

function festejarRecords(records) {
  if (!records.length) return;
  const texto = records.length === 1
    ? `🏆 ¡Nuevo récord en ${records[0].ej.nombre}: ${records[0].kg} kg!`
    : `🏆 ¡${records.length} récords nuevos! ${records.map(r => `${r.ej.nombre} ${r.kg} kg`).join(" · ")}`;
  mostrarToast(texto);
  const toast = document.getElementById("toast-global");
  if (toast) toast.classList.add("record");
}

// "true" al final = este listener corre ANTES que el de app.js, así llegamos a copiar los datos
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton || boton.dataset.accion !== "guardar-sesion") return;

  // Copiamos lo anotado ANTES de que app.js lo borre al guardar
  const datos = JSON.parse(JSON.stringify(sesionDatos));
  const ejerciciosSesion = [...sesionEjercicios];
  const records = buscarRecords(datos, ejerciciosSesion);

  // Festejamos solo cuando el guardado terminó bien (la app sale de la pantalla de entrenamiento)
  let intentos = 0;
  const esperar = setInterval(async () => {
    intentos++;
    if (vista !== "sesion") {
      clearInterval(esperar);
      festejarRecords(await records);
    } else if (intentos > 40) {
      clearInterval(esperar);   // no se guardó: no festejamos nada
    }
  }, 250);
}, true);

// ─────────────────────────────────────────
// EDITAR TU NOMBRE (sheet desde Ajustes)
// ─────────────────────────────────────────
// La primera vez que entrás (si todavía no hay nombre guardado), te lo preguntamos solo una vez
let yaPreguntoNombre = false;
function preguntarNombreSiFalta() {
  if (yaPreguntoNombre || !usuario || nombreTrainer()) return;
  yaPreguntoNombre = true;
  abrirSheetNombre(true);
}

function abrirSheetNombre(primeraVez) {
  cerrarSheet();
  const fondo = document.createElement("div");
  fondo.className = "sheet-fondo";
  fondo.id = "sheet-fondo";
  fondo.dataset.accion = "cerrar-sheet-global";

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.id = "sheet";
  sheet.innerHTML = `
    <span class="sheet-manija"></span>
    <h2>${primeraVez ? "¡Hola! " : ""}¿Cómo te llamamos?</h2>
    <p>Lo usamos para personalizar tu experiencia. Lo podés cambiar cuando quieras en Ajustes.</p>
    <form id="form-nombre" class="form">
      <input name="nombre" required maxlength="30" autocomplete="given-name"
             value="${textoSeguro(nombreTrainer())}" placeholder="Tu nombre">
      <p class="error"></p>
      <button class="btn" type="submit">Guardar</button>
    </form>
  `;
  document.body.appendChild(fondo);
  document.body.appendChild(sheet);
  sheet.querySelector("input").focus();
}

document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (boton && boton.dataset.accion === "editar-nombre") abrirSheetNombre();
});

document.addEventListener("submit", async (evento) => {
  const form = evento.target;
  if (form.id !== "form-nombre") return;
  evento.preventDefault();

  const nombre = new FormData(form).get("nombre").trim();
  const respuesta = await db.auth.updateUser({ data: { nombre } });

  if (respuesta.error) {
    form.querySelector(".error").textContent = "No se pudo guardar: " + respuesta.error.message;
    form.querySelector("button").disabled = false;
    return;
  }

  usuario = respuesta.data.user;
  cerrarSheet();
  render();
  mostrarToast(`✓ ¡Listo, ${nombre}!`);
});
