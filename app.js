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
let vista = "inicio";        // "login" | "inicio" | "alumno" | "nuevo" | "editar" | "nuevo-ejercicio" | "sesion"
let vistaAnterior = null;
let alumnos = [];
let cargando = true;
let error = null;
let alumnoActual = null;
let aviso = "";              // mensaje de éxito que se muestra una vez

let ejercicios = [];
let cargandoEjercicios = false;
let ultimoDia = "";

// Sesión de entrenamiento
let sesionDia = null;        // nombre del día que se entrena
let sesionEjercicios = [];   // ejercicios de ese día
let sesionDatos = {};        // lo anotado: { idEjercicio: { nroSerie: { kg, reps } } }
let ultimaVez = {};          // { idEjercicio: [registros de la última vez] }
let cargandoSesion = false;

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

function agruparPorDia(lista) {
  const grupos = {};
  lista.forEach(ej => {
    if (!grupos[ej.dia]) grupos[ej.dia] = [];
    grupos[ej.dia].push(ej);
  });
  return grupos;
}

// Fecha de hoy en formato "2026-11-17" (el que usa la base)
function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// "2026-11-17" → "17/11"
function fechaCorta(iso) {
  const partes = iso.split("-");
  return `${partes[2]}/${partes[1]}`;
}

// Convierte lo que se escribió en un número: "62,5" → 62.5 / "" → null
function numero(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = parseFloat(String(valor).replace(",", "."));
  return isNaN(n) ? null : n;
}

// ¿Cuántas series tienen algo anotado?
function seriesHechas() {
  let total = 0;
  Object.values(sesionDatos).forEach(series => {
    Object.values(series).forEach(s => {
      if (s.kg || s.reps) total++;
    });
  });
  return total;
}

// ¿Cuántas series tiene el día en total?
function seriesTotales() {
  return sesionEjercicios.reduce((suma, ej) => suma + ej.series, 0);
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

function seccionRutina() {
  if (cargandoEjercicios) {
    return `<p class="subtitulo">Cargando rutina…</p>`;
  }

  const grupos = agruparPorDia(ejercicios);
  const dias = Object.keys(grupos);

  if (!dias.length) {
    return `<p class="vacio">Todavía no tiene rutina.<br>Agregá el primer ejercicio 👆</p>`;
  }

  // data-dia="${i}" guarda la POSICIÓN del día (0, 1, 2…)
  return dias.map((dia, i) => `
    <div class="dia-header">
      <h3 class="sec-title">${dia}</h3>
      <button class="entrenar" data-accion="entrenar" data-dia="${i}">Entrenar ▶</button>
    </div>
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

    ${aviso ? `<div class="aviso">${aviso}</div>` : ""}

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

// La pantalla del gimnasio
function pantallaSesion() {
  const volver = `<button class="volver" data-accion="salir-sesion">← ${alumnoActual.nombre}</button>`;

  if (cargandoSesion) {
    return volver + `<p class="subtitulo">Preparando la sesión…</p>`;
  }

  const tarjetas = sesionEjercicios.map(ej => {
    const anterior = ultimaVez[ej.id] || [];

    // Texto "Última (10/11): 60×10 · 60×9 · 55×10"
    const textoAnterior = anterior.length
      ? `Última (${fechaCorta(anterior[0].fecha)}): ` +
        anterior.map(r => `${r.kg ?? "–"}×${r.reps ?? "–"}`).join(" · ")
      : "Primera vez con este ejercicio 🎉";

    // Una fila por serie: número | kg | reps
    let filas = "";
    for (let s = 1; s <= ej.series; s++) {
      const previa = anterior.find(r => r.serie === s) || {};
      const actual = (sesionDatos[ej.id] && sesionDatos[ej.id][s]) || {};

      filas += `
        <span class="n">${s}</span>
        <input data-ej="${ej.id}" data-serie="${s}" data-campo="kg"
               inputmode="decimal" placeholder="${previa.kg ?? "kg"}"
               value="${actual.kg ?? ""}" class="${actual.kg ? "lleno" : ""}">
        <input data-ej="${ej.id}" data-serie="${s}" data-campo="reps"
               inputmode="numeric" placeholder="${previa.reps ?? "reps"}"
               value="${actual.reps ?? ""}" class="${actual.reps ? "lleno" : ""}">
      `;
    }

    return `
      <div class="card sesion-ej">
        <h3>${ej.nombre}</h3>
        <p class="presc">${ej.series} × ${ej.reps || "—"}</p>
        <p class="anterior">${textoAnterior}</p>
        <div class="series">
          <span class="h">Serie</span><span class="h">Kg</span><span class="h">Reps</span>
          ${filas}
        </div>
      </div>
    `;
  }).join("");

  const hechas = seriesHechas();
  const total = seriesTotales();

  return `
    ${volver}
    <h1 class="titulo">${sesionDia}</h1>

    <div class="progreso">
      <div class="fila">
        <span>Progreso</span>
        <span id="progreso-texto">${hechas} de ${total} series</span>
      </div>
      <div class="barra"><i id="progreso-barra" style="width:${total ? (hechas / total) * 100 : 0}%"></i></div>
    </div>

    <div class="sesion-lista">${tarjetas}</div>

    <button class="btn" data-accion="guardar-sesion">Guardar sesión</button>
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
  else if (vista === "sesion")          app.innerHTML = pantallaSesion();
  else                                  app.innerHTML = pantallaInicio();

  aviso = "";  // el aviso se muestra una sola vez

  if (vista !== vistaAnterior) window.scrollTo(0, 0);
  vistaAnterior = vista;
}

// Actualiza SOLO la barra de progreso, sin redibujar toda la pantalla
// (si redibujáramos todo, el input perdería el foco mientras escribís)
function actualizarProgreso() {
  const hechas = seriesHechas();
  const total = seriesTotales();
  document.getElementById("progreso-texto").textContent = `${hechas} de ${total} series`;
  document.getElementById("progreso-barra").style.width = `${total ? (hechas / total) * 100 : 0}%`;
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
    if (!confirm(`¿Borrar "${ej.nombre}"? También se borra su historial.`)) return;

    const respuesta = await db.from("ejercicios").delete().eq("id", id);
    if (respuesta.error) {
      alert("No se pudo borrar: " + respuesta.error.message);
      return;
    }
    ejercicios = ejercicios.filter(e => e.id !== id);
    render();
  }

  // ── Empezar a entrenar un día ──
  if (accion === "entrenar") {
    const grupos = agruparPorDia(ejercicios);
    const dias = Object.keys(grupos);
    sesionDia = dias[Number(boton.dataset.dia)];
    sesionEjercicios = grupos[sesionDia];
    sesionDatos = {};
    vista = "sesion";
    cargarUltimaVez();
  }

  // ── Salir de la sesión (avisa si hay algo sin guardar) ──
  if (accion === "salir-sesion") {
    if (seriesHechas() > 0 && !confirm("¿Salir sin guardar? Se pierde lo anotado.")) return;
    sesionDatos = {};
    vista = "alumno";
    render();
  }

  // ── Guardar la sesión ──
  if (accion === "guardar-sesion") {
    // Armamos una fila por cada serie que tenga algo anotado
    const filas = [];
    sesionEjercicios.forEach(ej => {
      const series = sesionDatos[ej.id] || {};
      Object.keys(series).forEach(nroSerie => {
        const kg = numero(series[nroSerie].kg);
        const reps = numero(series[nroSerie].reps);
        if (kg === null && reps === null) return;  // serie vacía: la salteamos

        filas.push({
          alumno_id: alumnoActual.id,
          ejercicio_id: ej.id,
          fecha: hoy(),
          serie: Number(nroSerie),
          kg: kg,
          reps: reps === null ? null : Math.round(reps),
        });
      });
    });

    if (!filas.length) {
      alert("Anotá al menos una serie antes de guardar.");
      return;
    }

    boton.disabled = true;
    boton.textContent = "Guardando…";

    // insert de VARIAS filas de una: le pasamos una lista
    const respuesta = await db.from("registros").insert(filas);

    if (respuesta.error) {
      alert("No se pudo guardar: " + respuesta.error.message);
      boton.disabled = false;
      boton.textContent = "Guardar sesión";
      return;
    }

    aviso = `¡Sesión guardada! ${filas.length} series registradas 💪`;
    sesionDatos = {};
    vista = "alumno";
    render();
  }

  if (accion === "salir") {
    await db.auth.signOut();
    usuario = null;
    alumnos = [];
    ejercicios = [];
    sesionDatos = {};
    vista = "login";
    render();
  }
});

// ─────────────────────────────────────────
// 6b. ESCRIBIR EN LA SESIÓN
//     "input" se dispara con cada tecla
// ─────────────────────────────────────────
document.addEventListener("input", (evento) => {
  const campo = evento.target;
  if (!campo.dataset.campo) return;  // solo nos importan los inputs de series

  const ej = campo.dataset.ej;
  const serie = campo.dataset.serie;

  // Creamos los "cajones" si no existen todavía
  if (!sesionDatos[ej]) sesionDatos[ej] = {};
  if (!sesionDatos[ej][serie]) sesionDatos[ej][serie] = {};

  sesionDatos[ej][serie][campo.dataset.campo] = campo.value;

  // Feedback visual: el input se pinta cuando tiene algo
  campo.classList.toggle("lleno", campo.value !== "");
  actualizarProgreso();
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
      alumno_id: alumnoActual.id,
      dia: datos.dia.trim(),
      nombre: datos.nombre.trim(),
      series: Number(datos.series) || 3,
      reps: datos.reps,
      orden: ejercicios.length,
    };

    const respuesta = await db.from("ejercicios").insert(nuevo).select().single();
    if (respuesta.error) return fallo("No se pudo guardar: " + respuesta.error.message);

    ejercicios.push(respuesta.data);
    ultimoDia = nuevo.dia;
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

// Busca qué hizo la última vez en cada ejercicio del día
async function cargarUltimaVez() {
  cargandoSesion = true;
  ultimaVez = {};
  render();

  const ids = sesionEjercicios.map(ej => ej.id);

  // "registros de estos ejercicios, ANTERIORES a hoy, del más nuevo al más viejo"
  const respuesta = await db
    .from("registros")
    .select("*")
    .in("ejercicio_id", ids)
    .lt("fecha", hoy())
    .order("fecha", { ascending: false })
    .order("serie");

  if (!respuesta.error) {
    sesionEjercicios.forEach(ej => {
      const suyos = respuesta.data.filter(r => r.ejercicio_id === ej.id);
      if (suyos.length) {
        const ultimaFecha = suyos[0].fecha;  // el primero es el más reciente
        ultimaVez[ej.id] = suyos.filter(r => r.fecha === ultimaFecha);
      }
    });
  }

  cargandoSesion = false;
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