// classfile.ts — Read just enough of a compiled .class file to inspect a plugin
//
// Nitron needs to know, without running the code, which compiled classes are plugins
// (they extend NitronPlugin), whether they can be created by the runtime (public,
// concrete, public no-argument constructor) and whether they declare @NitronMethod.
// That only needs the constant pool, the class header and the method table.

export interface ClassInfo {
  /** Internal name, e.g. "com/example/BatteryPlugin" */
  name: string
  /** Internal name of the superclass ("" for java/lang/Object itself) */
  superName: string
  accessFlags: number
  isPublic: boolean
  isAbstract: boolean
  isInterface: boolean
  /** Has a public constructor with no parameters */
  hasPublicNoArgConstructor: boolean
  /** The class file mentions the @NitronMethod annotation type */
  usesNitronMethod: boolean
}

const ACC_PUBLIC = 0x0001
const ACC_INTERFACE = 0x0200
const ACC_ABSTRACT = 0x0400

const NITRON_METHOD_DESC = 'Lcom/nicron/webview/NitronMethod;'

export class ClassFileError extends Error {}

/**
 * Parse the header of a Java class file.
 * @throws ClassFileError when the buffer is not a valid class file
 */
export function parseClassFile(buf: Buffer): ClassInfo {
  let pos = 0
  const need = (n: number) => {
    if (pos + n > buf.length) throw new ClassFileError('Unexpected end of class file')
  }
  const u1 = () => { need(1); return buf[pos++] }
  const u2 = () => { need(2); const v = buf.readUInt16BE(pos); pos += 2; return v }
  const u4 = () => { need(4); const v = buf.readUInt32BE(pos); pos += 4; return v }

  if (buf.length < 10 || u4() !== 0xcafebabe) throw new ClassFileError('Not a Java class file')
  u2() // minor
  u2() // major

  // ── constant pool ────────────────────────────────────────────────────────
  const count = u2()
  const utf8 = new Map<number, string>()
  const classNameIndex = new Map<number, number>()
  for (let i = 1; i < count; i++) {
    const tag = u1()
    switch (tag) {
      case 1: { // Utf8
        const len = u2()
        need(len)
        utf8.set(i, buf.toString('utf8', pos, pos + len))
        pos += len
        break
      }
      case 3: case 4: pos += 4; need(0); break               // Integer, Float
      case 5: case 6: pos += 8; need(0); i++; break          // Long, Double take two slots
      case 7: classNameIndex.set(i, u2()); break             // Class
      case 8: case 16: case 19: case 20: u2(); break         // String, MethodType, Module, Package
      case 9: case 10: case 11: case 12: case 17: case 18: u4(); break // refs, NameAndType, Dynamic, InvokeDynamic
      case 15: u1(); u2(); break                             // MethodHandle
      default: throw new ClassFileError(`Unknown constant pool tag ${tag}`)
    }
  }
  if (pos > buf.length) throw new ClassFileError('Unexpected end of class file')

  const className = (idx: number): string => {
    if (idx === 0) return ''
    const ni = classNameIndex.get(idx)
    return ni === undefined ? '' : utf8.get(ni) ?? ''
  }

  // ── class header ─────────────────────────────────────────────────────────
  const accessFlags = u2()
  const name = className(u2())
  const superName = className(u2())
  const interfaces = u2()
  for (let i = 0; i < interfaces; i++) u2()

  const skipAttributes = () => {
    const n = u2()
    for (let i = 0; i < n; i++) {
      u2() // attribute_name_index
      const len = u4()
      need(len)
      pos += len
    }
  }

  // ── fields ───────────────────────────────────────────────────────────────
  const fields = u2()
  for (let i = 0; i < fields; i++) {
    u2(); u2(); u2()
    skipAttributes()
  }

  // ── methods ──────────────────────────────────────────────────────────────
  let hasPublicNoArgConstructor = false
  const methods = u2()
  for (let i = 0; i < methods; i++) {
    const flags = u2()
    const methodName = utf8.get(u2()) ?? ''
    const descriptor = utf8.get(u2()) ?? ''
    skipAttributes()
    if (methodName === '<init>' && descriptor === '()V' && (flags & ACC_PUBLIC) !== 0) {
      hasPublicNoArgConstructor = true
    }
  }

  let usesNitronMethod = false
  for (const text of utf8.values()) {
    if (text === NITRON_METHOD_DESC) { usesNitronMethod = true; break }
  }

  return {
    name,
    superName,
    accessFlags,
    isPublic: (accessFlags & ACC_PUBLIC) !== 0,
    isAbstract: (accessFlags & ACC_ABSTRACT) !== 0,
    isInterface: (accessFlags & ACC_INTERFACE) !== 0,
    hasPublicNoArgConstructor,
    usesNitronMethod,
  }
}
