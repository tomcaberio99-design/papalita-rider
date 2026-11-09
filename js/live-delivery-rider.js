/* Rider self-dispatch and explicit, foreground GPS sharing. */
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
  const peso=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'});
  const orderTime=new Intl.DateTimeFormat('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
  const phaseLabel={confirmed:'Store confirmed',preparing:'Preparing',ready:'Ready at the store'};
  const safePhone=value=>String(value||'').replace(/[^+0-9]/g,'');

  function routeGraphic(mode) {
    const pin=(x,y,color)=>`<g transform="translate(${x} ${y})"><path d="M0 24C-4 17-14 7-14 0a14 14 0 1 1 28 0C14 7 4 17 0 24Z" fill="${color}"/><circle r="5" fill="#effaf3"/></g>`;
    return `<svg viewBox="0 0 360 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="360" height="148" fill="#253037"/>
      <path d="M0 124 60 110 89 116 141 148M240 0l15 26 15 47 35 75H360V0Z" fill="#2a3b39"/>
      <g fill="none" stroke="#19242a" stroke-width="3">
        <path d="M-15 52 64 25 132 44 246 23 371 33M0 107l66-21 59 13 48-16 73 11 35-16 85 17M-5 130l86-12 59 11 54-13 64 19 62-20 47 9M17 0l24 43 13 29 17 76M103 0l-7 44 13 35 12 69M153 0l8 33 18 43 11 72M210 0l13 45 18 30 12 73M287 0l-12 41 17 37 18 70M344 0l-18 53 14 43 9 52"/>
        <path d="M12 74l19-9 21 7 13-6M99 19l47 5 8-11M132 66l-13 33 16 17 4 14M225 59l-26 7 13 24m74-33 36 4 13 22"/>
      </g>
      ${mode==='store'?pin(180,58,'#248256'):`<path d="M69 96l49-15 26 8 35-12 33 9 27-16 48 4 15-24" fill="none" stroke="#7ae2a0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${pin(69,72,'#268357')}${pin(302,26,'#a37e47')}`}
    </svg>`;
  }

  function mount(workspace, db, isCurrent, escape, modal) {
    const list=workspace.querySelector('[data-live-jobs]');
    const views=workspace.querySelector('[data-delivery-views]');
    const info=workspace.querySelector('[data-live-info]');
    const loadStatus=workspace.querySelector('[data-live-load-status]');
    const refreshButton=workspace.querySelector('[data-live-refresh]');
    const skipped=new Set();
    let offers=[], rows=[], view='', selectedId='', key='';
    let share=null, requesting=false, refreshing=false, mounted=true, savingOrder=null, jobsRevision=0;
    let completedId='', confirmedAction=null;
    const alive=()=>mounted && workspace.isConnected && isCurrent();
    const tell=message=>{if(info.textContent!==message)info.textContent=message;};
    const rpc=async(name,args)=>{
      const {data,error}=await db.rpc(name,args);
      if (error) throw Error(error.message || 'Could not connect.');
      return data;
    };
    const actionButton=(order,action,label,{style='p',disabled=false}={})=>
      `<button type="button" class="btn ${style}" data-delivery-action="${action}" data-order-id="${escape(order.id)}"
        ${disabled||savingOrder?'disabled':''}>${savingOrder===order.id?'Saving…':label}</button>`;
    const orderRef=order=>'Order #'+escape(String(order.id).slice(0,8));
    const statusLabel=order=>phaseLabel[order.status]||'Awaiting pickup';
    function mapPanel(mode, url) {
      const label=url?(mode==='store'?'Directions to store':'Directions to customer'):'Route overview · illustration';
      const graphic=routeGraphic(mode)+`<span>${label}</span>`+(url?'<small aria-hidden="true">Illustration</small>':'');
      return url?`<a class="pr-trip-map" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${graphic}</a>`
        :`<div class="pr-trip-map">${graphic}</div>`;
    }
    function offerCard(order) {
      return `<article class="pr-trip pr-trip-offer">
        <header class="pr-trip-header"><h2 class="pr-job-alert">New job alert</h2><span class="pr-step">Step 1 of 3</span></header>
        ${mapPanel('route')}
        <dl class="pr-trip-details pr-route-stops">
          <div><dt>Pick up at</dt><dd>${escape(order.store||'Store')}</dd><span class="pr-order-sub">${escape(order.store_address||'')}</span></div>
          <div><dt>Drop-off area</dt><dd>${escape(order.barangay?order.barangay+', Alegria':'Alegria')}</dd></div>
        </dl>
        <p class="pr-status-note">${statusLabel(order)} · ${orderRef(order)}</p>
        <div class="pr-trip-actions">
          ${actionButton(order,'skip','Skip',{style:'s'})}
          ${actionButton(order,'claim','Accept delivery')}
        </div>
      </article>`;
    }
    function assignedCard(order) {
      const accepted=!!order.rider_accepted_at, pickedUp=!!order.rider_picked_up_at;
      const handedOff=order.status==='out_for_delivery';
      const store=directions([order.store,order.store_address].filter(Boolean).join(', '));
      const drop=directions(Number.isFinite(order.drop_lat)&&Number.isFinite(order.drop_lng)
        ? order.drop_lat+','+order.drop_lng : cleanAddress(order.address));
      const storePhone=safePhone(order.store_phone), phone=safePhone(order.phone);
      const cod=order.cod_due!=null&&Number.isFinite(Number(order.cod_due))
        ? `<p class="pr-cod">Collect cash · ${peso.format(Number(order.cod_due))} (COD)</p>` : '';
      const time=order.created_at&&Number.isFinite(Date.parse(order.created_at))
        ? ' · '+orderTime.format(new Date(order.created_at)) : '';
      const sharing=share?.id===order.id;
      const heading=pickedUp?'On the way':accepted?'At the store':'Assigned to you';
      const body=pickedUp?`<div class="pr-trip-details">
        <span class="pr-trip-label">Customer</span>
        <strong class="pr-customer-name">${escape(order.customer||'Customer')}</strong>
        <p>${escape(cleanAddress(order.address)||'Drop-off address unavailable')}</p>
        <div class="pr-trip-tools">
          ${phone?`<a class="btn s" href="sms:${phone}">Message customer</a><a class="btn s" href="tel:${phone}">Call</a>`:''}
          ${sharing?actionButton(order,'stop','Stop sharing GPS',{style:'s'}):
            actionButton(order,'gps',requesting?'Starting GPS…':'Share live GPS',{style:'s',disabled:requesting||!!share||!handedOff})}
        </div>
        ${cod?`<div style="margin-top:10px">${cod}</div>`:''}
      </div>`:`<div class="pr-trip-details pr-pickup-slip">
        <span class="pr-trip-label">Collect from</span><h3>${escape(order.store||'Store')}</h3>
        <p class="pr-order-sub">${escape(order.store_address||'')}${time}</p>
        ${order.items?.length?`<ul>${order.items.map(i=>`<li>${escape(i.qty)} × ${escape(i.name||'Item')}</li>`).join('')}</ul>`:''}
        ${cod}
      </div>`;
      const primary=pickedUp?actionButton(order,'deliver','Mark delivered',{disabled:!handedOff})
        :accepted?actionButton(order,'pickup','Picked up & start delivery',{disabled:!handedOff})
        :actionButton(order,'accept','Accept assignment');
      return `<article class="pr-trip">
        <header class="pr-trip-header"><div><h2>${heading}</h2><p class="pr-order-sub">${orderRef(order)}</p></div>
          <span class="pr-step">Step ${pickedUp?3:accepted?2:1} of 3</span>
        </header>
        ${mapPanel(pickedUp?'route':'store',pickedUp?drop:store)}
        ${body}
        ${accepted&&!handedOff&&!pickedUp?'<p class="pr-status-note">Hulat nga i-tap sa store ang <b>Hand to Rider</b>.</p>':''}
        <div class="pr-trip-actions">${primary}</div>
        ${pickedUp?'':`<div class="pr-trip-tools">
          ${storePhone?`<a class="btn s" href="tel:${storePhone}">Call store</a>`:''}
          ${['confirmed','preparing','ready'].includes(order.status)?actionButton(order,'release','Release job',{style:'s'}):''}
        </div>`}
      </article>`;
    }
    function paint() {
      const fingerprint=JSON.stringify([offers,rows,view,selectedId,[...skipped],share?.id,requesting,savingOrder,completedId]);
      if(key===fingerprint)return;
      key=fingerprint;
      const focused=workspace.contains(document.activeElement)?document.activeElement.dataset.deliveryAction:null;
      const visible=offers.filter(order=>!skipped.has(order.id));
      const active=rows.find(order=>order.id===selectedId)||rows[0];
      views.hidden=false;
      views.innerHTML=`<button type="button" class="btn s" data-delivery-action="available" aria-pressed="${view==='available'}">Available · ${visible.length}</button>
        <button type="button" class="btn s" data-delivery-action="my" aria-pressed="${view==='my'}">My deliveries · ${rows.length}</button>`;
      if(view==='available') {
        list.innerHTML=visible.length?offerCard(visible[0])
          :`<section class="pr-no-deliveries"><h2>No available deliveries</h2><p>Mogawas diri ang delivery kung i-confirm na sa store.</p>
            ${offers.length?'<button type="button" class="btn s" data-delivery-action="unskip">Show skipped jobs</button>':''}</section>`;
      } else if(active){
        const index=rows.indexOf(active);
        list.innerHTML=assignedCard(active)+(rows.length>1?`<div class="pr-jobs-nav">
          <button type="button" class="btn s" data-delivery-action="previous" data-order-id="${escape(rows[index-1]?.id||'')}" ${index===0?'disabled':''}>Previous</button>
          <span>${index+1} of ${rows.length}</span>
          <button type="button" class="btn s" data-delivery-action="next" data-order-id="${escape(rows[index+1]?.id||'')}" ${index===rows.length-1?'disabled':''}>Next</button></div>`:'');
      } else {
        list.innerHTML=`<section class="pr-no-deliveries"><h2>${completedId?'Delivered':'No assigned deliveries'}</h2>
          <p>${completedId?'Na-update na ang order sa customer.':'Dawata ang usa ka job gikan sa Available Deliveries.'}</p>
          <button type="button" class="btn s" data-delivery-action="available">View available deliveries</button></section>`;
      }
      if(focused)Array.from(workspace.querySelectorAll('[data-delivery-action]'))
        .find(button=>button.dataset.deliveryAction===focused&&!button.disabled)?.focus({preventScroll:true});
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
        if (!alive() || !rows.some(row=>row.id===id&&row.status==='out_for_delivery'&&
          row.assignment_version===order.assignment_version&&row.rider_picked_up_at)) {
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
    function confirmAction(order,action) {
      const deliver=action==='deliver';
      const dialog=modal(deliver?'Mark this order delivered?':'Release this job?',
        `<p>${deliver?'Confirm once the customer has received the order.':'Another rider can accept this order after you release it.'}</p>
        <div class="pr-account-actions"><button type="button" class="btn p blk" data-pr-confirm>${deliver?'Mark delivered':'Release job'}</button>
        <button type="button" class="btn s blk" data-pr-back>Go back</button></div>`);
      confirmedAction=dialog;
      dialog.querySelector('[data-pr-back]').onclick=()=>dialog.close();
      dialog.querySelector('[data-pr-confirm]').onclick=()=>{
        dialog.close();
        void save(order,action);
      };
      dialog.addEventListener('close',()=>{if(confirmedAction===dialog)confirmedAction=null;},{once:true});
    }
    async function save(order, action) {
      if(!alive()||savingOrder)return;
      savingOrder=order.id;
      ++jobsRevision;
      tell('');
      paint();
      try{
        if(action==='claim'){
          const version=await rpc('papalita_rider_claim',{p_order_id:order.id});
          if(!alive())return;
          if(!version)throw Error('Acceptance could not be confirmed. Tap Refresh.');
          offers=offers.filter(offer=>offer.id!==order.id);
          view='my';
          selectedId=order.id;
          completedId='';
          tell('Delivery accepted.');
        }else if(action==='accept'||action==='pickup'){
          const progress=await rpc('papalita_tracking_rider_progress',{
            p_order_id:order.id,p_assignment_version:order.assignment_version,p_action:action
          });
          if(!alive())return;
          if(!progress?.rider_accepted_at || (action==='pickup'&&!progress.rider_picked_up_at)){
            throw Error('The delivery update could not be confirmed. Please try again.');
          }
          Object.assign(order,progress);
          tell(action==='accept'?'Assignment accepted.':'Pickup confirmed. You can now share live GPS.');
        }else{
          const saved=await rpc('papalita_rider_finish_step',{
            p_order_id:order.id,p_assignment_version:order.assignment_version,p_action:action
          });
          if(!alive())return;
          if(!saved)throw Error('The delivery update could not be confirmed. Please try again.');
          if(share?.id===order.id)void end();
          rows=rows.filter(row=>row.id!==order.id);
          completedId=action==='deliver'?order.id:'';
          tell(action==='deliver'?'Order marked delivered.':'Job released back to Available Deliveries.');
        }
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
        const snapshot=await rpc('papalita_rider_workspace');
        if(!alive()||revision!==jobsRevision)return;
        if(!Array.isArray(snapshot?.assigned)||!Array.isArray(snapshot?.available))throw Error('Could not load deliveries.');
        rows=snapshot.assigned;
        offers=snapshot.available;
        if(!view)view=rows.length?'my':'available';
        if(share&&!rows.some(o=>o.id===share.id&&o.status==='out_for_delivery'&&o.assignment_version===share.version)){
          void end('This delivery has ended or was reassigned.');
        }
        loadStatus.textContent='';
        paint();
      } catch(error) {
        if(alive()&&revision===jobsRevision)loadStatus.textContent=/papalita_rider_workspace|schema cache/i.test(error.message)
          ? 'Rider v7 needs the self-dispatch database update. Contact your Papalita admin.'
          : key?'Could not refresh. Showing the last loaded deliveries. Tap Refresh to try again.'
          :'Could not load your deliveries. Check your connection and tap Refresh.';
      } finally {
        refreshing=false;
        refreshButton.removeAttribute('aria-busy');
        if(alive()&&revision!==jobsRevision&&!savingOrder)void refresh();
      }
    }
    const click=event=>{
      const button=event.target.closest('[data-delivery-action]');
      if(!button || button.disabled)return;
      const action=button.dataset.deliveryAction;
      const id=button.dataset.orderId;
      if(action==='available'||action==='my'){view=action;paint();return;}
      if(action==='previous'||action==='next'){selectedId=id;paint();return;}
      if(action==='unskip'){skipped.clear();paint();return;}
      if(action==='skip'){skipped.add(id);paint();return;}
      if(savingOrder)return;
      if(action==='stop'){void end();return;}
      if(action==='gps'){void start(id);return;}
      const order=(action==='claim'?offers:rows).find(row=>row.id===id);
      if(!order)return;
      if(action==='deliver'||action==='release'){
        if(!confirmedAction?.open)confirmAction(order,action);
        return;
      }
      void save(order,action);
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
    workspace.addEventListener('click',click);
    refreshButton.addEventListener('click',refresh);
    const poll=setInterval(refresh,5000);
    void refresh();
    return ()=>{
      mounted=false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',leaving);
      workspace.removeEventListener('click',click);
      if(confirmedAction?.open)confirmedAction.close();
      refreshButton.removeEventListener('click',refresh);
      void end();
    };
  }
  window.PapalitaLiveRider={mount};
})();
