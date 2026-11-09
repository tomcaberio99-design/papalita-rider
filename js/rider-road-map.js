/* Rider street map. GPS stays on the device until the rider requests a route. */
(() => {
  'use strict';
  const cdn='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
  let loading, lastRouteRequest=0;
  const point=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?[lat,lng]:null;
  const ale= [9.4671,125.5744];

  function leaflet(){
    if(window.L?.map)return Promise.resolve(window.L);
    if(loading)return loading;
    const css=Object.assign(document.createElement('link'),{
      rel:'stylesheet',href:cdn+'leaflet.css',crossOrigin:'anonymous',
      integrity:'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
    });
    const script=Object.assign(document.createElement('script'),{
      src:cdn+'leaflet.js',crossOrigin:'anonymous',
      integrity:'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    });
    loading=Promise.all([css,script].map(node=>new Promise((resolve,reject)=>{
      node.onload=resolve;
      node.onerror=reject;
      document.head.append(node);
    }))).then(()=>window.L).catch(error=>{css.remove();script.remove();loading=null;throw error;});
    return loading;
  }

  function mount(dialog, order, onTheWay){
    const pickup=point(order.store_lat,order.store_lng);
    const drop=point(order.drop_lat,order.drop_lng);
    const target=onTheWay?drop:pickup;
    const status=dialog.querySelector('[data-map-status]');
    const locationButton=dialog.querySelector('[data-map-gps]');
    const routeButton=dialog.querySelector('[data-map-route]');
    const mapNode=dialog.querySelector('[data-map-canvas]');
    let map, riderMarker, routeLayer, current, watchId=null, request, closed=false, L;
    const active=()=>dialog.open&&!closed&&dialog.isConnected;
    const missingPin=onTheWay?'The customer can set a drop-off pin in order tracking.':'A Papalita admin can save this store’s pickup pin.';
    const tell=message=>{status.textContent=message;};
    function stopWatch(){
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);
      watchId=null;
    }
    function close(){
      if(closed)return;
      closed=true;
      stopWatch();
      request?.abort();
      document.removeEventListener('visibilitychange',pause);
      window.removeEventListener('pagehide',close);
      map?.remove();
    }
    function pause(){
      if(!document.hidden||watchId===null)return;
      stopWatch();
      riderMarker?.remove();
      riderMarker=null;
      current=null;
      routeButton.disabled=true;
      locationButton.textContent='Show my location';
      tell('GPS paused. Tap Show my location to resume.');
    }
    dialog.addEventListener('close',close,{once:true});
    document.addEventListener('visibilitychange',pause);
    window.addEventListener('pagehide',close,{once:true});
    const fixLink='<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report map issue</a>';
    const pin=(position,kind,symbol,label)=>L.marker(position,{
      icon:L.divIcon({className:'pr-map-pin '+kind,html:symbol,iconSize:[28,28],iconAnchor:[14,14]}),
      title:label
    }).addTo(map).bindTooltip(label);
    leaflet().then(loaded=>{
      if(!active())return;
      L=loaded;
      map=L.map(mapNode).setView(target||pickup||drop||ale,target?16:14);
      const tiles=L.tileLayer(window.FOODIE_CONFIG?.maps?.riderTiles||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · '+fixLink
      }).addTo(map);
      tiles.once('tileerror',()=>{if(active())tell('Some map tiles are unavailable. You can still open Google Maps for directions.');});
      if(pickup)pin(pickup,'pr-map-pickup','S','Store pickup');
      if(drop)pin(drop,'pr-map-drop','D','Customer drop-off');
      if(pickup&&drop)map.fitBounds([pickup,drop],{padding:[22,22],maxZoom:16});
      locationButton.disabled=false;
      tell(target?'Tap Show my location to find your live position.':missingPin);
    }).catch(()=>{if(active())tell('The street map could not load. Use Google Maps for directions.');});

    locationButton.onclick=()=>{
      if(!map)return;
      if(watchId!==null){if(current)map.panTo(current);return;}
      if(!navigator.geolocation){tell('Location is unavailable on this device.');return;}
      tell('Waiting for your GPS location…');
      watchId=navigator.geolocation.watchPosition(({coords})=>{
        if(!active()||document.hidden)return;
        current=point(coords.latitude,coords.longitude);
        if(!current)return;
        if(riderMarker){riderMarker.setLatLng(current);return;}
        riderMarker=pin(current,'pr-map-rider','<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m9 17 3-7h4l3 5M8 13h4M13 7h3l1 3"/></svg>','Your location');
        if(target)map.fitBounds([current,target],{padding:[24,24],maxZoom:16});
        else map.setView(current,16);
        routeButton.disabled=!target;
        locationButton.textContent='Center on me';
        tell(target?'Live location is on. Tap Show road route to calculate directions.':missingPin);
      },()=>{
        if(!active())return;
        stopWatch();
        tell('Your GPS position is unavailable. Check location permission and try again.');
      },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    };

    routeButton.onclick=async()=>{
      if(!active()||!current||!target||request)return;
      if(Date.now()-lastRouteRequest<2000)return;
      lastRouteRequest=Date.now();
      request=new AbortController();
      const timeout=setTimeout(()=>request?.abort(),12000);
      routeButton.disabled=true;
      tell('Finding a road route…');
      try{
        const endpoint=window.FOODIE_CONFIG?.maps?.riderRoute
          ||'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
        const coordinates=[current,target].map(([lat,lng])=>lng.toFixed(5)+','+lat.toFixed(5)).join(';');
        const result=await fetch(endpoint+coordinates+'?geometries=geojson&overview=simplified',{signal:request.signal});
        if(!result.ok)throw Error('Route lookup failed');
        const data=await result.json();
        if(!active())return;
        const path=data.routes?.[0]?.geometry?.coordinates?.map(([lng,lat])=>point(lat,lng));
        if(data.code!=='Ok'||path?.length<2||!path?.every(Boolean))throw Error('No road route');
        routeLayer?.remove();
        routeLayer=L.polyline(path,{color:'#087f45',weight:5}).addTo(map);
        map.fitBounds(routeLayer.getBounds(),{padding:[25,25],maxZoom:17});
        tell('Road route ready. Your live pin continues moving as you travel.');
        routeButton.textContent='Update road route';
      }catch{
        if(active())tell('Could not get a road route. Try again or open Google Maps for directions.');
      }finally{
        clearTimeout(timeout);
        request=null;
        if(active())routeButton.disabled=!current;
      }
    };
    return close;
  }

  window.PapalitaRiderMap={mount};
})();
