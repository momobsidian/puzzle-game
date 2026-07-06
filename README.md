# Puzzle Game

A dark, minimal image puzzle game with a real-time admin monitoring panel.

---

## Stack

- Vanilla HTML / CSS / JS — no framework
- Node.js HTTP server
- WebSocket (`ws`) for live admin updates
- Cloudflare Tunnel for public access

---

## Features

**Game**
- Drag-and-drop tile swapping across all devices (pointer events)
- Auto-save progress every 10 seconds and on page close
- Level unlock system — complete a level to unlock the next
- Skip system — skip tough levels, marked separately from completions
- Timer, move counter, progress percentage

**Admin Panel** (`/admin.html`)
- Live tile grid visualization with smooth swap animations
- Real-time WebSocket updates per move
- HTTP polling fallback if WebSocket is unavailable
- Session cards showing moves, time, progress, device

---

## Setup

```bash
npm install
node server.js
```

Open `http://localhost:3000`

Admin panel: `http://localhost:3000/admin.html`

---

## Images

Drop `.jpg` / `.png` / `.webp` files into the `images/` folder. The server auto-detects and sorts them numerically. Each image becomes one level.

---

## Progress

Stored in `progress.json` (git-ignored). Each level tracks:

| Field | Description |
|---|---|
| `completed` | Whether the level is done |
| `skipped` | Completed via skip, not solved |
| `bestTime` | Fastest solve time in seconds |
| `bestMoves` | Fewest moves to solve |
| `attempts` | Total attempts |

---

## Cloudflare Tunnel

WebSocket requires HTTP/1.1. In your tunnel config:

```yaml
ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
    originRequest:
      http2Origin: false
```

---

## License

MIT
