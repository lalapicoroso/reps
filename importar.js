// ─────────────────────────────────────────
// IMPORTAR DESDE GOOGLE SHEETS (archivos .csv)
// Este archivo usa variables y funciones de app.js
// (alumnoActual, ejercicios, db, render, vista...)
// ─────────────────────────────────────────

let importacion = nuevaImportacion();

function nuevaImportacion() {
  return {
    rutina: null,        // ejercicios leídos de TRAINING
    log: null,           // series leídas de LOG
    archivoRutina: "",
    archivoLog: "",
    errorRutina: "",
    errorLog: "",
    importando: false,
    mensaje: "",
  };
}

// Evita que un texto de la planilla con "<" o ">" rompa el HTML
function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// "Hip Thrust (barra)" → "hip thrust" (para comparar nombres)
function claveEjercicio(nombre) {
  return String(nombre).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// "17/11/2026" o "2026-11-17" → "2026-11-17"
function fechaISO(valor) {
  const s = String(valor || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const anio = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// ─────────────────────────────────────────
// 1. LEER EL CSV
//    Convierte el texto del archivo en filas y columnas,
//    respetando las comillas ("62,5" es UN valor, no dos)
// ─────────────────────────────────────────
function leerCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }   // "" = una comilla
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      fila.push(campo); campo = "";
    } else if (c === "\n") {
      fila.push(campo); filas.push(fila);
      fila = []; campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// ─────────────────────────────────────────
// 2. ENTENDER CADA PESTAÑA
// ─────────────────────────────────────────

// TRAINING: filas "Día 1 | Ejercicio | ..." abren un día nuevo;
// abajo: grupo muscular | ejercicio | series | reps
function interpretarRutina(filas) {
  const lista = [];
  const grupoDelDia = {};
  let dia = null;

  filas.forEach(f => {
    const a = (f[0] || "").trim();
    const b = (f[1] || "").trim();

    if (/^d[ií]a\s*\d+/i.test(a) && /ejercicio/i.test(b)) {
      dia = a;
      return;
    }
    if (!dia) return;
    if (a && !grupoDelDia[dia]) grupoDelDia[dia] = a;
    if (b) {
      lista.push({
        dia,
        nombre: b,
        series: Math.max(1, Math.min(10, parseInt(f[2]) || 3)),
        reps: (f[3] || "").trim(),
      });
    }
  });

  if (!lista.length) {
    throw new Error("No encontré días. ¿Es la pestaña TRAINING? Tiene que tener filas tipo «Día 1 | Ejercicio».");
  }

  // "Día 1" + "Glúteos" → "Día 1 - Glúteos"
  return lista.map(ej => ({
    ...ej,
    dia: grupoDelDia[ej.dia] ? `${ej.dia} - ${grupoDelDia[ej.dia]}` : ej.dia,
  }));
}

// LOG: busca las columnas por su título (no importa el orden)
function interpretarLog(filas) {
  const titulos = (filas[0] || []).map(t => t.toLowerCase());
  const columna = (...nombres) => titulos.findIndex(t => nombres.some(n => t.includes(n)));

  const iFecha = columna("fecha");
  const iDia = columna("día", "dia");
  const iEj = columna("ejercicio");
  const iSerie = columna("serie");
  const iKg = columna("carga", "kg", "peso");
  const iReps = columna("reps", "repeticiones");

  if (iFecha < 0 || iEj < 0) {
    throw new Error("No encontré las columnas «Fecha» y «Ejercicio». ¿Es la pestaña LOG?");
  }

  const series = filas.slice(1).map(f => ({
    fecha: fechaISO(f[iFecha]),
    dia: iDia >= 0 ? (f[iDia] || "").trim() : "",
    ejercicio: (f[iEj] || "").trim(),
    serie: parseInt(f[iSerie]) || 1,
    kg: iKg >= 0 ? numero(f[iKg]) : null,
    reps: iReps >= 0 ? numero(f[iReps]) : null,
  })).filter(r => r.fecha && r.ejercicio);

  if (!series.length) throw new Error("La pestaña LOG no tiene series con fecha.");
  return series;
}

// ─────────────────────────────────────────
// 3. PANTALLA
// ─────────────────────────────────────────
function zonaCarga(tipo, titulo, subtitulo, archivo, ok, error) {
  const estado = error || ok || archivo || "Tocá para elegir el archivo .csv";
  return `
    <label class="carga ${ok ? "ok" : ""} ${error ? "mal" : ""}">
      <input type="file" accept=".csv,text/csv" data-importar="${tipo}">
      <span class="carga-titulo">${titulo} <small>${subtitulo}</small></span>
      <span class="carga-estado">${escapar(estado)}</span>
    </label>
  `;
}

function pantallaImportar() {
  const imp = importacion;

  const okRutina = imp.rutina
    ? `✓ ${new Set(imp.rutina.map(e => e.dia)).size} días · ${imp.rutina.length} ejercicios`
    : "";
  const okLog = imp.log
    ? `✓ ${imp.log.length} series en ${new Set(imp.log.map(r => r.fecha)).size} fechas`
    : "";

  // Vista previa de la rutina
  let previa = "";
  if (imp.rutina) {
    const grupos = agruparPorDia(imp.rutina);
    previa = `<h3 class="sec-title">Vista previa</h3>` + Object.keys(grupos).map(dia => `
      <div class="card previa">
        <h3>${escapar(dia)}</h3>
        <p>${grupos[dia].map(e => `${escapar(e.nombre)} <span class="presc">${e.series} × ${escapar(e.reps) || "—"}</span>`).join("<br>")}</p>
      </div>
    `).join("");
  }

  const listo = (imp.rutina || imp.log) && !imp.importando;

  return `
    <button class="volver" data-accion="volver-alumno">← ${alumnoActual.nombre}</button>
    <h1 class="titulo">Importar planilla</h1>

    <div class="importar">
      <div class="card pasos">
        <ol>
          <li>Abrí la planilla de <b>${alumnoActual.nombre}</b> en Google Sheets (en la compu).</li>
          <li>Pestaña <b>TRAINING</b> → <b>Archivo → Descargar → Valores separados por comas (.csv)</b>.</li>
          <li>Si tiene historial, lo mismo con la pestaña <b>LOG</b>.</li>
          <li>Subí los archivos acá 👇</li>
        </ol>
      </div>

      ${zonaCarga("rutina", "Rutina", "pestaña TRAINING", imp.archivoRutina, okRutina, imp.errorRutina)}
      ${zonaCarga("log", "Historial", "pestaña LOG · opcional", imp.archivoLog, okLog, imp.errorLog)}

      ${previa}

      ${imp.mensaje ? `<p class="error">${escapar(imp.mensaje)}</p>` : ""}

      <button class="btn" data-accion="ejecutar-import" ${listo ? "" : "disabled"}>
        ${imp.importando ? "Importando…" : `Importar a ${alumnoActual.nombre}`}
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────
// 4. CUANDO ELEGÍS UN ARCHIVO
//    "change" = el input cambió (se eligió un archivo)
// ─────────────────────────────────────────
document.addEventListener("change", async (evento) => {
  const input = evento.target;
  const tipo = input.dataset && input.dataset.importar;
  if (!tipo || !input.files.length) return;

  const archivo = input.files[0];
  const texto = await archivo.text();   // lee el archivo como texto
  const filas = leerCSV(texto);

  if (tipo === "rutina") {
    importacion.archivoRutina = archivo.name;
    importacion.errorRutina = "";
    try {
      importacion.rutina = interpretarRutina(filas);
    } catch (e) {
      importacion.rutina = null;
      importacion.errorRutina = "⚠️ " + e.message;
    }
  }

  if (tipo === "log") {
    importacion.archivoLog = archivo.name;
    importacion.errorLog = "";
    try {
      importacion.log = interpretarLog(filas);
    } catch (e) {
      importacion.log = null;
      importacion.errorLog = "⚠️ " + e.message;
    }
  }

  render();
});

// ─────────────────────────────────────────
// 5. BOTONES DE ESTA PANTALLA
//    (un "escuchador" propio, aparte del de app.js)
// ─────────────────────────────────────────
document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  if (boton.dataset.accion === "abrir-importar") {
    importacion = nuevaImportacion();
    vista = "importar";
    render();
  }

  if (boton.dataset.accion === "ejecutar-import") {
    await ejecutarImportacion();
  }
});

// ─────────────────────────────────────────
// 6. GUARDAR EN SUPABASE (sin duplicar)
// ─────────────────────────────────────────
async function ejecutarImportacion() {
  const imp = importacion;
  const alumno = alumnoActual;

  imp.importando = true;
  imp.mensaje = "";
  render();

  try {
    // ── A. Ejercicios ──
    // Map = un "diccionario": nombre → ejercicio
    const porNombre = new Map(ejercicios.map(e => [claveEjercicio(e.nombre), e]));
    const nuevos = [];

    function agregar(dia, nombre, series, reps) {
      const clave = claveEjercicio(nombre);
      if (porNombre.has(clave)) return;                                    // ya existe
      if (nuevos.some(n => claveEjercicio(n.nombre) === clave)) return;    // ya lo sumamos
      nuevos.push({ alumno_id: alumno.id, dia, nombre, series, reps, orden: ejercicios.length + nuevos.length });
    }

    // Los de la rutina
    (imp.rutina || []).forEach(e => agregar(e.dia, e.nombre, e.series, e.reps));

    // Los que aparecen en el historial pero no en la rutina
    const diasRutina = [...new Set((imp.rutina || []).map(e => e.dia))];
    (imp.log || []).forEach(r => {
      const mismas = imp.log.filter(x => claveEjercicio(x.ejercicio) === claveEjercicio(r.ejercicio));
      const series = Math.min(10, Math.max(...mismas.map(x => x.serie)));
      // "Día 1" del LOG → "Día 1 - Glúteos" de la rutina, si existe
      const dia = diasRutina.find(d => d === r.dia || d.startsWith(r.dia + " -")) || r.dia || "Importados";
      agregar(dia, r.ejercicio, series, "");
    });

    if (nuevos.length) {
      const respuesta = await db.from("ejercicios").insert(nuevos).select();
      if (respuesta.error) throw respuesta.error;
      respuesta.data.forEach(e => porNombre.set(claveEjercicio(e.nombre), e));
    }

    // ── B. Series del historial ──
    let seriesNuevas = 0;

    if (imp.log && imp.log.length) {
      // Qué series ya están guardadas, para no repetirlas
      const yaGuardadas = await db
        .from("registros")
        .select("ejercicio_id, fecha, serie")
        .eq("alumno_id", alumno.id);
      if (yaGuardadas.error) throw yaGuardadas.error;

      // Set = una lista sin repetidos, rápida para preguntar "¿está?"
      const existentes = new Set(yaGuardadas.data.map(r => `${r.ejercicio_id}|${r.fecha}|${r.serie}`));
      const filas = [];

      imp.log.forEach(r => {
        const ej = porNombre.get(claveEjercicio(r.ejercicio));
        if (!ej) return;
        const clave = `${ej.id}|${r.fecha}|${r.serie}`;
        if (existentes.has(clave)) return;
        existentes.add(clave);
        filas.push({
          alumno_id: alumno.id,
          ejercicio_id: ej.id,
          fecha: r.fecha,
          serie: r.serie,
          kg: r.kg,
          reps: r.reps === null ? null : Math.round(r.reps),
        });
      });

      // Guardamos de a 500 filas, para no mandar un paquete gigante
      for (let i = 0; i < filas.length; i += 500) {
        const respuesta = await db.from("registros").insert(filas.slice(i, i + 500));
        if (respuesta.error) throw respuesta.error;
      }
      seriesNuevas = filas.length;
    }

    // ── C. Listo: volvemos al alumno con la rutina actualizada ──
    importacion = nuevaImportacion();
    vista = "alumno";
    seccionAlumno = "rutina";
    await cargarEjercicios();
    aviso = `Importación lista: ${nuevos.length} ejercicios y ${seriesNuevas} series nuevas ✓`;
    render();

  } catch (e) {
    imp.importando = false;
    imp.mensaje = "No se pudo importar: " + (e.message || e) + ". Podés reintentar: no se duplica nada.";
    render();
  }
}