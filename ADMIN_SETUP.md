# Activación del panel de administración

Añade estas variables de entorno en Vercel (Production, Preview y Development):

- `ADMIN_PASSWORD`: contraseña privada para entrar en `/admin/login`.
- `ADMIN_SESSION_SECRET`: cadena aleatoria larga, distinta de la contraseña.

Después realiza un nuevo despliegue.

Rutas creadas:

- `/admin/login`
- `/admin`
- `/admin/convocatorias`
- `/admin/listados`
- `/admin/estimaciones`
- `/admin/usuarios`
- `/admin/configuracion`
