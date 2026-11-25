const V="gym-v2";
const SHELL=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=="gym-img").map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  if(u.origin===location.origin){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("./index.html"))));
    return;
  }
  if(u.hostname==="raw.githubusercontent.com"&&u.pathname.includes("/free-exercise-db/")){
    if(u.pathname.endsWith(".json")){
      e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open("gym-img").then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
    }else{
      e.respondWith(caches.open("gym-img").then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}))));
    }
  }
});
