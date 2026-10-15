import { store, DEMO } from "./store.js";
import { SUPERADMINS } from "./firebase-config.js";

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
const TIPOS_ASUNTO =["Sostenimiento", "Relevo", "Ordenación al sacerdocio", "Otro"];

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

// Fechas en formato dd/mm/aaaa (f viene como "aaaa-mm-dd")
function fechaCorta(f) {
  const [a, m, d] = f.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
function fechaLarga(f) {
  const dia = new Date(f + "T12:00").toLocaleDateString("es", { weekday: "long" });
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${fechaCorta(f)}`;
}
function fechaHora(iso) {
  const d = new Date(iso);
  const dd = (n) => String(n).padStart(2, "0");
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
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
    <div class="who"><span>${esc(S.user.name)}<small>${esc(S.esAdmin ? "Administrador" : S.rolNombre)}</small></span>
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
        <label>Fecha de la reunión<input type="date" name="fecha" value="${proximoDomingo()}" required></label>
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
  document.getElementById("nueva").onsubmit = (e) => {
    e.preventDefault();
    location.hash = `#/agenda/${new FormData(e.target).get("fecha")}`;
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
  const [existente, participantes, reuniones] = await Promise.all([
    store.get(`${B()}/reuniones/${fecha}`),
    cargarParticipantes(true),
    store.list(`${B()}/reuniones`).catch(() => []),
  ]);
  const draft = existente ? { ...nuevaReunion(fecha), ...existente } : nuevaReunion(fecha);
  delete draft.id;
  const porId = Object.fromEntries(participantes.map((p) => [p.id, p]));

  // Opciones del selector de participantes, agrupadas por organización
  const grupos = {};
  participantes.forEach((p) => (grupos[p.organizacion || "Sin organización"] ??= []).push(p));
  const opcionesBase = Object.keys(grupos).sort((a, b) => a.localeCompare(b, "es"))
    .map((g) => `<optgroup label="${esc(g)}">${grupos[g].map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</optgroup>`)
    .join("");

  // Última vez que cada persona discursó u oró (sin contar esta reunión).
  // Lista ordenada: primero quienes nunca han participado, luego quienes llevan más tiempo sin hacerlo
  const ultimo = historial(reuniones, fecha);
  const opcionesPorFecha = (tipo) => [...participantes]
    .sort((a, b) => (ultimo[tipo][a.id] || "").localeCompare(ultimo[tipo][b.id] || "") || a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => {
      const org = p.organizacion ? ` (${esc(p.organizacion)})` : "";
      return `<option value="${p.id}">${esc(p.nombre)}${org} — ${cuando(ultimo[tipo][p.id])}</option>`;
    }).join("");
  const opciones = { discurso: opcionesPorFecha("discurso"), oracion: opcionesPorFecha("oracion") };

  const selPersona = (path, tipo) => {
    const v = getPath(draft, path);
    let ops = opciones[tipo] || opcionesBase;
    if (v?.id) {
      ops = porId[v.id]
        ? ops.replace(`value="${v.id}"`, `value="${v.id}" selected`)
        : `<option value="${esc(v.id)}" selected>${esc(v.nombre)} (eliminado)</option>` + ops;
    }
    return `<select data-p="${path}"><option value="">— Seleccionar —</option>${ops}</select>`;
  };
  const txt = (path, ph = "", type = "text") =>
    `<input type="${type}" data-f="${path}" value="${esc(getPath(draft, path))}" placeholder="${ph}">`;
  const himno = (path, label) => `
    <div class="field"><label>${label}</label>
      <div class="himno"><input type="number" min="1" data-f="${path}.numero" value="${esc(getPath(draft, path)?.numero)}" placeholder="N.º">
      <input data-f="${path}.titulo" value="${esc(getPath(draft, path)?.titulo)}" placeholder="Título del himno"></div></div>`;
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
    ${participantes.length ? "" : `<p class="aviso">Aún no hay participantes registrados. <a href="#/participantes">Agrégalos o impórtalos</a> para poder seleccionarlos.</p>`}
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
    }
  };
  main.onchange = (e) => {
    const t = e.target;
    if (t.dataset.p) {
      const p = porId[t.value];
      setPath(draft, t.dataset.p, p ? { id: p.id, nombre: p.nombre, organizacion: p.organizacion || "" } : null);
      marcar();
    } else if (t.name === "tipo") {
      draft.tipo = t.value;
      marcar();
      render();
    }
  };
  main.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
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
    ${r.actualizadoPor ? `<p class="muted small noprint">Última edición: ${esc(r.actualizadoPor)}, ${fechaHora(r.actualizadoEn)}</p>` : ""}
  </article>`;
}

// ───────────────────────── Participantes ─────────────────────────

const EJEMPLO = [
  ["Juan Pérez", "Obispado", 45, "9999-0001"], ["Carlos Martínez", "Obispado", 41, "9999-0002"],
  ["Luis Hernández", "Obispado", 38, "9999-0003"], ["María López", "Sociedad de Socorro", 36, "9999-0004"],
  ["Ana García", "Sociedad de Socorro", 52, "9999-0005"], ["José Ramírez", "Cuórum de Élderes", 29, "9999-0006"],
  ["Pedro Flores", "Cuórum de Élderes", 33, "9999-0007"], ["Daniel Castro", "Hombres Jóvenes", 16, "9999-0008"],
  ["Sofía Mejía", "Mujeres Jóvenes", 15, "9999-0009"], ["Lucía Torres", "Primaria", 31, "9999-0010"],
  ["Andrés Reyes", "Escuela Dominical", 47, "9999-0011"], ["Élder Smith", "Misioneros", 20, ""],
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
  const filtro = { q: "", org: "" };

  main.innerHTML = `
    <div class="bar"><h1>Participantes <small class="muted">(${lista.length})</small></h1>
      ${puedeEditar ? `<div class="row">
        <button class="btn" id="agregar"><span class="ms">person_add</span>Agregar</button>
        <label class="btn ghost"><span class="ms">upload_file</span>Importar CSV<input type="file" id="archivo" accept=".csv,.txt,text/csv" hidden></label>
      </div>` : ""}</div>
    <div class="row filtros">
      <input type="search" id="q" placeholder="Buscar por nombre">
      <select id="org"><option value="">Todas las organizaciones</option>${[...new Set([...ORGANIZACIONES, ...lista.map((p) => p.organizacion).filter(Boolean)])].map((o) => `<option>${esc(o)}</option>`).join("")}</select>
    </div>
    <div id="lista"></div>
    <datalist id="orgs">${ORGANIZACIONES.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>
    <dialog id="dlg"></dialog>`;

  const $lista = document.getElementById("lista");
  const dlg = document.getElementById("dlg");

  const pintar = () => {
    const q = norm(filtro.q);
    const vis = lista.filter((p) => (!q || norm(p.nombre).includes(q)) && (!filtro.org || p.organizacion === filtro.org));
    if (!lista.length) {
      $lista.innerHTML = `<div class="card center"><p>Aún no hay participantes.</p>
        ${puedeEditar ? `<p class="muted small">Agrégalos uno por uno o importa un archivo CSV con las columnas: <code>Nombre, Organización, Edad, Teléfono</code>.</p>` : ""}
        ${DEMO && puedeEditar ? `<button class="btn ghost" id="ejemplo">Cargar participantes de ejemplo</button>` : ""}</div>`;
      return;
    }
    $lista.innerHTML = vis.map((p) => `
      <div class="card persona">
        <div><strong>${esc(p.nombre)}</strong>
          <p class="muted small">${[esc(p.organizacion), p.edad ? `${esc(p.edad)} años` : ""].filter(Boolean).join(" · ")}
          ${verTel && tel[p.id] ? ` · <a href="tel:${esc(tel[p.id])}">${esc(tel[p.id])}</a>` : ""}</p>
          ${S.perms.verAgenda ? historialDe(p.id) : ""}
        </div>
        ${puedeEditar ? `<div class="acciones"><button class="btn ghost sm" data-editar="${p.id}">Editar</button>
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
      <div class="dos"><label>Edad<input name="edad" type="number" min="0" max="120" value="${esc(p.edad)}"></label>
      ${mostrarTel ? `<label>Teléfono<input name="telefono" type="tel" value="${esc(tel[p.id])}"></label>` : ""}</div>
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
          nombre: f.get("nombre").trim(), organizacion: f.get("organizacion").trim(), edad: f.get("edad") ? Number(f.get("edad")) : null,
        });
        if (mostrarTel) await store.set(`${B()}/contactos/${id}`, { telefono: f.get("telefono").trim() });
        dlg.close();
        toast("Participante guardado");
        vistaParticipantes();
      });
    };
  };

  const importar = async (archivo) => {
    const filas = parseCSV(await archivo.text());
    if (!filas.length) return toast("El archivo está vacío.", true);
    const cab = filas[0].map(norm);
    const col = (...nombres) => cab.findIndex((c) => nombres.some((n) => c.startsWith(n)));
    let idx = { nombre: col("nombre", "name"), organizacion: col("organizacion", "org"), edad: col("edad", "age"), telefono: col("telefono", "tel", "celular", "phone", "movil") };
    let datos = filas.slice(1);
    if (idx.nombre < 0) {
      idx = { nombre: 0, organizacion: 1, edad: 2, telefono: 3 };
      datos = filas;
    }
    const porNombre = Object.fromEntries(lista.map((p) => [norm(p.nombre), p.id]));
    const val = (r, i) => (i >= 0 ? (r[i] || "").trim() : "");
    const items = datos.map((r) => ({
      nombre: val(r, idx.nombre), organizacion: val(r, idx.organizacion),
      edad: parseInt(val(r, idx.edad)) || null, telefono: val(r, idx.telefono),
    })).filter((x) => x.nombre);
    const existentes = items.filter((x) => porNombre[norm(x.nombre)]).length;

    dlg.innerHTML = `<form method="dialog" class="stack">
      <h2>Importar participantes</h2>
      <p>Se encontraron <strong>${items.length}</strong> participantes en el archivo.
      ${existentes ? `<br>${existentes} ya existen (mismo nombre) y se actualizarán.` : ""}</p>
      <div class="preview">${items.slice(0, 8).map((x) => `<div>${esc(x.nombre)} <span class="muted">· ${esc(x.organizacion)} · ${x.edad ?? ""}</span></div>`).join("")}
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
          escrituras.push({ path: `${B()}/participantes/${id}`, data: { nombre: x.nombre, organizacion: x.organizacion, edad: x.edad } });
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
          EJEMPLO.forEach(([nombre, organizacion, edad, telefono]) => {
            const id = store.newId();
            filas.push({ path: `${B()}/participantes/${id}`, data: { nombre, organizacion, edad } });
            filas.push({ path: `${B()}/contactos/${id}`, data: { telefono } });
          });
          await store.batchSet(filas);
          vistaParticipantes();
        });
      }
      const p = lista.find((x) => x.id === (b.dataset.editar || b.dataset.borrar));
      if (b.dataset.editar) formulario(p);
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
  const barrios = await store.list("barrios");
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
    }).join("") || `<p class="muted">No hay barrios registrados.</p>`}`;

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
