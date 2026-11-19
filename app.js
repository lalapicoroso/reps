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
// Pantallas: "login" | "inicio" | "actividad" | "ajustes" |
//            "alumno" | "nuevo" | "editar" | "nuevo-ejercicio" | "sesion" | "progreso"
let vista = "inicio";
let vistaAnterior = null;
let alumnos = [];
let cargando = true;
let error = null;
let alumnoActual = null;
let aviso = "";

let seccionAlumno = "rutina";   // segmented control: "rutina" | "progreso" | "perfil"

let ejercicios = [];
let cargandoEjercicios = false;
let ultimoDia = "";

// Sesión de entrenamiento
let sesionDia = null;
let sesionEjercicios = [];
let sesionDatos = {};
let ultimaVez = {};
let cargandoSesion = false;

// Progreso de UN ejercicio
let ejercicioActual = null;
let historial = [];
let cargandoHistorial = false;

// Resumen de progreso de TODOS los ejercicios del alumno
let resumen = { porEjercicio: [], fechas: [] };
let cargandoResumen = false;

// Actividad: quién entrenó y cuándo
let actividad = [];
let cargandoActividad = false;

// ─────────────────────────────────────────
// 3. AYUDANTES
// ─────────────────────────────────────────
function iniciales(nombre) {
  return nombre.split(" ").map(parte => parte[0]).join("").toUpperCase();
}

function detalle(alumno) {
  return [alumno.objetivo, alumno.fase].filter(Boolean).join(" · ");
}

function encabezado() {
  return `
    <div class="top">
      <div class="logo"><i></i>REPS</div>
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

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Fecha de hace N días, en el mismo formato
function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fechaCorta(iso) {
  const partes = iso.split("-");
  return `${partes[2]}/${partes[1]}`;
}

function fechaLarga(iso) {
  return new Date(iso + "T12:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

function redondear(n) {
  return Math.round(n * 10) / 10;
}

function numero(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = parseFloat(String(valor).replace(",", "."));
  return isNaN(n) ? null : n;
}

function seriesHechas() {
  let total = 0;
  Object.values(sesionDatos).forEach(series => {
    Object.values(series).forEach(s => {
      if (s.kg || s.reps) total++;
    });
  });
  return total;
}

function seriesTotales() {
  return sesionEjercicios.reduce((suma, ej) => suma + ej.series, 0);
}

function agruparPorFecha(registros) {
  const porFecha = {};
  registros.forEach(r => {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = [];
    porFecha[r.fecha].push(r);
  });

  return Object.keys(porFecha).sort().map(fecha => {
    const series = porFecha[fecha].sort((a, b) => a.serie - b.serie);
    const kgs = series.map(s => s.kg).filter(k => k !== null);
    return {
      fecha,
      series,
      maxKg: kgs.length ? Math.max(...kgs) : null,
      volumen: series.reduce((total, s) => total + (s.kg || 0) * (s.reps || 0), 0),
    };
  });
}

// ─────────────────────────────────────────
// 3b. ÍCONOS (SVG con stroke="currentColor": toman el color del texto)
// ─────────────────────────────────────────
const ICONOS = {
  alumnos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.8c1.9.7 3 2.4 3 5.2"/></svg>`,
  actividad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>`,
  ajustes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>`,
};

// ─────────────────────────────────────────
// 3c. GRÁFICOS
// ─────────────────────────────────────────
function grafico(sesiones) {
  const puntos = sesiones.filter(s => s.maxKg !== null);

  if (puntos.length < 2) {
    return `<p class="vacio">Con 2 sesiones o más vas a ver el gráfico 📈</p>`;
  }

  const W = 358, H = 170;
  const m = { arriba: 20, derecha: 16, abajo: 28, izquierda: 40 };

  const valores = puntos.map(p => p.maxKg);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) { min -= 5; max += 5; }

  const x = i => m.izquierda + (i / (puntos.length - 1)) * (W - m.izquierda - m.derecha);
  const y = kg => m.arriba + (1 - (kg - min) / (max - min)) * (H - m.arriba - m.abajo);

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.maxKg).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${H - m.abajo} L${x(0).toFixed(1)},${H - m.abajo} Z`;

  const circulos = puntos.map((p, i) => {
    const esUltimo = i === puntos.length - 1;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.maxKg).toFixed(1)}" r="${esUltimo ? 5 : 3.5}" class="${esUltimo ? "ultimo" : ""}"/>`;
  }).join("");

  const ultimoPunto = puntos[puntos.length - 1];

  return `
    <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso máximo por sesión">
      <line class="guia" x1="${m.izquierda}" x2="${W - m.derecha}" y1="${y(max)}" y2="${y(max)}"/>
      <line class="guia" x1="${m.izquierda}" x2="${W - m.derecha}" y1="${y(min)}" y2="${y(min)}"/>
      <text class="eje" x="${m.izquierda - 8}" y="${y(max) + 4}" text-anchor="end">${redondear(max)}</text>
      <text class="eje" x="${m.izquierda - 8}" y="${y(min) + 4}" text-anchor="end">${redondear(min)}</text>
      <text class="eje" x="${x(0)}" y="${H - 8}" text-anchor="start">${fechaCorta(puntos[0].fecha)}</text>
      <text class="eje" x="${x(puntos.length - 1)}" y="${H - 8}" text-anchor="end">${fechaCorta(ultimoPunto.fecha)}</text>
      <path class="area" d="${area}"/>
      <path class="linea" d="${linea}"/>
      ${circulos}
    </svg>
  `;
}

function miniGrafico(sesiones) {
  const valores = sesiones.map(s => s.maxKg).filter(v => v !== null);
  if (valores.length < 2) return "";

  const W = 72, H = 28, p = 3;
  let min = Math.min(...valores), max = Math.max(...valores);
  if (min === max) { min -= 1; max += 1; }

  const puntos = valores.map((v, i) => {
    const x = p + (i / (valores.length - 1)) * (W - p * 2);
    const y = p + (1 - (v - min) / (max - min)) * (H - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return `<svg class="mini" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${puntos}"/></svg>`;
}

// ─────────────────────────────────────────
// 4. NAVEGACIÓN
// ─────────────────────────────────────────

// Tab bar GLOBAL (abajo)
function tabbar() {
  // ¿Qué pestaña se marca? Todo lo de alumnos cuenta como "alumnos"
  let activa = "alumnos";
  if (vista === "actividad" || vista === "actividad-todo") activa = "actividad";
  if (vista === "ajustes") activa = "ajustes";

  const pestañas = [
    ["alumnos", "Alumnos"],
    ["actividad", "Hoy"],
    ["ajustes", "Ajustes"],
  ];

  const botones = pestañas.map(([id, texto]) => `
    <button class="tab ${activa === id ? "on" : ""}" data-accion="ir" data-destino="${id}"
            aria-current="${activa === id ? "page" : "false"}">
      ${ICONOS[id]}
      <span>${texto}</span>
    </button>
  `).join("");

  return `<nav class="tabbar" aria-label="Navegación principal"><div class="in">${botones}</div></nav>`;
}

// Segmented control (adentro del alumno)
function segmentado() {
  const opciones = [
    ["rutina", "Rutina"],
    ["progreso", "Progreso"],
    ["nutricion", "Nutrición"],
    ["perfil", "Perfil"],
  ];

  const botones = opciones.map(([id, texto]) => `
    <button role="tab" aria-selected="${seccionAlumno === id}"
            class="${seccionAlumno === id ? "on" : ""}"
            data-accion="seccion" data-seccion="${id}">${texto}</button>
  `).join("");

  return `<div class="segmentado" role="tablist">${botones}</div>`;
}

// ─────────────────────────────────────────
// 5. PANTALLAS
// ─────────────────────────────────────────
function pantallaLogin() {
  return `
    <div class="login-fondo" aria-hidden="true">
      <video src="video/login.mp4" poster="video/login.jpg" autoplay muted loop playsinline></video>
    </div>

    <div class="login">
      <div>
        <h1 class="marca">REPS<i></i></h1>
        <p class="lema">Cada serie cuenta.</p>
      </div>

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

// ── Actividad: quién entrenó y cuándo ──
function pantallaActividad() {
    const titulo = `<button class="volver" type="button" data-accion="volver-hoy">← Hoy</button><h1 class="titulo">Actividad</h1>`;
  
  if (cargandoActividad) {
    return titulo + `<p class="subtitulo">Cargando actividad…</p>`;
  }
  if (!actividad.length) {
    return titulo + `<p class="vacio">Todavía no hay entrenamientos registrados.<br>Cuando guardes una sesión, aparece acá 💪</p>`;
  }

  // Números destacados
  const deHoy = actividad.filter(a => a.fecha === hoy()).length;
  const deLaSemana = actividad.filter(a => a.fecha >= haceDias(6)).length;

  // Agrupamos por fecha
  const porFecha = {};
  actividad.forEach(a => {
    if (!porFecha[a.fecha]) porFecha[a.fecha] = [];
    porFecha[a.fecha].push(a);
  });

  const bloques = Object.keys(porFecha).sort().reverse().map(fecha => {
    const etiqueta = fecha === hoy() ? "Hoy" : fechaLarga(fecha);

    const items = porFecha[fecha].map(a => {
      const alumno = alumnos.find(x => x.id === a.alumnoId);
      if (!alumno) return "";
      const dias = [...a.dias].join(" · ") || "Entrenamiento";
      return `
        <button class="card" data-accion="abrir" data-id="${alumno.id}">
          <div class="avatar">${iniciales(alumno.nombre)}</div>
          <div>
            <h3>${alumno.nombre}</h3>
            <p>${dias} · ${a.series} series</p>
          </div>
        </button>
      `;
    }).join("");

    return `<h3 class="sec-title">${etiqueta}</h3><div class="lista">${items}</div>`;
  }).join("");

  return `
    ${titulo}
    <div class="stats">
      <div class="stat"><div class="v">${deHoy}</div><div class="k">Hoy</div></div>
      <div class="stat"><div class="v">${deLaSemana}</div><div class="k">Últimos 7 días</div></div>
      <div class="stat"><div class="v">${actividad.length}</div><div class="k">Total</div></div>
    </div>
    ${bloques}
  `;
}

// ── Ajustes ──
function pantallaAjustes() {
  return `
    <h1 class="titulo">Ajustes</h1>
    <div class="lista">
      <div class="card info"><div><p>Cuenta</p><h3 class="email">${usuario ? usuario.email : ""}</h3></div></div>
      <button class="card info fila-link" type="button" data-accion="editar-nombre">
      <div><p>Tu nombre</p><h3>${nombreTrainer() || "Agregalo para el saludo"}</h3></div>
        <span class="chev">›</span>
      </button>
      <button class="card info fila-link" type="button" data-accion="abrir-apariencia">
      <div><p>Apariencia</p><h3>${TEMAS[temaActual].nombre}</h3></div>
        <span class="chev">›</span>
      </button>
      <div class="card info"><div><p>Alumnos</p><h3>${alumnos.length}</h3></div></div>
      <button class="btn peligro" data-accion="salir">Cerrar sesión</button>
    </div>
    <p class="version">Reps · versión 10</p>
  `;
}

// ── Contenido de cada sección del alumno ──
function seccionRutina() {
  if (cargandoEjercicios) {
    return `<p class="subtitulo">Cargando rutina…</p>`;
  }

  const grupos = agruparPorDia(ejercicios);
  const dias = Object.keys(grupos);

  if (!dias.length) {
    return `<p class="vacio">Todavía no tiene rutina.<br>Agregá el primer ejercicio 👆</p>`;
  }

  return dias.map((dia, i) => `
    <div class="dia-header">
      <h3 class="sec-title">${dia}</h3>
      <button class="entrenar" data-accion="entrenar" data-dia="${i}">Entrenar ▶</button>
    </div>
    <div class="lista">
      ${grupos[dia].map(ej => `
        <div class="card ejercicio">
          <button class="ej-info" data-accion="ver-progreso" data-id="${ej.id}">
            <span class="ej-texto">
              <h3>${ej.nombre}</h3>
              <p class="presc">${ej.series} × ${ej.reps || "—"}</p>
            </span>
            <span class="chev">›</span>
          </button>
          <button class="borrar" data-accion="borrar-ejercicio" data-id="${ej.id}" aria-label="Borrar ${ej.nombre}">✕</button>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function tabRutina() {
  return `
    <div class="acciones-seccion">
      <button class="link" data-accion="agregar-ejercicio">+ Agregar ejercicio</button>
    </div>
     ${seccionRutinaChips()}
  `;
}

function tabProgreso() {
  if (cargandoResumen) {
    return `<p class="subtitulo">Calculando progreso…</p>`;
  }
  if (!ejercicios.length) {
    return `<p class="vacio">Primero armá la rutina en <b>Rutina</b> 💪</p>`;
  }

  const fechas = resumen.fechas;
  const ultimaFecha = fechas.length ? fechaLarga(fechas[fechas.length - 1]) : "—";

  const tarjetas = resumen.porEjercicio.map(({ ej, sesiones }) => {
    const maximos = sesiones.map(s => s.maxKg).filter(v => v !== null);
    const record = maximos.length ? redondear(Math.max(...maximos)) : null;
    const texto = sesiones.length
      ? `Récord ${record ?? "—"} kg · ${sesiones.length} ${sesiones.length === 1 ? "sesión" : "sesiones"}`
      : "Sin registros todavía";

    return `
      <button class="card ej-prog" data-accion="ver-progreso" data-id="${ej.id}">
        <span class="ep-texto">
          <h3>${ej.nombre}</h3>
          <p>${texto}</p>
        </span>
        ${miniGrafico(sesiones)}
        <span class="chev">›</span>
      </button>
    `;
  }).join("");

  return `
      <div class="resumen-hoy">
      <p><strong>${fechas.length}</strong> ${fechas.length === 1 ? "entrenamiento" : "entrenamientos"}</p>
      <p>Última: <strong class="fecha">${ultimaFecha}</strong></p>
    </div>

    <h3 class="sec-title">Por ejercicio</h3>
    <div class="lista">${tarjetas}</div>
  `;
}

function tabPerfil(alumno) {
  return `
    <div class="lista">
      <div class="card info"><div><p>Objetivo</p><h3>${alumno.objetivo || "Sin definir"}</h3></div></div>
      <div class="card info"><div><p>Fase</p><h3>${alumno.fase || "—"}</h3></div></div>
      <button class="btn secundario" data-accion="editar">Editar alumno</button>
      <button class="btn secundario" data-accion="abrir-importar">Importar desde planilla</button>
      <p class="sec-title zona-cuidado">Zona de cuidado</p>
      <button class="btn peligro" data-accion="borrar-alumno">Borrar alumno</button>
    </div>
  `;
}

function pantallaAlumno(alumno) {
  let contenido;
  if (seccionAlumno === "progreso")    contenido = tabProgreso();
  else if (seccionAlumno === "nutricion") contenido = tabNutricion(alumno);
  else if (seccionAlumno === "perfil") contenido = tabPerfil(alumno);
  else                                 contenido = tabRutina();

  return `
    <div class="alumno-fijo">
      <button class="volver" data-accion="volver">← Alumnos</button>

      <div class="alumno-head">
        <div class="avatar">${iniciales(alumno.nombre)}</div>
        <div>
          <h1>${alumno.nombre}</h1>
          <p>${detalle(alumno)}</p>
        </div>
      </div>

      ${segmentado()}
    </div>

    ${aviso ? `<div class="aviso">${aviso}</div>` : ""}

    ${contenido}
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
        <label>Fase <input name="fase" placeholder="Fase 1"></label>
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
        <label>Fase <input name="fase" value="${alumno.fase || ""}"></label>
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

function pantallaSesion() {
  const volver = `<button class="volver" data-accion="salir-sesion">← ${alumnoActual.nombre}</button>`;

  if (cargandoSesion) {
    return volver + `<p class="subtitulo">Preparando la sesión…</p>`;
  }

  const tarjetas = sesionEjercicios.map(ej => {
    const anterior = ultimaVez[ej.id] || [];

    const textoAnterior = anterior.length
      ? `Última (${fechaCorta(anterior[0].fecha)}): ` +
        anterior.map(r => `${r.kg ?? "–"}×${r.reps ?? "–"}`).join(" · ")
      : "Primera vez con este ejercicio 🎉";

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

function pantallaProgreso() {
  const ej = ejercicioActual;
  const volver = `<button class="volver" data-accion="volver-alumno">← ${alumnoActual.nombre}</button>`;
  const titulo = `
    <h1 class="titulo">${ej.nombre}</h1>
    <p class="presc-grande">${ej.series} × ${ej.reps || "—"} · ${ej.dia}</p>
    <button class="link editar-ej" data-accion="editar-ejercicio">✏️ Editar ejercicio</button>
  `;

  if (cargandoHistorial) {
    return volver + titulo + `<p class="subtitulo">Cargando historial…</p>`;
  }

  if (!historial.length) {
    return volver + titulo + `<p class="vacio">Todavía no hay entrenamientos registrados.<br>Tocá "Entrenar ▶" en la rutina para empezar 💪</p>`;
  }

  const maximos = historial.map(s => s.maxKg).filter(v => v !== null);
  const record = maximos.length ? Math.max(...maximos) : null;
  const ultima = historial[historial.length - 1];
  const anterior = historial[historial.length - 2];

  let cambio = "—";
  let claseCambio = "";
  if (anterior && ultima.maxKg !== null && anterior.maxKg !== null) {
    const diferencia = redondear(ultima.maxKg - anterior.maxKg);
    if (diferencia > 0)      { cambio = `+${diferencia}`; claseCambio = "sube"; }
    else if (diferencia < 0) { cambio = `${diferencia}`;  claseCambio = "baja"; }
    else                     { cambio = "="; }
  }

  const sesiones = [...historial].reverse().map(s => `
     <div class="card sesion-hist" data-accion="abrir-registro" data-fecha="${s.fecha}">
      <div class="sh-top">
        <h3>${fechaLarga(s.fecha)}</h3>
        ${record !== null && s.maxKg === record ? `<span class="pr">🏆 Récord</span>` : ""}
      </div>
      <p class="series-hist">${s.series.map(r => `${r.kg ?? "–"}×${r.reps ?? "–"}`).join(" · ")}</p>
      <p>Volumen: ${redondear(s.volumen)} kg</p>
    </div>
  `).join("");

  return `
    ${volver}
    ${titulo}

    <div class="stats">
      <div class="stat"><div class="v">${record !== null ? redondear(record) : "—"}</div><div class="k">Récord (kg)</div></div>
      <div class="stat"><div class="v">${historial.length}</div><div class="k">Sesiones</div></div>
      <div class="stat"><div class="v ${claseCambio}">${cambio}</div><div class="k">Vs. anterior (kg)</div></div>
    </div>

    <h3 class="sec-title">Peso máximo por sesión</h3>
    <div class="grafico-card">${grafico(historial)}</div>

    <h3 class="sec-title">Historial</h3>
    <div class="historial">${sesiones}</div>
  `;
}

// ─────────────────────────────────────────
// 6. RENDER
// ─────────────────────────────────────────

// En qué pantallas se ve la tab bar (en login, formularios y sesión, no)
 const PANTALLAS_CON_TABBAR = ["inicio", "actividad", "actividad-todo", "ajustes", "alumno", "progreso"];

function render() {
  const app = document.getElementById("app");
  let html;

  if (vista === "login")                html = pantallaLogin();
  else if (vista === "actividad")       html = pantallaHoy();
  else if (vista === "actividad-todo")  html = pantallaActividad();
  else if (vista === "ajustes")         html = pantallaAjustes();
  else if (vista === "alumno")          html = pantallaAlumno(alumnoActual);
  else if (vista === "nuevo")           html = pantallaNuevo();
  else if (vista === "editar")          html = pantallaEditar(alumnoActual);
  else if (vista === "nuevo-ejercicio") html = pantallaNuevoEjercicio();
  else if (vista === "sesion")          html = pantallaEntreno();
  else if (vista === "registro")        html = pantallaRegistro();
  else if (vista === "progreso")        html = pantallaProgreso();
  else if (vista === "importar")        html = pantallaImportar();
  else if (vista === "editar-nutricion") html = pantallaEditarNutricion(alumnoActual);
  else if (vista === "editar-ejercicio") html = pantallaEditarEjercicio(ejercicioActual);
  else if (vista === "apariencia")      html = pantallaApariencia();
  else                                  html = pantallaInicio();

  // Agregamos la tab bar al final, solo donde corresponde
  if (PANTALLAS_CON_TABBAR.includes(vista)) {
    html += `<div class="espacio-tabbar"></div>` + tabbar();
  }

  app.innerHTML = html;
  aviso = "";

  if (vista !== vistaAnterior) window.scrollTo(0, 0);
  vistaAnterior = vista;
}

function actualizarProgreso() {
  const hechas = seriesHechas();
  const total = seriesTotales();
  document.getElementById("progreso-texto").textContent = `${hechas} de ${total} series`;
  document.getElementById("progreso-barra").style.width = `${total ? (hechas / total) * 100 : 0}%`;
}

// ─────────────────────────────────────────
// 7. CLICS
// ─────────────────────────────────────────
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;

  // ── Tab bar global ──
  if (accion === "ir") {
    const destino = boton.dataset.destino;
    if (destino === "alumnos") {
      alumnoActual = null;
      ejercicios = [];
      vista = "inicio";
      render();
    }
    if (destino === "actividad") {
      vista = "actividad";
      cargarActividad();
    }
    if (destino === "ajustes") {
      vista = "ajustes";
      render();
    }
  }

  // ── Segmented control del alumno ──
  if (accion === "seccion") {
    seccionAlumno = boton.dataset.seccion;
    if (seccionAlumno === "progreso") cargarResumen();
    else render();
  }

  if (accion === "abrir") {
    alumnoActual = alumnos.find(a => a.id === Number(boton.dataset.id));
    vista = "alumno";
    seccionAlumno = "rutina";
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
    if (seccionAlumno === "progreso") cargarResumen();
    else render();
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

  if (accion === "ver-progreso") {
    ejercicioActual = ejercicios.find(e => e.id === Number(boton.dataset.id));
    vista = "progreso";
    cargarHistorial();
  }

  if (accion === "confirmar-borrar-ejercicio") {
    const id = Number(boton.dataset.id);
    const ej = ejercicios.find(e => e.id === id);

    const respuesta = await db.from("ejercicios").delete().eq("id", id);
    if (respuesta.error) {
      alert("No se pudo borrar: " + respuesta.error.message);
      return;
    }
    ejercicios = ejercicios.filter(e => e.id !== id);
    render();
    mostrarToast(`✓ ${ej.nombre} quitado de la rutina`);
  }

  if (accion === "entrenar") {
    const grupos = agruparPorDia(ejercicios);
    const dias = Object.keys(grupos);
    sesionDia = dias[Number(boton.dataset.dia)];
    sesionEjercicios = grupos[sesionDia];
    sesionDatos = {};
    vista = "sesion";
    cargarUltimaVez();
  }

  if (accion === "salir-sesion") {
    if (seriesHechas() > 0 && !confirm("¿Salir sin guardar? Se pierde lo anotado.")) return;
    sesionDatos = {};
    vista = "alumno";
    render();
  }

  if (accion === "guardar-sesion") {
    const filas = [];
    sesionEjercicios.forEach(ej => {
      const series = sesionDatos[ej.id] || {};
      Object.keys(series).forEach(nroSerie => {
        const kg = numero(series[nroSerie].kg);
        const reps = numero(series[nroSerie].reps);
        if (kg === null && reps === null) return;

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

    const respuesta = await db.from("registros").insert(filas);

    if (respuesta.error) {
      alert("No se pudo guardar: " + respuesta.error.message);
      boton.disabled = false;
      boton.textContent = "Guardar sesión";
      return;
    }

    aviso = `¡Sesión guardada! ${filas.length} series registradas 💪`;
    diasUltimaSesion = { alumnoId: alumnoActual.id, dias: [sesionDia] };  // ahora le toca el día siguiente
    diaElegido = null;
    borrarBorrador();   // ya está guardado de verdad: el borrador no hace falta
    sesionDatos = {};
    vista = "alumno";
    seccionAlumno = "rutina";
    render();
  }

  if (accion === "confirmar-salir") {
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
// 7b. ESCRIBIR EN LA SESIÓN
// ─────────────────────────────────────────
document.addEventListener("input", (evento) => {
  const campo = evento.target;
  if (!campo.dataset.campo) return;

  const ej = campo.dataset.ej;
  const serie = campo.dataset.serie;

  if (!sesionDatos[ej]) sesionDatos[ej] = {};
  if (!sesionDatos[ej][serie]) sesionDatos[ej][serie] = {};

  sesionDatos[ej][serie][campo.dataset.campo] = campo.value;

  campo.classList.toggle("lleno", campo.value !== "");
  actualizarProgreso();
});

// ─────────────────────────────────────────
// 8. FORMULARIOS
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

  if (form.id === "form-login") {
    boton.textContent = "Entrando…";
    const respuesta = await db.auth.signInWithPassword({
      email: datos.email,
      password: datos.password,
    });
    if (respuesta.error) return fallo("Email o contraseña incorrectos.");

    usuario = respuesta.data.user;
     abrirHoy();
  }

  if (form.id === "form-nuevo") {
    boton.textContent = "Guardando…";
    const respuesta = await db.from("alumnos").insert(datos).select().single();
    if (respuesta.error) return fallo("No se pudo guardar: " + respuesta.error.message);

    alumnos.push(respuesta.data);
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    vista = "inicio";
    render();
  }

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
// 9. CARGAR DATOS
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
    .eq("activo", true)   // solo la rutina actual (los archivados quedan para el historial)
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

async function cargarUltimaVez() {
  cargandoSesion = true;
  ultimaVez = {};
  render();

  const ids = sesionEjercicios.map(ej => ej.id);

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
        const ultimaFecha = suyos[0].fecha;
        ultimaVez[ej.id] = suyos.filter(r => r.fecha === ultimaFecha);
      }
    });
  }

  cargandoSesion = false;
  render();
}

async function cargarHistorial() {
  cargandoHistorial = true;
  historial = [];
  render();

  const respuesta = await db
    .from("registros")
    .select("*")
    .eq("ejercicio_id", ejercicioActual.id)
    .order("fecha")
    .order("serie");

  if (respuesta.error) {
    alert("No se pudo cargar el historial: " + respuesta.error.message);
  } else {
    historial = agruparPorFecha(respuesta.data);
  }

  cargandoHistorial = false;
  render();
}

async function cargarResumen() {
  cargandoResumen = true;
  render();

  const respuesta = await db
    .from("registros")
    .select("*")
    .eq("alumno_id", alumnoActual.id)
    .order("fecha")
    .order("serie");

  if (respuesta.error) {
    alert("No se pudo cargar el progreso: " + respuesta.error.message);
  } else {
    const registros = respuesta.data;
    resumen = {
      porEjercicio: ejercicios.map(ej => ({
        ej,
        sesiones: agruparPorFecha(registros.filter(r => r.ejercicio_id === ej.id)),
      })),
      fechas: [...new Set(registros.map(r => r.fecha))].sort(),
    };
  }

  cargandoResumen = false;
  render();
}

// Trae los entrenamientos de TODOS los alumnos.
// "ejercicios(dia)" = "traeme también el día del ejercicio relacionado"
// (Supabase sigue la conexión ejercicio_id → ejercicios solito)
async function cargarActividad() {
  cargandoActividad = true;
  render();

  const respuesta = await db
    .from("registros")
    .select("fecha, alumno_id, ejercicios(dia)")
    .order("fecha", { ascending: false })
    .limit(2000);

  if (respuesta.error) {
    alert("No se pudo cargar la actividad: " + respuesta.error.message);
  } else {
    // Una "sesión" = un alumno en una fecha
    const grupos = {};
    respuesta.data.forEach(r => {
      const clave = r.fecha + "|" + r.alumno_id;
      if (!grupos[clave]) {
        grupos[clave] = { fecha: r.fecha, alumnoId: r.alumno_id, dias: new Set(), series: 0 };
      }
      grupos[clave].series++;
      if (r.ejercicios) grupos[clave].dias.add(r.ejercicios.dia);
    });
    actividad = Object.values(grupos);
  }

  cargandoActividad = false;
  render();
}

// ─────────────────────────────────────────
// 10. ARRANQUE
// ─────────────────────────────────────────
async function iniciar() {
  const sesion = await db.auth.getSession();
  usuario = sesion.data.session ? sesion.data.session.user : null;

  if (usuario) {
    abrirHoy();
  } else {
    vista = "login";
    render();
  }
}

// Arranca cuando el navegador terminó de leer TODOS los archivos .js
document.addEventListener("DOMContentLoaded", iniciar);