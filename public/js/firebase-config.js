// Pega aquí la configuración de tu proyecto de Firebase
// (Consola de Firebase → Configuración del proyecto → Tus apps → App web).
//
// Mientras apiKey diga "TU_API_KEY", la app funciona en MODO DEMOSTRACIÓN:
// los datos se guardan solo en este navegador y el inicio de sesión es simulado.
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

// Correos de los superadministradores de la app: aprueban o rechazan los barrios nuevos.
// Debe coincidir con la lista de esSuperadmin() en firestore.rules (allí es donde se aplica de verdad).
export const SUPERADMINS = ["josue.euceda@gmail.com"];

// App Check (opcional): clave de sitio de reCAPTCHA v3. Déjala vacía para no usarlo.
// Pasos en el README, sección "App Check".
export const APP_CHECK_SITE_KEY = "";
