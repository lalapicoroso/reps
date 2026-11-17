// ─────────────────────────────────────────
// NUTRICIÓN: objetivos diarios del alumno
// Usa variables y funciones de app.js (alumnoActual, alumnos, db, render, vista...)
// ─────────────────────────────────────────

// Evita que un texto con "<" rompa el HTML
function textoSeguro(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// 1925 → "1.925"
function miles(n) {
  return Math.round(n).toLocaleString("es-AR");
}

// Texto del formulario → número entero (o null si está vacío)
function entero(valor) {
  const n = numero(valor);
  return n === null ? null : Math.round(n);
}

// Calorías que aportan los macros: proteína y carbos 4 kcal/g, grasas 9 kcal/g
function kcalDeMacros(p, g, c) {
  return (p || 0) * 4 + (g || 0) * 9 + (c || 0) * 4;
}

// ─────────────────────────────────────────
// 1. EL ANILLO (SVG)
//    Cada macro es un círculo con borde "cortado" (stroke-dasharray):
//    dibuja solo un pedazo, del largo proporcional a sus kcal.
// ─────────────────────────────────────────
function anilloMacros(p, g, c) {
  const radio = 54;
  const circunferencia = 2 * Math.PI * radio;
  const total = kcalDeMacros(p, g, c);
  let recorrido = 0;   // cuánto del anillo ya pintamos

  function segmento(kcal, clase) {
    if (!kcal || !total) return "";
    const largo = (kcal / total) * circunferencia;
    const html = `<circle class="${clase}" cx="70" cy="70" r="${radio}"
      stroke-dasharray="${Math.max(0, largo - 3).toFixed(1)} ${circunferencia.toFixed(1)}"
      stroke-dashoffset="${(-recorrido).toFixed(1)}"/>`;
    recorrido += largo;
    return html;
  }

  return `
    <svg class="anillo-svg" viewBox="0 0 140 140" aria-hidden="true">
      <circle class="pista" cx="70" cy="70" r="${radio}"/>
      ${segmento((p || 0) * 4, "m-p")}
      ${segmento((g || 0) * 9, "m-g")}
      ${segmento((c || 0) * 4, "m-c")}
    </svg>
  `;
}

// Una fila de la leyenda: ● Proteína  125 g  26%
function filaMacro(nombre, clase, gramos, porcentaje) {
  return `
    <div class="macro">
      <i class="punto ${clase}"></i>
      <span class="m-nombre">${nombre}</span>
      <b>${gramos ? gramos + " g" : "—"}</b>
      <span class="m-pct">${porcentaje}%</span>
    </div>
  `;
}

// ─────────────────────────────────────────
// 2. SEGMENTO "NUTRICIÓN" DEL ALUMNO
// ─────────────────────────────────────────
function tabNutricion(alumno) {
  const p = alumno.proteina || 0;
  const g = alumno.grasas || 0;
  const c = alumno.carbos || 0;
  const tieneDatos = p || g || c || alumno.kcal;

  // Estado vacío
  if (!tieneDatos) {
    return `
      <p class="vacio">Todavía no tiene objetivos de nutrición.<br>
      Definilos a mano, o importalos desde la planilla (pestaña <b>Inicio</b>).</p>
      <button class="btn" data-accion="editar-nutricion">Definir objetivos</button>
    `;
  }

  const sumaKcal = kcalDeMacros(p, g, c);
  const kcal = alumno.kcal || sumaKcal;
  const porcentaje = kcalMacro => (sumaKcal ? Math.round((kcalMacro / sumaKcal) * 100) : 0);

  // Avisamos si las kcal objetivo y la suma de macros difieren más de un 5%
  const noCoinciden = alumno.kcal && sumaKcal && Math.abs(alumno.kcal - sumaKcal) / alumno.kcal > 0.05;

  const tarjetaTexto = (titulo, valor) => valor
    ? `<div class="card info"><div><p>${titulo}</p><h3 class="info-texto">${textoSeguro(valor)}</h3></div></div>`
    : "";

  return `
    <div class="card nutri">
      <div class="anillo">
        ${anilloMacros(p, g, c)}
        <div class="anillo-centro">
          <b>${miles(kcal)}</b>
          <span>kcal / día</span>
        </div>
      </div>
      <div class="macros">
        ${filaMacro("Proteína", "m-p", p, porcentaje(p * 4))}
        ${filaMacro("Grasas", "m-g", g, porcentaje(g * 9))}
        ${filaMacro("Carbos", "m-c", c, porcentaje(c * 4))}
      </div>
    </div>
    ${noCoinciden ? `<p class="nota-kcal">Ojo: los macros suman ${miles(sumaKcal)} kcal</p>` : ""}

    <div class="lista">
      ${tarjetaTexto("Pasos", alumno.pasos)}
      ${tarjetaTexto("Agua", alumno.agua)}
      ${tarjetaTexto("Notas", alumno.notas_nutricion)}
      <button class="btn secundario" data-accion="editar-nutricion">✏️ Editar objetivos</button>
    </div>
  `;
}

// ─────────────────────────────────────────
// 3. FORMULARIO DE OBJETIVOS
// ─────────────────────────────────────────
function pantallaEditarNutricion(alumno) {
  const v = campo => (alumno[campo] ?? "");
  const suma = kcalDeMacros(alumno.proteina, alumno.grasas, alumno.carbos);

  return `
    <button class="volver" type="button" data-accion="volver-alumno">← ${alumno.nombre}</button>
    <h1 class="titulo">Objetivos de nutrición</h1>

    <form id="form-nutricion" class="form">
      <label>Calorías por día
        <input name="kcal" inputmode="numeric" value="${v("kcal")}" placeholder="Ej: 1925">
      </label>

      <div class="dos-columnas">
        <label>Proteína (g)<input name="proteina" inputmode="numeric" value="${v("proteina")}" placeholder="125" data-macro></label>
        <label>Grasas (g)  <input name="grasas"   inputmode="numeric" value="${v("grasas")}"   placeholder="60"  data-macro></label>
      </div>
      <div class="dos-columnas">
        <label>Carbos (g)  <input name="carbos"   inputmode="numeric" value="${v("carbos")}"   placeholder="225" data-macro></label>
        <div class="suma-macros">
          <span>Los macros suman</span>
          <b id="suma-macros">${suma ? miles(suma) + " kcal" : "—"}</b>
        </div>
      </div>

      <label>Pasos
        <input name="pasos" value="${textoSeguro(v("pasos"))}" placeholder="Ej: 6.000–7.000 por día">
      </label>
      <label>Agua
        <input name="agua" value="${textoSeguro(v("agua"))}" placeholder="Ej: 2–2,5 L por día">
      </label>
      <label>Notas
        <textarea name="notas_nutricion" rows="3" placeholder="Ej: priorizar proteína en cada comida">${textoSeguro(v("notas_nutricion"))}</textarea>
      </label>

      <p class="error"></p>
      <button class="btn" type="submit">Guardar objetivos</button>
    </form>
  `;
}

// ─────────────────────────────────────────
// 4. INTERACCIONES
// ─────────────────────────────────────────

// Botones
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  if (boton.dataset.accion === "editar-nutricion") {
    vista = "editar-nutricion";
    render();
  }
});

// Mientras escribís los macros, se actualiza la suma de kcal
document.addEventListener("input", (evento) => {
  if (!evento.target.hasAttribute("data-macro")) return;
  const form = evento.target.form;
  const suma = kcalDeMacros(
    numero(form.proteina.value),
    numero(form.grasas.value),
    numero(form.carbos.value)
  );
  document.getElementById("suma-macros").textContent = suma ? miles(suma) + " kcal" : "—";
});

// Guardar
document.addEventListener("submit", async (evento) => {
  const form = evento.target;
  if (form.id !== "form-nutricion") return;
  evento.preventDefault();

  const datos = Object.fromEntries(new FormData(form));
  const boton = form.querySelector("button[type=submit]");
  const mensaje = form.querySelector(".error");

  const cambios = {
    kcal: entero(datos.kcal),
    proteina: entero(datos.proteina),
    grasas: entero(datos.grasas),
    carbos: entero(datos.carbos),
    pasos: datos.pasos.trim() || null,
    agua: datos.agua.trim() || null,
    notas_nutricion: datos.notas_nutricion.trim() || null,
  };

  boton.disabled = true;
  boton.textContent = "Guardando…";

  const respuesta = await db
    .from("alumnos")
    .update(cambios)
    .eq("id", alumnoActual.id)
    .select()
    .single();

  if (respuesta.error) {
    mensaje.textContent = "No se pudo guardar: " + respuesta.error.message;
    boton.disabled = false;
    boton.textContent = "Guardar objetivos";
    return;
  }

  alumnoActual = respuesta.data;
  alumnos = alumnos.map(a => (a.id === alumnoActual.id ? respuesta.data : a));
  vista = "alumno";
  seccionAlumno = "nutricion";
  aviso = "Objetivos guardados ✓";
  render();
});