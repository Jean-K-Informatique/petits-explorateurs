const $ = (selector) => document.querySelector(selector);
const screens = { home: $('#welcome-screen'), worlds: $('#worlds-screen'), album: $('#album-screen'), game: $('#game-screen'), finish: $('#finish-screen') };

const colors = [
  { id: 'red', label: 'rouge', short: 'Rouge', value: '#ee6659' },
  { id: 'blue', label: 'bleue', short: 'Bleu', value: '#54a5df' },
  { id: 'yellow', label: 'jaune', short: 'Jaune', value: '#f1c43d' },
  { id: 'green', label: 'verte', short: 'Vert', value: '#69b96d' },
  { id: 'purple', label: 'violette', short: 'Violet', value: '#a077d5' },
  { id: 'orange', label: 'orange', short: 'Orange', value: '#f18d45' },
  { id: 'pink', label: 'rose', short: 'Rose', value: '#ed79a4' },
  { id: 'turquoise', label: 'turquoise', short: 'Turquoise', value: '#39bdb7' },
  { id: 'brown', label: 'marron', short: 'Marron', value: '#ab704c' },
  { id: 'white', label: 'blanche', short: 'Blanc', value: '#f4e5b6' },
].map((item) => ({ ...item, kind: 'color' }));
const numberWords = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
const numberTints = ['#ee6659', '#54a5df', '#69b96d', '#a077d5', '#f18d45', '#39bdb7', '#ed79a4', '#d2a93a', '#6da99d', '#8f8ac3'];
const numbers = numberWords.map((word, i) => ({ id: `n${i + 1}`, label: String(i + 1), short: `Chiffre ${i + 1}`, value: i + 1, kind: 'number', tint: numberTints[i] }));
// Colours and numbers keep a simple bubble game; animals live in the worlds of content/animals.json.
const extraWorlds = {
  colors: { name: 'Le jardin des couleurs', items: colors, background: './assets/themes/ferme.webp', ambience: 'motes',
    prompt: (item) => `Touche la bulle ${item.label}`, ask: (item) => `color-${item.id}`, says: (item) => `color-name-${item.id}`, yes: (item) => `color-yes-${item.id}`, spoken: (item) => `la bulle ${item.label}` },
  numbers: { name: 'Le sentier des chiffres', items: numbers, background: './assets/themes/foret.webp', ambience: 'leaves',
    prompt: (item) => `Touche le chiffre ${numberWords[item.value - 1]}`, ask: (item) => `number-${item.value}`, says: (item) => `number-name-${item.value}`, yes: (item) => `number-yes-${item.value}`, spoken: (item) => `le chiffre ${numberWords[item.value - 1]}` },
};
const ambiences = { savane: 'motes', foret: 'leaves', ferme: 'motes', ocean: 'bubbles', glaces: 'snow', jungle: 'fireflies', vehicules: 'motes' };
const games = {
  bubbles: { name: 'Les bulles', title: 'Où partons-nous ?' },
  puzzle: { name: 'Le puzzle', title: 'Quel monde veux-tu assembler ?' },
  memory: { name: 'Les paires', title: 'Dans quel monde cherche-t-on les paires ?' },
};
const praiseLines = ['Super !', 'Oui, c’est ça !', 'Bravo, tu as trouvé !', 'Bien joué !', 'Génial, explorateur !'];
const namedPraiseLines = { 0: (name) => `Super, ${name} !`, 4: (name) => `Génial, ${name} !` };
function readPlayers() { try { return JSON.parse(localStorage.getItem('pe-players')) || []; } catch { return []; } }
const state = {
  activity: 'bubbles', world: null, deck: [], index: 0, streak: 0, choices: 3, busy: false, greeted: false, firstRound: false, round: null,
  sound: localStorage.getItem('pe-sound') !== 'off', voice: localStorage.getItem('pe-voice') !== 'off', short: localStorage.getItem('pe-short') === 'on',
  players: readPlayers(), player: localStorage.getItem('pe-player') || null, engine: null, puzzle: null, memory: null,
};
if (!state.players.includes(state.player)) state.player = null;
let content = null;
let toastTimer;

// Progress (discovered animals, memory pairs) is kept separately for each child.
function playerKey(key) { return state.player ? `${key}@${state.player.toLowerCase()}` : key; }
function discovered() { try { return new Set(JSON.parse(localStorage.getItem(playerKey('pe-discovered'))) || []); } catch { return new Set(); } }
function discover(id) { const seen = discovered(); seen.add(id); localStorage.setItem(playerKey('pe-discovered'), JSON.stringify([...seen])); }
function praiseText(index) { return state.player && namedPraiseLines[index] ? namedPraiseLines[index](state.player) : praiseLines[index]; }
// Capital first letter and French non-breaking spaces before ? and ! so they never wrap alone.
// Each animal has two anecdotes; they alternate so the child hears something new the next time.
function nextFact(animal) { animal.lastFact = animal.lastFact ? 3 - animal.lastFact : 1 + Math.floor(Math.random() * animal.facts.length); return animal.lastFact; }
function factKey(animal, index = nextFact(animal)) { return `a/${animal.id}/fact-${index}`; }
function capitalize(text) { return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/ ([?!:;])/g, '\u00a0$1'); }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function getCount() { return state.short ? 3 : 5; }
// Picture collections (Totoro, the parent's own pictures) only exist for the puzzle.
let collections = [];
function theme(id = state.world) { return content?.themes.find((item) => item.id === id) || collections.find((item) => item.id === id) || null; }
const photos = new Map();
function photo(animal) {
  if (!photos.has(animal.id)) { const image = new Image(); image.decoding = 'async'; image.src = animal.photo; photos.set(animal.id, image); }
  return photos.get(animal.id);
}
// Animals the child has not met yet come first, so every game brings something new.
function pickDeck(world, count) {
  const seen = discovered();
  const fresh = shuffle(world.animals.filter((animal) => !seen.has(animal.id)));
  return [...fresh, ...shuffle(world.animals.filter((animal) => seen.has(animal.id)))].slice(0, count);
}

function setScreen(name) {
  cancelAuto();
  Object.entries(screens).forEach(([key, screen]) => screen.classList.toggle('hidden', key !== name));
  if (name !== 'game') { window.VoiceBank?.stop(); state.engine?.pause(); state.puzzle?.pause(); hideReveal(); }
  if (name === 'game') requestAnimationFrame(() => {
    if (state.activity === 'bubbles') { state.engine?.resize(); state.engine?.resume(); }
    if (state.activity === 'puzzle') state.puzzle?.resume();
  });
  if (name === 'worlds') renderWorlds();
  if (name === 'album') renderAlbum();
  if (name === 'home') renderAlbumCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// The 🔊 button mutes everything (Lila and sound effects); the parent setting only turns Lila off.
function voiceOn() { return state.sound && state.voice; }
function playVoice(...keys) {
  if (!voiceOn() || !keys.flat().filter(Boolean).length) return Promise.resolve(false);
  return window.VoiceBank ? window.VoiceBank.play(...keys) : Promise.resolve(false);
}
function playSound(type = 'success') {
  if (!state.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    state.audio ||= new Ctx();
    if (state.audio.state === 'suspended') state.audio.resume();
    const now = state.audio.currentTime;
    if (type === 'pop') {
      const oscillator = state.audio.createOscillator(); const gain = state.audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(420, now); oscillator.frequency.exponentialRampToValueAtTime(1250, now + .09);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.16, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + .14);
      oscillator.connect(gain); gain.connect(state.audio.destination); oscillator.start(now); oscillator.stop(now + .16);
    }
    const notes = type === 'gentle' ? [392, 349.23] : type === 'pop' ? [783.99, 1046.5] : [523.25, 659.25, 783.99];
    const offset = type === 'pop' ? .12 : 0;
    notes.forEach((frequency, i) => {
      const oscillator = state.audio.createOscillator(); const gain = state.audio.createGain(); const start = now + offset + i * .09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(type === 'gentle' ? .05 : .08, start + .03); gain.gain.exponentialRampToValueAtTime(.0001, start + .23);
      oscillator.connect(gain); gain.connect(state.audio.destination); oscillator.start(start); oscillator.stop(start + .25);
    });
  } catch { /* Audio is optional; the game remains playable. */ }
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}
function setHint(html, tone = '') {
  const hint = $('#prompt-hint'); hint.innerHTML = html; hint.className = `prompt-hint ${tone}`;
}
function escapeHtml(text) { return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

// Home and worlds ---------------------------------------------------------------

function chooseActivity(activity) {
  state.activity = activity;
  $('#worlds-game').textContent = games[activity].name;
  $('#worlds-title').textContent = games[activity].title;
  $('#extra-modes').classList.toggle('hidden', activity !== 'bubbles');
  setScreen('worlds');
  if (!state.greeted) { state.greeted = true; playVoice('welcome'); }
}
// Worlds offered for a game: every theme, plus the picture collections for the puzzle.
function worldsFor(activity) {
  return [...(content?.themes || []), ...(activity === 'puzzle' ? collections.filter((item) => item.animals.length) : [])];
}
function renderWorlds() {
  if (!content) return;
  const seen = discovered();
  const card = (world) => {
    const count = world.animals.filter((animal) => seen.has(animal.id)).length;
    const button = document.createElement('button'); button.type = 'button'; button.className = `world-card${world.mix ? ' mix-card' : ''}`;
    if (!world.mix) button.style.setProperty('--bg', `url('${world.collection ? world.animals[0]?.photo : `./assets/themes/${world.id}.webp`}')`);
    button.style.setProperty('--accent', world.accent);
    button.setAttribute('aria-label', `${world.name}, ${count} découverts sur ${world.animals.length}`);
    // The mix shows a little bunch of photos from every world.
    if (world.collection && !world.animals.length) {
      button.classList.add('empty-card');
      button.innerHTML = `<span class="world-name">${escapeHtml(world.name)}</span><small>Ajoute tes images dans les réglages ☼</small>`;
      button.addEventListener('click', () => { $('#parent-modal').classList.remove('hidden'); renderMyImages(); });
      return button;
    }
    const covers = world.mix ? content.themes.filter((other) => !other.mix).slice(0, 3).map((other) => other.animals.find((item) => item.id === other.cover)) : [world.animals.find((item) => item.id === world.cover) || world.animals[0]];
    button.innerHTML = `${covers.map((item, i) => `<span class="world-cover cover-${i}" style="--photo:url('${item.photo}')"></span>`).join('')}
      <span class="world-name">${escapeHtml(world.name)}</span>
      ${world.collection ? '' : `<span class="world-progress"><i style="width:${(count / world.animals.length) * 100}%"></i></span>`}
      <small>${world.collection ? `${world.animals.length} image${world.animals.length > 1 ? 's' : ''}` : count === world.animals.length ? '✦ Tout découvert !' : `${count} / ${world.animals.length} découverts`}</small>`;
    button.addEventListener('click', () => startWorld(world.id));
    return button;
  };
  $('#world-grid').replaceChildren(...content.themes.filter((world) => world.group === 'animaux').map(card));
  $('#world-grid-plus').replaceChildren(...[...content.themes.filter((world) => world.group !== 'animaux'), ...(state.activity === 'puzzle' ? collections : [])].map(card));
}

// Album: every animal is a sticker, discovered ones show their photo and tell their story again.
function renderAlbumCount() {
  if (!content) return;
  const total = content.themes.filter((world) => !world.mix).reduce((sum, world) => sum + world.animals.length, 0);
  $('#album-count').textContent = `${discovered().size} / ${total}`;
}
function renderAlbum() {
  if (!content) return;
  const seen = discovered();
  $('#album-owner').textContent = state.player ? `L’album de ${state.player}` : 'Mon album';
  $('#album-title').textContent = seen.size === 0 ? 'Ton album t’attend !' : seen.size === 1 ? '1 découverte' : `${seen.size} découvertes`;
  $('#album-worlds').replaceChildren(...content.themes.filter((world) => !world.mix).map((world) => {
    const section = document.createElement('section'); section.className = 'album-world';
    section.style.setProperty('--accent', world.accent);
    const count = world.animals.filter((animal) => seen.has(animal.id)).length;
    section.innerHTML = `<h2>${escapeHtml(world.name)} <small>${count} / ${world.animals.length}</small></h2>`;
    const grid = document.createElement('div'); grid.className = 'album-grid';
    grid.append(...world.animals.map((animal) => {
      const known = seen.has(animal.id);
      const sticker = document.createElement('button'); sticker.type = 'button'; sticker.className = `sticker${known ? '' : ' unknown'}`;
      if (known) sticker.style.setProperty('--photo', `url('${animal.photo}')`);
      sticker.innerHTML = `<span>${known ? '' : '?'}</span><b>${known ? escapeHtml(animal.name) : '…'}</b>`;
      sticker.setAttribute('aria-label', known ? `${animal.name}, écouter` : 'À découvrir');
      sticker.addEventListener('click', () => {
        if (known) playVoice(`a/${animal.id}/name-1`, factKey(animal));
        else { showToast(`À découvrir dans ${world.name.toLowerCase()} !`); sticker.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 400 }); }
      });
      return sticker;
    }));
    section.append(grid); return section;
  }));
}

function startWorld(id) {
  state.world = id; state.index = 0; state.streak = 0; state.choices = 3; state.busy = false; state.firstRound = true;
  const world = theme(id); const extra = extraWorlds[id];
  setWorldScene(world && !world.mix && !world.collection ? world.id : null, extra || (world?.collection ? { background: world.animals[0]?.photo, ambience: 'motes' } : null));
  $('#prompt-kicker').textContent = world ? world.name : extra.name;
  const gameScreen = $('.game-screen');
  gameScreen.classList.toggle('puzzle-mode', state.activity === 'puzzle');
  gameScreen.classList.toggle('memory-mode', state.activity === 'memory');
  $('#game-canvas').classList.toggle('hidden', state.activity !== 'bubbles');
  $('#puzzle-canvas').classList.toggle('hidden', state.activity !== 'puzzle');
  $('#memory-board').classList.toggle('hidden', state.activity !== 'memory');
  $('#puzzle-hint').classList.toggle('hidden', state.activity !== 'puzzle');
  $('#listen-button').classList.remove('hidden');
  if (state.activity === 'bubbles') startBubbles(world, extra);
  else if (state.activity === 'puzzle') startPuzzle(world);
  else startMemory(world);
  if (screen.orientation?.lock && window.matchMedia('(orientation: portrait)').matches) screen.orientation.lock('landscape').catch(() => {});
}

// Landscape and ambience behind the game; in the mix they follow the world of each target.
function setWorldScene(worldId, extra) {
  const background = worldId ? `./assets/themes/${worldId}.webp` : extra?.background;
  if (background) $('#playfield').style.setProperty('--world-bg', `url('${background}')`);
  state.engine?.setAmbience(worldId ? ambiences[worldId] : extra?.ambience);
}

// Bubbles -----------------------------------------------------------------------

function startBubbles(world, extra) {
  state.deck = world ? pickDeck(world, getCount()) : shuffle(extra.items).slice(0, getCount());
  setScreen('game');
  if (!state.engine) {
    state.engine = new window.GameEngine($('#game-canvas'), { onTap: handleChoice });
    state.engine.onResize = () => state.engine.setObstacles(obstacles());
  }
  setWorldScene(world && !world.mix ? world.id : null, extra);
  renderRound();
}
// Areas of the playfield covered by the prompt card and the top bar.
function obstacles() {
  const field = $('#playfield').getBoundingClientRect();
  return ['#prompt-area', '.game-topline'].map((selector) => {
    const box = $(selector).getBoundingClientRect();
    return { left: box.left - field.left, top: box.top - field.top, right: box.right - field.left, bottom: box.bottom - field.top };
  });
}
function currentTarget() { return state.deck[state.index]; }
function promptKey() {
  const target = currentTarget(); const extra = extraWorlds[state.world];
  if (state.activity === 'puzzle') return target.kind === 'animal' ? `a/${target.id}/puzzle` : 'puzzle-start';
  if (state.activity === 'memory') return 'memory-start';
  return extra ? extra.ask(target) : `a/${target.id}/prompt-${state.round.prompt}`;
}
function renderRound() {
  const target = currentTarget(); const world = theme(); const extra = extraWorlds[state.world];
  const pool = world ? world.animals : extra.items;
  if (world?.mix) setWorldScene(target.world);
  const count = Math.min(state.choices, pool.length);
  const choices = shuffle([target, ...shuffle(pool.filter((item) => item.id !== target.id)).slice(0, count - 1)]);
  const variant = state.round?.prompt === 1 ? 2 : state.round?.prompt === 2 ? 1 : 1 + Math.floor(Math.random() * 2);
  state.round = { target, prompt: variant, misses: 0, tapped: new Set() };
  const title = world ? (variant === 1 ? `Où est ${target.the} ?` : `Montre-moi ${target.the} !`) : extra.prompt(target);
  $('#prompt-title').textContent = capitalize(title);
  $('#listen-button').setAttribute('aria-label', `Réécouter : ${title}`);
  setHint(world ? 'Touche la bonne bulle.' : 'Écoute bien, puis touche la bulle.');
  if (world) choices.forEach((animal) => { animal.image = photo(animal); });
  exposeChoices(choices);
  state.engine.setObstacles(obstacles());
  state.engine.setScene(choices);
  state.busy = false;
  if (world) window.VoiceBank?.preload([...choices.map((animal) => `a/${animal.id}/name-1`), `a/${target.id}/hint-1`, `a/${target.id}/yes-1`, `a/${target.id}/fact-1`, `a/${target.id}/fact-2`]);
  const intro = state.firstRound && world ? `t/${world.id}/intro` : null;
  state.firstRound = false;
  setTimeout(() => { if (state.round?.target === target && !state.busy) playVoice(intro, promptKey()); }, 350);
}
function exposeChoices(items) {
  $('#choices').replaceChildren(...items.map((item, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = `${i + 1}. ${item.short}`; button.setAttribute('aria-label', item.short);
    button.addEventListener('click', () => state.engine?.tap(item.id));
    return button;
  }));
}
function handleChoice(item) {
  if (state.busy || !state.round) return;
  if (item.id === state.round.target.id) celebrate(item); else gentleMiss(item);
}
// A wrong bubble shows and says what it is, then Lila gives a clue about the animal we look for.
function gentleMiss(item) {
  const round = state.round; const target = round.target; const extra = extraWorlds[state.world];
  state.engine.shake(item.id); state.engine.reveal(item.id); playSound('gentle');
  const firstTap = !round.tapped.has(item.id);
  if (firstTap) { round.tapped.add(item.id); round.misses += 1; state.streak = 0; if (round.misses === 1 && state.choices > 3) state.choices -= 1; }
  const n = round.misses;
  if (n >= 3 || (extra && n >= 2)) state.engine.hint(target.id);
  if (extra) {
    setHint(`<b>Ça, c’est ${escapeHtml(extra.spoken(item))}.</b> ${n >= 2 ? 'Regarde la bulle qui brille !' : `On cherche ${escapeHtml(extra.spoken(target))}.`}`, 'gentle');
    playVoice(extra.says(item), firstTap ? (n >= 2 ? `help-${1 + (n % 2)}` : extra.ask(target)) : null);
    return;
  }
  const clue = n <= 2 ? target.hints[n - 1] : 'Regarde la bulle qui brille !';
  setHint(`<b>Ça, c’est ${escapeHtml(item.the)}.</b> ${escapeHtml(clue)}`, 'gentle');
  playVoice(`a/${item.id}/name-${firstTap ? 1 + (n % 2) : 1}`, firstTap ? (n <= 2 ? `a/${target.id}/hint-${n}` : `help-${1 + (n % 2)}`) : null);
}
function celebrate(item) {
  state.busy = true; state.streak += 1;
  const pool = theme()?.animals || extraWorlds[state.world].items;
  if (state.streak >= 3 && state.choices < Math.min(4, pool.length)) { state.choices += 1; state.streak = 0; }
  const from = state.engine.pop(item.id); playSound('pop');
  if (item.kind !== 'animal') {
    setHint(`<b>${praiseText(Math.floor(Math.random() * 5))}</b>`, 'success');
    playVoice(extraWorlds[state.world].yes(item));
    setTimeout(nextRound, 1700);
    return;
  }
  discover(item.id);
  setHint(`<b>Bravo !</b> Tu as trouvé ${escapeHtml(item.the)}.`, 'success');
  // Now and then Lila cheers the child by name instead of naming the animal again.
  const cheer = window.VoiceBank?.isNamed('praise-1') && Math.random() < .25 ? pick(['praise-1', 'praise-5']) : `a/${item.id}/yes-${1 + Math.floor(Math.random() * 2)}`;
  showReveal(item, from, [cheer], nextRound);
}
function nextRound() {
  state.index += 1;
  if (state.index >= state.deck.length) finishGame();
  else if (state.activity === 'puzzle') renderPuzzleRound();
  else renderRound();
}

// The game moves on by itself once Lila has finished talking: a young child never has to tap "next".
let autoTimer = null; let autoToken = null;
function autoAdvance(spoken, pause, action) {
  clearTimeout(autoTimer); const token = {}; autoToken = token;
  const go = () => { if (autoToken === token) { autoToken = null; action(); } };
  if (!voiceOn()) { autoTimer = setTimeout(go, pause + 2800); return; }
  spoken.then(() => { if (autoToken === token) autoTimer = setTimeout(go, pause); });
}
function cancelAuto() { clearTimeout(autoTimer); autoToken = null; }

// Discovery card: the photo leaves its bubble (or puzzle) and grows into a big card.
let revealDone = null;
function showReveal(animal, from, keys, onDone) {
  const reveal = $('#reveal');
  $('#reveal-img').src = animal.photo; $('#reveal-img').alt = animal.name;
  $('#reveal-name').textContent = animal.name;
  const fact = nextFact(animal); reveal.dataset.fact = fact;
  $('#reveal-fact').textContent = animal.facts[fact - 1];
  $('#reveal-kicker').textContent = theme(animal.world)?.name || 'Nouvelle découverte';
  reveal.classList.remove('hidden'); reveal.dataset.animal = animal.id;
  revealDone = onDone;
  const photoBox = $('#reveal-photo');
  if (from) {
    const to = photoBox.getBoundingClientRect();
    const scale = (from.radius * 2) / to.width;
    photoBox.animate([
      { transform: `translate(${from.x - (to.left + to.width / 2)}px, ${from.y - (to.top + to.height / 2)}px) scale(${scale})` },
      { transform: 'translate(0, 0) scale(1.06)', offset: .75 },
      { transform: 'none' },
    ], { duration: 750, easing: 'cubic-bezier(.2,.8,.25,1)' });
  }
  autoAdvance(playVoice(...keys, `a/${animal.id}/fact-${fact}`), 1500, leaveReveal);
}
function leaveReveal() {
  window.VoiceBank?.stop(); hideReveal();
  const done = revealDone; revealDone = null; done?.();
}
function hideReveal() { cancelAuto(); $('#reveal').classList.add('hidden'); delete $('#reveal').dataset.animal; }
// Hearing the animal again restarts the wait instead of cutting Lila off.
function replayReveal(...keys) { if ($('#reveal').dataset.animal) autoAdvance(playVoice(...keys), 1500, leaveReveal); }

// Puzzle ------------------------------------------------------------------------

// The parent picks how many pieces (per child); the photo is cut accordingly.
const puzzleSizes = { 4: [2, 2], 6: [3, 2], 9: [3, 3], 12: [4, 3] };
function puzzleSize() { const size = Number(localStorage.getItem(playerKey('pe-puzzle-size')) || 6); return puzzleSizes[size] ? size : 6; }
function startPuzzle(world) {
  state.deck = world.collection ? shuffle(world.animals).slice(0, state.short ? 2 : 3) : pickDeck(world, state.short ? 2 : 3);
  $('#prompt-kicker').textContent = `${world.name} · Le puzzle`;
  if (!state.puzzle) {
    state.puzzle = new window.PuzzleGame($('#puzzle-canvas'), { onComplete: finishPuzzleRound, onMiss: puzzleMiss, onPlace: () => playSound('pop') });
    state.puzzle.onResize = () => state.puzzle.setObstacles(obstacles());
  }
  state.deck.forEach((item) => { item.image = photo(item); });
  setScreen('game');
  renderPuzzleSizes();
  renderPuzzleRound();
}
function renderPuzzleSizes() {
  const current = puzzleSize();
  $('#puzzle-sizes').replaceChildren(...Object.keys(puzzleSizes).map((size) => {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = `size-chip${Number(size) === current ? ' active' : ''}`;
    chip.textContent = size; chip.setAttribute('aria-label', `${size} pièces`); chip.setAttribute('aria-pressed', String(Number(size) === current));
    chip.addEventListener('click', () => {
      localStorage.setItem(playerKey('pe-puzzle-size'), size); renderPuzzleSizes();
      if (!state.busy) state.puzzle.start(currentTarget(), { columns: puzzleSizes[size][0], rows: puzzleSizes[size][1] });
    });
    return chip;
  }));
}
function renderPuzzleRound() {
  const target = currentTarget(); if (!target || !state.puzzle) return;
  if (theme()?.mix) setWorldScene(target.world);
  state.busy = false; state.round = { target, misses: 0, lastMissVoice: 0 };
  const animal = target.kind === 'animal';
  $('#prompt-title').textContent = animal ? capitalize(`Voici ${target.the} !`) : 'Un nouveau puzzle !';
  setHint('Fais glisser chaque pièce à sa place. Tu peux les poser où tu veux.');
  $('#listen-button').setAttribute('aria-label', `Réécouter : ${target.name}`);
  state.puzzle.setObstacles(obstacles());
  const [columns, rows] = puzzleSizes[puzzleSize()];
  state.puzzle.start(target, { columns, rows });
  const intro = state.firstRound && animal ? `t/${state.world}/intro` : null; state.firstRound = false;
  setTimeout(() => { if (state.round?.target === target && !state.busy) playVoice(intro, promptKey()); }, 300);
}
// A piece tried on the wrong spot: Lila says so (not every single time, to stay calm).
function puzzleMiss() {
  const round = state.round; round.misses += 1;
  setHint(['Attention, ce n’est pas à cet endroit-là. Essaie ailleurs !', 'Pas tout à fait… regarde bien la forme de la pièce.', 'Regarde le modèle pour trouver la bonne place.'][(round.misses - 1) % 3], 'gentle');
  if (Date.now() - round.lastMissVoice > 2500) { round.lastMissVoice = Date.now(); playVoice(`puzzle-miss-${[3, 1, 2][(round.misses - 1) % 3]}`); }
}
function finishPuzzleRound(item) {
  if (state.busy) return; state.busy = true;
  setHint('<b>Bravo !</b> Toutes les pièces sont à leur place.', 'success');
  playSound('success');
  if (item.kind !== 'animal') { autoAdvance(playVoice('puzzle-done'), 2500, nextRound); return; }
  discover(item.id);
  const canvas = $('#puzzle-canvas').getBoundingClientRect(); const b = state.puzzle.board;
  const from = { x: canvas.left + b.x + b.w / 2, y: canvas.top + b.y + b.h / 2, radius: Math.min(b.w, b.h) / 2 };
  setTimeout(() => showReveal(item, from, [`a/${item.id}/yes-2`], nextRound), 450);
}

// Memory ------------------------------------------------------------------------

function startMemory(world) {
  const pairs = Math.min(6, Math.max(3, Number(localStorage.getItem(playerKey('pe-memory-pairs')) || 3)));
  const chosen = pickDeck(world, pairs);
  if (world.mix) setWorldScene(chosen[0].world);
  const cards = shuffle(chosen.flatMap((animal) => [{ animal, cardId: `${animal.id}-a` }, { animal, cardId: `${animal.id}-b` }]));
  state.deck = chosen; state.memory = { cards, flipped: [], matched: new Set(), misses: 0 }; state.round = null;
  $('#prompt-kicker').textContent = `${world.name} · Les paires`;
  $('#prompt-title').textContent = 'Trouve les images pareilles';
  setHint('Retourne deux cartes. Si ce sont les mêmes, elles restent ouvertes !');
  drawMemoryCards(cards); setScreen('game');
  setTimeout(() => { if (!screens.game.classList.contains('hidden')) playVoice(`t/${world.id}/intro`, 'memory-start'); }, 300);
}
function drawMemoryCards(cards) {
  const board = $('#memory-board'); const cols = cards.length <= 6 ? 3 : cards.length === 10 ? 5 : 4;
  board.style.setProperty('--cols', cols); board.style.setProperty('--rows', Math.ceil(cards.length / cols));
  board.replaceChildren(...cards.map((card) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'memory-card';
    button.setAttribute('aria-label', 'Carte cachée'); button.dataset.id = card.cardId;
    button.innerHTML = `<span class="memory-face memory-back" aria-hidden="true">✧</span>
      <span class="memory-face memory-front" aria-hidden="true"><img src="${card.animal.photo}" alt="" draggable="false" /><span>${escapeHtml(card.animal.name)}</span></span>`;
    button.addEventListener('click', () => flipMemoryCard(button, card.animal));
    return button;
  }));
}
function flipMemoryCard(card, animal) {
  const memory = state.memory;
  if (!memory) return;
  if (card.classList.contains('matched')) { playVoice(factKey(animal)); return; }
  if (state.busy || card.classList.contains('flipped')) return;
  card.classList.add('flipped'); card.setAttribute('aria-label', animal.name); memory.flipped.push({ card, animal });
  if (memory.flipped.length < 2) return;
  state.busy = true; const [first, second] = memory.flipped;
  if (first.animal.id === second.animal.id) {
    for (const { card: matched } of memory.flipped) { matched.classList.add('matched'); matched.setAttribute('aria-label', `${animal.name}, paire trouvée. Touche pour écouter.`); }
    memory.matched.add(animal.id); discover(animal.id);
    setHint(`<b>${escapeHtml(animal.name)} !</b> Tu as trouvé la paire. Touche-la pour en savoir plus.`, 'success');
    playSound('success'); playVoice(`a/${animal.id}/yes-2`); memory.flipped = [];
    setTimeout(() => {
      state.busy = false;
      if (memory.matched.size === memory.cards.length / 2) {
        localStorage.setItem(playerKey('pe-memory-pairs'), String(Math.min(6, Number(localStorage.getItem(playerKey('pe-memory-pairs')) || 3) + 1)));
        setTimeout(finishGame, 1400);
      }
    }, 850);
  } else {
    memory.misses += 1; playSound('gentle');
    setHint(`Ça, c’est ${escapeHtml(first.animal.the)}, et ça, c’est ${escapeHtml(second.animal.the)}. Pas pareils !`, 'gentle');
    if (memory.misses % 2 === 1) playVoice(`memory-miss-${memory.misses % 4 === 1 ? 1 : 2}`);
    setTimeout(() => {
      first.card.classList.remove('flipped'); second.card.classList.remove('flipped');
      first.card.setAttribute('aria-label', 'Carte cachée'); second.card.setAttribute('aria-label', 'Carte cachée');
      memory.flipped = []; state.busy = false;
      if (memory.misses >= 6) localStorage.setItem(playerKey('pe-memory-pairs'), String(Math.max(3, Number(localStorage.getItem(playerKey('pe-memory-pairs')) || 3) - 1)));
    }, 1300);
  }
}

// Finish ------------------------------------------------------------------------

function finishGame() {
  state.engine?.pause(); state.puzzle?.pause(); window.VoiceBank?.stop(); hideReveal();
  const world = theme();
  $('#finish-kicker').textContent = world ? world.name : extraWorlds[state.world].name;
  $('#finish-title').textContent = capitalize(`Bravo, ${state.player || 'explorateur'} !`);
  $('#finish-copy').textContent = world
    ? (state.activity === 'memory' ? 'Tu as retrouvé toutes les paires.' : state.activity === 'puzzle' ? 'Tu as assemblé tous les puzzles.' : 'Regarde tout ce que tu as découvert.')
    : 'Tu as trouvé toutes les bulles.';
  $('#finish-gallery').replaceChildren(...(world ? state.deck : []).map((animal, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'finish-animal';
    button.style.setProperty('--photo', `url('${animal.photo}')`); button.style.animationDelay = `${.15 + i * .12}s`;
    button.innerHTML = `<span></span><b>${escapeHtml(animal.name)}</b>`;
    button.setAttribute('aria-label', `${animal.name}, écouter`);
    button.addEventListener('click', () => { if (animal.kind === 'animal') playVoice(factKey(animal)); });
    return button;
  }));
  const next = nextWorld(); const nextName = theme(next)?.name || extraWorlds[next].name;
  $('#finish-next-label').textContent = `En route : ${nextName.charAt(0).toLowerCase()}${nextName.slice(1)}`;
  setScreen('finish'); playSound('success');
  const outro = playVoice(world && !world.collection && !(window.VoiceBank?.isNamed('finish') && Math.random() < .5) ? `t/${world.id}/outro` : 'finish');
  // After a moment to look at the animals found, the adventure continues in the next world.
  autoAdvance(outro, 4500, () => { if (!screens.finish.classList.contains('hidden')) startWorld(next); });
}
function nextWorld() {
  if (extraWorlds[state.world]) return state.world === 'colors' ? 'numbers' : 'colors';
  const ids = worldsFor(state.activity).map((world) => world.id);
  return ids[(ids.indexOf(state.world) + 1) % ids.length];
}

function syncSoundButton() {
  $('#sound-toggle').textContent = state.sound ? '🔊' : '🔇';
  $('#sound-toggle').setAttribute('aria-label', state.sound ? 'Couper les sons' : 'Activer les sons');
}

// Players -----------------------------------------------------------------------

function savePlayers() {
  localStorage.setItem('pe-players', JSON.stringify(state.players));
  if (state.player) localStorage.setItem('pe-player', state.player); else localStorage.removeItem('pe-player');
}
function syncPlayer() {
  window.VoiceBank?.setPlayer(state.player);
  $('#player-name').textContent = state.player || 'Qui joue ?';
  $('#welcome-title').replaceChildren('Prêt à partir', document.createElement('br'), state.player ? `à l’aventure, ${state.player} ?` : 'à l’aventure ?');
  renderPlayers();
  if (!screens.worlds.classList.contains('hidden')) renderWorlds();
  if (!screens.album.classList.contains('hidden')) renderAlbum();
  renderAlbumCount();
}
function renderPlayers() {
  $('#player-list').replaceChildren(...state.players.map((name) => {
    const item = document.createElement('div'); item.className = `player-item${name === state.player ? ' active' : ''}`;
    const pickButton = document.createElement('button'); pickButton.type = 'button'; pickButton.className = 'player-pick';
    pickButton.textContent = name; pickButton.setAttribute('aria-pressed', String(name === state.player));
    if (window.VoiceBank?.hasName(name)) { const voiced = document.createElement('small'); voiced.textContent = '🔊'; voiced.title = 'Lila dit ce prénom'; pickButton.append(voiced); }
    pickButton.addEventListener('click', () => choosePlayer(name));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'player-remove';
    remove.textContent = '×'; remove.setAttribute('aria-label', `Retirer ${name}`);
    remove.addEventListener('click', () => removePlayer(name));
    item.append(pickButton, remove); return item;
  }));
}
function choosePlayer(name) {
  state.player = name; savePlayers(); syncPlayer();
  $('#player-modal').classList.add('hidden'); showToast(`C’est ${name} qui joue !`);
}
function addPlayer(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const existing = state.players.find((player) => player.toLowerCase() === name.toLowerCase());
  if (!existing) state.players.push(name);
  choosePlayer(existing || name);
}
function removePlayer(name) {
  if (!confirm(`Retirer ${name} de la liste ?`)) return;
  state.players = state.players.filter((player) => player !== name);
  if (state.player === name) state.player = null;
  savePlayers(); syncPlayer();
}

async function showCredits() {
  $('#credits-modal').classList.remove('hidden');
  if ($('#credits-list').childElementCount) return;
  try {
    const credits = await fetch('./content/credits.json').then((response) => response.json());
    const names = new Map(content.themes.flatMap((world) => [[`background-${world.id}`, `Paysage : ${world.name}`], ...world.animals.map((animal) => [animal.id, animal.name])]));
    for (const collection of collections.filter((item) => item.credit)) credits.push({ id: collection.name, url: collection.source, author: collection.credit, license: '' });
    $('#credits-list').replaceChildren(...credits.map((credit) => {
      const item = document.createElement('li');
      const link = document.createElement('a'); link.href = credit.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = names.get(credit.id) || credit.id;
      const license = credit.licenseUrl ? Object.assign(document.createElement('a'), { href: credit.licenseUrl, target: '_blank', rel: 'noopener', textContent: credit.license }) : document.createTextNode(credit.license);
      item.append(link, document.createTextNode(` — ${credit.author}${credit.license ? ', ' : ''}`), license);
      return item;
    }));
  } catch { $('#credits-list').textContent = 'Les crédits seront disponibles une fois le jeu connecté.'; }
}

// Wiring ------------------------------------------------------------------------

document.querySelectorAll('.game-card').forEach((button) => button.addEventListener('click', () => chooseActivity(button.dataset.activity)));
document.querySelectorAll('.extra-card').forEach((button) => button.addEventListener('click', () => startWorld(button.dataset.world)));
$('#worlds-back').addEventListener('click', () => setScreen('home'));
$('#album-button').addEventListener('click', () => setScreen('album'));
$('#album-back').addEventListener('click', () => setScreen('home'));
$('#finish-next').addEventListener('click', () => startWorld(nextWorld()));
$('#finish-worlds').addEventListener('click', () => setScreen('worlds'));
$('#back-button').addEventListener('click', () => setScreen('worlds'));
$('#portrait-back').addEventListener('click', () => setScreen('home'));
$('#finish-home').addEventListener('click', () => setScreen('home'));
$('#home-link').addEventListener('click', (event) => { event.preventDefault(); setScreen('home'); });
$('#listen-button').addEventListener('click', () => { if (state.round || state.activity === 'memory') playVoice(promptKey()); });
$('#puzzle-hint').addEventListener('click', () => { state.puzzle?.hint(); setHint('Regarde : la place qui brille attend une pièce.', 'gentle'); playVoice('puzzle-hint'); });
$('#reveal-next').addEventListener('click', leaveReveal);
$('#reveal-listen').addEventListener('click', () => { const { animal, fact } = $('#reveal').dataset; replayReveal(`a/${animal}/fact-${fact}`); });
$('#reveal-photo').addEventListener('click', () => { const { animal, fact } = $('#reveal').dataset; replayReveal(`a/${animal}/name-1`, `a/${animal}/fact-${fact}`); });
$('#sound-toggle').addEventListener('click', () => {
  state.sound = !state.sound; localStorage.setItem('pe-sound', state.sound ? 'on' : 'off'); syncSoundButton();
  if (!state.sound) window.VoiceBank?.stop();
  showToast(state.sound ? 'Le son est activé' : 'Le son est coupé');
});
for (const [button, modal] of [['#parent-button', '#parent-modal'], ['#player-button', '#player-modal']]) $(button).addEventListener('click', () => $(modal).classList.remove('hidden'));
$('#parent-button').addEventListener('click', renderMyImages);
$('#credits-button').addEventListener('click', () => { $('#parent-modal').classList.add('hidden'); showCredits(); });
for (const [close, modal] of [['#close-parent', '#parent-modal'], ['#close-player', '#player-modal'], ['#close-credits', '#credits-modal']]) {
  $(close).addEventListener('click', () => $(modal).classList.add('hidden'));
  $(modal).addEventListener('click', (event) => { if (event.target === $(modal)) $(modal).classList.add('hidden'); });
}
$('#voice-setting').checked = state.voice; $('#short-setting').checked = state.short;
$('#voice-setting').addEventListener('change', (event) => { state.voice = event.target.checked; localStorage.setItem('pe-voice', state.voice ? 'on' : 'off'); if (!state.voice) window.VoiceBank?.stop(); });
$('#short-setting').addEventListener('change', (event) => { state.short = event.target.checked; localStorage.setItem('pe-short', state.short ? 'on' : 'off'); });
$('#player-button').addEventListener('click', () => { if (!state.players.length) $('#player-input').focus(); });
$('#player-form').addEventListener('submit', (event) => { event.preventDefault(); addPlayer($('#player-input').value); $('#player-input').value = ''; });
syncSoundButton();
syncPlayer();
window.VoiceBank?.ready.then(syncPlayer);

// Keep the browser's own gestures out of the game: long-press menus, selection, dragging, pinch zoom.
const editable = (target) => target instanceof Element && target.closest('input, textarea');
document.addEventListener('contextmenu', (event) => { if (!editable(event.target)) event.preventDefault(); });
document.addEventListener('selectstart', (event) => { if (!editable(event.target)) event.preventDefault(); });
document.addEventListener('dragstart', (event) => event.preventDefault());
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (event) => event.preventDefault());

fetch('./content/animals.json').then((response) => response.json()).then((data) => {
  for (const world of data.themes) for (const animal of world.animals) Object.assign(animal, { kind: 'animal', short: animal.name, world: world.id, photo: `./assets/animals/${animal.id}.webp` });
  // The mix draws from every other world.
  for (const mix of data.themes.filter((world) => world.mix)) mix.animals = data.themes.filter((world) => !world.mix).flatMap((world) => world.animals);
  content = data; renderWorlds(); renderAlbumCount();
}).catch(() => showToast('Impossible de charger les animaux'));

// Picture collections for the puzzle: Totoro (content/puzzles.json) and the parent's own pictures.
const toItem = (collection) => (picture) => ({ ...picture, short: picture.name, kind: 'image', world: collection.id, photo: picture.photo || `./assets/puzzles/${picture.id}.webp` });
const myImages = { id: 'mes-images', name: 'Mes images', accent: '#c0864f', group: 'plus', collection: true, animals: [] };
async function loadMyImages() {
  try { myImages.animals = (await window.MyImages.list()).map(toItem(myImages)); } catch { myImages.animals = []; }
  renderWorlds();
}
fetch('./content/puzzles.json').then((response) => response.json()).then((data) => {
  collections = [...data.collections.map((collection) => ({ ...collection, group: 'plus', collection: true, animals: collection.images.map(toItem(collection)) })), myImages];
  renderWorlds(); loadMyImages();
}).catch(() => {});
async function renderMyImages() {
  await loadMyImages();
  $('#my-images-grid').replaceChildren(...myImages.animals.map((picture) => {
    const tile = document.createElement('div'); tile.className = 'my-image'; tile.style.setProperty('--photo', `url('${picture.photo}')`);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Retirer ${picture.name}`);
    remove.addEventListener('click', async () => { if (confirm('Retirer cette image des puzzles ?')) { await window.MyImages.remove(picture.id); renderMyImages(); } });
    tile.append(remove); return tile;
  }));
}
$('#my-images-input').addEventListener('change', async (event) => {
  const files = [...event.target.files]; event.target.value = '';
  for (const file of files) { try { await window.MyImages.add(file); } catch { showToast('Cette image n’a pas pu être ajoutée'); } }
  if (files.length) showToast(files.length > 1 ? `${files.length} images ajoutées` : 'Image ajoutée');
  renderMyImages();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
