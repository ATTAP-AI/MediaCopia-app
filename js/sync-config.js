/* Sync backend: MediaCopia's own Supabase project ("MediaCopia", us-east-1), with its own sign-in emails.
   This is the publishable key, which is meant to be public: row-level security limits every account to its own rows,
   and every row is encrypted before it leaves the device. */
window.MC = window.MC || {};
MC.SYNC_URL = 'https://qclipxrtgqedoatdbejk.supabase.co';
MC.SYNC_KEY = 'sb_publishable_iy_X237zBZg5Z8yI3mUeZA_Nb_nlua0';
// The full TV guide's Schedules Direct relay (server/sd-relay.nginx.conf). Self-hosting? Point this at your own.
MC.SD_RELAY = 'https://mediacopia.com/sd/';
