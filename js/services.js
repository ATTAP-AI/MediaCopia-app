/* MediaCopia — subscription services the user can tick in Settings.
   Each: { id, name, types[], aliases[], url, search? }  `search` uses {q} for the encoded title.
   Aliases are matched against the service names Claude returns in "where". */
window.MC = window.MC || {};

const S = (id, name, types, url, search = '', aliases = [], free = false) => ({ id, name, types, url, search, aliases: [name, ...aliases], free });
const VIDEO = ['movies', 'tv'];
// A cable or satellite TV provider (see the 'cable' group).
const TV = (id, name, url, aliases, regions) => ({ ...S(id, name, VIDEO, url, '', aliases), cable: true, regions });

MC.SERVICE_GROUPS = [
  { key: 'video', label: 'Movies & TV', icon: '🎬', services: [
    S('netflix', 'Netflix', [...VIDEO, 'games'], 'https://www.netflix.com', 'https://www.netflix.com/search?q={q}'),
    S('prime-video', 'Prime Video', VIDEO, 'https://www.amazon.com/primevideo', 'https://www.amazon.com/s?k={q}&i=instant-video', ['Amazon Prime Video', 'Amazon Prime', 'Prime']),
    S('disney-plus', 'Disney+', VIDEO, 'https://www.disneyplus.com', '', ['Disney Plus']),
    S('max', 'HBO Max', VIDEO, 'https://www.max.com', '', ['Max', 'HBO']),
    S('hulu', 'Hulu', VIDEO, 'https://www.hulu.com', 'https://www.hulu.com/search?q={q}'),
    S('apple-tv', 'Apple TV+', VIDEO, 'https://tv.apple.com', 'https://tv.apple.com/search?term={q}', ['Apple TV', 'Apple TV Plus']),
    S('paramount-plus', 'Paramount+', VIDEO, 'https://www.paramountplus.com', '', ['Paramount Plus']),
    S('peacock', 'Peacock', VIDEO, 'https://www.peacocktv.com', '', ['Peacock Premium']),
    S('youtube-premium', 'YouTube Premium', [...VIDEO, 'music', 'social'], 'https://www.youtube.com', 'https://www.youtube.com/results?search_query={q}', ['YouTube']),
    S('youtube-tv', 'YouTube TV', VIDEO, 'https://tv.youtube.com'),
    S('crunchyroll', 'Crunchyroll', VIDEO, 'https://www.crunchyroll.com', 'https://www.crunchyroll.com/search?q={q}'),
    S('criterion', 'Criterion Channel', ['movies'], 'https://www.criterionchannel.com', 'https://www.criterionchannel.com/search?q={q}', ['The Criterion Channel', 'Criterion']),
    S('mubi', 'MUBI', ['movies'], 'https://mubi.com'),
    S('shudder', 'Shudder', VIDEO, 'https://www.shudder.com'),
    S('amc-plus', 'AMC+', VIDEO, 'https://www.amcplus.com', '', ['AMC Plus']),
    S('starz', 'Starz', VIDEO, 'https://www.starz.com'),
    S('mgm-plus', 'MGM+', VIDEO, 'https://www.mgmplus.com', '', ['MGM Plus']),
    S('britbox', 'BritBox', VIDEO, 'https://www.britbox.com'),
    S('acorn', 'Acorn TV', VIDEO, 'https://acorn.tv'),
    S('fubo', 'Fubo', VIDEO, 'https://www.fubo.tv', '', ['fuboTV']),
    S('sling', 'Sling TV', VIDEO, 'https://www.sling.com', '', ['Sling']),
  ] },
  /* TV providers. Ticking one means cable channels (live, on demand, or in a network's app with a TV-provider sign-in)
     count as yours. `regions`: shown in Settings only for these countries, unless already ticked. */
  { key: 'cable', label: 'Cable & satellite TV', icon: '📡', services: [
    TV('xfinity', 'Xfinity', 'https://www.xfinity.com/stream', ['Comcast', 'Comcast Xfinity', 'Xfinity TV', 'Xfinity Stream', 'Xfinity On Demand'], ['US']),
    TV('spectrum', 'Spectrum', 'https://watch.spectrum.net', ['Spectrum TV', 'Spectrum TV App', 'Charter', 'Charter Spectrum', 'Spectrum On Demand'], ['US']),
    TV('directv', 'DIRECTV', 'https://www.directv.com', ['DirecTV', 'DIRECTV STREAM', 'DirecTV Stream', 'DIRECTV Satellite', 'AT&T TV', 'U-verse', 'AT&T U-verse'], ['US']),
    TV('dish', 'DISH', 'https://www.dish.com', ['DISH Network', 'Dish TV', 'DISH Anywhere'], ['US']),
    TV('fios', 'Verizon Fios TV', 'https://www.verizon.com/home/fios-tv/', ['Fios TV', 'Fios', 'Verizon Fios', 'Fios TV On Demand'], ['US']),
    TV('cox', 'Cox Contour', 'https://www.cox.com/residential/tv.html', ['Cox', 'Contour TV', 'Cox TV'], ['US']),
    TV('optimum', 'Optimum', 'https://www.optimum.net/tv/', ['Optimum TV', 'Altice', 'Suddenlink'], ['US']),
    TV('mediacom', 'Mediacom', 'https://mediacomcable.com', ['Mediacom Xtream'], ['US']),
    TV('astound', 'Astound', 'https://www.astound.com', ['Astound Broadband', 'RCN', 'Wave Broadband', 'Grande Communications'], ['US']),
    TV('wow', 'WOW! TV', 'https://www.wowway.com', ['WideOpenWest'], ['US']),
    TV('sky', 'Sky', 'https://www.sky.com', ['Sky TV', 'Sky Go', 'Sky Q', 'Sky Glass'], ['GB', 'IE', 'DE', 'IT', 'AT']),
    TV('virgin-media', 'Virgin Media', 'https://www.virginmedia.com/tv', ['Virgin TV', 'Virgin TV Go'], ['GB', 'IE']),
    TV('rogers', 'Rogers', 'https://www.rogers.com/tv', ['Rogers Ignite TV', 'Ignite TV'], ['CA']),
    TV('bell-fibe', 'Bell Fibe TV', 'https://www.bell.ca/Fibe-TV', ['Bell Fibe', 'Fibe TV'], ['CA']),
    TV('videotron', 'Vidéotron', 'https://videotron.com/en/tv', ['Videotron', 'Helix'], ['CA']),
    TV('foxtel', 'Foxtel', 'https://www.foxtel.com.au', ['Foxtel Go', 'Foxtel Now'], ['AU']),
  ] },
  { key: 'music', label: 'Music & audio', icon: '🎵', services: [
    S('spotify', 'Spotify', ['music', 'books'], 'https://open.spotify.com', 'https://open.spotify.com/search/{q}', ['Spotify Premium']),
    S('apple-music', 'Apple Music', ['music'], 'https://music.apple.com', 'https://music.apple.com/search?term={q}'),
    S('youtube-music', 'YouTube Music', ['music'], 'https://music.youtube.com', 'https://music.youtube.com/search?q={q}'),
    S('amazon-music', 'Amazon Music Unlimited', ['music'], 'https://music.amazon.com', 'https://music.amazon.com/search/{q}', ['Amazon Music']),
    S('tidal', 'Tidal', ['music'], 'https://tidal.com', 'https://listen.tidal.com/search?q={q}'),
    S('deezer', 'Deezer', ['music'], 'https://www.deezer.com', 'https://www.deezer.com/search/{q}'),
    S('qobuz', 'Qobuz', ['music'], 'https://www.qobuz.com'),
    S('soundcloud', 'SoundCloud Go+', ['music'], 'https://soundcloud.com', 'https://soundcloud.com/search?q={q}', ['SoundCloud']),
    S('pandora', 'Pandora', ['music'], 'https://www.pandora.com', '', ['Pandora Plus', 'Pandora Premium']),
    S('siriusxm', 'SiriusXM', ['music'], 'https://www.siriusxm.com', '', ['Sirius XM', 'Sirius']),
  ] },
  { key: 'books', label: 'Books & audiobooks', icon: '📚', services: [
    S('kindle-unlimited', 'Kindle Unlimited', ['books'], 'https://www.amazon.com/kindle-dbs/hz/subscribe/ku', 'https://www.amazon.com/s?k={q}+kindle+unlimited&i=digital-text', ['Kindle']),
    S('audible', 'Audible', ['books'], 'https://www.audible.com', 'https://www.audible.com/search?keywords={q}', ['Audible Plus', 'Audible Premium Plus']),
    S('everand', 'Everand', ['books'], 'https://www.everand.com', 'https://www.everand.com/search?query={q}', ['Scribd']),
    S('kobo-plus', 'Kobo Plus', ['books'], 'https://www.kobo.com/plus', 'https://www.kobo.com/search?query={q}', ['Kobo']),
    S('apple-books', 'Apple Books', ['books'], 'https://www.apple.com/apple-books/'),
    S('storytel', 'Storytel', ['books'], 'https://www.storytel.com'),
  ] },
  { key: 'library', label: 'Library card (free)', icon: '🏛️', services: [
    S('libby', 'Libby', ['books'], 'https://libbyapp.com', 'https://libbyapp.com/search/query-{q}/page-1', ['OverDrive', 'Libby (library)', 'Public library'], true),
    S('hoopla', 'Hoopla', ['books', 'music', 'movies', 'tv'], 'https://www.hoopladigital.com', '', ['Hoopla Digital'], true),
    S('kanopy', 'Kanopy', VIDEO, 'https://www.kanopy.com', '', [], true),
  ] },
  { key: 'free', label: 'Free with ads', icon: '📺', services: [
    S('tubi', 'Tubi', VIDEO, 'https://tubitv.com', 'https://tubitv.com/search/{q}', [], true),
    S('pluto', 'Pluto TV', VIDEO, 'https://pluto.tv', '', ['Pluto'], true),
    S('roku-channel', 'The Roku Channel', VIDEO, 'https://therokuchannel.roku.com', '', ['Roku Channel'], true),
  ] },
  { key: 'games', label: 'Gaming', icon: '🎮', services: [
    S('game-pass', 'Xbox Game Pass', ['games'], 'https://www.xbox.com/xbox-game-pass/games', '', ['Game Pass', 'PC Game Pass', 'Game Pass Ultimate']),
    S('ps-plus', 'PlayStation Plus', ['games'], 'https://www.playstation.com/ps-plus/', 'https://store.playstation.com/search/{q}', ['PS Plus', 'PlayStation Plus Extra', 'PlayStation Plus Premium']),
    S('switch-online', 'Nintendo Switch Online', ['games'], 'https://www.nintendo.com/switch/online/', '', ['Switch Online', 'NSO']),
    S('ea-play', 'EA Play', ['games'], 'https://www.ea.com/ea-play'),
    S('ubisoft-plus', 'Ubisoft+', ['games'], 'https://www.ubisoft.com/ubisoft-plus', '', ['Ubisoft Plus']),
    S('apple-arcade', 'Apple Arcade', ['games'], 'https://www.apple.com/apple-arcade/'),
    S('geforce-now', 'GeForce NOW', ['games'], 'https://www.nvidia.com/geforce-now/'),
    S('humble-choice', 'Humble Choice', ['games'], 'https://www.humblebundle.com/membership', '', ['Humble Bundle']),
  ] },
  { key: 'social', label: 'Social & creators', icon: '💬', services: [
    S('patreon', 'Patreon', ['social'], 'https://www.patreon.com', 'https://www.patreon.com/search?q={q}'),
    S('nebula', 'Nebula', ['social', 'tv'], 'https://nebula.tv', 'https://nebula.tv/search?q={q}'),
    S('substack', 'Substack', ['social', 'books'], 'https://substack.com', 'https://substack.com/search/{q}'),
    S('twitch', 'Twitch Turbo', ['social', 'streaming'], 'https://www.twitch.tv', 'https://www.twitch.tv/search?term={q}', ['Twitch']),
    S('discord-nitro', 'Discord Nitro', ['social'], 'https://discord.com/nitro', '', ['Discord']),
    S('x-premium', 'X Premium', ['social'], 'https://x.com', '', ['Twitter Blue', 'X']),
  ] },
];
/* Tile colour behind each logo, and an approximate starting price (US list price, monthly, as last known when this app was
   built). Prices change often: Settings → "Check prices & deals" asks Claude to look up current prices, deals and free
   trials for your country, and those replace these. Empty price = varies (per creator, per title) or not known. */
const BRAND = {
  netflix: ['#000000', 'from $7.99/mo'], 'prime-video': ['#00A8E1', 'from $8.99/mo'], 'disney-plus': ['#0B1A58', 'from $11.99/mo'],
  max: ['#002BE7', 'from $10.99/mo'], hulu: ['#0B0C0F', 'from $11.99/mo'], 'apple-tv': ['#000000', '$12.99/mo'],
  'paramount-plus': ['#FFFFFF', 'from $8.99/mo'], peacock: ['#000000', 'from $10.99/mo'], 'youtube-premium': ['#FFFFFF', '$13.99/mo'],
  'youtube-tv': ['#FFFFFF', '$82.99/mo'], crunchyroll: ['#F47521', 'from $7.99/mo'], criterion: ['#000000', '$10.99/mo'],
  mubi: ['#001489', '$14.99/mo'], shudder: ['#000000', '$8.99/mo'], 'amc-plus': ['#000000', 'from $6.99/mo'], starz: ['#000000', '$10.99/mo'],
  'mgm-plus': ['#000000', '$6.99/mo'], britbox: ['#13294B', '$8.99/mo'], acorn: ['#0E2A3F', '$8.99/mo'], fubo: ['#E9472E', 'from $84.99/mo'],
  sling: ['#1E2D5C', 'from $45.99/mo'],
  xfinity: ['#000000', 'by package'], spectrum: ['#0099D8', 'by package'], directv: ['#00A6D6', 'by package'], dish: ['#EC1944', 'by package'],
  fios: ['#000000', 'by package'], cox: ['#00AEEF', 'by package'], optimum: ['#0D1E3D', 'by package'], mediacom: ['#0055A5', 'by package'],
  astound: ['#2E2A84', 'by package'], wow: ['#E6007E', 'by package'], sky: ['#FFFFFF', 'by package'], 'virgin-media': ['#E10A0A', 'by package'],
  rogers: ['#DA291C', 'by package'], 'bell-fibe': ['#00549A', 'by package'], videotron: ['#FFD200', 'by package'], foxtel: ['#000000', 'by package'],
  spotify: ['#191414', 'from $11.99/mo'], 'apple-music': ['#FA2D48', '$10.99/mo'], 'youtube-music': ['#FFFFFF', '$10.99/mo'],
  'amazon-music': ['#0B1F33', 'from $10.99/mo'], tidal: ['#000000', '$10.99/mo'], deezer: ['#A238FF', '$11.99/mo'], qobuz: ['#000000', 'from $12.99/mo'],
  soundcloud: ['#FF5500', ''], pandora: ['#224099', 'from $4.99/mo'], siriusxm: ['#0000EB', ''],
  'kindle-unlimited': ['#232F3E', '$11.99/mo'], audible: ['#F7991C', ''], everand: ['#1E7B85', '$11.99/mo'], 'kobo-plus': ['#BF0000', 'from $7.99/mo'],
  'apple-books': ['#FF9500', 'per book'], storytel: ['#FF5C28', ''],
  libby: ['#3C2C70', 'Free'], hoopla: ['#0B3B5C', 'Free'], kanopy: ['#000000', 'Free'],
  tubi: ['#7408FF', 'Free'], pluto: ['#000000', 'Free'], 'roku-channel': ['#6F1AB1', 'Free'],
  'game-pass': ['#107C10', 'from $9.99/mo'], 'ps-plus': ['#00439C', 'from $9.99/mo'], 'switch-online': ['#E60012', '$3.99/mo'],
  'ea-play': ['#000000', '$5.99/mo'], 'ubisoft-plus': ['#0070FF', 'from $7.99/mo'], 'apple-arcade': ['#000000', '$6.99/mo'],
  'geforce-now': ['#000000', 'from $9.99/mo'], 'humble-choice': ['#CC2929', '$11.99/mo'],
  patreon: ['#000000', 'per creator'], nebula: ['#0B1C2C', ''], substack: ['#FF6719', 'per writer'], twitch: ['#9146FF', '$11.99/mo'],
  'discord-nitro': ['#5865F2', '$9.99/mo'], 'x-premium': ['#000000', ''],
};
MC.SERVICE_GROUPS.forEach(g => g.services.forEach(sv => { const [bg = '#1a1727', price = ''] = BRAND[sv.id] || []; sv.bg = bg; sv.basePrice = price; }));
MC.PRICES_NOTE = 'approximate US list prices';
MC.SERVICES = MC.SERVICE_GROUPS.flatMap(g => g.services);
MC.SERVICE = Object.fromEntries(MC.SERVICES.map(s => [s.id, s]));

/* Name from Claude ("Netflix (with ads)", "Max", "Disney Plus") → service. Longest alias wins, so "YouTube TV" isn't "YouTube". */
const normName = s => (s || '').toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z0-9]+/g, '');
const ALIASES = MC.SERVICES.flatMap(s => s.aliases.map(a => [normName(a), s])).sort((a, b) => b[0].length - a[0].length);
MC.matchService = name => {
  const n = normName(name);
  if (!n) return null;
  const hit = ALIASES.find(([a]) => n === a || (n.startsWith(a) && a.length >= 3));
  return hit ? hit[1] : null;
};

MC.mySubs = () => (MC.state.settings.subs || []).map(id => MC.SERVICE[id]).filter(Boolean);
MC.hasSub = id => (MC.state.settings.subs || []).includes(id);
/* The cable or satellite TV provider you ticked, if any: cable channels then count as yours. */
MC.myTV = () => MC.mySubs().find(sv => sv.cable) || null;
/* Settings lists providers for your country only (plus any you've ticked); everything else is worldwide. */
MC.serviceInRegion = sv => !sv.regions || sv.regions.includes(MC.region()) || MC.hasSub(sv.id);
/* Current price info for a service: the latest live check (Claude + web search) if there is one, else the built-in estimate. */
MC.servicePrice = id => {
  const live = MC.state.servicePrices?.items?.[id];
  const svc = MC.SERVICE[id];
  const est = svc?.basePrice || '';
  if (!live || !(live.price || live.deal || live.trial || live.plans)) return { price: est, plans: '', deal: '', trial: '', url: '', live: false };
  // A check that found a deal but not the price keeps the estimate, still shown as an estimate.
  return { ...live, price: live.price || est, live: !!live.price };
};
MC.serviceLink = (svc, title) => svc.search ? { url: svc.search.replace('{q}', encodeURIComponent(title)), label: `Search ${svc.name}` } : { url: svc.url, label: `Open ${svc.name}` };

/* Interests → "Services I use" option keys that are paid/free subscriptions here (used to pre-tick Settings once, and by the offline recommender). */
MC.SUB_FROM_PICK = {
  netflix: 'netflix', 'prime-video': 'prime-video', disney: 'disney-plus', 'hbo-max': 'max', hulu: 'hulu', 'apple-tv': 'apple-tv',
  paramount: 'paramount-plus', peacock: 'peacock', 'youtube-tv': 'youtube-tv', spotify: 'spotify', 'apple-music': 'apple-music',
  tidal: 'tidal', twitch: 'twitch', crunchyroll: 'crunchyroll', 'criterion-channel': 'criterion', mubi: 'mubi', shudder: 'shudder',
};
