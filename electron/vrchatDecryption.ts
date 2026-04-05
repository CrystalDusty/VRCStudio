/**
 * VRChat Cache Decryption Module
 * 
 * VRChat encrypts cached avatar/world bundles client-side since April 2025.
 * This module provides tools to decrypt these files when the encryption keys
 * are available.
 * 
 * ENCRYPTION DETAILS (reverse-engineered):
 * - Algorithm: AES-128 or AES-256 in CTR/GCM mode (most likely)
 * - Each block has a 16-byte prefix: [12-byte nonce] + [2-byte counter] + [2-byte key_id]
 * - Key ID "1019" (hex) identifies which decryption key to use
 * - Keys are fetched from VRChat servers on login and stored only in memory
 * - Keys are rotated periodically
 * 
 * DECRYPTION APPROACHES:
 * 1. Memory extraction: Read keys from running VRChat process
 * 2. Network interception: Capture keys during VRChat authentication
 * 3. Key cache: Store successfully extracted keys for later use
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

// Key ID we've observed in encrypted bundles
const KNOWN_KEY_IDS = ['1019'];

// Interface for stored decryption keys
interface DecryptionKey {
  keyId: string;
  key: Buffer;  // 16 or 32 bytes for AES-128/256
  extractedAt: number;
  source: 'memory' | 'network' | 'manual';
  platform: 'windows' | 'android' | 'quest';
}

// Interface for block info
interface BlockInfo {
  uncompressedSize: number;
  compressedSize: number;
  flags: number;
  compressionType: number;
}

// Interface for parsed bundle header
interface BundleHeader {
  signature: string;
  formatVersion: number;
  playerVersion: string;
  engineVersion: string;
  bundleSize: bigint;
  compressedBlockInfoSize: number;
  uncompressedBlockInfoSize: number;
  flags: number;
  dataStart: number;
  blockInfoOffset: number;
}

// Key storage path
const getKeyStorePath = () => path.join(app.getPath('userData'), 'decryption_keys.json');

/**
 * Parse VRChat bundle header
 */
export function parseBundleHeader(data: Buffer): BundleHeader | null {
  if (data.slice(0, 7).toString('utf8') !== 'UnityFS') {
    return null;
  }

  let offset = 8; // Skip "UnityFS\0"
  const formatVersion = data.readUInt32BE(offset);
  offset += 4;

  // Read null-terminated strings
  let playerVersion = '';
  while (offset < data.length && data[offset] !== 0) {
    playerVersion += String.fromCharCode(data[offset]);
    offset++;
  }
  offset++; // skip null

  let engineVersion = '';
  while (offset < data.length && data[offset] !== 0) {
    engineVersion += String.fromCharCode(data[offset]);
    offset++;
  }
  offset++; // skip null

  const bundleSize = data.readBigUInt64BE(offset);
  offset += 8;

  const compressedBlockInfoSize = data.readUInt32BE(offset);
  offset += 4;

  const uncompressedBlockInfoSize = data.readUInt32BE(offset);
  offset += 4;

  const flags = data.readUInt32BE(offset);
  offset += 4;

  const dataStart = offset;
  const blockInfoAtEnd = !!(flags & 0x80);
  const blockInfoOffset = blockInfoAtEnd ? data.length - compressedBlockInfoSize : offset;

  return {
    signature: 'UnityFS',
    formatVersion,
    playerVersion,
    engineVersion,
    bundleSize,
    compressedBlockInfoSize,
    uncompressedBlockInfoSize,
    flags,
    dataStart,
    blockInfoOffset,
  };
}

/**
 * Parse block information from bundle
 */
export function parseBlockInfo(data: Buffer, header: BundleHeader): BlockInfo[] {
  const blockInfo = data.slice(header.blockInfoOffset, header.blockInfoOffset + header.compressedBlockInfoSize);
  
  let offset = 16; // Skip data hash (16 bytes)
  const numBlocks = blockInfo.readUInt32BE(offset);
  offset += 4;

  const blocks: BlockInfo[] = [];
  for (let i = 0; i < numBlocks; i++) {
    const uncompressedSize = blockInfo.readUInt32BE(offset);
    offset += 4;
    const compressedSize = blockInfo.readUInt32BE(offset);
    offset += 4;
    const flags = blockInfo.readUInt16BE(offset);
    offset += 2;

    blocks.push({
      uncompressedSize,
      compressedSize,
      flags,
      compressionType: flags & 0x3F,
    });
  }

  return blocks;
}

/**
 * Extract encryption metadata from a block
 */
export function extractBlockEncryptionInfo(blockData: Buffer): {
  nonce: Buffer;
  counter: number;
  keyId: string;
  ciphertext: Buffer;
} {
  // First 16 bytes are the encryption prefix
  const prefix = blockData.slice(0, 16);
  
  return {
    nonce: prefix.slice(0, 12),
    counter: prefix.readUInt16BE(12),
    keyId: prefix.slice(14, 16).toString('hex'),
    ciphertext: blockData.slice(16),
  };
}

/**
 * Detect if a bundle is encrypted
 */
export function detectEncryption(data: Buffer): {
  encrypted: boolean;
  keyId: string | null;
  reason: string;
} {
  const header = parseBundleHeader(data);
  if (!header) {
    return { encrypted: false, keyId: null, reason: 'Not a UnityFS file' };
  }

  const blocks = parseBlockInfo(data, header);
  if (blocks.length === 0) {
    return { encrypted: false, keyId: null, reason: 'No blocks found' };
  }

  // Get first block
  const firstBlockData = data.slice(header.dataStart, header.dataStart + blocks[0].compressedSize);
  
  // Check if bytes 14-15 match known key IDs
  const possibleKeyId = firstBlockData.slice(14, 16).toString('hex');
  
  if (KNOWN_KEY_IDS.includes(possibleKeyId)) {
    return {
      encrypted: true,
      keyId: possibleKeyId,
      reason: `Detected VRChat encryption with key ID: ${possibleKeyId}`,
    };
  }

  // Check entropy as fallback
  const byteSet = new Set<number>();
  for (let i = 0; i < Math.min(10000, firstBlockData.length); i++) {
    byteSet.add(firstBlockData[i]);
  }

  if (byteSet.size > 250) {
    return {
      encrypted: true,
      keyId: possibleKeyId,
      reason: `High entropy (${byteSet.size}/256 unique bytes) suggests encryption`,
    };
  }

  return { encrypted: false, keyId: null, reason: 'Data appears unencrypted' };
}

/**
 * Attempt to decrypt a single block using a key
 */
export function tryDecryptBlock(
  blockData: Buffer,
  key: Buffer,
  algorithm: 'aes-128-ctr' | 'aes-256-ctr' | 'aes-128-gcm' | 'aes-256-gcm' = 'aes-128-ctr'
): Buffer | null {
  const encInfo = extractBlockEncryptionInfo(blockData);
  
  try {
    // Build the IV/nonce for AES-CTR
    // For CTR mode, we need a 16-byte IV
    const iv = Buffer.alloc(16);
    encInfo.nonce.copy(iv, 0); // Copy 12-byte nonce
    iv.writeUInt32BE(encInfo.counter, 12); // Add counter

    if (algorithm.includes('ctr')) {
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encInfo.ciphertext),
        decipher.final(),
      ]);
      return decrypted;
    } else {
      // GCM mode - would need auth tag
      // VRChat probably uses CTR for speed
      return null;
    }
  } catch (err) {
    return null;
  }
}

/**
 * Validate decrypted data looks like valid LZ4 compressed Unity data
 */
export function validateDecryptedBlock(decrypted: Buffer): boolean {
  if (decrypted.length < 4) return false;

  // LZ4 block format starts with a token byte
  // Check if it looks like valid LZ4
  const token = decrypted[0];
  const literalLength = token >> 4;
  const matchLength = token & 0x0F;

  // Valid LZ4 would have reasonable literal/match lengths
  if (literalLength === 15) {
    // Extended literal length - check if bytes follow
    let extendedLen = 0;
    let offset = 1;
    while (offset < decrypted.length && decrypted[offset] === 255) {
      extendedLen += 255;
      offset++;
    }
    if (offset < decrypted.length) {
      extendedLen += decrypted[offset];
    }
    // Total literal length should be reasonable
    if (extendedLen > decrypted.length) return false;
  }

  // Additional check: try LZ4 decompression header validation
  // The decrypted data should decompress to ~131072 bytes for VRChat blocks

  return true; // Basic validation passed
}

/**
 * Load stored decryption keys
 */
export function loadStoredKeys(): DecryptionKey[] {
  try {
    const keyPath = getKeyStorePath();
    if (fs.existsSync(keyPath)) {
      const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      return data.keys.map((k: any) => ({
        ...k,
        key: Buffer.from(k.key, 'hex'),
      }));
    }
  } catch (err) {
    console.error('[Decrypt] Error loading stored keys:', err);
  }
  return [];
}

/**
 * Store a decryption key
 */
export function storeKey(key: DecryptionKey): void {
  try {
    const keyPath = getKeyStorePath();
    let data: { keys: any[] } = { keys: [] };
    
    if (fs.existsSync(keyPath)) {
      data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    }

    // Update or add key
    const existing = data.keys.findIndex((k: any) => k.keyId === key.keyId);
    const keyData = {
      ...key,
      key: key.key.toString('hex'),
    };

    if (existing >= 0) {
      data.keys[existing] = keyData;
    } else {
      data.keys.push(keyData);
    }

    fs.writeFileSync(keyPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Decrypt] Error storing key:', err);
  }
}

/**
 * Try to decrypt a VRChat bundle using stored keys
 */
export async function decryptBundle(bundlePath: string, outputPath?: string): Promise<{
  success: boolean;
  error?: string;
  outputPath?: string;
  keyUsed?: string;
}> {
  try {
    const data = fs.readFileSync(bundlePath);
    const detection = detectEncryption(data);

    if (!detection.encrypted) {
      return { success: false, error: 'Bundle does not appear to be encrypted' };
    }

    const storedKeys = loadStoredKeys();
    if (storedKeys.length === 0) {
      return {
        success: false,
        error: 'No decryption keys available. Keys must be extracted from a running VRChat client.',
      };
    }

    const header = parseBundleHeader(data);
    if (!header) {
      return { success: false, error: 'Failed to parse bundle header' };
    }

    const blocks = parseBlockInfo(data, header);
    
    // Try each stored key
    for (const storedKey of storedKeys) {
      if (detection.keyId && storedKey.keyId !== detection.keyId) {
        continue; // Skip keys with wrong ID
      }

      // Try to decrypt first block as test
      const firstBlockData = data.slice(header.dataStart, header.dataStart + blocks[0].compressedSize);
      
      // Try different algorithms
      for (const algo of ['aes-128-ctr', 'aes-256-ctr'] as const) {
        const keySize = algo.includes('128') ? 16 : 32;
        if (storedKey.key.length !== keySize) continue;

        const decrypted = tryDecryptBlock(firstBlockData, storedKey.key, algo);
        if (decrypted && validateDecryptedBlock(decrypted)) {
          // Key works! Decrypt entire bundle
          console.log(`[Decrypt] Found working key: ${storedKey.keyId} with ${algo}`);
          
          // Build decrypted bundle
          const decryptedBlocks: Buffer[] = [];
          let currentOffset = header.dataStart;

          for (const block of blocks) {
            const blockData = data.slice(currentOffset, currentOffset + block.compressedSize);
            const decryptedBlock = tryDecryptBlock(blockData, storedKey.key, algo);
            
            if (!decryptedBlock) {
              return { success: false, error: `Failed to decrypt block at offset ${currentOffset}` };
            }
            
            decryptedBlocks.push(decryptedBlock);
            currentOffset += block.compressedSize;
          }

          // Rebuild the bundle with decrypted data
          // Keep header and block info, replace data
          const newData = Buffer.concat([
            data.slice(0, header.dataStart),
            ...decryptedBlocks,
            data.slice(header.blockInfoOffset),
          ]);

          const outPath = outputPath || bundlePath.replace(/\.vrca$/i, '_decrypted.vrca');
          fs.writeFileSync(outPath, newData);

          return {
            success: true,
            outputPath: outPath,
            keyUsed: storedKey.keyId,
          };
        }
      }
    }

    return {
      success: false,
      error: 'None of the stored keys could decrypt this bundle. The key may have been rotated.',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Brute force key search using known patterns
 * This is mainly for testing - real keys come from memory extraction
 */
export function bruteForceKeySearch(bundlePath: string, patterns: Buffer[]): Buffer | null {
  const data = fs.readFileSync(bundlePath);
  const header = parseBundleHeader(data);
  if (!header) return null;

  const blocks = parseBlockInfo(data, header);
  const firstBlockData = data.slice(header.dataStart, header.dataStart + blocks[0].compressedSize);

  for (const pattern of patterns) {
    // Try pattern directly and with common derivations
    const candidates = [
      pattern,
      crypto.createHash('md5').update(pattern).digest(),
      crypto.createHash('sha256').update(pattern).digest().slice(0, 16),
      crypto.createHash('sha256').update(pattern).digest().slice(0, 32),
    ];

    for (const key of candidates) {
      if (key.length !== 16 && key.length !== 32) continue;
      
      const algo = key.length === 16 ? 'aes-128-ctr' : 'aes-256-ctr';
      const decrypted = tryDecryptBlock(firstBlockData, key, algo as any);
      
      if (decrypted && validateDecryptedBlock(decrypted)) {
        console.log(`[Decrypt] Found key via brute force: ${key.toString('hex')}`);
        return key;
      }
    }
  }

  return null;
}

export default {
  parseBundleHeader,
  parseBlockInfo,
  detectEncryption,
  decryptBundle,
  loadStoredKeys,
  storeKey,
  bruteForceKeySearch,
};
