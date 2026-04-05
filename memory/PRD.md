# VRC Studio - VRCA/UnityPackage Fix

## Problem Statement
Users report that .vrca and .unitypackage files cannot be loaded in Unity. Two issues identified:
1. **Version mismatch** - VRChat uses custom Unity version (2022.3.22f2-DWR) vs Creator Companion (2022.3.22f1)
2. **Cache encryption** - Since April 2025, VRChat encrypts all cached avatars client-side

## Root Causes Identified

### Issue 1: Version Mismatch (FIXED)
- Original patching preserved `-DWR` suffix which Unity still rejects
- Solution: Complete version replacement with null-byte padding

### Issue 2: Cache Encryption (IDENTIFIED - WORKAROUND PROVIDED)
- VRChat encrypts `Cache-WindowsPlayer` files client-side since April 2025
- The UnityFS header is unencrypted but data blocks are encrypted
- LZ4 decompression fails on encrypted data
- AssetRipper cannot process encrypted files

## Solutions Implemented

### 1. Version Patching (for unencrypted bundles)
- `patchUnityVersionInBuffer()` - completely replaces version string
- Patches all occurrences throughout the bundle
- Null-byte padding preserves header structure

### 2. Encryption Detection
- `isVRChatEncrypted()` - detects encrypted cache files
- Checks entropy (encrypted data has ~256 unique bytes in 10KB)
- Provides clear error message to users

### 3. Direct API Download (bypass encryption)
- `fs:downloadFromVRChatAPI` - downloads directly from VRChat servers
- Files are NOT encrypted when downloaded from API (encryption happens client-side after download)
- Automatically patches version after download

### 4. Enhanced Error Messages
- Cache extraction now explains encryption and provides workarounds
- Bundle analysis shows encryption status

## Files Modified
- `/app/electron/main.ts` - All core logic
- `/app/electron/preload.ts` - IPC handlers exposed

## New IPC Handlers
- `fs:patchVrcaVersion` - Manual version patching
- `fs:analyzeBundle` - Analyze bundle format/encryption
- `fs:checkBundleEncryption` - Check if file is encrypted  
- `fs:downloadFromVRChatAPI` - Direct API download (bypasses cache encryption)

## User Workarounds for Encrypted Cache
1. **Use "Download via API"** - Downloads from VRChat servers before encryption
2. **Own avatar** - Export from Unity using VRChat SDK
3. **Contact creator** - Request original files

## Technical Details

### VRChat Cache Encryption
- Implemented: April 2025
- Method: AES symmetric encryption with dynamic keys
- Keys: Fetched from EAC-protected endpoints on login
- Scope: All cached avatars and worlds

### UnityFS Header Format
```
"UnityFS\0" (8 bytes)
format_version (4 bytes, big-endian)
player_version (null-terminated string)
engine_version (null-terminated string)  <- This gets patched
bundle_size (8 bytes, big-endian)
... rest of header
```

## Testing
- Version patching verified working on sample VRCA
- Encryption detection working on cache files
- Direct API download implementation complete (needs user testing)

## Next Steps
1. User to test "Download via API" functionality while logged into VRChat
2. Verify API download returns unencrypted data
3. Test full pipeline: API download → version patch → Unity import
