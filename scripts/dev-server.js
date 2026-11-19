/* eslint-env node */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const handlers = new Map([
    ['/api/dgt-feed', require('../api/dgt-feed')],
    ['/api/dgt-stats', require('../api/dgt-stats')],
    ['/api/dgt-peaks', require('../api/dgt-peaks')]
]);
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif' };
http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const handler = handlers.get(pathname);
    if (handler) return handler(req, res);
    try {
        const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
        const file = path.resolve(root, '.' + relative);
        if (!file.startsWith(root + path.sep) || !/^\/(assets\/|index\.html$|stats\.html$|manifest\.json$|service-worker\.js$)/.test(relative)) {
            res.statusCode = 404; return res.end('Not found');
        }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(await fs.readFile(file));
    } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log('Balizas: http://127.0.0.1:' + (process.env.PORT || 5173)));
