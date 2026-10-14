# Reunión Sacramental: planificador para el obispado

Es una app web que se usa desde el celular o la PC (se puede "instalar" en la pantalla de inicio).
Funciona con **Firebase**: inicio de sesión con Google, base de datos y hosting. El plan gratuito es suficiente.

## Estructura

```
public/               ← la app (lo que se publica)
  index.html
  css/styles.css
  js/app.js           ← pantallas y lógica
  js/store.js         ← conexión a Firebase (o modo demostración)
  js/firebase-config.js  ← AQUÍ pegas la configuración de tu proyecto
firestore.rules       ← reglas de seguridad (roles y permisos)
firebase.json
ejemplo-participantes.csv
```

## Probarla en tu computadora (modo demostración)

Mientras `firebase-config.js` tenga `TU_API_KEY`, la app funciona sin internet, con los datos guardados solo en tu navegador.

```bash
python -m http.server 8123 --directory public
```

Luego abre http://localhost:8123

## Publicarla (una sola vez, unos 15 minutos)

1. Entra a https://console.firebase.google.com y crea un proyecto (por ejemplo `sacramental-barrio`).
2. **Authentication** → Comenzar → Método de acceso → habilita **Google**.
3. **Firestore Database** → Crear base de datos → modo producción → elige una región cercana.
4. **Configuración del proyecto** (ícono de engranaje) → Tus apps → **Web** (`</>`) → registra la app.
   Copia el objeto `firebaseConfig` y pégalo en `public/js/firebase-config.js`.
5. Instala Node.js (https://nodejs.org) y luego, en esta carpeta:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

Al final te da una dirección como `https://sacramental-barrio.web.app`. Esa es la que compartes.

## Primer uso

1. Entra con tu Gmail → **Registrar barrio**. Quedas como administrador y la app te da un **código de 6 letras**.
2. Comparte la dirección y el código con tus consejeros y secretarios.
3. Ellos entran con su Gmail, escriben el código y quedan **pendientes**.
4. En **Usuarios** les eliges un rol y presionas **Aprobar**.
5. En **Roles** decides qué puede hacer cada rol.

Otros barrios usan la misma dirección: su obispo registra su barrio y recibe su propio código.
Los datos de cada barrio están separados.

## Importar participantes

Desde Excel: **Archivo → Guardar como → CSV**. Columnas: `Nombre, Organización, Edad, Teléfono`
(ver `ejemplo-participantes.csv`). Si un nombre ya existe, se actualiza en lugar de duplicarse.

## Permisos disponibles

| Permiso | Qué permite |
|---|---|
| Ver agendas | Ver e imprimir las agendas |
| Crear y editar agendas | Planificar las reuniones |
| Ver participantes | Ver la lista de miembros |
| Agregar, editar e importar participantes | Mantener la lista |
| Ver teléfonos | Los teléfonos están separados y solo los ven los roles con este permiso |
| Aprobar usuarios y asignar roles | Gestionar quién entra |

Los administradores siempre tienen todos los permisos. Los permisos se aplican en las reglas de Firestore,
no solo en la pantalla.
