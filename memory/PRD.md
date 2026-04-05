# VRC Studio - VRCA/UnityPackage Version Patching Fix

## Problem Statement
Users report that .vrca and .unitypackage files created from favorite avatars cannot be loaded in Unity (Creator Companion version 2022.3.22f1). The error message is "version mismatch error even with version patching enabled".

**Root Cause:** VRChat builds bundles with a custom Unity fork (e.g., `2022.3.22f2-DWR`) that doesn't match any public Unity release. The existing version patching preserved the `-DWR` suffix, which Unity's strict version check still rejects.

## Solution Implemented

### Key Changes

1. **Complete Version Replacement** (`electron/main.ts`)
   - Created `patchUnityVersionInBuffer()` function that COMPLETELY replaces the VRChat version (e.g., `2022.3.22f2-DWR`) with the exact public Unity version (`2022.3.22f1`)
   - The custom suffix (`-DWR`) is NO LONGER preserved - it's removed and replaced with null bytes
   - All occurrences of the version string throughout the bundle are patched, not just the header

2. **Pre-patched .vrca Output**
   - When saving from favorites, both `.unitypackage` AND a pre-patched `.vrca` file are saved
   - Users can drag the `.vrca` directly into Unity if they prefer

3. **Improved C# Unity Script**
   - Complete rewrite of `VRCStudioBundleLoader.cs` with enhanced version patching
   - Multiple loading strategies: direct memory load → temp file → fallback methods
   - Better error reporting and diagnostics

4. **New IPC Handlers**
   - `fs:patchVrcaVersion` - Manual version patching for any .vrca file
   - `fs:analyzeBundle` - Analyze a bundle to see its format and version info

### Technical Details

**UnityFS Header Format:**
```
"UnityFS\0" (8 bytes) + format_version (4 bytes) + player_version\0 + engine_version\0 + ...
```

**Before Patch:** `2022.3.22f2-DWR` (15 bytes)
**After Patch:** `2022.3.22f1\0\0\0` (12 bytes + 3 null bytes padding)

### Files Modified
- `/app/electron/main.ts` - Core version patching logic
- `/app/electron/preload.ts` - New IPC handlers exposed

## Testing
- Verified patch correctly changes version from `2022.3.22f2-DWR` to `2022.3.22f1`
- Header structure preserved with null byte padding
- File integrity maintained

## Next Steps
1. Test with Unity 2022.3.22f1 (Creator Companion)
2. Verify AssetBundle.LoadFromMemory() works with patched bundles
3. Test fallback to temp file loading if memory load fails

## Backlog
- P1: Add progress indicator for large bundle patching
- P2: Support for other Unity versions (configurable target)
- P2: Batch patching for multiple files
