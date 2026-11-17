// ─────────────────────────────────────────
// IMPORTAR DESDE GOOGLE SHEETS (.xlsx o .csv)
// Usa variables y funciones de app.js y la librería SheetJS (XLSX)
// ─────────────────────────────────────────

let importacion = nuevaImportacion();

function nuevaImportacion() {
  return {
    archivo: "",
    libro: null,
    hojasTraining: [],
    hojaTraining: "",
    otras: [],
    rutina: null,
    log: null,
    nutricion: null,      // objetivos leídos de "Inicio"
    error: "",
    errorRutina: "",
    infoLog: "",
    infoNutricion: "",
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

function textoCelda(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function claveEjercicio(nombre) {
  return String(nombre).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function fechaISO(valor) {
  if (typeof valor === "number") {
    const d = new Date(Math.round((valor - 25569) * 86400000));
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
// 1. LEER CSV
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

// Inicio: filas "Clave | Valor" → objetivos de nutrición
// Solo leemos estas claves; el resto de la pestaña no se toca.
function interpretarInicio(filas) {
  const datos = {};
  filas.forEach(f => {
    const clave = textoCelda(f[0]).toLowerCase();
    if (clave) datos[clave] = textoCelda(f[1]);
  });

  const buscar = (...nombres) => {
    const clave = Object.keys(datos).find(k => nombres.some(n => k.startsWith(n)));
    return clave ? datos[clave] : "";
  };

  // "~1.900–1.950 kcal/día" → [1900, 1950] → promedio 1925
  const promedio = texto => {
    const numeros = (String(texto).replace(/\./g, "").match(/\d+(?:,\d+)?/g) || [])
      .slice(0, 2)
      .map(n => parseFloat(n.replace(",", ".")));
    return numeros.length ? Math.round(numeros.reduce((a, b) => a + b, 0) / numeros.length) : null;
  };

  const nutricion = {
    kcal: promedio(buscar("calorías", "calorias")),
    proteina: promedio(buscar("proteína", "proteina")),
    grasas: promedio(buscar("grasas")),
    carbos: promedio(buscar("carbohidratos", "carbos")),
    pasos: buscar("pasos") || null,
    agua: buscar("agua") || null,
    notas_nutricion: buscar("regla principal") || null,
  };

  if (!nutricion.kcal && !nutricion.proteina && !nutricion.grasas && !nutricion.carbos) {
    throw new Error("No encontré calorías ni macros.");
  }
  return nutricion;
}

// ─────────────────────────────────────────
// 3. LEER EL ARCHIVO ELEGIDO
// ─────────────────────────────────────────
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

  if (/\.csv$/i.test(archivo.name)) {
    const filas = leerCSV(await archivo.text());
    try {
      imp.rutina = interpretarRutina(filas);
    } catch {
      try {
        imp.log = interpretarLog(filas);
      } catch {
        imp.error = "No reconocí ese CSV. Probá con el .xlsx completo.";
      }
    }
    return imp;
  }

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

  const nombres = imp.libro.SheetNames;
  imp.hojasTraining = nombres.filter(n => /^training/i.test(n.trim()));
  const hojaLog = nombres.find(n => /^log$/i.test(n.trim()));
  const hojaInicio = nombres.find(n => /^inicio$/i.test(n.trim()));
  imp.otras = nombres.filter(n => !imp.hojasTraining.includes(n) && n !== hojaLog && n !== hojaInicio);

  if (!imp.hojasTraining.length && !hojaLog && !hojaInicio) {
    imp.error = "No encontré pestañas TRAINING, LOG ni Inicio en este archivo.";
    return imp;
  }

  if (imp.hojasTraining.length) {
    imp.hojaTraining = imp.hojasTraining[imp.hojasTraining.length - 1];
    leerRutinaDeHoja(imp);
  }

  if (hojaLog) {
    try { imp.log = interpretarLog(filasDeHoja(imp.libro, hojaLog)); }
    catch (e) { imp.infoLog = e.message; }
  } else {
    imp.infoLog = "No hay pestaña LOG.";
  }

  if (hojaInicio) {
    try { imp.nutricion = interpretarInicio(filasDeHoja(imp.libro, hojaInicio)); }
    catch (e) { imp.infoNutricion = e.message; }
  } else {
    imp.infoNutricion = "No hay pestaña Inicio.";
  }

  return imp;
}

// ─────────────────────────────────────────
// 4. PANTALLA
// ─────────────────────────────────────────
function pantallaImportar() {
  const imp = importacion;

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

  let encontrado = "";
  if (imp.archivo && !imp.error) {
    let filaRutina;
    if (imp.rutina) {
      const dias = new Set(imp.rutina.map(e => e.dia)).size;
      filaRutina = `<span class="ok-txt">✓ ${dias} días · ${imp.rutina.length} ejercicios</span>`;
    } else if (imp.errorRutina) {
      filaRutina = `<span class="mal-txt">⚠️ ${escapar(imp.errorRutina)}</span>`;
    } else {
      filaRutina = `<span class="gris-txt">No hay pestaña TRAINING</span>`;
    }

    const selector = imp.hojasTraining.length > 1 ? `
      <select class="selector" data-importar="hoja">
        ${imp.hojasTraining.map(h => `<option value="${escapar(h)}" ${h === imp.hojaTraining ? "selected" : ""}>${escapar(h)}</option>`).join("")}
      </select>
    ` : "";

    const filaLog = imp.log
      ? `<span class="ok-txt">✓ ${imp.log.length} series en ${new Set(imp.log.map(r => r.fecha)).size} fechas</span>`
      : `<span class="gris-txt">${escapar(imp.infoLog || "Sin historial")}</span>`;

    const n = imp.nutricion;
    const filaNutricion = n
      ? `<span class="ok-txt">✓ ${n.kcal ? n.kcal + " kcal · " : ""}P ${n.proteina ?? "—"} · G ${n.grasas ?? "—"} · C ${n.carbos ?? "—"}</span>`
      : `<span class="gris-txt">${escapar(imp.infoNutricion || "Sin objetivos")}</span>`;

    const filaOtras = imp.otras.length ? `
      <div class="fila-enc">
        <b>Más adelante</b>
        <span class="gris-txt">${imp.otras.map(escapar).join(", ")} · se van a poder importar cuando sumemos Seguimiento</span>
      </div>
    ` : "";

    encontrado = `
      <h3 class="sec-title">Qué encontré</h3>
      <div class="card encontrado">
        <div class="fila-enc"><b>Rutina</b>${selector}${filaRutina}</div>
        <div class="fila-enc"><b>Historial</b>${filaLog}</div>
        <div class="fila-enc"><b>Nutrición</b>${filaNutricion}</div>
        ${filaOtras}
      </div>
    `;
  }

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

  const listo = (imp.rutina || imp.log || imp.nutricion) && !imp.importando;

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

      ${imp.rutina && ejercicios.length ? `
        <p class="ayuda izq">La rutina del archivo <b>reemplaza</b> a la actual. Los ejercicios que ya no estén se archivan: su historial se conserva.</p>
      ` : ""}

      <button class="btn" data-accion="ejecutar-import" ${listo ? "" : "disabled"}>
        ${imp.importando ? "Importando…" : imp.rutina && ejercicios.length ? "Reemplazar rutina e importar" : `Importar a ${alumnoActual.nombre}`}
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
// 6. BOTONES
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
    const imp = importacion;
    // Si ya tiene rutina, primero confirmamos el reemplazo
    if (imp.rutina && ejercicios.length) {
      const diasAhora = Object.keys(agruparPorDia(ejercicios)).length;
      const diasArchivo = new Set(imp.rutina.map(e => e.dia)).size;
      pedirConfirmacion({
        titulo: `¿Reemplazar la rutina de ${escapar(alumnoActual.nombre)}?`,
        texto: `Actual: <strong>${diasAhora} ${diasAhora === 1 ? "día" : "días"} · ${ejercicios.length} ejercicios</strong><br>Archivo: <strong>${diasArchivo} ${diasArchivo === 1 ? "día" : "días"} · ${imp.rutina.length} ejercicios</strong><br><br>Los ejercicios que ya no estén se archivan: su historial y su progreso se conservan.`,
        no: "Cancelar",
        si: "Reemplazar e importar",
        accion: "confirmar-import",
      });
    } else {
      await ejecutarImportacion();
    }
  }

  if (boton.dataset.accion === "confirmar-import") {
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
    // Traemos TODOS sus ejercicios, también los archivados de fases anteriores
    const todos = await db.from("ejercicios").select("*").eq("alumno_id", alumno.id);
    if (todos.error) throw todos.error;

    const porNombre = new Map();
    todos.data.forEach(e => {
      const clave = claveEjercicio(e.nombre);
      if (!porNombre.has(clave) || e.activo) porNombre.set(clave, e);   // si hay dos, gana el activo
    });

    let nuevos = 0, actualizados = 0, archivados = 0;

    if (imp.rutina && imp.rutina.length) {
      // REEMPLAZAR: la rutina del archivo pasa a ser la rutina activa
      const enArchivo = new Set();
      const aInsertar = [];

      imp.rutina.forEach((e, i) => {
        const clave = claveEjercicio(e.nombre);
        if (enArchivo.has(clave)) return;   // repetido dentro del archivo
        enArchivo.add(clave);
        const datos = { dia: e.dia, series: e.series, reps: e.reps, orden: i, activo: true };
        const existente = porNombre.get(clave);
        if (existente) {
          // Ya existía (activo o archivado): lo reusamos, así no pierde su historial
          actualizados++;
          aInsertar.push({ actualizar: existente.id, datos });
        } else {
          aInsertar.push({ datos: { ...datos, alumno_id: alumno.id, nombre: e.nombre } });
        }
      });

      for (const item of aInsertar) {
        if (item.actualizar) {
          const r = await db.from("ejercicios").update(item.datos).eq("id", item.actualizar).select().single();
          if (r.error) throw r.error;
          porNombre.set(claveEjercicio(r.data.nombre), r.data);
        }
      }

      const filasNuevas = aInsertar.filter(x => !x.actualizar).map(x => x.datos);
      if (filasNuevas.length) {
        const r = await db.from("ejercicios").insert(filasNuevas).select();
        if (r.error) throw r.error;
        r.data.forEach(e => porNombre.set(claveEjercicio(e.nombre), e));
        nuevos = r.data.length;
      }

      // Los que estaban activos y no vienen en el archivo se ARCHIVAN (no se borran)
      const viejos = todos.data.filter(e => e.activo && !enArchivo.has(claveEjercicio(e.nombre))).map(e => e.id);
      if (viejos.length) {
        const r = await db.from("ejercicios").update({ activo: false }).in("id", viejos);
        if (r.error) throw r.error;
        archivados = viejos.length;
      }
    }

    // Ejercicios que aparecen en el historial (LOG) pero en ningún lado más
    const diasRutina = [...new Set((imp.rutina || []).map(e => e.dia))];
    const delLog = [];
    (imp.log || []).forEach(r => {
      const clave = claveEjercicio(r.ejercicio);
      if (porNombre.has(clave) || delLog.some(n => claveEjercicio(n.nombre) === clave)) return;
      const mismas = imp.log.filter(x => claveEjercicio(x.ejercicio) === clave);
      const dia = diasRutina.find(d => d === r.dia || d.startsWith(r.dia + " -")) || r.dia || "Importados";
      delLog.push({
        alumno_id: alumno.id, dia, nombre: r.ejercicio, reps: "",
        series: Math.min(10, Math.max(...mismas.map(x => x.serie))),
        orden: 999,
        activo: !imp.rutina,   // si reemplazaste la rutina, estos quedan archivados (solo historial)
      });
    });
    if (delLog.length) {
      const r = await db.from("ejercicios").insert(delLog).select();
      if (r.error) throw r.error;
      r.data.forEach(e => porNombre.set(claveEjercicio(e.nombre), e));
      nuevos += r.data.length;
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

    // ── C. Objetivos de nutrición ──
    let nutricionImportada = false;
    if (imp.nutricion) {
      const respuesta = await db
        .from("alumnos")
        .update(imp.nutricion)
        .eq("id", alumno.id)
        .select()
        .single();
      if (respuesta.error) throw respuesta.error;
      alumnoActual = respuesta.data;
      alumnos = alumnos.map(a => (a.id === alumnoActual.id ? respuesta.data : a));
      nutricionImportada = true;
    }

    // ── D. Listo ──
    const partes = [];
    if (imp.rutina) partes.push(`rutina de ${new Set(imp.rutina.map(e => e.dia)).size} días`);
    if (archivados) partes.push(`${archivados} ejercicios archivados`);
    if (seriesNuevas) partes.push(`${seriesNuevas} series`);
    if (nutricionImportada) partes.push("nutrición");

    importacion = nuevaImportacion();
    vista = "alumno";
    seccionAlumno = imp.rutina || imp.log ? "rutina" : "nutricion";
    diaElegido = null;
    await cargarEjercicios();
    mostrarToast(`✓ Importado: ${partes.join(" · ") || "sin cambios"}`);

  } catch (e) {
    imp.importando = false;
    imp.mensaje = "No se pudo importar: " + (e.message || e) + ". Podés reintentar: no se duplica nada.";
    render();
  }
}