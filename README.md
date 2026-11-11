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
| Roguelike | Nine stages and three bosses. Draft relics, rebuild your bag, reshape pieces (see below) |

**Themes:** a theme restyles the whole game, not just the colors: block look, fonts, UI corners and borders, sound waveform and an animated backdrop. Tap Theme on the menu to cycle, or pick one in Settings.
- *Classic*, *Neon*, *Paper*, *Terminal*: flat palettes (Neon, Paper and Terminal unlock as you play).
- *8-Bit*: NES-style black-outlined tiles, block colors that change every level, scanlines, a night sky with a scrolling onion-dome skyline and brick ground. A Tetris or T-spin launches a rocket.
- *16-Bit*: dithered dusk sky, parallax hills over shimmering water, shiny beveled blocks, shooting stars on big clears.
- *Handheld*: four greens with an LCD grid, drifting dither and hills, and a different pattern per piece type.
- *Outrun*: neon grid racing toward a striped sun, glowing tiles, the sun pulses on big clears.

Backdrops live in `web/bg.js`, are drawn at low resolution (about 30 fps) and stand still if the device asks for reduced motion.

**Progress:** personal bests, lifetime stats, game history, 23 trophies, and 4 themes (3 unlockable).

**Controls**

| Action | Touch | Keyboard |
|--------|-------|----------|
| Move | Drag left or right anywhere on the screen | ← → |
| Soft drop | Drag down | ↓ |
| Rotate left | Tap the left side of the screen | Z |
| Rotate right | Tap the right side of the screen | ↑ or X |
| Hard drop | Flick down, or the DROP button | Space |
| Hold | Flick up, or the HOLD button | C or Shift |
| Pause | II button | P or Esc |
| Roguelike tools | Mirror, Trim, Grow buttons | V, B, N |

The whole screen is the touch surface, edges included. The only buttons in play are DROP (bottom-left corner, away from the right thumb), HOLD (bottom-right corner) and II. Both are square. They fire when you lift your finger while still on the button, so a graze or a slide across them does nothing. Settings can move DROP to the right corner. Dragging puts the piece in the column nearest your finger, so you only need to aim within half a cell. A tap is a quick touch that barely moves; the left half of the board turns the piece left and the right half turns it right. When a roguelike tool is armed, taps on the board aim the tool instead.

Auto-repeat delay and speed are adjustable in Settings.

**Files:** `web/engine.js` (pure game logic), `web/ai.js` (bot), `web/rogue.js` (roguelike rules), `web/bg.js` (animated backdrops), `web/app.js` (UI, input, rendering, saves), `web/index.html`.

## Roguelike mode

A run is 9 stages in 3 acts. Each act ends with a boss. You have 2 lives; failing a stage costs one and you retry it. Clear a stage to earn coins, draft 1 of 3 relics, then spend coins in the shop. Runs are seeded (the seed is shown), and your run is saved between visits.

**Stages:** clear N lines, clear N lines within a piece budget, or survive a timer while garbage rises. Bosses: *The Mason* (a garbage row rises every 11 s), *The Fog* (no ghost, no next preview), *The Architect* (pieces arrive randomly grown or trimmed, with rising garbage).

**Shape manipulation, three ways**
- **Bag building:** your bag is a deck. Add pieces (dot, domino, tri-I, tri-L, plus, P-pentomino, 3x3 block), cull pieces, or duplicate them.
- **Permanent mutations:** *Grow* turns a piece type into a pentomino (T becomes a cross, I becomes a 5-long bar). *Trim* shrinks it to a tromino.
- **Live tools** (charges refill every stage): *Mirror* flips the falling piece; *Trim* lets you tap a block to cut it off; *Grow* lets you tap a square to add a block (6 max). Keys: V, B, N.

**Relics (18):** coin engines (Gold Rush, Combo Coin, Tetris Tax, Spin Dealer, Pentomino Pro, Danger Pay, Banker, Clean Sweep), handling (Slow Motion, Long Fuse, Twin Holds), tool charges (Hall of Mirrors, Sharp Chisel, Green Thumb), and more.

**Files:** `web/rogue.js` holds the rules (stages, relics, coins, shop) and has no UI, so it is covered by tests.

## Tests

```bash
node test/engine.test.js   # engine rules and bot games
node test/rogue.test.js    # piece tools, mutations, shop, relics, stage feasibility
```

The engine tests cover rotation shapes, the 7-bag, line clears, scoring, T-spins, combos, back-to-back, hold, lock delay, garbage, and full bot-versus-engine games. The roguelike tests cover every piece shape in every rotation, Mirror/Trim/Grow, custom bags, the shop and relic rules, and check that the hard bot can clear the piece-limited stages inside their budgets.

## Single-page build

`node tools/build-artifact.js out.html` inlines the scripts into one page without document tags (used for publishing as a shareable page).

## Java Swing version

A minimal desktop version (needs a JDK, 17+).

```bash
javac -d out src/*.java
java -cp out Tetris
```

Arrow keys move and rotate, Space drops, P pauses, R restarts. Logic tests: `javac -d out src/*.java test/GameTest.java && java -cp out GameTest`.
