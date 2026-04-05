/**
 * Unity Importer Generator
 * Creates a ready-to-use C# script for importing VRChat avatars into Unity
 * Handles both .vrca (AssetBundle) and .unitypackage formats
 */

export function generateUnityImporterScript(avatarId: string, avatarName: string): string {
  return `// Auto-generated Avatar Importer for ${avatarName}
// Place this script in: Assets/Editor/VRCStudioImporters/
// Compatible with Unity 2022.3.22f1 (VRChat Creator Companion)

using UnityEditor;
using UnityEngine;
using System.IO;
using System.Collections.Generic;

public class ${sanitizeClassName(avatarName)}Importer : EditorWindow
{
    private static string selectedFilePath = "";
    private static bool isVRCA = false;
    private static AssetBundle loadedBundle = null;
    private static string[] assetNames = null;
    private static Vector2 scrollPos;

    [MenuItem("VRChat/VRC Studio/Import ${sanitizeClassName(avatarName)}")]
    public static void ShowWindow()
    {
        var window = GetWindow<${sanitizeClassName(avatarName)}Importer>("Import ${avatarName}");
        window.minSize = new Vector2(450, 500);
    }

    private void OnDestroy()
    {
        // Clean up loaded bundle when window closes
        if (loadedBundle != null)
        {
            loadedBundle.Unload(true);
            loadedBundle = null;
        }
    }

    private void OnGUI()
    {
        scrollPos = EditorGUILayout.BeginScrollView(scrollPos);
        
        EditorGUILayout.Space(10);
        GUILayout.Label("Avatar: ${avatarName}", EditorStyles.boldLabel);
        GUILayout.Label("Avatar ID: ${avatarId}", EditorStyles.miniLabel);
        GUILayout.Label("Target Unity: 2022.3.22f1 (VCC)", EditorStyles.miniLabel);

        EditorGUILayout.Space(10);
        EditorGUILayout.HelpBox(
            "This importer supports both .vrca (AssetBundle) and .unitypackage formats.\\n\\n" +
            "VRCA files are raw Unity AssetBundles that have been patched to work with Unity 2022.3.22f1.\\n\\n" +
            "Select your avatar file below to import it into your project.",
            MessageType.Info
        );

        EditorGUILayout.Space(10);
        
        // File selection
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Select Avatar File", GUILayout.Height(35)))
        {
            string path = EditorUtility.OpenFilePanel(
                "Select Avatar File",
                "",
                "vrca,unitypackage"
            );
            
            if (!string.IsNullOrEmpty(path))
            {
                selectedFilePath = path;
                isVRCA = path.EndsWith(".vrca", System.StringComparison.OrdinalIgnoreCase);
                
                // If VRCA, try to load and inspect it
                if (isVRCA)
                {
                    LoadAndInspectBundle(path);
                }
            }
        }
        EditorGUILayout.EndHorizontal();

        if (!string.IsNullOrEmpty(selectedFilePath))
        {
            EditorGUILayout.Space(5);
            EditorGUILayout.LabelField("Selected:", EditorStyles.boldLabel);
            EditorGUILayout.SelectableLabel(Path.GetFileName(selectedFilePath), EditorStyles.textField, GUILayout.Height(20));
            EditorGUILayout.LabelField("Type: " + (isVRCA ? "VRCA (AssetBundle)" : "Unity Package"));
            
            // Show bundle contents if VRCA
            if (isVRCA && assetNames != null && assetNames.Length > 0)
            {
                EditorGUILayout.Space(5);
                EditorGUILayout.LabelField("Bundle Contents:", EditorStyles.boldLabel);
                EditorGUI.indentLevel++;
                foreach (string assetName in assetNames)
                {
                    EditorGUILayout.LabelField("• " + assetName, EditorStyles.miniLabel);
                }
                EditorGUI.indentLevel--;
            }
        }

        EditorGUILayout.Space(15);

        // Import button
        GUI.enabled = !string.IsNullOrEmpty(selectedFilePath);
        if (GUILayout.Button("Import Avatar", GUILayout.Height(45)))
        {
            if (isVRCA)
            {
                ImportVRCABundle(selectedFilePath);
            }
            else
            {
                ImportUnityPackage(selectedFilePath);
            }
        }
        GUI.enabled = true;

        EditorGUILayout.Space(20);
        
        // Manual instructions
        EditorGUILayout.LabelField("Manual Import Instructions", EditorStyles.boldLabel);
        
        EditorGUILayout.HelpBox(
            "For .vrca files (AssetBundle):\\n" +
            "1. Click 'Select Avatar File' and choose the .vrca file\\n" +
            "2. Click 'Import Avatar' to extract and import all assets\\n" +
            "3. Find extracted assets in Assets/VRCStudio/Avatars/${avatarId}/\\n\\n" +
            "For .unitypackage files:\\n" +
            "1. Double-click the .unitypackage file, or\\n" +
            "2. Use Assets → Import Package → Custom Package",
            MessageType.None
        );

        EditorGUILayout.Space(10);
        
        // Quick actions
        EditorGUILayout.LabelField("Quick Actions", EditorStyles.boldLabel);
        EditorGUILayout.BeginHorizontal();
        
        if (GUILayout.Button("Open Output Folder"))
        {
            string outputPath = Path.Combine(Application.dataPath, "VRCStudio/Avatars/${avatarId}");
            if (Directory.Exists(outputPath))
            {
                EditorUtility.RevealInFinder(outputPath);
            }
            else
            {
                EditorUtility.DisplayDialog("Info", "Output folder doesn't exist yet. Import an avatar first.", "OK");
            }
        }
        
        if (GUILayout.Button("Setup Project Structure"))
        {
            VRCStudioSetup.SetupProject();
        }
        
        EditorGUILayout.EndHorizontal();

        EditorGUILayout.EndScrollView();
    }

    private static void LoadAndInspectBundle(string bundlePath)
    {
        // Unload any previously loaded bundle
        if (loadedBundle != null)
        {
            loadedBundle.Unload(true);
            loadedBundle = null;
        }
        assetNames = null;

        try
        {
            loadedBundle = AssetBundle.LoadFromFile(bundlePath);
            if (loadedBundle != null)
            {
                assetNames = loadedBundle.GetAllAssetNames();
                Debug.Log($"[VRCStudio] Bundle loaded successfully. Contains {assetNames.Length} assets.");
            }
            else
            {
                Debug.LogWarning("[VRCStudio] Failed to load bundle. It may be corrupted or incompatible.");
            }
        }
        catch (System.Exception e)
        {
            Debug.LogError($"[VRCStudio] Error loading bundle: {e.Message}");
            assetNames = null;
        }
    }

    private static void ImportVRCABundle(string bundlePath)
    {
        try
        {
            string outputDir = "Assets/VRCStudio/Avatars/${avatarId}";
            
            // Create output directory
            if (!AssetDatabase.IsValidFolder("Assets/VRCStudio"))
                AssetDatabase.CreateFolder("Assets", "VRCStudio");
            if (!AssetDatabase.IsValidFolder("Assets/VRCStudio/Avatars"))
                AssetDatabase.CreateFolder("Assets/VRCStudio", "Avatars");
            if (!AssetDatabase.IsValidFolder(outputDir))
                AssetDatabase.CreateFolder("Assets/VRCStudio/Avatars", "${avatarId}");

            // Load the bundle
            AssetBundle bundle = AssetBundle.LoadFromFile(bundlePath);
            if (bundle == null)
            {
                EditorUtility.DisplayDialog(
                    "Import Failed",
                    "Failed to load the AssetBundle. The file may be corrupted or created with an incompatible Unity version.\\n\\n" +
                    "Make sure the .vrca file was created with version patching enabled for Unity 2022.3.22f1.",
                    "OK"
                );
                return;
            }

            // Get all asset names
            string[] allAssets = bundle.GetAllAssetNames();
            Debug.Log($"[VRCStudio] Found {allAssets.Length} assets in bundle");

            int importedCount = 0;
            List<GameObject> prefabs = new List<GameObject>();

            // Extract each asset
            foreach (string assetPath in allAssets)
            {
                try
                {
                    Object asset = bundle.LoadAsset(assetPath);
                    if (asset == null) continue;

                    string fileName = Path.GetFileName(assetPath);
                    string destPath = outputDir + "/" + fileName;

                    // Handle different asset types
                    if (asset is GameObject go)
                    {
                        // Save prefab
                        string prefabPath = destPath.EndsWith(".prefab") ? destPath : destPath + ".prefab";
                        PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
                        prefabs.Add(go);
                        Debug.Log($"[VRCStudio] Saved prefab: {prefabPath}");
                    }
                    else if (asset is Texture2D tex)
                    {
                        // Save texture
                        byte[] pngData = tex.EncodeToPNG();
                        if (pngData != null)
                        {
                            string texPath = destPath.EndsWith(".png") ? destPath : destPath + ".png";
                            string fullPath = Path.Combine(Path.GetDirectoryName(Application.dataPath), texPath);
                            File.WriteAllBytes(fullPath, pngData);
                            Debug.Log($"[VRCStudio] Saved texture: {texPath}");
                        }
                    }
                    else if (asset is Material mat)
                    {
                        // Create material asset
                        string matPath = destPath.EndsWith(".mat") ? destPath : destPath + ".mat";
                        Material newMat = new Material(mat);
                        AssetDatabase.CreateAsset(newMat, matPath);
                        Debug.Log($"[VRCStudio] Saved material: {matPath}");
                    }
                    // Add more asset type handlers as needed

                    importedCount++;
                }
                catch (System.Exception e)
                {
                    Debug.LogWarning($"[VRCStudio] Failed to extract asset {assetPath}: {e.Message}");
                }
            }

            // Unload bundle
            bundle.Unload(false);

            // Refresh asset database
            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog(
                "Import Complete",
                $"Successfully imported {importedCount} assets from the avatar bundle.\\n\\n" +
                $"Location: {outputDir}\\n\\n" +
                "Look for prefabs to drag into your scene.",
                "OK"
            );

            // Reveal in project
            EditorUtility.RevealInFinder(Path.Combine(Application.dataPath, "VRCStudio/Avatars/${avatarId}"));
        }
        catch (System.Exception e)
        {
            EditorUtility.DisplayDialog(
                "Import Error",
                $"An error occurred during import:\\n\\n{e.Message}\\n\\n" +
                "Check the Console for more details.",
                "OK"
            );
            Debug.LogError($"[VRCStudio] Import error: {e}");
        }
    }

    private static void ImportUnityPackage(string packagePath)
    {
        try
        {
            AssetDatabase.ImportPackage(packagePath, true);
        }
        catch (System.Exception e)
        {
            EditorUtility.DisplayDialog("Error", "Import failed: " + e.Message, "OK");
        }
    }
}
`;
}

function sanitizeClassName(name: string): string {
  // Remove special characters and spaces, ensure it starts with a letter
  return name
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^[0-9]/, '_$&')
    .substring(0, 128) || 'AvatarImporter';
}

/**
 * Generate a setup script that helps with avatar folder structure
 */
export function generateSetupScript(): string {
  return `// VRC Studio - Avatar Setup Helper
// This script helps organize imported avatars in Unity

using UnityEditor;
using UnityEngine;
using System.IO;

public class VRCStudioSetup : EditorWindow
{
    [MenuItem("VRChat/VRC Studio/Setup Avatar Project")]
    public static void SetupProject()
    {
        // Create folder structure
        CreateFolder("Assets", "VRCStudio");
        CreateFolder("Assets/VRCStudio", "Avatars");
        CreateFolder("Assets/VRCStudio", "Worlds");
        CreateFolder("Assets/VRCStudio", "Documentation");

        EditorUtility.DisplayDialog(
            "Setup Complete",
            "VRC Studio folder structure created!\\n\\n" +
            "Place avatar bundles in: Assets/VRCStudio/Avatars/",
            "OK"
        );

        // Open folder - use compatible method
        string folderPath = Path.Combine(Application.dataPath, "VRCStudio");
        #if UNITY_EDITOR_WIN
            System.Diagnostics.Process.Start("explorer.exe", folderPath.Replace("/", "\\\\"));
        #elif UNITY_EDITOR_OSX
            System.Diagnostics.Process.Start("open", folderPath);
        #else
            EditorUtility.RevealInFinder(folderPath);
        #endif
    }

    private static void CreateFolder(string parent, string name)
    {
        string path = Path.Combine(parent, name);
        if (!AssetDatabase.IsValidFolder(path))
        {
            AssetDatabase.CreateFolder(parent, name);
        }
    }
}
`;
}

/**
 * Generate a README for the avatar package
 */
export function generateReadme(avatarName: string, avatarId: string, authorName: string): string {
  return `# ${avatarName}

**Author:** ${authorName}
**Avatar ID:** ${avatarId}

## Package Contents

- \`metadata.json\` - Avatar information and package metadata
- \`${avatarId}-image.png\` - Full avatar image
- \`${avatarId}-thumbnail.png\` - Avatar thumbnail
- \`${avatarId}.vrca\` - Unity AssetBundle (patched for Unity 2022.3.22f1)
- \`Editor/\` - Unity editor scripts for easy importing
- \`README.md\` - This file

## Quick Start

### Option 1: Use the Unity Importer Script (Recommended)

1. Copy the \`Editor/\` folder to your Unity project's \`Assets/\` folder
2. In Unity, go to: **VRChat > VRC Studio > Import ${avatarName}**
3. Click **Select Avatar File** and choose the \`.vrca\` file
4. Click **Import Avatar**
5. Find the extracted assets in \`Assets/VRCStudio/Avatars/${avatarId}/\`

### Option 2: Direct AssetBundle Loading

1. Open your Unity project (must be Unity **2022.3.22f1** - VRChat Creator Companion version)
2. Use this code to load the bundle:

\`\`\`csharp
AssetBundle bundle = AssetBundle.LoadFromFile("path/to/${avatarId}.vrca");
string[] assetNames = bundle.GetAllAssetNames();
foreach (string name in assetNames)
{
    Object asset = bundle.LoadAsset(name);
    // Process the asset...
}
bundle.Unload(false);
\`\`\`

## About VRCA Files

The \`.vrca\` file is a Unity AssetBundle extracted from VRChat's cache. VRC Studio automatically patches the Unity version in these bundles to make them compatible with the public Unity version used by VRChat Creator Companion (2022.3.22f1).

**Original VRChat Unity Version:** Varies (e.g., 2022.3.22f2)
**Patched Unity Version:** 2022.3.22f1

## Troubleshooting

### "Version mismatch" error
- Make sure you're using Unity **2022.3.22f1** (the VCC version)
- The .vrca file should already be patched. If not, re-export from VRC Studio with version patching enabled

### Bundle won't load
- Verify the file isn't corrupted (should be several MB at minimum)
- Check the Unity Console for specific error messages
- Try loading with the provided Editor script instead of manual loading

### Assets look broken
- Some materials may need shader reassignment
- Textures might need to be reimported
- Check for missing script references

### Can't find prefabs
- Look in the bundle's asset list (shown in the importer window)
- Some avatars store the main prefab at different paths

## Unity Version Compatibility

| Unity Version | Compatible | Notes |
|---------------|------------|-------|
| 2022.3.22f1   | ✓ Yes      | VRChat Creator Companion version |
| 2022.3.22f2   | ⚠ Maybe    | VRChat internal version |
| Other 2022.3.x| ⚠ Maybe    | May work, not guaranteed |
| 2019.4.x      | ✗ No       | Older VRChat SDK version |

## File Format Reference

| Extension | Format | Description |
|-----------|--------|-------------|
| .vrca | AssetBundle | Raw Unity AssetBundle with VRChat avatar data |
| .unitypackage | tar.gz | Unity package format (contains GUID structure) |

---

Generated by VRC Studio
Bundle extracted from VRChat cache with automatic version patching
For issues: Check the diagnostic log in VRC Studio
`;
}
