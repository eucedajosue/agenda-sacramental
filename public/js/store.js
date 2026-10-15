// Capa de datos: la misma interfaz funciona con Firebase (producción)
// o con localStorage (modo demostración).
import { firebaseConfig, APP_CHECK_SITE_KEY } from "./firebase-config.js?v=2026.10.15.10";

export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("TU_");

const FB = "https://www.gstatic.com/firebasejs/10.12.2";

async function firebaseStore() {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const A = await import(`${FB}/firebase-auth.js`);
  const F = await import(`${FB}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  // App Check: solo se aceptan peticiones que vienen de esta app (no de scripts externos)
  if (APP_CHECK_SITE_KEY) {
    const C = await import(`${FB}/firebase-app-check.js`);
    C.initializeAppCheck(app, { provider: new C.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const toUser = (u) => u && { uid: u.uid, email: u.email, name: u.displayName || u.email };

  return {
    onUser: (cb) => A.onAuthStateChanged(auth, (u) => cb(toUser(u))),
    signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth),
    async get(path) {
      const s = await F.getDoc(F.doc(db, path));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    async list(path) {
      const s = await F.getDocs(F.collection(db, path));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    set: (path, data, merge = false) => F.setDoc(F.doc(db, path), data, { merge }),
    async add(path, data) {
      return (await F.addDoc(F.collection(db, path), data)).id;
    },
    del: (path) => F.deleteDoc(F.doc(db, path)),
    newId: (path) => F.doc(F.collection(db, path)).id,
    async batchSet(items) {
      for (let i = 0; i < items.length; i += 400) {
        const wb = F.writeBatch(db);
        items.slice(i, i + 400).forEach(({ path, data }) => wb.set(F.doc(db, path), data));
        await wb.commit();
      }
    },
  };
}

function localStore() {
  const KEY = "sacramental-demo-db";
  const USER = "sacramental-demo-user";
  const read = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const write = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const listeners = [];
  const currentUser = () => JSON.parse(localStorage.getItem(USER) || "null");
  const emit = () => listeners.forEach((cb) => cb(currentUser()));
  const rid = () => Math.random().toString(36).slice(2, 12);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  return {
    onUser(cb) {
      listeners.push(cb);
      setTimeout(() => cb(currentUser()));
    },
    async signIn({ name, email }) {
      localStorage.setItem(USER, JSON.stringify({ uid: "demo-" + email.toLowerCase(), email, name }));
      emit();
    },
    async signOut() {
      localStorage.removeItem(USER);
      emit();
    },
    async get(path) {
      const d = read()[path];
      return d ? { id: path.split("/").pop(), ...clone(d) } : null;
    },
    async list(path) {
      const db = read();
      const pre = path + "/";
      return Object.keys(db)
        .filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes("/"))
        .map((k) => ({ id: k.slice(pre.length), ...clone(db[k]) }));
    },
    async set(path, data, merge = false) {
      const db = read();
      db[path] = merge ? { ...(db[path] || {}), ...clone(data) } : clone(data);
      write(db);
    },
    async add(path, data) {
      const id = rid();
      await this.set(`${path}/${id}`, data);
      return id;
    },
    async del(path) {
      const db = read();
      delete db[path];
      write(db);
    },
    newId: () => rid(),
    async batchSet(items) {
      const db = read();
      items.forEach(({ path, data }) => (db[path] = clone(data)));
      write(db);
    },
  };
}

export const store = DEMO ? localStore() : await firebaseStore();
