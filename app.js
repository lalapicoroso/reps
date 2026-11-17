// ─────────────────────────────────────────
// 1. DATOS: la lista de alumnos
//    [ ] es una lista (array). { } es una "ficha" (objeto) con propiedades.
// ─────────────────────────────────────────
const alumnos = [
  { id: 1, nombre: "Sofía R.",  fase: "Fase 2", dia: "Día 3", objetivo: "Hipertrofia de tren inferior" },
  { id: 2, nombre: "Martín G.", fase: "Fase 1", dia: "Día 1", objetivo: "Bajar 5 kg" },
  { id: 3, nombre: "Lucía M.",  fase: "Fase 3", dia: "Día 5", objetivo: "Preparar competencia" },
  { id: 4, nombre: "Laura", fase: "Fase 1", dia: "Día 1", objetivo: "Hipertrofia" },
];

// ─────────────────────────────────────────
// 2. ESTADO: qué está pasando ahora en la app
//    null = "nada". Si no hay alumno elegido, mostramos el inicio.
// ─────────────────────────────────────────
let alumnoActual = null;

// ─────────────────────────────────────────
// 3. AYUDANTES: funciones chiquitas reutilizables
//    Una función es como un componente: recibe algo y devuelve algo.
// ─────────────────────────────────────────
function iniciales(nombre) {
  // "Sofía R." → ["Sofía", "R."] → ["S", "R"] → "SR"
  return nombre.split(" ").map(parte => parte[0]).join("").toUpperCase();
}

// ─────────────────────────────────────────
// 4. PANTALLAS: funciones que devuelven HTML
//    Las comillas invertidas ` ` permiten meter datos con ${ }
// ─────────────────────────────────────────
function pantallaInicio() {
  // .map() recorre la lista y convierte cada alumno en una tarjeta
  const tarjetas = alumnos.map(alumno => `
    <button class="card" data-id="${alumno.id}">
      <div class="avatar">${iniciales(alumno.nombre)}</div>
      <div>
        <h3>${alumno.nombre}</h3>
        <p>${alumno.fase} · ${alumno.dia}</p>
      </div>
    </button>
  `).join("");

  return `
    <div class="logo"><i></i>REPS</div>
    <p class="subtitulo">${alumnos.length} alumnos</p>
    <div class="lista">${tarjetas}</div>
  `;
}

function pantallaAlumno(alumno) {
  return `
    <button class="volver">← Alumnos</button>

    <div class="perfil">
      <div class="avatar grande">${iniciales(alumno.nombre)}</div>
      <h1>${alumno.nombre}</h1>
      <p>${alumno.fase} · ${alumno.dia}</p>
    </div>

    <div class="card info">
      <div>
        <p>Objetivo</p>
        <h3>${alumno.objetivo}</h3>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// 5. RENDER: dibuja la pantalla que corresponde según el estado
// ─────────────────────────────────────────
function render() {
  const app = document.getElementById("app");

  if (alumnoActual) {
    app.innerHTML = pantallaAlumno(alumnoActual);
  } else {
    app.innerHTML = pantallaInicio();
  }

  window.scrollTo(0, 0); // vuelve arriba al cambiar de pantalla
}

// ─────────────────────────────────────────
// 6. INTERACCIONES: escuchamos los clics
// ─────────────────────────────────────────
document.addEventListener("click", (evento) => {
  // ¿Tocaron una tarjeta de alumno?
  const tarjeta = evento.target.closest(".card[data-id]");
  if (tarjeta) {
    const id = Number(tarjeta.dataset.id);
    alumnoActual = alumnos.find(alumno => alumno.id === id);
    render();
    return;
  }

  // ¿Tocaron "volver"?
  if (evento.target.closest(".volver")) {
    alumnoActual = null;
    render();
  }
});

// ─────────────────────────────────────────
// 7. ARRANQUE: dibujamos por primera vez
// ─────────────────────────────────────────
render();
