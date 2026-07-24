'use strict';

require('dotenv').config();
const { StorageClient } = require('@supabase/storage-js');

// Storage-only Supabase client (service role — bypasses RLS, server-only).
// Deliberately NOT @supabase/supabase-js: its createClient() constructs a
// realtime WebSocket client we never use, which crashes on Node < 22.
let client = null;

function getStorage() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for image uploads');
    }
    client = new StorageClient(`${url}/storage/v1`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
    });
  }
  return client;
}

const MERCHANT_ASSETS_BUCKET = 'merchant-assets';
const USER_ASSETS_BUCKET = 'user-assets';

module.exports = { getStorage, MERCHANT_ASSETS_BUCKET, USER_ASSETS_BUCKET };
