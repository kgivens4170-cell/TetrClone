import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

/** Swing front-end. Controls: arrows move/rotate/soft-drop, space hard-drop, P pause, R restart. */
public class Tetris extends JPanel {
    static final int CELL = 30;
    static final int SIDE = 160;
    static final Color[] COLORS = {
        new Color(0, 240, 240), new Color(240, 240, 0), new Color(160, 0, 240),
        new Color(0, 240, 0), new Color(240, 0, 0), new Color(0, 0, 240), new Color(240, 160, 0)
    };

    Game game = new Game();
    boolean paused;
    final Timer timer;

    Tetris() {
        setPreferredSize(new Dimension(Game.COLS * CELL + SIDE, Game.ROWS * CELL));
        setBackground(Color.BLACK);
        setFocusable(true);
        timer = new Timer(game.tickMillis(), e -> tick());
        addKeyListener(new KeyAdapter() {
            @Override public void keyPressed(KeyEvent e) { onKey(e.getKeyCode()); }
        });
        timer.start();
    }

    void tick() {
        if (paused || game.gameOver) return;
        game.softDrop();
        timer.setDelay(game.tickMillis());
        repaint();
    }

    void onKey(int k) {
        if (k == KeyEvent.VK_R) { game = new Game(); paused = false; repaint(); return; }
        if (k == KeyEvent.VK_P) { paused = !paused; repaint(); return; }
        if (paused || game.gameOver) return;
        switch (k) {
            case KeyEvent.VK_LEFT -> game.move(-1);
            case KeyEvent.VK_RIGHT -> game.move(1);
            case KeyEvent.VK_UP -> game.rotate();
            case KeyEvent.VK_DOWN -> { game.softDrop(); game.score += 1; }
            case KeyEvent.VK_SPACE -> game.hardDrop();
            default -> { return; }
        }
        repaint();
    }

    void cell(Graphics2D g, int x, int y, Color c) {
        g.setColor(c);
        g.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    }

    @Override protected void paintComponent(Graphics g0) {
        super.paintComponent(g0);
        Graphics2D g = (Graphics2D) g0;
        // grid
        g.setColor(new Color(30, 30, 30));
        for (int x = 0; x <= Game.COLS; x++) g.drawLine(x * CELL, 0, x * CELL, Game.ROWS * CELL);
        for (int y = 0; y <= Game.ROWS; y++) g.drawLine(0, y * CELL, Game.COLS * CELL, y * CELL);
        // locked cells
        for (int y = 0; y < Game.ROWS; y++)
            for (int x = 0; x < Game.COLS; x++)
                if (game.board[y][x] != 0) cell(g, x, y, COLORS[game.board[y][x] - 1]);
        if (!game.gameOver) {
            // ghost + current piece
            int gy = game.ghostY();
            Color pc = COLORS[game.piece];
            Color ghost = new Color(pc.getRed(), pc.getGreen(), pc.getBlue(), 60);
            for (int[] c : game.cells(game.piece, game.rot)) {
                cell(g, game.px + c[0], gy + c[1], ghost);
            }
            for (int[] c : game.cells(game.piece, game.rot)) {
                cell(g, game.px + c[0], game.py + c[1], pc);
            }
        }
        // side panel
        int sx = Game.COLS * CELL + 16;
        g.setColor(Color.WHITE);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 16));
        g.drawString("NEXT", sx, 30);
        for (int[] c : game.cells(game.next, 0)) {
            g.setColor(COLORS[game.next]);
            g.fillRect(sx + c[0] * 24, 44 + c[1] * 24, 23, 23);
        }
        g.setColor(Color.WHITE);
        g.drawString("SCORE", sx, 180);
        g.drawString(String.valueOf(game.score), sx, 202);
        g.drawString("LINES", sx, 240);
        g.drawString(String.valueOf(game.lines), sx, 262);
        g.drawString("LEVEL", sx, 300);
        g.drawString(String.valueOf(game.level), sx, 322);
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 12));
        g.drawString("←→ move  ↑ rotate", sx, 480);
        g.drawString("↓ soft  Space drop", sx, 498);
        g.drawString("P pause  R restart", sx, 516);
        if (game.gameOver || paused) {
            g.setColor(new Color(0, 0, 0, 170));
            g.fillRect(0, 0, Game.COLS * CELL, Game.ROWS * CELL);
            g.setColor(Color.WHITE);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 28));
            String msg = game.gameOver ? "GAME OVER" : "PAUSED";
            int w = g.getFontMetrics().stringWidth(msg);
            g.drawString(msg, (Game.COLS * CELL - w) / 2, Game.ROWS * CELL / 2);
            if (game.gameOver) {
                g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 14));
                String s2 = "Press R to restart";
                g.drawString(s2, (Game.COLS * CELL - g.getFontMetrics().stringWidth(s2)) / 2,
                             Game.ROWS * CELL / 2 + 28);
            }
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame f = new JFrame("TetrClone");
            f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            f.add(new Tetris());
            f.pack();
            f.setResizable(false);
            f.setLocationRelativeTo(null);
            f.setVisible(true);
        });
    }
}
