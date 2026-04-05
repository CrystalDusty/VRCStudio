#!/usr/bin/env python3
"""
VRCStudio Version Patching Backend Test
Tests the Unity version patching functionality in the Electron app.
"""

import os
import sys
import subprocess
import json
from datetime import datetime

class VRCStudioTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.app_dir = "/app"
        self.test_avatar_path = "/tmp/test_avatar.vrca"
        self.test_avatar_patched_path = "/tmp/test_avatar_patched.vrca"
        
    def log_test(self, name, success, details="", error=""):
        """Log a test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED")
        else:
            print(f"❌ {name}: FAILED - {error}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "error": error
        })
        
    def test_file_existence(self):
        """Test that required files exist"""
        files_to_check = [
            ("/app/electron/main.ts", "Main Electron file"),
            ("/app/electron/preload.ts", "Preload script"),
            ("/tmp/test_avatar.vrca", "Test VRCA file"),
            ("/tmp/test_avatar_patched.vrca", "Patched VRCA file"),
        ]
        
        for file_path, description in files_to_check:
            if os.path.exists(file_path):
                size = os.path.getsize(file_path)
                self.log_test(f"File exists: {description}", True, f"Size: {size} bytes")
            else:
                self.log_test(f"File exists: {description}", False, error=f"File not found: {file_path}")
    
    def test_typescript_syntax(self):
        """Test TypeScript syntax using basic checks"""
        try:
            # Check main.ts for the patchUnityVersionInBuffer function
            with open("/app/electron/main.ts", "r") as f:
                main_content = f.read()
            
            # Check for key function
            if "function patchUnityVersionInBuffer" in main_content:
                self.log_test("patchUnityVersionInBuffer function exists", True)
            else:
                self.log_test("patchUnityVersionInBuffer function exists", False, 
                            error="Function not found in main.ts")
            
            # Check for target version constant
            if "TARGET_UNITY_VERSION = '2022.3.22f1'" in main_content:
                self.log_test("TARGET_UNITY_VERSION constant correct", True)
            else:
                self.log_test("TARGET_UNITY_VERSION constant correct", False,
                            error="Target version constant not found or incorrect")
            
            # Check preload.ts for new IPC handlers
            with open("/app/electron/preload.ts", "r") as f:
                preload_content = f.read()
            
            if "patchVrcaVersion:" in preload_content:
                self.log_test("patchVrcaVersion IPC handler exposed", True)
            else:
                self.log_test("patchVrcaVersion IPC handler exposed", False,
                            error="patchVrcaVersion not found in preload.ts")
                
            if "analyzeBundle:" in preload_content:
                self.log_test("analyzeBundle IPC handler exposed", True)
            else:
                self.log_test("analyzeBundle IPC handler exposed", False,
                            error="analyzeBundle not found in preload.ts")
                
        except Exception as e:
            self.log_test("TypeScript syntax check", False, error=str(e))
    
    def test_ipc_handlers_implementation(self):
        """Test that IPC handlers are implemented in main.ts"""
        try:
            with open("/app/electron/main.ts", "r") as f:
                main_content = f.read()
            
            # Check for IPC handler implementations
            if "ipcMain.handle('fs:patchVrcaVersion'" in main_content:
                self.log_test("fs:patchVrcaVersion IPC handler implemented", True)
            else:
                self.log_test("fs:patchVrcaVersion IPC handler implemented", False,
                            error="Handler not found in main.ts")
                
            if "ipcMain.handle('fs:analyzeBundle'" in main_content:
                self.log_test("fs:analyzeBundle IPC handler implemented", True)
            else:
                self.log_test("fs:analyzeBundle IPC handler implemented", False,
                            error="Handler not found in main.ts")
                
        except Exception as e:
            self.log_test("IPC handlers implementation check", False, error=str(e))
    
    def test_version_patching_logic(self):
        """Test the version patching logic by analyzing the function"""
        try:
            with open("/app/electron/main.ts", "r") as f:
                content = f.read()
            
            # Check for key patching logic elements
            checks = [
                ("Gzip handling", "data[0] === 0x1f && data[1] === 0x8b"),
                ("UnityFS marker search", "Buffer.from('UnityFS', 'utf8')"),
                ("Version replacement logic", "TARGET_UNITY_VERSION"),
                ("Multiple occurrence patching", "replacementCount"),
                ("Buffer manipulation", "targetBytes.copy(data"),
            ]
            
            for check_name, pattern in checks:
                if pattern in content:
                    self.log_test(f"Version patching logic: {check_name}", True)
                else:
                    self.log_test(f"Version patching logic: {check_name}", False,
                                error=f"Pattern not found: {pattern}")
                    
        except Exception as e:
            self.log_test("Version patching logic analysis", False, error=str(e))
    
    def test_unity_fs_header_handling(self):
        """Test UnityFS header structure handling"""
        try:
            with open("/app/electron/main.ts", "r") as f:
                content = f.read()
            
            # Check for proper header parsing
            header_checks = [
                ("Header offset calculation", "offset = 12"),
                ("Player version parsing", "while (offset < data.length && data[offset] !== 0)"),
                ("Engine version bounds", "engineVerStart = offset"),
                ("Null terminator handling", "data[offset] !== 0"),
            ]
            
            for check_name, pattern in header_checks:
                if pattern in content:
                    self.log_test(f"UnityFS header handling: {check_name}", True)
                else:
                    self.log_test(f"UnityFS header handling: {check_name}", False,
                                error=f"Pattern not found: {pattern}")
                    
        except Exception as e:
            self.log_test("UnityFS header handling analysis", False, error=str(e))
    
    def test_vrca_file_analysis(self):
        """Analyze the test VRCA files to verify they contain expected data"""
        try:
            # Check original file
            if os.path.exists(self.test_avatar_path):
                with open(self.test_avatar_path, "rb") as f:
                    data = f.read(100)  # Read first 100 bytes
                
                # Check for UnityFS header
                if b"UnityFS" in data:
                    self.log_test("Original VRCA contains UnityFS header", True)
                else:
                    self.log_test("Original VRCA contains UnityFS header", False,
                                error="UnityFS header not found in first 100 bytes")
            
            # Check patched file
            if os.path.exists(self.test_avatar_patched_path):
                with open(self.test_avatar_patched_path, "rb") as f:
                    data = f.read(100)  # Read first 100 bytes
                
                if b"UnityFS" in data:
                    self.log_test("Patched VRCA contains UnityFS header", True)
                else:
                    self.log_test("Patched VRCA contains UnityFS header", False,
                                error="UnityFS header not found in patched file")
                    
                # Compare file sizes
                orig_size = os.path.getsize(self.test_avatar_path)
                patched_size = os.path.getsize(self.test_avatar_patched_path)
                
                if orig_size == patched_size:
                    self.log_test("Patched file maintains original size", True,
                                f"Both files are {orig_size} bytes")
                else:
                    self.log_test("Patched file maintains original size", False,
                                error=f"Size mismatch: orig={orig_size}, patched={patched_size}")
                    
        except Exception as e:
            self.log_test("VRCA file analysis", False, error=str(e))
    
    def test_version_string_replacement(self):
        """Test that version string replacement logic is comprehensive"""
        try:
            with open("/app/electron/main.ts", "r") as f:
                content = f.read()
            
            # Check for comprehensive replacement logic
            replacement_checks = [
                ("Clear original field", "data[i] = 0"),
                ("Copy target version", "targetBytes.copy(data"),
                ("Multiple occurrence search", "while (searchStart <= data.length"),
                ("Safety limit", "maxReplacements"),
                ("Search continuation", "searchStart = foundIdx"),
            ]
            
            for check_name, pattern in replacement_checks:
                if pattern in content:
                    self.log_test(f"Version replacement: {check_name}", True)
                else:
                    self.log_test(f"Version replacement: {check_name}", False,
                                error=f"Pattern not found: {pattern}")
                    
        except Exception as e:
            self.log_test("Version string replacement analysis", False, error=str(e))
    
    def test_error_handling(self):
        """Test error handling in the patching functions"""
        try:
            with open("/app/electron/main.ts", "r") as f:
                content = f.read()
            
            # Check for error handling patterns
            error_checks = [
                ("Try-catch blocks", "try {"),
                ("Error logging", "logDiagnostic"),
                ("File existence check", "fs.existsSync"),
                ("Buffer validation", "if (!data)"),
                ("Return error objects", "{ success: false, error:"),
            ]
            
            for check_name, pattern in error_checks:
                if pattern in content:
                    self.log_test(f"Error handling: {check_name}", True)
                else:
                    self.log_test(f"Error handling: {check_name}", False,
                                error=f"Pattern not found: {pattern}")
                    
        except Exception as e:
            self.log_test("Error handling analysis", False, error=str(e))
    
    def run_all_tests(self):
        """Run all tests"""
        print("🧪 Starting VRCStudio Version Patching Tests")
        print("=" * 50)
        
        self.test_file_existence()
        self.test_typescript_syntax()
        self.test_ipc_handlers_implementation()
        self.test_version_patching_logic()
        self.test_unity_fs_header_handling()
        self.test_vrca_file_analysis()
        self.test_version_string_replacement()
        self.test_error_handling()
        
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False
    
    def get_summary(self):
        """Get test summary"""
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.tests_run - self.tests_passed,
            "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0,
            "test_results": self.test_results
        }

def main():
    tester = VRCStudioTester()
    success = tester.run_all_tests()
    
    # Save detailed results
    summary = tester.get_summary()
    
    print(f"\n📋 Summary:")
    print(f"   Success Rate: {summary['success_rate']:.1f}%")
    print(f"   Total Tests: {summary['total_tests']}")
    print(f"   Passed: {summary['passed_tests']}")
    print(f"   Failed: {summary['failed_tests']}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())