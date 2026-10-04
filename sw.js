const CACHE_VERSION='v8';
const CACHE_NAME='saqskyscoop-'+CACHE_VERSION;
const PRE_CACHE=['./','./index.html','./manifest.json'];
const RUNTIME_HOSTS=['cdnjs.cloudflare.com','fonts.googleapis.com','api.sunrise-sunset.org','api.open-meteo.com','api.open-notify.org','ipapi.co','placehold.co'];

self.addEventListener('install',e=>{
    e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(PRE_CACHE).catch(()=>{})));
    self.skipWaiting();
});
self.addEventListener('activate',e=>{
    e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('saqskyscoop-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))));
    self.clients.claim();
});
self.addEventListener('fetch',e=>{
    const req=e.request;
    if(req.method!=='GET')return;
    const url=new URL(req.url);
    if(!url.protocol.startsWith('http'))return;
    if(RUNTIME_HOSTS.includes(url.hostname)){e.respondWith(networkFirst(req));return;}
    if(url.origin===self.location.origin){e.respondWith(cacheFirst(req));return;}
    e.respondWith(fetch(req).catch(()=>caches.match(req)));
});
async function cacheFirst(req){
    const c=await caches.open(CACHE_NAME);
    const cached=await c.match(req);
    if(cached)return cached;
    try{const r=await fetch(req);if(r&&r.status===200)c.put(req,r.clone());return r;}
    catch(e){const fb=await c.match('./index.html');if(fb)return fb;throw e;}
}
async function networkFirst(req){
    const c=await caches.open(CACHE_NAME);
    try{const r=await fetch(req,{mode:'cors'});if(r&&r.status===200)c.put(req,r.clone());return r;}
    catch(e){const cached=await c.match(req);if(cached)return cached;return new Response(JSON.stringify({error:'offline'}),{status:503,headers:{'Content-Type':'application/json'}});}
}
self.addEventListener('message',e=>{
    if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});