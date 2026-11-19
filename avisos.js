// ─────────────────────────────────────────
// AVISOS: bottom sheets para confirmar y toasts para avisar
// Reemplazan a las ventanitas confirm() y alert() del navegador.
// Viven afuera de #app, así no se borran cuando la pantalla se vuelve a dibujar.
// ─────────────────────────────────────────

// ── Toast: un mensajito abajo que se va solo ──
function mostrarToast(texto) {
  const viejo = document.getElementById("toast-global");
  if (viejo) viejo.remove();

  const toast = document.createElement("div");
  toast.id = "toast-global";
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = texto;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4100);
}

// ── Sheet de confirmación ──
// Ejemplo: pedirConfirmacion({ titulo: "¿Borrar?", texto: "…", si: "Sí, borrar",
//          no: "Cancelar", accion: "confirmar-borrar-alumno", id: 3, peligro: true })
function pedirConfirmacion(opciones) {
  cerrarSheet();

  const fondo = document.createElement("div");
  fondo.className = "sheet-fondo";
  fondo.id = "sheet-fondo";
  fondo.dataset.accion = "cerrar-sheet-global";

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.id = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.innerHTML = `
    <span class="sheet-manija"></span>
    <h2>${opciones.titulo}</h2>
    <p>${opciones.texto}</p>
    <button class="btn" data-accion="cerrar-sheet-global">${opciones.no}</button>
    <button class="btn ${opciones.peligro ? "peligro" : "secundario"}"
            data-accion="${opciones.accion}" data-id="${opciones.id ?? ""}">${opciones.si}</button>
  `;

  document.body.appendChild(fondo);
  document.body.appendChild(sheet);
}

function cerrarSheet() {
  ["sheet", "sheet-fondo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

// ── Qué botón abre qué sheet ──
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // La ✕ de un ejercicio en la rutina
  if (accion === "borrar-ejercicio") {
    const ej = ejercicios.find(e => e.id === Number(boton.dataset.id));
    pedirConfirmacion({
      titulo: `¿Quitar ${textoSeguro(ej.nombre)}?`,
      texto: `Se quita de <strong>${textoSeguro(ej.dia)}</strong> y también se borra su historial de series. No se puede deshacer.`,
      no: "Conservar ejercicio",
      si: "Sí, quitar de la rutina",
      accion: "confirmar-borrar-ejercicio",
      id: ej.id,
      peligro: true,
    });
  }

  // "Borrar alumno" en Perfil
  if (accion === "borrar-alumno") {
    const nombre = textoSeguro(alumnoActual.nombre);
    pedirConfirmacion({
      titulo: `¿Borrar a ${nombre}?`,
      texto: `Se borran su ficha, su rutina, su historial y sus objetivos de nutrición. Los eventos de tu calendario no se tocan. <strong>No se puede deshacer.</strong>`,
      no: "Conservar alumno",
      si: `Sí, borrar a ${nombre}`,
      accion: "confirmar-borrar-alumno",
      peligro: true,
    });
  }

  // "Cerrar sesión" en Ajustes
  if (accion === "salir") {
    const hayBorrador = typeof leerBorrador === "function" && leerBorrador();
    pedirConfirmacion({
      titulo: "¿Cerrar sesión?",
      texto: `Vas a salir de <strong>${textoSeguro(usuario ? usuario.email : "tu cuenta")}</strong>.` +
        (hayBorrador ? " Tenés un entrenamiento sin terminar: queda guardado en este teléfono." : ""),
      no: "Seguir en Reps",
      si: "Cerrar sesión",
      accion: "confirmar-salir",
      peligro: true,
    });
  }

  // Cancelar, o tocar el fondo oscuro
  if (accion === "cerrar-sheet-global") {
    cerrarSheet();
  }

  // Cualquier "Sí" cierra el sheet (lo que hace cada uno está en su archivo)
  if (accion.startsWith("confirmar-")) {
    cerrarSheet();
  }
});

// La tecla Esc también cierra el sheet (útil en la compu)
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") cerrarSheet();
});
