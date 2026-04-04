/**
 * Unity Importer Generator
 * Creates a ready-to-use C# script for importing avatars into Unity
 */

export function generateUnityImporterScript(avatarId: string, avatarName: string): string {
  return `// Auto-generated Avatar Importer for ${avatarName}
// Place this script in: Assets/Editor/VRCStudioImporters/

using UnityEditor;
using UnityEngine;
using System.IO;

public class ${sanitizeClassName(avatarName)}Importer : EditorWindow
{
    private static string bundlePath = "";
    private static string extractPath = "";

    [MenuItem("VRChat/VRC Studio/Import ${sanitizeClassName(avatarName)}")]
    public static void ShowWindow()
    {
        GetWindow<${sanitizeClassName(avatarName)}Importer>("Import ${avatarName}");
    }

    private void OnGUI()
    {
        GUILayout.Label("Avatar: ${avatarName}", EditorStyles.boldLabel);
        GUILayout.Label("Avatar ID: ${avatarId}", EditorStyles.miniLabel);

        GUILayout.Space(10);

        GUILayout.Label("Import Instructions:", EditorStyles.boldLabel);
        GUILayout.Label(
            "1. Place the .unitypackage file in Assets/VRCStudio/Avatars\\n" +
            "2. Click 'Import Bundle' below\\n" +
            "3. Unity will extract and set up the avatar\\n" +
            "4. Check the imported avatar in your project",
            EditorStyles.wordWrappedLabel
        );

        GUILayout.Space(10);

        if (GUILayout.Button("Select Bundle File", GUILayout.Height(30)))
        {
            bundlePath = EditorUtility.OpenFilePanel(
                "Select Avatar Bundle",
                "",
                "unitypackage"
            );
        }

        if (!string.IsNullOrEmpty(bundlePath))
        {
            GUILayout.Label("Selected: " + Path.GetFileName(bundlePath), EditorStyles.miniLabel);
        }

        GUILayout.Space(10);

        if (GUILayout.Button("Import Bundle", GUILayout.Height(40)))
        {
            if (string.IsNullOrEmpty(bundlePath))
            {
                EditorUtility.DisplayDialog("Error", "Please select a bundle file first", "OK");
                return;
            }

            ImportBundle(bundlePath);
        }

        GUILayout.Space(10);
        GUILayout.Label("Metadata", EditorStyles.boldLabel);

        if (GUILayout.Button("Open Metadata JSON"))
        {
            string metadataPath = Path.Combine(
                Application.dataPath,
                "VRCStudio/Avatars/${avatarId}/metadata.json"
            );

            if (File.Exists(metadataPath))
            {
                EditorUtility.OpenWithDefaultApp(metadataPath);
            }
            else
            {
                EditorUtility.DisplayDialog(
                    "Info",
                    "Place metadata.json in: Assets/VRCStudio/Avatars/${avatarId}/",
                    "OK"
                );
            }
        }
    }

    private static void ImportBundle(string bundlePath)
    {
        try
        {
            string fileName = Path.GetFileNameWithoutExtension(bundlePath);
            string importPath = "Assets/VRCStudio/Avatars/${avatarId}/";

            // Create directory if it doesn't exist
            if (!AssetDatabase.IsValidFolder(importPath))
            {
                string[] parts = importPath.Trim('/').Split('/');
                string currentPath = "";
                foreach (string part in parts)
                {
                    currentPath += part + "/";
                    if (!AssetDatabase.IsValidFolder(currentPath.TrimEnd('/')))
                    {
                        AssetDatabase.CreateFolder(
                            currentPath.Substring(0, currentPath.LastIndexOf('/')).TrimEnd('/'),
                            part
                        );
                    }
                }
            }

            // Copy bundle file to Assets
            string destPath = Path.Combine("Assets/VRCStudio/Avatars/${avatarId}/", Path.GetFileName(bundlePath));
            string assetPath = destPath.Replace("\\\\", "/");

            FileUtil.CopyFileOrDirectory(bundlePath, destPath);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.Default);

            EditorUtility.DisplayDialog(
                "Success",
                $"Avatar bundle imported!\\n\\nLocation: {assetPath}\\n\\n" +
                "Next steps:\\n" +
                "1. Find the avatar prefab in the project\\n" +
                "2. Drag it into your scene\\n" +
                "3. Configure as needed",
                "OK"
            );

            // Open folder - use compatible method
            string folderPath = Path.Combine(Application.dataPath, "VRCStudio/Avatars/${avatarId}");
            #if UNITY_EDITOR_WIN
                System.Diagnostics.Process.Start("explorer.exe", folderPath.Replace("/", "\\\\"));
            #elif UNITY_EDITOR_OSX
                System.Diagnostics.Process.Start("open", folderPath);
            #else
                EditorUtility.RevealInFinder(folderPath);
            #endif
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
- \`${avatarId}.bundle\` - Unity AssetBundle (the avatar data)
- \`Editor/\` - Unity editor scripts
- \`README.md\` - This file

## How to Import the Avatar Bundle into Unity

The \`.bundle\` file is a Unity AssetBundle extracted directly from VRChat's cache.

### Method 1: Direct Drag & Drop (Easiest)

1. Copy the \`${avatarId}.bundle\` file
2. Drag it directly into your Unity **Assets** folder
3. Unity will automatically import it as an AssetBundle
4. Find the bundle in your Project window and use it

### Method 2: Using the Editor Script

1. Copy this entire folder to your Unity project's **Assets** folder
2. In Unity, go to: **VRChat > VRC Studio > Import ${avatarName}**
3. Click **Select Bundle File** and choose the \`.bundle\` file
4. Click **Import Bundle**
5. Avatar files extract to: \`Assets/VRCStudio/Avatars/${avatarId}/\`

### Method 3: Manual Asset Import

1. In Unity, right-click in **Project > Import New Asset**
2. Select the \`.bundle\` file
3. Adjust import settings if needed
4. Click **Import**

## Using the Avatar in Your Scene

Once imported, the bundle contains the avatar prefab and all assets:

1. Find the avatar prefab in your Project hierarchy
2. Drag it into your Scene
3. Configure materials, animations, and scripts as needed
4. Check \`metadata.json\` for platform-specific requirements

## Bundle Specifications

Check \`metadata.json\` for:
- **Platform**: standalonewindows, quest, android, etc.
- **Unity Version**: Required version to use this avatar
- **Author**: Creator information
- **Description**: Avatar details

## Troubleshooting

**Bundle won't import:**
- Verify the file isn't corrupted (should be ~100+ MB)
- Check you're using the correct Unity version
- Check the Editor console for errors

**Avatar looks broken:**
- Verify all textures imported with the bundle
- Check that materials are assigned
- Inspect the avatar prefab hierarchy
- Look for missing script references

**Performance issues:**
- Check if textures are too high resolution
- Reduce shadow resolution
- Check poly count in Scene settings

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "File not found" | Ensure .bundle file is in the same folder |
| "Can't import" | Try dragging directly into Assets folder |
| Broken textures | Right-click bundle > Reimport |
| Missing animations | Check avatar prefab in Project folder |

## Understanding the Bundle Format

The \`.bundle\` file is a Unity native AssetBundle format that contains:
- The avatar prefab/model
- All textures and materials
- All animations and scripts
- Any other avatar-specific assets

Unlike .unitypackage (which is ZIP), bundles are more compact and efficient.

## Next Steps

1. ✓ Extract this package to your project
2. ✓ Import the .bundle file into Unity
3. ✓ Drag the avatar prefab into your scene
4. ✓ Customize as needed for your project

## Need Help?

- Check the metadata.json for avatar specifications
- See the included EditorSetup.cs for additional options
- For VRC-specific issues, consult the VRC SDK documentation

---

Generated by VRC Studio
Bundle extracted from VRChat Cache
For questions: Check metadata.json for package details
`;
}
