// ─────────────────────────────────────────
// 1. CONEXIÓN A SUPABASE
// ─────────────────────────────────────────
const SUPABASE_URL = "https://deghqcuubogdfvynqdgw.supabase.co";   // 👈 tu Project URL
const SUPABASE_KEY = "sb_publishable_JioTzYTwMQKcbSKxZI4TLQ_aFW-RqNb";   // 👈 tu Publishable key

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────
// 2. ESTADO
// ─────────────────────────────────────────
let usuario = null;      // el trainer logueado (null = nadie)
let vista = "inicio";    // "login" | "inicio" | "alumno" | "nuevo" | "editar"
let alumnos = [];
let cargando = true;
let error = null;
let alumnoActual = null;

// ─────────────────────────────────────────
// 3. AYUDANTES
// ─────────────────────────────────────────
function iniciales(nombre) {
  return nombre.split(" ").map(parte => parte[0]).join("").toUpperCase();
}

function detalle(alumno) {
  return [alumno.fase, alumno.dia].filter(Boolean).join(" · ");
}

function encabezado() {
  return `
    <div class="top">
      <div class="logo"><i></i>REPS</div>
      <button class="salir" data-accion="salir">Salir</button>
    </div>
  `;
}

// ─────────────────────────────────────────
// 4. PANTALLAS
// ─────────────────────────────────────────
function pantallaLogin() {
  return `
    <div class="login">
      <div class="logo"><i></i>REPS</div>
      <p class="subtitulo">Entrá con tu cuenta de trainer</p>

      <form id="form-login" class="form">
        <label>Email
          <input name="email" type="email" required autocomplete="email">
        </label>
        <label>Contraseña
          <input name="password" type="password" required autocomplete="current-password">
        </label>
        <p class="error"></p>
        <button class="btn" type="submit">Entrar</button>
      </form>
    </div>
  `;
}

function pantallaInicio() {
  if (cargando) {
    return encabezado() + `<p class="subtitulo">Cargando alumnos…</p>`;
  }
  if (error) {
    return encabezado() + `<p class="subtitulo">⚠️ ${error}</p>`;
  }

  const tarjetas = alumnos.map(alumno => `
    <button class="card" data-accion="abrir" data-id="${alumno.id}">
      <div class="avatar">${iniciales(alumno.nombre)}</div>
      <div>
        <h3>${alumno.nombre}</h3>
        <p>${detalle(alumno)}</p>
      </div>
    </button>
  `).join("");

  const contenido = alumnos.length
    ? `<div class="lista">${tarjetas}</div>`
    : `<p class="vacio">Todavía no tenés alumnos.<br>Creá el primero 👆</p>`;

  return `
    ${encabezado()}
    <p class="subtitulo">${alumnos.length} alumnos</p>
    <button class="btn secundario" data-accion="nuevo">+ Nuevo alumno</button>
    ${contenido}
  `;
}

function pantallaAlumno(alumno) {
  return `
    <button class="volver" data-accion="volver">← Alumnos</button>

    <div class="perfil">
      <div class="avatar grande">${iniciales(alumno.nombre)}</div>
      <h1>${alumno.nombre}</h1>
      <p>${detalle(alumno)}</p>
    </div>

    <div class="card info">
      <div>
        <p>Objetivo</p>
        <h3>${alumno.objetivo || "Sin definir"}</h3>
      </div>
    </div>

    <button class="btn secundario" data-accion="editar">✏️ Editar alumno</button>
  `;
}

function pantallaNuevo() {
  return `
    <button class="volver" type="button" data-accion="volver">← Alumnos</button>
    <h1 class="titulo">Nuevo alumno</h1>

    <form id="form-nuevo" class="form">
      <label>Nombre
        <input name="nombre" required placeholder="Ej: Sofía R.">
      </label>
      <div class="dos-columnas">
        <label>Fase <input name="fase" placeholder="Fase 1"></label>
        <label>Día  <input name="dia" placeholder="Día 1"></label>
      </div>
      <label>Objetivo
        <input name="objetivo" placeholder="Ej: Hipertrofia de tren inferior">
      </label>
      <p class="error"></p>
      <button class="btn" type="submit">Guardar alumno</button>
    </form>
  `;
}

function pantallaEditar(alumno) {
  // value="..." precarga los datos actuales en cada campo
  // alumno.fase || "" = si no hay fase, dejá vacío (si no, aparecería "null")
  return `
    <button class="volver" type="button" data-accion="cancelar-edicion">← Volver</button>
    <h1 class="titulo">Editar alumno</h1>

    <form id="form-editar" class="form">
      <label>Nombre
        <input name="nombre" required value="${alumno.nombre}">
      </label>
      <div class="dos-columnas">
        <label>Fase <input name="fase" value="${alumno.fase || ""}"></label>
        <label>Día  <input name="dia" value="${alumno.dia || ""}"></label>
      </div>
      <label>Objetivo
        <input name="objetivo" value="${alumno.objetivo || ""}" placeholder="Ej: Hipertrofia de tren inferior">
      </label>
      <p class="error"></p>
      <button class="btn" type="submit">Guardar cambios</button>
    </form>
  `;
}

// ─────────────────────────────────────────
// 5. RENDER
// ─────────────────────────────────────────
function render() {
  const app = document.getElementById("app");

  if (vista === "login")       app.innerHTML = pantallaLogin();
  else if (vista === "alumno") app.innerHTML = pantallaAlumno(alumnoActual);
  else if (vista === "nuevo")  app.innerHTML = pantallaNuevo();
  else if (vista === "editar") app.innerHTML = pantallaEditar(alumnoActual);
  else                         app.innerHTML = pantallaInicio();

  window.scrollTo(0, 0);
}

// ─────────────────────────────────────────
// 6. CLICS
// ─────────────────────────────────────────
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  if (accion === "abrir") {
    alumnoActual = alumnos.find(a => a.id === Number(boton.dataset.id));
    vista = "alumno";
    render();
  }

  if (accion === "volver") {
    alumnoActual = null;
    vista = "inicio";
    render();
  }

  if (accion === "nuevo") {
    vista = "nuevo";
    render();
  }

  if (accion === "editar") {
    vista = "editar";
    render();
  }

  if (accion === "cancelar-edicion") {
    vista = "alumno";
    render();
  }

  if (accion === "salir") {
    await db.auth.signOut();
    usuario = null;
    alumnos = [];
    vista = "login";
    render();
  }
});

// ─────────────────────────────────────────
// 7. FORMULARIOS
// ─────────────────────────────────────────
document.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const form = evento.target;
  const datos = Object.fromEntries(new FormData(form));
  const boton = form.querySelector("button[type=submit]");
  const mensaje = form.querySelector(".error");
  const textoOriginal = boton.textContent;

  boton.disabled = true;
  mensaje.textContent = "";

  // ── LOGIN ──
  if (form.id === "form-login") {
    boton.textContent = "Entrando…";
    const respuesta = await db.auth.signInWithPassword({
      email: datos.email,
      password: datos.password,
    });

    if (respuesta.error) {
      mensaje.textContent = "Email o contraseña incorrectos.";
      boton.disabled = false;
      boton.textContent = textoOriginal;
      return;
    }

    usuario = respuesta.data.user;
    vista = "inicio";
    cargarAlumnos();
  }

  // ── NUEVO ALUMNO ──
  if (form.id === "form-nuevo") {
    boton.textContent = "Guardando…";
    const respuesta = await db.from("alumnos").insert(datos).select().single();

    if (respuesta.error) {
      mensaje.textContent = "No se pudo guardar: " + respuesta.error.message;
      boton.disabled = false;
      boton.textContent = textoOriginal;
      return;
    }

    alumnos.push(respuesta.data);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    vista = "inicio";
    render();
  }

  // ── EDITAR ALUMNO ──
  if (form.id === "form-editar") {
    boton.textContent = "Guardando…";
    // update = modificar. .eq("id", ...) = "SOLO la fila con este id"
    // (sin el .eq, cambiaría TODOS los alumnos 😱)
    const respuesta = await db
      .from("alumnos")
      .update(datos)
      .eq("id", alumnoActual.id)
      .select()
      .single();

    if (respuesta.error) {
      mensaje.textContent = "No se pudo guardar: " + respuesta.error.message;
      boton.disabled = false;
      boton.textContent = textoOriginal;
      return;
    }

    // Reemplazamos el alumno viejo por el actualizado
    alumnos = alumnos.map(a => a.id === alumnoActual.id ? respuesta.data : a);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    alumnoActual = respuesta.data;
    vista = "alumno";
    render();
  }
});

// ─────────────────────────────────────────
// 8. CARGAR ALUMNOS
// ─────────────────────────────────────────
async function cargarAlumnos() {
  cargando = true;
  error = null;
  render();

  const respuesta = await db.from("alumnos").select("*").order("nombre");

  if (respuesta.error) {
    error = "No se pudieron cargar los alumnos: " + respuesta.error.message;
  } else {
    alumnos = respuesta.data;
  }

  cargando = false;
  render();
}

// ─────────────────────────────────────────
// 9. ARRANQUE
// ─────────────────────────────────────────
async function iniciar() {
  const sesion = await db.auth.getSession();
  usuario = sesion.data.session ? sesion.data.session.user : null;

  if (usuario) {
    vista = "inicio";
    cargarAlumnos();
  } else {
    vista = "login";
    render();
  }
}

iniciar();