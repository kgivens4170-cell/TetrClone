import java.util.Random;

/** Pure game logic (no Swing), so it can be tested headlessly. */
public class Game {
    public static final int COLS = 10, ROWS = 20;

    // 7 tetrominoes, each as 4 rotation states of 4 (x,y) cells in a 4x4 box.
    private static final int[][][][] SHAPES = build();

    private static int[][][][] build() {
        // base shapes as (x,y) cells
        int[][][] base = {
            {{0,1},{1,1},{2,1},{3,1}}, // I
            {{1,0},{2,0},{1,1},{2,1}}, // O
            {{1,0},{0,1},{1,1},{2,1}}, // T
            {{1,0},{2,0},{0,1},{1,1}}, // S
            {{0,0},{1,0},{1,1},{2,1}}, // Z
            {{0,0},{0,1},{1,1},{2,1}}, // J
            {{2,0},{0,1},{1,1},{2,1}}, // L
        };
        int[][][][] out = new int[7][4][4][2];
        for (int p = 0; p < 7; p++) {
            int size = (p == 0) ? 4 : (p == 1 ? 4 : 3);
            int[][] cur = base[p];
            for (int r = 0; r < 4; r++) {
                out[p][r] = cur;
                int[][] next = new int[4][2];
                for (int i = 0; i < 4; i++) { // rotate clockwise within box
                    next[i][0] = (size - 1) - cur[i][1];
                    next[i][1] = cur[i][0];
                }
                if (p == 1) next = cur; // O doesn't rotate
                cur = next;
            }
        }
        return out;
    }

    /** 0 = empty, 1..7 = piece id + 1. */
    public final int[][] board = new int[ROWS][COLS];
    public int piece, rot, px, py;
    public int next;
    public int score, lines, level = 1;
    public boolean gameOver;
    private final Random rng;
    private int[] bag = new int[7];
    private int bagIdx = 7;

    public Game() { this(new Random()); }
    public Game(Random rng) {
        this.rng = rng;
        next = draw();
        spawn();
    }

    private int draw() {
        if (bagIdx >= 7) { // 7-bag randomizer
            for (int i = 0; i < 7; i++) bag[i] = i;
            for (int i = 6; i > 0; i--) {
                int j = rng.nextInt(i + 1);
                int t = bag[i]; bag[i] = bag[j]; bag[j] = t;
            }
            bagIdx = 0;
        }
        return bag[bagIdx++];
    }

    private void spawn() {
        piece = next;
        next = draw();
        rot = 0;
        px = 3;
        py = 0;
        if (collides(piece, rot, px, py)) gameOver = true;
    }

    public int[][] cells(int p, int r) { return SHAPES[p][r]; }

    private boolean collides(int p, int r, int x, int y) {
        for (int[] c : SHAPES[p][r]) {
            int cx = x + c[0], cy = y + c[1];
            if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
            if (cy >= 0 && board[cy][cx] != 0) return true;
        }
        return false;
    }

    public boolean move(int dx) {
        if (gameOver || collides(piece, rot, px + dx, py)) return false;
        px += dx;
        return true;
    }

    public boolean rotate() {
        if (gameOver) return false;
        int nr = (rot + 1) % 4;
        for (int kick : new int[]{0, -1, 1, -2, 2}) { // simple wall kicks
            if (!collides(piece, nr, px + kick, py)) { rot = nr; px += kick; return true; }
        }
        return false;
    }

    /** Move down one row; locks the piece if it can't. Returns true if it moved. */
    public boolean softDrop() {
        if (gameOver) return false;
        if (!collides(piece, rot, px, py + 1)) { py++; return true; }
        lock();
        return false;
    }

    public void hardDrop() {
        if (gameOver) return;
        int dist = 0;
        while (!collides(piece, rot, px, py + 1)) { py++; dist++; }
        score += dist * 2;
        lock();
    }

    public int ghostY() {
        int y = py;
        while (!collides(piece, rot, px, y + 1)) y++;
        return y;
    }

    private void lock() {
        for (int[] c : SHAPES[piece][rot]) {
            int cx = px + c[0], cy = py + c[1];
            if (cy >= 0) board[cy][cx] = piece + 1;
        }
        clearLines();
        spawn();
    }

    private void clearLines() {
        int cleared = 0;
        for (int y = ROWS - 1; y >= 0; y--) {
            boolean full = true;
            for (int x = 0; x < COLS; x++) if (board[y][x] == 0) { full = false; break; }
            if (full) {
                for (int yy = y; yy > 0; yy--) board[yy] = board[yy - 1].clone();
                board[0] = new int[COLS];
                cleared++;
                y++; // re-check this row
            }
        }
        if (cleared > 0) {
            int[] pts = {0, 100, 300, 500, 800};
            score += pts[cleared] * level;
            lines += cleared;
            level = lines / 10 + 1;
        }
    }

    /** Milliseconds between gravity ticks at the current level. */
    public int tickMillis() { return Math.max(80, 800 - (level - 1) * 70); }
}
