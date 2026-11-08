# TetrClone

A Tetris clone with two front-ends: a browser version (play on a phone or desktop) and the original minimal Java Swing version.

## Browser version (`web/`)

Open `web/index.html` in any browser. No install or build step. Progress is saved in the browser's local storage.

**Engine**
- SRS rotation with the full wall-kick tables, 7-bag randomizer, hold piece, 5-piece next queue
- Ghost piece, 500 ms lock delay with the standard 15-move reset limit
- T-spin and mini T-spin detection, combos, back-to-back bonuses, perfect clears
- Guideline scoring and gravity curve, levels up to 20
- Garbage lines with incoming-garbage meter and attack cancelling

**Modes**
| Mode | Goal |
|------|------|
| Marathon | Endless, speeds up every 10 lines |
| Sprint | Clear 40 lines as fast as possible |
| Ultra | Highest score in 2:00 |
| Daily Challenge | Same piece sequence for everyone on a given date, 2:00 score attack |
| Versus Bot | Send garbage to a computer opponent (Easy, Medium, Hard) |

**Progress:** personal bests, lifetime stats, game history, 18 trophies, and 4 themes (3 unlockable).

**Controls**

| Action | Touch | Keyboard |
|--------|-------|----------|
| Move | ◀ ▶ (hold to repeat) | ← → |
| Rotate | ↻ ↺ | ↑ or X, Z |
| Soft drop | ▼ | ↓ |
| Hard drop | DROP | Space |
| Hold | HOLD | C or Shift |
| Pause | Pause | P or Esc |

Auto-repeat delay and speed are adjustable in Settings.

**Files:** `web/engine.js` (pure game logic), `web/ai.js` (bot), `web/app.js` (UI, input, rendering, saves), `web/index.html`.

## Tests

```bash
node test/engine.test.js
```

Covers rotation shapes, the 7-bag, line clears, scoring, T-spins, combos, back-to-back, hold, lock delay, garbage, and full bot-versus-engine games.

## Single-page build

`node tools/build-artifact.js out.html` inlines the scripts into one page without document tags (used for publishing as a shareable page).

## Java Swing version

A minimal desktop version (needs a JDK, 17+).

```bash
javac -d out src/*.java
java -cp out Tetris
```

Arrow keys move and rotate, Space drops, P pauses, R restarts. Logic tests: `javac -d out src/*.java test/GameTest.java && java -cp out GameTest`.
