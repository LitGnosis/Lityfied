import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const webRoot = resolve(process.cwd(), 'src');
const apiRoot = resolve(webRoot, 'api');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function serveApi(req, res, pathname, searchParams) {
  let apiPath = pathname === '/api/health' ? 'payment-health' : pathname.slice('/api/'.length);
  let target = resolve(apiRoot, apiPath + '.js');
  if (!target.startsWith(apiRoot + sep) || !existsSync(target)) {
    target = resolve(apiRoot, 'index.js');
  }
  req.query = Object.fromEntries(searchParams);
  if (target.endsWith('/index.js')) req.query.route = apiPath;
  res.status = function (code) { this.statusCode = code; return this; };
  res.json = function (data) {
    if (!this.headersSent) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(data)); return this;
  };
  res.send = function (data) { this.end(typeof data === 'string' ? data : JSON.stringify(data)); return this; };
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) { json(res, 413, { error: 'payload_too_large' }); return; }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    const ct = req.headers['content-type'] || '';
    try {
      req.body = ct.includes('application/json') ? JSON.parse(raw.toString('utf8') || '{}')
        : ct.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
        : raw.toString('utf8');
    } catch { json(res, 400, { error: 'invalid_json' }); return; }
  }
  try {
    const mod = await import(pathToFileURL(target).href);
    if (typeof mod.default !== 'function') throw new Error('api_handler_missing');
    await mod.default(req, res);
    if (!res.writableEnded && !res.headersSent) json(res, 204, {});
  } catch (error) {
    console.error('API error:', pathname, error?.message);
    if (!res.headersSent) json(res, 500, { error: 'internal_error' });
    else if (!res.writableEnded) res.end();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (pathname.startsWith('/api/')) return serveApi(req, res, pathname, url.searchParams);
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  const aliases = { '/': '/index.html', '/dashboard/studio': '/dashboard/studio.html', '/dashboard/studio/': '/dashboard/studio.html', '/dashboard/cloud': '/dashboard/cloud.html', '/dashboard/cloud/': '/dashboard/cloud.html' };
  const wanted = aliases[pathname] || pathname;
  let filepath = resolve(webRoot, '.' + wanted);
  if (!filepath.startsWith(webRoot + sep) || !existsSync(filepath)) {
    const html = filepath + '.html';
    if (html.startsWith(webRoot + sep) && existsSync(html)) filepath = html;
  }
  if (!filepath.startsWith(webRoot + sep) || !existsSync(filepath) || !statSync(filepath).isFile()) return json(res, 404, { error: 'not_found' });
  res.statusCode = 200;
  res.setHeader('Content-Type', mimeTypes[extname(filepath)] || 'application/octet-stream');
  if (req.method === 'HEAD') return res.end();
  createReadStream(filepath).pipe(res);
});
server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('Lityfied Render HTTP server listening'));
