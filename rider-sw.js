/* Rider navigation only. Live delivery and authentication requests use the network. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const riderScope = new URL(self.registration.scope);
const riderIndex = new URL('./index.html', riderScope);

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.mode !== 'navigate' || request.method !== 'GET' ||
      url.origin !== riderScope.origin ||
      (url.pathname !== riderScope.pathname && url.pathname !== riderIndex.pathname)) return;

  event.respondWith(fetch(request, {cache:'no-cache'}).catch(() => new Response(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#087F32">
<title>Papalita Rider · Offline</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:#f8f8f4;color:#203125;font:16px/1.55 system-ui,sans-serif}
  main{width:min(100%,360px);box-sizing:border-box;padding:24px;background:white;border:1px solid #e1e7de;border-radius:16px}
  h1{margin:0 0 10px;font-size:24px}
  a{display:inline-block;padding:10px 16px;border-radius:8px;background:#087f32;color:white;text-decoration:none;font-weight:650}
</style>
<main><h1>You’re offline</h1><p>Reconnect to open Papalita Rider and view live deliveries.</p><a href="">Try again</a></main>
</html>`, {headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
