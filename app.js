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
let vista = "inicio";        // "login" | "inicio" | "alumno" | "nuevo" | "editar" | "nuevo-ejercicio" | "sesion" | "progreso"
let vistaAnterior = null;
let alumnos = [];
let cargando = true;
let error = null;
let alumnoActual = null;
let aviso = "";

let ejercicios = [];
let cargandoEjercicios = false;
let ultimoDia = "";

// Sesión de entrenamiento
let sesionDia = null;
let sesionEjercicios = [];
let sesionDatos = {};
let ultimaVez = {};
let cargandoSesion = false;

// Progreso de un ejercicio
let ejercicioActual = null;
let historial = [];          // sesiones agrupadas por fecha
let cargandoHistorial = false;

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

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fechaCorta(iso) {
  const partes = iso.split("-");
  return `${partes[2]}/${partes[1]}`;
}

// "2026-11-17" → "lun, 17 nov"
function fechaLarga(iso) {
  return new Date(iso + "T12:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

// 57.49999 → 57.5 / 60 → 60
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

// Agrupa los registros por fecha y calcula datos de cada sesión:
// [serie, serie, serie...] → [ { fecha, series, maxKg, volumen }, ... ]
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
      // volumen = suma de (kg × reps) de todas las series
      volumen: series.reduce((total, s) => total + (s.kg || 0) * (s.reps || 0), 0),
    };
  });
}

// ─────────────────────────────────────────
// 3b. GRÁFICO (SVG dibujado con código)
// ─────────────────────────────────────────
function grafico(sesiones) {
  const puntos = sesiones.filter(s => s.maxKg !== null);

  if (puntos.length < 2) {
    return `<p class="vacio">Con 2 sesiones o más vas a ver el gráfico 📈</p>`;
  }

  // Tamaño del dibujo y márgenes (como un frame con padding)
  const W = 358, H = 170;
  const m = { arriba: 20, derecha: 16, abajo: 28, izquierda: 40 };

  const valores = puntos.map(p => p.maxKg);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) { min -= 5; max += 5; }   // si todo es igual, damos aire

  // Convierten "número de sesión" y "kg" en coordenadas x/y del dibujo
  const x = i => m.izquierda + (i / (puntos.length - 1)) * (W - m.izquierda - m.derecha);
  const y = kg => m.arriba + (1 - (kg - min) / (max - min)) * (H - m.arriba - m.abajo);

  // Una línea SVG se escribe como "M x,y L x,y L x,y" (Mover, Línea, Línea...)
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

// La pantalla de progreso de un ejercicio
function pantallaProgreso() {
  const ej = ejercicioActual;
  const volver = `<button class="volver" data-accion="volver-alumno">← ${alumnoActual.nombre}</button>`;
  const titulo = `
    <h1 class="titulo">${ej.nombre}</h1>
    <p class="presc-grande">${ej.series} × ${ej.reps || "—"} · ${ej.dia}</p>
  `;

  if (cargandoHistorial) {
    return volver + titulo + `<p class="subtitulo">Cargando historial…</p>`;
  }

  if (!historial.length) {
    return volver + titulo + `<p class="vacio">Todavía no hay entrenamientos registrados.<br>Tocá "Entrenar ▶" en la rutina para empezar 💪</p>`;
  }

  // ── Números destacados ──
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

  // ── Lista de sesiones (la más nueva primero) ──
  const sesiones = [...historial].reverse().map(s => `
    <div class="card sesion-hist">
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
  else if (vista === "progreso")        app.innerHTML = pantallaProgreso();
  else                                  app.innerHTML = pantallaInicio();

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

  // ── Ver el progreso de un ejercicio ──
  if (accion === "ver-progreso") {
    ejercicioActual = ejercicios.find(e => e.id === Number(boton.dataset.id));
    vista = "progreso";
    cargarHistorial();
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

// Trae TODO el historial de un ejercicio, del más viejo al más nuevo
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