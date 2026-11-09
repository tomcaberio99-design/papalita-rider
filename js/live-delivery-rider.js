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
  function mount(workspace, db, isCurrent, escape) {
    const list=workspace.querySelector('[data-live-jobs]');
    const info=workspace.querySelector('[data-live-info]');
    const loadStatus=workspace.querySelector('[data-live-load-status]');
    const refreshButton=workspace.querySelector('[data-live-refresh]');
    let rows=[], key='', share=null, requesting=false, refreshing=false, mounted=true;
    let savingOrder=null, jobsRevision=0;
    const alive=()=>mounted && workspace.isConnected && isCurrent();
    const tell=message=>{if(info.textContent!==message)info.textContent=message;};
    const rpc=async(name,args)=>{
      const {data,error}=await db.rpc(name,args);
      if (error) throw Error(error.message || 'Could not connect.');
      return data;
    };
    function nextStep(order) {
      const accepted=!!order.rider_accepted_at, pickedUp=!!order.rider_picked_up_at;
      if (share?.id===order.id) {
        return {number:3,title:'Live GPS',hint:'Keep Papalita open while you deliver the order.',action:'stop',label:'Stop sharing'};
      }
      if (!order.assignment_version && order.status!=='out_for_delivery') {
        return {title:'Waiting for the store',hint:'The admin needs to enable Accept and Confirm Pickup. GPS is available after the store hands over the order.'};
      }
      if (pickedUp || !order.assignment_version) {
        const canShare=order.status==='out_for_delivery';
        return {
          number:3,title:pickedUp?'Pickup confirmed':'Out for delivery',
          hint:!canShare?'Wait for the store to mark the order Hand to Rider.'
            : share?'Stop sharing on your other delivery first.'
            :'Padulong na sa customer? I-share imong location.',
          action:canShare?'gps':null,label:requesting?'Starting GPS…':'Share live GPS',disabled:requesting||!!share
        };
      }
      if (!accepted) {
        return {number:1,title:'New assignment',hint:'Dawata ang order kung ikaw ang mo-deliver.',action:'accept',
          label:savingOrder===order.id?'Saving…':'Accept assignment',disabled:!!savingOrder};
      }
      if (order.status!=='out_for_delivery') {
        return {number:2,title:'Waiting for the store',hint:'Assignment accepted. Hulat nga i-tap sa store ang Hand to Rider.'};
      }
      return {number:2,title:'Ready for pickup',hint:'I-confirm kung nadawat na nimo ang order gikan sa store.',action:'pickup',
        label:savingOrder===order.id?'Saving…':'Confirm pickup',disabled:!!savingOrder};
    }
    function paint() {
      const fingerprint=JSON.stringify([rows,share?.id,requesting,savingOrder]);
      if(key===fingerprint)return;
      key=fingerprint;
      const focused=list.contains(document.activeElement)?document.activeElement.dataset.orderId:null;
      list.innerHTML=rows.length?rows.map(o=>{
        const store=directions([o.store,o.store_address].filter(Boolean).join(', '));
        const drop=directions(Number.isFinite(o.drop_lat)&&Number.isFinite(o.drop_lng)
          ? o.drop_lat+','+o.drop_lng : cleanAddress(o.address));
        const step=nextStep(o);
        return `<article class="pr-assigned-card">
          <header class="pr-assigned-head"><h2>${escape(o.store||'Store')}</h2><span class="pr-assigned-ref">Order #${escape(String(o.id).slice(0,8))}</span></header>
          <div class="pr-next-step">
            ${step.number?`<span class="pr-step-number" aria-hidden="true">${step.number}</span>`:''}
            <div>${step.number?`<span class="pr-step-label">Step ${step.number} of 3</span>`:''}
            <h3>${step.title}</h3><p>${step.hint}</p></div>
          </div>
          ${step.action?`<button type="button" class="btn ${step.action==='stop'?'s':'p'} pr-order-action" data-delivery-action="${step.action}"
            data-order-id="${escape(o.id)}" ${step.disabled?'disabled':''}>${step.label}</button>`:''}
          <dl class="pr-addresses">
            <div><dt>Pickup · Store</dt><dd>${escape(o.store_address||o.store||'Address unavailable')}
              ${store?`<br><a href="${escape(store)}" target="_blank" rel="noopener noreferrer">Directions to store</a>`:''}</dd></div>
            <div><dt>Drop-off · Customer</dt><dd>${escape(cleanAddress(o.address)||'Address unavailable')}
              ${drop?`<br><a href="${escape(drop)}" target="_blank" rel="noopener noreferrer">Directions to customer</a>`:''}</dd></div>
          </dl>
        </article>`;
      }).join(''):`<section class="pr-no-deliveries"><h2>No assigned deliveries</h2>
        <p>Mogawas diri ang order kung i-assign na sa admin sa imo.</p></section>`;
      if(focused)Array.from(list.querySelectorAll('[data-order-id]'))
        .find(button=>button.dataset.orderId===focused&&!button.disabled)?.focus({preventScroll:true});
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
          tell(document.hidden?'GPS paused while Papalita is in the background.':'Sharing GPS with this customer.');
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
      const order=rows.find(o=>o.id===id);
      if (!alive() || share || requesting || order?.status!=='out_for_delivery' ||
          (order.assignment_version&&!order.rider_picked_up_at))return;
      if (!window.isSecureContext || !navigator.geolocation){tell('Open Papalita over HTTPS on a device with GPS.');return;}
      requesting=true;paint();tell('Allow location access when the browser asks.');
      try {
        const token=await rpc('papalita_tracking_share',{p_order_id:id});
        if (!token) throw Error('Could not start GPS sharing.');
        if (!alive()) {
          await rpc('papalita_tracking_share',{p_order_id:id,p_share_key:token});
          return;
        }
        const session={id,token,version:order.assignment_version,busy:false,timer:null};
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
    async function saveProgress(button) {
      if(!alive()||savingOrder||button.disabled)return;
      const order=rows.find(row=>row.id===button.dataset.orderId);
      if(!order?.assignment_version)return;
      const action=button.dataset.deliveryAction;
      savingOrder=order.id;
      ++jobsRevision;
      tell('');
      paint();
      try{
        const progress=await rpc('papalita_tracking_rider_progress',{
          p_order_id:order.id,p_assignment_version:order.assignment_version,p_action:action
        });
        if(!alive())return;
        if(!progress?.rider_accepted_at || (action==='pickup'&&!progress.rider_picked_up_at)){
          throw Error('The delivery update could not be confirmed. Please try again.');
        }
        Object.assign(order,progress);
        tell(action==='accept'?'Assignment accepted.':'Pickup confirmed. You can now share live GPS.');
      }catch(error){
        if(alive())tell(error.message);
      }finally{
        savingOrder=null;
        if(alive()){paint();void refresh();}
      }
    }
    async function refresh() {
      if(!alive() || refreshing || savingOrder || document.hidden)return;
      refreshing=true;
      refreshButton.setAttribute('aria-busy','true');
      const revision=jobsRevision;
      try {
        const jobs=await rpc('papalita_tracking_jobs');
        if(!alive()||revision!==jobsRevision)return;
        rows=Array.isArray(jobs)?jobs:[];
        if(share&&!rows.some(o=>o.id===share.id&&o.status==='out_for_delivery'&&o.assignment_version===share.version)){
          void end('This delivery has ended or was reassigned.');
        }
        loadStatus.textContent='';
        paint();
      } catch {
        if(alive()&&revision===jobsRevision)loadStatus.textContent=key
          ? 'Could not refresh. Showing the last loaded deliveries. Tap Refresh to try again.'
          : 'Could not load your deliveries. Check your internet connection and tap Refresh. If it still fails, contact Papalita support.';
      } finally {
        refreshing=false;
        refreshButton.removeAttribute('aria-busy');
      }
    }
    const click=event=>{
      const button=event.target.closest('[data-delivery-action]');
      if(!button || button.disabled)return;
      if(button.dataset.deliveryAction==='stop')void end();
      else if(button.dataset.deliveryAction==='gps')void start(button.dataset.orderId);
      else void saveProgress(button);
    };
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
    list.addEventListener('click',click);
    refreshButton.addEventListener('click',refresh);
    const poll=setInterval(refresh,5000);
    void refresh();
    return ()=>{
      mounted=false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',leaving);
      list.removeEventListener('click',click);
      refreshButton.removeEventListener('click',refresh);
      void end();
    };
  }
  window.PapalitaLiveRider={mount};
})();
