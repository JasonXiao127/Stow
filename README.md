# Stow

**Download YouTube audio as high-quality Opus files — the way YouTube actually sounds, not a lie.**

<img width="1179" height="788" alt="image" src="https://github.com/user-attachments/assets/42b73f17-476f-4765-83d9-8d5c8b503ba5" />


---

## Features

- Downloads the best audio stream directly from YouTube (no re-encoding, no quality loss)
- Outputs `.opus` containers — uses the same Opus codec YouTube serves internally
- Auto-embeds thumbnails and metadata (title, artist, album, etc.)
- Built-in metadata editor to fix or change tags and cover art after download
- Real-time download progress, speed, and ETA for each item
- Queue management: add multiple URLs, cancel one or all
- Persistent queue that resumes across app restarts; detects already downloaded files
- Duplicate URL detection prevents downloading the same video twice
- Dark and light theme
- Cross-platform desktop app (Windows, macOS, Linux) built with Electron

## Why Stow?

Most “YouTube to MP3” sites and apps lie about quality. They claim 320 kbps MP3, but behind the scenes they fetch a low-bitrate stream and re-encode it — a lossy-to-lossy conversion that permanently degrades the audio.

YouTube stores audio as Opus. For 1080p videos that’s usually around 160 kbps, a bitrate where Opus is audibly transparent. In controlled listening tests, Opus at 160 kbps consistently beats 320 kbps MP3.

Stow uses yt-dlp to grab the **real** Opus stream straight from YouTube. No conversion, no lies. You get exactly what YouTube serves and its untouched.

No web app, no ads, no “download our app” pop-ups, no file size limits. Just a clean, native desktop tool.

## How It Works

1. Paste one or more YouTube URLs.
2. Stow downloads the raw Opus stream using yt-dlp and repackages it with ffmpeg — no re-encoding.
3. Thumbnails and metadata (title, channel, upload date, etc.) are embedded automatically.
4. Optionally open the built-in editor to fix any tag or swap the cover art.
5. Enjoy your Opus files.

## Tech Stack

- **Electron** + **React** (Vite) — desktop shell and UI
- **yt-dlp** — downloads the audio stream from YouTube
- **ffmpeg** — remuxes the Opus stream into an `.opus` container
- **music-metadata** (Node.js) — reads/writes metadata and cover art
- **Node.js** — backend process management and queue state
