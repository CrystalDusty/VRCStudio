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

            EditorUtility.RevealProjectFolder(Path.Combine(Application.dataPath, "VRCStudio/Avatars/${avatarId}"));
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

        EditorUtility.RevealProjectFolder(Path.Combine(Application.dataPath, "VRCStudio"));
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
- \`${avatarId}.unitypackage\` - Avatar bundle (may need to be added manually)
- \`Editor/\` - Unity importer scripts
- \`README.md\` - This file

## ⚠️ IMPORTANT: If .unitypackage is Missing

If the \`.unitypackage\` file was NOT included in your download:

1. **Check VRChat Cache Manually:**
   - Open File Explorer
   - Go to: \`C:\\Users\\[YourUsername]\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WebGL\`
   - Look for files containing the avatar ID or \`file_\`
   - Copy any \`.unitypackage\` files to this folder

2. **Or Download from VRChat:**
   - Load the avatar in VRChat once
   - VRChat will cache it locally
   - VRC Studio can then extract it

3. **Once You Have the Bundle:**
   - Place the \`.unitypackage\` file in this folder
   - Use the Unity importer (see below)

## How to Import into Unity

### Option 1: Using the Importer Script (Recommended)

1. Copy this entire folder to your Unity project: \`Assets/YourFolder/\`
2. Wait for Unity to reimport files
3. In Unity Editor, go to: **VRChat > VRC Studio > Import ${avatarName}**
4. Click **Select Bundle File** and choose the \`.unitypackage\`
5. Click **Import Bundle**
6. Avatar extracts to: \`Assets/VRCStudio/Avatars/${avatarId}/\`

### Option 2: Manual Unity Import

1. Have the \`.unitypackage\` file ready
2. In Unity, double-click the \`.unitypackage\` file
3. Review what will be imported
4. Click **Import** to bring files into project

### Option 3: Direct File Extraction

1. Right-click \`.unitypackage\` → Extract with 7-Zip or WinRAR
2. Copy extracted folder contents into \`Assets/YourFolder/\`
3. Unity auto-reimports

## Troubleshooting

**"Bundle file not found" error:**
- Verify the \`.unitypackage\` is in the same folder as the CS scripts
- Check that the file isn't corrupted (should be > 100 MB typically)
- See "If .unitypackage is Missing" section above

**Import fails / Avatar incomplete:**
- Check Unity version in \`metadata.json\` matches your project
- Ensure you have VRC SDK installed
- Check that all folders/files imported successfully

**Avatar looks wrong in scene:**
- Check textures are assigned to materials
- Verify all prefabs imported
- Look for missing script references in Console
- Check avatar author's documentation

## Understanding Your Package

\`\`\`
metadata.json contains:
- avatarId, avatarName, authorName
- Platform: standalonewindows, quest, android, etc.
- Required Unity version
- unityPackageUrl (download link)
\`\`\`

Use this info to ensure your project matches requirements.

## Next Steps

1. ✓ Extract this package
2. ✓ Get the \`.unitypackage\` file (manually if needed)
3. ✓ Copy both to Unity project
4. ✓ Run the importer script
5. ✓ Drag avatar into your scene
6. ✓ Configure and customize

---

Generated by VRC Studio
For questions: Check metadata.json for package details
`;
}
