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
- \`${avatarId}.unitypackage\` - Avatar bundle for import (if available)
- \`Editor/\` - Unity importer scripts

## How to Import into Unity

### Option 1: Using the Importer Script (Recommended)

1. Copy this entire folder to your Unity project
2. In Unity Editor, go to: **VRChat > VRC Studio > Import ${avatarName}**
3. Select the \`.unitypackage\` file
4. Click **Import Bundle**
5. The avatar will be extracted to \`Assets/VRCStudio/Avatars/${avatarId}/\`

### Option 2: Manual Import

1. Copy the \`.unitypackage\` file
2. In Unity, double-click it or drag it into the project
3. Review and confirm imports
4. The avatar will be imported into your project

### Option 3: Direct Extraction

1. Extract the \`.unitypackage\` using 7-Zip or WinRAR
2. Place the contents in your Assets folder
3. Let Unity reimport the files

## Troubleshooting

**Bundle file not found:**
- Ensure the \`.unitypackage\` file is in the same folder
- Check that VRC Studio successfully extracted it from cache

**Import fails:**
- Check Unity version matches the package requirement
- Ensure you have VRC SDK installed
- Check the metadata.json for version info

**Avatar doesn't look right:**
- Check that all textures imported correctly
- Verify materials are assigned to the mesh
- Check the avatar prefab in the Hierarchy

## Metadata

See \`metadata.json\` for complete avatar information including:
- Platform (standalonewindows, quest, etc.)
- Required Unity version
- Asset versions
- Download URLs

## Tips

- Keep the folder structure intact for easy updates
- Backup the metadata.json for future reference
- Check the avatar author's documentation for setup instructions
- Some avatars may require additional VRC SDK components

---

Generated by VRC Studio
Export Date: $(new Date().toISOString())
`;
}
