/* Foodie Alegria runtime configuration. Only PUBLIC values belong here. */
window.FOODIE_CONFIG = {
  appName: 'Papalita!',
  demoMode: true,
  municipality: 'Alegria, Surigao del Norte',
  location: { label: 'Poblacion, Alegria' },
  supabase: { url: 'https://jpitdghrpxmyqbrbsyrz.supabase.co', anonKey: 'sb_publishable_PqB8utGq4buHaX20r9trKQ_c4Cqfcgs' },
  auth: { otp: 'demo' },             // 'demo' shows the code on screen. Use an SMS provider (Supabase phone auth) in production
  payments: { provider: 'demo' },
  maps: { provider: 'none', token: '' }
};
