// ─────────────────────────────────────────
// AGENDA: turnos de hoy desde Google Calendar
// Usa variables y funciones de app.js y nutricion.js
// ─────────────────────────────────────────

const GOOGLE_CLIENT_ID = "590731900236-psioc3jdli2q13dcs4r9fk7obtuqo8qd.apps.googleusercontent.com";   // 👈
const PERMISO_CALENDARIO = "https://www.googleapis.com/auth/calendar.readonly";  // solo lectura

let tokenGoogle = leerToken();   // el "permiso" que te da Google (dura 1 hora)
let agenda = nuevaAgenda();
let ignorados = leerIgnorados(); // nombres que dijiste "no es alumno"

function nuevaAgenda() {
  return { eventos: [], cargada: false, cargando: false, error: "", mensaje: "" };
}

// ─────────────────────────────────────────
// 1. GUARDAR EL PERMISO Y LOS IGNORADOS EN EL NAVEGADOR
// ─────────────────────────────────────────
function leerToken() {
  try {
    const t = JSON.parse(localStorage.getItem("reps-google"));
    return t && t.vence > Date.now() ? t : null;
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

function leerIgnorados() {
  try {
    return JSON.parse(localStorage.getItem("reps-ignorados")) || [];
  } catch {
    return [];
  }
}

function guardarIgnorados() {
  try { localStorage.setItem("reps-ignorados", JSON.stringify(ignorados)); } catch {}
}

// ─────────────────────────────────────────
// 2. AYUDANTES
// ─────────────────────────────────────────
function sinTildes(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ¿Qué alumno aparece en el título del evento?
function alumnoDelEvento(titulo) {
  const t = sinTildes(titulo);

  const completo = alumnos.find(a => t.includes(sinTildes(a.nombre)));
  if (completo) return completo;

  return alumnos.find(a => {
    const primero = sinTildes(a.nombre).split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    return primero.length > 1 && new RegExp(`\\b${primero}\\b`).test(t);
  }) || null;
}

// Palabras típicas de un turno (sin tildes)
const PALABRAS_TURNO = ["entreno", "entrenamiento", "entrenar", "clase", "turno", "sesion", "personal", "pt", "gym", "rutina", "con"];

// "Entreno - Sofía" → "Sofía" · "Dentista 15hs" → null
// Devuelve el nombre si el evento parece un turno con alguien, o null si no
function nombreCandidato(titulo) {
  const palabras = String(titulo || "")
    .replace(/[-–—:·|()\/]/g, " ")      // separadores → espacios
    .split(/\s+/)
    .filter(Boolean);

  const esClave = p => PALABRAS_TURNO.includes(sinTildes(p));
  const tieneClave = palabras.some(esClave);
  const resto = palabras.filter(p => !esClave(p));   // lo que queda: el nombre

  if (!resto.length || resto.length > 3) return null;   // nada o demasiado largo
  if (resto.some(p => /\d/.test(p))) return null;       // con números, no es un nombre

  const pareceNombre = resto.every(p => /^[A-ZÁÉÍÓÚÑ]/.test(p));   // Empieza con mayúscula
  if (!tieneClave && !pareceNombre) return null;

  // "sofía" → "Sofía"
  return resto.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// ─────────────────────────────────────────
// 3. CONECTAR CON GOOGLE
// ─────────────────────────────────────────
// ¿Ya conectaste Google alguna vez en este dispositivo? (aunque el permiso de 1 hora haya vencido)
function yaConectoGoogle() {
  try { return localStorage.getItem("reps-google-ya") === "1"; } catch { return false; }
}

// silencioso = true → no vuelve a preguntar nada: Google ya sabe que diste permiso
function conectarGoogle(silencioso) {
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
        vence: Date.now() + (Number(respuesta.expires_in) - 60) * 1000,
      };
      guardarToken(tokenGoogle);
      try { localStorage.setItem("reps-google-ya", "1"); } catch {}
      cargarAgenda();
    },
    error_callback: () => {
      agenda.error = "Se cerró la ventana de Google antes de terminar.";
      render();
    },
  });

  cliente.requestAccessToken(silencioso ? { prompt: "" } : {});
}

// ─────────────────────────────────────────
// 4. LEER LOS EVENTOS DE HOY
// ─────────────────────────────────────────
async function cargarAgenda() {
  if (!tokenGoogle) return;

  agenda.cargando = true;
  agenda.error = "";
  render();

  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const fin = new Date();    fin.setHours(23, 59, 59, 999);

  const parametros = new URLSearchParams({
    timeMin: inicio.toISOString(),
    timeMax: fin.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  try {
    const respuesta = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + parametros,
      { headers: { Authorization: "Bearer " + tokenGoogle.valor } }
    );

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
        titulo: ev.summary || "",
        inicio: ev.start.dateTime || null,
        alumno: alumnoDelEvento(ev.summary),
      }));
    agenda.cargada = true;

  } catch (e) {
    agenda.error = "No se pudo leer el calendario: " + e.message;
  }

  agenda.cargando = false;
  render();
}

// Después de crear un alumno, volvemos a buscar alumnos en los eventos
function reconectarEventos() {
  agenda.eventos.forEach(e => {
    if (!e.alumno) e.alumno = alumnoDelEvento(e.titulo);
  });
}

// ─────────────────────────────────────────
// 5. LA SECCIÓN "HOY EN TU AGENDA"
// ─────────────────────────────────────────
function seccionAgenda() {
  if (tokenGoogle && tokenGoogle.vence < Date.now()) {
    tokenGoogle = null;
    guardarToken(null);
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

  if (agenda.cargando) {
    return `<h3 class="sec-title">Hoy en tu agenda</h3><p class="subtitulo">Buscando tus clases…</p>`;
  }

  if (agenda.error) {
    return `
      <h3 class="sec-title">Hoy en tu agenda</h3>
      <p class="error">${textoSeguro(agenda.error)}</p>
      <button class="btn secundario" data-accion="conectar-google">Reconectar</button>
    `;
  }

  if (!agenda.cargada) return "";

  // ── Turnos con alumnos que ya existen ──
  const turnos = agenda.eventos.filter(e => e.alumno);

  const tarjetasTurnos = turnos.map(e => `
    <button class="card" data-accion="abrir" data-id="${e.alumno.id}">
      <div class="hora">${e.inicio ? hora(e.inicio) : "Todo<br>el día"}</div>
      <div>
        <h3>${textoSeguro(e.alumno.nombre)}</h3>
        <p>${textoSeguro(e.titulo)}</p>
      </div>
    </button>
  `).join("");

  // ── Posibles alumnos nuevos (sin repetir y sin los ignorados) ──
  const yaVistos = new Set();
  const candidatos = [];
  agenda.eventos.filter(e => !e.alumno).forEach(e => {
    const nombre = nombreCandidato(e.titulo);
    if (!nombre) return;
    const clave = sinTildes(nombre);
    if (ignorados.includes(clave) || yaVistos.has(clave)) return;
    yaVistos.add(clave);
    candidatos.push({ ...e, nombre });
  });

  const tarjetasCandidatos = candidatos.map(c => `
    <div class="card candidato">
      <div class="hora">${c.inicio ? hora(c.inicio) : "Todo<br>el día"}</div>
      <div class="cand-texto">
        <h3>${textoSeguro(c.nombre)}</h3>
        <p>${textoSeguro(c.titulo)}</p>
      </div>
      <div class="cand-acciones">
        <button class="btn-chico" data-accion="crear-desde-agenda" data-nombre="${textoSeguro(c.nombre)}">+ Crear</button>
        <button class="btn-chico fantasma" data-accion="ignorar-candidato" data-nombre="${textoSeguro(c.nombre)}">Ignorar</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="agenda-top">
      <h3 class="sec-title">Hoy en tu agenda</h3>
      <button class="link chico" data-accion="desconectar-google">Desconectar</button>
    </div>

    ${agenda.mensaje ? `<div class="aviso">${textoSeguro(agenda.mensaje)}</div>` : ""}

    ${turnos.length
      ? `<div class="lista">${tarjetasTurnos}</div>`
      : `<p class="vacio">Hoy no hay clases con alumnos de Reps.</p>`}

    ${candidatos.length ? `
      <h3 class="sec-title">¿Alumnos nuevos?</h3>
      <p class="ayuda izq">Estas clases tienen nombres que todavía no están en Reps.</p>
      <div class="lista">${tarjetasCandidatos}</div>
    ` : ""}
  `;
}

// ─────────────────────────────────────────
// 6. BOTONES
// ─────────────────────────────────────────
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  if (accion === "conectar-google") {
    agenda.error = "";
    conectarGoogle();   // se llama directo desde el clic, si no el navegador bloquea la ventana
  }

  if (accion === "reconectar-google") {
    agenda.error = "";
    conectarGoogle(true);   // también directo desde el clic, para que no se bloquee la ventanita
  }

  if (accion === "desconectar-google") {
    tokenGoogle = null;
    guardarToken(null);
    try { localStorage.removeItem("reps-google-ya"); } catch {}
    agenda = nuevaAgenda();
    render();
  }

  if (accion === "ir" && boton.dataset.destino === "actividad" && tokenGoogle) {
    agenda.mensaje = "";
    cargarAgenda();
  }

  // ── Crear un alumno desde la agenda ──
  if (accion === "crear-desde-agenda") {
    const nombre = boton.dataset.nombre;
    boton.disabled = true;
    boton.textContent = "Creando…";

    const respuesta = await db.from("alumnos").insert({ nombre }).select().single();

    if (respuesta.error) {
      alert("No se pudo crear: " + respuesta.error.message);
      boton.disabled = false;
      boton.textContent = "+ Crear";
      return;
    }

    alumnos.push(respuesta.data);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    reconectarEventos();   // ahora el evento encuentra a su alumno
    agenda.mensaje = `${nombre} ya está en Reps ✓ Tocalo para armarle la rutina.`;
    render();
  }

  // ── Ignorar una sugerencia ──
  if (accion === "ignorar-candidato") {
    ignorados.push(sinTildes(boton.dataset.nombre));
    guardarIgnorados();
    render();
  }
});