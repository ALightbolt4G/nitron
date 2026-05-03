// axml.ts — Binary Android XML (AXML) encoder for AndroidManifest.xml
//
// Purpose-built encoder that generates the binary AXML format Android
// expects inside APK files. NOT a general-purpose encoder — it generates
// the specific manifest structure Nitron needs.
//
// Format reference: AOSP ResourceTypes.h (ResChunk_header, ResStringPool_header)

// ─── Chunk type constants ────────────────────────────────────────
const RES_XML_TYPE = 0x0003
const RES_STRING_POOL_TYPE = 0x0001
const RES_XML_RESOURCE_MAP_TYPE = 0x0180
const RES_XML_START_NAMESPACE_TYPE = 0x0100
const RES_XML_END_NAMESPACE_TYPE = 0x0101
const RES_XML_START_ELEMENT_TYPE = 0x0102
const RES_XML_END_ELEMENT_TYPE = 0x0103

// ─── Attribute value types ───────────────────────────────────────
const TYPE_STRING = 0x03
const TYPE_INT_DEC = 0x10
const TYPE_INT_HEX = 0x11
const TYPE_INT_BOOLEAN = 0x12
const TYPE_REFERENCE = 0x01

// ─── Android namespace ──────────────────────────────────────────
const ANDROID_NS = 'http://schemas.android.com/apk/res/android'

// ─── Android attribute resource IDs ─────────────────────────────
// These MUST be in the same order as the resource-mapped strings
// in the string pool (the first N entries).
const ATTR_RESOURCE_IDS: [string, number][] = [
  ['theme', 0x01010000],
  ['label', 0x01010001],
  ['icon', 0x01010002],
  ['name', 0x01010003],
  ['exported', 0x01010010],
  ['screenOrientation', 0x0101001e],
  ['configChanges', 0x0101001f],
  ['versionCode', 0x0101021b],
  ['versionName', 0x0101021c],
  ['minSdkVersion', 0x0101020c],
  ['targetSdkVersion', 0x01010270],
  ['hardwareAccelerated', 0x010102d3],
  ['usesCleartextTraffic', 0x010104ec],
]

// ─── Public interface ───────────────────────────────────────────

export interface ManifestConfig {
  packageId: string
  versionCode: number
  versionName: string
  appLabel: string
  permissions: string[]
  activityName: string
  screenOrientation: number // 1=portrait, 0=landscape, -1=unspecified
}

/**
 * Encode an AndroidManifest.xml into binary AXML format.
 */
export function encodeManifestToAxml(config: ManifestConfig): Buffer {
  const builder = new AxmlBuilder()
  return builder.build(config)
}

// ─── Builder ────────────────────────────────────────────────────

class AxmlBuilder {
  private strings: string[] = []
  private stringIndexMap = new Map<string, number>()

  /** Add a string to the pool, return its index */
  private addString(s: string): number {
    const existing = this.stringIndexMap.get(s)
    if (existing !== undefined) return existing
    const idx = this.strings.length
    this.strings.push(s)
    this.stringIndexMap.set(s, idx)
    return idx
  }

  /** Get string index (must already exist) */
  private getIdx(s: string): number {
    const idx = this.stringIndexMap.get(s)
    if (idx === undefined) throw new Error(`String not in pool: ${s}`)
    return idx
  }

  build(config: ManifestConfig): Buffer {
    // Step 1: Populate string pool
    // Resource-mapped attribute names MUST come first, in order
    for (const [name] of ATTR_RESOURCE_IDS) {
      this.addString(name)
    }

    // Namespace strings
    this.addString('android')
    this.addString(ANDROID_NS)

    // Element names
    this.addString('manifest')
    this.addString('uses-sdk')
    this.addString('uses-permission')
    this.addString('application')
    this.addString('activity')
    this.addString('intent-filter')
    this.addString('action')
    this.addString('category')

    // Non-namespaced attribute names
    this.addString('package')
    this.addString('platformBuildVersionCode')
    this.addString('platformBuildVersionName')

    // Dynamic values
    this.addString(config.packageId)
    this.addString(config.versionName)
    this.addString(config.appLabel)
    this.addString(config.activityName)
    this.addString('@mipmap/ic_launcher')
    for (const perm of config.permissions) {
      this.addString(`android.permission.${perm}`)
    }
    this.addString('android.intent.action.MAIN')
    this.addString('android.intent.category.LAUNCHER')
    this.addString('') // empty string

    // Fixed values
    this.addString('34') // platformBuildVersionCode
    this.addString('14') // platformBuildVersionName
    this.addString('@ref/0x7f0c0001') // placeholder for theme ref

    // Step 2: Build all chunks
    const stringPoolChunk = this.buildStringPool()
    const resourceMapChunk = this.buildResourceMap()
    const xmlTreeChunks = this.buildXmlTree(config)

    // Step 3: Assemble file
    const bodySize = stringPoolChunk.length + resourceMapChunk.length + xmlTreeChunks.length
    const totalSize = 8 + bodySize

    const header = Buffer.alloc(8)
    header.writeUInt16LE(RES_XML_TYPE, 0)
    header.writeUInt16LE(8, 2)
    header.writeUInt32LE(totalSize, 4)

    return Buffer.concat([header, stringPoolChunk, resourceMapChunk, xmlTreeChunks])
  }

  // ─── String Pool ────────────────────────────────────────────

  private buildStringPool(): Buffer {
    const count = this.strings.length
    const headerSize = 28
    const offsetsSize = count * 4

    // Encode all strings as UTF-8
    const encodedStrings: Buffer[] = []
    for (const s of this.strings) {
      encodedStrings.push(this.encodeUtf8String(s))
    }

    // Calculate offsets
    const offsets: number[] = []
    let strOffset = 0
    for (const encoded of encodedStrings) {
      offsets.push(strOffset)
      strOffset += encoded.length
    }

    const stringsDataSize = strOffset
    const stringsStart = headerSize + offsetsSize

    // Pad to 4-byte alignment
    const totalUnpadded = stringsStart + stringsDataSize
    const padding = (4 - (totalUnpadded % 4)) % 4
    const chunkSize = totalUnpadded + padding

    const buf = Buffer.alloc(chunkSize)
    let pos = 0

    // Header
    buf.writeUInt16LE(RES_STRING_POOL_TYPE, pos); pos += 2
    buf.writeUInt16LE(headerSize, pos); pos += 2
    buf.writeUInt32LE(chunkSize, pos); pos += 4
    buf.writeUInt32LE(count, pos); pos += 4  // stringCount
    buf.writeUInt32LE(0, pos); pos += 4       // styleCount
    buf.writeUInt32LE(0x100, pos); pos += 4   // flags: UTF-8
    buf.writeUInt32LE(stringsStart, pos); pos += 4  // stringsStart
    buf.writeUInt32LE(0, pos); pos += 4       // stylesStart

    // String offsets
    for (const off of offsets) {
      buf.writeUInt32LE(off, pos); pos += 4
    }

    // String data
    for (const encoded of encodedStrings) {
      encoded.copy(buf, pos)
      pos += encoded.length
    }

    return buf
  }

  private encodeUtf8String(s: string): Buffer {
    const utf8 = Buffer.from(s, 'utf-8')
    const charLen = s.length  // UTF-16 code unit count
    const byteLen = utf8.length

    // Encode lengths (1 byte each if < 128, 2 bytes otherwise)
    const parts: Buffer[] = []
    parts.push(this.encodeLen(charLen))
    parts.push(this.encodeLen(byteLen))
    parts.push(utf8)
    parts.push(Buffer.from([0x00])) // null terminator

    return Buffer.concat(parts)
  }

  private encodeLen(len: number): Buffer {
    if (len < 0x80) {
      return Buffer.from([len])
    } else {
      return Buffer.from([((len >> 8) & 0x7F) | 0x80, len & 0xFF])
    }
  }

  // ─── Resource ID Map ────────────────────────────────────────

  private buildResourceMap(): Buffer {
    const count = ATTR_RESOURCE_IDS.length
    const chunkSize = 8 + count * 4

    const buf = Buffer.alloc(chunkSize)
    buf.writeUInt16LE(RES_XML_RESOURCE_MAP_TYPE, 0)
    buf.writeUInt16LE(8, 2)
    buf.writeUInt32LE(chunkSize, 4)

    for (let i = 0; i < count; i++) {
      buf.writeUInt32LE(ATTR_RESOURCE_IDS[i][1], 8 + i * 4)
    }

    return buf
  }

  // ─── XML Tree ───────────────────────────────────────────────

  private buildXmlTree(config: ManifestConfig): Buffer {
    const chunks: Buffer[] = []
    const nsIdx = this.getIdx('android')
    const nsUriIdx = this.getIdx(ANDROID_NS)

    // Start namespace
    chunks.push(this.writeNamespace(RES_XML_START_NAMESPACE_TYPE, nsIdx, nsUriIdx))

    // <manifest> with attributes
    chunks.push(this.writeStartElement(-1, this.getIdx('manifest'), [
      this.attr(-1, this.getIdx('package'), config.packageId, TYPE_STRING),
      this.attr(nsUriIdx, this.getIdx('versionCode'), config.versionCode, TYPE_INT_DEC),
      this.attr(nsUriIdx, this.getIdx('versionName'), config.versionName, TYPE_STRING),
      this.attr(-1, this.getIdx('platformBuildVersionCode'), '34', TYPE_STRING),
      this.attr(-1, this.getIdx('platformBuildVersionName'), '14', TYPE_STRING),
    ]))

    // <uses-sdk>
    chunks.push(this.writeStartElement(-1, this.getIdx('uses-sdk'), [
      this.attr(nsUriIdx, this.getIdx('minSdkVersion'), 21, TYPE_INT_DEC),
      this.attr(nsUriIdx, this.getIdx('targetSdkVersion'), 34, TYPE_INT_DEC),
    ]))
    chunks.push(this.writeEndElement(-1, this.getIdx('uses-sdk')))

    // <uses-permission> elements
    for (const perm of config.permissions) {
      const fullPerm = `android.permission.${perm}`
      chunks.push(this.writeStartElement(-1, this.getIdx('uses-permission'), [
        this.attr(nsUriIdx, this.getIdx('name'), fullPerm, TYPE_STRING),
      ]))
      chunks.push(this.writeEndElement(-1, this.getIdx('uses-permission')))
    }

    // <application>
    chunks.push(this.writeStartElement(-1, this.getIdx('application'), [
      this.attr(nsUriIdx, this.getIdx('label'), config.appLabel, TYPE_STRING),
      this.attr(nsUriIdx, this.getIdx('icon'), '@mipmap/ic_launcher', TYPE_STRING),
      this.attr(nsUriIdx, this.getIdx('hardwareAccelerated'), true, TYPE_INT_BOOLEAN),
      this.attr(nsUriIdx, this.getIdx('usesCleartextTraffic'), true, TYPE_INT_BOOLEAN),
    ]))

    // <activity>
    chunks.push(this.writeStartElement(-1, this.getIdx('activity'), [
      this.attr(nsUriIdx, this.getIdx('name'), config.activityName, TYPE_STRING),
      this.attr(nsUriIdx, this.getIdx('exported'), true, TYPE_INT_BOOLEAN),
      this.attr(nsUriIdx, this.getIdx('screenOrientation'), config.screenOrientation, TYPE_INT_DEC),
      this.attr(nsUriIdx, this.getIdx('configChanges'), 0x04A0, TYPE_INT_HEX),
    ]))

    // <intent-filter>
    chunks.push(this.writeStartElement(-1, this.getIdx('intent-filter'), []))

    // <action android:name="android.intent.action.MAIN"/>
    chunks.push(this.writeStartElement(-1, this.getIdx('action'), [
      this.attr(nsUriIdx, this.getIdx('name'), 'android.intent.action.MAIN', TYPE_STRING),
    ]))
    chunks.push(this.writeEndElement(-1, this.getIdx('action')))

    // <category android:name="android.intent.category.LAUNCHER"/>
    chunks.push(this.writeStartElement(-1, this.getIdx('category'), [
      this.attr(nsUriIdx, this.getIdx('name'), 'android.intent.category.LAUNCHER', TYPE_STRING),
    ]))
    chunks.push(this.writeEndElement(-1, this.getIdx('category')))

    // </intent-filter>
    chunks.push(this.writeEndElement(-1, this.getIdx('intent-filter')))

    // </activity>
    chunks.push(this.writeEndElement(-1, this.getIdx('activity')))

    // </application>
    chunks.push(this.writeEndElement(-1, this.getIdx('application')))

    // </manifest>
    chunks.push(this.writeEndElement(-1, this.getIdx('manifest')))

    // End namespace
    chunks.push(this.writeNamespace(RES_XML_END_NAMESPACE_TYPE, nsIdx, nsUriIdx))

    return Buffer.concat(chunks)
  }

  // ─── Chunk writers ──────────────────────────────────────────

  private writeNamespace(type: number, prefixIdx: number, uriIdx: number): Buffer {
    const buf = Buffer.alloc(24)
    buf.writeUInt16LE(type, 0)
    buf.writeUInt16LE(16, 2) // headerSize
    buf.writeUInt32LE(24, 4) // chunkSize
    buf.writeUInt32LE(0, 8)  // lineNumber
    buf.writeInt32LE(-1, 12) // comment
    buf.writeUInt32LE(prefixIdx, 16)
    buf.writeUInt32LE(uriIdx, 20)
    return buf
  }

  private attr(
    nsIdx: number,
    nameIdx: number,
    value: string | number | boolean,
    dataType: number,
  ): Buffer {
    const buf = Buffer.alloc(20)
    buf.writeInt32LE(nsIdx, 0)      // namespace
    buf.writeUInt32LE(nameIdx, 4)   // name

    if (dataType === TYPE_STRING) {
      const strIdx = this.getIdx(value as string)
      buf.writeInt32LE(strIdx, 8)   // rawValue (string index)
      // Typed value
      buf.writeUInt16LE(8, 12)      // size
      buf.writeUInt8(0, 14)         // res0
      buf.writeUInt8(TYPE_STRING, 15) // dataType
      buf.writeUInt32LE(strIdx, 16) // data (string index)
    } else if (dataType === TYPE_INT_BOOLEAN) {
      buf.writeInt32LE(-1, 8)       // rawValue (none)
      buf.writeUInt16LE(8, 12)
      buf.writeUInt8(0, 14)
      buf.writeUInt8(TYPE_INT_BOOLEAN, 15)
      buf.writeUInt32LE(value ? 0xFFFFFFFF : 0, 16)
    } else if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) {
      buf.writeInt32LE(-1, 8)
      buf.writeUInt16LE(8, 12)
      buf.writeUInt8(0, 14)
      buf.writeUInt8(dataType, 15)
      buf.writeInt32LE(value as number, 16)
    } else if (dataType === TYPE_REFERENCE) {
      buf.writeInt32LE(-1, 8)
      buf.writeUInt16LE(8, 12)
      buf.writeUInt8(0, 14)
      buf.writeUInt8(TYPE_REFERENCE, 15)
      buf.writeUInt32LE(value as number, 16)
    }

    return buf
  }

  private writeStartElement(nsIdx: number, nameIdx: number, attrs: Buffer[]): Buffer {
    const attrCount = attrs.length
    const attrDataSize = attrCount * 20
    const chunkSize = 36 + attrDataSize

    const buf = Buffer.alloc(36)
    buf.writeUInt16LE(RES_XML_START_ELEMENT_TYPE, 0)
    buf.writeUInt16LE(16, 2)         // headerSize
    buf.writeUInt32LE(chunkSize, 4)  // chunkSize
    buf.writeUInt32LE(0, 8)          // lineNumber
    buf.writeInt32LE(-1, 12)         // comment
    buf.writeInt32LE(nsIdx, 16)      // namespace
    buf.writeUInt32LE(nameIdx, 20)   // name
    buf.writeUInt16LE(0x14, 24)      // attributeStart (20 bytes from ext start)
    buf.writeUInt16LE(0x14, 26)      // attributeSize (20 bytes per attr)
    buf.writeUInt16LE(attrCount, 28) // attributeCount
    buf.writeUInt16LE(0, 30)         // idIndex
    buf.writeUInt16LE(0, 32)         // classIndex
    buf.writeUInt16LE(0, 34)         // styleIndex

    return Buffer.concat([buf, ...attrs])
  }

  private writeEndElement(nsIdx: number, nameIdx: number): Buffer {
    const buf = Buffer.alloc(24)
    buf.writeUInt16LE(RES_XML_END_ELEMENT_TYPE, 0)
    buf.writeUInt16LE(16, 2)
    buf.writeUInt32LE(24, 4)
    buf.writeUInt32LE(0, 8)
    buf.writeInt32LE(-1, 12)
    buf.writeInt32LE(nsIdx, 16)
    buf.writeUInt32LE(nameIdx, 20)
    return buf
  }
}
