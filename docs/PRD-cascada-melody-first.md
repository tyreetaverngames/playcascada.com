# PRD: Melody-first charting for Cascada

**Status:** Phase 1 built and tested (this patch). Phase 2 is specced below.
**Owner:** Hayden · **Date:** 2026-11-16

## Problem

Below L5, Cascada handed players a thin, partly wrong slice of the song:

- The old extractor took the highest voice, then **thinned the tune itself** down to a difficulty target. At L2, players got 5–36% of the top line on most songs.
- Gaps were filled with accompaniment, so players were sometimes handed a left-hand note while the ghost played the phrase ending (the Für Elise opening).
- The ladder hit a cliff: L4 gave 17–56% of the tune, then L5 jumped to ~100%.

The pull of a piano game is hearing yourself play the song. That only works if *you* play the tune.

## Principle

**You always get the melody. Levels only add accompaniment on top of it.**

| Level | Stream (id) | What you play |
|---|---|---|
| L0–L2 | `core` | The melody. Speed-capped only where the tune itself runs faster than 1 note per 0.13s. Melody rests longer than 4s are bridged with the top note every 1.5s. |
| L3 | `melbass` (new) | The whole melody + the bass line's strong-beat notes |
| L4 | `2voice` | The whole melody + the whole bass line + every strong-beat chord tone |
| L5+ | `full` | Everything |

## Phase 1 — shipped in this patch

### 1. New melody detector (`extractMelody`, in `src/engine/deriveVersions.js`)
1. **A file's own melody part wins.** If a track or part is named melody, lead, vocal, voice, solo or tune, use it.
2. **Otherwise, a Viterbi path over onset clusters.** Notes within 35ms are grouped into one chord. The path picks at most one note per chord, or a rest, and minimizes these costs:
   - **Not the top note of the chord:** 0 for the top note, then 2.4, 3.8, 5.0 by rank
   - **Under a ringing note:** +2.6 when a higher note (3+ semitones above) is still sounding. This is the Für Elise fix: left-hand arpeggio notes between melody notes are no longer picked.
   - **Leaps:** 0.13 per semitone beyond a whole step, +1.1 past an octave, halved across phrase gaps over 1.5s
   - **Low register:** below A3 gets progressively more expensive
   - **Left-hand staff:** +1.6 when the file has separate hand tracks, +0.6 to switch staves
   - **Rest:** 2.2 per chord. A separate rest state forgets the last pitch, so a left-hand-only bar never forces a bad note just to keep the line connected.
3. Every tuning knob lives in `MELODY_TUNING`. Nothing is hardcoded in the algorithm.

### 2. The melody is protected downstream
Melody notes get `isMelody = true`, and their salience is remapped to 0.8–1.0 (everything else to 0–0.8). The finger cap, the slice solver's note shedding and key-collision repair all drop the lowest salience first, so they now drop accompaniment before melody.

### 3. Level streams (`src/content/tuning.js`, `src/engine/song.js`)
- `LEVEL_STREAM[3]` is now `'melbass'`.
- `versionForCurrentLevel` falls back *down* the ladder (`2voice → melbass → core`) instead of jumping to `full`.

### Results
Percent of the song's top line that is yours, measured headless over all 14 built-in songs:

| Song | L2 before → after | L3 before → after | L4 before → after | Longest gap at L3 (s) |
|---|---|---|---|---|
| Für Elise | 25% → **36%** | 40% → **60%** | 44% → **73%** | 4.0 → 2.5 |
| Pathétique II | 17% → **17%** | 20% → **38%** | 27% → **54%** | 14.2 → 4.2 |
| Clair de Lune | 15% → **23%** | 24% → **40%** | 28% → **53%** | 7.3 → 4.0 |
| Gymnopédie 1 | 36% → **42%** | 51% → **83%** | 56% → **90%** | 6.0 → 3.0 |
| Prelude in C | 19% → **45%** | 29% → **76%** | 39% → **89%** | 6.0 → 1.0 |
| Nocturne E♭ | 15% → **34%** | 36% → **60%** | 46% → **75%** | 5.5 → 4.4 |
| Fantaisie-Impromptu | 5% → **15%** | 18% → **48%** | 24% → **71%** | 5.0 → 4.7 |
| Mozart K545 | 15% → **27%** | 42% → **51%** | 45% → **75%** | 2.8 → 2.3 |
| Träumerei | 23% → **38%** | 46% → **73%** | 51% → **77%** | 2.9 → 2.9 |
| Canon in D | 80% → 76% | 100% → 100% | 100% → 100% | 8.0 → 8.0 |
| The Entertainer | 13% → **42%** | 16% → **46%** | 21% → **82%** | 5.0 → 4.6 |
| Maple Leaf Rag | 6% → **23%** | 15% → **61%** | 17% → **78%** | 3.0 → 1.1 |
| The Easy Winners | 8% → **54%** | 16% → **48%** | 24% → **80%** | 6.5 → 4.8 |
| Solace | 12% → **33%** | 18% → **60%** | 23% → **77%** | 7.5 → 2.9 |

Against the detected melody line itself, L4 now gives the player **97–100% of the melody on every song** (L3: 58–100%).

Spot checks of the extracted line, by ear against the scores:
- **Für Elise:** E5 D♯5 E5 D♯5 E5 B4 D5 C5 A4 · C4 E4 A4 B4 · E4 G♯4 B4 C5 ✔
- **The Entertainer:** the D6 E6 C6 A5 intro run, then D4 D♯4 E4 C5 E4 C5 ✔
- **Gymnopédie 1:** F♯5 A5 G5 F♯5 C♯5 B4 C♯5 D5 A4 ✔ (the intro bars, which have no melody, use the chord tops)

No page errors. L5+ charts are unchanged apart from salience ordering.

## Phase 2 — the remaining L0–L2 bottleneck (not built yet)

At L0–L2 the stream now holds the full melody, but **about half of it is still dropped by the key layout, not by the extractor.** The measurements for Für Elise at L2:

- The ergonomic layout (`ergonomicSliceList`) maps each hand's 4–5 keys to **specific pitches**, then shifts them **only by octaves** (`step: 12`).
- The hands are split at the median pitch with disjoint anchor ranges. For Für Elise, the right hand's lowest anchor is D5 and the left hand's top key is E4. **No hand can reach F4–C♯5**, which is where most of the tune lives.
- Result: 192 of 429 stream notes are skipped by `solvePlan` because no candidate split exists.

Proposed fix, in order:
1. **Build the low-level layout from the melody, not the whole stream.** At `core`, size the right hand's key set to the melody's most common pitches within a phrase, and put the hand boundary below the melody's range, not at the median.
2. **Shift by phrase, not by octave.** Let a slice re-anchor by any interval at phrase boundaries (rests ≥ 0.5s), with the existing shift-cost model. Manual Tab/Shift keys can stay at octaves.
3. **Melody-aware solver:** when `solvePlan` has to shed a note, never shed `isMelody` while any non-melody note is left in the event (salience already does this; just add a test).
4. **Target:** at L2, ≥ 85% of melody notes playable on every built-in song.

## Other follow-ups
- **Canon in D:** the built-in MIDI is 138 notes, one every ~2s. Replace it with a real arrangement (Mutopia has one).
- **Tuning pass:** play-test `MELODY_TUNING.coreMinIOI` (0.13s) on Fantaisie-Impromptu. If L1 still feels too fast, try 0.18s for L0–L1 only.
- **Uploads:** the parse-confidence dialog still reads `derived-core`, which is unchanged. Consider adding "melody confidence" (path cost per note) to that dialog.

## How to test
`node measure-melody.js /path/to/index.html` loads every built-in song at L0–L5 in headless Chrome and prints, per level: % of notes yours, % of the top line yours, % of the detected melody yours, and the longest silent gap.

## Files
- `index.html` / `cascada.html`: the built site, drop-in replacement (identical files)
- `src/engine/deriveVersions.js`, `src/content/tuning.js`, `src/engine/song.js`: the same changes as source files, for the source repo
- `cascada-melody-first.patch`: a git diff against `playcascada.com@eb8041c`
