import { store, DEMO } from "./store.js?v=2026.10.15.3";
import { SUPERADMINS } from "./firebase-config.js?v=2026.10.15.3";

// Versión de la app: cámbiala junto con los ?v= de index.html, app.js y store.js al publicar cambios grandes
const VERSION = "2026.10.15.3";

// ───────────────────────── Constantes ─────────────────────────

const PERMISOS = [
  ["verAgenda", "Ver agendas"],
  ["editarAgenda", "Crear y editar agendas"],
  ["verParticipantes", "Ver participantes"],
  ["editarParticipantes", "Agregar, editar e importar participantes"],
  ["verTelefonos", "Ver teléfonos"],
  ["gestionarUsuarios", "Aprobar usuarios y asignar roles"],
];

const todos = Object.fromEntries(PERMISOS.map(([k]) => [k, true]));
const ROLES_INICIALES = {
  obispo: { nombre: "Obispo", orden: 1, permisos: { ...todos } },
  consejero: { nombre: "Consejero", orden: 2, permisos: { ...todos, gestionarUsuarios: false } },
  "secretario-ejecutivo": {
    nombre: "Secretario ejecutivo", orden: 3,
    permisos: { ...todos, gestionarUsuarios: false },
  },
  secretario: {
    nombre: "Secretario", orden: 4,
    permisos: { verAgenda: true, editarAgenda: false, verParticipantes: true, editarParticipantes: true, verTelefonos: false, gestionarUsuarios: false },
  },
};

const ORGANIZACIONES = [
  "Obispado", "Cuórum de Élderes", "Sociedad de Socorro", "Hombres Jóvenes",
  "Mujeres Jóvenes", "Primaria", "Escuela Dominical", "Misioneros", "Otro",
];
// Cuadro en blanco al imprimir una reunión de testimonios
const COLUMNAS_TESTIMONIOS = 4;
const FILAS_TESTIMONIOS = 8;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TIPOS_ASUNTO = ["Sostenimiento", "Relevo", "Ordenación al sacerdocio", "Otro"];

const PLANTILLAS = {
  visitantes: { nombre: "", llamamiento: "" },
  anuncios: { texto: "" },
  asuntos: { tipo: "Sostenimiento", persona: null, llamamiento: "" },
  testimonios: { persona: null },
  discursantes1: { persona: null, tema: "", link: "" },
  discursantes2: { persona: null, tema: "", link: "" },
};

// ───────────────────────── Estado y utilidades ─────────────────────────

const S = {
  user: null, barrio: null, miembro: null, rolNombre: "",
  perms: {}, esAdmin: false, activo: false, participantes: null,
  dirty: false, lastHash: "", skipRoute: false,
};
const $app = document.getElementById("app");
const B = () => `barrios/${S.barrio.id}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Silueta genérica de un centro de reuniones (capilla con aguja)
const CAPILLA = `<svg class="capilla" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.2 13.7 7.2H10.3Z"/><rect x="10.3" y="7.2" width="3.4" height="4.3"/><path d="M2 13.6 12 9.8 22 13.6V15H2Z"/><path d="M3.6 15h16.8v7.2H3.6Z" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="10.4" y="17.3" width="3.2" height="4.9" rx="1.6"/><rect x="6" y="16.8" width="2" height="3" rx="1"/><rect x="16" y="16.8" width="2" height="3" rx="1"/></svg>`;
const LOADING = `<div class="loader" role="progressbar" aria-label="Cargando"></div>`;

function fechaLarga(f) {
  const s = new Date(f + "T12:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fechaCorta(f) {
  return new Date(f + "T12:00").toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}
function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function proximoDomingo() {
  const d = new Date(hoyISO() + "T12:00");
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d.toISOString().slice(0, 10);
}
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, val) {
  const ks = path.split(".");
  const last = ks.pop();
  ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = val;
}
function genCodigo() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

function toast(msg, error = false) {
  const t = document.createElement("div");
  t.className = "toast" + (error ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function mensajeError(e) {
  console.error(e);
  if (String(e?.code || e?.message).includes("permission")) return "No tienes permiso para hacer esto.";
  return e?.message || String(e);
}

async function intentar(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(mensajeError(e), true);
  }
}

// Cerrar cualquier diálogo al hacer clic fuera de él (en el fondo oscuro).
// Se exige que el clic empiece y termine fuera, para no cerrarlo al seleccionar texto arrastrando.
const clicEnFondo = (e) => {
  const d = e.target;
  if (d.tagName !== "DIALOG" || !d.open) return false;
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};
let inicioEnFondo = false;
document.addEventListener("pointerdown", (e) => (inicioEnFondo = clicEnFondo(e)));
document.addEventListener("click", (e) => {
  if (inicioEnFondo && clicEnFondo(e)) e.target.close();
  inicioEnFondo = false;
});

function demoBanner() {
  return DEMO
    ? `<div class="demo">Modo demostración: los datos se guardan solo en este navegador.</div>`
    : "";
}

// ───────────────────────── Sesión ─────────────────────────

store.onUser(async (user) => {
  S.user = user;
  S.superadmin = !!user && SUPERADMINS.map((e) => e.toLowerCase()).includes((user.email || "").toLowerCase());
  await cargarSesion();
});

async function cargarSesion() {
  S.activo = false;
  S.dirty = false;
  if (!S.user) return renderLogin();
  $app.innerHTML = demoBanner() + LOADING;
  try {
    const perfil = await store.get(`users/${S.user.uid}`);
    const bid = perfil?.barrioId;
    if (!bid) return renderBienvenida();
    S.barrio = await store.get(`barrios/${bid}`);
    if (!S.barrio) return renderBienvenida();
    S.esAdmin = (S.barrio.admins || []).includes(S.user.uid);
    if (S.barrio.estado !== "aprobado") {
      // Un superadministrador aprueba automáticamente sus propios barrios
      if (!(S.superadmin && S.esAdmin)) return renderBarrioPendiente();
      await store.set(`barrios/${bid}`, { estado: "aprobado" }, true);
      S.barrio.estado = "aprobado";
    }
    S.miembro = await store.get(`barrios/${bid}/miembros/${S.user.uid}`);
    if (!S.miembro && S.esAdmin) S.miembro = await inicializarBarrio();
    if (!S.miembro) return renderBienvenida();
    if (!S.esAdmin && S.miembro.estado !== "activo") return renderPendiente();

    const rol = S.miembro.rolId ? await store.get(`${B()}/roles/${S.miembro.rolId}`) : null;
    S.rolNombre = rol?.nombre || "";
    S.perms = S.esAdmin ? { ...todos } : rol?.permisos || {};
    S.participantes = null;
    S.activo = true;
    route();
  } catch (e) {
    $app.innerHTML = `${demoBanner()}<div class="card narrow"><h2>Ocurrió un error</h2><p>${esc(mensajeError(e))}</p>
      <button class="btn" id="reintentar">Reintentar</button> <button class="btn ghost" id="salir">Salir</button></div>`;
    document.getElementById("reintentar").onclick = cargarSesion;
    document.getElementById("salir").onclick = () => store.signOut();
  }
}

function renderLogin() {
  $app.innerHTML = `${demoBanner()}
  <div class="login">
    <div class="card narrow">
      <div class="logo"><span>${CAPILLA}</span></div>
      <h1>Reunión Sacramental</h1>
      <p class="muted">Planificación de la agenda para el obispado</p>
      <p class="muted small center">Versión ${VERSION}</p>
      ${DEMO
        ? `<form id="demoLogin" class="stack">
            <label>Nombre<input name="name" required placeholder="Ej. Hno. Juan Pérez"></label>
            <label>Correo<input name="email" type="email" required placeholder="correo@gmail.com"></label>
            <button class="btn">Entrar (simulado)</button>
            <p class="muted small">Para probar los roles, entra con otro correo, solicita acceso y luego apruébalo desde tu usuario.</p>
          </form>`
        : `<button class="btn google" id="google"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.7l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg> Entrar con Google</button>`}
    </div>
  </div>`;
  if (DEMO) {
    document.getElementById("demoLogin").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      store.signIn({ name: f.get("name").trim(), email: f.get("email").trim() });
    };
  } else {
    document.getElementById("google").onclick = () => intentar(() => store.signIn());
  }
}

function renderBienvenida() {
  $app.innerHTML = `${demoBanner()}
  <div class="login">
    <div class="card narrow">
      <h2>Hola, ${esc(S.user.name)}</h2>
      <p class="muted">Únete al barrio con el código que te dio tu obispo.</p>
      <form id="unirse" class="row">
        <input name="codigo" required placeholder="Código del barrio" autocapitalize="characters" maxlength="6">
        <button class="btn">Solicitar acceso</button>
      </form>
    </div>
    <div class="card narrow">
      <h3>¿Eres obispo y tu barrio aún no está registrado?</h3>
      <form id="crear" class="stack">
        <label>Nombre del barrio<input name="nombre" required placeholder="Ej. Barrio Las Colinas"></label>
        <label>Estaca<input name="estaca" placeholder="Ej. Estaca Tegucigalpa Norte"></label>
        <button class="btn secondary">Registrar barrio</button>
      </form>
    </div>
    <p class="center"><button class="link" id="salir">Salir</button></p>
  </div>`;
  document.getElementById("salir").onclick = () => store.signOut();
  document.getElementById("unirse").onsubmit = (e) => {
    e.preventDefault();
    intentar(() => unirseABarrio(new FormData(e.target).get("codigo").trim().toUpperCase()));
  };
  document.getElementById("crear").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    intentar(() => crearBarrio(f.get("nombre").trim(), f.get("estaca").trim()));
  };
}

async function crearBarrio(nombre, estaca) {
  const { uid, email, name } = S.user;
  let codigo = genCodigo();
  while (await store.get(`barrios/${codigo}`)) codigo = genCodigo();
  // Queda pendiente hasta que un superadministrador lo apruebe
  await store.set(`barrios/${codigo}`, {
    nombre, estaca, admins: [uid], estado: S.superadmin ? "aprobado" : "pendiente", creadoEn: now(), creadoPor: email,
  });
  await store.set(`users/${uid}`, { barrioId: codigo, email, nombre: name });
  toast(`Barrio registrado. Código: ${codigo}`);
  await cargarSesion();
}

// Al entrar por primera vez a un barrio aprobado: crea el registro del obispo y los roles iniciales
async function inicializarBarrio() {
  const { uid, email, name } = S.user;
  const base = `barrios/${S.barrio.id}`;
  const miembro = { nombre: name, email, estado: "activo", rolId: "obispo", creadoEn: now() };
  await store.set(`${base}/miembros/${uid}`, miembro);
  if (!(await store.list(`${base}/roles`)).length) {
    for (const [id, rol] of Object.entries(ROLES_INICIALES)) await store.set(`${base}/roles/${id}`, rol);
  }
  return { id: uid, ...miembro };
}

async function unirseABarrio(codigo) {
  const { uid, email, name } = S.user;
  const barrio = await store.get(`barrios/${codigo}`);
  if (!barrio) return toast("No existe un barrio con ese código.", true);
  if (barrio.estado !== "aprobado") return toast("Ese barrio todavía no ha sido aprobado. Intenta más tarde.", true);
  if (!(await store.get(`barrios/${codigo}/miembros/${uid}`))) {
    await store.set(`barrios/${codigo}/miembros/${uid}`, { nombre: name, email, estado: "pendiente", creadoEn: now() });
  }
  await store.set(`users/${uid}`, { barrioId: codigo, email, nombre: name });
  await cargarSesion();
}

function renderPendiente() {
  $app.innerHTML = `${demoBanner()}
  <div class="login"><div class="card narrow center">
    <div class="logo"><span class="ms">hourglass_top</span></div>
    <h2>Solicitud enviada</h2>
    <p>Pediste acceso a <strong>${esc(S.barrio.nombre)}</strong>.</p>
    <p class="muted">Cuando el obispo apruebe tu solicitud y te asigne un rol, podrás entrar.</p>
    <div class="row center">
      <button class="btn" id="revisar">Volver a revisar</button>
      <button class="btn ghost" id="cambiar">Usar otro código</button>
    </div>
    <p><button class="link" id="salir">Salir</button></p>
  </div></div>`;
  document.getElementById("revisar").onclick = cargarSesion;
  document.getElementById("salir").onclick = () => store.signOut();
  document.getElementById("cambiar").onclick = () =>
    intentar(async () => {
      await store.set(`users/${S.user.uid}`, { barrioId: null }, true);
      renderBienvenida();
    });
}

function renderBarrioPendiente() {
  const rechazado = S.barrio.estado === "rechazado";
  $app.innerHTML = `${demoBanner()}
  <div class="login"><div class="card narrow center">
    <div class="logo"><span class="ms">${rechazado ? "block" : "hourglass_top"}</span></div>
    <h2>${rechazado ? "Barrio no aprobado" : "Barrio en revisión"}</h2>
    <p><strong>${esc(S.barrio.nombre)}</strong></p>
    <p class="muted">${rechazado
      ? "El registro de este barrio no fue aprobado. Si crees que es un error, comunícate con el administrador de la app."
      : S.esAdmin
        ? "Tu barrio fue registrado y está pendiente de aprobación por el administrador de la app. Cuando lo apruebe, podrás empezar a usarlo."
        : "Este barrio todavía no ha sido aprobado por el administrador de la app."}</p>
    <div class="row center">
      ${rechazado ? "" : `<button class="btn" id="revisar">Volver a revisar</button>`}
      <button class="btn ghost" id="cambiar">Usar otro código</button>
    </div>
    <p><button class="link" id="salir">Salir</button></p>
  </div></div>`;
  document.getElementById("revisar")?.addEventListener("click", cargarSesion);
  document.getElementById("salir").onclick = () => store.signOut();
  document.getElementById("cambiar").onclick = () =>
    intentar(async () => {
      await store.set(`users/${S.user.uid}`, { barrioId: null }, true);
      renderBienvenida();
    });
}

// ───────────────────────── Navegación ─────────────────────────

window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (e) => {
  if (S.dirty) e.preventDefault();
});

function route() {
  if (!S.activo) return;
  if (S.skipRoute) {
    S.skipRoute = false;
    return;
  }
  if (S.dirty && location.hash !== S.lastHash) {
    if (!confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) {
      S.skipRoute = true;
      location.hash = S.lastHash;
      return;
    }
    S.dirty = false;
  }
  S.lastHash = location.hash;
  const [, page = "", arg] = location.hash.split("/");
  const p = S.perms;
  const vistas = {
    agenda: p.verAgenda && (() => (arg && p.editarAgenda ? vistaEditor(arg) : arg ? vistaAgendaImpresa(arg) : vistaAgendas())),
    ver: p.verAgenda && (() => vistaAgendaImpresa(arg)),
    participantes: (p.verParticipantes || p.editarParticipantes) && vistaParticipantes,
    usuarios: p.gestionarUsuarios && vistaUsuarios,
    roles: S.esAdmin && vistaRoles,
    barrios: S.superadmin && vistaBarrios,
  };
  if (vistas[page]) return vistas[page]().catch((e) => (document.getElementById("main").innerHTML = `<p class="error">${esc(mensajeError(e))}</p>`));
  const primera = Object.keys(vistas).find((k) => vistas[k] && k !== "ver");
  if (primera) location.hash = "#/" + primera;
  else shell("").innerHTML = `<div class="card narrow center"><p>Tu rol (${esc(S.rolNombre || "sin rol")}) todavía no tiene permisos asignados.</p></div>`;
}

function shell(activa) {
  const tabs = [
    ["agenda", "Agenda", "event_note", S.perms.verAgenda],
    ["participantes", "Participantes", "groups", S.perms.verParticipantes || S.perms.editarParticipantes],
    ["usuarios", "Usuarios", "manage_accounts", S.perms.gestionarUsuarios],
    ["roles", "Roles", "admin_panel_settings", S.esAdmin],
    ["barrios", "Barrios", "domain", S.superadmin],
  ].filter((t) => t[3]);
  $app.innerHTML = `${demoBanner()}
  <header class="top noprint">
    <span class="brand-icon">${CAPILLA}</span>
    <div class="brand"><strong>${esc(S.barrio.nombre)}</strong><small>${esc(S.barrio.estaca || "")}</small></div>
    <div class="who"><span>${esc(S.user.name)}<small>${esc(S.esAdmin ? "Administrador" : S.rolNombre)} · v${VERSION}</small></span>
      <span class="avatar">${esc((S.user.name || "?").trim().charAt(0).toUpperCase())}</span>
      <button class="icon" id="salir" title="Salir"><span class="ms">logout</span></button></div>
  </header>
  <nav class="nav noprint">${tabs.map(([k, l, ico]) => `<a href="#/${k}" class="${k === activa ? "on" : ""}"><span class="ind"><span class="ms">${ico}</span></span><span class="lbl">${l}</span></a>`).join("")}</nav>
  <main id="main">${LOADING}</main>`;
  document.getElementById("salir").onclick = () => {
    if (!S.dirty || confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) {
      S.dirty = false;
      store.signOut();
    }
  };
  return document.getElementById("main");
}

async function cargarParticipantes(forzar = false) {
  if (!S.participantes || forzar) {
    S.participantes = (await store.list(`${B()}/participantes`)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
  return S.participantes;
}

// ───────────────────────── Agenda: lista ─────────────────────────

function nuevaReunion(fecha) {
  const himno = () => ({ numero: "", titulo: "" });
  const primerDomingo = Number(fecha.slice(8, 10)) <= 7;
  return {
    fecha, preside: null, dirige: null, visitantes: [], anuncios: [], asuntos: [],
    primerHimno: himno(), primeraOracion: null, himnoSacramental: himno(),
    tipo: primerDomingo ? "testimonios" : "discursos",
    testimonios: [],
    discursantes1: [clone(PLANTILLAS.discursantes1), clone(PLANTILLAS.discursantes1)],
    himnoIntermedio: himno(),
    discursantes2: [clone(PLANTILLAS.discursantes2)],
    ultimoHimno: himno(), ultimaOracion: null, notas: "",
  };
}

const discursantesDe = (r) => (r.tipo === "testimonios" ? [] : [...(r.discursantes1 || []), ...(r.discursantes2 || [])]);

// Historial por persona: fecha del último discurso, de la última oración,
// y cuál fue su última participación de cualquier tipo.
function historial(reuniones, excluirFecha) {
  const h = { discurso: {}, oracion: {}, ultima: {} };
  const anotar = (tipo, etiqueta, p, f) => {
    if (!p?.id) return;
    if (tipo && !(h[tipo][p.id] >= f)) h[tipo][p.id] = f;
    if (!(h.ultima[p.id]?.fecha >= f)) h.ultima[p.id] = { fecha: f, tipo: etiqueta };
  };
  reuniones.filter((r) => r.id !== excluirFecha).forEach((r) => {
    discursantesDe(r).forEach((d) => anotar("discurso", "Discurso", d.persona, r.id));
    anotar("oracion", "Primera oración", r.primeraOracion, r.id);
    anotar("oracion", "Última oración", r.ultimaOracion, r.id);
    if (r.tipo === "testimonios") (r.testimonios || []).forEach((t) => anotar(null, "Testimonio", t.persona, r.id));
  });
  return h;
}
const cuando = (f) => (!f ? "nunca" : f > hoyISO() ? `asignado ${fechaCorta(f)}` : fechaCorta(f));

async function vistaAgendas() {
  const main = shell("agenda");
  const reuniones = await store.list(`${B()}/reuniones`);
  const hoy = hoyISO();
  const proximas = reuniones.filter((r) => r.id >= hoy).sort((a, b) => a.id.localeCompare(b.id));
  // Opciones para "Nueva agenda": los próximos 12 domingos
  const existentes = new Set(reuniones.map((r) => r.id));
  const hoyD = new Date(hoy + "T12:00");
  const domingos = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(proximoDomingo() + "T12:00");
    d.setDate(d.getDate() + 7 * i);
    return d.toISOString().slice(0, 10);
  });
  const pasadas = reuniones.filter((r) => r.id < hoy).sort((a, b) => b.id.localeCompare(a.id));
  const puedeEditar = S.perms.editarAgenda;

  const resumen = (r) =>
    r.tipo === "testimonios"
      ? `${(r.testimonios || []).filter((t) => t.persona).length} testimonios registrados`
      : discursantesDe(r).filter((d) => d.persona).map((d) => esc(d.persona.nombre)).join(", ") || "Sin discursantes asignados";
  const pill = (r) => `<span class="pill ${r.tipo}">${r.tipo === "testimonios" ? "Testimonios" : "Discursos"}</span>`;
  // Texto donde se busca: personas, temas, himnos y asuntos de la reunión
  const textoBusqueda = (r) => norm([
    r.preside, r.dirige, r.primeraOracion, r.ultimaOracion,
    ...(r.testimonios || []).map((t) => t.persona),
    ...(r.asuntos || []).map((a) => a.persona),
  ].map((p) => p?.nombre).concat(
    discursantesDe(r).flatMap((d) => [d.persona?.nombre, d.tema]),
    [r.primerHimno, r.himnoSacramental, r.himnoIntermedio, r.ultimoHimno].map((h) => h?.titulo),
    (r.asuntos || []).map((a) => a.llamamiento),
  ).filter(Boolean).join(" "));
  pasadas.forEach((r) => (r._texto = textoBusqueda(r)));

  const tarjeta = (r, i) => `<div class="card reunion ${i === 0 ? "destacada" : ""}">
      <div>${i === 0 ? `<span class="eyebrow">Próxima reunión</span>` : ""}
        <strong>${esc(fechaLarga(r.id))}</strong> ${pill(r)}
        <p class="muted small">${resumen(r)}</p></div>
      <div class="acciones">
        <a class="btn ghost sm" href="#/ver/${r.id}">Ver</a>
        ${puedeEditar ? `<a class="btn sm" href="#/agenda/${r.id}">Editar</a>
        <button class="icon danger" data-borrar="${r.id}" title="Eliminar"><span class="ms">delete</span></button>` : ""}
      </div></div>`;

  const filaPasada = (r) => {
    const d = new Date(r.id + "T12:00");
    return `<div class="fila-reunion">
      <a href="#/ver/${r.id}" class="fr-link">
        <span class="fr-fecha"><b>${d.getDate()}</b><small>${d.toLocaleDateString("es", { month: "short" })}</small></span>
        <span class="fr-info">${pill(r)}<span class="small muted">${resumen(r)}</span></span>
      </a>
      ${puedeEditar ? `<a class="icon" href="#/agenda/${r.id}" title="Editar"><span class="ms">edit</span></a>` : ""}
    </div>`;
  };

  const MESES_POR_PAGINA = 3;
  const anios = [...new Set(pasadas.map((r) => r.id.slice(0, 4)))];
  const estado = { q: "", anio: "", meses: MESES_POR_PAGINA };

  const pintarPasadas = () => {
    const q = norm(estado.q);
    const lista = pasadas.filter((r) => (!estado.anio || r.id.startsWith(estado.anio)) && (!q || r._texto.includes(q)));
    const porMes = [];
    lista.forEach((r) => {
      const mes = r.id.slice(0, 7);
      if (porMes.at(-1)?.mes !== mes) porMes.push({ mes, items: [] });
      porMes.at(-1).items.push(r);
    });
    const visibles = q ? porMes : porMes.slice(0, estado.meses);
    const restantes = porMes.slice(visibles.length).reduce((n, m) => n + m.items.length, 0);
    const nombreMes = (m) => {
      const s = new Date(m + "-15T12:00").toLocaleDateString("es", { month: "long", year: "numeric" });
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    document.getElementById("pasadas").innerHTML = !lista.length
      ? `<p class="muted">${q ? "Ninguna agenda coincide con la búsqueda." : "No hay agendas en este año."}</p>`
      : visibles.map((m) => `<div class="card mes"><div class="mes-titulo">${nombreMes(m.mes)}</div>${m.items.map(filaPasada).join("")}</div>`).join("") +
        (restantes ? `<button class="btn ghost" id="mas" style="width:100%">Mostrar más (${restantes} agendas anteriores)</button>` : "") +
        (q ? `<p class="muted small center">${lista.length} agenda(s) encontrada(s)</p>` : "");
  };

  main.innerHTML = `
    <div class="bar"><h1>Reuniones sacramentales</h1>
    </div>
    ${puedeEditar ? `<button class="fab" id="fab"><span class="ms">add</span><span>Nueva agenda</span></button>
      <dialog id="dlgNueva"><form id="nueva" class="stack" method="dialog">
        <h2>Nueva agenda</h2>
        <label>Domingo<select name="domingo" id="selDomingo">
          ${domingos.map((f) => `<option value="${f}" ${f === domingos.find((x) => !existentes.has(x)) ? "selected" : ""}>${esc(fechaLarga(f))}${existentes.has(f) ? " · ya tiene agenda" : ""}</option>`).join("")}
          <option value="otra">Otra fecha…</option></select></label>
        <div id="otraFecha" class="fecha-otra" hidden>
          <label>Día<select name="dia">${Array.from({ length: 31 }, (_, i) => `<option ${i + 1 === hoyD.getDate() ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
          <label>Mes<select name="mes">${MESES.map((m, i) => `<option value="${i + 1}" ${i === hoyD.getMonth() ? "selected" : ""}>${m}</option>`).join("")}</select></label>
          <label>Año<select name="anio">${[-1, 0, 1].map((k) => `<option ${k === 0 ? "selected" : ""}>${hoyD.getFullYear() + k}</option>`).join("")}</select></label>
        </div>
        <p id="errFecha" class="error small" hidden></p>
        <div class="row end"><button type="button" class="btn text" id="cancelarNueva">Cancelar</button><button class="btn">Crear</button></div>
      </form></dialog>` : ""}
    <h3>Próximas</h3>
    ${proximas.length ? proximas.map(tarjeta).join("") : `<p class="muted">No hay reuniones próximas planificadas.</p>`}
    ${pasadas.length ? `
      <h3>Anteriores <span class="muted">(${pasadas.length})</span></h3>
      <div class="row filtros">
        <input type="search" id="buscar" placeholder="Buscar por nombre, tema o himno">
        ${anios.length > 1 ? `<select id="anio"><option value="">Todos los años</option>${anios.map((a) => `<option>${a}</option>`).join("")}</select>` : ""}
      </div>
      <div id="pasadas"></div>` : ""}`;

  if (pasadas.length) {
    pintarPasadas();
    document.getElementById("buscar").oninput = (e) => ((estado.q = e.target.value), pintarPasadas());
    document.getElementById("anio")?.addEventListener("change", (e) => {
      estado.anio = e.target.value;
      estado.meses = MESES_POR_PAGINA;
      pintarPasadas();
    });
  }
  main.addEventListener("click", (e) => {
    if (e.target.id === "mas") {
      estado.meses += MESES_POR_PAGINA;
      pintarPasadas();
    }
  });

  if (!puedeEditar) return;
  const dlgNueva = document.getElementById("dlgNueva");
  document.getElementById("fab").onclick = () => dlgNueva.showModal();
  document.getElementById("cancelarNueva").onclick = () => dlgNueva.close();
  const otraFecha = document.getElementById("otraFecha");
  const errFecha = document.getElementById("errFecha");
  document.getElementById("selDomingo").onchange = (e) => {
    otraFecha.hidden = e.target.value !== "otra";
    errFecha.hidden = true;
  };
  document.getElementById("nueva").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let fecha = f.get("domingo");
    if (fecha === "otra") {
      const [d, m, a] = ["dia", "mes", "anio"].map((k) => Number(f.get(k)));
      if (new Date(a, m - 1, d).getDate() !== d) {
        errFecha.textContent = "Esa fecha no existe. Revisa el día y el mes.";
        errFecha.hidden = false;
        return;
      }
      fecha = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    location.hash = `#/agenda/${fecha}`;
  };
  main.onclick = (e) => {
    const id = e.target.closest("[data-borrar]")?.dataset.borrar;
    if (id && confirm(`¿Eliminar la agenda del ${fechaLarga(id)}?`)) {
      intentar(async () => {
        await store.del(`${B()}/reuniones/${id}`);
        toast("Agenda eliminada");
        vistaAgendas();
      });
    }
  };
}

// ───────────────────────── Agenda: editor ─────────────────────────

async function vistaEditor(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return (location.hash = "#/agenda");
  const main = shell("agenda");
  const [existente, participantes, reuniones, catalogo] = await Promise.all([
    store.get(`${B()}/reuniones/${fecha}`),
    cargarParticipantes(true),
    store.list(`${B()}/reuniones`).catch(() => []),
    cargarHimnos(),
  ]);
  const draft = existente ? { ...nuevaReunion(fecha), ...existente } : nuevaReunion(fecha);
  delete draft.id;
  const porId = Object.fromEntries(participantes.map((p) => [p.id, p]));

  // ── Selector de participantes: búsqueda por nombre y opción de registrar uno nuevo.
  // Para discursos y oraciones: primero quienes nunca han participado, luego quienes llevan más tiempo sin hacerlo.
  const ultimo = historial(reuniones, fecha);
  const ordenar = (tipo) => [...participantes].sort(tipo
    ? (a, b) => (ultimo[tipo][a.id] || "").localeCompare(ultimo[tipo][b.id] || "") || a.nombre.localeCompare(b.nombre, "es")
    : (a, b) => (a.organizacion || "").localeCompare(b.organizacion || "", "es") || a.nombre.localeCompare(b.nombre, "es"));

  const selPersona = (path, tipo = "") => {
    const v = getPath(draft, path);
    const p = v?.id && porId[v.id];
    const texto = !v?.id
      ? `<span class="muted">Seleccionar…</span>`
      : `<span>${esc(v.nombre)}${p?.organizacion ? ` <span class="muted">· ${esc(p.organizacion)}</span>` : ""}${p ? "" : ` <span class="muted">(eliminado)</span>`}</span>`;
    return `<button type="button" class="picker" data-pick="${path}" data-tipo="${tipo}">${texto}<span class="ms">unfold_more</span></button>`;
  };

  // Un solo diálogo para buscar, elegir o registrar participantes
  document.getElementById("dlgPersona")?.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "dlgPersona";
  dlg.className = "selector";
  document.body.appendChild(dlg);
  const puedeCrear = S.perms.editarParticipantes;

  const abrirSelector = (path, tipo) => {
    const actual = getPath(draft, path)?.id;
    const elegir = (p) => {
      setPath(draft, path, p ? { id: p.id, nombre: p.nombre, organizacion: p.organizacion || "" } : null);
      dlg.close();
      marcar();
      render();
    };

    const vistaLista = (q = "") => {
      dlg.innerHTML = `
        <div class="sel-head">
          <input type="search" id="selBuscar" placeholder="Buscar por nombre u organización" autocomplete="off" value="${esc(q)}">
          <button type="button" class="icon" id="selCerrar" title="Cerrar"><span class="ms">close</span></button>
        </div>
        <div class="sel-lista" id="selLista"></div>
        <div class="sel-pie">
          ${actual ? `<button type="button" class="btn text sm" id="selQuitar">Quitar selección</button>` : "<span></span>"}
          ${puedeCrear ? `<button type="button" class="btn ghost sm" id="selNuevo"><span class="ms">person_add</span>Nuevo participante</button>` : ""}
        </div>`;
      const $buscar = dlg.querySelector("#selBuscar");
      const $lista = dlg.querySelector("#selLista");
      let visibles = [];
      const pintar = () => {
        const t = norm($buscar.value);
        const todos = ordenar(tipo).filter((p) => p.activo !== false && (!t || norm(p.nombre).includes(t) || norm(p.organizacion).includes(t)));
        visibles = todos.slice(0, 80);
        $lista.innerHTML = visibles.map((p, i) => `
          <button type="button" class="sel-op ${p.id === actual ? "actual" : ""}" data-i="${i}">
            <span><b>${esc(p.nombre)}</b><small>${esc(p.organizacion || "Sin organización")}</small></span>
            ${tipo ? `<span class="cuando">${esc(cuando(ultimo[tipo][p.id]))}</span>` : ""}
          </button>`).join("")
          + (todos.length > visibles.length ? `<p class="muted small center">Y ${todos.length - visibles.length} más. Escribe para afinar la búsqueda.</p>` : "")
          + (todos.length ? "" : `<p class="muted center">${participantes.length ? "Nadie coincide con la búsqueda." : "Aún no hay participantes registrados."}</p>`);
      };
      $buscar.oninput = pintar;
      $buscar.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (visibles[0]) elegir(visibles[0]);
        }
      };
      $lista.onclick = (e) => {
        const o = e.target.closest("[data-i]");
        if (o) elegir(visibles[+o.dataset.i]);
      };
      dlg.querySelector("#selCerrar").onclick = () => dlg.close();
      dlg.querySelector("#selQuitar")?.addEventListener("click", () => elegir(null));
      dlg.querySelector("#selNuevo")?.addEventListener("click", () => vistaNuevo($buscar.value.trim()));
      pintar();
      $buscar.focus();
    };

    const vistaNuevo = (nombre) => {
      dlg.innerHTML = `<form class="stack sel-form" id="selForm">
        <h2>Nuevo participante</h2>
        <label>Nombre<input name="nombre" required maxlength="100" value="${esc(nombre)}"></label>
        <label>Organización<input name="organizacion" list="selOrgs" maxlength="60"></label>
        <datalist id="selOrgs">${ORGANIZACIONES.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>
        <label>Teléfono<input name="telefono" type="tel" maxlength="30"></label>
        <div class="row end"><button type="button" class="btn text" id="selVolver">Volver</button><button class="btn">Guardar y seleccionar</button></div>
      </form>`;
      dlg.querySelector("#selVolver").onclick = () => vistaLista(nombre);
      dlg.querySelector('[name="nombre"]').focus();
      dlg.querySelector("#selForm").onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const datos = { nombre: f.get("nombre").trim(), organizacion: f.get("organizacion").trim(), activo: true };
        const repetido = participantes.find((p) => norm(p.nombre) === norm(datos.nombre));
        if (repetido && !confirm(`Ya existe "${repetido.nombre}". ¿Registrar otro participante con el mismo nombre?`)) return;
        intentar(async () => {
          const id = store.newId(`${B()}/participantes`);
          await store.set(`${B()}/participantes/${id}`, datos);
          const tel = f.get("telefono").trim();
          if (tel) await store.set(`${B()}/contactos/${id}`, { telefono: tel });
          const p = { id, ...datos };
          participantes.push(p);
          porId[id] = p;
          S.participantes = null;
          toast(`${p.nombre} registrado`);
          elegir(p);
        });
      };
    };

    vistaLista();
    dlg.showModal();
  };
  const txt = (path, ph = "", type = "text") =>
    `<input type="${type}" data-f="${path}" value="${esc(getPath(draft, path))}" placeholder="${ph}">`;
  // Himnos: al escribir el número se completa el título, y al elegir un título se completa el número
  const libroDe = (numero) => catalogo.porNumero.get(String(numero || "").trim())?.h || "";
  const etiquetaHimno = (path) => {
    const t = getPath(draft, path)?.titulo;
    return (t ? `<span>${esc(t)}</span>` : `<span class="muted">Buscar himno…</span>`) + `<span class="ms">search</span>`;
  };
  const himno = (path, label) => `
    <div class="field"><label>${label}</label>
      <div class="himno" data-himno="${path}"><input type="number" min="1" inputmode="numeric" data-f="${path}.numero" value="${esc(getPath(draft, path)?.numero)}" placeholder="N.º">
      <button type="button" class="picker" data-himno-pick="${path}">${etiquetaHimno(path)}</button></div>
      <small class="muted himno-libro" data-libro="${path}">${esc(libroDe(getPath(draft, path)?.numero))}</small></div>`;

  // Selector de himnos: misma ventana que la de participantes, busca por número o por título
  const abrirHimnos = (path) => {
    const actual = getPath(draft, path) || {};
    const elegir = (numero, titulo) => {
      setPath(draft, path, { numero: numero ? String(numero) : "", titulo: titulo || "" });
      dlg.close();
      marcar();
      render();
    };
    dlg.innerHTML = `
      <div class="sel-head">
        <input type="search" id="selBuscar" placeholder="Buscar por número o título" autocomplete="off">
        <button type="button" class="icon" id="selCerrar" title="Cerrar"><span class="ms">close</span></button>
      </div>
      <div class="sel-lista" id="selLista"></div>
      <div class="sel-pie">
        ${actual.numero || actual.titulo ? `<button type="button" class="btn text sm" id="selQuitar">Quitar himno</button>` : "<span></span>"}
        <button type="button" class="btn ghost sm" id="selManual" hidden><span class="ms">edit</span><span id="selManualTxt"></span></button>
      </div>`;
    const $buscar = dlg.querySelector("#selBuscar");
    const $lista = dlg.querySelector("#selLista");
    const $manual = dlg.querySelector("#selManual");
    let visibles = [];
    const pintar = () => {
      const q = $buscar.value.trim();
      const t = norm(q);
      const esNumero = /^\d+$/.test(q);
      const todos = catalogo.lista
        .filter((h) => !t || (esNumero ? String(h.n).startsWith(q) : norm(h.t).includes(t)))
        .sort((a, b) => (esNumero ? (String(b.n) === q) - (String(a.n) === q) : 0) || a.n - b.n);
      visibles = todos.slice(0, 80);
      $lista.innerHTML = visibles.map((h, i) => `
        <button type="button" class="sel-op himno-op ${String(h.n) === String(actual.numero) ? "actual" : ""}" data-i="${i}">
          <span class="num-himno">${h.n}</span>
          <span class="sel-txt"><b>${esc(h.t)}</b><small>${esc(h.h || "")}</small></span>
        </button>`).join("")
        + (todos.length > visibles.length ? `<p class="muted small center">Y ${todos.length - visibles.length} más. Escribe para afinar la búsqueda.</p>` : "")
        + (todos.length ? "" : `<p class="muted center">${catalogo.lista.length ? "Ningún himno coincide." : "El catálogo de himnos todavía no está cargado."}</p>`);
      // Si el himno no está en el catálogo, se puede escribir el título a mano
      $manual.hidden = !q || esNumero;
      dlg.querySelector("#selManualTxt").textContent = `Usar "${q}" como título`;
    };
    $buscar.oninput = pintar;
    $buscar.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (visibles[0]) elegir(visibles[0].n, visibles[0].t);
      else if (!$manual.hidden) $manual.click();
    };
    $lista.onclick = (e) => {
      const o = e.target.closest("[data-i]");
      if (o) elegir(visibles[+o.dataset.i].n, visibles[+o.dataset.i].t);
    };
    $manual.onclick = () => elegir(actual.numero, $buscar.value.trim().slice(0, 120));
    dlg.querySelector("#selCerrar").onclick = () => dlg.close();
    dlg.querySelector("#selQuitar")?.addEventListener("click", () => elegir("", ""));
    pintar();
    dlg.showModal();
    $buscar.focus();
  };
  const persona = (path, label, tipo) => `<div class="field"><label>${label}</label>${selPersona(path, tipo)}</div>`;
  const filas = (lista, render, textoAgregar) => `
    ${draft[lista].map((_, i) => `<div class="fila">
      <span class="num">${i + 1}</span><div class="fila-body">${render(`${lista}.${i}`)}</div>
      <div class="fila-acc">
        <button type="button" class="icon" data-up="${lista}.${i}" title="Subir" ${i ? "" : "disabled"}><span class="ms">arrow_upward</span></button>
        <button type="button" class="icon" data-del="${lista}.${i}" title="Quitar"><span class="ms">close</span></button>
      </div></div>`).join("")}
    <button type="button" class="btn ghost sm" data-add="${lista}"><span class="ms">add</span>${textoAgregar}</button>`;
  const discursante = (p) => `${selPersona(p + ".persona", "discurso")}
    <div class="dos">${txt(p + ".tema", "Tema")}${txt(p + ".link", "Link de referencia (opcional)", "url")}</div>`;
  const seccion = (n, titulo, cuerpo) => `<section class="card"><h2><span class="paso">${n}</span>${titulo}</h2>${cuerpo}</section>`;

  const render = () => {
    const disc = draft.tipo === "discursos";
    let n = 0;
    main.innerHTML = `
    <div class="bar"><div><a href="#/agenda" class="btn text"><span class="ms">arrow_back</span>Agendas</a><h1 class="cap">${esc(fechaLarga(fecha))}</h1></div></div>
    ${participantes.length ? "" : `<p class="aviso">Aún no hay participantes registrados. Puedes registrarlos desde cada selector con "Nuevo participante", o <a href="#/participantes">importarlos todos</a>.</p>`}
    ${seccion(++n, "Presidencia", `
      <div class="dos">${persona("preside", "Preside")}${persona("dirige", "Dirige")}</div>
      <label>Líderes visitantes</label>
      ${filas("visitantes", (p) => `<div class="dos">${txt(p + ".nombre", "Nombre")}${txt(p + ".llamamiento", "Llamamiento (ej. Presidencia de estaca)")}</div>`, "Agregar líder visitante")}`)}
    ${seccion(++n, "Anuncios", filas("anuncios", (p) => `<textarea data-f="${p}.texto" rows="2" placeholder="Anuncio">${esc(getPath(draft, p + ".texto"))}</textarea>`, "Agregar anuncio"))}
    ${seccion(++n, "Asuntos del barrio", `<p class="muted small">Llamamientos nuevos (sostenimientos), relevos y ordenaciones.</p>
      ${filas("asuntos", (p) => `<div class="tres">
        <select data-f="${p}.tipo">${TIPOS_ASUNTO.map((t) => `<option ${getPath(draft, p + ".tipo") === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        ${selPersona(p + ".persona")}${txt(p + ".llamamiento", "Llamamiento")}</div>`, "Agregar asunto")}`)}
    ${seccion(++n, "Himno y oración de apertura", himno("primerHimno", "Primer himno") + persona("primeraOracion", "Primera oración", "oracion"))}
    ${seccion(++n, "Santa Cena", himno("himnoSacramental", "Himno sacramental") + `<p class="muted small">Bendición y reparto de la Santa Cena.</p>`)}
    ${seccion(++n, "Tipo de reunión", `<div class="radios">
        <label><input type="radio" name="tipo" value="discursos" ${disc ? "checked" : ""}> Discursos</label>
        <label><input type="radio" name="tipo" value="testimonios" ${disc ? "" : "checked"}> Testimonios</label></div>
      ${disc ? "" : `<label>Personas que compartieron su testimonio</label>${filas("testimonios", (p) => selPersona(p + ".persona"), "Agregar testimonio")}`}`)}
    ${disc ? seccion(++n, "Discursantes", filas("discursantes1", discursante, "Agregar discursante")) : ""}
    ${disc ? seccion(++n, "Himno intermedio", himno("himnoIntermedio", "Himno intermedio")) : ""}
    ${disc ? seccion(++n, "Discursantes (después del himno intermedio)", filas("discursantes2", discursante, "Agregar discursante")) : ""}
    ${seccion(++n, "Clausura", himno("ultimoHimno", "Último himno") + persona("ultimaOracion", "Última oración", "oracion"))}
    ${seccion(++n, "Notas", `<textarea data-f="notas" rows="3" placeholder="Notas internas (opcional)">${esc(draft.notas)}</textarea>`)}
    <div class="guardar-bar noprint">
      <span id="estado" class="muted small">${S.dirty ? "Cambios sin guardar" : existente ? "Guardado" : "Nueva agenda"}</span>
      ${existente ? `<button class="icon danger" id="eliminar" title="Eliminar agenda"><span class="ms">delete</span></button><a class="btn ghost" href="#/ver/${fecha}"><span class="ms">print</span>Ver</a>` : ""}
      <button class="btn" id="guardar"><span class="ms">save</span>Guardar</button>
    </div>`;
  };

  const marcar = () => {
    S.dirty = true;
    const e = document.getElementById("estado");
    if (e) e.textContent = "Cambios sin guardar";
  };

  main.oninput = (e) => {
    const t = e.target;
    if (t.dataset.f) {
      setPath(draft, t.dataset.f, t.value);
      marcar();
      // Al escribir el número de un himno se completa el título
      const m = t.dataset.f.match(/^(.+)\.numero$/);
      const caja = m && main.querySelector(`[data-himno="${m[1]}"]`);
      if (caja) {
        const h = catalogo.porNumero.get(t.value.trim());
        const antes = getPath(draft, `${m[1]}.titulo`);
        if (h) setPath(draft, `${m[1]}.titulo`, h.t);
        else if (antes && catalogo.porTitulo.has(norm(antes))) setPath(draft, `${m[1]}.titulo`, "");
        caja.querySelector("[data-himno-pick]").innerHTML = etiquetaHimno(m[1]);
        main.querySelector(`[data-libro="${m[1]}"]`).textContent = libroDe(t.value);
      }
    }
  };
  main.onchange = (e) => {
    const t = e.target;
    if (t.name === "tipo") {
      draft.tipo = t.value;
      marcar();
      render();
    }
  };
  main.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pick) return abrirSelector(b.dataset.pick, b.dataset.tipo);
    if (b.dataset.himnoPick) return abrirHimnos(b.dataset.himnoPick);
    const ref = b.dataset.add || b.dataset.del || b.dataset.up;
    if (b.dataset.add) draft[ref].push(clone(PLANTILLAS[ref]));
    if (b.dataset.del || b.dataset.up) {
      const [lista, i] = ref.split(".");
      const arr = draft[lista];
      const [item] = arr.splice(+i, 1);
      if (b.dataset.up) arr.splice(+i - 1, 0, item);
    }
    if (ref) {
      marcar();
      return render();
    }
    if (b.id === "eliminar" && confirm(`¿Eliminar la agenda del ${fechaLarga(fecha)}?`)) {
      await intentar(async () => {
        await store.del(`${B()}/reuniones/${fecha}`);
        S.dirty = false;
        toast("Agenda eliminada");
        location.hash = "#/agenda";
      });
    }
    if (b.id === "guardar") {
      b.disabled = true;
      await intentar(async () => {
        await store.set(`${B()}/reuniones/${fecha}`, { ...draft, actualizadoPor: S.user.name, actualizadoEn: now() });
        S.dirty = false;
        toast("Agenda guardada");
        location.hash = `#/ver/${fecha}`;
      });
      b.disabled = false;
    }
  };
  render();
}

// ───────────────────────── Agenda: vista para imprimir ─────────────────────────

async function vistaAgendaImpresa(fecha) {
  const main = shell("agenda");
  const r = await store.get(`${B()}/reuniones/${fecha}`);
  if (!r) {
    main.innerHTML = `<p>No existe una agenda para esta fecha. <a href="#/agenda">Volver</a></p>`;
    return;
  }
  const vacio = `<span class="muted">—</span>`;
  const nom = (p) => (p?.nombre ? esc(p.nombre) : vacio);
  const himno = (h) => (h?.numero || h?.titulo ? `<strong>${esc(h.numero ? "#" + h.numero : "")}</strong> ${esc(h.titulo)}` : vacio);
  const linea = (label, valor) => `<div class="linea"><span>${label}</span><div>${valor}</div></div>`;
  const lista = (items, fn) => (items?.length ? `<ol>${items.map((x) => `<li>${fn(x)}</li>`).join("")}</ol>` : vacio);
  const discursos = (arr) =>
    lista((arr || []).filter((d) => d.persona || d.tema), (d) =>
      `<strong>${nom(d.persona)}</strong>${d.tema ? ` — ${esc(d.tema)}` : ""}${d.link ? ` <a class="noprint-link" href="${esc(d.link)}" target="_blank" rel="noopener">(referencia)</a>` : ""}`);

  main.innerHTML = `
  <div class="bar noprint"><a href="#/agenda" class="btn text"><span class="ms">arrow_back</span>Agendas</a>
    <div class="row">${S.perms.editarAgenda ? `<a class="btn ghost" href="#/agenda/${fecha}"><span class="ms">edit</span>Editar</a>` : ""}<button class="btn" onclick="print()"><span class="ms">print</span>Imprimir</button></div></div>
  <article class="hoja">
    <header><h1>Reunión Sacramental</h1>
      <div><strong>${esc(fechaLarga(fecha))}</strong><br>${esc(S.barrio.nombre)}${S.barrio.estaca ? " · " + esc(S.barrio.estaca) : ""}</div></header>
    <div class="par">${linea("Preside", nom(r.preside))}${linea("Dirige", nom(r.dirige))}</div>
    ${r.visitantes?.length ? linea("Visitantes", r.visitantes.map((v) => `${esc(v.nombre)}${v.llamamiento ? ` <span class="muted">(${esc(v.llamamiento)})</span>` : ""}`).join("; ")) : ""}
    <div class="par">
      <div><h2>Bienvenida y anuncios</h2>
        ${lista((r.anuncios || []).filter((a) => a.texto), (a) => esc(a.texto).replace(/\n/g, "<br>"))}</div>
      <div><h2>Asuntos del barrio</h2>
        ${lista((r.asuntos || []).filter((a) => a.persona || a.llamamiento), (a) => `<em>${esc(a.tipo)}:</em> <strong>${nom(a.persona)}</strong>${a.llamamiento ? ` — ${esc(a.llamamiento)}` : ""}`)}</div>
    </div>
    <h2>Apertura y Santa Cena</h2>
    <div class="par">${linea("Primer himno", himno(r.primerHimno))}${linea("Primera oración", nom(r.primeraOracion))}</div>
    ${linea("Himno sacramental", `${himno(r.himnoSacramental)} <span class="muted">· Bendición y reparto de la Santa Cena</span>`)}
    ${r.tipo === "testimonios"
      ? `<h2>Reunión de testimonios</h2>
         ${(r.testimonios || []).some((t) => t.persona) ? lista(r.testimonios.filter((t) => t.persona), (t) => nom(t.persona)) : ""}
         <table class="registro">
           <thead><tr>${"<th>Nombre</th>".repeat(COLUMNAS_TESTIMONIOS)}</tr></thead>
           <tbody>${`<tr>${"<td></td>".repeat(COLUMNAS_TESTIMONIOS)}</tr>`.repeat(FILAS_TESTIMONIOS)}</tbody>
         </table>
         <p class="muted small">Anote aquí los testimonios durante la reunión y luego regístrelos en la app.</p>`
      : `<h2>Discursos</h2>${discursos(r.discursantes1)}
         ${linea("Himno intermedio", himno(r.himnoIntermedio))}
         ${discursos(r.discursantes2)}`}
    <h2>Clausura</h2>
    <div class="par">${linea("Último himno", himno(r.ultimoHimno))}${linea("Última oración", nom(r.ultimaOracion))}</div>
    ${r.notas ? `<div class="notas noprint"><h2>Notas</h2><p>${esc(r.notas).replace(/\n/g, "<br>")}</p></div>` : ""}
    ${r.actualizadoPor ? `<p class="muted small noprint">Última edición: ${esc(r.actualizadoPor)}, ${new Date(r.actualizadoEn).toLocaleString("es")}</p>` : ""}
  </article>`;
}

// ───────────────────────── Participantes ─────────────────────────

const EJEMPLO = [
  ["Juan Pérez", "Obispado", "9999-0001"], ["Carlos Martínez", "Obispado", "9999-0002"],
  ["Luis Hernández", "Obispado", "9999-0003"], ["María López", "Sociedad de Socorro", "9999-0004"],
  ["Ana García", "Sociedad de Socorro", "9999-0005"], ["José Ramírez", "Cuórum de Élderes", "9999-0006"],
  ["Pedro Flores", "Cuórum de Élderes", "9999-0007"], ["Daniel Castro", "Hombres Jóvenes", "9999-0008"],
  ["Sofía Mejía", "Mujeres Jóvenes", "9999-0009"], ["Lucía Torres", "Primaria", "9999-0010"],
  ["Andrés Reyes", "Escuela Dominical", "9999-0011"], ["Élder Smith", "Misioneros", ""],
];

async function vistaParticipantes() {
  const main = shell("participantes");
  const puedeEditar = S.perms.editarParticipantes;
  const verTel = S.perms.verTelefonos;
  const [lista, contactos, reuniones] = await Promise.all([
    cargarParticipantes(true),
    verTel ? store.list(`${B()}/contactos`) : [],
    S.perms.verAgenda ? store.list(`${B()}/reuniones`) : [],
  ]);
  const tel = Object.fromEntries(contactos.map((c) => [c.id, c.telefono]));
  const hist = historial(reuniones);
  const dato = (etiqueta, valor, vacio) => `<span class="${vacio ? "muted" : ""}"><span class="muted">${etiqueta}:</span> ${valor}</span>`;
  const historialDe = (id) => {
    const u = hist.ultima[id];
    return `<p class="hist small">
      ${dato("Último discurso", esc(cuando(hist.discurso[id])), !hist.discurso[id])}
      ${dato("Última oración", esc(cuando(hist.oracion[id])), !hist.oracion[id])}
      ${dato("Última participación", u ? `${esc(u.tipo)}, ${esc(cuando(u.fecha))}` : "ninguna registrada", !u)}
    </p>`;
  };
  const filtro = { q: "", org: "", estado: "activos" };
  const titulo = () => {
    const inactivos = lista.filter((p) => p.activo === false).length;
    return `Participantes <small class="muted">(${lista.length - inactivos}${inactivos ? ` + ${inactivos} inactivo${inactivos > 1 ? "s" : ""}` : ""})</small>`;
  };

  main.innerHTML = `
    <div class="bar"><h1 id="tituloParticipantes">${titulo()}</h1>
      ${puedeEditar ? `<div class="row">
        <button class="btn" id="agregar"><span class="ms">person_add</span>Agregar</button>
        <label class="btn ghost"><span class="ms">upload_file</span>Importar Excel o CSV<input type="file" id="archivo" accept=".xlsx,.xls,.csv,.txt" hidden></label>
      </div>` : ""}</div>
    <div class="row filtros">
      <input type="search" id="q" placeholder="Buscar por nombre">
      <select id="estado"><option value="activos" selected>Solo activos</option><option value="inactivos">Solo inactivos</option><option value="">Activos e inactivos</option></select>
      <select id="org"><option value="">Todas las organizaciones</option>${[...new Set([...ORGANIZACIONES, ...lista.map((p) => p.organizacion).filter(Boolean)])].map((o) => `<option>${esc(o)}</option>`).join("")}</select>
    </div>
    <div id="lista"></div>
    <datalist id="orgs">${ORGANIZACIONES.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>
    <dialog id="dlg"></dialog>`;

  const $lista = document.getElementById("lista");
  const dlg = document.getElementById("dlg");

  const pintar = () => {
    const q = norm(filtro.q);
    const estadoOk = (p) => !filtro.estado || (filtro.estado === "inactivos") === (p.activo === false);
    // Los inactivos van al final de la lista
    const vis = lista
      .filter((p) => (!q || norm(p.nombre).includes(q)) && (!filtro.org || p.organizacion === filtro.org) && estadoOk(p))
      .sort((a, b) => (a.activo === false) - (b.activo === false));
    if (!lista.length) {
      $lista.innerHTML = `<div class="card center"><p>Aún no hay participantes.</p>
        ${puedeEditar ? `<p class="muted small">Agrégalos uno por uno o importa un archivo CSV con las columnas: <code>Nombre, Organización, Teléfono</code>.</p>` : ""}
        ${DEMO && puedeEditar ? `<button class="btn ghost" id="ejemplo">Cargar participantes de ejemplo</button>` : ""}</div>`;
      return;
    }
    $lista.innerHTML = vis.map((p) => `
      <div class="card persona ${p.activo === false ? "inactivo" : ""}" data-id="${p.id}">
        <div><strong>${esc(p.nombre)}</strong>${p.activo === false ? ` <span class="pill">Inactivo</span>` : ""}
          <p class="muted small">${esc(p.organizacion || "Sin organización")}
          ${verTel && tel[p.id] ? ` · <a href="tel:${esc(tel[p.id])}">${esc(tel[p.id])}</a>` : ""}</p>
          ${S.perms.verAgenda ? historialDe(p.id) : ""}
        </div>
        ${puedeEditar ? `<div class="acciones">
          ${p.activo === false
            ? `<button class="btn sm" data-activar="${p.id}"><span class="ms">person_check</span>Reactivar</button>`
            : `<button class="btn text sm" data-desactivar="${p.id}" title="No aparecerá al elegir participantes"><span class="ms">person_off</span>Desactivar</button>`}
          <button class="btn ghost sm" data-editar="${p.id}">Editar</button>
          <button class="icon danger" data-borrar="${p.id}" title="Eliminar"><span class="ms">delete</span></button></div>` : ""}
      </div>`).join("") || `<p class="muted">Nadie coincide con la búsqueda.</p>`;
  };

  const formulario = (p = {}) => {
    const nuevo = !p.id;
    const mostrarTel = verTel || nuevo;
    dlg.innerHTML = `<form method="dialog" class="stack" id="fp">
      <h2>${nuevo ? "Agregar" : "Editar"} participante</h2>
      <label>Nombre<input name="nombre" required value="${esc(p.nombre)}"></label>
      <label>Organización<input name="organizacion" list="orgs" value="${esc(p.organizacion)}"></label>
      ${mostrarTel ? `<label>Teléfono<input name="telefono" type="tel" value="${esc(tel[p.id])}"></label>` : ""}
      <div class="row end"><button type="button" class="btn ghost" id="cancelar">Cancelar</button><button class="btn">Guardar</button></div>
    </form>`;
    dlg.showModal();
    document.getElementById("cancelar").onclick = () => dlg.close();
    document.getElementById("fp").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      intentar(async () => {
        const id = p.id || store.newId(`${B()}/participantes`);
        await store.set(`${B()}/participantes/${id}`, {
          nombre: f.get("nombre").trim(), organizacion: f.get("organizacion").trim(), activo: p.activo !== false,
        });
        if (mostrarTel) await store.set(`${B()}/contactos/${id}`, { telefono: f.get("telefono").trim() });
        dlg.close();
        toast("Participante guardado");
        vistaParticipantes();
      });
    };
  };

  const importar = async (archivo) => {
    const filas = await leerHojaCalculo(archivo);
    if (!filas.length) return toast("El archivo está vacío.", true);
    const cab = filas[0].map(norm);
    const col = (...nombres) => cab.findIndex((c) => nombres.some((n) => c.startsWith(n)));
    let idx = { nombre: col("nombre", "name"), organizacion: col("organizacion", "org"), telefono: col("telefono", "tel", "celular", "phone", "movil") };
    let datos = filas.slice(1);
    if (idx.nombre < 0) {
      idx = { nombre: 0, organizacion: 1, telefono: 2 };
      datos = filas;
    }
    const porNombre = Object.fromEntries(lista.map((p) => [norm(p.nombre), p.id]));
    const val = (r, i) => (i >= 0 ? (r[i] || "").trim() : "");
    const items = datos.map((r) => ({
      nombre: val(r, idx.nombre), organizacion: val(r, idx.organizacion),
      telefono: val(r, idx.telefono),
    })).filter((x) => x.nombre);
    const existentes = items.filter((x) => porNombre[norm(x.nombre)]).length;

    dlg.innerHTML = `<form method="dialog" class="stack">
      <h2>Importar participantes</h2>
      <p>Se encontraron <strong>${items.length}</strong> participantes en el archivo.
      ${existentes ? `<br>${existentes} ya existen (mismo nombre) y se actualizarán.` : ""}</p>
      <div class="preview">${items.slice(0, 8).map((x) => `<div>${esc(x.nombre)} <span class="muted">· ${esc(x.organizacion)}</span></div>`).join("")}
      ${items.length > 8 ? `<div class="muted">…y ${items.length - 8} más</div>` : ""}</div>
      <div class="row end"><button type="button" class="btn ghost" id="cancelar">Cancelar</button><button class="btn" id="ok">Importar</button></div>
    </form>`;
    dlg.showModal();
    document.getElementById("cancelar").onclick = () => dlg.close();
    document.getElementById("ok").onclick = (e) => {
      e.preventDefault();
      e.target.disabled = true;
      intentar(async () => {
        const escrituras = [];
        items.forEach((x) => {
          const id = porNombre[norm(x.nombre)] || store.newId(`${B()}/participantes`);
          porNombre[norm(x.nombre)] = id;
          const previo = lista.find((p) => p.id === id);
          escrituras.push({ path: `${B()}/participantes/${id}`, data: { nombre: x.nombre, organizacion: x.organizacion, activo: previo ? previo.activo !== false : true } });
          if (x.telefono) escrituras.push({ path: `${B()}/contactos/${id}`, data: { telefono: x.telefono } });
        });
        await store.batchSet(escrituras);
        dlg.close();
        toast(`${items.length} participantes importados`);
        vistaParticipantes();
      });
    };
  };

  document.getElementById("q").oninput = (e) => ((filtro.q = e.target.value), pintar());
  document.getElementById("org").onchange = (e) => ((filtro.org = e.target.value), pintar());
  document.getElementById("estado").onchange = (e) => ((filtro.estado = e.target.value), pintar());
  if (puedeEditar) {
    document.getElementById("agregar").onclick = () => formulario();
    document.getElementById("archivo").onchange = (e) => {
      if (e.target.files[0]) intentar(() => importar(e.target.files[0]));
      e.target.value = "";
    };
    $lista.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.id === "ejemplo") {
        return intentar(async () => {
          const filas = [];
          EJEMPLO.forEach(([nombre, organizacion, telefono]) => {
            const id = store.newId();
            filas.push({ path: `${B()}/participantes/${id}`, data: { nombre, organizacion, activo: true } });
            filas.push({ path: `${B()}/contactos/${id}`, data: { telefono } });
          });
          await store.batchSet(filas);
          vistaParticipantes();
        });
      }
      const p = lista.find((x) => x.id === (b.dataset.editar || b.dataset.borrar || b.dataset.activar || b.dataset.desactivar));
      if (b.dataset.editar) formulario(p);
      if (b.dataset.activar || b.dataset.desactivar) {
        const activo = !!b.dataset.activar;
        if (!activo && !confirm(`¿Desactivar a ${p.nombre}? No aparecerá al elegir participantes en las agendas. Su historial se conserva y puedes reactivarlo cuando quieras.`)) return;
        intentar(async () => {
          await store.set(`${B()}/participantes/${p.id}`, { activo }, true);
          // Se actualiza solo la lista, sin recargar la página ni perder filtros o posición
          p.activo = activo;
          S.participantes = null;
          document.getElementById("tituloParticipantes").innerHTML = titulo();
          const tarjeta = b.closest(".persona");
          const sale = (filtro.estado === "activos" && !activo) || (filtro.estado === "inactivos" && activo);
          if (sale && tarjeta) {
            // El filtro ya no lo incluye: se desvanece y se cierra el espacio antes de redibujar
            tarjeta.style.height = `${tarjeta.offsetHeight}px`;
            void tarjeta.offsetHeight;
            tarjeta.classList.add("saliendo");
            await new Promise((r) => setTimeout(r, 380));
            pintar();
          } else {
            pintar();
            $lista.querySelector(`[data-id="${p.id}"]`)?.classList.add("destello");
          }
          toast(activo ? `${p.nombre} reactivado` : `${p.nombre} desactivado`);
        });
      }
      if (b.dataset.borrar && confirm(`¿Eliminar a ${p.nombre}?`)) {
        intentar(async () => {
          await store.del(`${B()}/participantes/${p.id}`);
          await store.del(`${B()}/contactos/${p.id}`);
          toast("Participante eliminado");
          vistaParticipantes();
        });
      }
    };
  }
  pintar();
}

// Lee la primera hoja de un Excel (o la hoja "Himnos" si existe) o un CSV, como filas de celdas
async function leerHojaCalculo(archivo) {
  if (/\.(csv|txt)$/i.test(archivo.name)) return parseCSV(await archivo.text());
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const libro = XLSX.read(await archivo.arrayBuffer());
  const hoja = libro.Sheets[libro.SheetNames.includes("Himnos") ? "Himnos" : libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" }).filter((f) => f.some((x) => String(x).trim()));
}

// Catálogo global de himnos (un solo documento, compartido por todos los barrios)
async function cargarHimnos() {
  if (!S.himnos) {
    const doc = await store.get("catalogo/himnos").catch(() => null);
    const lista = doc?.lista || [];
    S.himnos = {
      lista,
      actualizadoEn: doc?.actualizadoEn || "",
      porNumero: new Map(lista.map((h) => [String(h.n), h])),
      porTitulo: new Map(lista.map((h) => [norm(h.t), h])),
    };
  }
  return S.himnos;
}

function parseCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const primera = texto.split(/\r?\n/)[0];
  const cuenta = (c) => primera.split(c).length;
  const sep = cuenta("\t") > 1 ? "\t" : cuenta(";") > cuenta(",") ? ";" : ",";
  const filas = [];
  let fila = [], celda = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') (celda += '"'), i++;
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) fila.push(celda), (celda = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda), filas.push(fila), (fila = []), (celda = "");
    } else celda += c;
  }
  if (celda || fila.length) fila.push(celda), filas.push(fila);
  return filas.filter((f) => f.some((x) => x.trim()));
}

// ───────────────────────── Usuarios ─────────────────────────

async function vistaUsuarios() {
  const main = shell("usuarios");
  const [miembros, roles] = await Promise.all([store.list(`${B()}/miembros`), store.list(`${B()}/roles`)]);
  roles.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  const admins = S.barrio.admins || [];
  const orden = (m) => (m.estado === "pendiente" ? 0 : 1);
  miembros.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, "es"));
  const selRol = (m) => `<select data-rol="${m.id}"><option value="">— Rol —</option>
    ${roles.map((r) => `<option value="${r.id}" ${m.rolId === r.id ? "selected" : ""}>${esc(r.nombre)}</option>`).join("")}</select>`;

  main.innerHTML = `
    <div class="bar"><h1>Usuarios</h1></div>
    <div class="card codigo">
      <div><span class="muted small">Código del barrio</span><div class="code">${esc(S.barrio.id)}</div></div>
      <p class="small">Comparte este código con los miembros del obispado. Entran con su cuenta de Google, escriben el código y aquí aparecerá su solicitud para que les asignes un rol.</p>
    </div>
    ${miembros.map((m) => {
      const esAdm = admins.includes(m.id);
      return `<div class="card persona ${m.estado === "pendiente" ? "pendiente" : ""}">
        <div><strong>${esc(m.nombre)}</strong> ${esAdm ? `<span class="pill admin">Administrador</span>` : ""}
          ${m.estado === "pendiente" ? `<span class="pill pend">Pendiente</span>` : ""}
          <p class="muted small">${esc(m.email)}</p></div>
        <div class="acciones">
          ${selRol(m)}
          ${m.estado === "pendiente" ? `<button class="btn sm" data-aprobar="${m.id}"><span class="ms">check</span>Aprobar</button>` : ""}
          ${S.esAdmin && m.id !== S.user.uid ? `<button class="btn ghost sm" data-admin="${m.id}">${esAdm ? "Quitar admin" : "Hacer admin"}</button>` : ""}
          ${m.id !== S.user.uid && !esAdm ? `<button class="btn danger sm" data-quitar="${m.id}">${m.estado === "pendiente" ? "Rechazar" : "Quitar acceso"}</button>` : ""}
        </div></div>`;
    }).join("")}
    <p class="muted small">Los administradores tienen todos los permisos sin importar su rol. Los permisos de cada rol se configuran en la pestaña Roles.</p>`;

  const ruta = (id) => `${B()}/miembros/${id}`;
  main.onchange = (e) => {
    const id = e.target.dataset.rol;
    const m = miembros.find((x) => x.id === id);
    if (!id || m.estado === "pendiente") return;
    intentar(async () => {
      await store.set(ruta(id), { rolId: e.target.value || null }, true);
      toast("Rol actualizado");
    });
  };
  main.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.aprobar || b.dataset.quitar || b.dataset.admin;
    const m = miembros.find((x) => x.id === id);
    if (b.dataset.aprobar) {
      const rolId = main.querySelector(`[data-rol="${id}"]`).value;
      if (!rolId) return toast("Primero elige un rol para esta persona.", true);
      intentar(async () => {
        await store.set(ruta(id), { estado: "activo", rolId }, true);
        toast(`${m.nombre} fue aprobado`);
        vistaUsuarios();
      });
    }
    if (b.dataset.quitar && confirm(`¿Quitar el acceso de ${m.nombre}?`)) {
      intentar(async () => {
        await store.del(ruta(id));
        vistaUsuarios();
      });
    }
    if (b.dataset.admin) {
      const nuevos = admins.includes(id) ? admins.filter((a) => a !== id) : [...admins, id];
      if (!admins.includes(id) && m.estado === "pendiente") return toast("Primero aprueba a esta persona.", true);
      intentar(async () => {
        await store.set(`barrios/${S.barrio.id}`, { admins: nuevos }, true);
        S.barrio.admins = nuevos;
        vistaUsuarios();
      });
    }
  };
}

// ───────────────────────── Roles ─────────────────────────

async function vistaRoles() {
  const main = shell("roles");
  const roles = (await store.list(`${B()}/roles`)).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  main.innerHTML = `
    <div class="bar"><h1>Roles y permisos</h1>
      <form id="nuevo" class="row"><input name="nombre" required placeholder="Nombre del nuevo rol"><button class="btn"><span class="ms">add</span>Crear rol</button></form></div>
    <div class="roles">${roles.map((r) => `
      <form class="card rol" data-id="${r.id}">
        <input class="titulo" name="nombre" value="${esc(r.nombre)}" required>
        ${PERMISOS.map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${r.permisos?.[k] ? "checked" : ""}> ${l}</label>`).join("")}
        <div class="row end"><button type="button" class="btn danger sm" data-borrar="${r.id}">Eliminar</button><button class="btn sm">Guardar</button></div>
      </form>`).join("")}</div>
    <p class="muted small">Como administrador tienes siempre todos los permisos. Los cambios aplican la próxima vez que cada persona abra la app.</p>`;

  document.getElementById("nuevo").onsubmit = (e) => {
    e.preventDefault();
    const nombre = new FormData(e.target).get("nombre").trim();
    intentar(async () => {
      await store.add(`${B()}/roles`, { nombre, orden: roles.length + 1, permisos: { verAgenda: true } });
      vistaRoles();
    });
  };
  main.querySelectorAll("form.rol").forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const permisos = Object.fromEntries(PERMISOS.map(([k]) => [k, fd.has(k)]));
      intentar(async () => {
        await store.set(`${B()}/roles/${f.dataset.id}`, { nombre: fd.get("nombre").trim(), permisos }, true);
        toast("Rol guardado");
      });
    };
  });
  main.onclick = (e) => {
    const id = e.target.dataset.borrar;
    if (!id) return;
    const r = roles.find((x) => x.id === id);
    if (!confirm(`¿Eliminar el rol "${r.nombre}"? Las personas con este rol se quedarán sin permisos.`)) return;
    intentar(async () => {
      await store.del(`${B()}/roles/${id}`);
      vistaRoles();
    });
  };
}

// ───────────────────────── Barrios (superadministrador) ─────────────────────────

async function vistaBarrios() {
  const main = shell("barrios");
  const [barrios, himnos] = await Promise.all([store.list("barrios"), cargarHimnos()]);
  const orden = { pendiente: 0, aprobado: 1, rechazado: 2 };
  barrios.sort((a, b) => (orden[a.estado] ?? 0) - (orden[b.estado] ?? 0) || (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const etiqueta = { pendiente: ["pend", "Pendiente"], aprobado: ["admin", "Aprobado"], rechazado: ["", "Rechazado"] };
  const pendientes = barrios.filter((b) => (b.estado || "pendiente") === "pendiente").length;

  main.innerHTML = `
    <div class="bar"><h1>Barrios</h1></div>
    <p class="muted">Como superadministrador apruebas los barrios nuevos. Un barrio pendiente o rechazado no puede guardar agendas,
      participantes ni usuarios, así que nadie puede generar consumo sin tu aprobación.
      ${pendientes ? `<br><strong>${pendientes} pendiente(s) de revisión.</strong>` : ""}</p>
    ${barrios.map((b) => {
      const estado = b.estado || "pendiente";
      const [cls, txt] = etiqueta[estado] || etiqueta.pendiente;
      return `<div class="card persona ${estado === "pendiente" ? "pendiente" : ""}">
        <div><strong>${esc(b.nombre)}</strong> <span class="pill ${cls}">${txt}</span>
          <p class="muted small">${[esc(b.estaca), `Código ${esc(b.id)}`, esc(b.creadoPor), b.creadoEn ? fechaCorta(b.creadoEn.slice(0, 10)) : ""].filter(Boolean).join(" · ")}</p></div>
        <div class="acciones">
          ${estado !== "aprobado" ? `<button class="btn sm" data-estado="aprobado" data-id="${b.id}"><span class="ms">check</span>Aprobar</button>` : ""}
          ${estado !== "rechazado" && b.id !== S.barrio.id ? `<button class="btn danger sm" data-estado="rechazado" data-id="${b.id}">${estado === "aprobado" ? "Suspender" : "Rechazar"}</button>` : ""}
        </div></div>`;
    }).join("") || `<p class="muted">No hay barrios registrados.</p>`}
    <h3>Catálogo de himnos</h3>
    <div class="card">
      <p style="margin-top:0">${himnos.lista.length
        ? `<strong>${himnos.lista.length} himnos</strong> disponibles para todos los barrios${himnos.actualizadoEn ? ` · actualizado ${fechaCorta(himnos.actualizadoEn.slice(0, 10))}` : ""}.`
        : "El catálogo está vacío. Cárgalo para que el título se complete al escribir el número del himno."}</p>
      <div class="row">
        <button class="btn" id="himnosIncluido"><span class="ms">library_music</span>Cargar catálogo incluido</button>
        <label class="btn ghost"><span class="ms">upload_file</span>Importar Excel o CSV<input type="file" id="himnosArchivo" accept=".xlsx,.xls,.csv,.txt" hidden></label>
        <a class="btn text" href="datos/himnos.xlsx" download><span class="ms">download</span>Descargar Excel</a>
      </div>
      <p class="muted small">El Excel incluido trae los himnos en español del himnario de 1992 (1–209) y los publicados de
        "Himnos: Para el hogar y la Iglesia" (1001 en adelante). Cuando salgan himnos nuevos, agrégalos al Excel e impórtalo.
        Al importar se reemplaza el catálogo completo.</p>
    </div>
    <dialog id="dlgHimnos"></dialog>`;

  const importarHimnos = async (archivo) => {
    const filas = await leerHojaCalculo(archivo);
    const cab = (filas[0] || []).map(norm);
    const col = (...n) => cab.findIndex((c) => n.some((x) => c.startsWith(x)));
    const i = { n: col("numero", "num", "no", "#"), t: col("titulo", "title", "nombre"), h: col("himnario", "libro"), s: col("seccion", "tema") };
    if (i.n < 0 || i.t < 0) return toast("El archivo debe tener las columnas Número y Título.", true);
    const porNumero = new Map();
    filas.slice(1).forEach((r) => {
      const n = parseInt(String(r[i.n] ?? "").trim(), 10);
      const t = String(r[i.t] ?? "").trim().slice(0, 120);
      if (n > 0 && n < 100000 && t) porNumero.set(n, { n, t, h: String(r[i.h] ?? "").trim().slice(0, 60), s: String(r[i.s] ?? "").trim().slice(0, 60) });
    });
    const lista = [...porNumero.values()].sort((a, b) => a.n - b.n);
    if (!lista.length) return toast("No se encontraron himnos en el archivo.", true);
    const porLibro = {};
    lista.forEach((h) => (porLibro[h.h || "Sin himnario"] = (porLibro[h.h || "Sin himnario"] || 0) + 1));
    const dlg = document.getElementById("dlgHimnos");
    dlg.innerHTML = `<form method="dialog" class="stack">
      <h2>Importar himnos</h2>
      <p>Se encontraron <strong>${lista.length}</strong> himnos:</p>
      <ul class="small">${Object.entries(porLibro).map(([l, c]) => `<li>${esc(l)}: ${c}</li>`).join("")}</ul>
      <p class="muted small">Reemplazará el catálogo actual${himnos.lista.length ? ` (${himnos.lista.length} himnos)` : ""}.</p>
      <div class="row end"><button type="button" class="btn ghost" id="cancelarHimnos">Cancelar</button><button class="btn" id="okHimnos">Importar</button></div>
    </form>`;
    dlg.showModal();
    document.getElementById("cancelarHimnos").onclick = () => dlg.close();
    document.getElementById("okHimnos").onclick = (e) => {
      e.preventDefault();
      e.target.disabled = true;
      intentar(async () => {
        await store.set("catalogo/himnos", { lista, actualizadoEn: now(), actualizadoPor: S.user.email || "" });
        S.himnos = null;
        dlg.close();
        toast(`${lista.length} himnos importados`);
        vistaBarrios();
      });
    };
  };
  document.getElementById("himnosArchivo").onchange = (e) => {
    if (e.target.files[0]) intentar(() => importarHimnos(e.target.files[0]));
    e.target.value = "";
  };
  document.getElementById("himnosIncluido").onclick = () =>
    intentar(async () => {
      const r = await fetch("datos/himnos.xlsx", { cache: "no-cache" });
      if (!r.ok) throw new Error("No se pudo descargar el catálogo incluido.");
      await importarHimnos(new File([await r.blob()], "himnos.xlsx"));
    });

  main.onclick = (e) => {
    const b = e.target.closest("[data-estado]");
    if (!b) return;
    const barrio = barrios.find((x) => x.id === b.dataset.id);
    const nuevo = b.dataset.estado;
    if (nuevo === "rechazado" && !confirm(`¿${barrio.estado === "aprobado" ? "Suspender" : "Rechazar"} el barrio "${barrio.nombre}"? Sus usuarios dejarán de tener acceso.`)) return;
    intentar(async () => {
      await store.set(`barrios/${barrio.id}`, { estado: nuevo }, true);
      toast(nuevo === "aprobado" ? "Barrio aprobado" : "Barrio rechazado");
      vistaBarrios();
    });
  };
}
