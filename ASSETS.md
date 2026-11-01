# Assets, licenses and policy notes

## Status of every asset

| File | Origin | Status |
| :-- | :-- | :-- |
| `public/assets/sanctuary_bg.svg` | Generated in this repo (vector placeholder: stained glass cross, altar, pews, aisle) | Original work, no third-party license. **TODO:** replace with real art (see below). |
| `public/assets/devotee*.png` (6 frames) | Inherited from the original repo (AI-generated figure in a grey robe, seen from behind) | **TODO — needs new art.** Robe/hair bun reads as Asian monastic; license unknown. Kept only so the app runs. |
| Sound effects, ambient pad | Synthesized live with Web Audio in `audio.js` | Original, no samples, no hymns. |
| Voice | Browser Web Speech API | No bundled audio. |
| Fonts (Inter, Noto Serif) | Google Fonts, SIL OFL | OK to use. |
| Bible text | King James Version | Public domain in the US. Reference/credit not required, but do not mix in NIV/ESV/NLT (copyrighted). |

Removed because they were Buddhist or unlicensed: `amitabha_stage.jpg/png`, `buddha.png`, `temple_stage_bg.png`,
`devotee_prostrate*.png` (prostration poses), `tts_worker.py` (Vietnamese ZeroTTS), the four old demo screenshots.

## Art TODO (for the artist / image generation)

1. **Sanctuary background** `1080×1920`: nave with stained-glass cross window centered near (540, 300), altar around y≈905–1060
   (candle stand sits at x=540, base y≈895), aisle carpet down the middle, pews both sides for rows at y≈1290–1645,
   front kneelers at y≈1188 (x = 140, 268, 392, 688, 812, 940). Keep those anchors or edit `live.js` / `live.css`.
2. **Congregation sprites**: modern casual/Sunday clothes, mixed ages and backgrounds, seen from behind. Same 6 poses:
   `walk1`, `walk2`, `kneelDown`, `kneel` (hands folded), `forehead` (head bowed), `bowMid`. Transparent PNG with baked shadow.
   Sitting-in-pew variant would suit the congregation better than kneeling.
3. Optional: real dove / lily / candle sprites for gift effects (currently emoji + canvas particles).
4. Optional: a royalty-free ambient track (CC0 or purchased license). Avoid copyrighted hymn recordings AND recent arrangements
   of public-domain hymns, which can be separately copyrighted.

## TikTok LIVE / policy risks (verify against the current TikTok LIVE Community Guidelines before going live)

- **Gifts must not be sold as blessings, healing or divine favor.** Do not tell viewers a gift brings luck, answered prayer,
  salvation or protection, and do not frame gifts as tithes/offerings/donations. Copy here says "sent a blessing with a gift" only;
  keep it that way. The "ANY LIVE GIFT" HUD card is descriptive, not a call to send gifts.
- **No gift begging / "gift for a reward" pressure** in your spoken or written live copy.
- **Religious content is allowed, but hateful or demeaning content about a faith is not.** Moderation here blocks common mocking phrases;
  it is not complete. Use TikTok comment filters + a human moderator. Prayer requests read aloud are user-generated, so
  they are the main exposure.
- **Sensitive topics in prayer requests** (illness, death, suicide, minors) can be read aloud. Consider turning voice off for
  free-text prayers (`church.updateSettings`/Voice toggle) or tightening `sendPrayer` if you see problems.
- **Fortune-telling was removed.** The old "draw a fortune" mechanic is now a Daily Verse with an encouraging reflection and no luck ranking,
  to avoid divination/guaranteed-outcome claims.
- **Minors / personal data:** nicknames and avatars of viewers are displayed on screen. Disable avatars if you see minors.
- Using a **default or someone else's channel** is disabled: no auto-connect unless `TIKTOK_USER` is set.
- The `tiktok-live-connector` library uses an unofficial TikTok API; TikTok can change or block it. For a monetized/long-running channel,
  consider TikTok's official LIVE tooling for gift events.
