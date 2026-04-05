# VRC Studio - Unity Version Patching Fix

## Problem
VRChat uses a custom Unity version (e.g., `2022.3.22f2`) that is not available publicly. When users try to load extracted `.vrca` or `.unitypackage` files in Unity with the VRChat Creator Companion (which uses `2022.3.22f1`), they get a **"version mismatch"** error.

## Solution
Implemented comprehensive Unity version patching that:
1. Automatically detects VRChat's custom Unity version in AssetBundle headers
2. Patches the version string to match the public VCC Unity version (`2022.3.22f1`)
3. Creates properly structured output files (.vrca or .unitypackage)

## Technical Details

### UnityFS Header Structure
```
[signature]\0[format_version]\0[player_version]\0[engine_version]\0[data...]
```
- `signature`: "UnityFS"
- `format_version`: e.g., "5.x.x"
- `player_version`: e.g., "2022.3.22f2c1"
- `engine_version`: **This is what we patch** (e.g., "2022.3.22f2" → "2022.3.22f1")

### Known VRChat Unity Versions (Patched)
- 2022.3.22f2 (most common)
- 2022.3.22f3
- 2022.3.6f1
- 2019.4.31f1
- 2019.4.40f1

### Output Formats
1. **`.vrca`** (default): Raw Unity AssetBundle with patched version - can be loaded directly with `AssetBundle.LoadFromFile()`
2. **`.unitypackage`**: tar.gz archive with proper Unity GUID structure

## Files Changed

### electron/main.ts
- Enhanced `patchUnityFsEngineVersion()` function with comprehensive version detection
- Added `decompressIfNeeded()` for handling gzip-compressed bundles
- Updated `fs:extractAvatarToDownloads` IPC handler to apply version patching
- Updated `fs:extractBundle` IPC handler to apply version patching
- Added new `fs:saveAvatarAsVRCA` IPC handler for direct .vrca export
- Added `fs:analyzeBundleVersion` IPC handler for version inspection

### electron/preload.ts
- Exposed new IPC methods with options for version patching and output format

### src/utils/unityImporter.ts
- Completely rewritten Unity importer C# script
- Now supports both .vrca (AssetBundle) and .unitypackage formats
- Added proper AssetBundle loading and extraction
- Added bundle content inspection

### src/utils/avatarExtractor.ts
- Updated to use new extraction methods with version patching
- Added version patching status reporting

### src/utils/avatarBundle.ts
- Updated `extractAvatarBundle()` to pass version patching options

### src/components/AvatarPreviewModal.tsx
- Added success message display showing version patching status
- Updated UI to show `.vrca` format instead of `.unitypackage`

## Usage

### From VRC Studio App
1. Go to Favorites → Avatars
2. Click on an avatar
3. Click "Extract Avatar Data" or "Download Bundle"
4. Files are automatically version-patched for Unity 2022.3.22f1

### In Unity
1. Place the generated Unity Editor scripts in `Assets/Editor/`
2. Go to VRChat → VRC Studio → Import [Avatar Name]
3. Select the `.vrca` file
4. Click "Import Avatar"

## Verification
After extraction, the diagnostic log will show:
```
[VersionPatch] Patching: 2022.3.22f2 -> 2022.3.22f1
[VersionPatch] Verification: 2022.3.22f1
```

## Compatibility
- **Target Unity Version**: 2022.3.22f1 (VRChat Creator Companion)
- **Source Unity Versions**: Any VRChat Unity variant
- **Works with**: Cache files, downloaded bundles, API downloads
