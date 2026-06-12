# Floop Desktop

Floop Desktop is the Electron shell for the Floop operator surface.

It runs the same local API service used by the web MVP, serves the built React
operator UI from that API, and opens the app in a hardened Electron browser
window.

## Run

From the repository root:

```bash
npm run start:electron
```

The command builds `apps/web-react`, starts an in-process Floop API on a local
loopback port, and opens the bundled UI.

## Data

By default, the desktop app stores its SQLite database in Electron's user-data
directory as `floop.sqlite`.

Set `FLOOP_DB_PATH` to force a specific database path. The desktop app tries
`FLOOP_PORT` when it is set; otherwise it starts on `4318` and falls back to a
free loopback port if that port is already occupied.

The desktop shell is a loopback-only trust boundary by default. If you override
the API host to a non-loopback address for LAN or Tailscale access, set
`FLOOP_AUTH_TOKEN` and pass that token from any external client.
