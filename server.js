const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'blessings-state.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================================
// 1. DAILY VERSE DECK (King James Version — public domain in the US)
// ============================================================================
const VERSE_DECK = [
  {
    number: 1,
    theme: 'LOVE',
    reference: 'John 3:16',
    title: 'God So Loved the World',
    text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    reflection: 'You are loved more than you know. Carry that love into everything you do today.'
  },
  {
    number: 2,
    theme: 'COMFORT',
    reference: 'Psalm 23:4',
    title: 'The Lord Is My Shepherd',
    text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
    reflection: 'Even in the darkest valley, you do not walk alone.'
  },
  {
    number: 3,
    theme: 'STRENGTH',
    reference: 'Philippians 4:13',
    title: 'Strength in Christ',
    text: 'I can do all things through Christ which strengtheneth me.',
    reflection: 'Whatever you are facing today, you do not face it in your own strength.'
  },
  {
    number: 4,
    theme: 'HOPE',
    reference: 'Jeremiah 29:11',
    title: 'Plans of Peace',
    text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
    reflection: 'God holds your future. Rest in his plans, not your worries.'
  },
  {
    number: 5,
    theme: 'COURAGE',
    reference: 'Isaiah 41:10',
    title: 'Fear Not',
    text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee.',
    reflection: 'Take a deep breath. He is with you, and he will help you.'
  },
  {
    number: 6,
    theme: 'TRUST',
    reference: 'Proverbs 3:5-6',
    title: 'Trust in the Lord',
    text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
    reflection: 'You do not have to figure it all out. Take the next step and trust him with the rest.'
  },
  {
    number: 7,
    theme: 'REST',
    reference: 'Matthew 11:28',
    title: 'Come and Rest',
    text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
    reflection: 'If you are tired tonight, this invitation is for you.'
  },
  {
    number: 8,
    theme: 'PEACE',
    reference: 'John 14:27',
    title: 'My Peace I Give You',
    text: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.',
    reflection: 'A peace the world cannot give is yours tonight.'
  },
  {
    number: 9,
    theme: 'COURAGE',
    reference: 'Joshua 1:9',
    title: 'Be Strong and Courageous',
    text: 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
    reflection: 'Wherever you go this week, he goes with you.'
  },
  {
    number: 10,
    theme: 'REFUGE',
    reference: 'Psalm 46:1',
    title: 'A Very Present Help',
    text: 'God is our refuge and strength, a very present help in trouble.',
    reflection: 'When life shakes, he is the one place that does not move.'
  }
];

// ============================================================================
// 2. SPEECH NOTE
// The server no longer synthesizes audio. Voice lines (ttsText) travel with each
// event and the browser reads them aloud with the Web Speech API (en-US).
// ============================================================================
function getTtsStatus() {
  return { engine: 'Browser Web Speech API (en-US)', status: 'client-side' };
}

// ============================================================================
// 3. SANCTUARY STATE & BLESSINGS LEADERBOARD
// ============================================================================
const DEFAULT_STATE = {
  totalCandles: 108,
  totalBlessings: 1080,
  amenCount: 360,
  bellRings: 36,
  prayerCount: 18,
  verseCount: 12,
  activeCandles: 9,
  haloIntensity: 0.45,
  offerings: {
    lily: 3,
    dove: 2,
    candle: 2,
    hallelujah: 1
  },
  devotees: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: '',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Could not read blessings-state.json, using defaults:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalCandles: state.totalCandles,
      totalBlessings: state.totalBlessings,
      amenCount: state.amenCount,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      verseCount: state.verseCount,
      activeCandles: state.activeCandles,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Failed to save state:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.devotees)
    .sort((a, b) => b.blessings - a.blessings)
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      blessings: d.blessings,
      candles: d.candles || 0,
      lastWish: d.lastWish || ''
    }));
}

// Moderation: everything a viewer types can be read aloud on stream, so be strict.
// Blocks weird-unicode spam, profanity, links/promos, and mocking of faith.
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}﷽⠀-⣿▀-▟]|[̀-ͯ]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_TEXT_RE = /[^0-9A-Za-zÀ-ÿ\s.,!?'’:;-]/g;
const ALLOWED_NAME_RE = /[^0-9A-Za-zÀ-ÿ\s._-]/g;
const LETTER_RE = /[A-Za-zÀ-ÿ]/g;
const BAD_WORDS_RE = new RegExp(
  [
    '\\b(fuck\\w*|shit\\w*|bitch\\w*|asshole|dick|cunt|pussy|nigg\\w*|fag\\w*|retard\\w*|slut|whore|porn\\w*|sex|nazi|kys)\\b',
    'kill yourself|burn in hell|sky daddy|fairy ?tale|satan|antichrist|\\b666\\b',
    '(jesus|christ|god|bible)\\W+(is\\W+)?(fake|a myth|a lie|not real|dead|stupid)',
    'telegram|whatsapp|cash ?app|crypto|free followers|http|www\\.|\\.com'
  ].join('|'),
  'i'
);

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'Friend';
  }
  const letters = normalized.match(LETTER_RE) || [];
  if (letters.length < 2) {
    return 'Friend';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

function recordDevotee(user, uniqueId, avatar, blessingsDelta, candlesDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      blessings: 0,
      candles: 0,
      gifts: 0,
      lastWish: ''
    };
  }
  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.blessings += blessingsDelta;
  dev.candles += candlesDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;

  state.totalBlessings += blessingsDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalBlessings % 1000) / 1400);
  return dev;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function getPublicState() {
  return {
    totalCandles: state.totalCandles,
    totalBlessings: state.totalBlessings,
    amenCount: state.amenCount,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    verseCount: state.verseCount,
    activeCandles: state.activeCandles,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: getTtsStatus()
  };
}

// ============================================================================
// 4. INTERACTION HANDLERS (RITUALS)
// ============================================================================
const Rituals = {
  lightCandle(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'Lord, bring peace and comfort to every heart tonight';
    const blessings = count * 5;

    state.totalCandles += count;
    state.activeCandles = Math.min(36, state.activeCandles + count);
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, count, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Thank you, ${devotee.name}, for lighting ${count === 1 ? 'a candle' : count + ' candles'}. ${wish}.`;

    const event = pushEventLog({
      type: 'lightCandle',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      blessings,
      wish,
      ttsText
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  sayAmen(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const blessings = count;

    state.amenCount += count;
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, 0, 0);

    const event = pushEventLog({
      type: 'sayAmen',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      blessings,
      ttsText: params.ttsText || ''
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'Let the bells ring out with joy and hope';
    const blessings = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, 0, 0, wish);

    const ttsText = params.readTts
      ? `${devotee.name} rings the church bell: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      blessings,
      wish,
      ttsText
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Please watch over our families and bring us peace';
    const blessings = 10;

    state.prayerCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, 1, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `A prayer from ${devotee.name}: ${wish}. Amen.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      wish,
      blessings,
      ttsText
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftType = ['lily', 'dove', 'candle', 'hallelujah'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'hallelujah' : coins >= 20 ? 'dove' : coins >= 5 ? 'candle' : 'lily');

    const giftLabels = {
      lily: 'White Lily Bouquet',
      dove: 'Dove of Peace',
      candle: 'Prayer Candle',
      hallelujah: 'Hallelujah Celebration'
    };
    const giftName = params.giftName || giftLabels[giftType];
    const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
    const blessings = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalCandles += 3;
    state.activeCandles = Math.min(36, state.activeCandles + 3);

    const wish = params.wish || `Sent a blessing with ${giftName}`;
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, 3, 1, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Thank you, ${devotee.name}, for the ${giftName}. May God bless you and your family with peace and joy.`;

    const event = pushEventLog({
      type: giftType === 'hallelujah' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      giftType,
      giftName,
      coins,
      blessings,
      wish,
      ttsText
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  drawVerse(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'Peace, hope and strength';
    const verse = VERSE_DECK[Math.floor(Math.random() * VERSE_DECK.length)];
    const blessings = 10;

    state.verseCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, blessings, 0, 0, `Drew ${verse.reference}`);

    const ttsText = params.readTts === false
      ? ''
      : `${devotee.name} drew ${verse.reference}. ${verse.text}`;

    const event = pushEventLog({
      type: 'drawVerse',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      topic,
      verse,
      blessings,
      ttsText
    });

    saveState();
    broadcastNotification('church.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'hallelujah',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'Hallelujah Celebration'
    });
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('church.state', getPublicState());
    return getPublicState();
  },

  resetBlessings() {
    state.totalCandles = 9;
    state.totalBlessings = 0;
    state.amenCount = 0;
    state.bellRings = 0;
    state.prayerCount = 0;
    state.verseCount = 0;
    state.activeCandles = 3;
    state.offerings = { lily: 1, dove: 1, candle: 1, hallelujah: 0 };
    state.devotees = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('church.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;

const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  // Per-user cooldown (3.5s) so one viewer cannot flood the voice queue
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. Daily verse
  if (/\b(verse|scripture|bible|word of god)\b/.test(lower)) {
    return Rituals.drawVerse({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. Church bell
  if (/\b(bell|bells|ring)\b/.test(lower)) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. Amen / praise
  if (/\b(amen|praise|hallelujah|alleluia)\b/.test(lower)) {
    return Rituals.sayAmen({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. Light a candle
  if (/\b(candle|candles)\b/.test(lower)) {
    return Rituals.lightCandle({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. Prayer request (the viewer's own words are read aloud)
  if (/\b(pray|prayer|prayers|bless|blessing|blessed|peace|hope|faith|heal|healing|protect|guide|jesus|lord|god|thank)\b/.test(lower)) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  // Anything else: light one candle with a generic line (the viewer's text is NOT read aloud)
  return Rituals.lightCandle({ user: cleanUser, uniqueId, avatar, count: 1 });
}

const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Enter a TikTok @username or Live link to connect');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Friend';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('No valid @username found in the input');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('church.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Connected to @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('church.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Disconnected from @${cleanUser}`);
    broadcastNotification('church.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('church.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('church.viewerCount', { viewerCount });
    }
  });

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'Joined the sanctuary');
    broadcastNotification('church.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    Rituals.sayAmen({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'Glad to be here, praying for peace and blessings',
      readTts: false
    });
  };
  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || {};
    const giftId = String(data?.giftId || giftObj?.id || 'rose');
    const groupId = String(data?.groupId || `${uniqueId}_${giftId}`);
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));

    const prevCount = giftComboTracker.get(groupId) || 0;
    if (repeatCount <= prevCount && data?.repeatEnd) {
      giftComboTracker.delete(groupId);
      return;
    }
    const deltaCount = Math.max(1, repeatCount - prevCount);
    giftComboTracker.set(groupId, repeatCount);
    if (giftComboTracker.size > 500) {
      const firstKey = giftComboTracker.keys().next().value;
      giftComboTracker.delete(firstKey);
    }

    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
    const totalCoins = diamondCount * deltaCount;
    const rawGiftName = giftObj?.name || data?.giftName || giftObj?.describe || 'Rose';
    const displayGiftName = deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName;

    console.log(`[TikTok Gift] ${user} sent ${displayGiftName} (${totalCoins} coins)`);

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      coins: totalCoins,
      giftName: displayGiftName,
      wish: `Sent a blessing with ${displayGiftName}`
    });
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('church.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Could not connect to the Live room (is the account live right now?)';
    broadcastNotification('church.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('church.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (DEMO MODE — fake viewers for testing / quiet rooms)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'Grace Miller', uniqueId: 'grace.miller', wish: 'Please keep my parents healthy and safe' },
  { user: 'Daniel Carter', uniqueId: 'dcarter_77', wish: 'Pray for peace and good news in our family this month' },
  { user: 'Hannah Brooks', uniqueId: 'hannah_b', wish: 'Lord, bless every person watching tonight' },
  { user: 'Michael Reyes', uniqueId: 'mike.reyes', wish: 'Pray for strength as I start my new job' },
  { user: 'Sarah Thompson', uniqueId: 'sarah.t', wish: 'Thank you God for another beautiful day' },
  { user: 'Joshua Bennett', uniqueId: 'josh_bennett', wish: 'Give me a verse for today' }
];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const roll = Math.random();
  if (roll < 0.30) {
    Rituals.lightCandle({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.55) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.75) {
    Rituals.drawVerse({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.90) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lily', coins: 15, giftName: 'White Lily Bouquet' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'church.getState':
      return getPublicState();
    case 'church.lightCandle':
      return Rituals.lightCandle(params);
    case 'church.sayAmen':
      return Rituals.sayAmen(params);
    case 'church.ringBell':
      return Rituals.ringBell(params);
    case 'church.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'church.offerGift':
      return Rituals.offerGift(params);
    case 'church.drawVerse':
      return Rituals.drawVerse(params);
    case 'church.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'church.updateSettings':
      return Rituals.updateSettings(params);
    case 'church.resetBlessings':
      return Rituals.resetBlessings();
    case 'church.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'church.speak': {
      const text = sanitizeWishText(params.text);
      if (!text) throw new Error('Nothing to say (empty or blocked text)');
      broadcastNotification('tts.play', { text });
      return { ok: true, text };
    }
    case 'church.ttsStatus':
      return getTtsStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('church.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`JSON-RPC method not found: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: missing method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'church.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

server.listen(PORT, () => {
  console.log('============================================================');
  console.log('CHURCH LIVE — TIKTOK LIVE RPC STARTED');
  console.log(`Live screen (9:16 OBS): http://localhost:${PORT}  (add ?obs=1 for clean OBS mode)`);
  console.log(`RPC admin panel       : http://localhost:${PORT}/admin`);
  console.log(`JSON-RPC 2.0 endpoint : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log('============================================================');

  // Auto-connect only when you explicitly set TIKTOK_USER (never to someone else's room by default)
  const defaultChannel = process.env.TIKTOK_USER;
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Not connected yet:`, err.message);
    });
  }
});
