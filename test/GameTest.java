import java.util.Random;

/** Dependency-free tests. Run: see README. Exits non-zero on failure. */
public class GameTest {
    static int failures = 0;
    static void check(boolean ok, String name) {
        System.out.println((ok ? "PASS " : "FAIL ") + name);
        if (!ok) failures++;
    }

    public static void main(String[] a) {
        // every piece keeps 4 distinct cells inside its box in all rotations
        Game g = new Game(new Random(1));
        for (int p = 0; p < 7; p++) for (int r = 0; r < 4; r++) {
            java.util.Set<String> s = new java.util.HashSet<>();
            boolean inside = true;
            for (int[] c : g.cells(p, r)) {
                s.add(c[0] + "," + c[1]);
                if (c[0] < 0 || c[0] > 3 || c[1] < 0 || c[1] > 3) inside = false;
            }
            check(s.size() == 4 && inside, "piece " + p + " rot " + r + " valid");
        }

        // walls block movement
        g = new Game(new Random(2));
        for (int i = 0; i < 20; i++) g.move(-1);
        int left = g.px;
        check(!g.move(-1), "cannot move through left wall (px=" + left + ")");

        // hard drop locks piece on the floor and spawns a new one
        g = new Game(new Random(3));
        g.hardDrop();
        boolean bottom = false;
        for (int x = 0; x < Game.COLS; x++) if (g.board[Game.ROWS - 1][x] != 0) bottom = true;
        check(bottom, "hard drop lands on floor");

        // line clear: fill bottom row except a 4-wide gap, drop an I piece into it
        g = freshWithI();
        for (int x = 0; x < Game.COLS; x++) if (x < 3 || x > 6) g.board[Game.ROWS - 1][x] = 1;
        g.px = 3; g.rot = 0; g.py = 0;
        g.hardDrop();
        check(g.lines == 1 && g.score >= 100, "line clear scores (lines=" + g.lines + ", score=" + g.score + ")");
        boolean empty = true;
        for (int x = 0; x < Game.COLS; x++) if (g.board[Game.ROWS - 1][x] != 0) empty = false;
        check(empty, "cleared row is removed");

        // game over when stack reaches spawn
        g = new Game(new Random(5));
        for (int i = 0; i < 40 && !g.gameOver; i++) g.hardDrop();
        check(g.gameOver, "stacking without moving ends the game");

        // 7-bag: first 7 draws are all distinct
        g = new Game(new Random(6));
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        seen.add(g.piece); seen.add(g.next);
        for (int i = 0; i < 5; i++) { g.hardDrop(); seen.add(g.next); }
        check(seen.size() == 7, "7-bag yields each piece once per bag");

        System.exit(failures == 0 ? 0 : 1);
    }

    static Game freshWithI() {
        for (long seed = 0; seed < 1000; seed++) {
            Game g = new Game(new Random(seed));
            if (g.piece == 0) return g;
        }
        throw new IllegalStateException("no seed spawns I first");
    }
}
