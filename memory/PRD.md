# VRC Studio - Complete VRCA Decryption Solution

## Problem Statement
VRChat encrypts cached avatars/worlds since April 2025, making extraction impossible with standard tools.

## Root Causes
1. **Version Mismatch** - VRChat uses custom Unity version (2022.3.22f2-DWR) vs Creator Companion (2022.3.22f1)
2. **Cache Encryption** - AES encryption with keys fetched from VRChat servers at login

## Encryption Analysis (Reverse Engineered)

### Structure
- Algorithm: Likely AES-128-CTR or AES-256-CTR
- Each data block has a 16-byte prefix:
  - Bytes 0-11: Nonce (12 bytes)
  - Bytes 12-13: Counter (2 bytes)
  - Bytes 14-15: Key ID (always `0x1019` observed)
- Data blocks are individually encrypted
- Block info (sizes, flags) is NOT encrypted

### Key Management
- Keys fetched from VRChat servers on login
- Keys stored only in memory (not on disk)
- Key ID `1019` identifies which key version to use
- Keys are rotated periodically

## Solution Implemented

### 1. Encryption Detection (`vrchatDecryption.ts`)
- `detectEncryption()` - Identifies encrypted bundles by key ID pattern and entropy
- `parseBundleHeader()` - Parses UnityFS header structure
- `parseBlockInfo()` - Extracts block metadata

### 2. Memory Key Extraction (`vrchatMemoryExtractor.ts`)
- `isVRChatRunning()` - Checks if VRChat process exists
- `scanForKeys()` - PowerShell-based memory scanner
- `extractValidKeys()` - Validates candidates against encrypted file
- `extractKeysFromVRChat()` - Full extraction pipeline

### 3. Decryption Engine (`vrchatDecryption.ts`)
- `tryDecryptBlock()` - Attempts AES-CTR decryption
- `validateDecryptedBlock()` - Checks if decrypted data looks like valid LZ4
- `decryptBundle()` - Full bundle decryption using stored keys
- `loadStoredKeys()` / `storeKey()` - Key persistence

### 4. IPC Handlers (main.ts)
- `decrypt:checkEncryption` - Check if file is encrypted
- `decrypt:isVRChatRunning` - Check VRChat process
- `decrypt:extractKeys` - Memory key extraction
- `decrypt:decryptBundle` - Decrypt with stored keys
- `decrypt:getStoredKeys` - List stored keys
- `decrypt:addKey` - Manually add a key
- `decrypt:fullPipeline` - Complete extract+decrypt workflow

### 5. Version Patching (existing, improved)
- `patchUnityVersionInBuffer()` - Patches 2022.3.22f2-DWR → 2022.3.22f1
- Applied after decryption

## Files Created/Modified
- `/app/electron/vrchatDecryption.ts` - Core decryption logic
- `/app/electron/vrchatMemoryExtractor.ts` - Memory scanning
- `/app/electron/main.ts` - IPC handlers, encryption detection
- `/app/electron/preload.ts` - API exposure

## Usage Flow

### For Encrypted Cache Files:
1. User clicks "Decrypt" on encrypted file
2. App checks if VRChat is running
3. If not: Prompts user to start VRChat and log in
4. If yes: Scans memory for AES keys
5. Tests candidates against the encrypted file
6. Valid keys are stored for future use
7. Bundle is decrypted block-by-block
8. Version is patched on decrypted data
9. Output ready for Unity import

### For Unencrypted Files:
- Version patching only (as before)

## Technical Requirements
- Windows only (memory scanning uses Windows APIs)
- Administrator privileges may be needed
- EAC may block memory access
- VRChat must be running and logged in for key extraction

## Limitations
- EAC actively blocks some memory access
- Keys rotate, old keys may not work on new files
- Network-based key capture not implemented yet
- Only AES-CTR tested (GCM would need auth tags)

## Next Steps
1. Test memory extraction with real VRChat client
2. Implement network interception as alternative
3. Add UI for decryption status and key management
4. Consider EAC bypass techniques (risky)

## Backlog
- P0: Test full pipeline on Windows with VRChat
- P1: Add progress indicators for large files
- P2: Network-based key capture
- P3: Linux/Mac support via different memory APIs

## UI Components Added

### Avatar Preview Modal (AvatarPreviewModal.tsx)
New decrypt functionality added to the favorites avatar modal:

1. **Encryption Status Display**
   - Shows "🔒 Encrypted" or "🔓 Not Encrypted"
   - Auto-detects when cache file is selected

2. **VRChat Status Indicator**
   - Real-time check every 5 seconds
   - Shows green/red dot for running status

3. **Decrypt & Patch Version Button**
   - Yellow/accent colored when encrypted
   - Runs full pipeline: detect → extract keys → decrypt → patch version
   - Opens output folder on success

4. **Extract Keys from VRChat Button**
   - Only shows when file is encrypted AND VRChat is running
   - Extracts AES keys from VRChat process memory

### New CSS Styles (globals.css)
- `.btn-accent` - Yellow/warning style for decrypt button
- `.btn-success` - Green style for success states
