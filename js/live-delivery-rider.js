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

  const reportReasons={
    customer_unreachable:'Customer unreachable',wrong_address:'Wrong address',
    store_delay:'Store delay',vehicle_issue:'Vehicle issue',other:'Other'
  };
  const historyDate=new Intl.DateTimeFormat('en-PH',{
    dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'
  });

  function mount(workspace, db, isCurrent, escape, modal) {
    const list=workspace.querySelector('[data-live-jobs]');
    const navigation=workspace.querySelector('.pr-nav');
    const title=workspace.querySelector('#pr-delivery-title');
    const summary=workspace.querySelector('[data-view-summary]');
    const deliveriesPage=workspace.querySelector('[data-deliveries-page]');
    const historyPage=workspace.querySelector('[data-rider-history]');
    const accountPage=workspace.querySelector('[data-rider-account]');
    const pageTitles={available:'Available',my:'My Deliveries',earnings:'Earnings',account:'Account'};
    const info=workspace.querySelector('[data-live-info]');
    const loadStatus=workspace.querySelector('[data-live-load-status]');
    const refreshButton=workspace.querySelector('[data-live-refresh]');
    const skipped=new Set();
    const availability=workspace.querySelector('[data-rider-availability]');
    let online=null, savingAvailability=false, mapDialog=null, loadingHistory=false;
    let offers=[], rows=[], view='', selectedId='', key='';
    let share=null, requesting=false, refreshing=false, mounted=true, savingOrder=null, jobsRevision=0;
    let completedId='', confirmedAction=null;
    const alive=()=>mounted && workspace.isConnected && isCurrent();
    const tell=message=>{if(info.textContent!==message)info.textContent=message;};
    const rpc=async(name,args)=>{
      const {data,error}=await db.rpc(name,args);
      if (error) throw Object.assign(Error(error.message || 'Could not connect.'), {code:error.code});
      return data;
    };
    const actionButton=(order,action,label,{style='p',disabled=false}={})=>
      `<button type="button" class="btn ${style}" data-delivery-action="${action}" data-order-id="${escape(order.id)}"
        ${disabled||savingOrder?'disabled':''}>${savingOrder===order.id?'Saving…':label}</button>`;
    const orderRef=order=>'Order #'+escape(String(order.id).slice(0,8));
    const statusLabel=order=>phaseLabel[order.status]||'Awaiting pickup';
    function deliveryPayout(order) {
      const q=order.delivery_pricing;
      if (!q) return order.delivery_fee == null ? '' :
        `<p class="pr-cod">Delivery payout · ${peso.format(Number(order.delivery_fee))}</p>`;
      const money=cents=>peso.format(cents/100);
      const source=q.source==='fixed_area'?'Verified fixed area rate':(q.road_m/1000).toFixed(2)+' km by road';
      return `<div class="pr-payout">
        <strong>Delivery payout · ${money(q.total_centavos)}</strong>
        <span>${source} · Base ${money(q.base_centavos)}${q.interior_centavos?' + '+money(q.interior_centavos)+' interior top-up':''}${q.terrain_centavos?' + '+money(q.terrain_centavos)+' upland surcharge':''}</span>
      </div>`;
    }
    function offerCard(order) {
      return `<article class="pr-trip pr-trip-offer">
        <header class="pr-trip-header"><h2 class="pr-job-alert">New job alert</h2><span class="pr-step">Step 1 of 3</span></header>
        <dl class="pr-trip-details pr-route-stops">
          <div><dt>Pick up at</dt><dd>${escape(order.store||'Store')}</dd><span class="pr-order-sub">${escape(order.store_address||'')}</span></div>
          <div><dt>Drop-off area</dt><dd>${escape(order.delivery_pricing
            ? order.delivery_pricing.area+', '+order.delivery_pricing.barangay+', Alegria'
            : order.barangay?order.barangay+', Alegria':'Alegria')}</dd></div>
        </dl>
        ${deliveryPayout(order)}
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
      const storePhone=safePhone(order.store_phone), phone=safePhone(order.phone);
      const customer=escape(order.customer||'Name unavailable');
      const cod=order.cod_due!=null&&Number.isFinite(Number(order.cod_due))
        ? `<p class="pr-cod">Collect cash · ${peso.format(Number(order.cod_due))} (COD)</p>` : '';
      const time=order.created_at&&Number.isFinite(Date.parse(order.created_at))
        ? ' · '+orderTime.format(new Date(order.created_at)) : '';
      const sharing=share?.id===order.id;
      const phase=pickedUp?'On the way':accepted?'At the store':'Assigned to you';
      const primary=pickedUp?actionButton(order,'deliver','Mark delivered',{style:'s',disabled:!handedOff})
        :accepted?actionButton(order,'pickup','Picked up & start delivery',{disabled:!handedOff})
        :actionButton(order,'accept','Accept assignment');
      return `<article class="pr-trip">
        <header class="pr-trip-header pr-active-header">
          <h2>Delivery #${escape(String(order.id).slice(0,8))}</h2>
          <span class="pr-step">${phase}</span>
        </header>
        <dl class="pr-trip-details pr-route-stops">
          <div><dt>Pickup</dt><dd>${escape(order.store||'Store')}</dd>
            <span class="pr-order-sub">${escape(order.store_address||'')}${time}</span></div>
          ${accepted?`<div><dt>Drop-off</dt><dd class="pr-customer-name">${customer}</dd>
            <span class="pr-order-sub">${escape(cleanAddress(order.address)||'Drop-off address unavailable')}</span>
            ${phone?`<p class="pr-order-sub">${escape(phone)}</p>`:''}
          </div>`:''}
        </dl>
        ${!pickedUp&&order.items?.length?`<details class="pr-order-items"><summary>Order items</summary>
          <ul>${order.items.map(i=>`<li>${escape(i.qty)} × ${escape(i.name||'Item')}</li>`).join('')}</ul>
        </details>`:''}
        ${deliveryPayout(order)}
        ${cod}
        ${accepted&&!handedOff&&!pickedUp?'<p class="pr-status-note">Wait for the store to select <b>Hand to Rider</b>.</p>':''}
        <div class="pr-trip-actions pr-delivery-actions">
          ${accepted?actionButton(order,'map','Navigate',{style:pickedUp?'p':'s'}):''}
          ${primary}
        </div>
        <div class="pr-trip-tools">
          ${accepted?actionButton(order,'report','Report a problem',{style:'s'}):''}
          ${!pickedUp&&storePhone?`<a class="btn s" href="tel:${storePhone}">Call store</a>`:''}
          ${pickedUp&&phone?`<a class="btn s" href="sms:${phone}">Message customer</a><a class="btn s" href="tel:${phone}">Call customer</a>`:''}
          ${pickedUp?(sharing?actionButton(order,'stop','Stop sharing GPS',{style:'s'}):
            actionButton(order,'gps',requesting?'Starting GPS…':'Share live GPS',{style:'s',disabled:requesting||!!share||!handedOff})):''}
          ${['confirmed','preparing','ready'].includes(order.status)?actionButton(order,'release','Release job',{style:'s'}):''}
        </div>
      </article>`;
    }
    function paint() {
      const fingerprint=JSON.stringify([offers,rows,view,selectedId,[...skipped],share?.id,requesting,savingOrder,completedId,online,savingAvailability]);
      if(key===fingerprint)return;
      key=fingerprint;
      const focused=workspace.contains(document.activeElement)?document.activeElement.dataset.deliveryAction:null;
      const visible=offers.filter(order=>!skipped.has(order.id));
      const active=rows.find(order=>order.id===selectedId)||rows[0];
      const page=view||'available';
      const isDeliveries=page==='available'||page==='my';
      title.textContent=pageTitles[page];
      summary.hidden=!isDeliveries||online===null;
      const count=page==='available'?visible.length:rows.length;
      summary.textContent=count+' '+(page==='available'?'available':'active')+' '+(count===1?'delivery':'deliveries');
      deliveriesPage.hidden=!isDeliveries;
      historyPage.hidden=page!=='earnings';
      accountPage.hidden=page!=='account';
      refreshButton.hidden=page==='account';
      navigation.querySelectorAll('button').forEach(button=>{
        if(button.dataset.deliveryAction===page)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      });
      availability.hidden=online===null;
      availability.checked=online===true;
      availability.disabled=savingAvailability||!!savingOrder;
      workspace.querySelector('[data-rider-availability-label]').textContent=online?'Online':'Offline';
      if(!isDeliveries||online===null)return;
      if(view==='available') {
        list.innerHTML=online===false
          ? '<section class="pr-no-deliveries"><h2>You’re offline</h2><p>Switch to Online to see new jobs. You can still finish your current deliveries.</p></section>'
          : visible.length?offerCard(visible[0])
          :`<section class="pr-no-deliveries"><h2>No available deliveries</h2><p>Deliveries appear here after the store confirms them.</p>
            ${offers.length?'<button type="button" class="btn s" data-delivery-action="unskip">Show skipped jobs</button>':''}</section>`;
      } else if(active){
        const index=rows.indexOf(active);
        list.innerHTML=assignedCard(active)+(rows.length>1?`<div class="pr-jobs-nav">
          <button type="button" class="btn s" data-delivery-action="previous" data-order-id="${escape(rows[index-1]?.id||'')}" ${index===0?'disabled':''}>Previous</button>
          <span>${index+1} of ${rows.length}</span>
          <button type="button" class="btn s" data-delivery-action="next" data-order-id="${escape(rows[index+1]?.id||'')}" ${index===rows.length-1?'disabled':''}>Next</button></div>`:'');
      } else {
        list.innerHTML=`<section class="pr-no-deliveries"><h2>${completedId?'Delivered':'No assigned deliveries'}</h2>
          <p>${completedId?'The customer’s order status is now Delivered.':'Accept a delivery from the Available tab.'}</p>
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
    function openStreetMap(order){
      if(mapDialog?.dialog.open)return;
      const pickedUp=!!order.rider_picked_up_at;
      const coords=pickedUp?[order.drop_lat,order.drop_lng]:[order.store_lat,order.store_lng];
      const place=coords.every(Number.isFinite)?coords.join(',')
        :pickedUp?cleanAddress(order.address):[order.store,order.store_address].filter(Boolean).join(', ');
      const url=directions(place);
      const dialog=modal(pickedUp?'Map to customer':'Map to store',`
        <div class="pr-map-canvas" data-map-canvas aria-label="Street map"></div>
        <p class="pr-status-note" data-map-status role="status">Loading the street map…</p>
        <div class="pr-trip-tools">
          <button type="button" class="btn s" data-map-gps disabled>Show my location</button>
          <button type="button" class="btn p" data-map-route disabled>Show road route</button>
          ${url?`<a class="btn s" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Directions to ${pickedUp?'customer':'store'}</a>`:''}
        </div>
        <p class="pr-map-disclosure">Show road route sends the start and destination coordinates to the routing provider.</p>`);
      mapDialog={dialog,id:order.id,version:order.assignment_version,pickedUp};
      dialog.addEventListener('close',()=>{if(mapDialog?.dialog===dialog)mapDialog=null;},{once:true});
      if(window.PapalitaRiderMap)window.PapalitaRiderMap.mount(dialog,order,pickedUp);
      else dialog.querySelector('[data-map-status]').textContent='Street map is unavailable. Use the directions link.';
    }

    async function showHistory(){
      if(!alive()||loadingHistory)return;
      const panel=historyPage;
      loadingHistory=true;
      panel.setAttribute('role','status');
      panel.textContent='Loading earnings…';
      try{
        const history=await rpc('papalita_rider_earnings');
        if(!alive())return;
        panel.removeAttribute('role');
        panel.innerHTML=`<div class="pr-earnings-total">
          <span>Total delivery earnings</span><strong>${peso.format(Number(history.total))}</strong>
          <p>${Number(history.count)} completed ${Number(history.count)===1?'delivery':'deliveries'} · full delivery fee</p>
        </div>
        ${history.missing_fees?'<p class="pr-status-note">Some completed orders have no recorded delivery fee.</p>':''}
        ${history.recent.length?'<h3 class="pr-history-title">Recent deliveries</h3><ul class="pr-history-list">'+history.recent.map(row=>`<li>
          <div><b>${escape(row.store||'Store')}</b><small>${escape(historyDate.format(new Date(row.delivered_at)))} · #${escape(row.order_id.slice(0,8))}</small></div>
          <strong>${row.earned==null?'Fee unavailable':peso.format(Number(row.earned))}</strong></li>`).join('')+'</ul>'
          :'<p class="pr-status-note">Your completed deliveries will appear here.</p>'}`;
      }catch{if(alive())panel.textContent='Could not load your earnings. Tap Refresh to try again.';}
      finally{loadingHistory=false;}
    }

    function reportProblem(order){
      const dialog=modal('Report a problem',`<form data-pr-problem>
        <div class="field"><label for="pr-report-reason">Reason</label>
        <select class="in" id="pr-report-reason" name="reason" required>
          <option value="">Choose a reason</option>
          ${Object.entries(reportReasons).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
        </select></div>
        <div class="field"><label for="pr-report-note">Note (optional)</label>
          <textarea class="in" id="pr-report-note" name="note" rows="3" maxlength="500"></textarea></div>
        <p class="pr-status-note" role="status"></p>
        <button class="btn p blk" type="submit">Send report</button>
      </form>`);
      const form=dialog.querySelector('form');
      const button=form.querySelector('button');
      const status=form.querySelector('[role=status]');
      let requestId, previous;
      form.onsubmit=async event=>{
        event.preventDefault();
        if(!alive()||button.disabled)return;
        const fields=new FormData(form);
        const reason=fields.get('reason'),note=fields.get('note').trim();
        const key=JSON.stringify([reason,note]);
        if(key!==previous){requestId=crypto.randomUUID();previous=key;}
        button.disabled=true;
        status.textContent='Sending…';
        try{
          const sent=await rpc('papalita_rider_report_problem',{
            p_report_id:requestId,p_order_id:order.id,p_assignment_version:order.assignment_version,
            p_reason:reason,p_note:note
          });
          if(!sent)throw Error('The report could not be saved. Please try again.');
          if(alive())tell('Problem reported to Papalita admin.');
          if(dialog.open)dialog.close();
        }catch(error){if(dialog.open)status.textContent=error.message;}
        finally{button.disabled=false;}
      };
    }

    async function setAvailability(){
      if(!alive()||online===null||savingAvailability)return;
      const next=availability.checked;
      savingAvailability=true;
      ++jobsRevision;
      paint();
      try{
        const saved=await rpc('papalita_rider_set_online',{p_online:next});
        if(!alive())return;
        if(saved!==next)throw Error('Availability could not be confirmed. Please try again.');
        online=saved;
        if(!online)offers=[];
        tell(online?'You’re online. New deliveries will appear in Available.':'You’re offline. Your accepted deliveries stay in My deliveries.');
      }catch(error){if(alive())tell(error.message);}
      finally{
        savingAvailability=false;
        if(alive()){paint();void refresh();}
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
      if(!alive() || refreshing || savingOrder || savingAvailability || document.hidden)return;
      refreshing=true;
      refreshButton.setAttribute('aria-busy','true');
      const revision=jobsRevision;
      try {
        const snapshot=await rpc('papalita_rider_dashboard');
        if(!alive()||revision!==jobsRevision)return;
        if(!Array.isArray(snapshot?.assigned)||!Array.isArray(snapshot?.available))throw Error('Could not load deliveries.');
        online=snapshot.online===true;
        rows=snapshot.assigned;
        offers=snapshot.available;
        if(!view)view=rows.length?'my':'available';
        if(share&&!rows.some(o=>o.id===share.id&&o.status==='out_for_delivery'&&o.assignment_version===share.version)){
          void end('This delivery has ended or was reassigned.');
        }
        if(mapDialog&&!rows.some(order=>order.id===mapDialog.id&&order.assignment_version===mapDialog.version
          &&!!order.rider_picked_up_at===mapDialog.pickedUp)){
          mapDialog.dialog.close();
        }
        loadStatus.textContent='';
        paint();
      } catch(error) {
        if(alive()&&revision===jobsRevision){
          const code=/^[A-Z0-9]{5,10}$/.test(error.code||'')?error.code:'';
          if(code==='PGRST202'||code==='42883'){
            loadStatus.textContent='Delivery setup is incomplete. Contact Papalita support.';
          }else if(code==='42501'){
            loadStatus.textContent='Your account could not access deliveries. Contact Papalita support.';
          }else if(code){
            loadStatus.textContent='The server could not load deliveries. Contact Papalita support with code '+code+'.';
          }else{
            loadStatus.textContent=key?'Could not refresh. Showing the last loaded deliveries. Tap Refresh to try again.'
              :'Could not load deliveries. Tap Refresh to try again.';
          }
        }
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
      if(Object.hasOwn(pageTitles,action)){
        if(view!==action){
          view=action;
          paint();
          window.scrollTo(0,0);
          title.focus({preventScroll:true});
          if(action==='earnings')void showHistory();
        }
        return;
      }
      if(action==='previous'||action==='next'){selectedId=id;paint();return;}
      if(action==='unskip'){skipped.clear();paint();return;}
      if(action==='skip'){skipped.add(id);paint();return;}
      if(savingOrder)return;
      if(action==='stop'){void end();return;}
      if(action==='gps'){void start(id);return;}
      const order=(action==='claim'?offers:rows).find(row=>row.id===id);
      if(!order)return;
      if(action==='report'){reportProblem(order);return;}
      if(action==='map'){openStreetMap(order);return;}
      if(action==='claim'&&(online!==true||savingAvailability))return;
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
    const refreshView=()=>view==='earnings'?showHistory():refresh();
    refreshButton.addEventListener('click',refreshView);
    availability.addEventListener('change',setAvailability);
    const poll=setInterval(refresh,5000);
    paint();
    void refresh();
    return ()=>{
      mounted=false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',leaving);
      workspace.removeEventListener('click',click);
      if(confirmedAction?.open)confirmedAction.close();
      refreshButton.removeEventListener('click',refreshView);
      availability.removeEventListener('change',setAvailability);
      void end();
    };
  }
  window.PapalitaLiveRider={mount};
})();
