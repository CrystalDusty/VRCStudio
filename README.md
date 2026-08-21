# VRC Studio

A desktop companion app for VRChat. Friends, worlds, avatars, OSC, a
Discord bot, video player tracking, themes, and a lot more — all local

Built with Electron + React + TypeScript. Best on Windows 10/11.

> ⚠️ **Heads up — VRC Studio is still in its testing phase.** Expect bugs
> and things that don't behave as intended. Everything gets fixed over
> time. Thanks for your patience!

---

## 📥 Installation

1. **[Download the ZIP](https://github.com/DoNotPetMe/VRCStudio/archive/refs/heads/claude/api-integrations-testing.zip)** and extract it anywhere.
2. **Double-click `Start Here.bat`.**

It checks for Node.js (installs it for you if missing), asks if you want
`VRC Studio.exe` on your Desktop, builds the app, and launches it.

> **If the build fails with a "symbolic link / privilege not held" error,**
> enable Developer Mode in *Settings → For developers → Developer Mode*
> and re-run, or run `Start Here.bat` as Administrator.

---

## ✨ Features

### 👥 Friends & social
Friend list with live status • Friend Log timeline • Friend Analytics •
Live activity feed • Notifications inbox • Starred friends

### 🌍 Worlds & instances
World search and browser • Instance picker • One-click Rejoin for
private/friends/group instances • Activity heatmap • World analytics

### 👤 Avatars
Quick Switch Avatar (Ctrl+Shift+A) • avtrdb.com search by name or tag •
Live Avatars page showing every player + their perf rank + triangle
counts, with "Wear" button if indexed on avtrdb • Avatar Editor

### 📺 Video player tracking
What's playing right now in your VRChat instance • Per-instance history •
Cross-instance history • Auto-detected YouTube / Twitch / Vimeo

### 🎛️ OSC control
Chatbox • Live parameter monitor • Presets • Real-time message log

### 🤖 Discord
**Rich Presence** showing your current world. **Discord bot** with your
own token exposing slash commands: `/whoami`, `/world`, `/players`,
`/friends`, `/videos`, `/wear`, `/status`, `/say`, `/avatar`.

### 🎨 Personalization
4 colour modes • 6 accent colours • 6 premium themes including a full TUI skin with interactive in-app terminal • 7 animated border
styles • Liveliness effects (particles, cursor glow, hover lift) • Audio
visualizer • Custom CSS

### 🛠️ Tools
Game Log parser • Screenshots viewer • Event Planner • Multi-account support

## 🧹 Uninstalling

Run **`Uninstall VRC Studio.bat`**. It closes the app, wipes
`%APPDATA%\vrc-studio`, and removes the Desktop `.exe`. Then delete the
source folder by hand if you want.

---

## 📝 Notes

- **Unofficial** — third-party app, not affiliated with VRChat Inc.
- **Local-first** — no telemetry, no remote server.
- **Open source** — all code in this repo.
- **A few easter eggs sprinkled here and there.** 🥚
- **Transparency** — I value transparency, AI was used as an assistant
  in the making of VRC Studio. I am a one-person operation and tools
  like these help me search for bugs and squish them. Thank you for
  understanding.

Made by [@DoNotPetMe](https://github.com/DoNotPetMe)
(*DoNotResurrect_* in VRChat).
