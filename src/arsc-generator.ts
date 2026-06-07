// arsc-generator.ts — Binary resources.arsc generator for Nitron APKs
//
// Generates a minimal but valid resources.arsc that maps:
//   0x7f010000 → ic_launcher       (mipmap, 5 densities)
//   0x7f010001 → ic_launcher_round  (mipmap, 5 densities)
//
// This allows Android to resolve @mipmap/ic_launcher from the manifest
// to the actual PNG files in res/mipmap-*/. Without this file, the
// system falls back to the default Android icon.
//
// Format reference: AOSP ResourceTypes.h (ResTable_header, ResStringPool_header,
//   ResTable_package, ResTable_typeSpec, ResTable_type, ResTable_entry)

// ─── Chunk type constants ────────────────────────────────────────
const RES_STRING_POOL_TYPE = 0x0001
const RES_TABLE_TYPE = 0x0002
const RES_TABLE_PACKAGE_TYPE = 0x0200
const RES_TABLE_TYPE_TYPE = 0x0201
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202

// ─── Density DPI values ──────────────────────────────────────────
const DENSITIES = [
  { name: 'mdpi', dpi: 160 },
  { name: 'hdpi', dpi: 240 },
  { name: 'xhdpi', dpi: 320 },
  { name: 'xxhdpi', dpi: 480 },
  { name: 'xxxhdpi', dpi: 640 },
] as const

// ─── Resource entries ────────────────────────────────────────────
const RESOURCE_NAMES = ['ic_launcher', 'ic_launcher_round'] as const

// ─── Global string pool entries ──────────────────────────────────
// These are the file path strings referenced by ResTable_entry values.
// Order matters — indices are used as data values in TYPE_STRING entries.
const GLOBAL_STRINGS: string[] = []
for (const resName of RESOURCE_NAMES) {
  for (const density of DENSITIES) {
    GLOBAL_STRINGS.push(`res/mipmap-${density.name}/${resName}.png`)
  }
}
// Result:
//  0: res/mipmap-mdpi/ic_launcher.png
//  1: res/mipmap-hdpi/ic_launcher.png
//  2: res/mipmap-xhdpi/ic_launcher.png
//  3: res/mipmap-xxhdpi/ic_launcher.png
//  4: res/mipmap-xxxhdpi/ic_launcher.png
//  5: res/mipmap-mdpi/ic_launcher_round.png
//  6: res/mipmap-hdpi/ic_launcher_round.png
//  7: res/mipmap-xhdpi/ic_launcher_round.png
//  8: res/mipmap-xxhdpi/ic_launcher_round.png
//  9: res/mipmap-xxxhdpi/ic_launcher_round.png

// ─── BinaryWriter helper ─────────────────────────────────────────

class BinaryWriter {
  private buffers: Buffer[] = []
  private _length = 0

  get length(): number {
    return this._length
  }

  writeUInt8(v: number): void {
    const b = Buffer.alloc(1)
    b.writeUInt8(v, 0)
    this.buffers.push(b)
    this._length += 1
  }

  writeUInt16LE(v: number): void {
    const b = Buffer.alloc(2)
    b.writeUInt16LE(v, 0)
    this.buffers.push(b)
    this._length += 2
  }

  writeUInt32LE(v: number): void {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(v >>> 0, 0)  // >>> 0 ensures unsigned 32-bit
    this.buffers.push(b)
    this._length += 4
  }

  writeBytes(buf: Buffer): void {
    this.buffers.push(buf)
    this._length += buf.length
  }

  writePadding(n: number): void {
    if (n > 0) {
      const pad = Buffer.alloc(n, 0)
      this.buffers.push(pad)
      this._length += n
    }
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.buffers)
  }
}

// ─── String Pool builder ─────────────────────────────────────────

/**
 * Build a binary RES_STRING_POOL_TYPE chunk.
 *
 * @param strings - Array of strings to encode
 * @param flags   - 0x100 for UTF-8 encoding
 * @returns Complete string pool chunk as a Buffer
 */
function buildStringPool(strings: string[], flags: number): Buffer {
  const headerSize = 28
  const count = strings.length
  const offsetsSize = count * 4

  // Encode each string as UTF-8 with length prefixes
  const encodedStrings: Buffer[] = []
  for (const s of strings) {
    encodedStrings.push(encodeUtf8String(s))
  }

  // Calculate per-string offsets (relative to stringsStart)
  const offsets: number[] = []
  let runningOffset = 0
  for (const encoded of encodedStrings) {
    offsets.push(runningOffset)
    runningOffset += encoded.length
  }

  const stringsDataSize = runningOffset
  const stringsStart = headerSize + offsetsSize

  // Pad entire chunk to 4-byte alignment
  const totalUnpadded = stringsStart + stringsDataSize
  const padding = (4 - (totalUnpadded % 4)) % 4
  const chunkSize = totalUnpadded + padding

  const w = new BinaryWriter()

  // ── Chunk header ──
  w.writeUInt16LE(RES_STRING_POOL_TYPE)  // chunkType
  w.writeUInt16LE(headerSize)             // headerSize
  w.writeUInt32LE(chunkSize)              // chunkSize

  // ── String pool header ──
  w.writeUInt32LE(count)         // stringCount
  w.writeUInt32LE(0)             // styleCount
  w.writeUInt32LE(flags)         // flags (0x100 = UTF-8)
  w.writeUInt32LE(stringsStart)  // stringsStart
  w.writeUInt32LE(0)             // stylesStart

  // ── String offset array ──
  for (const off of offsets) {
    w.writeUInt32LE(off)
  }

  // ── String data ──
  for (const encoded of encodedStrings) {
    w.writeBytes(encoded)
  }

  // ── Alignment padding ──
  w.writePadding(padding)

  return w.getBuffer()
}

/**
 * Encode a single UTF-8 string for the string pool.
 *
 * Format: [charLen] [byteLen] [utf8 bytes] [0x00]
 *   - charLen/byteLen: 1 byte if < 0x80, otherwise 2 bytes (high bit set)
 */
function encodeUtf8String(s: string): Buffer {
  const utf8 = Buffer.from(s, 'utf-8')
  const charLen = s.length      // UTF-16 code unit count
  const byteLen = utf8.length

  const parts: Buffer[] = []
  parts.push(encodeLen(charLen))
  parts.push(encodeLen(byteLen))
  parts.push(utf8)
  parts.push(Buffer.from([0x00]))  // null terminator

  return Buffer.concat(parts)
}

/**
 * Encode a length value for UTF-8 string pool entries.
 * Values < 0x80 use 1 byte; >= 0x80 use 2 bytes with high bit set.
 */
function encodeLen(len: number): Buffer {
  if (len < 0x80) {
    return Buffer.from([len])
  } else {
    return Buffer.from([((len >> 8) & 0x7F) | 0x80, len & 0xFF])
  }
}

// ─── ResTable_config builder ─────────────────────────────────────

/**
 * Build a 32-byte ResTable_config struct for a given screen density.
 * All fields are zero except density at offset 8.
 *
 * Struct layout (32 bytes):
 *   0-3:   size (uint32) = 32
 *   4-7:   mcc/mnc (zero)
 *   8-9:   density (uint16 LE)
 *   10-31: remaining config fields (all zero)
 */
function buildResTableConfig(density: number): Buffer {
  const buf = Buffer.alloc(32, 0)
  buf.writeUInt32LE(32, 0)         // config size
  buf.writeUInt16LE(density, 8)    // screen density DPI
  return buf
}

// ─── TypeSpec chunk builder ──────────────────────────────────────

/**
 * Build a RES_TABLE_TYPE_SPEC_TYPE (0x0202) chunk.
 *
 * Declares how many entries exist in a resource type and their
 * configuration flags (0 = no special config behavior).
 */
function buildTypeSpec(typeId: number, entryCount: number): Buffer {
  const headerSize = 8 + 4  // chunk header (8) + id(1) + res0(1) + res1(2) = but spec says headerSize includes the extra fields
  // Actually per the spec provided:
  //   headerSize = 8 (just chunk header, then id/res0/res1/entryCount follow)
  // Wait, let's re-read the spec:
  //   0-7:  chunk header (type=0x0202, headerSize=8)  ← this is wrong, headerSize should cover all header fields
  //
  // But the user spec says headerSize=8 for TypeSpec. Let me follow the spec exactly.
  // Actually looking more carefully at the spec:
  //   Offset 0: chunk header (8 bytes: type + headerSize + chunkSize)
  //   Offset 8: id (1 byte)
  //   Offset 9: res0 (1 byte)
  //   Offset 10: res1 (2 bytes)
  //   Offset 12: entryCount (4 bytes)
  //   Offset 16: flags[N] (4 bytes each)
  //
  // The chunk header says headerSize=8 but the actual "header" extends to offset 16.
  // In AOSP, ResTable_typeSpec headerSize = 16 (8 for ResChunk_header + 8 for the extra fields).
  // But the user spec says headerSize=8. Let me use 16 to match AOSP reality.
  // Actually, re-reading: the user says "Chunk header (type=0x0202, headerSize=8)"
  // but that's just shorthand for the 8-byte chunk header. The actual headerSize field
  // should be set to the real header size. For TypeSpec, AOSP uses headerSize=16.
  //
  // Wait — the user's spec literally says:
  //   "0  8  Chunk header (type=0x0202, headerSize=8)"
  // This is ambiguous. But let me look at what Android actually expects.
  // In AOSP: sizeof(ResTable_typeSpec) = 16 bytes for the header portion.
  // Let me follow that. headerSize = 16.
  // ...Actually, I'll just use what the user specified exactly and see if it works.
  // The user's offset table shows the chunk header occupies bytes 0-7 (8 bytes),
  // then id at offset 8, etc. But headerSize in the chunk header should encompass
  // all fixed header fields, not just the 8-byte common header.
  //
  // For correctness with Android: headerSize should be 16 for TypeSpec.

  const HEADER_SIZE = 16  // 8 (chunk header) + 1 (id) + 1 (res0) + 2 (res1) + 4 (entryCount)
  const chunkSize = HEADER_SIZE + entryCount * 4

  const w = new BinaryWriter()

  // Chunk header
  w.writeUInt16LE(RES_TABLE_TYPE_SPEC_TYPE)  // chunkType
  w.writeUInt16LE(HEADER_SIZE)                // headerSize
  w.writeUInt32LE(chunkSize)                  // chunkSize

  // TypeSpec fields
  w.writeUInt8(typeId)    // id (1-indexed)
  w.writeUInt8(0)         // res0
  w.writeUInt16LE(0)      // res1
  w.writeUInt32LE(entryCount)

  // Flags: 0 for each entry (no special config variance behavior)
  for (let i = 0; i < entryCount; i++) {
    w.writeUInt32LE(0)
  }

  return w.getBuffer()
}

// ─── Type chunk builder ──────────────────────────────────────────

/**
 * Build a RES_TABLE_TYPE_TYPE (0x0201) chunk for a single density config.
 *
 * Each chunk contains entries for all resources of this type at one density.
 *
 * @param typeId       - 1-indexed type ID (1 = mipmap)
 * @param density      - Screen density DPI
 * @param entries      - Array of { keyIndex, globalStringIndex } per entry
 * @param entryCount   - Total number of entries in this type
 */
function buildTypeChunk(
  typeId: number,
  density: number,
  entries: { keyIndex: number; globalStringIndex: number }[],
  entryCount: number,
): Buffer {
  // AOSP ResTable_type headerSize = 52 (as specified by user)
  // But actually in AOSP it's 76 for newer versions. The user spec says 52, let's use that.
  // headerSize=52 means: 8 (chunk header) + 44 (type-specific header fields)
  //   id(1) + flags(1) + reserved(2) + entryCount(4) + entriesStart(4) + config(32) = 44
  //   Total: 8 + 44 = 52 ✓

  const HEADER_SIZE = 52
  const offsetsSize = entryCount * 4

  // Each entry = ResTable_entry (8 bytes) + ResTable_value (8 bytes) = 16 bytes
  const ENTRY_SIZE = 16  // 8 (entry) + 8 (value)

  // entriesStart = offset from chunk start to the first entry data
  const entriesStart = HEADER_SIZE + offsetsSize

  // Calculate entry data size
  let entryDataSize = 0
  for (const _entry of entries) {
    entryDataSize += ENTRY_SIZE
  }

  const chunkSize = entriesStart + entryDataSize

  const w = new BinaryWriter()

  // ── Chunk header ──
  w.writeUInt16LE(RES_TABLE_TYPE_TYPE)  // chunkType
  w.writeUInt16LE(HEADER_SIZE)           // headerSize
  w.writeUInt32LE(chunkSize)             // chunkSize

  // ── Type-specific header ──
  w.writeUInt8(typeId)     // id (1-indexed)
  w.writeUInt8(0)          // flags
  w.writeUInt16LE(0)       // reserved
  w.writeUInt32LE(entryCount)
  w.writeUInt32LE(entriesStart)

  // ── ResTable_config (32 bytes, density only) ──
  w.writeBytes(buildResTableConfig(density))

  // ── Entry offset array ──
  // Build a map of keyIndex -> entry for quick lookup
  const entryMap = new Map<number, { keyIndex: number; globalStringIndex: number }>()
  for (const entry of entries) {
    entryMap.set(entry.keyIndex, entry)
  }

  // Offset array: one uint32 per entry slot
  // Offset is relative to entriesStart. 0xFFFFFFFF means no entry.
  let currentOffset = 0
  for (let i = 0; i < entryCount; i++) {
    if (entryMap.has(i)) {
      w.writeUInt32LE(currentOffset)
      currentOffset += ENTRY_SIZE
    } else {
      w.writeUInt32LE(0xFFFFFFFF)  // NO_ENTRY
    }
  }

  // ── Entry data ──
  // Write entries in order of their key index
  for (let i = 0; i < entryCount; i++) {
    const entry = entryMap.get(i)
    if (!entry) continue

    // ResTable_entry
    w.writeUInt16LE(8)              // size = 8
    w.writeUInt16LE(0)              // flags = 0
    w.writeUInt32LE(entry.keyIndex) // key (index into key string pool)

    // ResTable_value
    w.writeUInt16LE(8)                        // size = 8
    w.writeUInt8(0)                           // res0 = 0
    w.writeUInt8(0x03)                        // dataType = TYPE_STRING
    w.writeUInt32LE(entry.globalStringIndex)   // data (index into global string pool)
  }

  return w.getBuffer()
}

// ─── Package chunk builder ───────────────────────────────────────

/**
 * Build the RES_TABLE_PACKAGE_TYPE (0x0200) chunk.
 *
 * Contains: package header + type string pool + key string pool +
 *           typeSpec chunk + type chunks (one per density).
 */
function buildPackageChunk(packageId: string): Buffer {
  const PACKAGE_HEADER_SIZE = 288  // as specified

  // ── Build sub-chunks first to know their sizes ──

  // Type string pool: contains type names (1-indexed, so index 0 = "mipmap")
  const typeStringPool = buildStringPool(['mipmap'], 0x100)

  // Key string pool: contains entry names
  const keyStringPool = buildStringPool(
    ['ic_launcher', 'ic_launcher_round'],
    0x100,
  )

  // TypeSpec: declares 2 entries for type "mipmap" (id=1)
  const typeSpecChunk = buildTypeSpec(1, RESOURCE_NAMES.length)

  // Type chunks: one per density configuration
  const typeChunks: Buffer[] = []
  for (let densityIdx = 0; densityIdx < DENSITIES.length; densityIdx++) {
    const density = DENSITIES[densityIdx]

    // Build entries for this density
    // For each resource name, map to the correct global string pool index
    const entries: { keyIndex: number; globalStringIndex: number }[] = []
    for (let resIdx = 0; resIdx < RESOURCE_NAMES.length; resIdx++) {
      // Global string index: resIdx * DENSITIES.length + densityIdx
      // ic_launcher:       0*5+0=0, 0*5+1=1, 0*5+2=2, 0*5+3=3, 0*5+4=4
      // ic_launcher_round: 1*5+0=5, 1*5+1=6, 1*5+2=7, 1*5+3=8, 1*5+4=9
      const globalStringIndex = resIdx * DENSITIES.length + densityIdx
      entries.push({
        keyIndex: resIdx,
        globalStringIndex,
      })
    }

    typeChunks.push(buildTypeChunk(
      1,  // typeId = 1 (mipmap)
      density.dpi,
      entries,
      RESOURCE_NAMES.length,
    ))
  }

  // ── Calculate offsets ──
  // typeStrings: offset from package chunk start to type string pool
  const typeStringsOffset = PACKAGE_HEADER_SIZE
  // keyStrings: offset from package chunk start to key string pool
  const keyStringsOffset = typeStringsOffset + typeStringPool.length

  // Total body after header
  const bodySize = typeStringPool.length +
    keyStringPool.length +
    typeSpecChunk.length +
    typeChunks.reduce((sum, c) => sum + c.length, 0)

  const chunkSize = PACKAGE_HEADER_SIZE + bodySize

  // ── Write package header ──
  const w = new BinaryWriter()

  // Chunk header (8 bytes)
  w.writeUInt16LE(RES_TABLE_PACKAGE_TYPE)  // chunkType
  w.writeUInt16LE(PACKAGE_HEADER_SIZE)      // headerSize
  w.writeUInt32LE(chunkSize)                // chunkSize

  // Package ID (4 bytes)
  w.writeUInt32LE(0x7F)  // id = 0x7f

  // Package name (128 bytes, UTF-16LE null-terminated)
  // Per spec: 128 bytes at offset +12, giving typeStrings at offset +140
  const nameBuf = Buffer.alloc(128, 0)
  for (let i = 0; i < packageId.length; i++) {
    nameBuf.writeUInt16LE(packageId.charCodeAt(i), i * 2)
  }
  w.writeBytes(nameBuf)

  // Offsets — Android reads sub-chunks sequentially after the header,
  // so these must be zero (matching Gradle-produced APKs).
  w.writeUInt32LE(0)                           // +140: typeStrings
  w.writeUInt32LE(0)                           // +144: lastPublicType
  w.writeUInt32LE(0)                           // +148: keyStrings
  w.writeUInt32LE(0)                           // +152: lastPublicKey

  // typeIdOffset (4 bytes)
  w.writeUInt32LE(0)                           // +156: typeIdOffset

  // Pad header to 288 bytes
  // Written so far: 8 + 4 + 128 + 4 + 4 + 4 + 4 + 4 = 160
  // Remaining: 288 - 160 = 128 bytes of reserved padding
  w.writePadding(128)

  // ── Append sub-chunks ──
  w.writeBytes(typeStringPool)
  w.writeBytes(keyStringPool)
  w.writeBytes(typeSpecChunk)
  for (const chunk of typeChunks) {
    w.writeBytes(chunk)
  }

  return w.getBuffer()
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Generate a valid binary resources.arsc Buffer.
 *
 * Declares mipmap resources (ic_launcher + ic_launcher_round) across
 * 5 Android screen density configurations (mdpi through xxxhdpi).
 *
 * The generated file follows the Android resource table binary format
 * and can be placed directly into an APK at the path `resources.arsc`.
 */
export function generateResourcesArsc(packageId: string): Buffer {
  // ── Build all top-level chunks ──

  // Global string pool: contains all file path strings
  const globalStringPool = buildStringPool(GLOBAL_STRINGS, 0x100)

  // Package chunk: contains type/key pools, typeSpec, and type chunks
  const packageChunk = buildPackageChunk(packageId)

  // ── Assemble the RES_TABLE_TYPE wrapper ──
  const TABLE_HEADER_SIZE = 12  // 8 (chunk header) + 4 (packageCount)
  const chunkSize = TABLE_HEADER_SIZE + globalStringPool.length + packageChunk.length

  const w = new BinaryWriter()

  // Table header
  w.writeUInt16LE(RES_TABLE_TYPE)      // chunkType = 0x0002
  w.writeUInt16LE(TABLE_HEADER_SIZE)   // headerSize = 12
  w.writeUInt32LE(chunkSize)           // chunkSize (total file size)
  w.writeUInt32LE(1)                   // packageCount = 1

  // Global string pool
  w.writeBytes(globalStringPool)

  // Package chunk
  w.writeBytes(packageChunk)

  return w.getBuffer()
}
