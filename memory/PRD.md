# VRC Studio - Product Requirements Document

## Overview
VRC Studio is an Electron-based desktop application for managing VRChat avatars, including downloading, extracting, and preparing avatar bundles for use in Unity.

## Problem Statement (Original)
- `.unitypackage` and `.vrca` files created by the app were corrupt/unreadable
- Asset Ripper couldn't read the extracted files
- Unity showed "version mismatch" error when loading avatar files
- VRChat uses custom Unity version (2022.3.22f2) vs public VCC version (2022.3.22f1)
- Version patching existed but wasn't being applied

## Solution Implemented (January 2026)

### Core Fix: Unity Version Patching
1. **Enhanced version patching function** that:
   - Detects UnityFS bundle format
   - Parses header to find engine version string
   - Patches VRChat's custom Unity versions to 2022.3.22f1
   - Supports multiple VRChat Unity versions (f2, f3, 2019.4.x variants)

2. **Integrated patching into all export flows**:
   - Cache extraction (`fs:extractAvatarToDownloads`)
   - Bundle extraction (`fs:extractBundle`)
   - Direct .vrca export (`fs:saveAvatarAsVRCA`)

3. **Updated Unity importer scripts**:
   - Now supports .vrca (AssetBundle) format directly
   - Proper AssetBundle.LoadFromFile() implementation
   - Asset extraction and saving to Unity project

### Files Modified
- `/app/electron/main.ts` - Core patching logic and IPC handlers
- `/app/electron/preload.ts` - Exposed new APIs to renderer
- `/app/src/utils/unityImporter.ts` - Rewritten Unity C# scripts
- `/app/src/utils/avatarExtractor.ts` - Updated extraction flow
- `/app/src/utils/avatarBundle.ts` - Updated bundle handling
- `/app/src/components/AvatarPreviewModal.tsx` - UI feedback

### Output Formats
- **`.vrca`** (default): Patched Unity AssetBundle, ready for Unity
- **`.unitypackage`**: tar.gz with GUID structure (optional)

## Architecture

### Tech Stack
- Electron (desktop app)
- React + TypeScript (frontend)
- Vite (build tool)
- Zustand (state management)

### Key Components
- `electron/main.ts` - Main process, file operations, IPC handlers
- `electron/preload.ts` - Context bridge for renderer
- `src/api/vrchat.ts` - VRChat API client
- `src/utils/avatarBundle.ts` - Bundle download/extraction
- `src/utils/avatarExtractor.ts` - Full avatar package extraction
- `src/utils/unityImporter.ts` - Unity script generation

## What's Been Implemented
- [x] Comprehensive Unity version patching (Jan 2026)
- [x] .vrca output format support (Jan 2026)
- [x] Updated Unity importer scripts (Jan 2026)
- [x] Version patching status in UI (Jan 2026)
- [x] Bundle version analysis API (Jan 2026)

## Remaining Work / Backlog

### P0 (Critical)
- [ ] Test with real VRChat avatar files on Windows

### P1 (Important)
- [ ] Add option to choose output format in UI (.vrca vs .unitypackage)
- [ ] Add batch export functionality
- [ ] Improve error messages for unsupported bundle formats

### P2 (Nice to Have)
- [ ] Asset Ripper compatibility verification
- [ ] Preview extracted assets before import
- [ ] Auto-detect VRChat cache location on different systems

## Testing Notes
- Version patching verified via code review and log output
- Unity import requires Windows + Unity 2022.3.22f1 for full testing
- Check diagnostic logs at: `%APPDATA%/vrc-studio/logs/vrc-studio-diagnostic.log`
