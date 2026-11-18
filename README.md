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

La tabla distingue eventos observados de cobertura de recogida, permite elegir fecha y muestra las horas de Europe/Madrid, incluidos los cambios de horario. No equivale al total oficial de activaciones ni al número de dispositivos distintos.

Validación: `npm test` y `npm run lint`. Más detalles de la base de datos en `docs/supabase-setup.zh-CN.md`.
