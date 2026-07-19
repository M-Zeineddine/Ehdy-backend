'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Server-side Supabase client for Storage uploads. Uses the service-role key
// (bypasses RLS) — must never be exposed to any client.
let client = null;

function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for image uploads');
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

const MERCHANT_ASSETS_BUCKET = 'merchant-assets';

module.exports = { getSupabase, MERCHANT_ASSETS_BUCKET };
