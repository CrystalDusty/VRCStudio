import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Analyze a cache file and determine its format and how to handle it
 */
export function analyzeFile(filePath: string): {
  format: string;
  isGzipped: boolean;
  isUnityBundle: boolean;
  size: number;
  header: string;
  recommendation: string;
} {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const size = stats.size;

  // Read first 1024 bytes for analysis
  const buffer = fs.readFileSync(filePath, { flag: 'r' });
  const header = buffer.slice(0, 16);
  const headerHex = header.toString('hex');
  const headerAscii = header.toString('utf8', 0, 6);

  console.log('\n========== FILE ANALYSIS ==========');
  console.log(`File: ${filePath}`);
  console.log(`Size: ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Header (hex): ${headerHex}`);
  console.log(`Header (ascii): ${headerAscii}`);

  // Detect format
  let format = 'UNKNOWN';
  let isGzipped = false;
  let isUnityBundle = false;

  // Check for GZIP
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    format = 'GZIP_COMPRESSED';
    isGzipped = true;
    console.log('✓ GZIP compression detected (1f 8b)');

    // Try to decompress and detect inner format
    try {
      const decompressed = zlib.gunzipSync(buffer);
      const decompHeader = decompressed.slice(0, 6).toString('utf8');
      console.log(`  Decompressed size: ${decompressed.length} bytes`);
      console.log(`  Inner header (ascii): ${decompHeader}`);

      if (decompHeader === 'UnityFS') {
        console.log('  ✓ Inner format is UnityFS (Unity Bundle)');
        format = 'GZIP_WRAPPED_UNITYFS';
      }
    } catch (err: any) {
      console.error(`  ✗ Failed to decompress: ${err.message}`);
    }
  }
  // Check for Unity AssetBundle
  else if (headerAscii === 'UnityFS') {
    format = 'UNITYFS_BUNDLE';
    isUnityBundle = true;
    console.log('✓ UnityFS Bundle detected (raw, uncompressed)');
  }
  // Check for ZIP (unitypackage)
  else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    format = 'ZIP_UNITYPACKAGE';
    console.log('✓ ZIP file detected (PK signature)');
  }
  // Check for TAR
  else if (buffer[257] === 0x75 && buffer[258] === 0x73) {
    format = 'TAR_ARCHIVE';
    console.log('✓ TAR archive detected');
  } else {
    console.log('⚠ Unknown format');
  }

  // Recommendation
  let recommendation = '';
  if (isGzipped && isUnityBundle) {
    recommendation = 'DECOMPRESS_AND_USE';
  } else if (isUnityBundle) {
    recommendation = 'USE_DIRECTLY_AS_BUNDLE';
  } else if (isGzipped) {
    recommendation = 'DECOMPRESS_FIRST';
  } else {
    recommendation = 'UNKNOWN_HANDLE_CAREFULLY';
  }

  console.log(`\nRecommendation: ${recommendation}`);
  console.log('===================================\n');

  return {
    format,
    isGzipped,
    isUnityBundle,
    size,
    header: headerHex,
    recommendation,
  };
}

// If run directly from command line
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node fileAnalyzer.ts <file-path>');
    process.exit(1);
  }

  try {
    analyzeFile(filePath);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export default analyzeFile;
