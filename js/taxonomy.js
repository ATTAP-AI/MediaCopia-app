/* MediaCopia — media types and the interest taxonomy (checklist). */
window.MC = window.MC || {};

MC.TYPES = [
  { key: 'books',     label: 'Books',        icon: '📚', color: '#d97706', noun: 'book',
    status: { want: 'Want to read', active: 'Reading', done: 'Read', dropped: 'Abandoned' },
    creatorLabel: 'Author', placeLabel: 'Format / where' },
  { key: 'music',     label: 'Music',        icon: '🎵', color: '#db2777', noun: 'album or artist',
    status: { want: 'Want to hear', active: 'On repeat', done: 'Heard', dropped: 'Not for me' },
    creatorLabel: 'Artist', placeLabel: 'Service / format' },
  { key: 'movies',    label: 'Movies',       icon: '🎬', color: '#dc2626', noun: 'movie',
    status: { want: 'Watchlist', active: 'Watching', done: 'Watched', dropped: 'Gave up' },
    creatorLabel: 'Director', placeLabel: 'Where to watch' },
  { key: 'games',     label: 'Gaming',       icon: '🎮', color: '#7c3aed', noun: 'game',
    status: { want: 'Backlog', active: 'Playing', done: 'Completed', dropped: 'Shelved' },
    creatorLabel: 'Studio', placeLabel: 'Platform' },
  { key: 'tv',        label: 'TV',           icon: '📺', color: '#2563eb', noun: 'show',
    status: { want: 'Watchlist', active: 'Watching', done: 'Watched', dropped: 'Dropped' },
    creatorLabel: 'Creator / network', placeLabel: 'Where to watch' },
  { key: 'streaming', label: 'Streaming',    icon: '📡', color: '#0891b2', noun: 'service or channel',
    status: { want: 'Considering', active: 'Subscribed', done: 'Tried', dropped: 'Cancelled' },
    creatorLabel: 'Provider', placeLabel: 'Plan / cost' },
  { key: 'social',    label: 'Social Media', icon: '💬', color: '#059669', noun: 'account or community',
    status: { want: 'Interested', active: 'Following', done: 'Followed', dropped: 'Unfollowed' },
    creatorLabel: 'Handle / owner', placeLabel: 'Platform' },
];
MC.TYPE = Object.fromEntries(MC.TYPES.map(t => [t.key, t]));
MC.STATUSES = ['want', 'active', 'done', 'dropped'];

/* Interest levels for each checklist option. Click cycles through them. */
MC.LEVELS = [
  { v: 0,  label: 'No opinion', short: '' },
  { v: 1,  label: 'Like',       short: '♥' },
  { v: 2,  label: 'Love',       short: '♥♥' },
  { v: -1, label: 'Avoid',      short: '✕' },
];
MC.nextLevel = v => ({ 0: 1, 1: 2, 2: -1, '-1': 0 })[v] ?? 1;
MC.levelWeight = v => ({ 1: 1, 2: 2.2, '-1': -3 })[v] || 0;

const opts = list => list.map(s => {
  const [key, label] = s.includes('|') ? s.split('|') : [s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), s];
  return { key, label };
});

/* groups[type] = [{ key, label, options:[{key,label}] }] */
MC.TAXONOMY = {
  books: [
    { key: 'genre', label: 'Genres', options: opts([
      'Literary Fiction', 'Mystery & Thriller', 'Science Fiction', 'Fantasy', 'Horror', 'Romance',
      'Historical Fiction', 'Biography & Memoir', 'History', 'Science & Nature', 'Business & Economics',
      'Self-Help', 'Philosophy', 'Poetry', 'Graphic Novels', 'Young Adult', 'Classics', 'True Crime']) },
    { key: 'format', label: 'How I read', options: opts(['Print', 'E-book', 'Audiobook']) },
  ],
  music: [
    { key: 'genre', label: 'Genres', options: opts([
      'Rock', 'Pop', 'Hip-Hop', 'R&B / Soul', 'Jazz', 'Classical', 'Electronic', 'Country',
      'Folk / Americana', 'Metal', 'Punk', 'Indie / Alternative', 'Blues', 'Reggae', 'Latin',
      'World', 'Soundtracks', 'Ambient']) },
    { key: 'format', label: 'How I listen', options: opts(['Albums', 'Playlists', 'Live concerts', 'Vinyl', 'Podcasts', 'Hi-fi / lossless']) },
  ],
  movies: [
    { key: 'genre', label: 'Genres', options: opts([
      'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Fantasy',
      'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western',
      'International', 'Classic', 'Indie / Arthouse']) },
    { key: 'format', label: 'How I watch', options: opts(['In theaters', 'At home', 'IMAX / premium', 'Festivals']) },
  ],
  games: [
    { key: 'genre', label: 'Genres', options: opts([
      'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing', 'Puzzle',
      'Platformer', 'Shooter', 'Fighting', 'Horror', 'Roguelike', 'Open World', 'Indie', 'MMO',
      'Co-op / Party', 'Cozy']) },
    { key: 'platform', label: 'Platforms', options: opts(['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Mobile', 'VR']) },
  ],
  tv: [
    { key: 'genre', label: 'Genres', options: opts([
      'Drama', 'Comedy', 'Crime', 'Sci-Fi', 'Fantasy', 'Thriller', 'Reality', 'Docuseries',
      'Animation', 'Anime', 'Limited Series', 'Historical', 'Talk / Late Night', 'Game Shows',
      'News', 'Sports', 'Kids & Family']) },
  ],
  streaming: [
    { key: 'service', label: 'Services I use', options: opts([
      'Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Hulu', 'Apple TV', 'Paramount+', 'Peacock',
      'YouTube', 'YouTube TV', 'Spotify', 'Apple Music', 'Tidal', 'Twitch', 'Crunchyroll',
      'Criterion Channel', 'MUBI', 'Shudder', 'Cable / Satellite TV']) },
    { key: 'focus', label: 'What I stream', options: opts([
      'Prestige Originals', 'Movies', 'Anime', 'Horror', 'Arthouse & Classics', 'Live Sports',
      'Music', 'Documentaries', 'Kids & Family', 'Live Streams / Gaming']) },
  ],
  social: [
    { key: 'platform', label: 'Where I hang out', options: opts([
      'YouTube', 'Instagram', 'TikTok', 'X', 'Threads', 'Bluesky', 'Reddit', 'Facebook',
      'LinkedIn', 'Discord', 'Twitch', 'Substack', 'Pinterest']) },
    { key: 'content', label: 'What I follow', options: opts([
      'Creators & Influencers', 'News & Commentary', 'Reviews & Criticism', 'Fan Communities',
      'Tutorials & How-to', 'Behind the Scenes', 'Memes & Humor', 'Newsletters']) },
  ],
};

/* Cross-cutting moods & themes, apply to every type. */
MC.MOODS = opts([
  'Feel-good', 'Dark', 'Thought-provoking', 'Funny', 'Suspenseful', 'Cozy', 'Epic', 'Romantic',
  'Nostalgic', 'Mind-bending', 'Inspiring', 'True Story', 'Fast-paced', 'Slow burn']);

MC.pickKey = (type, group, opt) => `${type}.${group}.${opt}`;
MC.moodKey = opt => `mood.${opt}`;

MC.optionLabel = (type, group, key) => {
  if (group === 'mood') return MC.MOODS.find(o => o.key === key)?.label || key;
  const g = (MC.TAXONOMY[type] || []).find(g => g.key === group);
  return g?.options.find(o => o.key === key)?.label || key;
};
MC.genreOptions = type => (MC.TAXONOMY[type] || [])[0]?.options || [];
