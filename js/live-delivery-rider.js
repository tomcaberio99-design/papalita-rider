/* Assigned Supabase deliveries and explicit, foreground GPS sharing. */
(() => {
  'use strict';
  const cleanAddress = value => String(value || '').replace(/^.*? — /,'').trim();
  function directions(destination) {
    const place=String(destination || '').trim();
    if (!place) return '';
    const address=/\bSurigao del Norte\b/i.test(place)||/^-?[\d.]+,-?[\d.]+$/.test(place)
      ? place : place + (/\bAlegria\b/i.test(place)?'':', Alegria') + ', Surigao del Norte';
    return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);
  }
  function open(dialog, db, isCurrent, escape) {
    const list=dialog.querySelector('[data-live-jobs]');
    const info=dialog.querySelector('[data-live-info]');
    let rows=[], key='', share=null, requesting=false, refreshing=false, poll;
    const alive=()=>dialog.open && isCurrent();
    const tell=message=>{info.textContent=message;};
    const rpc=async(name,args)=>{
      const {data,error}=await db.rpc(name,args);
      if (error) throw Error(error.message || 'Could not connect.');
      return data;
    };
    function paint() {
      const fingerprint=JSON.stringify([rows,share?.id,requesting]);
      if(key===fingerprint)return;
      key=fingerprint;
      list.innerHTML=rows.length?rows.map(o=>{
        const store=directions([o.store,o.store_address].filter(Boolean).join(', '));
        const drop=directions(Number.isFinite(o.drop_lat)&&Number.isFinite(o.drop_lng)
          ? o.drop_lat+','+o.drop_lng : cleanAddress(o.address));
        const sharing=share?.id===o.id;
        const disabled=requesting || !!share || o.status!=='out_for_delivery';
        return `<article class="panel"><b>Order #${escape(o.id.slice(0,8))}</b>
          <p class="sm mu">${escape(o.status.replaceAll('_',' '))} · ${escape(o.store||'Store')}</p>
          <p class="sm"><b>Drop-off</b> · ${escape(cleanAddress(o.address)||'Address unavailable')}</p>
          <div class="row wrap" style="margin:8px 0">
            ${store?`<a class="btn s sm" href="${escape(store)}" target="_blank" rel="noopener noreferrer">Store directions</a>`:''}
            ${drop?`<a class="btn s sm" href="${escape(drop)}" target="_blank" rel="noopener noreferrer">Drop-off directions</a>`:''}
          </div>
          ${sharing?'<button class="btn s sm" data-stop-gps>Stop sharing</button>':
            `<button class="btn p sm" data-start-gps="${escape(o.id)}" ${disabled?'disabled':''}>Share live GPS</button>`}
          ${o.status!=='out_for_delivery'?'<p class="sm mu">GPS sharing opens after the store hands off this order.</p>':''}
        </article>`;
      }).join(''):'<p class="mu sm">No live deliveries assigned to your account.</p>';
    }
    async function end(message) {
      const session=share;
      if(!session)return;
      share=null;
      clearInterval(session.timer);
      if(alive()){tell(message||'GPS sharing stopped.');paint();}
      try {await rpc('papalita_tracking_share',{p_order_id:session.id,p_share_key:session.token});}
      catch {if(alive())tell('GPS sharing stopped on this phone. The last position expires within a minute.');}
    }
    function sample(session) {
      if (!alive() || share!==session || session.busy || document.hidden) return;
      session.busy=true;
      navigator.geolocation.getCurrentPosition(async position=>{
        try {
          if (!alive() || share!==session || document.hidden) return;
          const {latitude,longitude}=position.coords;
          const saved=await rpc('papalita_tracking_position',{
            p_order_id:session.id,p_share_key:session.token,p_lat:latitude,p_lng:longitude
          });
          if (share!==session || !alive()) return;
          if (!saved) {void end('This delivery is no longer available for GPS sharing.');return;}
          tell(document.hidden?'GPS paused while Papalita is in the background.':'Sharing GPS with this customer. Keep Papalita visible on your phone.');
        } catch {
          if (share===session && alive()) tell('GPS could not sync. Retrying…');
        } finally {session.busy=false;}
      },error=>{
        session.busy=false;
        if (!alive() || share!==session) return;
        if(error.code===1)void end('Location permission was denied. Allow GPS access, then try again.');
        else tell('Waiting for a GPS fix. Keep the phone where it can receive a signal.');
      },{enableHighAccuracy:true,maximumAge:0,timeout:10000});
    }
    async function start(id) {
      if (!alive() || share || requesting || !rows.some(o=>o.id===id&&o.status==='out_for_delivery'))return;
      if (!window.isSecureContext || !navigator.geolocation){tell('Open Papalita over HTTPS on a device with GPS.');return;}
      requesting=true;paint();tell('Allow location access when the browser asks.');
      try {
        const token=await rpc('papalita_tracking_share',{p_order_id:id});
        if (!token) throw Error('Could not start GPS sharing.');
        if (!alive()) {
          await rpc('papalita_tracking_share',{p_order_id:id,p_share_key:token});
          return;
        }
        const session={id,token,busy:false,timer:null};
        share=session;
        sample(session);
        session.timer=setInterval(()=>sample(session),7000);
      } catch(error) {
        if(alive())tell(error.message);
      } finally {
        requesting=false;
        if(alive())paint();
      }
    }
    async function refresh() {
      if(!alive() || refreshing || document.hidden)return;
      refreshing=true;
      try {
        const jobs=await rpc('papalita_tracking_jobs');
        if(!alive())return;
        rows=Array.isArray(jobs)?jobs:[];
        if(share&&!rows.some(o=>o.id===share.id&&o.status==='out_for_delivery'))void end('This delivery has ended or was reassigned.');
        if(!key)tell('Sharing starts only when you tap Share live GPS on an order that is out for delivery.');
        paint();
      } catch {
        if(alive()&&!share)tell('Could not load live deliveries. Check the tracking setup and connection.');
      } finally {refreshing=false;}
    }
    list.addEventListener('click',event=>{
      if(event.target.closest('[data-stop-gps]')){void end();return;}
      const button=event.target.closest('[data-start-gps]');
      if(button)void start(button.dataset.startGps);
    });
    const leaving=()=>{void end();};
    const visibility=()=>{
      if(!alive())return;
      if(document.hidden){
        if(share)tell('GPS paused while Papalita is in the background.');
        return;
      }
      void refresh();
      if(share)sample(share);
    };
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',leaving);
    dialog.addEventListener('close',()=>{
      clearInterval(poll);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',leaving);
      void end();
    },{once:true});
    poll=setInterval(refresh,5000);
    void refresh();
  }
  window.PapalitaLiveRider={open};
})();
