/* MediaCopia — AI engine (Claude via the official Anthropic TypeScript/JS SDK).
   The SDK is loaded on demand from a CDN, so the app still opens straight from disk.
   Your API key stays in this browser (localStorage) and is sent only to api.anthropic.com. */
window.MC = window.MC || {};

MC.SDK_URLS = [
  'https://esm.sh/@anthropic-ai/sdk@1.1.0',
  'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm',
];

MC.MODELS = [
  { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5 (best picks)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5 (fastest, cheapest)' },
];

let sdkPromise = null;
MC.loadSDK = () => {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      let lastErr;
      for (const url of MC.SDK_URLS) {
        try { const mod = await import(url); return mod.default || mod.Anthropic; }
        catch (e) { lastErr = e; }
      }
      sdkPromise = null;
      throw new Error('Could not load the Anthropic SDK from the CDN. Check your internet connection. (' + (lastErr?.message || lastErr) + ')');
    })();
  }
  return sdkPromise;
};

MC.hasKey = () => !!(MC.state.settings.apiKey || '').trim();

/* ---------- profile → prompt ---------- */
MC.profileText = () => {
  const s = MC.state;
  const lines = [];
  const lvlName = v => ({ 1: 'likes', 2: 'loves', '-1': 'avoids' })[v];
  const typeLines = MC.TYPES.map(t => {
    const lv = MC.getTypeLevel(t.key);
    return lv ? `${t.label}: ${lvlName(lv)}` : null;
  }).filter(Boolean);
  if (typeLines.length) lines.push('Media types — ' + typeLines.join('; '));

  const byLevel = { 2: [], 1: [], '-1': [] };
  Object.entries(s.interests.picks).forEach(([key, v]) => {
    const [type, group, opt] = key.split('.');
    const label = type === 'mood' ? `${MC.optionLabel(null, 'mood', group)} (mood)` : `${MC.optionLabel(type, group, opt)} (${MC.TYPE[type]?.label} ${group})`;
    byLevel[v]?.push(label);
  });
  Object.entries(s.interests.custom || {}).forEach(([cat, list]) => list.forEach(c =>
    byLevel[c.v]?.push(`${c.label} (${cat === 'mood' ? 'mood/theme' : MC.TYPE[cat]?.label}, in their own words)`)));
  if (byLevel[2].length) lines.push('Loves: ' + byLevel[2].join(', '));
  if (byLevel[1].length) lines.push('Likes: ' + byLevel[1].join(', '));
  if (byLevel['-1'].length) lines.push('Avoids: ' + byLevel['-1'].join(', '));
  lines.push(`Region for availability: ${MC.region()}`);
  const services = [...new Set([
    ...Object.entries(s.interests.picks).filter(([k, v]) => v > 0 && /^(streaming\.service|games\.platform|social\.platform)\./.test(k))
      .map(([k]) => MC.optionLabel(...k.split('.'))),
    ...s.library.filter(i => i.type === 'streaming' && i.status === 'active').map(i => i.title),
  ])];
  const subs = MC.mySubs().map(sv => sv.name);
  if (subs.length) lines.push(`Subscriptions they have (check every pick against these first; in "where" use exactly these names): ${subs.join(', ')}`);
  const tv = MC.myTV();
  if (tv) lines.push(`TV provider: ${tv.name} (cable/satellite), so cable channels, their on-demand libraries and network apps with a TV-provider sign-in are included for them; list those with access "cable".`);
  const other = services.filter(n => !subs.some(x => MC.matchService(x)?.id === MC.matchService(n)?.id));
  if (other.length) lines.push('Other services and platforms they use: ' + other.join(', '));
  if (s.interests.about.trim()) lines.push('In their own words: ' + s.interests.about.trim());
  if (s.interests.creators.trim()) lines.push('Favourite creators to track: ' + s.interests.creators.trim());

  if (s.library.length) {
    lines.push('', 'Library (type | title | creator | status | rating):');
    s.library.slice(0, 200).forEach(i => lines.push(`- ${i.type} | ${i.title} | ${i.creator || '?'} | ${MC.TYPE[i.type].status[i.status]} | ${i.rating ? i.rating + '/5' : '-'}`));
  }
  if (s.dismissed.length) lines.push('', 'Said "not for me" to (normalised titles): ' + s.dismissed.slice(-100).join(', '));
  const recent = s.asks.slice(0, 5).map(a => a.query);
  if (recent.length) lines.push('', 'Recent requests: ' + recent.map(q => `"${q}"`).join('; '));
  return lines.join('\n') || 'No profile yet — the user has not filled in interests or a library.';
};

MC.tagVocabulary = () => MC.TYPES.map(t =>
  `${t.key}: ${(MC.TAXONOMY[t.key] || []).flatMap(g => g.options.map(o => o.key)).join(', ')}`).join('\n') +
  `\nmoods (any type): ${MC.MOODS.map(o => o.key).join(', ')}`;

const TYPE_ENUM = MC.TYPES.map(t => t.key);

/* How to watch / listen / read / play it: specific services, stores, sites and channels. */
const WHERE_SCHEMA = {
  type: 'array',
  description: 'Every current way to get it in the user\'s region: streaming services, stores, sites, channels, platforms, libraries, theaters, radio. Services the user already has go first. Empty array only if it is genuinely unavailable.',
  items: {
    type: 'object', additionalProperties: false, required: ['name', 'access', 'url', 'price'],
    properties: {
      name: { type: 'string', description: 'Service, store, site or channel, e.g. "Netflix", "Spotify", "Steam", "Libby", "BBC iPlayer", "YouTube (official channel)", "In theaters".' },
      access: { type: 'string', enum: ['subscription', 'free', 'rent', 'buy', 'library', 'theaters', 'broadcast', 'cable', 'other'], description: '"broadcast": free-to-air TV or radio. "cable": a cable or satellite channel (e.g. FX, AMC, TNT, Sky Atlantic), live, on demand, or in the network\'s app with a TV-provider sign-in; name the channel, or the provider if it is the provider\'s own on-demand service (e.g. "Xfinity On Demand").' },
      url: { type: 'string', description: 'Official page for this title on that service if known, otherwise empty string. Never guess a URL.' },
      price: { type: 'string', description: 'Price to rent or buy it there (e.g. "$3.99"), or a note like "4K" / "with ads" for subscriptions; empty string if unknown.' },
    },
  },
};

const TRAILER = { type: 'string', description: 'Link to the official trailer or a representative clip (YouTube watch URL preferred): a film/show/game trailer, a music video, a book trailer, or a sample video from a creator. Only a link you actually found or are certain of; otherwise empty string.' };

const RECS_TOOL = {
  name: 'present_recommendations',
  description: 'Show the final recommendations to the user in the MediaCopia app. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['intro', 'items'],
    properties: {
      intro: { type: 'string', description: 'One or two friendly sentences framing the picks, or a direct answer if the user asked a question.' },
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['title', 'type', 'creator', 'year', 'why', 'tags', 'release_date', 'where', 'trailer_url'],
          properties: {
            title: { type: 'string' },
            type: { type: 'string', enum: TYPE_ENUM },
            creator: { type: 'string', description: 'Author, artist, director, studio, network, provider or handle.' },
            year: { type: 'string', description: 'Release year, or empty string.' },
            why: { type: 'string', description: 'One sentence tying it to this user\'s tastes.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Keys from the tag vocabulary for this type, plus mood keys.' },
            release_date: { type: 'string', description: 'YYYY-MM-DD if it is not out yet (upcoming), otherwise empty string.' },
            where: WHERE_SCHEMA,
            trailer_url: TRAILER,
          },
        },
      },
    },
  },
};

const DROPS_TOOL = {
  name: 'present_drops',
  description: 'Add upcoming release dates ("drops") to the user\'s MediaCopia calendar. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'items'],
    properties: {
      summary: { type: 'string', description: 'One sentence summary of what you found.' },
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['title', 'type', 'creator', 'date', 'date_confidence', 'why', 'source_url', 'where', 'trailer_url'],
          properties: {
            title: { type: 'string' },
            type: { type: 'string', enum: TYPE_ENUM },
            creator: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD. If only the month is known use the 1st and mark estimated.' },
            date_confidence: { type: 'string', enum: ['confirmed', 'estimated'] },
            why: { type: 'string', description: 'Why this user would care, in one sentence.' },
            source_url: { type: 'string', description: 'URL where you found the date, or empty string.' },
            where: WHERE_SCHEMA,
            trailer_url: TRAILER,
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the recommendation engine inside MediaCopia, a personal app where one person organizes their books, music, movies, games, TV, streaming services and social media, gets recommendations, and tracks upcoming releases on a calendar.

How to work:
- Ground every pick in the user's profile: their checklist interests (loves > likes; never suggest things in an "avoids" area unless they explicitly ask), their library ratings, their own words and their request.
- Don't recommend anything already in their library or that they marked "not for me".
- Prefer a mix of well-known and less obvious picks. Be specific — real titles with correct creators and years. Never invent a title or a release date.
- When the request involves anything new, current, trending, upcoming or time-sensitive, use web search to check facts and dates. For timeless picks you can answer from knowledge.
- For every pick and every drop, fill "where" with how to watch, listen, read, play or follow it right now in the user's region: name the specific streaming services, stores, sites, apps, channels, libraries or theaters, and say whether each is subscription, free, rent, buy, library, theaters, broadcast or cable (a cable or satellite channel, live or on demand). List the user's subscriptions first, named exactly as in their profile, and only mark one "subscription" or "free" if the title is actually included there right now (not just rentable on that store). If it isn't on any of their subscriptions, still give the best other options. Use web search to check current availability whenever it may have changed (streaming catalogs change often). For upcoming drops, say where it will be released.
- Fill "trailer_url" with the official trailer (or teaser, music video, gameplay reveal or representative clip) when one exists, as a YouTube link if possible. The app plays it when the user presses play, so only give a link you found in search results or are sure of; never guess a video ID. Empty string if there isn't one.
- Finish by calling the provided tool exactly once with your results. Keep "why" lines short and personal.
- For tags, use only keys from this vocabulary (type-specific keys plus mood keys):
TAGS_PLACEHOLDER`;

/* ---------- usage meter (Settings → AI usage on this device) ----------
   Every Claude call adds up the tokens and web searches its responses report (response.usage), prices them at Anthropic's
   list prices, and logs one entry per action on this device only (it isn't synced). It's there to measure what each
   feature really costs before pricing a plan. List prices per million tokens, Claude API, as of November 2026; cache
   writes are 1.25× input (5-minute cache); web searches $10 per 1,000. Fast mode's surcharge isn't included: those calls
   are flagged instead. */
MC.PRICE_PER_MTOK = {
  'claude-opus-5-5':   { in: 4,    out: 20,   read: 0.20 },
  'claude-sonnet-5-5': { in: 2,    out: 10,   read: 0.20 },
  'claude-haiku-5-5':  { in: 0.10, out: 0.50, read: 0.01 },
};
MC.PRICES_AS_OF = 'November 2026';
const SEARCH_PRICE = 10 / 1000;
const priceFor = model => MC.PRICE_PER_MTOK[Object.keys(MC.PRICE_PER_MTOK).find(k => (model || '').startsWith(k))] || null;
function recordUsage(entry) {
  const u = MC.state.usage ||= { since: new Date().toISOString(), log: [] };
  u.log.push(entry);
  if (u.log.length > 2000) u.log.splice(0, u.log.length - 2000);
  MC.save();
}

/* ---------- core call ---------- */
/* onPartial(snapshot) is called with the tool input as it is written, so results can be shown before Claude finishes. */
/* Speed options (used by Ask): model overrides the Settings model; effort 'low' thinks less; basicSearch uses the plain web search
   (no code-run filtering step, a few seconds faster per search); fast asks for Opus fast mode where the account has it. */
async function runWithTool({ userText, tool, onStatus, onPartial, maxSearches = 5, system: customSystem = '', model: modelOverride = '', effort = 'medium', basicSearch = false, fast = false, meter = 'Other' }) {
  if (!MC.hasKey()) throw new Error('Add your Anthropic API key in Settings to use AI recommendations.');
  onStatus?.('Connecting to Claude…');
  const Anthropic = await MC.loadSDK();
  const client = new Anthropic({ apiKey: MC.state.settings.apiKey.trim(), dangerouslyAllowBrowser: true });
  const model = modelOverride || MC.state.settings.model || 'claude-opus-5-5';
  const isHaiku = model.startsWith('claude-haiku');
  const search = !MC.state.settings.webSearch ? null : isHaiku || basicSearch
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches };
  // Eager input streaming sends the tool input as it is generated instead of in one burst at the end.
  let useEager = !!onPartial;
  const system = (customSystem || SYSTEM.replace('TAGS_PLACEHOLDER', MC.tagVocabulary())) + `\n\nToday's date is ${MC.today()}.`;
  const messages = [{ role: 'user', content: userText }];
  let useFallbacks = !isHaiku;
  let useFast = fast && /^claude-opus-5/.test(model);
  const sources = new Map();
  let usedWeb = false;
  // Usage meter: totals across every response this action needed.
  const spend = { calls: 0, in: 0, out: 0, cacheWrite: 0, cacheRead: 0, searches: 0, cost: 0, unpriced: false, models: new Set(), fast: false };
  const started = Date.now();
  const tally = msg => {
    const u = msg.usage || {}, pr = priceFor(msg.model || model);
    const t = { in: u.input_tokens || 0, out: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, s: u.server_tool_use?.web_search_requests || 0 };
    spend.calls++; spend.in += t.in; spend.out += t.out; spend.cacheWrite += t.cw; spend.cacheRead += t.cr; spend.searches += t.s;
    spend.models.add(msg.model || model); if (useFast) spend.fast = true;
    if (pr) spend.cost += (t.in * pr.in + t.cw * pr.in * 1.25 + t.cr * pr.read + t.out * pr.out) / 1e6 + t.s * SEARCH_PRICE;
    else spend.unpriced = true;
  };
  const record = ok => { if (spend.calls) recordUsage({ at: new Date().toISOString(), action: meter, ok, ms: Date.now() - started,
    models: [...spend.models], fast: spend.fast, unpriced: spend.unpriced, calls: spend.calls, in: spend.in, out: spend.out,
    cacheWrite: spend.cacheWrite, cacheRead: spend.cacheRead, searches: spend.searches, cost: +spend.cost.toFixed(5) }); };

  const callOnce = async () => {
    const tools = [useEager ? { ...tool, eager_input_streaming: true } : tool];
    if (search) tools.unshift(search);
    const params = {
      model, max_tokens: 32000, system, tools, messages,
      output_config: { effort },
    };
    const betas = [];
    if (useFallbacks) { betas.push('server-side-fallback-2026-07-01'); params.fallbacks = 'default'; }
    if (useFast) { betas.push('fast-mode-2026-02-01'); params.speed = 'fast'; }
    if (betas.length) params.betas = betas;
    const stream = client.beta.messages.stream(params);
    let inTool = false;
    stream.on('streamEvent', ev => {
      if (ev.type === 'content_block_stop') { inTool = false; return; }
      if (ev.type !== 'content_block_start') return;
      const t = ev.content_block?.type;
      if (t === 'thinking') onStatus?.('Thinking about your tastes…');
      else if (t === 'server_tool_use') { usedWeb = true; onStatus?.('Searching the web…'); }
      else if (t === 'web_search_tool_result') onStatus?.('Reading search results…');
      else if (t === 'tool_use') { inTool = ev.content_block.name === tool.name; onStatus?.('Putting your picks together…'); }
    });
    if (onPartial) stream.on('inputJson', (_, snap) => {
      if (inTool && snap && typeof snap === 'object') { try { onPartial(snap); } catch (e) { console.warn('MediaCopia: partial results', e); } }
    });
    return stream.finalMessage();
  };
  const call = async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await callOnce(); }
      catch (e) {
        const msg = e?.message || '';
        // Retry without features this account/model rejects: server-side fallbacks, eager input streaming.
        if (attempt < 3 && useFallbacks && e?.status === 400 && /fallback/i.test(msg)) { useFallbacks = false; continue; }
        if (attempt < 3 && useEager && e?.status === 400 && /eager/i.test(msg)) { useEager = false; continue; }
        if (attempt < 3 && useFast && (e?.status === 400 || e?.status === 403 || e?.status === 429) && /fast|speed/i.test(msg)) { useFast = false; continue; }
        // Streamed tool input that isn't valid JSON: ask again with the input buffered and checked by the API.
        if (attempt < 3 && useEager && !(e instanceof Anthropic.APIError) && /json/i.test(msg)) { useEager = false; continue; }
        throw MC.friendlyError(e, Anthropic);
      }
    }
  };

  let finished = false;
  try {
  for (let turn = 0; turn < 5; turn++) {
    const msg = await call();
    tally(msg);
    msg.content.forEach(b => {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach(r => r.url && sources.set(r.url, r.title || r.url));
      }
    });
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing it.');
    if (msg.stop_reason === 'max_tokens') throw new Error('The answer was too long. Try a narrower request.');
    const use = msg.content.find(b => b.type === 'tool_use' && b.name === tool.name);
    if (use) {
      // Streamed input isn't checked by the API, so check its shape here.
      // Every array field in the tool's schema (items, candidates, where…) must be an array.
      const arrays = Object.entries(tool.input_schema.properties || {}).filter(([, v]) => v.type === 'array').map(([k]) => k);
      if (use.input && typeof use.input === 'object' && arrays.every(k => Array.isArray(use.input[k]))) {
        finished = true;
        return { input: use.input, usedWeb, sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) };
      }
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `The input was not valid: ${arrays.map(k => `"${k}"`).join(', ')} must be arrays. Call ${tool.name} again with valid input.` }] });
      useEager = false;
      continue;
    }
    if (msg.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: msg.content }); onStatus?.('Still searching…'); continue; }
    // No tool call: nudge once, then fall back to plain text.
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (turn === 0) {
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: `Please call the ${tool.name} tool now with your results.` });
      continue;
    }
    finished = true;
    return { input: { intro: text || 'No results.', summary: text, items: [] }, usedWeb, sources: [] };
  }
  throw new Error('Claude took too many steps. Try again with a simpler request.');
  } finally { record(finished); }
}

MC.runWithTool = runWithTool;   // exposed for timing tests in the console

MC.friendlyError = (e, Anthropic) => {
  if (Anthropic && e instanceof Anthropic.AuthenticationError) return new Error('Your API key was rejected. Check it in Settings.');
  if (Anthropic && e instanceof Anthropic.PermissionDeniedError) return new Error('This API key is not allowed to use that model or feature.');
  if (Anthropic && e instanceof Anthropic.RateLimitError) return new Error('Rate limited by the API. Wait a minute and try again.');
  if (Anthropic && e instanceof Anthropic.NotFoundError) return new Error('Model not found for this key. Pick another model in Settings.');
  if (Anthropic && e instanceof Anthropic.APIConnectionError) return new Error('Could not reach api.anthropic.com. Check your connection.');
  if (Anthropic && e instanceof Anthropic.APIError) return new Error(`API error ${e.status || ''}: ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
};

/* ---------- public: how to watch one title ---------- */
const WATCH_TOOL = {
  name: 'present_where_to_watch',
  description: 'Show the user every current way to watch this title. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'where'],
    properties: {
      summary: { type: 'string', description: 'One or two sentences: the best way for this user to watch it right now, naming their own subscriptions first if it is on one; or, if it is not out yet, when and where it will be available.' },
      where: WHERE_SCHEMA,
    },
  },
};
MC.aiWhereToWatch = async (rec, { onStatus } = {}) => {
  const t = MC.TYPE[rec.type];
  const userText = `My MediaCopia profile:\n${MC.profileText()}\n\n` +
    `Where can I watch "${rec.title}" (${t?.label || rec.type}${rec.year ? ', ' + rec.year : ''}${rec.creator ? ', ' + rec.creator : ''}) in ${MC.region()} right now? ` +
    `List every option: subscription streamers, free with ads, rent or buy (with prices), free broadcast TV, cable or satellite channels (live, on demand, or in the network's app with a TV-provider sign-in), library services such as Kanopy or Hoopla, and theaters if it is in cinemas. ` +
    `Put my own subscriptions first and only mark one "subscription" or "free" if this title is actually included there now. If it is not out yet, say when and where it will be released. ` +
    `Keep each entry short: "name" is where you watch it, e.g. "Paramount+" or "Prime Video (Paramount+ channel)"; "price" is just the price or plan, e.g. "$8.99/mo", "$3.99", "with ads" (no other notes). One entry per place. A paid channel bought inside another service (e.g. Paramount+ through Prime Video) is access "other" with its price, never "subscription".`;
  const { input, sources } = await runWithTool({ userText, tool: WATCH_TOOL, onStatus, ...MC.ASK_SPEED, maxSearches: 2, meter: 'How to watch' });
  return { summary: MC.stripCites(input.summary), where: (input.where || []).filter(w => w && w.name), sources, at: new Date().toISOString() };
};

/* ---------- public: recommendations ---------- */
/* Ask-bar speed settings, modelled on attap.ai's chat: answer first, little thinking, a quick plain web search, and only the titles the
   answer needs. Recommend (no typed question) keeps the full 6–10 picks. */
// Timed on "will there be a new season of Mobland?": 58s before; Opus 5.5 low effort 11s; with fast mode 7.5s; Sonnet 5.5 9s; Haiku 5.5 12s.
MC.ASK_SPEED = { effort: 'low', basicSearch: true, maxSearches: 3, fast: true };
// Recommend: the same speed settings. Timed on ★ Recommend (10 picks): medium effort 17.7s (first pick 13.1s);
// low effort 7.2s (first pick 2.6s), with picks of similar quality. Claude still searches when it needs current facts.
MC.RECOMMEND_SPEED = { effort: 'low', basicSearch: true, maxSearches: 2, fast: true };
/* Claude sometimes leaves <cite …> markup from web search in its text. */
MC.stripCites = t => typeof t === 'string' ? t.replace(/<\/?cite[^>]*>/g, '') : '';
MC.aiRecommend = async (query, { type = 'all', onStatus, onPartial, context = '', quick = false, tune = null } = {}) => {
  const focus = type && type !== 'all' ? `Only recommend ${MC.TYPE[type].label}.` : 'Recommend across whichever media types fit best.';
  const ask = quick
    ? `If this is a question, answer it directly and concretely in "intro" (2–4 sentences: the facts, dates and where to watch, read or listen), and include only the titles your answer is about, usually 1–3. If it asks for suggestions, give 4–6 picks. ${focus} Search the web only when the answer depends on recent news, dates or availability; one or two searches are usually enough.`
    : `${focus} Give 6–10 picks.`;
  const userText = `My MediaCopia profile:\n${MC.profileText()}\n\n${context ? context + '\n' : ''}My request: ${query || 'Surprise me with great picks for me right now.'}\n\n${ask}`;
  const speed = { ...(quick ? MC.ASK_SPEED : MC.RECOMMEND_SPEED), ...(tune || {}) };
  const { input, usedWeb, sources } = await runWithTool({ userText, tool: RECS_TOOL, onStatus, onPartial, ...speed, meter: quick ? 'Ask' : 'Recommend' });
  const items = (input.items || []).filter(i => i && typeof i.title === 'string' && i.title && MC.TYPE[i.type])
    .map(i => ({ ...i, why: MC.stripCites(i.why), where: Array.isArray(i.where) ? i.where : [], tags: Array.isArray(i.tags) ? i.tags : [], trailer: i.trailer_url || '', id: MC.uid() }));
  const saved = { id: MC.uid(), query: query || 'Surprise me', type, at: new Date().toISOString(), intro: MC.stripCites(input.intro), items, usedWeb, sources };
  MC.update(s => { s.asks.unshift(saved); s.asks = s.asks.slice(0, 40); });
  return saved;
};

/* ---------- public: upcoming drops ---------- */
MC.aiFindDrops = async ({ months = 3, onStatus } = {}) => {
  const end = new Date(); end.setMonth(end.getMonth() + months);
  const existing = MC.state.drops.filter(d => d.date >= MC.today()).map(d => `${d.title} (${d.date})`).slice(0, 60);
  const userText = `My MediaCopia profile:\n${MC.profileText()}\n\n` +
    `Find upcoming releases ("drops") between ${MC.today()} and ${MC.isoDate(end)} that I would care about: new books, albums, movies (theatrical or streaming), games, TV seasons/premieres, streaming launches, and notable events from creators and franchises I follow. ` +
    `Prioritise my favourite creators and the things in my library (sequels, new seasons, new albums). Search the web to confirm dates. Aim for 8–15 items with real dates.` +
    (existing.length ? `\nAlready on my calendar (skip these): ${existing.join('; ')}` : '');
  const { input, sources } = await runWithTool({ userText, tool: DROPS_TOOL, onStatus, maxSearches: 8, meter: 'Find upcoming drops' });
  const found = cleanDrops(input.items);
  const added = [];
  found.forEach(d => {
    const before = MC.state.drops.length;
    const drop = MC.addDrop({ ...d, origin: 'ai' });
    if (MC.state.drops.length > before) added.push(drop);
  });
  return { summary: input.summary || '', found: found.length, added, sources };
};

/* Model output → drop objects: known type, real future date. */
const cleanDrops = MC.cleanDrops = items => (items || [])
  .filter(d => d && typeof d.title === 'string' && MC.TYPE[d.type] && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= MC.today())
  .map(d => ({ type: d.type, title: d.title, creator: d.creator, date: d.date, dateConfidence: d.date_confidence, notes: MC.stripCites(d.why), link: d.source_url, where: d.where || [], trailer: d.trailer_url || '' }))
  .sort((a, b) => a.date.localeCompare(b.date));

/* ---------- public: answer a calendar question ("when is the next Zelda?") without adding anything ---------- */
MC.aiSearchDrops = async (query, { type = 'all', onStatus, onPartial, quick = false } = {}) => {
  const end = new Date(); end.setMonth(end.getMonth() + 18);
  const focus = type && type !== 'all' ? ` Only include ${MC.TYPE[type].label}.` : '';
  const userText = `My MediaCopia profile:\n${MC.profileText()}\n\n` +
    `I'm looking at my release calendar and want to know: ${query}\n\n` +
    `Answer with upcoming releases, premieres, launches or events between ${MC.today()} and ${MC.isoDate(end)} that match this request.${focus} ` +
    `Search the web to confirm dates. Use the summary to answer my question directly in one or two sentences. ` +
    `Include only items with a real or well-sourced estimated date; return an empty list if nothing upcoming matches.`;
  const { input, sources } = await runWithTool({ userText, tool: DROPS_TOOL, onStatus, onPartial, maxSearches: 6, ...(quick ? MC.ASK_SPEED : MC.RECOMMEND_SPEED), meter: quick ? 'Ask (calendar)' : 'Recommend (calendar)' });
  return { summary: MC.stripCites(input.summary), items: cleanDrops(input.items), sources };
};

/* ---------- subscription prices, deals and free trials (Settings) ---------- */
const PRICES_TOOL = {
  name: 'present_service_prices',
  description: 'Show the current prices, deals and free trials for the listed services. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'items'],
    properties: {
      summary: { type: 'string', description: 'One sentence: what you checked and any standout deals.' },
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'price', 'plans', 'deal', 'trial', 'url'],
          properties: {
            id: { type: 'string', description: 'The service id exactly as given in the list.' },
            price: { type: 'string', description: 'Cheapest regular monthly price in local currency, short, e.g. "from $7.99/mo", or "Free", or "per title". Empty if you could not confirm it.' },
            plans: { type: 'string', description: 'Main plans and prices, short, e.g. "Standard with ads $7.99 · Standard $17.99 · Premium $24.99". Empty if unknown.' },
            deal: { type: 'string', description: 'A current discount or promotion with its end date if known, e.g. "Black Friday: $2.99/mo for 6 months, ends Dec 2". Empty if none found.' },
            trial: { type: 'string', description: 'Current free trial, e.g. "7-day free trial" or "1 month free for new members". Empty if none.' },
            url: { type: 'string', description: 'Official page for the deal or plans, if you found it. Never guess.' },
          },
        },
      },
    },
  },
};
const PRICES_SYSTEM = `You check current subscription prices for MediaCopia, a personal media app. For each service listed, use web search to find its current regular monthly price in the user's country (cheapest plan, plus the main plans), any discount or promotion running right now (with its end date), and any free trial for new subscribers. Prefer official pricing pages and reputable news from the last few months. Report only what you found or are confident is current: leave a field empty rather than guess. Prices in the user's local currency. Keep every field short.`;

/* ids: service ids to check, most important first. Checked in small batches (one web-search budget each, a few
   at a time), so every service gets searched; results are saved after each batch into state.servicePrices. */
const PRICE_BATCH = 6, PRICE_PARALLEL = 3;
MC.aiCheckPrices = async ({ ids, onStatus } = {}) => {
  const list = (ids || []).map(id => MC.SERVICE[id]).filter(Boolean);
  if (!list.length) return { summary: 'Nothing to check.', count: 0 };
  const region = MC.region();
  const batches = [];
  for (let i = 0; i < list.length; i += PRICE_BATCH) batches.push(list.slice(i, i + PRICE_BATCH));
  let done = 0, next = 0;
  const found = [], failed = [], deals = [];
  const progress = () => onStatus?.(`Checked ${Math.min(done, list.length)} of ${list.length} services…`);
  const runBatch = async batch => {
    const userText = `Country: ${region}.\nCheck these services (id: name):\n${batch.map(sv => `${sv.id}: ${sv.name}`).join('\n')}\n\nReturn one item per service, using the ids above.`;
    try {
      const { input, sources } = await runWithTool({ userText, tool: PRICES_TOOL, maxSearches: batch.length + 2, system: PRICES_SYSTEM, meter: 'Price check (per batch of 6)' });
      const at = new Date().toISOString();
      const got = (input.items || []).filter(i => batch.some(sv => sv.id === i.id) && (i.price || i.deal || i.trial || i.plans));
      MC.update(s => {
        const items = s.servicePrices?.region === region ? { ...s.servicePrices.items } : {};
        // Drop empty answers left by older checks so they don't hide the built-in prices.
        Object.keys(items).forEach(k => { const v = items[k]; if (!(v.price || v.deal || v.trial || v.plans)) delete items[k]; });
        got.forEach(i => { items[i.id] = { price: i.price || '', plans: i.plans || '', deal: i.deal || '', trial: i.trial || '', url: MC.safeUrl(i.url) ? i.url : '', at }; });
        const allSources = [...(s.servicePrices?.region === region ? s.servicePrices.sources || [] : []), ...(sources || [])];
        s.servicePrices = { at, region, items, sources: allSources.filter((x, n, a) => a.findIndex(y => y.url === x.url) === n).slice(0, 60) };
      });
      found.push(...got);
      got.forEach(i => { if (i.deal || i.trial) deals.push(MC.SERVICE[i.id].name); });
    } catch (e) {
      failed.push({ batch, error: e.message || String(e) });
    }
    done += batch.length; progress();
  };
  onStatus?.(`Checking ${list.length} services in ${batches.length} batches…`);
  await Promise.all(Array.from({ length: Math.min(PRICE_PARALLEL, batches.length) }, async () => {
    while (next < batches.length) await runBatch(batches[next++]);
  }));
  if (failed.length === batches.length) throw new Error(failed[0].error);
  const priced = found.filter(i => i.price).length;
  const parts = [`Checked ${list.length} services: found current prices for ${priced}.`];
  parts.push(deals.length ? `Deals or free trials: ${deals.join(', ')}.` : 'No current deals or free trials found.');
  if (list.length - found.length > 0) parts.push(`${list.length - found.length} couldn't be confirmed and keep the approximate price.`);
  if (failed.length) parts.push(`${failed.reduce((n, f) => n + f.batch.length, 0)} weren't checked because of an error (${failed[0].error}). Try again for those.`);
  return { summary: parts.join(' '), count: found.length };
};

/* ---------- trailers (player "✨ Find with Claude", Calendar "🎬 Check trailers") ---------- */
const TRAILER_FIND_TOOL = {
  name: 'present_trailers',
  description: 'Show the trailer links you found. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['note', 'candidates'],
    properties: {
      note: { type: 'string', description: 'One short sentence on what you found, e.g. "No Series 7 trailer yet, so here is the Series 6 trailer." Empty if the first candidate is simply the official trailer.' },
      candidates: {
        type: 'array',
        description: 'Up to 5 links, best first. Empty if you found nothing real.',
        items: {
          type: 'object', additionalProperties: false, required: ['url', 'label'],
          properties: {
            url: { type: 'string', description: 'The video itself: a youtube.com/watch or youtu.be link, a Vimeo link, or the official page that plays it (BBC, Apple TV, IMDb, the studio or network). Only links you saw in search results.' },
            label: { type: 'string', description: 'Short, e.g. "Official trailer", "Teaser", "Series 6 trailer (previous series)", "First-look clip".' },
          },
        },
      },
    },
  },
};
const TRAILER_SYSTEM = `You find official trailers for MediaCopia, a personal media app. Use web search to find video links for the title you're given.
- Prefer the official trailer or teaser for this exact film, season, series or edition, from an official channel: the studio, network, broadcaster, streamer, publisher or developer.
- Give YouTube links whenever an official upload exists there (youtube.com/watch?v=… or youtu.be/…), plus the official page as a backup when you have it.
- If no trailer exists yet for this exact season or edition, say so in the note and give the most recent previous one, labelled clearly (e.g. "Series 6 trailer (previous series)"), or an official first-look clip.
- Never give fan-made, "concept", "everything we know" or compilation videos, re-uploads by unofficial channels, or links you did not see in your search results. An empty list is better than a guess.`;
/* Returns { clip, alts, note, found } after checking every link; also saved so the player and cards use it. */
MC.aiFindTrailer = async (rec, { onStatus } = {}) => {
  const t = MC.TYPE[rec.type];
  const userText = `Find the trailer for: ${rec.title}${rec.creator ? ` (${rec.creator})` : ''}${t ? `, ${t.noun}` : ''}${rec.date ? `, releasing ${rec.date}` : rec.year ? `, ${rec.year}` : ''}.`;
  const { input } = await runWithTool({ userText, tool: TRAILER_FIND_TOOL, onStatus, maxSearches: 6, system: TRAILER_SYSTEM, meter: 'Trailer search' });
  const list = (input.candidates || []).map(c => { const clip = MC.clipFromUrl(c.url); return clip ? { ...clip, src: `${c.label || 'Trailer'} · found by Claude`, label: c.label || '' } : null; }).filter(Boolean);
  const best = await MC.pickClip(list);
  // keep only links that checked out, so a dead one never comes back
  const good = [];
  for (const c of list) if (await MC.vetClip(c)) good.push(c);
  MC.saveAiClips(rec, good);
  return { clip: best, note: input.note || '', found: good.length };
};
