# Auditoría y Mejoras Futuras - Reservas INTA

Este documento recopila las sugerencias arquitectónicas detectadas tras la auditoría del proyecto, basándose estrictamente en las "Reglas de Oro" (`GEMINI.md`).

## 1. Persistencia Blindada (Docker)
**Infracción a la Regla 4**
Actualmente, el archivo `docker-compose.yml` levanta el servicio asumiendo que la base de datos es externa o se provee por entorno, pero el propio contenedor Node **no tiene volúmenes mapeados**.
* **Riesgo:** Si a futuro implementamos guardado de imágenes locales (ej. fotos de usuarios o espacios) o si Node genera archivos de logs, reiniciar o redesplegar el contenedor borrará todo eso. Un contenedor sin volúmenes es inherentemente efímero.
* **Solución Inmediata:** Mapear explícitamente volúmenes locales en el compose para directorios de subidas (`uploads/`) y `logs/`.
* **Solución Óptima (Cloud):** Hacer que el servidor Node sea 100% Stateless integrándolo mediante API con un servicio de almacenamiento en la nube (como AWS S3 o MinIO).

## 2. Frontend Monolítico
**Infracción a las Reglas 1 y 7**
El frontend se rige por un `index.html` central y un `main.js` que se acerca a las 1000 líneas (inyectando grandes fragmentos HTML dentro de Javascript puro).
* **Riesgo:** A medida que la aplicación escale, el código será cada vez más difícil de mantener, propenso a colisiones de estado global (variables sueltas) e ineficiente. Ya hemos experimentado destellos visuales (flickering) al cargar.
* **Solución Inmediata:** Refactorizar el archivo en verdaderos Módulos ECMAScript (`type="module"`), separando responsabilidades: `auth.js`, `api.js`, `reservations.js`, `ui.js`.
* **Solución Óptima:** Incluir un framework verdaderamente ligero centrado en el HTML sin build-step, como **Alpine.js**, para controlar eventos y renderizado de forma fluida.

## 3. Migraciones de Base de Datos
**Infracción a las Reglas 5 y 7**
El proyecto previene Inyecciones SQL usando consultas preparadas (`mysql2`), lo cual es seguro. Sin embargo, toda la estructura de la base de datos descansa en un archivo estático `database.sql`.
* **Riesgo:** Cuando el sistema de reservas esté funcionando en producción y queramos agregar una nueva columna (ej. `avatar_url`), no hay un mecanismo seguro y automatizado para alterar las tablas sin riesgo de pérdida de datos.
* **Solución Óptima:** Incorporar un gestor de Migraciones liviano en el backend (ej. **Knex.js**) o incluso saltar a un ORM moderno (**Prisma**) para que los despliegues automaticen la evolución de la BD.

## 4. Evolución de la Seguridad (Cookies HTTP-Only)
**Mejora sobre seguridad base**
Actualmente hemos combatido ataques (Fuerza Bruta, XSS) mediante `helmet`, `express-rate-limit` y un sanitizador propio. Sin embargo, guardamos el Token JWT en el `localStorage` del navegador.
* **Riesgo:** Si a futuro instalamos una librería JavaScript externa y resulta estar comprometida (ataque de cadena de suministro), ese script malicioso podría leer y robar los Tokens del `localStorage`.
* **Solución Óptima:** Modificaremos la arquitectura de login para que el backend despache el JWT dentro de una **Cookie HTTP-Only, Secure y SameSite**. De esta forma, el navegador almacena pero blinda la cookie de cualquier manipulación vía Javascript, y se adjunta automáticamente en cada petición a la API de forma 100% segura.
