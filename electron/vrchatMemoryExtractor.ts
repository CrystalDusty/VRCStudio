/**
 * VRChat Memory Key Extractor
 * 
 * This module extracts encryption keys from a running VRChat process.
 * 
 * HOW IT WORKS:
 * 1. Find the VRChat.exe process
 * 2. Read its memory regions
 * 3. Search for AES key patterns (16/32 byte aligned, near encryption functions)
 * 4. Validate candidates by attempting decryption
 * 
 * REQUIREMENTS:
 * - VRChat must be running and logged in
 * - Admin privileges may be required
 * - EAC (Easy Anti-Cheat) may block memory access
 * 
 * ALTERNATIVE APPROACHES:
 * - Network interception during login
 * - DLL injection (requires EAC bypass)
 * - API hooking
 */

import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// PowerShell script for memory scanning (Windows only)
const MEMORY_SCAN_PS1 = `
param(
    [string]$ProcessName = "VRChat",
    [string]$OutputFile
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class MemoryReader {
    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll")]
    public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out int lpNumberOfBytesRead);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll")]
    public static extern int VirtualQueryEx(IntPtr hProcess, IntPtr lpAddress, out MEMORY_BASIC_INFORMATION lpBuffer, uint dwLength);

    [StructLayout(LayoutKind.Sequential)]
    public struct MEMORY_BASIC_INFORMATION {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public IntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    public const int PROCESS_VM_READ = 0x0010;
    public const int PROCESS_QUERY_INFORMATION = 0x0400;
    public const uint MEM_COMMIT = 0x1000;
    public const uint PAGE_READWRITE = 0x04;
    public const uint PAGE_READONLY = 0x02;
    public const uint PAGE_EXECUTE_READ = 0x20;
}
"@

$results = @()
$process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $process) {
    Write-Host "ERROR: VRChat process not found. Make sure VRChat is running."
    exit 1
}

Write-Host "Found VRChat process: PID $($process.Id)"

$handle = [MemoryReader]::OpenProcess(
    [MemoryReader]::PROCESS_VM_READ -bor [MemoryReader]::PROCESS_QUERY_INFORMATION,
    $false,
    $process.Id
)

if ($handle -eq [IntPtr]::Zero) {
    Write-Host "ERROR: Could not open process. Try running as Administrator."
    Write-Host "Note: Easy Anti-Cheat may block memory access."
    exit 1
}

Write-Host "Scanning memory regions..."

$address = [IntPtr]::Zero
$mbi = New-Object MemoryReader+MEMORY_BASIC_INFORMATION
$mbiSize = [Runtime.InteropServices.Marshal]::SizeOf($mbi)
$potentialKeys = @()
$regionsScanned = 0

try {
    while ([MemoryReader]::VirtualQueryEx($handle, $address, [ref]$mbi, $mbiSize) -ne 0) {
        $regionSize = $mbi.RegionSize.ToInt64()
        
        # Only scan committed, readable memory
        if ($mbi.State -eq [MemoryReader]::MEM_COMMIT -and
            ($mbi.Protect -eq [MemoryReader]::PAGE_READWRITE -or
             $mbi.Protect -eq [MemoryReader]::PAGE_READONLY -or
             $mbi.Protect -eq [MemoryReader]::PAGE_EXECUTE_READ)) {
            
            # Limit region size to avoid huge allocations
            $readSize = [Math]::Min($regionSize, 10MB)
            $buffer = New-Object byte[] $readSize
            $bytesRead = 0
            
            if ([MemoryReader]::ReadProcessMemory($handle, $mbi.BaseAddress, $buffer, $readSize, [ref]$bytesRead)) {
                $regionsScanned++
                
                # Search for potential AES keys
                # Look for 16-byte sequences that look like keys (high entropy, aligned)
                for ($i = 0; $i -lt $bytesRead - 32; $i += 16) {
                    $chunk16 = $buffer[$i..($i+15)]
                    $chunk32 = $buffer[$i..($i+31)]
                    
                    # Check entropy - keys have high entropy
                    $unique16 = ($chunk16 | Sort-Object -Unique).Count
                    $unique32 = ($chunk32 | Sort-Object -Unique).Count
                    
                    # Keys typically have 14+ unique bytes out of 16
                    if ($unique16 -ge 14) {
                        # Check if followed by known patterns
                        # VRChat might store keys near "1019" marker or encryption context
                        
                        $keyHex = [BitConverter]::ToString($chunk16) -replace '-',''
                        $addressHex = "0x{0:X}" -f ($mbi.BaseAddress.ToInt64() + $i)
                        
                        $potentialKeys += @{
                            Address = $addressHex
                            Key16 = $keyHex
                            Key32 = ([BitConverter]::ToString($chunk32) -replace '-','')
                            Entropy16 = $unique16
                            Entropy32 = $unique32
                        }
                    }
                }
            }
        }
        
        $address = [IntPtr]::Add($mbi.BaseAddress, $regionSize)
        
        # Progress indicator
        if ($regionsScanned % 100 -eq 0) {
            Write-Host "Scanned $regionsScanned regions, found $($potentialKeys.Count) candidates..."
        }
    }
}
finally {
    [MemoryReader]::CloseHandle($handle) | Out-Null
}

Write-Host "Scan complete. Scanned $regionsScanned regions."
Write-Host "Found $($potentialKeys.Count) potential key candidates."

# Output results
$output = @{
    ProcessId = $process.Id
    Timestamp = (Get-Date).ToString("o")
    RegionsScanned = $regionsScanned
    PotentialKeys = @($potentialKeys | Select-Object -First 1000)  # Keep as array even with 0/1 result
}

# Write UTF-8 JSON without BOM (Node JSON.parse fails on BOM in some environments)
$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputFile, $json, $utf8NoBom)
Write-Host "Results saved to: $OutputFile"
`;

// Interface for scan results
interface MemoryScanResult {
  ProcessId: number;
  Timestamp: string;
  RegionsScanned: number;
  PotentialKeys: Array<{
    Address: string;
    Key16: string;
    Key32: string;
    Entropy16: number;
    Entropy32: number;
  }>;
}

/**
 * Check if VRChat is currently running
 */
export async function isVRChatRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }

    exec('tasklist /FI "IMAGENAME eq VRChat.exe" /FO CSV /NH', (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(stdout.toLowerCase().includes('vrchat.exe'));
    });
  });
}

/**
 * Scan VRChat's memory for potential encryption keys
 */
export async function scanForKeys(): Promise<{
  success: boolean;
  error?: string;
  candidates?: MemoryScanResult['PotentialKeys'];
}> {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Memory scanning is only supported on Windows' };
  }

  const isRunning = await isVRChatRunning();
  if (!isRunning) {
    return { success: false, error: 'VRChat is not running. Please start VRChat and log in first.' };
  }

  return new Promise((resolve) => {
    const tempDir = app.getPath('temp');
    const scriptPath = path.join(tempDir, 'vrc_memory_scan.ps1');
    const outputPath = path.join(tempDir, 'vrc_memory_scan_results.json');

    // Write PowerShell script
    fs.writeFileSync(scriptPath, MEMORY_SCAN_PS1);

    // Execute with elevated privileges
    const ps = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-ProcessName', 'VRChat',
      '-OutputFile', outputPath,
    ], {
      windowsHide: true,
    });

    let stderr = '';
    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ps.on('close', (code) => {
      // Cleanup script
      try { fs.unlinkSync(scriptPath); } catch { }

      if (code !== 0) {
        resolve({
          success: false,
          error: `Memory scan failed (code ${code}). ${stderr}\n\nTips:\n- Run as Administrator\n- EAC may be blocking memory access\n- Disable EAC or use a bypass`,
        });
        return;
      }

      // Read results
      try {
        const rawResults = fs.readFileSync(outputPath, 'utf8');
        const normalizedJson = rawResults.replace(/^\uFEFF/, '').trim();
        const results: MemoryScanResult = JSON.parse(normalizedJson);
        fs.unlinkSync(outputPath);

        const candidates = Array.isArray(results.PotentialKeys)
          ? results.PotentialKeys
          : (results.PotentialKeys ? [results.PotentialKeys] : []);

        resolve({
          success: true,
          candidates,
        });
      } catch (err: any) {
        resolve({
          success: false,
          error: `Failed to read scan results: ${err.message}`,
        });
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      ps.kill();
      resolve({
        success: false,
        error: 'Memory scan timed out after 5 minutes',
      });
    }, 5 * 60 * 1000);
  });
}

/**
 * Extract keys by testing candidates against an encrypted file
 */
export async function extractValidKeys(
  encryptedFilePath: string,
  candidates: MemoryScanResult['PotentialKeys']
): Promise<{
  success: boolean;
  validKeys: Array<{ key: Buffer; address: string }>;
  error?: string;
}> {
  // Import the decryption module
  const { parseBundleHeader, parseBlockInfo, tryDecryptBlock, validateDecryptedBlock } = await import('./vrchatDecryption');

  const data = fs.readFileSync(encryptedFilePath);
  const header = parseBundleHeader(data);
  
  if (!header) {
    return { success: false, validKeys: [], error: 'Failed to parse bundle header' };
  }

  const blocks = parseBlockInfo(data, header);
  const firstBlockData = data.slice(header.dataStart, header.dataStart + blocks[0].compressedSize);

  const validKeys: Array<{ key: Buffer; address: string }> = [];

  console.log(`[KeyExtract] Testing ${candidates.length} key candidates...`);

  for (const candidate of candidates) {
    // Try 16-byte key
    const key16 = Buffer.from(candidate.Key16, 'hex');
    let decrypted = tryDecryptBlock(firstBlockData, key16, 'aes-128-ctr');
    
    if (decrypted && validateDecryptedBlock(decrypted)) {
      console.log(`[KeyExtract] Found valid AES-128 key at ${candidate.Address}`);
      validKeys.push({ key: key16, address: candidate.Address });
      continue;
    }

    // Try 32-byte key
    const key32 = Buffer.from(candidate.Key32, 'hex');
    decrypted = tryDecryptBlock(firstBlockData, key32, 'aes-256-ctr');
    
    if (decrypted && validateDecryptedBlock(decrypted)) {
      console.log(`[KeyExtract] Found valid AES-256 key at ${candidate.Address}`);
      validKeys.push({ key: key32, address: candidate.Address });
    }
  }

  return {
    success: validKeys.length > 0,
    validKeys,
    error: validKeys.length === 0 ? 'No valid keys found among candidates' : undefined,
  };
}

/**
 * Full key extraction pipeline
 */
export async function extractKeysFromVRChat(testFilePath?: string): Promise<{
  success: boolean;
  keys?: Array<{ key: string; address: string }>;
  error?: string;
  instructions?: string;
}> {
  // Step 1: Check if VRChat is running
  const isRunning = await isVRChatRunning();
  if (!isRunning) {
    return {
      success: false,
      error: 'VRChat is not running',
      instructions: `To extract decryption keys:
1. Start VRChat
2. Log in to your account (keys are fetched on login)
3. Wait for an avatar to load (this triggers decryption)
4. Run this extraction again

Note: Easy Anti-Cheat may block memory access. If extraction fails, try:
- Running VRCStudio as Administrator
- Disabling EAC (risky, may get you banned)
- Using a network-based key capture method instead`,
    };
  }

  // Step 2: Scan memory
  console.log('[KeyExtract] Scanning VRChat memory...');
  const scanResult = await scanForKeys();
  
  if (!scanResult.success || !scanResult.candidates) {
    return {
      success: false,
      error: scanResult.error || 'Memory scan failed',
      instructions: 'Memory scanning requires Administrator privileges and may be blocked by EAC.',
    };
  }

  console.log(`[KeyExtract] Found ${scanResult.candidates.length} potential keys`);

  // Step 3: If we have a test file, validate keys
  if (testFilePath && fs.existsSync(testFilePath)) {
    const validationResult = await extractValidKeys(testFilePath, scanResult.candidates);
    
    if (validationResult.success && validationResult.validKeys.length > 0) {
      // Store the valid keys
      const { storeKey } = await import('./vrchatDecryption');
      
      for (const { key, address } of validationResult.validKeys) {
        storeKey({
          keyId: '1019', // The key ID we observed
          key,
          extractedAt: Date.now(),
          source: 'memory',
          platform: 'windows',
        });
      }

      return {
        success: true,
        keys: validationResult.validKeys.map(k => ({
          key: k.key.toString('hex'),
          address: k.address,
        })),
      };
    }
  }

  // Return candidates for manual testing
  return {
    success: true,
    keys: scanResult.candidates.slice(0, 100).map(c => ({
      key: c.Key16,
      address: c.Address,
    })),
    instructions: 'Keys extracted but not validated. Use decryptBundle() with an encrypted file to find the correct key.',
  };
}

export default {
  isVRChatRunning,
  scanForKeys,
  extractValidKeys,
  extractKeysFromVRChat,
};
