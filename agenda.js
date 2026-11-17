// ─────────────────────────────────────────
// AGENDA: turnos de hoy desde Google Calendar
// Usa variables y funciones de app.js y nutricion.js
// ─────────────────────────────────────────

const GOOGLE_CLIENT_ID = "590731900236-psioc3jdli2q13dcs4r9fk7obtuqo8qd.apps.googleusercontent.com;"   // 👈
const PERMISO_CALENDARIO = "https://www.googleapis.com/auth/calendar.readonly";  // solo lectura

let tokenGoogle = leerToken();   // el "permiso" que te da Google (dura 1 hora)
let agenda = nuevaAgenda();

function nuevaAgenda() {
  return { eventos: [], cargada: false, cargando: false, error: "" };
}

// ─────────────────────────────────────────
// 1. GUARDAR EL PERMISO (así no te lo pide en cada recarga)
// ─────────────────────────────────────────
function leerToken() {
  try {
    const t = JSON.parse(localStorage.getItem("reps-google"));
    return t && t.vence > Date.now() ? t : null;   // si venció, no sirve
  } catch {
    return null;
  }
}

function guardarToken(t) {
  try {
    if (t) localStorage.setItem("reps-google", JSON.stringify(t));
    else localStorage.removeItem("reps-google");
  } catch {}
}

// ─────────────────────────────────────────
// 2. AYUDANTES
// ─────────────────────────────────────────

// "Lucía" → "lucia" (para comparar sin tildes ni mayúsculas)
function sinTildes(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// "2026-11-17T18:00:00-03:00" → "18:00"
function hora(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// Busca qué alumno aparece en el título del evento
function alumnoDelEvento(titulo) {
  const t = sinTildes(titulo);

  // 1° intento: el nombre completo ("Laura P." en "Entreno Laura P.")
  const completo = alumnos.find(a => t.includes(sinTildes(a.nombre)));
  if (completo) return completo;

  // 2° intento: solo el primer nombre como palabra suelta ("Laura" en "Entreno Laura")
  return alumnos.find(a => {
    const primero = sinTildes(a.nombre).split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    return primero.length > 1 && new RegExp(`\\b${primero}\\b`).test(t);
  }) || null;
}

// ─────────────────────────────────────────
// 3. CONECTAR CON GOOGLE
//    Abre la ventanita de Google; cuando aceptás, nos da un permiso (token)
// ─────────────────────────────────────────
function conectarGoogle() {
  if (typeof google === "undefined" || !google.accounts) {
    agenda.error = "No se cargó la librería de Google. Recargá la página.";
    render();
    return;
  }

  const cliente = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: PERMISO_CALENDARIO,
    callback: (respuesta) => {
      if (respuesta.error) {
        agenda.error = "Google no dio permiso (" + respuesta.error + ").";
        render();
        return;
      }
      tokenGoogle = {
        valor: respuesta.access_token,
        vence: Date.now() + (Number(respuesta.expires_in) - 60) * 1000,   // 1 minuto de margen
      };
      guardarToken(tokenGoogle);
      cargarAgenda();
    },
    error_callback: () => {
      agenda.error = "Se cerró la ventana de Google antes de terminar.";
      render();
    },
  });

  cliente.requestAccessToken();
}

// ─────────────────────────────────────────
// 4. LEER LOS EVENTOS DE HOY
// ─────────────────────────────────────────
async function cargarAgenda() {
  if (!tokenGoogle) return;

  agenda.cargando = true;
  agenda.error = "";
  render();

  // Desde las 00:00 hasta las 23:59 de hoy
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const fin = new Date();    fin.setHours(23, 59, 59, 999);

  const parametros = new URLSearchParams({
    timeMin: inicio.toISOString(),
    timeMax: fin.toISOString(),
    singleEvents: "true",      // los eventos que se repiten, separados por día
    orderBy: "startTime",
    maxResults: "100",
  });

  try {
    const respuesta = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + parametros,
      { headers: { Authorization: "Bearer " + tokenGoogle.valor } }   // "acá está mi permiso"
    );

    // 401 = el permiso venció
    if (respuesta.status === 401) {
      tokenGoogle = null;
      guardarToken(null);
      agenda = nuevaAgenda();
      agenda.error = "La conexión con Google venció. Volvé a conectar.";
      render();
      return;
    }
    if (!respuesta.ok) throw new Error("Google respondió " + respuesta.status);

    const datos = await respuesta.json();
    agenda.eventos = (datos.items || [])
      .filter(ev => ev.status !== "cancelled")
      .map(ev => ({
        titulo: ev.summary || "(sin título)",
        inicio: ev.start.dateTime || null,    // null = evento de todo el día
        alumno: alumnoDelEvento(ev.summary),
      }));
    agenda.cargada = true;

  } catch (e) {
    agenda.error = "No se pudo leer el calendario: " + e.message;
  }

  agenda.cargando = false;
  render();
}

// ─────────────────────────────────────────
// 5. LA SECCIÓN "HOY EN TU AGENDA"
// ─────────────────────────────────────────
function seccionAgenda() {
  // Si el permiso venció mientras la app estaba abierta
  if (tokenGoogle && tokenGoogle.vence < Date.now()) {
    tokenGoogle = null;
    guardarToken(null);
  }

  // Sin conectar: invitación
  if (!tokenGoogle) {
    return `
      <div class="card agenda-conectar">
        <div>
          <h3>📅 Turnos de hoy</h3>
          <p>Conectá tu Google Calendar y Reps te muestra a qué alumnos entrenás hoy.</p>
        </div>
        ${agenda.error ? `<p class="error">${textoSeguro(agenda.error)}</p>` : ""}
        <button class="btn" data-accion="conectar-google">Conectar Google Calendar</button>
      </div>
    `;
  }

  if (agenda.cargando) {
    return `<h3 class="sec-title">Hoy en tu agenda</h3><p class="subtitulo">Buscando tus turnos…</p>`;
  }

  if (agenda.error) {
    return `
      <h3 class="sec-title">Hoy en tu agenda</h3>
      <p class="error">${textoSeguro(agenda.error)}</p>
      <button class="btn secundario" data-accion="conectar-google">Reconectar</button>
    `;
  }

  if (!agenda.cargada) return "";

  const conAlumno = agenda.eventos.filter(e => e.alumno);
  const otros = agenda.eventos.length - conAlumno.length;

  const tarjetas = conAlumno.map(e => `
    <button class="card" data-accion="abrir" data-id="${e.alumno.id}">
      <div class="hora">${e.inicio ? hora(e.inicio) : "Todo<br>el día"}</div>
      <div>
        <h3>${textoSeguro(e.alumno.nombre)}</h3>
        <p>${textoSeguro(e.titulo)}</p>
      </div>
    </button>
  `).join("");

  return `
    <div class="agenda-top">
      <h3 class="sec-title">Hoy en tu agenda</h3>
      <button class="link chico" data-accion="desconectar-google">Desconectar</button>
    </div>
    ${conAlumno.length
      ? `<div class="lista">${tarjetas}</div>`
      : `<p class="vacio">Hoy no hay turnos con nombres de alumnos.</p>`}
    ${otros ? `<p class="ayuda">+ ${otros} ${otros === 1 ? "evento" : "eventos"} más en tu calendario</p>` : ""}
  `;
}

// ─────────────────────────────────────────
// 6. BOTONES
// ─────────────────────────────────────────
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  if (accion === "conectar-google") {
    agenda.error = "";
    conectarGoogle();   // importante: se llama directo desde el clic, si no el navegador bloquea la ventana
  }

  if (accion === "desconectar-google") {
    tokenGoogle = null;
    guardarToken(null);
    agenda = nuevaAgenda();
    render();
  }

  // Cada vez que entrás a Actividad, actualiza la agenda
  if (accion === "ir" && boton.dataset.destino === "actividad" && tokenGoogle) {
    cargarAgenda();
  }
});