// ─────────────────────────────────────────
// HOY: la pantalla de inicio de Reps
// Resumen del día + turnos del calendario + actividad reciente.
// Usa variables y funciones de app.js y agenda.js
// ─────────────────────────────────────────

let asignados = leerAsignados();  // "sofi" → id de Sofía R. (turnos que confirmaste)
let mensajeHoy = "";              // texto del toast

// ── Guardar qué nombre del calendario es qué alumno ──
function leerAsignados() {
  try {
    return JSON.parse(localStorage.getItem("reps-asignados")) || {};
  } catch {
    return {};
  }
}

function guardarAsignados() {
  try { localStorage.setItem("reps-asignados", JSON.stringify(asignados)); } catch {}
}

// ── Abrir Hoy (al entrar a la app o al iniciar sesión) ──
async function abrirHoy() {
  vista = "actividad";
  await cargarAlumnos();          // primero los alumnos: los turnos se buscan por nombre
  if (typeof preguntarNombreSiFalta === "function") preguntarNombreSiFalta();
  cargarActividad();
  if (tokenGoogle) cargarAgenda();
}

// ── Ayudantes ──
function fechaDeHoy() {
  const texto = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function haceCuanto(fecha) {
  const dias = Math.round((new Date(hoy()) - new Date(fecha)) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

// ¿Qué hizo este alumno la última vez?
function ultimaSesion(alumnoId) {
  const sesiones = actividad.filter(a => a.alumnoId === alumnoId);
  if (!sesiones.length) return "Sin entrenamientos todavía";
  const ultima = sesiones.reduce((a, b) => (b.fecha > a.fecha ? b : a));
  const dias = [...ultima.dias].join(" · ") || "Entrenamiento";
  return `Último: ${dias} · ${haceCuanto(ultima.fecha)}`;
}

// El alumno de un turno: el que encontró agenda.js, o el que confirmaste vos
function alumnoDelTurno(evento) {
  if (evento.alumno) return evento.alumno;
  const nombre = nombreCandidato(evento.titulo);
  if (!nombre) return null;
  const id = asignados[sinTildes(nombre)];
  return alumnos.find(a => a.id === id) || null;
}

// "Sofi" se parece a "Sofía R." → devuelve a Sofía R.
function alumnoParecido(nombre) {
  const buscado = sinTildes(nombre).split(/\s+/)[0];
  if (buscado.length < 3) return null;
  return alumnos.find(a => {
    const primero = sinTildes(a.nombre).split(/\s+/)[0];
    return primero.startsWith(buscado) || buscado.startsWith(primero);
  }) || null;
}

// ── Separar los turnos: con alumno / sin asignar ──
function turnosDeHoy() {
  const conAlumno = [];
  const sinAsignar = [];
  const yaVistos = new Set();

  agenda.eventos.forEach(e => {
    const alumno = alumnoDelTurno(e);
    if (alumno) {
      conAlumno.push({ ...e, alumno });
      return;
    }
    const nombre = nombreCandidato(e.titulo);
    if (!nombre) return;                                   // no parece un turno
    const clave = sinTildes(nombre);
    if (ignorados.includes(clave) || yaVistos.has(clave)) return;
    yaVistos.add(clave);
    sinAsignar.push({ ...e, nombre, clave, parecido: alumnoParecido(nombre) });
  });

  return { conAlumno, sinAsignar };
}

// ── Tarjetas ──
function tarjetaTurno(t) {
  return `
    <button class="card turno" data-accion="abrir" data-id="${t.alumno.id}">
      <div class="hora">${t.inicio ? hora(t.inicio) : "Todo<br>el día"}</div>
      <div class="turno-texto">
        <h3>${textoSeguro(t.alumno.nombre)}</h3>
        <p>${textoSeguro(ultimaSesion(t.alumno.id))}</p>
      </div>
      <span class="chev">›</span>
    </button>
  `;
}

function tarjetaSinAsignar(t) {
  const horario = t.inicio ? hora(t.inicio) : "Todo el día";

  // Hay un alumno con un nombre parecido → preguntamos si es esa persona
  if (t.parecido) {
    return `
      <div class="card sin-asignar">
        <h3>${horario} · ${textoSeguro(t.nombre)}</h3>
        <p>¿Es <strong>${textoSeguro(t.parecido.nombre)}</strong>? Confirmá y la clase queda asignada a su rutina.</p>
        <div class="acciones-fila">
          <button class="btn-chico" data-accion="asignar-turno" data-clave="${t.clave}" data-id="${t.parecido.id}">Sí, es ${textoSeguro(t.parecido.nombre.split(" ")[0])}</button>
          <button class="btn-chico fantasma" data-accion="crear-desde-agenda" data-nombre="${textoSeguro(t.nombre)}">Es otra persona</button>
        </div>
        <button class="link chico" data-accion="ignorar-candidato" data-nombre="${textoSeguro(t.nombre)}">Ignorar esta clase</button>
      </div>
    `;
  }

  // No se parece a nadie → ¿lo creamos?
  return `
    <div class="card sin-asignar">
      <h3>${horario} · ${textoSeguro(t.nombre)}</h3>
      <p>Todavía no está en Reps. ¿Es un alumno nuevo?</p>
      <div class="acciones-fila">
        <button class="btn-chico" data-accion="crear-desde-agenda" data-nombre="${textoSeguro(t.nombre)}">+ Crear alumno</button>
        <button class="btn-chico fantasma" data-accion="ignorar-candidato" data-nombre="${textoSeguro(t.nombre)}">No es alumno</button>
      </div>
    </div>
  `;
}

// ── La sección de agenda, según el estado de la conexión ──
function agendaHoy() {
  if (tokenGoogle && tokenGoogle.vence < Date.now()) {
    tokenGoogle = null;
    guardarToken(null);
  }

  // Ya lo conectaste antes y solo venció el permiso de 1 hora → un botón chico
  if (!tokenGoogle && yaConectoGoogle()) {
    return `
      <div class="card agenda-actualizar">
        <div>
          <h3>📅 Clases de hoy</h3>
          <p>Google pide renovar la conexión cada hora.</p>
        </div>
        <button class="btn-chico" data-accion="reconectar-google">Actualizar</button>
      </div>
      ${agenda.error ? `<p class="error">${textoSeguro(agenda.error)}</p>` : ""}
    `;
  }

  if (!tokenGoogle) {
    return `
      <div class="card agenda-conectar">
        <div>
          <h3>📅 Clases de hoy</h3>
          <p>Conectá tu Google Calendar y Reps te muestra a qué alumnos entrenás hoy.</p>
        </div>
        ${agenda.error ? `<p class="error">${textoSeguro(agenda.error)}</p>` : ""}
        <button class="btn" data-accion="conectar-google">Conectar Google Calendar</button>
      </div>
    `;
  }

  if (agenda.cargando && !agenda.cargada) {
    return `<p class="subtitulo">Buscando tus clases…</p>`;
  }

  if (agenda.error) {
    return `
      <p class="error">${textoSeguro(agenda.error)}</p>
      <button class="btn secundario" data-accion="conectar-google">Reconectar</button>
    `;
  }

  if (!agenda.cargada) return "";

  const { conAlumno, sinAsignar } = turnosDeHoy();
  const total = conAlumno.length + sinAsignar.length;

  const resumen = `
    <div class="resumen-hoy">
      <p><strong>${total}</strong> ${total === 1 ? "clase" : "clases"} hoy</p>
      <p><strong>${sinAsignar.length}</strong> sin asignar</p>
    </div>
  `;

  if (!total) {
    return resumen + `<p class="vacio">Hoy no tenés clases.<br>Buen momento para armar rutinas.</p>`;
  }

  // Todos los turnos por horario, mezclando asignados y sin asignar
  const todos = [
    ...conAlumno.map(t => ({ ...t, html: tarjetaTurno(t) })),
    ...sinAsignar.map(t => ({ ...t, html: tarjetaSinAsignar(t) })),
  ].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  return resumen + `
    <h3 class="sec-title">Agenda de hoy</h3>
    <div class="lista">${todos.map(t => t.html).join("")}</div>
  `;
}

// ── Actividad reciente: las últimas 3 sesiones ──
function actividadReciente() {
  if (cargandoActividad && !actividad.length) return `<p class="subtitulo">Cargando actividad…</p>`;
  if (!actividad.length) return `
    <h3 class="sec-title">Actividad reciente</h3>
    <p class="vacio">Acá vas a ver los últimos entrenamientos de tus alumnos.</p>
  `;

  const ultimas = [...actividad]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 3)
    .map(a => {
      const alumno = alumnos.find(x => x.id === a.alumnoId);
      if (!alumno) return "";
      const dias = [...a.dias].join(" · ") || "Entrenamiento";
      return `
        <button class="card" data-accion="abrir" data-id="${alumno.id}">
          <div class="avatar">${iniciales(alumno.nombre)}</div>
          <div>
            <h3>${textoSeguro(alumno.nombre)}</h3>
            <p>${textoSeguro(dias)} · ${a.series} series · ${haceCuanto(a.fecha)}</p>
          </div>
        </button>
      `;
    }).join("");

  return `
    <div class="agenda-top">
      <h3 class="sec-title">Actividad reciente</h3>
      <button class="link chico" data-accion="ver-actividad">Ver todo</button>
    </div>
    <div class="lista">${ultimas}</div>
  `;
}

// ── Pantalla Hoy ──
function pantallaHoy() {
  // El mensaje se muestra una vez como toast y se borra
  const texto = mensajeHoy || agenda.mensaje;
  mensajeHoy = "";
  agenda.mensaje = "";

  return `
    <h1 class="titulo saludo">${textoSeguro(saludo())}</h1>
    <p class="subtitulo">${fechaDeHoy()}</p>
    ${tarjetaBorrador()}
    ${agendaHoy()}
    ${actividadReciente()}
    ${texto ? `<div class="toast" role="status">${textoSeguro(texto)}</div>` : ""}
  `;
}

// ── Botones ──
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // "Sí, es ella": guardamos que ese nombre del calendario es ese alumno
  if (accion === "asignar-turno") {
    const alumno = alumnos.find(a => a.id === Number(boton.dataset.id));
    asignados[boton.dataset.clave] = alumno.id;
    guardarAsignados();
    mensajeHoy = `✓ Clase asignada a ${alumno.nombre}`;
    render();
  }

  if (accion === "ver-actividad") {
    vista = "actividad-todo";
    render();
  }

  if (accion === "volver-hoy") {
    vista = "actividad";
    render();
  }
});
