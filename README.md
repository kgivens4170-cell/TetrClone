# TetrClone

A minimal Tetris clone in Java Swing. No build tool or dependencies — just a JDK (17+).

## Play in a browser (phone friendly)

Open `web/index.html` in any browser. It has on-screen touch buttons and also takes keyboard input.

## Run the Java version

```bash
javac -d out src/*.java
java -cp out Tetris
```

## Controls

| Key | Action |
|-----|--------|
| ← / → | Move |
| ↑ | Rotate (with simple wall kicks) |
| ↓ | Soft drop |
| Space | Hard drop |
| P | Pause |
| R | Restart |

## Features

10×20 board, 7 tetrominoes with a 7-bag randomizer, ghost piece, next-piece preview,
line clears with scoring, levels (speed rises every 10 lines), game over.

## Test

```bash
javac -d out src/*.java test/GameTest.java && java -cp out GameTest
```

## Layout

- `src/Game.java` – game logic, no Swing (unit-testable)
- `src/Tetris.java` – Swing window, rendering and input
- `web/index.html` – single-file browser version with touch controls
- `test/GameTest.java` – dependency-free logic tests
