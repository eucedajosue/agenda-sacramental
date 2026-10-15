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
  js/firebase-config.example.js  ← plantilla; cópiala como firebase-config.js (no se sube a GitHub)
firestore.rules       ← reglas de seguridad (roles y permisos)
firebase.json
ejemplo-participantes.csv
```

## Probarla en tu computadora (modo demostración)

Copia `public/js/firebase-config.example.js` como `public/js/firebase-config.js`. Mientras tenga `TU_API_KEY`,
la app funciona sin internet, con los datos guardados solo en tu navegador.

```bash
python -m http.server 8123 --directory public
```

Luego abre http://localhost:8123

## Publicarla (una sola vez, unos 15 minutos)

1. Entra a https://console.firebase.google.com y crea un proyecto (por ejemplo `sacramental-barrio`).
2. **Authentication** → Comenzar → Método de acceso → habilita **Google**.
3. **Firestore Database** → Crear base de datos → modo producción → elige una región cercana.
4. **Configuración del proyecto** (ícono de engranaje) → Tus apps → **Web** (`</>`) → registra la app.
   Copia el objeto `firebaseConfig` y pégalo en `public/js/firebase-config.js` (creado a partir de
   `firebase-config.example.js`). Ese archivo y `.firebaserc` están en `.gitignore`: la configuración de tu
   proyecto queda solo en tu computadora y en el hosting, no en GitHub.
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

## Aprobación de barrios (superadministrador)

Para evitar abusos, un barrio nuevo queda **en revisión** hasta que un superadministrador lo apruebe.
Mientras tanto no puede guardar agendas, participantes ni usuarios, y nadie puede unirse a él.

- Los superadministradores se definen por correo en **dos lugares** que deben coincidir:
  `esSuperadmin()` en `firestore.rules` (donde se aplica de verdad) y `SUPERADMINS` en
  `public/js/firebase-config.js` (y en la plantilla `firebase-config.example.js`) (para mostrar la pestaña en la app).
- El superadministrador ve la pestaña **Barrios**, donde aprueba, rechaza o suspende barrios.
- Los barrios que registra un superadministrador quedan aprobados de inmediato.

Las reglas también limitan el tamaño de cada dato (largo de textos, cantidad de anuncios o
discursantes, campos permitidos), para que nadie pueda guardar documentos enormes.

**Recomendación:** mantén el proyecto en el plan gratuito **Spark**. Si alguien abusa, lo peor que
pasa es que se alcanza la cuota diaria; no se genera ningún cobro.

## Catálogo de himnos

`public/datos/himnos.xlsx` trae los himnos SUD en español, tomados de la Biblioteca de música de la Iglesia:

- **Himnos (1992):** números 1 a 209.
- **Himnos: Para el hogar y la Iglesia:** números 1001 en adelante (los publicados en español a la fecha).

El superadministrador lo carga una vez en **Barrios → Catálogo de himnos → Cargar catálogo incluido**, y queda
disponible para todos los barrios. En el editor de agendas, al escribir el número del himno se completa el título
(y se indica de qué himnario es); también se puede escribir parte del título para buscarlo y se completa el número.

Cuando la Iglesia publique himnos nuevos, agrégalos al Excel (columnas Número, Título, Himnario, Sección) e
impórtalo con **Importar Excel o CSV**. Al importar se reemplaza el catálogo completo.

La importación de participantes también acepta archivos de Excel.

## Participantes inactivos

En **Participantes**, el botón **Desactivar** saca a una persona de los selectores de la agenda (por ejemplo, si se mudó)
sin borrar su historial. Aparece atenuado con la etiqueta "Inactivo" y se puede **Reactivar** en cualquier momento.
El filtro de estado permite ver solo activos o solo inactivos. Al editar o reimportar, se conserva su estado.

## App Check (opcional, protección extra)

Rechaza las peticiones que no vienen de la app (por ejemplo, scripts que llaman directo a Firestore).

1. Crea una clave **reCAPTCHA v3** en https://www.google.com/recaptcha/admin con el dominio
   `TU_PROYECTO.web.app` (y `localhost` para pruebas). Copia la **clave de sitio**
   y la **clave secreta**.
2. Consola de Firebase → **App Check** → **Apps** → tu app web → **reCAPTCHA** → pega la clave secreta → Guardar.
3. Pega la **clave de sitio** en `APP_CHECK_SITE_KEY` (`public/js/firebase-config.js`) y publica con `firebase deploy`.
4. Usa la app normalmente un par de días y revisa en **App Check → APIs → Cloud Firestore** que casi todas
   las peticiones aparezcan como verificadas. Entonces presiona **Aplicar** (*Enforce*).
   Antes de aplicarlo, App Check solo mide; no bloquea nada.

## Probar las reglas de seguridad

Las reglas se probaron con el emulador de Firestore (43 casos: barrios pendientes, aprobación,
suspensión, límites de tamaño, permisos y catálogo de himnos). El emulador requiere Java 21 con `firebase-tools` actual.

## Importar participantes

Desde Excel: **Archivo → Guardar como → CSV**. Columnas: `Nombre, Organización, Teléfono`
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
