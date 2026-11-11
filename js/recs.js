/* MediaCopia — offline recommendation engine.
   Scores a built-in catalog of well-known titles against the user's checklist,
   library ratings, favourite creators and (optionally) a free-text query.
   Works with no API key; the AI engine (ai.js) handles open-ended and current picks. */
window.MC = window.MC || {};

const C = (type, title, creator, year, tags, moods, blurb, extra = {}) =>
  ({ type, title, creator, year: String(year), tags, moods, blurb, ...extra });

MC.CATALOG = [
  // ---------- Books ----------
  C('books', 'Project Hail Mary', 'Andy Weir', 2021, ['science-fiction'], ['funny', 'inspiring', 'fast-paced'], 'A lone astronaut wakes up with amnesia and a mission to save Earth.'),
  C('books', 'Dune', 'Frank Herbert', 1965, ['science-fiction', 'classics'], ['epic', 'thought-provoking'], 'Politics, ecology and prophecy on the desert planet Arrakis.'),
  C('books', 'The Name of the Wind', 'Patrick Rothfuss', 2007, ['fantasy'], ['epic', 'slow-burn'], 'A legendary wizard tells the true story of his life.'),
  C('books', 'Gone Girl', 'Gillian Flynn', 2012, ['mystery-thriller'], ['dark', 'suspenseful'], 'A marriage unravels after a wife disappears on her anniversary.'),
  C('books', 'Sapiens', 'Yuval Noah Harari', 2011, ['history', 'science-nature'], ['thought-provoking'], 'A brief history of humankind, from foragers to the present.'),
  C('books', 'Educated', 'Tara Westover', 2018, ['biography-memoir'], ['inspiring', 'true-story'], 'A memoir of leaving a survivalist family to earn a PhD.'),
  C('books', 'The Remains of the Day', 'Kazuo Ishiguro', 1989, ['literary-fiction'], ['nostalgic', 'slow-burn', 'thought-provoking'], 'An English butler reflects on duty and a life half-lived.'),
  C('books', 'Pride and Prejudice', 'Jane Austen', 1813, ['romance', 'classics'], ['romantic', 'funny'], 'Elizabeth Bennet and Mr. Darcy, the original enemies-to-lovers.'),
  C('books', 'The Haunting of Hill House', 'Shirley Jackson', 1959, ['horror', 'classics'], ['dark', 'suspenseful'], 'Four people spend a summer in a house that does not want them.'),
  C('books', 'Thinking, Fast and Slow', 'Daniel Kahneman', 2011, ['science-nature', 'business-economics'], ['thought-provoking'], 'How the two systems of the mind shape our judgments.'),
  C('books', 'Watchmen', 'Alan Moore & Dave Gibbons', 1987, ['graphic-novels'], ['dark', 'thought-provoking'], 'A murder mystery that deconstructs the superhero.'),
  C('books', 'Wolf Hall', 'Hilary Mantel', 2009, ['historical-fiction'], ['slow-burn'], 'Thomas Cromwell rises in the court of Henry VIII.'),
  C('books', 'Meditations', 'Marcus Aurelius', 180, ['philosophy', 'classics'], ['thought-provoking', 'inspiring'], 'A Roman emperor\'s private notes on Stoic living.'),
  C('books', 'The Hunger Games', 'Suzanne Collins', 2008, ['young-adult', 'science-fiction'], ['suspenseful', 'fast-paced'], 'A teenager volunteers for a televised fight to the death.'),
  C('books', 'Atomic Habits', 'James Clear', 2018, ['self-help'], ['inspiring'], 'Small, compounding changes that build better habits.'),
  C('books', 'In Cold Blood', 'Truman Capote', 1966, ['true-crime', 'classics'], ['dark', 'true-story'], 'The landmark account of a 1959 Kansas murder.'),
  C('books', 'Milk and Honey', 'Rupi Kaur', 2014, ['poetry'], ['inspiring', 'romantic'], 'Short poems on love, loss, trauma and healing.'),

  // ---------- Music ----------
  C('music', 'Kind of Blue', 'Miles Davis', 1959, ['jazz'], ['cozy', 'nostalgic'], 'The best-selling jazz record of all time; modal and effortless.'),
  C('music', 'OK Computer', 'Radiohead', 1997, ['rock', 'indie-alternative'], ['dark', 'mind-bending'], 'Anxious, beautiful art-rock about modern alienation.'),
  C('music', 'To Pimp a Butterfly', 'Kendrick Lamar', 2015, ['hip-hop'], ['thought-provoking'], 'Jazz- and funk-soaked hip-hop about fame and identity.'),
  C('music', 'Rumours', 'Fleetwood Mac', 1977, ['rock', 'pop'], ['nostalgic', 'romantic'], 'Breakup songs written by the people breaking up.'),
  C('music', 'Random Access Memories', 'Daft Punk', 2013, ['electronic', 'pop'], ['feel-good', 'nostalgic'], 'A disco-and-funk love letter played by live musicians.'),
  C('music', 'Blue', 'Joni Mitchell', 1971, ['folk-americana'], ['romantic', 'slow-burn'], 'Intimate, confessional songwriting at its peak.'),
  C('music', 'Songs in the Key of Life', 'Stevie Wonder', 1976, ['r-b-soul'], ['feel-good', 'inspiring'], 'A sprawling double album of soul, funk and joy.'),
  C('music', 'Master of Puppets', 'Metallica', 1986, ['metal'], ['epic', 'fast-paced'], 'The thrash metal benchmark.'),
  C('music', 'Golden Hour', 'Kacey Musgraves', 2018, ['country', 'pop'], ['feel-good', 'romantic'], 'Country with a warm, cosmic pop glow.'),
  C('music', 'Music for Airports', 'Brian Eno', 1978, ['ambient', 'electronic'], ['cozy'], 'The album that defined ambient music.'),
  C('music', 'The Miseducation of Lauryn Hill', 'Lauryn Hill', 1998, ['hip-hop', 'r-b-soul'], ['inspiring', 'romantic'], 'Hip-hop, soul and reggae fused into a classic.'),
  C('music', 'Goldberg Variations (1955)', 'Glenn Gould', 1955, ['classical'], ['cozy', 'thought-provoking'], 'Bach played with electric clarity.'),
  C('music', 'Buena Vista Social Club', 'Buena Vista Social Club', 1997, ['latin', 'world'], ['nostalgic', 'feel-good'], 'Veteran Cuban musicians revive son and bolero.'),
  C('music', 'Legend', 'Bob Marley & The Wailers', 1984, ['reggae'], ['feel-good'], 'The essential reggae greatest-hits collection.'),
  C('music', 'Interstellar (Original Soundtrack)', 'Hans Zimmer', 2014, ['soundtracks'], ['epic'], 'Pipe organ and strings for a journey through space.'),
  C('music', 'London Calling', 'The Clash', 1979, ['punk', 'rock'], ['fast-paced'], 'Punk that swallowed reggae, rockabilly and ska.'),
  C('music', 'At Last!', 'Etta James', 1960, ['blues', 'r-b-soul'], ['romantic', 'nostalgic'], 'A timeless debut of blues and torch songs.'),

  // ---------- Movies ----------
  C('movies', 'Parasite', 'Bong Joon Ho', 2019, ['thriller', 'drama', 'international'], ['dark', 'suspenseful'], 'A poor family schemes its way into a rich household.'),
  C('movies', 'Spirited Away', 'Hayao Miyazaki', 2001, ['animation', 'fantasy', 'international'], ['cozy', 'mind-bending'], 'A girl works in a bathhouse for spirits to save her parents.'),
  C('movies', 'The Godfather', 'Francis Ford Coppola', 1972, ['crime', 'drama', 'classic'], ['epic', 'dark', 'slow-burn'], 'The Corleone family and the price of power.'),
  C('movies', 'Mad Max: Fury Road', 'George Miller', 2015, ['action', 'sci-fi'], ['epic', 'fast-paced'], 'A two-hour chase across a post-apocalyptic desert.'),
  C('movies', 'Get Out', 'Jordan Peele', 2017, ['horror', 'thriller'], ['suspenseful', 'thought-provoking'], 'A weekend with the girlfriend\'s parents turns sinister.'),
  C('movies', 'Arrival', 'Denis Villeneuve', 2016, ['sci-fi', 'drama'], ['thought-provoking', 'mind-bending', 'slow-burn'], 'A linguist learns to talk to visitors from elsewhere.'),
  C('movies', 'Groundhog Day', 'Harold Ramis', 1993, ['comedy', 'fantasy', 'romance'], ['funny', 'feel-good'], 'A weatherman relives the same day until he gets it right.'),
  C('movies', 'Amélie', 'Jean-Pierre Jeunet', 2001, ['romance', 'comedy', 'international'], ['feel-good', 'romantic'], 'A shy Parisian secretly improves the lives around her.'),
  C('movies', 'Free Solo', 'Jimmy Chin & Elizabeth Chai Vasarhelyi', 2018, ['documentary'], ['inspiring', 'true-story', 'suspenseful'], 'Alex Honnold climbs El Capitan without a rope.'),
  C('movies', 'Inception', 'Christopher Nolan', 2010, ['sci-fi', 'action', 'thriller'], ['mind-bending', 'epic'], 'A heist that takes place inside layered dreams.'),
  C('movies', 'Casablanca', 'Michael Curtiz', 1942, ['romance', 'drama', 'classic', 'war'], ['romantic', 'nostalgic'], 'Of all the gin joints in all the towns in all the world.'),
  C('movies', 'The Good, the Bad and the Ugly', 'Sergio Leone', 1966, ['western', 'classic'], ['epic'], 'Three gunslingers race for buried Confederate gold.'),
  C('movies', 'Knives Out', 'Rian Johnson', 2019, ['mystery', 'comedy', 'crime'], ['funny', 'suspenseful'], 'A detective untangles a crime novelist\'s death.'),
  C('movies', 'La La Land', 'Damien Chazelle', 2016, ['musical', 'romance', 'drama'], ['romantic', 'nostalgic'], 'A jazz pianist and an actress chase dreams in LA.'),
  C('movies', 'Everything Everywhere All at Once', 'Daniel Kwan & Daniel Scheinert', 2022, ['sci-fi', 'comedy', 'action'], ['mind-bending', 'funny'], 'A laundromat owner must connect with parallel-universe selves.'),
  C('movies', 'Moonlight', 'Barry Jenkins', 2016, ['drama', 'indie-arthouse'], ['thought-provoking', 'slow-burn'], 'Three chapters in the life of a young man in Miami.'),
  C('movies', 'Saving Private Ryan', 'Steven Spielberg', 1998, ['war', 'drama'], ['dark', 'epic'], 'A squad goes behind enemy lines after D-Day.'),
  C('movies', 'Raiders of the Lost Ark', 'Steven Spielberg', 1981, ['adventure', 'action'], ['fast-paced', 'feel-good'], 'Indiana Jones races the Nazis for the Ark of the Covenant.'),

  // ---------- Games ----------
  C('games', 'The Legend of Zelda: Breath of the Wild', 'Nintendo', 2017, ['adventure', 'open-world', 'action'], ['epic', 'cozy'], 'Explore a ruined Hyrule any way you like.', { plat: ['nintendo-switch'] }),
  C('games', 'Elden Ring', 'FromSoftware', 2022, ['rpg', 'action', 'open-world'], ['dark', 'epic'], 'A brutal, beautiful open-world action RPG.', { plat: ['pc', 'playstation', 'xbox'] }),
  C('games', 'Hades', 'Supergiant Games', 2020, ['roguelike', 'action', 'indie'], ['fast-paced', 'funny'], 'Fight your way out of the underworld, again and again.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Stardew Valley', 'ConcernedApe', 2016, ['simulation', 'indie', 'cozy', 'rpg'], ['cozy', 'feel-good'], 'Inherit a farm, befriend a town, find your rhythm.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch', 'mobile'] }),
  C('games', 'The Witcher 3: Wild Hunt', 'CD Projekt Red', 2015, ['rpg', 'open-world'], ['epic', 'dark'], 'Geralt hunts monsters and his missing ward.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Portal 2', 'Valve', 2011, ['puzzle', 'co-op-party'], ['funny', 'mind-bending'], 'Physics puzzles and one very passive-aggressive AI.', { plat: ['pc'] }),
  C('games', 'Celeste', 'Maddy Makes Games', 2018, ['platformer', 'indie'], ['inspiring'], 'A tight platformer about climbing a mountain and anxiety.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Sid Meier\'s Civilization VI', 'Firaxis Games', 2016, ['strategy'], ['slow-burn', 'thought-provoking'], 'One more turn: build an empire to stand the test of time.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch', 'mobile'] }),
  C('games', 'Resident Evil 4 (2023)', 'Capcom', 2023, ['horror', 'shooter', 'action'], ['suspenseful', 'fast-paced'], 'A remake of the survival-horror landmark.', { plat: ['pc', 'playstation', 'xbox'] }),
  C('games', 'Baldur\'s Gate 3', 'Larian Studios', 2023, ['rpg', 'strategy'], ['epic', 'funny'], 'A deep, reactive D&D adventure.', { plat: ['pc', 'playstation', 'xbox'] }),
  C('games', 'It Takes Two', 'Hazelight Studios', 2021, ['co-op-party', 'platformer', 'adventure'], ['funny', 'feel-good'], 'A two-player co-op adventure about a couple in crisis.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Forza Horizon 5', 'Playground Games', 2021, ['racing', 'open-world', 'sports'], ['feel-good', 'fast-paced'], 'An open-world racing festival across Mexico.', { plat: ['pc', 'xbox', 'playstation'] }),
  C('games', 'Street Fighter 6', 'Capcom', 2023, ['fighting'], ['fast-paced'], 'The fighting-game classic, rebuilt for newcomers and pros.', { plat: ['pc', 'playstation', 'xbox'] }),
  C('games', 'Disco Elysium', 'ZA/UM', 2019, ['rpg', 'indie'], ['thought-provoking', 'dark', 'funny'], 'A detective RPG where your thoughts argue with you.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Outer Wilds', 'Mobius Digital', 2019, ['adventure', 'puzzle', 'indie'], ['mind-bending', 'thought-provoking'], 'Unravel a solar system\'s secrets in a 22-minute time loop.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),
  C('games', 'Final Fantasy XIV Online', 'Square Enix', 2013, ['mmo', 'rpg'], ['epic'], 'A story-driven MMO with a famously welcoming community.', { plat: ['pc', 'playstation', 'xbox'] }),
  C('games', 'Animal Crossing: New Horizons', 'Nintendo', 2020, ['simulation', 'cozy'], ['cozy', 'feel-good'], 'Build a life on a deserted island at your own pace.', { plat: ['nintendo-switch'] }),
  C('games', 'Tetris Effect', 'Enhance', 2018, ['puzzle'], ['mind-bending', 'feel-good'], 'Tetris wrapped in music and light; superb in VR.', { plat: ['pc', 'playstation', 'vr', 'xbox', 'nintendo-switch'] }),
  C('games', 'EA Sports FC 25', 'EA Sports', 2024, ['sports'], ['fast-paced'], 'The world\'s football, club and country.', { plat: ['pc', 'playstation', 'xbox', 'nintendo-switch'] }),

  // ---------- TV ----------
  C('tv', 'Breaking Bad', 'Vince Gilligan', 2008, ['crime', 'drama', 'thriller'], ['dark', 'suspenseful'], 'A chemistry teacher becomes a drug kingpin.'),
  C('tv', 'The Office (US)', 'Greg Daniels', 2005, ['comedy'], ['funny', 'feel-good'], 'A mockumentary about a paper company\'s branch office.'),
  C('tv', 'Severance', 'Dan Erickson', 2022, ['sci-fi', 'thriller', 'drama'], ['mind-bending', 'suspenseful'], 'Office workers surgically split their work and home memories.'),
  C('tv', 'Planet Earth II', 'BBC Studios', 2016, ['docuseries'], ['inspiring'], 'David Attenborough on the planet\'s most extraordinary habitats.'),
  C('tv', 'Chernobyl', 'Craig Mazin', 2019, ['limited-series', 'historical', 'drama'], ['dark', 'true-story'], 'The 1986 nuclear disaster and the people who faced it.'),
  C('tv', 'Ted Lasso', 'Jason Sudeikis, Bill Lawrence, Brendan Hunt & Joe Kelly', 2020, ['comedy', 'sports'], ['feel-good', 'inspiring'], 'An American football coach manages an English soccer club.'),
  C('tv', 'Game of Thrones', 'David Benioff & D.B. Weiss', 2011, ['fantasy', 'drama'], ['epic', 'dark'], 'Noble houses war over the Iron Throne.'),
  C('tv', 'Attack on Titan', 'Wit Studio / MAPPA', 2013, ['anime', 'animation'], ['dark', 'epic'], 'Humanity fights giants from behind enormous walls.'),
  C('tv', 'The Bear', 'Christopher Storer', 2022, ['comedy', 'drama'], ['fast-paced', 'inspiring'], 'A fine-dining chef takes over his family\'s sandwich shop.'),
  C('tv', 'Arcane', 'Fortiche / Riot Games', 2021, ['animation', 'fantasy'], ['epic'], 'Two sisters on opposite sides of a city at war.'),
  C('tv', 'Mindhunter', 'Joe Penhall', 2017, ['crime', 'thriller'], ['dark', 'true-story', 'slow-burn'], 'FBI agents pioneer criminal profiling in the 1970s.'),
  C('tv', 'The Crown', 'Peter Morgan', 2016, ['historical', 'drama'], ['slow-burn'], 'The reign of Queen Elizabeth II.'),
  C('tv', 'Bluey', 'Joe Brumm', 2018, ['kids-family', 'animation'], ['feel-good', 'cozy', 'funny'], 'A Blue Heeler puppy and her family play imaginative games.'),
  C('tv', 'The Great British Bake Off', 'Love Productions', 2010, ['reality'], ['cozy', 'feel-good'], 'Amateur bakers compete in a tent in the English countryside.'),
  C('tv', 'Black Mirror', 'Charlie Brooker', 2011, ['sci-fi', 'thriller'], ['dark', 'thought-provoking'], 'Standalone stories about technology gone wrong.'),
  C('tv', 'Fleabag', 'Phoebe Waller-Bridge', 2016, ['comedy', 'drama'], ['funny', 'romantic'], 'A woman navigates grief and London life, breaking the fourth wall.'),
  C('tv', 'The Last Dance', 'Jason Hehir', 2020, ['docuseries', 'sports'], ['inspiring', 'true-story'], 'Michael Jordan and the 1990s Chicago Bulls.'),
  C('tv', 'Jeopardy!', 'Merv Griffin', 1964, ['game-shows'], ['feel-good'], 'The answer-and-question trivia institution.'),

  // ---------- Streaming services / channels ----------
  C('streaming', 'Criterion Channel', 'The Criterion Collection', '', ['arthouse-classics', 'movies'], ['thought-provoking'], 'Curated classic, arthouse and international film.', { svc: 'criterion-channel', forTypes: ['movies'] }),
  C('streaming', 'MUBI', 'MUBI', '', ['arthouse-classics', 'movies'], ['thought-provoking'], 'Hand-picked independent and world cinema.', { svc: 'mubi', forTypes: ['movies'] }),
  C('streaming', 'Shudder', 'AMC Networks', '', ['horror'], ['dark', 'suspenseful'], 'Horror, thriller and the supernatural, all the time.', { svc: 'shudder', forTypes: ['movies', 'tv'], needTag: 'horror' }),
  C('streaming', 'Crunchyroll', 'Sony', '', ['anime'], ['epic'], 'The biggest anime library, with simulcasts from Japan.', { svc: 'crunchyroll', forTypes: ['tv'], needTag: 'anime' }),
  C('streaming', 'Twitch', 'Amazon', '', ['live-streams-gaming'], ['funny'], 'Live gaming, music and creator streams.', { svc: 'twitch', forTypes: ['games'] }),
  C('streaming', 'Apple TV', 'Apple', '', ['prestige-originals'], ['thought-provoking'], 'A small, prestige-heavy originals slate (Severance, Ted Lasso).', { svc: 'apple-tv', forTypes: ['tv'] }),
  C('streaming', 'HBO Max', 'Warner Bros. Discovery', '', ['prestige-originals', 'movies'], ['dark', 'epic'], 'HBO dramas plus the Warner Bros. film library.', { svc: 'hbo-max', forTypes: ['tv', 'movies'] }),
  C('streaming', 'Disney+', 'Disney', '', ['kids-family', 'movies'], ['feel-good'], 'Disney, Pixar, Marvel, Star Wars and National Geographic.', { svc: 'disney', forTypes: ['movies', 'tv'] }),
  C('streaming', 'Tidal', 'Tidal', '', ['music'], ['feel-good'], 'Lossless and hi-res music streaming.', { svc: 'tidal', forTypes: ['music'] }),
  C('streaming', 'Peacock', 'NBCUniversal', '', ['live-sports', 'prestige-originals'], ['fast-paced'], 'NBC shows, Premier League and other live sports.', { svc: 'peacock', forTypes: ['tv'] }),
  C('streaming', 'YouTube Premium', 'Google', '', ['documentaries', 'music'], ['inspiring'], 'Ad-free YouTube plus YouTube Music.', { svc: 'youtube', forTypes: ['music', 'social'] }),

  // ---------- Social media: communities that fit your interests ----------
  C('social', 'Letterboxd', 'Letterboxd', '', ['reviews-criticism', 'fan-communities'], [], 'Log, rate and review films; follow friends and critics.', { forTypes: ['movies'] }),
  C('social', 'Goodreads', 'Amazon', '', ['reviews-criticism', 'fan-communities'], [], 'Track reading, join challenges, read reviews.', { forTypes: ['books'] }),
  C('social', 'The StoryGraph', 'The StoryGraph', '', ['reviews-criticism'], [], 'Reading tracker with mood- and pace-based recommendations.', { forTypes: ['books'] }),
  C('social', 'Backloggd', 'Backloggd', '', ['reviews-criticism', 'fan-communities'], [], 'A Letterboxd-style journal for video games.', { forTypes: ['games'] }),
  C('social', 'Last.fm', 'Last.fm', '', ['fan-communities'], [], 'Scrobble every song you play and discover similar artists.', { forTypes: ['music'] }),
  C('social', 'Rate Your Music', 'Sonemic', '', ['reviews-criticism', 'fan-communities'], [], 'Deep music database with user charts and reviews.', { forTypes: ['music'] }),
  C('social', 'Serializd', 'Serializd', '', ['reviews-criticism'], [], 'Log and review TV shows, season by season.', { forTypes: ['tv'] }),
  C('social', 'r/printSF', 'Reddit', '', ['fan-communities'], [], 'Reddit\'s community for science-fiction book recommendations.', { forTypes: ['books'], needTag: 'science-fiction', plat: ['reddit'] }),
  C('social', 'r/TrueFilm', 'Reddit', '', ['fan-communities', 'reviews-criticism'], ['thought-provoking'], 'In-depth film discussion on Reddit.', { forTypes: ['movies'], plat: ['reddit'] }),
  C('social', 'r/patientgamers', 'Reddit', '', ['fan-communities'], [], 'Playing games after the hype has died down.', { forTypes: ['games'], plat: ['reddit'] }),
];

/* ---------- query understanding (offline) ---------- */
MC.TYPE_WORDS = {
  books: ['book', 'books', 'read', 'reading', 'novel', 'novels', 'author', 'audiobook'],
  music: ['music', 'album', 'albums', 'song', 'songs', 'listen', 'artist', 'band', 'playlist'],
  movies: ['movie', 'movies', 'film', 'films', 'cinema', 'watch', 'tonight'],
  games: ['game', 'games', 'gaming', 'play', 'videogame', 'console'],
  tv: ['tv', 'show', 'shows', 'series', 'binge', 'episode', 'sitcom', 'watch'],
  streaming: ['streaming', 'service', 'subscription', 'subscribe', 'channel'],
  social: ['social', 'community', 'communities', 'follow', 'subreddit', 'reddit', 'creator'],
};
MC.TAG_SYNONYMS = {
  'sci-fi': ['scifi', 'sci fi', 'science fiction', 'space'], 'science-fiction': ['scifi', 'sci fi', 'sci-fi', 'space'],
  horror: ['scary', 'spooky', 'creepy', 'frightening'], comedy: ['funny', 'laugh', 'hilarious', 'sitcom'],
  cozy: ['cozy', 'cosy', 'relax', 'relaxing', 'chill', 'wholesome', 'comfort'], funny: ['funny', 'laugh', 'hilarious'],
  'feel-good': ['uplifting', 'happy', 'wholesome', 'feel good'], 'mind-bending': ['twist', 'trippy', 'mind bending', 'weird'],
  documentary: ['documentary', 'doc', 'docs', 'real story'], docuseries: ['documentary', 'docuseries', 'docs'],
  'mystery-thriller': ['mystery', 'thriller', 'whodunit', 'detective'], mystery: ['whodunit', 'detective'],
  'kids-family': ['kids', 'family', 'children'], 'co-op-party': ['co-op', 'coop', 'multiplayer', 'party', 'friends'],
  'true-story': ['true story', 'real life', 'based on'], romantic: ['date night', 'love story'],
  'fast-paced': ['fast', 'action-packed', 'exciting'], 'slow-burn': ['slow burn', 'slow-burn'],
};

MC.parseQuery = q => {
  const text = ' ' + (q || '').toLowerCase().replace(/[^a-z0-9&+\- ]+/g, ' ') + ' ';
  const has = w => text.includes(' ' + w + ' ') || (w.includes(' ') && text.includes(w));
  const types = Object.keys(MC.TYPE_WORDS).filter(t => MC.TYPE_WORDS[t].some(has));
  const tags = new Set();
  const consider = (key, label) => {
    const parts = label.toLowerCase().split(/\s*[\/&]\s*/).map(s => s.trim()).filter(s => s.length > 2);
    const plural = w => has(w) || text.includes(' ' + w + 's ') || (w.endsWith('y') && text.includes(' ' + w.slice(0, -1) + 'ies '));
    if (parts.some(plural) || (MC.TAG_SYNONYMS[key] || []).some(plural)) tags.add(key);
  };
  Object.values(MC.TAXONOMY).forEach(groups => groups.forEach(g => g.options.forEach(o => consider(o.key, o.label))));
  MC.MOODS.forEach(o => consider(o.key, o.label));
  return { types, tags: [...tags], empty: !text.trim() };
};

/* ---------- scoring ---------- */
MC.pickForTag = (type, tag) => {
  for (const g of MC.TAXONOMY[type] || []) {
    const v = MC.getPick(MC.pickKey(type, g.key, tag));
    if (v) return { v, label: g.options.find(o => o.key === tag)?.label || tag };
  }
  return null;
};

MC.hasProfile = () => Object.keys(MC.state.interests.picks).length > 0 || MC.customCount() > 0 ||
  Object.keys(MC.state.interests.types).length > 0 || MC.state.library.length > 0;

MC.scoreItem = (item, ctx) => {
  const { type } = item;
  const reasons = [];
  const typeLvl = MC.getTypeLevel(type);
  if (typeLvl === -1 && !ctx.query.types.includes(type)) return null;
  if (MC.findInLibrary(item.title) || MC.isDismissed(item.title)) return null;
  if (item.svc && (MC.getPick(MC.pickKey('streaming', 'service', item.svc)) > 0 || MC.hasSub(MC.SUB_FROM_PICK[item.svc]))) return null;

  let s = MC.levelWeight(typeLvl) * 0.8;
  const tagMatch = (tags, kind) => tags.forEach(tag => {
    const p = kind === 'mood' ? (MC.getPick(MC.moodKey(tag)) ? { v: MC.getPick(MC.moodKey(tag)), label: MC.optionLabel(null, 'mood', tag) } : null)
                              : MC.pickForTag(type, tag);
    if (!p) return;
    if (p.v < 0 && ctx.query.tags.includes(tag)) return; // they asked for it explicitly
    s += MC.levelWeight(p.v) * (kind === 'mood' ? 0.8 : 1);
    if (p.v > 0) reasons.push(`${p.label}${p.v === 2 ? ' (love)' : ''}`);
    if (p.v < 0) reasons.push(`but you avoid ${p.label}`);
  });
  tagMatch(item.tags, 'tag');
  tagMatch(item.moods, 'mood');

  // Cross-type relevance (streaming services, social communities).
  if (item.forTypes) {
    let rel = 0;
    item.forTypes.forEach(t => {
      rel += Math.max(0, MC.levelWeight(MC.getTypeLevel(t))) * 0.7;
      rel += Math.min(1.5, MC.state.library.filter(i => i.type === t).length * 0.2);
    });
    if (item.needTag) {
      const p = Object.keys(MC.TAXONOMY).map(t => MC.pickForTag(t, item.needTag)).find(Boolean);
      if (!p || p.v < 0) rel = Math.min(rel, p && p.v < 0 ? -5 : 0.2);
      else { rel += 1.5; reasons.push(p.label); }
    }
    s += rel;
    if (rel > 0.8) reasons.push(`fits your ${item.forTypes.map(t => MC.TYPE[t].label.toLowerCase()).join(' & ')}`);
  }

  // Platforms (games, social).
  if (item.plat) {
    const group = type === 'games' ? 'platform' : 'platform';
    const pType = type === 'games' ? 'games' : 'social';
    const mine = (MC.TAXONOMY[pType].find(g => g.key === group)?.options || []).filter(o => MC.getPick(MC.pickKey(pType, group, o.key)) > 0).map(o => o.key);
    if (mine.length) {
      const hit = item.plat.filter(p => mine.includes(p));
      if (hit.length) { s += 0.7; reasons.push(`on ${hit.map(h => MC.optionLabel(pType, group, h)).join('/')}`); }
      else s -= 1.5;
    }
  }

  // Library affinity: things you rated highly / disliked.
  const libSame = item.forTypes ? [] : MC.state.library.filter(i => i.type === type);
  let bestRef = null, bestOverlap = 0;
  libSame.forEach(i => {
    const overlap = (i.genres || []).filter(g => item.tags.includes(g)).length + (i.moods || []).filter(m => item.moods.includes(m)).length * 0.5;
    if (!overlap) return;
    if (i.rating >= 4 || (i.status === 'active' && i.rating === 0)) { s += 0.5 * overlap; if (overlap > bestOverlap) { bestOverlap = overlap; bestRef = i; } }
    else if (i.rating && i.rating <= 2) s -= 0.4 * overlap;
  });
  if (bestRef) reasons.unshift(`like ${bestRef.title}${bestRef.rating ? ` (${bestRef.rating}★)` : ''}`);

  // Your own interests (free text): match the words against the title/creator/blurb, or via the tags they imply.
  const hay = ' ' + `${item.title} ${item.creator} ${item.blurb}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  (ctx.custom || []).forEach(c => {
    if (c.cat !== 'mood' && c.cat !== type && !(item.forTypes || []).includes(c.cat)) return;
    const textHit = c.words.length && c.words.every(w => hay.includes(' ' + w));
    // Every concept the phrase implies must fit ("cozy mysteries" needs both cozy and mystery).
    const tags = c.tags.filter(t => MC.MOODS.some(m => m.key === t) || (MC.TAXONOMY[type] || []).some(g => g.options.some(o => o.key === t)));
    const tagHit = tags.length > 0 && tags.every(t => item.tags.includes(t) || item.moods.includes(t));
    if (!textHit && !tagHit) return;
    if (c.v < 0 && ctx.query.tags.some(t => c.tags.includes(t))) return;
    s += MC.levelWeight(c.v) * (textHit ? 1.6 : 0.9);
    reasons.push(c.v > 0 ? `your “${c.label}”${c.v === 2 ? ' (love)' : ''}` : `but you avoid “${c.label}”`);
  });

  // Favourite creators.
  const favs = MC.favouriteCreators();
  if (item.creator && favs.some(c => item.creator.toLowerCase().includes(c))) { s += 2.5; reasons.unshift(`by ${item.creator}, a favourite`); }

  // Query boost.
  if (ctx.query.types.length) {
    if (!ctx.query.types.includes(type)) return null;
    s += 1.5;
  }
  if (ctx.query.tags.length) {
    const qHit = [...new Set([...item.tags, ...item.moods])].filter(t => ctx.query.tags.includes(t));
    if (!qHit.length && ctx.strictQuery) return null;
    s += qHit.length * 3;
    if (qHit.length) reasons.unshift(`matches “${qHit.map(t => MC.labelForAnyTag(t)).join(', ')}”`);
  }
  return { item, score: s, reasons: [...new Set(reasons)].slice(0, 4) };
};

MC.labelForAnyTag = tag => {
  const mood = MC.MOODS.find(o => o.key === tag);
  if (mood) return mood.label;
  for (const groups of Object.values(MC.TAXONOMY)) for (const g of groups) {
    const o = g.options.find(o => o.key === tag);
    if (o) return o.label;
  }
  return tag;
};

MC.favouriteCreators = () => {
  const list = (MC.state.interests.creators || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  MC.state.library.filter(i => i.rating >= 5 && i.creator).forEach(i => list.push(i.creator.toLowerCase()));
  return [...new Set(list)];
};

/* Returns ranked recommendations. opts: { type, query, limit } */
MC.localRecommend = (opts = {}) => {
  const query = MC.parseQuery(opts.query || '');
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'like', 'into', 'about', 'stuff', 'things', 'anything', 'more', 'some', 'any', 'all', 'series', 'books', 'book', 'movies', 'movie', 'films', 'film', 'shows', 'show', 'games', 'game', 'music', 'songs']);
  const custom = Object.entries(MC.state.interests.custom || {}).flatMap(([cat, list]) => list.map(c => ({
    cat, label: c.label, v: c.v,
    words: c.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w)),
    tags: MC.parseQuery(c.label).tags,
  })));
  const ctx = { query, custom, strictQuery: !!opts.query && query.tags.length > 0 };
  const profile = MC.hasProfile();
  let pool = MC.CATALOG.filter(i => !opts.type || opts.type === 'all' || i.type === opts.type);
  let scored = pool.map(i => MC.scoreItem(i, ctx)).filter(Boolean);
  if (profile || opts.query) scored = scored.filter(r => r.score > 0.4 || (!profile && opts.query));
  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  // Keep variety when showing "all": no more than 3 per type in the top slice.
  if (!opts.type || opts.type === 'all') {
    const per = {}; const varied = []; const rest = [];
    scored.forEach(r => ((per[r.item.type] = (per[r.item.type] || 0) + 1) <= 3 ? varied : rest).push(r));
    scored = [...varied, ...rest];
  }
  return { results: scored.slice(0, opts.limit || 24), query, profile };
};
