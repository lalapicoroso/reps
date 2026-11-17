// ─────────────────────────────────────────
// IMPORTAR DESDE GOOGLE SHEETS (.xlsx o .csv)
// Usa variables y funciones de app.js (alumnoActual, ejercicios, db, render...)
// y la librería SheetJS (XLSX) que carga index.html
// ─────────────────────────────────────────

let importacion = nuevaImportacion();

function nuevaImportacion() {
  return {
    archivo: "",          // nombre del archivo elegido
    libro: null,          // el Excel ya leído (todas las pestañas)
    hojasTraining: [],    // pestañas que empiezan con "TRAINING"
    hojaTraining: "",     // la elegida
    otras: [],            // pestañas que todavía no importamos
    rutina: null,
    log: null,
    error: "",            // error general del archivo
    errorRutina: "",
    infoLog: "",          // aviso suave sobre el historial
    importando: false,
    mensaje: "",
  };
}

// ─────────────────────────────────────────
// AYUDANTES
// ─────────────────────────────────────────
function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Cualquier valor de celda → texto limpio
function textoCelda(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function claveEjercicio(nombre) {
  return String(nombre).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Fechas: Excel las guarda como NÚMERO (días desde 1900).
// También aceptamos texto: "17/11/2026" o "2026-11-17"
function fechaISO(valor) {
  if (typeof valor === "number") {
    const d = new Date(Math.round((valor - 25569) * 86400000));   // número de Excel → fecha
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = textoCelda(valor);
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
// 1. LEER CSV (para los que suban un .csv)
// ─────────────────────────────────────────
function leerCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
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
function interpretarRutina(filas) {
  const lista = [];
  const grupoDelDia = {};
  let dia = null;

  filas.forEach(f => {
    const a = textoCelda(f[0]);
    const b = textoCelda(f[1]);

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
        reps: textoCelda(f[3]),
      });
    }
  });

  if (!lista.length) {
    throw new Error("No encontré días: la pestaña tiene que tener filas tipo «Día 1 | Ejercicio».");
  }

  return lista.map(ej => ({
    ...ej,
    dia: grupoDelDia[ej.dia] ? `${ej.dia} - ${grupoDelDia[ej.dia]}` : ej.dia,
  }));
}

function interpretarLog(filas) {
  const titulos = (filas[0] || []).map(t => textoCelda(t).toLowerCase());
  const columna = (...nombres) => titulos.findIndex(t => nombres.some(n => t.includes(n)));

  const iFecha = columna("fecha");
  const iDia = columna("día", "dia");
  const iEj = columna("ejercicio");
  const iSerie = columna("serie");
  const iKg = columna("carga", "kg", "peso");
  const iReps = columna("reps", "repeticiones");

  if (iFecha < 0 || iEj < 0) {
    throw new Error("No encontré las columnas «Fecha» y «Ejercicio».");
  }

  const series = filas.slice(1).map(f => ({
    fecha: fechaISO(f[iFecha]),
    dia: iDia >= 0 ? textoCelda(f[iDia]) : "",
    ejercicio: textoCelda(f[iEj]),
    serie: parseInt(f[iSerie]) || 1,
    kg: iKg >= 0 ? numero(f[iKg]) : null,
    reps: iReps >= 0 ? numero(f[iReps]) : null,
  })).filter(r => r.fecha && r.ejercicio);

  if (!series.length) throw new Error("La pestaña LOG está vacía.");
  return series;
}

// ─────────────────────────────────────────
// 3. LEER EL ARCHIVO ELEGIDO
// ─────────────────────────────────────────

// Convierte una pestaña del Excel en filas y columnas
function filasDeHoja(libro, nombre) {
  return XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "" });
}

function leerRutinaDeHoja(imp) {
  imp.errorRutina = "";
  try {
    imp.rutina = interpretarRutina(filasDeHoja(imp.libro, imp.hojaTraining));
  } catch (e) {
    imp.rutina = null;
    imp.errorRutina = e.message;
  }
}

async function leerArchivo(archivo) {
  const imp = nuevaImportacion();
  imp.archivo = archivo.name;

  // ── Si es un .csv: probamos si es TRAINING, y si no, LOG ──
  if (/\.csv$/i.test(archivo.name)) {
    const filas = leerCSV(await archivo.text());
    try {
      imp.rutina = interpretarRutina(filas);
    } catch {
      try {
        imp.log = interpretarLog(filas);
      } catch {
        imp.error = "No reconocí ese CSV: no parece ni la pestaña TRAINING ni la LOG. Probá con el .xlsx completo.";
      }
    }
    return imp;
  }

  // ── Si es un .xlsx: leemos todas las pestañas ──
  if (typeof XLSX === "undefined") {
    imp.error = "No se cargó la librería para leer Excel. Revisá la línea de SheetJS en index.html.";
    return imp;
  }

  try {
    imp.libro = XLSX.read(await archivo.arrayBuffer());
  } catch {
    imp.error = "No pude abrir ese archivo. ¿Es un .xlsx descargado de Google Sheets?";
    return imp;
  }

  const nombres = imp.libro.SheetNames;   // ["Inicio", "TRAINING", "LOG", ...]
  imp.hojasTraining = nombres.filter(n => /^training/i.test(n.trim()));
  const hojaLog = nombres.find(n => /^log$/i.test(n.trim()));
  imp.otras = nombres.filter(n => !imp.hojasTraining.includes(n) && n !== hojaLog);

  if (!imp.hojasTraining.length && !hojaLog) {
    imp.error = "No encontré pestañas TRAINING ni LOG en este archivo.";
    return imp;
  }

  // Rutina: por defecto la ÚLTIMA pestaña TRAINING (la fase más nueva)
  if (imp.hojasTraining.length) {
    imp.hojaTraining = imp.hojasTraining[imp.hojasTraining.length - 1];
    leerRutinaDeHoja(imp);
  }

  // Historial
  if (hojaLog) {
    try {
      imp.log = interpretarLog(filasDeHoja(imp.libro, hojaLog));
    } catch (e) {
      imp.infoLog = e.message;
    }
  } else {
    imp.infoLog = "No hay pestaña LOG.";
  }

  return imp;
}

// ─────────────────────────────────────────
// 4. PANTALLA
// ─────────────────────────────────────────
function pantallaImportar() {
  const imp = importacion;

  // Zona de carga
  let estado = "Tocá para elegir el archivo .xlsx";
  if (imp.error) estado = "⚠️ " + imp.error;
  else if (imp.archivo) estado = "✓ " + imp.archivo;

  const zona = `
    <label class="carga ${imp.archivo && !imp.error ? "ok" : ""} ${imp.error ? "mal" : ""}">
      <input type="file" accept=".xlsx,.csv" data-importar="archivo">
      <span class="carga-titulo">Planilla <small>.xlsx · todas las pestañas</small></span>
      <span class="carga-estado">${escapar(estado)}</span>
    </label>
  `;

  // Qué encontró
  let encontrado = "";
  if (imp.archivo && !imp.error) {
    // Rutina
    let filaRutina;
    if (imp.rutina) {
      const dias = new Set(imp.rutina.map(e => e.dia)).size;
      filaRutina = `<span class="ok-txt">✓ ${dias} días · ${imp.rutina.length} ejercicios</span>`;
    } else if (imp.errorRutina) {
      filaRutina = `<span class="mal-txt">⚠️ ${escapar(imp.errorRutina)}</span>`;
    } else {
      filaRutina = `<span class="gris-txt">No hay pestaña TRAINING</span>`;
    }

    // Selector de fase, si hay más de una pestaña TRAINING
    const selector = imp.hojasTraining.length > 1 ? `
      <select class="selector" data-importar="hoja">
        ${imp.hojasTraining.map(h => `<option value="${escapar(h)}" ${h === imp.hojaTraining ? "selected" : ""}>${escapar(h)}</option>`).join("")}
      </select>
    ` : "";

    // Historial
    const filaLog = imp.log
      ? `<span class="ok-txt">✓ ${imp.log.length} series en ${new Set(imp.log.map(r => r.fecha)).size} fechas</span>`
      : `<span class="gris-txt">${escapar(imp.infoLog || "Sin historial")}</span>`;

    // Otras pestañas
    const filaOtras = imp.otras.length ? `
      <div class="fila-enc">
        <b>Más adelante</b>
        <span class="gris-txt">${imp.otras.map(escapar).join(", ")} · se van a poder importar cuando sumemos Nutrición y Seguimiento</span>
      </div>
    ` : "";

    encontrado = `
      <h3 class="sec-title">Qué encontré</h3>
      <div class="card encontrado">
        <div class="fila-enc"><b>Rutina</b>${selector}${filaRutina}</div>
        <div class="fila-enc"><b>Historial</b>${filaLog}</div>
        ${filaOtras}
      </div>
    `;
  }

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
          <li><b>Archivo → Descargar → Microsoft Excel (.xlsx)</b>. Baja todas las pestañas juntas.</li>
          <li>Subí ese archivo acá 👇</li>
        </ol>
      </div>

      ${zona}
      ${encontrado}
      ${previa}

      ${imp.mensaje ? `<p class="error">${escapar(imp.mensaje)}</p>` : ""}

      <button class="btn" data-accion="ejecutar-import" ${listo ? "" : "disabled"}>
        ${imp.importando ? "Importando…" : `Importar a ${alumnoActual.nombre}`}
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────
// 5. CUANDO ELEGÍS EL ARCHIVO O CAMBIÁS DE FASE
// ─────────────────────────────────────────
document.addEventListener("change", async (evento) => {
  const campo = evento.target;
  const tipo = campo.dataset && campo.dataset.importar;
  if (!tipo) return;

  if (tipo === "archivo" && campo.files.length) {
    importacion = await leerArchivo(campo.files[0]);
    render();
  }

  if (tipo === "hoja") {
    importacion.hojaTraining = campo.value;
    leerRutinaDeHoja(importacion);
    render();
  }
});

// ─────────────────────────────────────────
// 6. BOTONES DE ESTA PANTALLA
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
// 7. GUARDAR EN SUPABASE (sin duplicar)
// ─────────────────────────────────────────
async function ejecutarImportacion() {
  const imp = importacion;
  const alumno = alumnoActual;

  imp.importando = true;
  imp.mensaje = "";
  render();

  try {
    // ── A. Ejercicios ──
    const porNombre = new Map(ejercicios.map(e => [claveEjercicio(e.nombre), e]));
    const nuevos = [];

    function agregar(dia, nombre, series, reps) {
      const clave = claveEjercicio(nombre);
      if (porNombre.has(clave)) return;
      if (nuevos.some(n => claveEjercicio(n.nombre) === clave)) return;
      nuevos.push({ alumno_id: alumno.id, dia, nombre, series, reps, orden: ejercicios.length + nuevos.length });
    }

    (imp.rutina || []).forEach(e => agregar(e.dia, e.nombre, e.series, e.reps));

    const diasRutina = [...new Set((imp.rutina || []).map(e => e.dia))];
    (imp.log || []).forEach(r => {
      const mismas = imp.log.filter(x => claveEjercicio(x.ejercicio) === claveEjercicio(r.ejercicio));
      const series = Math.min(10, Math.max(...mismas.map(x => x.serie)));
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
      const yaGuardadas = await db
        .from("registros")
        .select("ejercicio_id, fecha, serie")
        .eq("alumno_id", alumno.id);
      if (yaGuardadas.error) throw yaGuardadas.error;

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

      for (let i = 0; i < filas.length; i += 500) {
        const respuesta = await db.from("registros").insert(filas.slice(i, i + 500));
        if (respuesta.error) throw respuesta.error;
      }
      seriesNuevas = filas.length;
    }

    // ── C. Listo ──
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