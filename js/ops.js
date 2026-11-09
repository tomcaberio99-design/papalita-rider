/* Papalita — shared Store, Rider and Admin helpers.
   Legacy localStorage helpers are retained for compatibility.
   Real orders use Supabase and must never be represented as demo orders.
*/
(function () {
  'use strict';

  const KEY = 'foodie.alegria.v1';
  const MODE = 'foodie.alegria.mode';
  const T = [0, 15, 35, 50, 65, 95];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const peso = n => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
  const blank = () => ({ orders: [], cater: [], notes: [] });
  const load = () => {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (_) { return blank(); }
  };
  const save = s => localStorage.setItem(KEY, JSON.stringify(s));
  const stageOf = o => {
    if (o.status === 'cancelled' || o.status === 'refunded') return -1;
    if (o.demo === false) return o.stage;
    const elapsed = (Date.now() - o.createdAt) / 1000;
    let stage = 0;
    T.forEach((t, i) => { if (elapsed >= t) stage = i; });
    return stage;
  };
  const STEPS = ['Order received', 'Preparing', 'Rider assigned', 'Picking up', 'On the way', 'Delivered'];
  const R = id => (window.RESTAURANTS || []).find(r => String(r.id) === String(id));
  const live = () => localStorage.getItem(MODE) === 'live';
  const setLive = on => localStorage.setItem(MODE, on ? 'live' : 'demo');

  // LEGACY ONLY: this modifies the local demo data, NOT a Supabase order.
  const update = (id, fn) => {
    const s = load();
    const o = s.orders.find(x => x.id === id);
    if (!o) return;
    if (o.demo !== false) { o.stage = stageOf(o); o.demo = false; }
    fn(o, s);
    o.upd = Date.now();
    save(s);
  };
  const tell = (s, o, t, b) => {
    s.notes.unshift({
      id: 'n' + Math.random().toString(36).slice(2, 8),
      type: 'order', t: `${t} · ${o.id}`, b,
      at: Date.now(), read: false, uid: o.uid || 'demo'
    });
  };
  const toast = m => {
    let c = $('#toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.append(c); }
    const e = document.createElement('div');
    e.className = 'toast';
    e.textContent = m;
    c.append(e);
    setTimeout(() => e.remove(), 3000);
  };
  const addrBrgy = o => ((o.addr || o.delivery_address || '').split(',').slice(-2, -1)[0] || '').trim() || 'Alegria';
  const items = o => (o.items || []).map(l => {
    const name = l.name || l.product_name || 'Product';
    const qty = l.qty ?? l.quantity ?? 0;
    const sel = l.sel || l.selected_options || {};
    const options = Object.values(sel).flat().filter(Boolean);
    const note = l.note || l.special_instructions;
    return `${qty} × ${esc(name)}` +
      (options.length ? ` <span class="mu">(${esc(options.join(', '))})</span>` : '') +
      (note ? ` <em class="mu">“${esc(note)}”</em>` : '');
  }).join('<br>');
  const modeBar = () => `<div class="note row sp wrap" style="margin-bottom:14px"><span>${live() ? '<b>Live mode is ON.</b> New customer orders wait for the store.' : '<b>Demo mode.</b> Customer orders update automatically. Turn on Live mode so the store and rider control them.'}</span><button class="btn p sm" id="modebtn">${live() ? 'Switch to demo' : 'Turn on Live mode'}</button></div>`;
  const printHTML = (title, body) => {
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { toast('Allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><title>${esc(title)}</title><style>@page{size:80mm auto;margin:4mm}body{font:14px/1.35 'Courier New',monospace;width:72mm;margin:0 auto;color:#000}h1{font-size:18px;text-align:center;margin:4px 0}.c{text-align:center}.d{border-top:2px dashed #000;margin:8px 0}.b{font-weight:bold}.big{font-size:22px}.r{display:flex;justify-content:space-between;gap:8px}.it{font-size:17px;font-weight:bold;margin:6px 0 0}.n{font-size:13px;padding-left:12px}</style>${body}<script>onload=()=>{print();setTimeout(()=>close(),300)}<\/script>`);
    w.document.close();
  };
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  const ov = () => window.getOverrides();
  const setOv = o => window.setOverrides(o);

  /* ---------------- Real Supabase order services ---------------- */
  const db = () => {
    const client = window.PAPALITA_DB;
    if (!client) throw new Error('Supabase not initialized. Load js/supabase.js before js/ops.js.');
    return client;
  };
  const requireSession = async () => {
    const client = db();
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in to view or manage orders.');
    return data.user;
  };
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  // RLS limits rows to the current customer, store owner, or administrator.
  // Pass storeId for the merchant portal. Admins may omit it to view accessible orders.
  async function fetchOrders({ storeId = null, limit = 100 } = {}) {
    await requireSession();
    if (storeId !== null && !uuid(storeId)) throw new Error('Invalid store ID.');
    const count = Math.min(500, Math.max(1, Number(limit) || 100));
    let q = db().from('orders').select('*').order('created_at', { ascending: false }).limit(count);
    if (storeId) q = q.eq('store_id', storeId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  // order_items needs its own SELECT RLS policy; never bypass it with a service-role key in the browser.
  async function fetchOrderItems(orderId) {
    await requireSession();
    if (!uuid(orderId)) throw new Error('Invalid order ID.');
    const { data, error } = await db().from('order_items')
      .select('id,order_id,product_id,product_name,quantity,unit_price,line_total,selected_options,special_instructions')
      .eq('order_id', orderId);
    if (error) throw error;
    return data || [];
  }

  async function fetchOrdersWithItems(options = {}) {
    const orders = await fetchOrders(options);
    if (!orders.length) return [];
    const ids = orders.map(o => o.id);
    const { data, error } = await db().from('order_items')
      .select('id,order_id,product_id,product_name,quantity,unit_price,line_total,selected_options,special_instructions')
      .in('order_id', ids);
    if (error) throw error;
    const byOrder = new Map(ids.map(id => [id, []]));
    for (const item of data || []) byOrder.get(item.order_id)?.push(item);
    return orders.map(o => ({ ...o, items: byOrder.get(o.id) || [] }));
  }

  const ORDER_STATUSES = Object.freeze([
    'pending', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'cancelled'
  ]);

  // Requires an UPDATE policy restricted to the authorized store owner/admin.
  // A database-side trigger/RPC should enforce allowed status transitions.
  async function updateOrderStatus(orderId, status) {
    await requireSession();
    if (!uuid(orderId)) throw new Error('Invalid order ID.');
    if (!ORDER_STATUSES.includes(status)) throw new Error('Invalid order status.');
    const { data, error } = await db().from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('id,store_id,customer_id,status,updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  // Realtime is optional; the calling page should refresh on each callback.
  function subscribeToOrders({ storeId = null, onChange } = {}) {
    if (typeof onChange !== 'function') throw new Error('onChange callback required.');
    if (storeId !== null && !uuid(storeId)) throw new Error('Invalid store ID.');
    const filter = storeId ? { filter: `store_id=eq.${storeId}` } : {};
    const channel = db().channel('papalita-orders-' + Math.random().toString(36).slice(2));
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'orders', ...filter
    }, payload => onChange(payload)).subscribe();
    return () => { void db().removeChannel(channel); };
  }

  window.OPS = {
    printHTML, avg, $, $$, esc, peso, load, save, stageOf, STEPS,
    R, live, setLive, update, tell, toast, addrBrgy, items,
    modeBar, ov, setOv, MODE,
    fetchOrders, fetchOrderItems, fetchOrdersWithItems,
    updateOrderStatus, subscribeToOrders, ORDER_STATUSES
  };
})();
