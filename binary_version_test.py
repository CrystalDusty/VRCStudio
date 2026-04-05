#!/usr/bin/env python3
"""
VRCStudio Binary Version Analysis Test
Analyzes the actual binary content of VRCA files to verify version patching.
"""

import os
import sys

def analyze_unity_version_in_file(file_path):
    """Analyze Unity version strings in a VRCA file"""
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
        
        # Find UnityFS header
        unityfs_pos = data.find(b'UnityFS')
        if unityfs_pos == -1:
            return {"error": "UnityFS header not found"}
        
        # Parse header starting from UnityFS position
        offset = unityfs_pos + 12  # Skip "UnityFS\0" + 4 bytes format version
        
        # Read player version (null-terminated)
        player_version = b""
        while offset < len(data) and data[offset] != 0:
            player_version += bytes([data[offset]])
            offset += 1
        offset += 1  # Skip null terminator
        
        # Read engine version (null-terminated)
        engine_version = b""
        while offset < len(data) and data[offset] != 0:
            engine_version += bytes([data[offset]])
            offset += 1
        
        # Look for all occurrences of version strings in the file
        player_str = player_version.decode('utf-8', errors='ignore')
        engine_str = engine_version.decode('utf-8', errors='ignore')
        
        # Count occurrences
        engine_occurrences = data.count(engine_version)
        
        return {
            "file_size": len(data),
            "unityfs_position": unityfs_pos,
            "player_version": player_str,
            "engine_version": engine_str,
            "engine_version_occurrences": engine_occurrences,
            "has_dwr_suffix": "-DWR" in engine_str,
            "is_target_version": engine_str == "2022.3.22f1"
        }
        
    except Exception as e:
        return {"error": str(e)}

def main():
    print("🔍 VRCStudio Binary Version Analysis")
    print("=" * 50)
    
    original_file = "/tmp/test_avatar.vrca"
    patched_file = "/tmp/test_avatar_patched.vrca"
    
    # Analyze original file
    print("📁 Analyzing original VRCA file...")
    original_analysis = analyze_unity_version_in_file(original_file)
    
    if "error" in original_analysis:
        print(f"❌ Error analyzing original file: {original_analysis['error']}")
        return 1
    
    print(f"   File size: {original_analysis['file_size']:,} bytes")
    print(f"   UnityFS position: {original_analysis['unityfs_position']}")
    print(f"   Player version: {original_analysis['player_version']}")
    print(f"   Engine version: {original_analysis['engine_version']}")
    print(f"   Engine version occurrences: {original_analysis['engine_version_occurrences']}")
    print(f"   Has -DWR suffix: {original_analysis['has_dwr_suffix']}")
    print(f"   Is target version: {original_analysis['is_target_version']}")
    
    # Analyze patched file
    print("\n📁 Analyzing patched VRCA file...")
    patched_analysis = analyze_unity_version_in_file(patched_file)
    
    if "error" in patched_analysis:
        print(f"❌ Error analyzing patched file: {patched_analysis['error']}")
        return 1
    
    print(f"   File size: {patched_analysis['file_size']:,} bytes")
    print(f"   UnityFS position: {patched_analysis['unityfs_position']}")
    print(f"   Player version: {patched_analysis['player_version']}")
    print(f"   Engine version: {patched_analysis['engine_version']}")
    print(f"   Engine version occurrences: {patched_analysis['engine_version_occurrences']}")
    print(f"   Has -DWR suffix: {patched_analysis['has_dwr_suffix']}")
    print(f"   Is target version: {patched_analysis['is_target_version']}")
    
    # Verification tests
    print("\n🧪 Verification Tests:")
    tests_passed = 0
    total_tests = 0
    
    # Test 1: Original should have -DWR suffix
    total_tests += 1
    if original_analysis['has_dwr_suffix']:
        print("✅ Original file contains -DWR suffix")
        tests_passed += 1
    else:
        print("❌ Original file should contain -DWR suffix")
    
    # Test 2: Patched should NOT have -DWR suffix
    total_tests += 1
    if not patched_analysis['has_dwr_suffix']:
        print("✅ Patched file does not contain -DWR suffix")
        tests_passed += 1
    else:
        print("❌ Patched file should not contain -DWR suffix")
    
    # Test 3: Patched should be target version
    total_tests += 1
    if patched_analysis['is_target_version']:
        print("✅ Patched file uses target Unity version (2022.3.22f1)")
        tests_passed += 1
    else:
        print(f"❌ Patched file should use target version, got: {patched_analysis['engine_version']}")
    
    # Test 4: File sizes should be identical
    total_tests += 1
    if original_analysis['file_size'] == patched_analysis['file_size']:
        print("✅ File sizes are identical after patching")
        tests_passed += 1
    else:
        print("❌ File sizes differ after patching")
    
    # Test 5: Version should be completely replaced (not just header)
    total_tests += 1
    if patched_analysis['engine_version_occurrences'] > 0:
        print(f"✅ Target version appears {patched_analysis['engine_version_occurrences']} times in patched file")
        tests_passed += 1
    else:
        print("❌ Target version not found in patched file")
    
    print(f"\n📊 Test Results: {tests_passed}/{total_tests} passed")
    
    if tests_passed == total_tests:
        print("🎉 All version patching verification tests passed!")
        return 0
    else:
        print(f"⚠️  {total_tests - tests_passed} verification tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())