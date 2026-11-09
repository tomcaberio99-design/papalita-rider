/* Sample catalogue for Alegria, Surigao del Norte. ALL phone numbers, hours, addresses, fees and prices are PLACEHOLDERS:
   replace them with the stores' real details. In production this comes from Supabase. */
(function () {
  const sz = a => ({ id: 'size', label: 'Size', req: true, type: 'radio', ch: a });
  const ad = a => ({ id: 'addons', label: 'Add-ons', type: 'check', ch: a });
  const RICE = ad([{ n: 'Extra rice', p: 25 }, { n: 'Atchara', p: 15 }]);
  const OPTS = {
    bulalo: [ad([{ n: 'Extra rice', p: 25 }, { n: 'Extra broth', p: 40 }, { n: 'Sawsawan set', p: 10 }])], grilled: [RICE, ad([{ n: 'Extra rice', p: 25 }, { n: 'Atchara', p: 15 }, { n: 'Fried egg', p: 20 }])].slice(1),
    rice: [ad([{ n: 'Fried egg', p: 20 }, { n: 'Soup', p: 40 }])], ramen: [sz([{ n: 'Regular', p: 0 }, { n: 'Large', p: 60 }]), ad([{ n: 'Extra chashu', p: 70 }, { n: 'Flavored egg', p: 30 }, { n: 'Noodle refill', p: 40 }])],
    seafood: [ad([{ n: 'Extra rice', p: 25 }, { n: 'Garlic butter dip', p: 30 }])], resort: [ad([{ n: 'Extra rice', p: 25 }])],
    drinks: [sz([{ n: 'Regular', p: 0 }, { n: 'Large', p: 20 }])]
  };
  window.CATEGORIES = [
    { id: 'bulalo', name: 'Bulalo & Soups', img: 'bulalo' }, { id: 'grilled', name: 'Grilled & Sizzling', img: 'liempo' }, { id: 'rice', name: 'Rice Meals', img: 'lechon' },
    { id: 'ramen', name: 'Ramen & Noodles', img: 'ramen' }, { id: 'seafood', name: 'Seafood', img: 'shrimp' }, { id: 'catering', name: 'Catering', img: 'tray' },
    { id: 'drinks', name: 'Drinks & Desserts', img: 'halo' }, { id: 'resort', name: 'Resort Dining', img: 'lake' }
  ];
  window.BRGYS = [ /* sample delivery fee (₱), extra minutes and km from the town center: editable placeholders */
    { n: 'Poblacion', fee: 30, eta: 0, km: 0 }, { n: 'Anahaw', fee: 40, eta: 5, km: 1.5 }, { n: 'San Juan', fee: 40, eta: 5, km: 1.8 }, { n: 'San Pedro', fee: 45, eta: 8, km: 2.4 },
    { n: 'Ombong', fee: 50, eta: 10, km: 3.2 }, { n: 'Julio Ouano', fee: 50, eta: 10, km: 3.6 }, { n: 'Gamuton', fee: 55, eta: 12, km: 4.5 }, { n: 'Pongtud', fee: 60, eta: 12, km: 4.8 },
    { n: 'Budlingin', fee: 60, eta: 15, km: 5.5 }, { n: 'Alipao', fee: 65, eta: 15, km: 6 }, { n: 'Ferlda', fee: 70, eta: 18, km: 7 }, { n: 'Camp Eduard', fee: 75, eta: 20, km: 8 }
  ];
  const it = (id, name, price, cat, img, desc, sec, extra) => Object.assign({ id, name, price, cat, img, desc, sec, opts: OPTS[cat] || [], available: true, pop: 50 }, extra);
  const rev = (a, b, c) => [{ who: 'Sample reviewer', r: 5, t: a }, { who: 'Sample reviewer', r: 4, t: b }, { who: 'Sample reviewer', r: 5, t: c }];
  window.RESTAURANTS = [
    { id: 'kentkaye', name: 'Kent and Kaye Bulaloan', kind: 'Bulalo', cat: 'bulalo', rating: 4.8, reviews: '320+', eta: [25, 35], fee: 0, min: 150, hours: ['06:00', '22:00'], promo: 'BULALO50', dx: 0.6, dy: 0.4, cover: 'bulalo', addr: 'Poblacion, Alegria, Surigao del Norte', phone: '09243873785', messenger: '', placeholder: false, catering: true,
      cateringInfo: { cover: 'tray', from: 'from ₱3,500', pkgs: ['Tray meals', 'Lechon and bulalo set', 'Full buffet'] },
      reviewsList: rev('The bulalo broth is rich and the meat falls off the bone.', 'Big servings, good for sharing.', 'Ordered for our family gathering and everyone loved it.'),
      items: [it('bulalo2', 'Bulalo (2–3 pax)', 450, 'bulalo', 'bulalo', 'Slow-simmered beef shank and marrow with corn, cabbage and pechay.', 'Best Sellers', { pop: 100, best: true, r: 4.8, rv: '320+' }),
        it('bulalofam', 'Bulalo (family size)', 850, 'bulalo', 'bulalo2', 'Big pot of bulalo for 5–6 people.', 'Best Sellers', { pop: 92 }),
        it('nilaga', 'Beef Nilaga', 320, 'bulalo', 'nilaga', 'Tender beef with potatoes, cabbage and saba in clear broth.', 'Best Sellers', { pop: 80 }),
        it('sinigang', 'Sinigang na Baboy', 280, 'bulalo', 'sinigang', 'Sour tamarind pork soup with vegetables.', 'Soups', { pop: 70 }),
        it('tinola', 'Tinolang Manok', 260, 'bulalo', 'tinola', 'Chicken ginger soup with green papaya and chili leaves.', 'Soups', { pop: 66 }),
        it('bulalosolo', 'Bulalo Soup (single)', 180, 'bulalo', 'bulalo', 'Single serving bowl, comes with rice.', 'Soups', { pop: 72 }),
        it('liempo', 'Grilled Liempo', 220, 'grilled', 'liempo', 'Charcoal-grilled pork belly with sawsawan.', 'Grilled & Sizzling', { pop: 88 }),
        it('inasal', 'Chicken Inasal', 160, 'grilled', 'inasal', 'Marinated chicken grilled over charcoal.', 'Grilled & Sizzling', { pop: 82 }),
        it('sisig', 'Sizzling Pork Sisig', 200, 'grilled', 'sisig', 'Chopped pork on a hot plate with onions and chili.', 'Grilled & Sizzling', { pop: 84 }),
        it('garlicrice', 'Garlic Rice', 45, 'rice', 'garlicrice', 'Fragrant garlic fried rice.', 'Rice Meals', { pop: 60, opts: [] }),
        it('plainrice', 'Plain Rice', 30, 'rice', 'rice', 'Steamed white rice.', 'Rice Meals', { pop: 50, opts: [] }),
        it('lechon', 'Lechon Kawali Rice Meal', 160, 'rice', 'lechon', 'Crispy fried pork belly with rice and liver sauce.', 'Rice Meals', { pop: 86 }),
        it('pancit', 'Pancit Bihon (tray)', 520, 'ramen', 'pancit', 'Stir-fried rice noodles with vegetables and chicken. Good for 8–10.', 'Sides & Drinks', { pop: 64, opts: [] }),
        it('tilapia', 'Fried Tilapia', 180, 'seafood', 'tilapia', 'Whole crispy tilapia with soy-calamansi dip.', 'Sides & Drinks', { pop: 62 }),
        it('icedtea', 'Iced Tea', 45, 'drinks', 'icedtea', 'Chilled house iced tea.', 'Sides & Drinks', { pop: 55 }),
        it('softdrink', 'Softdrinks (1.5L)', 90, 'drinks', 'softdrink', 'Cold bottled softdrink.', 'Sides & Drinks', { pop: 50, opts: [] })] },
    { id: 'conchita', name: 'Doña Conchita Lakeview Resort', kind: 'Resort · Japanese', cat: 'resort', rating: 4.7, reviews: '150+', eta: [30, 45], fee: 0, min: 200, hours: ['06:00', '22:00'], promo: 'FREEDEL', dx: 2.8, dy: -1.9, cover: 'lake', addr: 'Alegria, Surigao del Norte', phone: '09455990934', messenger: '', placeholder: false, catering: true,
      cateringInfo: { cover: 'buffet', from: 'from ₱5,000', pkgs: ['Tray meals', 'Lechon and bulalo set', 'Full buffet'] },
      feature: { title: 'Japanese ramen by the lake', sub: 'Tonkotsu, shoyu and miso ramen, gyoza and katsu bowls', img: 'ramen', sec: 'Japanese' }, stay: ['Rooms', 'Day Pass', 'Function Hall'],
      reviewsList: rev('Ramen with a lake view is a great combo.', 'Lovely place for family lunch.', 'Crispy pata was perfect for our group.'),
      items: [it('tonkotsu', 'Tonkotsu Ramen', 280, 'ramen', 'ramen', 'Creamy pork broth, chashu, flavored egg and spring onion.', 'Japanese', { pop: 98, best: true, r: 4.7, rv: '150+' }),
        it('shoyu', 'Shoyu Ramen', 260, 'ramen', 'ramen2', 'Soy-based clear broth with chashu, egg and nori.', 'Japanese', { pop: 82 }),
        it('miso', 'Miso Ramen', 270, 'ramen', 'ramen3', 'Savory miso broth with corn and butter.', 'Japanese', { pop: 78 }),
        it('gyoza', 'Pork Gyoza (6 pcs)', 150, 'ramen', 'gyoza', 'Pan-fried dumplings with ponzu dip.', 'Japanese', { pop: 76, opts: [] }),
        it('katsu', 'Chicken Katsu Rice Bowl', 230, 'rice', 'katsu', 'Crispy chicken cutlet, egg and rice with katsu sauce.', 'Japanese', { pop: 74 }),
        it('gtilapia', 'Grilled Tilapia', 260, 'resort', 'tilapia', 'Whole tilapia grilled with tomato and onion stuffing.', 'Resort Favorites', { pop: 80 }),
        it('crispypata', 'Crispy Pata', 650, 'resort', 'crispypata', 'Deep-fried pork knuckle with vinegar dip. Good for 3–4.', 'Resort Favorites', { pop: 90 }),
        it('platter', 'Seafood Platter', 950, 'seafood', 'seafood', 'Shrimp, squid, fish and mussels. Good for 3–4.', 'Resort Favorites', { pop: 85 }),
        it('buko', 'Buko Juice', 70, 'drinks', 'buko', 'Fresh young coconut juice.', 'Resort Favorites', { pop: 58, opts: [] }),
        it('halohalo', 'Halo-Halo', 120, 'drinks', 'halo', 'Shaved ice with sweet beans, fruits, leche flan and ice cream.', 'Desserts & Drinks', { pop: 87, opts: [] }),
        it('icedcoffee', 'Iced Coffee', 90, 'drinks', 'icedcoffee', 'Cold brewed coffee over ice.', 'Desserts & Drinks', { pop: 60 })] }
  ];
  window.PROMOS = [
    { code: 'BULALO50', title: '₱50 off Kent and Kaye', type: 'flat', value: 50, cap: 50, min: 499, exp: '2026-12-31', rid: 'kentkaye', desc: 'Get ₱50 off orders of ₱499 or more from Kent and Kaye Bulaloan.', active: true },
    { code: 'FREEDEL', title: 'Free delivery', type: 'ship', value: 0, cap: 0, min: 399, exp: '2026-12-31', rid: null, desc: 'Delivery fee waived on orders of ₱399 or more.', active: true },
    { code: 'FOODIE10', title: '10% off, up to ₱100', type: 'percent', value: 10, cap: 100, min: 300, exp: '2026-12-15', rid: null, desc: 'Save 10% on orders over ₱300. Max discount ₱100.', active: true },
    { code: 'LAKE50', title: '₱50 off Lakeview Resort', type: 'flat', value: 50, cap: 50, min: 400, exp: '2026-12-31', rid: 'conchita', desc: '₱50 off Dona Conchita Lakeview Resort orders of ₱400 or more.', active: true }
  ];
  window.RIDERS = [{ id: 'r1', name: 'Marco Reyes', phone: '09455990934', vehicle: 'Motorcycle' }, { id: 'r2', name: 'Jun Dela Cruz', phone: '09455990934', vehicle: 'Motorcycle' }]; /* placeholders */
  window.ADMIN_KEY = 'foodie.alegria.admin.v1';
  window.applyOverrides = function () {
    let o = {}; try { o = JSON.parse(localStorage.getItem(window.ADMIN_KEY) || '{}'); } catch (e) {}
    (o.extraItems || []).forEach(x => { const r = window.RESTAURANTS.find(r => r.id === x.rid); if (r && !r.items.find(i => i.id === x.id)) r.items.push(Object.assign({ opts: OPTS[x.cat] || [], available: true, pop: 40 }, x)); });
    window.RESTAURANTS.forEach(r => r.items.forEach(i => { const e = (o.items || {})[i.id]; if (e) Object.assign(i, e); }));
    window.CATEGORIES.forEach(c => { const e = (o.cats || {})[c.id]; if (e) Object.assign(c, e); });
    (o.promos || []).forEach(p => { const i = window.PROMOS.findIndex(x => x.code === p.code); i >= 0 ? (window.PROMOS[i] = p) : window.PROMOS.push(p); });
    (o.removedPromos || []).forEach(c => { const i = window.PROMOS.findIndex(x => x.code === c); if (i >= 0) window.PROMOS.splice(i, 1); });
    Object.entries(o.brgys || {}).forEach(([n, e]) => { const b = window.BRGYS.find(x => x.n === n); if (b) Object.assign(b, e); });
    (o.stores || {}) && Object.entries(o.stores || {}).forEach(([id, e]) => { const r = window.RESTAURANTS.find(x => x.id === id); if (r) { Object.assign(r, e); if (e.phone) r.placeholder = false; } });
  };
  window.getOverrides = () => { try { return JSON.parse(localStorage.getItem(window.ADMIN_KEY) || '{}'); } catch (e) { return {}; } };
  window.setOverrides = o => localStorage.setItem(window.ADMIN_KEY, JSON.stringify(o));
  window.applyOverrides();
})();
