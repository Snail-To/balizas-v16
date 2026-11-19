# Balizas V16 – Visor en Tiempo Real

Mapa de eventos V16 y tabla de activaciones observadas por hora, con datos recogidos desde el NAP de la DGT.

## Desarrollo

```sh
npm ci
npm run dev
```

Abrir http://127.0.0.1:5173/ para el mapa y `/stats.html` para la tabla. El servidor local ejecuta también las rutas `/api/dgt-feed` y `/api/dgt-stats`.

## Datos y despliegue

Supabase recoge el XML oficial una vez por minuto con `pg_cron`. Guarda el historial deduplicado y sobrescribe la última instantánea del mapa. Las peticiones de los visitantes leen esa instantánea, sin volver a descargar el XML de DGT.

Vercel publica los archivos estáticos y las funciones de `api/`. Ambas rutas comparten caché CDN durante 60 segundos. La configuración de `lib/cloud-config.json` contiene únicamente la URL del servicio y una clave pública `anon`; las credenciales privilegiadas permanecen en Supabase.

La tabla permite elegir una fecha y ver activaciones observadas por hora en la zona Europe/Madrid. El resumen de los últimos 30 días muestra el pico horario de nuevos eventos y, donde hay muestras, el pico de eventos simultáneos. Los eventos se conservan 30 días y las muestras, 14 días.

Validación: `npm test` y `npm run lint`. Más detalles de la base de datos en `docs/supabase-setup.zh-CN.md`.
