// ─────────────────────────────────────────
// 1. CONEXIÓN A SUPABASE
// ─────────────────────────────────────────
const SUPABASE_URL = "https://deghqcuubogdfvynqdgw.supabase.co";   // 👈 tu Project URL
const SUPABASE_KEY = "sb_publishable_JioTzYTwMQKcbSKxZI4TLQ_aFW-RqNb";   // 👈 tu Publishable key

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────
// 2. ESTADO
// ─────────────────────────────────────────
let usuario = null;
let vista = "inicio";        // "login" | "inicio" | "alumno" | "nuevo" | "editar" | "nuevo-ejercicio"
let vistaAnterior = null;    // para saber si cambiamos de pantalla
let alumnos = [];
let cargando = true;
let error = null;
let alumnoActual = null;

let ejercicios = [];         // la rutina del alumno abierto
let cargandoEjercicios = false;
let ultimoDia = "";          // recuerda el último día usado, para cargar rápido

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

// Agrupa los ejercicios por día:
// [ {dia:"Día 1",...}, {dia:"Día 1",...}, {dia:"Día 2",...} ]
//   → { "Día 1": [ej, ej], "Día 2": [ej] }
function agruparPorDia(lista) {
  const grupos = {};
  lista.forEach(ej => {
    if (!grupos[ej.dia]) grupos[ej.dia] = [];  // si el día no existe, creamos su lista
    grupos[ej.dia].push(ej);
  });
  return grupos;
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

// La rutina, separada en su propia función (como un componente)
function seccionRutina() {
  if (cargandoEjercicios) {
    return `<p class="subtitulo">Cargando rutina…</p>`;
  }

  const grupos = agruparPorDia(ejercicios);
  const dias = Object.keys(grupos);  // ["Día 1", "Día 2", ...]

  if (!dias.length) {
    return `<p class="vacio">Todavía no tiene rutina.<br>Agregá el primer ejercicio 👆</p>`;
  }

  return dias.map(dia => `
    <h3 class="sec-title">${dia}</h3>
    <div class="lista">
      ${grupos[dia].map(ej => `
        <div class="card ejercicio">
          <div class="ej-info">
            <h3>${ej.nombre}</h3>
            <p class="presc">${ej.series} × ${ej.reps || "—"}</p>
          </div>
          <button class="borrar" data-accion="borrar-ejercicio" data-id="${ej.id}" aria-label="Borrar ${ej.nombre}">✕</button>
        </div>
      `).join("")}
    </div>
  `).join("");
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

    <div class="seccion">
      <h2>Rutina</h2>
      <button class="link" data-accion="agregar-ejercicio">+ Agregar ejercicio</button>
    </div>

    ${seccionRutina()}
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
  return `
    <button class="volver" type="button" data-accion="volver-alumno">← Volver</button>
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

function pantallaNuevoEjercicio() {
  // <datalist> = sugerencias para el input: muestra los días que ya existen
  const diasExistentes = Object.keys(agruparPorDia(ejercicios));
  const opciones = diasExistentes.map(d => `<option value="${d}">`).join("");

  return `
    <button class="volver" type="button" data-accion="volver-alumno">← ${alumnoActual.nombre}</button>
    <h1 class="titulo">Nuevo ejercicio</h1>

    <form id="form-ejercicio" class="form">
      <label>Día
        <input name="dia" required list="dias" value="${ultimoDia}" placeholder="Ej: Día 1 — Tren inferior">
        <datalist id="dias">${opciones}</datalist>
      </label>
      <label>Ejercicio
        <input name="nombre" required placeholder="Ej: Sentadilla búlgara">
      </label>
      <div class="dos-columnas">
        <label>Series <input name="series" type="number" min="1" max="10" value="3" inputmode="numeric"></label>
        <label>Reps   <input name="reps" placeholder="8-10"></label>
      </div>
      <p class="error"></p>
      <button class="btn" type="submit">Agregar ejercicio</button>
    </form>
  `;
}

// ─────────────────────────────────────────
// 5. RENDER
// ─────────────────────────────────────────
function render() {
  const app = document.getElementById("app");

  if (vista === "login")                app.innerHTML = pantallaLogin();
  else if (vista === "alumno")          app.innerHTML = pantallaAlumno(alumnoActual);
  else if (vista === "nuevo")           app.innerHTML = pantallaNuevo();
  else if (vista === "editar")          app.innerHTML = pantallaEditar(alumnoActual);
  else if (vista === "nuevo-ejercicio") app.innerHTML = pantallaNuevoEjercicio();
  else                                  app.innerHTML = pantallaInicio();

  // Solo volvemos arriba si cambiamos de pantalla
  // (así, al borrar un ejercicio, no te salta el scroll)
  if (vista !== vistaAnterior) window.scrollTo(0, 0);
  vistaAnterior = vista;
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
    ultimoDia = "";
    cargarEjercicios();
  }

  if (accion === "volver") {
    alumnoActual = null;
    ejercicios = [];
    vista = "inicio";
    render();
  }

  if (accion === "volver-alumno") {
    vista = "alumno";
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

  if (accion === "agregar-ejercicio") {
    vista = "nuevo-ejercicio";
    render();
  }

  if (accion === "borrar-ejercicio") {
    const id = Number(boton.dataset.id);
    const ej = ejercicios.find(e => e.id === id);
    // confirm() muestra un cartelito de "¿Estás segura?"
    if (!confirm(`¿Borrar "${ej.nombre}"?`)) return;

    const respuesta = await db.from("ejercicios").delete().eq("id", id);
    if (respuesta.error) {
      alert("No se pudo borrar: " + respuesta.error.message);
      return;
    }

    // filter = "quedate con todos MENOS el que borramos"
    ejercicios = ejercicios.filter(e => e.id !== id);
    render();
  }

  if (accion === "salir") {
    await db.auth.signOut();
    usuario = null;
    alumnos = [];
    ejercicios = [];
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

  // Si algo falla, mostramos el error y reactivamos el botón
  function fallo(texto) {
    mensaje.textContent = texto;
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }

  // ── LOGIN ──
  if (form.id === "form-login") {
    boton.textContent = "Entrando…";
    const respuesta = await db.auth.signInWithPassword({
      email: datos.email,
      password: datos.password,
    });
    if (respuesta.error) return fallo("Email o contraseña incorrectos.");

    usuario = respuesta.data.user;
    vista = "inicio";
    cargarAlumnos();
  }

  // ── NUEVO ALUMNO ──
  if (form.id === "form-nuevo") {
    boton.textContent = "Guardando…";
    const respuesta = await db.from("alumnos").insert(datos).select().single();
    if (respuesta.error) return fallo("No se pudo guardar: " + respuesta.error.message);

    alumnos.push(respuesta.data);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    vista = "inicio";
    render();
  }

  // ── EDITAR ALUMNO ──
  if (form.id === "form-editar") {
    boton.textContent = "Guardando…";
    const respuesta = await db
      .from("alumnos")
      .update(datos)
      .eq("id", alumnoActual.id)
      .select()
      .single();
    if (respuesta.error) return fallo("No se pudo guardar: " + respuesta.error.message);

    alumnos = alumnos.map(a => a.id === alumnoActual.id ? respuesta.data : a);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    alumnoActual = respuesta.data;
    vista = "alumno";
    render();
  }

  // ── NUEVO EJERCICIO ──
  if (form.id === "form-ejercicio") {
    boton.textContent = "Guardando…";
    const nuevo = {
      alumno_id: alumnoActual.id,           // ← la conexión con el alumno
      dia: datos.dia.trim(),                // trim() saca espacios de más
      nombre: datos.nombre.trim(),
      series: Number(datos.series) || 3,    // el input devuelve texto: lo pasamos a número
      reps: datos.reps,
      orden: ejercicios.length,             // va al final de la lista
    };

    const respuesta = await db.from("ejercicios").insert(nuevo).select().single();
    if (respuesta.error) return fallo("No se pudo guardar: " + respuesta.error.message);

    ejercicios.push(respuesta.data);
    ultimoDia = nuevo.dia;   // la próxima vez el día ya viene completo
    vista = "alumno";
    render();
  }
});

// ─────────────────────────────────────────
// 8. CARGAR DATOS
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

async function cargarEjercicios() {
  cargandoEjercicios = true;
  ejercicios = [];
  render();

  // "traé los ejercicios DE ESTE alumno, ordenados por día y por orden"
  const respuesta = await db
    .from("ejercicios")
    .select("*")
    .eq("alumno_id", alumnoActual.id)
    .order("dia")
    .order("orden");

  if (respuesta.error) {
    alert("No se pudo cargar la rutina: " + respuesta.error.message);
  } else {
    ejercicios = respuesta.data;
  }

  cargandoEjercicios = false;
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