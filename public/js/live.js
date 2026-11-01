/**
 * Live 9:16 client controller — chapel sanctuary
 * - 6 front-row kneelers (top 6 on the Faithful Hearts leaderboard)
 * - 40-seat congregation + name tags for the next viewers
 * - Viewers walk up the aisle, kneel and pray at the candle stand
 * - Voice lines read with the browser's Web Speech API (en-US) + synthesized chapel sounds
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. Scale the 1080x1920 stage to fit the 9:16 wrapper
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');

  function fitStage() {
    if (!stageWrapper || !stage9x16) return;
    const rect = stageWrapper.getBoundingClientRect();
    const scale = rect.width / 1080;
    stage9x16.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // 2. Particle engine & audio engine
  const canvas = document.getElementById('effectsCanvas');
  const particles = new window.ChapelParticleEngine(canvas);
  const audio = new window.ChapelAudioEngine();

  function unlockAudioOnce() {
    audio.ensureContext();
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '✅ Sound & Voice Ready';
      btnUnlock.classList.remove('gold');
      btnUnlock.classList.add('active-toggle');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // 3. Draw the burning candles on the candle stand (centered at x=540, base y=895)
  const candleHolder = document.getElementById('candleHolder');
  let renderedStickCount = 0;

  function renderCandles(count) {
    const target = Math.max(3, Math.min(27, Number(count) || 9));
    if (target === renderedStickCount && candleHolder.children.length > 0) return;
    renderedStickCount = target;
    candleHolder.innerHTML = '';

    const PER_TIER = 9;
    const tips = [];
    for (let i = 0; i < target; i++) {
      const tier = Math.floor(i / PER_TIER);
      const inTier = i % PER_TIER;
      const tierCount = Math.min(PER_TIER, target - tier * PER_TIER);
      const spread = tierCount === 1 ? 0 : (inTier / (tierCount - 1) - 0.5) * 2;
      const leftPx = 65 + spread * 56 - 5;
      const heightPx = 40 + ((i * 7) % 3) * 4;
      const bottomPx = tier * 26;

      const stick = document.createElement('div');
      stick.className = 'candle-stick';
      stick.style.left = `${leftPx}px`;
      stick.style.height = `${heightPx}px`;
      stick.style.bottom = `${bottomPx}px`;

      const flame = document.createElement('div');
      flame.className = 'candle-flame';
      flame.style.animationDelay = `${(i * 0.15) % 1.1}s`;
      stick.appendChild(flame);
      candleHolder.appendChild(stick);

      tips.push({ x: 540 + (leftPx + 5 - 65), y: 895 - bottomPx - heightPx - 14 });
    }
    particles.setCandleTips(tips);
  }

  // 4. Front row: 6 kneelers for the top 6 viewers (y=1188)
  const VIP_CUSHION_COORDS = [
    { x: 140, y: 1188, rank: 1 },
    { x: 268, y: 1188, rank: 2 },
    { x: 392, y: 1188, rank: 3 },
    { x: 688, y: 1188, rank: 4 },
    { x: 812, y: 1188, rank: 5 },
    { x: 940, y: 1188, rank: 6 }
  ];

  function renderVipCushions(leaderboard = []) {
    const layer = document.getElementById('vipCushionsLayer');
    if (!layer) return;

    layer.innerHTML = VIP_CUSHION_COORDS.map((slot, idx) => {
      const dev = leaderboard[idx];
      if (!dev) return '';
      return `
        <div class="vip-devotee-slot" style="left: ${slot.x}px; top: ${slot.y}px; z-index: ${12 + idx};">
          <img src="/assets/devotee.png" alt="Front row member" class="devotee-sprite" />
          <div class="vip-rank-pill">
            <span class="vip-rank-num">${slot.rank}</span>
            <span class="vip-rank-name">${escapeHtml(shortenName(dev.name, 12))}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Congregation: 40 seats on both sides of the aisle (5 rows x 4 columns per side)
  const congregationHall = document.getElementById('congregationHall');
  const HALL_SEAT_COORDS = [];

  (function buildHallGrid() {
    const rows = 5;
    const colsPerSide = 4;
    for (let r = 0; r < rows; r++) {
      const progress = r / (rows - 1); // 0 (far) -> 1 (near)
      const y = Math.round(1290 + progress * 355); // 1290 -> 1645
      const scale = +(0.76 + progress * 0.28).toFixed(2);

      // Left side of the aisle
      const leftInnerX = Math.round(335 - progress * 48); // aisle edge widens toward the viewer
      const leftOuterX = 48;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(leftOuterX + t * (leftInnerX - leftOuterX));
        HALL_SEAT_COORDS.push({ side: 'L', row: r, col: c, x, y, scale });
      }

      // Right side of the aisle
      const rightInnerX = Math.round(745 + progress * 48);
      const rightOuterX = 1032;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(rightInnerX + t * (rightOuterX - rightInnerX));
        HALL_SEAT_COORDS.push({ side: 'R', row: r, col: c, x, y, scale });
      }
    }
  })();

  let lastRenderedLeaderboardJson = '';

  function renderCongregationHall(leaderboard = []) {
    if (!congregationHall) return;
    // Viewers ranked 7th and below sit in the congregation
    const hallViewers = leaderboard.slice(6);
    const sig = JSON.stringify(hallViewers.map((d) => `${d.name}:${d.blessings}`));
    if (sig === lastRenderedLeaderboardJson && congregationHall.children.length > 0) return;
    lastRenderedLeaderboardJson = sig;

    // Name tags go on the seats closest to the aisle first
    const labeledSeatIndices = [
      3, 4, 11, 12, 19, 20, 27, 28, 35, 36, 2, 5, 10, 13, 18, 21, 26, 29
    ];
    const seatViewerMap = new Map();
    hallViewers.forEach((viewer, idx) => {
      if (idx < labeledSeatIndices.length) {
        seatViewerMap.set(labeledSeatIndices[idx], viewer);
      }
    });

    congregationHall.innerHTML = HALL_SEAT_COORDS.map((seat, idx) => {
      const viewer = seatViewerMap.get(idx);
      const badgeHtml = viewer
        ? `
          <div class="seat-badge">
            <span class="seat-avatar">${
              viewer.avatar
                ? `<img src="${escapeHtml(viewer.avatar)}" alt="" />`
                : escapeHtml(String(viewer.name || 'P').charAt(0).toUpperCase())
            }</span>
            <span class="seat-username">${escapeHtml(shortenName(viewer.name, 11))}</span>
          </div>
        `
        : '';

      return `
        <div
          class="hall-seat"
          data-seat-idx="${idx}"
          style="left: ${seat.x}px; top: ${seat.y}px; z-index: ${20 + seat.row * 2}; transform: translate(-50%, -100%) scale(${seat.scale});"
        >
          <img
            src="/assets/devotee.png"
            alt="Congregation member"
            class="devotee-sprite"
            style="animation-delay: ${((idx * 0.27) % 3.5).toFixed(2)}s;"
          />
          ${badgeHtml}
        </div>
      `;
    }).join('');
  }

  // Preload every pose so frame swaps are instant
  const SPRITE_FRAMES = {
    walk1: '/assets/devotee_walk.png',
    walk2: '/assets/devotee_walk_2.png',
    kneelDown: '/assets/devotee_kneel_down.png',
    kneel: '/assets/devotee.png',
    forehead: '/assets/devotee_bow.png',
    bowMid: '/assets/devotee_bow_mid.png'
  };
  Object.values(SPRITE_FRAMES).forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  // A quarter of the congregation bows their heads for a moment
  function pulseHallPraying() {
    if (!congregationHall) return;
    const seats = congregationHall.querySelectorAll('.hall-seat');
    seats.forEach((el, i) => {
      if (i % 4 !== 0) return;
      const img = el.querySelector('.devotee-sprite');
      if (!img) return;
      setTimeout(() => { img.src = SPRITE_FRAMES.forehead; }, 60);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, 700);
      setTimeout(() => { img.src = SPRITE_FRAMES.kneel; }, 1500);
    });
  }

  let prostrationTimers = [];
  function clearProstrationTimers() {
    while (prostrationTimers.length > 0) {
      clearTimeout(prostrationTimers.pop());
    }
  }

  // Instant switch between pre-decoded pose frames (no flicker)
  function setCentralPose(poseKey) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    const frames = stack.querySelectorAll('.pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  function schedulePose(ms, poseKey) {
    prostrationTimers.push(
      setTimeout(() => {
        setCentralPose(poseKey);
      }, ms)
    );
  }

  // Prayer sequence: kneel down, fold hands, bow head in prayer, then look up
  function playPrayerSequence(startDelayMs = 0) {
    schedulePose(startDelayMs, 'kneelDown');
    schedulePose(startDelayMs + 160, 'kneel');
    schedulePose(startDelayMs + 700, 'forehead');
    schedulePose(startDelayMs + 2600, 'bowMid');
    schedulePose(startDelayMs + 3300, 'forehead');
    schedulePose(startDelayMs + 5000, 'kneel');
  }

  // A viewer walks up the aisle, then kneels to pray (same sprite stack, no flicker)
  function animateWalkerOnCarpet(user, avatar, actionLabel, wish) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;

    clearProstrationTimers();
    updateCentralWorshipper(user, avatar, actionLabel, wish, false);

    // Start walking from the back of the aisle to the altar
    centralEl.classList.remove('walking-up');
    void centralEl.offsetWidth;
    centralEl.classList.add('walking-up');

    setCentralPose('walk1');
    for (let step = 1; step <= 10; step++) {
      schedulePose(step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
    }

    // On arrival at the candle stand (2.05s): stop, kneel and begin praying
    prostrationTimers.push(
      setTimeout(() => {
        centralEl.classList.remove('walking-up');
      }, 2100)
    );
    playPrayerSequence(2050);
  }

  function updateCentralWorshipper(user, avatar, actionLabel, wish, doPrayer = true) {
    const nameEl = document.getElementById('centralName');
    const actEl = document.getElementById('centralAction');
    const wishEl = document.getElementById('centralWishBubble');
    const avatarEl = document.getElementById('centralAvatar');
    const beam = document.getElementById('sacredLightBeam');

    if (nameEl) nameEl.textContent = user || 'Friend';
    if (actEl) actEl.textContent = actionLabel || '🕯️ Lit a candle';
    if (wishEl) wishEl.textContent = `“${wish || 'Lord, bring peace and comfort to every heart tonight'}”`;

    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
      } else {
        avatarEl.textContent = String(user || '🙏').trim().charAt(0).toUpperCase();
      }
    }

    if (doPrayer) {
      clearProstrationTimers();
      const centralEl = document.getElementById('centralWorshipper');
      if (centralEl) centralEl.classList.remove('walking-up');
      playPrayerSequence(0);
    }
    if (beam) {
      beam.classList.add('intense');
      setTimeout(() => beam.classList.remove('intense'), 4500);
    }

    const haloSys = document.getElementById('radianceHaloSystem');
    const altarGlowEl = document.getElementById('altarGlow');
    if (haloSys) {
      haloSys.classList.add('flare');
      setTimeout(() => haloSys.classList.remove('flare'), 3600);
    }
    if (altarGlowEl) {
      altarGlowEl.classList.add('flare');
      setTimeout(() => altarGlowEl.classList.remove('flare'), 3600);
    }
    particles.spawnBellWave(540, 260, 2);

    // Update the notice line in the bottom HUD
    const hudName = document.getElementById('devoteeNameLine');
    const hudAct = document.getElementById('devoteeActionTag');
    if (hudName) hudName.textContent = user || 'Friend';
    if (hudAct) hudAct.textContent = actionLabel || 'Lit a candle';
  }

  // 6. Update the whole UI from server state
  let hasInitializedRealLeader = false;

  function updateUIState(st) {
    if (!st) return;

    document.getElementById('statCandles').textContent = Number(st.totalCandles || 0).toLocaleString('en-US');
    document.getElementById('statBlessings').textContent = Number(st.totalBlessings || 0).toLocaleString('en-US');
    document.getElementById('statAmen').textContent = Number(st.amenCount || 0).toLocaleString('en-US');

    renderCandles(st.activeCandles || 9);

    const lb = Array.isArray(st.leaderboard) ? st.leaderboard : [];
    renderVipCushions(lb);
    renderCongregationHall(lb);

    // Feature the real leaderboard leader until a new event arrives
    if (!hasInitializedRealLeader && lb.length > 0) {
      hasInitializedRealLeader = true;
      const topDev = lb[0];
      updateCentralWorshipper(
        topDev.name,
        topDev.avatar,
        `✨ ${Number(topDev.blessings).toLocaleString('en-US')} blessings`,
        topDev.lastWish || 'Lord, bring peace and comfort to every heart tonight',
        false
      );
    }

    // Faithful Hearts leaderboard, bottom right (top 4)
    const lbList = document.getElementById('leaderboardList');
    if (lbList) {
      lbList.innerHTML = lb
        .slice(0, 4)
        .map(
          (item) => `
          <div class="leader-item">
            <span class="leader-rank">${item.rank}</span>
            <span class="leader-name">${escapeHtml(shortenName(item.name, 14))}</span>
            <span class="leader-merit">${Number(item.blessings).toLocaleString('en-US')}</span>
          </div>
        `
        )
        .join('');
    }

    // TikTok Live connection status
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveStatusText');
    if (st.tiktok?.connected) {
      liveDot.classList.add('connected');
      liveText.textContent = `LIVE @${st.tiktok.username} • ${st.tiktok.viewerCount || 0} watching`;
    } else if (st.tiktok?.connecting) {
      liveDot.classList.remove('connected');
      liveText.textContent = `Connecting to @${st.tiktok.username}...`;
    } else {
      liveDot.classList.remove('connected');
      liveText.textContent = st.settings?.autoSim
        ? 'GRACE CHAPEL LIVE • DEMO MODE'
        : 'GRACE CHAPEL LIVE • JOIN US IN PRAYER';
    }

    const btnAutoSim = document.getElementById('btnToggleAutoSim');
    if (btnAutoSim && st.settings) {
      btnAutoSim.textContent = st.settings.autoSim
        ? '🤖 Demo mode (fake viewers): ON'
        : '🤖 Demo mode (fake viewers): OFF';
      btnAutoSim.classList.toggle('active-toggle', Boolean(st.settings.autoSim));
    }
    if (st.settings) {
      if (typeof st.settings.musicVolume === 'number') {
        audio.setMusicVolume(st.settings.musicVolume);
        const sMus = document.getElementById('sliderMusicVol');
        const vMus = document.getElementById('valMusicVol');
        const pct = Math.round(st.settings.musicVolume * 100);
        if (sMus) sMus.value = String(pct);
        if (vMus) vMus.textContent = `${pct}%`;
      }
      if (typeof st.settings.ttsVolume === 'number') {
        audio.setTtsVolume(st.settings.ttsVolume);
        const sTts = document.getElementById('sliderTtsVol');
        const vTts = document.getElementById('valTtsVol');
        const pct = Math.round(st.settings.ttsVolume * 100);
        if (sTts) sTts.value = String(pct);
        if (vTts) vTts.textContent = `${pct}%`;
      }
    }


    const feed = document.getElementById('eventFeed');
    if (feed && Array.isArray(st.recentEvents)) {
      feed.innerHTML = st.recentEvents
        .slice(0, 8)
        .map((ev) => `<div class="event-feed-item">${formatEventSummary(ev)}</div>`)
        .join('');
    }
  }

  function formatEventSummary(ev) {
    switch (ev.type) {
      case 'lightCandle':
        return `🕯️ <strong>${escapeHtml(ev.user)}</strong> lit ${ev.count} ${ev.count === 1 ? 'candle' : 'candles'} (+${ev.blessings})`;
      case 'sayAmen':
        return `🙌 <strong>${escapeHtml(ev.user)}</strong> said Amen ×${ev.count} (+${ev.blessings})`;
      case 'ringBell':
        return `🔔 <strong>${escapeHtml(ev.user)}</strong> rang the church bell (+${ev.blessings})`;
      case 'sendPrayer':
        return `🙏 <strong>${escapeHtml(ev.user)}</strong> prayed: “${escapeHtml(ev.wish)}”`;
      case 'offerGift':
      case 'grandCeremony':
        return `💐 <strong>${escapeHtml(ev.user)}</strong> sent <em>${escapeHtml(ev.giftName)}</em> (+${ev.blessings})`;
      case 'drawVerse':
        return `📖 <strong>${escapeHtml(ev.user)}</strong> drew ${escapeHtml(ev.verse?.reference || 'a verse')}`;
      default:
        return `✨ <strong>${escapeHtml(ev.user || 'Friend')}</strong> joined in`;
    }
  }

  // 7. Visual + audio effects for each new interaction
  let verseTimer = null;
  let grandTimer = null;

  function triggerRitualVisuals(ev) {
    if (!ev) return;

    if (ev.ttsText && ev.type !== 'drawVerse') {
      audio.enqueueTts(ev.ttsText);
    }

    switch (ev.type) {
      case 'lightCandle': {
        audio.playCandleChime();
        particles.spawnCandleBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.blessings} Blessings`, 540, 860, '#ffe9a8');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🕯️ Lit ${ev.count} ${ev.count === 1 ? 'candle' : 'candles'} (+${ev.blessings})`, ev.wish);
        break;
      }

      case 'sayAmen': {
        audio.playAmenTap();
        pulseHallPraying();
        particles.spawnFloatingMerit(`+${ev.blessings} Blessings`, 890, 935, '#ffe9a8');
        break;
      }

      case 'ringBell': {
        audio.playChurchBell(1.0);
        pulseHallPraying();
        particles.spawnBellWave(540, 510, 4);
        particles.spawnFloatingMerit(`+${ev.blessings} Blessings`, 190, 935, '#fff3c4');
        updateCentralWorshipper(ev.user, ev.avatar, `🔔 Rang the church bell (+${ev.blessings})`, ev.wish);
        break;
      }

      case 'sendPrayer': {
        audio.playCandleChime();
        spawnPrayerRequest(ev.user, ev.wish);
        particles.spawnFloatingMerit(`+${ev.blessings} Blessings`, 540, 920, '#ffe9a8');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🙏 Prayer request (+${ev.blessings})`, ev.wish);
        break;
      }

      case 'offerGift': {
        audio.playCandleChime();
        audio.playChurchBell(0.8);
        particles.spawnCandleBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.blessings} Blessings`, 540, 840, '#fff3c4');
        animateWalkerOnCarpet(ev.user, ev.avatar, `💐 ${ev.giftName} (+${ev.blessings})`, ev.wish);
        break;
      }

      case 'grandCeremony': {
        audio.playChurchBell(1.2);
        setTimeout(() => audio.playChurchBell(1.0), 900);
        particles.spawnGrandCeremonyRain();
        pulseHallPraying();
        showGrandCeremonyBanner(ev.user, ev.giftName, ev.blessings);
        animateWalkerOnCarpet(ev.user, ev.avatar, `🕊️ ${ev.giftName} (+${ev.blessings})`, ev.wish);
        break;
      }

      case 'drawVerse': {
        audio.playPageTurn();
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `📖 Opening the Bible...`,
          `${ev.user} is drawing a verse...`,
          false
        );
        // Show the verse card exactly when the voice starts reading it
        audio.enqueueTts(ev.ttsText || '', {
          onStart: () => {
            audio.playCandleChime();
            showVerseModal(ev.user, ev.verse);
            updateCentralWorshipper(
              ev.user,
              ev.avatar,
              `📖 ${ev.verse?.reference || ''}`,
              ev.verse?.reflection || '',
              true
            );
          },
          onEnd: () => {
            clearTimeout(verseTimer);
            verseTimer = setTimeout(() => {
              document.getElementById('verseModal')?.classList.remove('visible');
            }, 1800);
          }
        });
        break;
      }
    }
  }

  function spawnPrayerRequest(user, wish) {
    const layer = document.getElementById('skyLanternsLayer');
    if (!layer) return;
    const card = document.createElement('div');
    card.className = 'sky-lantern';
    const leftPos = 80 + Math.floor(Math.random() * 640);
    card.style.left = `${leftPos}px`;
    card.innerHTML = `
      <div class="sky-lantern-user">🙏 ${escapeHtml(user)}</div>
      <div class="sky-lantern-wish">“${escapeHtml(wish)}”</div>
    `;
    layer.appendChild(card);
    setTimeout(() => {
      card.remove();
    }, 10600);
  }

  function showVerseModal(user, verse) {
    if (!verse) return;
    const modal = document.getElementById('verseModal');
    document.getElementById('verseThemeBadge').textContent = verse.theme.toUpperCase();
    document.getElementById('verseTitle').textContent = `${verse.reference} — ${verse.title}`;
    document.getElementById('verseDevotee').textContent = `Verse for ${user}`;
    document.getElementById('verseText').textContent = `“${verse.text}”`;
    document.getElementById('verseReflection').textContent = verse.reflection;

    modal.classList.add('visible');
    clearTimeout(verseTimer);
    verseTimer = setTimeout(() => {
      modal.classList.remove('visible');
    }, 22000);
  }

  document.getElementById('verseModal')?.addEventListener('click', () => {
    document.getElementById('verseModal').classList.remove('visible');
  });

  function showGrandCeremonyBanner(user, giftName, blessings) {
    const banner = document.getElementById('grandCeremonyBanner');
    document.getElementById('grandTitle').textContent = `🕊️ ${giftName.toUpperCase()} 🕊️`;
    document.getElementById('grandSub').textContent = `Thank you, ${user} • +${blessings} Blessings for our church family`;
    banner.classList.add('visible');
    clearTimeout(grandTimer);
    grandTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 6800);
  }

  // 8. JSON-RPC 2.0 WebSocket connection & RPC calls
  let ws = null;
  let rpcId = 1;

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'church.state') {
          updateUIState(msg.params);
        } else if (msg.method === 'church.event') {
          if (msg.params?.state) updateUIState(msg.params.state);
          if (msg.params?.event) triggerRitualVisuals(msg.params.event);
        } else if (msg.method === 'tts.play') {
          if (msg.params?.text) {
            audio.enqueueTts(msg.params.text);
          }
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  }
  connectWebSocket();

  async function callRpc(method, params = {}) {
    audio.ensureContext();
    const payload = {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data?.result?.state) updateUIState(data.result.state);
    if (data?.result?.event) triggerRitualVisuals(data.result.event);
    return data;
  }

  function getFormInput() {
    const user = document.getElementById('inputDevoteeName')?.value.trim() || 'Grace M.';
    const wish =
      document.getElementById('inputDevoteeWish')?.value.trim() ||
      'Please bless my family with health, peace and joy';
    return { user, wish };
  }

  // Tap targets on the 9:16 stage and the bottom HUD cards
  const candleAction = () => {
    const { user, wish } = getFormInput();
    callRpc('church.lightCandle', { user, count: 3, wish });
  };
  const prayerAction = () => {
    const { user, wish } = getFormInput();
    callRpc('church.sendPrayer', { user, wish });
  };
  const lilyAction = () => {
    const { user, wish } = getFormInput();
    callRpc('church.offerGift', { user, giftType: 'lily', coins: 20, giftName: 'White Lily Bouquet', wish });
  };
  const bellAction = () => {
    const { user, wish } = getFormInput();
    callRpc('church.ringBell', { user, count: 1, wish, readTts: true });
  };
  const verseAction = () => {
    const { user, wish } = getFormInput();
    callRpc('church.drawVerse', { user, topic: wish });
  };

  document.getElementById('candleStandZone')?.addEventListener('click', candleAction);
  document.getElementById('cardCandle')?.addEventListener('click', candleAction);
  document.getElementById('cardPrayer')?.addEventListener('click', prayerAction);
  document.getElementById('cardLily')?.addEventListener('click', lilyAction);
  document.getElementById('bellStation')?.addEventListener('click', bellAction);
  document.getElementById('verseStation')?.addEventListener('click', verseAction);
  document.getElementById('amenStation')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('church.sayAmen', { user, count: 1 });
  });

  // Quick RPC dock buttons
  document.getElementById('btnRpcCandle')?.addEventListener('click', candleAction);
  document.getElementById('btnRpcPrayer')?.addEventListener('click', prayerAction);
  document.getElementById('btnRpcAmen')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('church.sayAmen', { user, count: 5 });
  });
  document.getElementById('btnRpcBell')?.addEventListener('click', bellAction);
  document.getElementById('btnRpcVerse')?.addEventListener('click', verseAction);
  document.getElementById('btnRpcGiftLily')?.addEventListener('click', lilyAction);
  document.getElementById('btnRpcGrandCeremony')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('church.grandCeremony', { user, coins: 299, giftName: 'Hallelujah Celebration', wish });
  });

  document.getElementById('btnConnectTikTok')?.addEventListener('click', () => {
    const username = document.getElementById('inputTikTokUser')?.value.trim();
    if (!username) return;
    callRpc('live.connect', { username });
  });

  let autoSimState = false;
  document.getElementById('btnToggleAutoSim')?.addEventListener('click', () => {
    autoSimState = !autoSimState;
    callRpc('live.setAutoSim', { enabled: autoSimState });
  });

  document.getElementById('btnToggleTts')?.addEventListener('click', (e) => {
    audio.ttsEnabled = !audio.ttsEnabled;
    const btn = e.currentTarget;
    btn.textContent = `🎙️ Voice: ${audio.ttsEnabled ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active-toggle', audio.ttsEnabled);
  });

  document.getElementById('btnToggleMusic')?.addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    const btn = e.currentTarget;
    btn.textContent = `🎵 Music: ${audio.bgMusicEnabled ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active-toggle', audio.bgMusicEnabled);
  });

  // Music & voice volume sliders
  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol && valMusicVol) {
    const initMusPct = Math.round(audio.bgBaseVolume * 100);
    sliderMusicVol.value = String(initMusPct);
    valMusicVol.textContent = `${initMusPct}%`;
    sliderMusicVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valMusicVol.textContent = `${pct}%`;
      audio.ensureContext();
      audio.setMusicVolume(pct / 100);
    });
    sliderMusicVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('church.updateSettings', { musicVolume: +(pct / 100).toFixed(2) });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol && valTtsVol) {
    const initTtsPct = Math.round(audio.ttsVolume * 100);
    sliderTtsVol.value = String(initTtsPct);
    valTtsVol.textContent = `${initTtsPct}%`;
    sliderTtsVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valTtsVol.textContent = `${pct}%`;
      audio.setTtsVolume(pct / 100);
    });
    sliderTtsVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('church.updateSettings', { ttsVolume: +(pct / 100).toFixed(2) });
    });
  }

  function shortenName(name, maxLen = 13) {
    const str = String(name || '');
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
