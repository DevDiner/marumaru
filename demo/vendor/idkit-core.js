var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// node_modules/@worldcoin/idkit-server/dist/index.js
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __require2 = /* @__PURE__ */ ((x) => typeof __require !== "undefined" ? __require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof __require !== "undefined" ? __require : a)[b]
}) : x)(function(x) {
  if (typeof __require !== "undefined") return __require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak extends Hash {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
var keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();
var HMAC = class extends Hash {
  constructor(hash, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    ahash(hash);
    const key = toBytes(_key);
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);
function setBigUint64(view, byteOffset, value, isLE22) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE22);
  const _32n22 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n22 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE22 ? 4 : 0;
  const l = isLE22 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE22);
  view.setUint32(byteOffset + l, wl, isLE22);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE22) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE22;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE22 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE22);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE22);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C: C2, D, E, F, G: G2, H } = this;
    return [A, B, C2, D, E, F, G2, H];
  }
  // prettier-ignore
  set(A, B, C2, D, E, F, G2, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C2 | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G2 | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C: C2, D, E, F, G: G2, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C2) | 0;
      H = G2;
      G2 = F;
      F = E;
      E = D + T1 | 0;
      D = C2;
      C2 = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C2 = C2 + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G2 = G2 + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C2, D, E, F, G2, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
var secp256k1_CURVE = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  b: 7n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
};
var { p: P, n: N, Gx, Gy, b: _b } = secp256k1_CURVE;
var L = 32;
var L2 = 64;
var err = (m = "") => {
  throw new Error(m);
};
var isBig = (n) => typeof n === "bigint";
var isStr = (s) => typeof s === "string";
var isBytes2 = (a) => a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
var abytes2 = (a, l) => !isBytes2(a) || typeof l === "number" && l > 0 && a.length !== l ? err("Uint8Array expected") : a;
var u8n = (len) => new Uint8Array(len);
var u8fr = (buf) => Uint8Array.from(buf);
var padh = (n, pad) => n.toString(16).padStart(pad, "0");
var bytesToHex2 = (b) => Array.from(abytes2(b)).map((e) => padh(e, 2)).join("");
var C = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
var _ch = (ch) => {
  if (ch >= C._0 && ch <= C._9)
    return ch - C._0;
  if (ch >= C.A && ch <= C.F)
    return ch - (C.A - 10);
  if (ch >= C.a && ch <= C.f)
    return ch - (C.a - 10);
  return;
};
var hexToBytes2 = (hex) => {
  const e = "hex invalid";
  if (!isStr(hex))
    return err(e);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    return err(e);
  const array = u8n(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = _ch(hex.charCodeAt(hi));
    const n2 = _ch(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0)
      return err(e);
    array[ai] = n1 * 16 + n2;
  }
  return array;
};
var toU8 = (a, len) => abytes2(isStr(a) ? hexToBytes2(a) : u8fr(abytes2(a)), len);
var cr = () => globalThis?.crypto;
var subtle = () => cr()?.subtle ?? err("crypto.subtle must be defined");
var concatBytes = (...arrs) => {
  const r = u8n(arrs.reduce((sum, a) => sum + abytes2(a).length, 0));
  let pad = 0;
  arrs.forEach((a) => {
    r.set(a, pad);
    pad += a.length;
  });
  return r;
};
var randomBytes = (len = L) => {
  const c = cr();
  return c.getRandomValues(u8n(len));
};
var big = BigInt;
var arange = (n, min, max, msg = "bad number: out of range") => isBig(n) && min <= n && n < max ? n : err(msg);
var M = (a, b = P) => {
  const r = a % b;
  return r >= 0n ? r : b + r;
};
var modN = (a) => M(a, N);
var invert = (num, md) => {
  if (num === 0n || md <= 0n)
    err("no inverse n=" + num + " mod=" + md);
  let a = M(num, md), b = md, x = 0n, u = 1n;
  while (a !== 0n) {
    const q = b / a, r = b % a;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  return b === 1n ? M(x, md) : err("no inverse");
};
var callHash = (name) => {
  const fn = etc[name];
  if (typeof fn !== "function")
    err("hashes." + name + " not set");
  return fn;
};
var apoint = (p) => p instanceof Point ? p : err("Point expected");
var koblitz = (x) => M(M(x * x) * x + _b);
var afield0 = (n) => arange(n, 0n, P);
var afield = (n) => arange(n, 1n, P);
var agroup = (n) => arange(n, 1n, N);
var isEven = (y) => (y & 1n) === 0n;
var u8of = (n) => Uint8Array.of(n);
var getPrefix = (y) => u8of(isEven(y) ? 2 : 3);
var lift_x = (x) => {
  const c = koblitz(afield(x));
  let r = 1n;
  for (let num = c, e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n)
      r = r * num % P;
    num = num * num % P;
  }
  return M(r * r) === c ? r : err("sqrt invalid");
};
var _Point = class _Point2 {
  constructor(px, py, pz) {
    __publicField(this, "px");
    __publicField(this, "py");
    __publicField(this, "pz");
    this.px = afield0(px);
    this.py = afield(py);
    this.pz = afield0(pz);
    Object.freeze(this);
  }
  /** Convert Uint8Array or hex string to Point. */
  static fromBytes(bytes) {
    abytes2(bytes);
    let p = void 0;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    const x = sliceBytesNumBE(tail, 0, L);
    const len = bytes.length;
    if (len === L + 1 && [2, 3].includes(head)) {
      let y = lift_x(x);
      const evenY = isEven(y);
      const evenH = isEven(big(head));
      if (evenH !== evenY)
        y = M(-y);
      p = new _Point2(x, y, 1n);
    }
    if (len === L2 + 1 && head === 4)
      p = new _Point2(x, sliceBytesNumBE(tail, L, L2), 1n);
    return p ? p.assertValidity() : err("bad point: not on curve");
  }
  /** Equality check: compare points P&Q. */
  equals(other) {
    const { px: X1, py: Y1, pz: Z1 } = this;
    const { px: X2, py: Y2, pz: Z2 } = apoint(other);
    const X1Z2 = M(X1 * Z2);
    const X2Z1 = M(X2 * Z1);
    const Y1Z2 = M(Y1 * Z2);
    const Y2Z1 = M(Y2 * Z1);
    return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
  }
  is0() {
    return this.equals(I);
  }
  /** Flip point over y coordinate. */
  negate() {
    return new _Point2(this.px, M(-this.py), this.pz);
  }
  /** Point doubling: P+P, complete formula. */
  double() {
    return this.add(this);
  }
  /**
   * Point addition: P+Q, complete, exception-free formula
   * (Renes-Costello-Batina, algo 1 of [2015/1060](https://eprint.iacr.org/2015/1060)).
   * Cost: `12M + 0S + 3*a + 3*b3 + 23add`.
   */
  // prettier-ignore
  add(other) {
    const { px: X1, py: Y1, pz: Z1 } = this;
    const { px: X2, py: Y2, pz: Z2 } = apoint(other);
    const a = 0n;
    const b = _b;
    let X3 = 0n, Y3 = 0n, Z3 = 0n;
    const b3 = M(b * 3n);
    let t0 = M(X1 * X2), t1 = M(Y1 * Y2), t2 = M(Z1 * Z2), t3 = M(X1 + Y1);
    let t4 = M(X2 + Y2);
    t3 = M(t3 * t4);
    t4 = M(t0 + t1);
    t3 = M(t3 - t4);
    t4 = M(X1 + Z1);
    let t5 = M(X2 + Z2);
    t4 = M(t4 * t5);
    t5 = M(t0 + t2);
    t4 = M(t4 - t5);
    t5 = M(Y1 + Z1);
    X3 = M(Y2 + Z2);
    t5 = M(t5 * X3);
    X3 = M(t1 + t2);
    t5 = M(t5 - X3);
    Z3 = M(a * t4);
    X3 = M(b3 * t2);
    Z3 = M(X3 + Z3);
    X3 = M(t1 - Z3);
    Z3 = M(t1 + Z3);
    Y3 = M(X3 * Z3);
    t1 = M(t0 + t0);
    t1 = M(t1 + t0);
    t2 = M(a * t2);
    t4 = M(b3 * t4);
    t1 = M(t1 + t2);
    t2 = M(t0 - t2);
    t2 = M(a * t2);
    t4 = M(t4 + t2);
    t0 = M(t1 * t4);
    Y3 = M(Y3 + t0);
    t0 = M(t5 * t4);
    X3 = M(t3 * X3);
    X3 = M(X3 - t0);
    t0 = M(t3 * t1);
    Z3 = M(t5 * Z3);
    Z3 = M(Z3 + t0);
    return new _Point2(X3, Y3, Z3);
  }
  /**
   * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
   * Uses {@link wNAF} for base point.
   * Uses fake point to mitigate side-channel leakage.
   * @param n scalar by which point is multiplied
   * @param safe safe mode guards against timing attacks; unsafe mode is faster
   */
  multiply(n, safe = true) {
    if (!safe && n === 0n)
      return I;
    agroup(n);
    if (n === 1n)
      return this;
    if (this.equals(G))
      return wNAF(n).p;
    let p = I;
    let f = G;
    for (let d = this; n > 0n; d = d.double(), n >>= 1n) {
      if (n & 1n)
        p = p.add(d);
      else if (safe)
        f = f.add(d);
    }
    return p;
  }
  /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
  toAffine() {
    const { px: x, py: y, pz: z } = this;
    if (this.equals(I))
      return { x: 0n, y: 0n };
    if (z === 1n)
      return { x, y };
    const iz = invert(z, P);
    if (M(z * iz) !== 1n)
      err("inverse invalid");
    return { x: M(x * iz), y: M(y * iz) };
  }
  /** Checks if the point is valid and on-curve. */
  assertValidity() {
    const { x, y } = this.toAffine();
    afield(x);
    afield(y);
    return M(y * y) === koblitz(x) ? this : err("bad point: not on curve");
  }
  /** Converts point to 33/65-byte Uint8Array. */
  toBytes(isCompressed = true) {
    const { x, y } = this.assertValidity().toAffine();
    const x32b = numTo32b(x);
    if (isCompressed)
      return concatBytes(getPrefix(y), x32b);
    return concatBytes(u8of(4), x32b, numTo32b(y));
  }
  /** Create 3d xyz point from 2d xy. (0, 0) => (0, 1, 0), not (0, 0, 1) */
  static fromAffine(ap) {
    const { x, y } = ap;
    return x === 0n && y === 0n ? I : new _Point2(x, y, 1n);
  }
  toHex(isCompressed) {
    return bytesToHex2(this.toBytes(isCompressed));
  }
  static fromPrivateKey(k) {
    return G.multiply(toPrivScalar(k));
  }
  static fromHex(hex) {
    return _Point2.fromBytes(toU8(hex));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  toRawBytes(isCompressed) {
    return this.toBytes(isCompressed);
  }
};
__publicField(_Point, "BASE");
__publicField(_Point, "ZERO");
var Point = _Point;
var G = new Point(Gx, Gy, 1n);
var I = new Point(0n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
var doubleScalarMulUns = (R, u1, u2) => {
  return G.multiply(u1, false).add(R.multiply(u2, false)).assertValidity();
};
var bytesToNumBE = (b) => big("0x" + (bytesToHex2(b) || "0"));
var sliceBytesNumBE = (b, from, to) => bytesToNumBE(b.subarray(from, to));
var B256 = 2n ** 256n;
var numTo32b = (num) => hexToBytes2(padh(arange(num, 0n, B256), L2));
var toPrivScalar = (pr) => {
  const num = isBig(pr) ? pr : bytesToNumBE(toU8(pr, L));
  return arange(num, 1n, N, "private key invalid 3");
};
var highS = (n) => n > N >> 1n;
var Signature = class _Signature {
  constructor(r, s, recovery) {
    __publicField(this, "r");
    __publicField(this, "s");
    __publicField(this, "recovery");
    this.r = agroup(r);
    this.s = agroup(s);
    if (recovery != null)
      this.recovery = recovery;
    Object.freeze(this);
  }
  /** Create signature from 64b compact (r || s) representation. */
  static fromBytes(b) {
    abytes2(b, L2);
    const r = sliceBytesNumBE(b, 0, L);
    const s = sliceBytesNumBE(b, L, L2);
    return new _Signature(r, s);
  }
  toBytes() {
    const { r, s } = this;
    return concatBytes(numTo32b(r), numTo32b(s));
  }
  /** Copy signature, with newly added recovery bit. */
  addRecoveryBit(bit) {
    return new _Signature(this.r, this.s, bit);
  }
  hasHighS() {
    return highS(this.s);
  }
  toCompactRawBytes() {
    return this.toBytes();
  }
  toCompactHex() {
    return bytesToHex2(this.toBytes());
  }
  recoverPublicKey(msg) {
    return recoverPublicKey(this, msg);
  }
  static fromCompact(hex) {
    return _Signature.fromBytes(toU8(hex, L2));
  }
  assertValidity() {
    return this;
  }
  normalizeS() {
    const { r, s, recovery } = this;
    return highS(s) ? new _Signature(r, modN(-s), recovery) : this;
  }
};
var bits2int = (bytes) => {
  const delta = bytes.length * 8 - 256;
  if (delta > 1024)
    err("msg invalid");
  const num = bytesToNumBE(bytes);
  return delta > 0 ? num >> big(delta) : num;
};
var bits2int_modN = (bytes) => modN(bits2int(abytes2(bytes)));
var signOpts = { lowS: true };
var prepSig = (msgh, priv, opts = signOpts) => {
  if (["der", "recovered", "canonical"].some((k) => k in opts))
    err("option not supported");
  let { lowS, extraEntropy } = opts;
  if (lowS == null)
    lowS = true;
  const i2o = numTo32b;
  const h1i = bits2int_modN(toU8(msgh));
  const h1o = i2o(h1i);
  const d = toPrivScalar(priv);
  const seed = [i2o(d), h1o];
  if (extraEntropy)
    seed.push(extraEntropy === true ? randomBytes(L) : toU8(extraEntropy));
  const m = h1i;
  const k2sig = (kBytes) => {
    const k = bits2int(kBytes);
    if (!(1n <= k && k < N))
      return;
    const q = G.multiply(k).toAffine();
    const r = modN(q.x);
    if (r === 0n)
      return;
    const ik = invert(k, N);
    const s = modN(ik * modN(m + modN(d * r)));
    if (s === 0n)
      return;
    let normS = s;
    let recovery = (q.x === r ? 0 : 2) | Number(q.y & 1n);
    if (lowS && highS(s)) {
      normS = modN(-s);
      recovery ^= 1;
    }
    return new Signature(r, normS, recovery);
  };
  return { seed: concatBytes(...seed), k2sig };
};
var hmacDrbg = (asynchronous) => {
  let v = u8n(L);
  let k = u8n(L);
  let i = 0;
  const NULL = u8n(0);
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const max = 1e3;
  const _e = "drbg: tried 1000 values";
  {
    const h = (...b) => callHash("hmacSha256Sync")(k, v, ...b);
    const reseed = (seed = NULL) => {
      k = h(u8of(0), seed);
      v = h();
      if (seed.length === 0)
        return;
      k = h(u8of(1), seed);
      v = h();
    };
    const gen22 = () => {
      if (i++ >= max)
        err(_e);
      v = h();
      return v;
    };
    return (seed, pred) => {
      reset();
      reseed(seed);
      let res = void 0;
      while (!(res = pred(gen22())))
        reseed();
      reset();
      return res;
    };
  }
};
var sign = (msgh, priv, opts = signOpts) => {
  const { seed, k2sig } = prepSig(msgh, priv, opts);
  const sig = hmacDrbg()(seed, k2sig);
  return sig;
};
var recoverPublicKey = (sig, msgh) => {
  const { r, s, recovery } = sig;
  if (![0, 1, 2, 3].includes(recovery))
    err("recovery id invalid");
  const h = bits2int_modN(toU8(msgh, L));
  const radj = recovery === 2 || recovery === 3 ? r + N : r;
  afield(radj);
  const head = getPrefix(big(recovery));
  const Rb = concatBytes(head, numTo32b(radj));
  const R = Point.fromBytes(Rb);
  const ir = invert(radj, N);
  const u1 = modN(-h * ir);
  const u2 = modN(s * ir);
  return doubleScalarMulUns(R, u1, u2);
};
var hashToPrivateKey = (hash) => {
  hash = toU8(hash);
  if (hash.length < L + 8 || hash.length > 1024)
    err("expected 40-1024b");
  const num = M(bytesToNumBE(hash), N - 1n);
  return numTo32b(num + 1n);
};
var _sha = "SHA-256";
var etc = {
  hexToBytes: hexToBytes2,
  bytesToHex: bytesToHex2,
  concatBytes,
  bytesToNumberBE: bytesToNumBE,
  numberToBytesBE: numTo32b,
  mod: M,
  invert,
  // math utilities
  hmacSha256Async: async (key, ...msgs) => {
    const s = subtle();
    const name = "HMAC";
    const k = await s.importKey("raw", key, { name, hash: { name: _sha } }, false, ["sign"]);
    return u8n(await s.sign(name, k, concatBytes(...msgs)));
  },
  hmacSha256Sync: void 0,
  // For TypeScript. Actual logic is below
  hashToPrivateKey,
  randomBytes
};
var W = 8;
var scalarBits = 256;
var pwindows = Math.ceil(scalarBits / W) + 1;
var pwindowSize = 2 ** (W - 1);
var precompute = () => {
  const points = [];
  let p = G;
  let b = p;
  for (let w = 0; w < pwindows; w++) {
    b = p;
    points.push(b);
    for (let i = 1; i < pwindowSize; i++) {
      b = b.add(p);
      points.push(b);
    }
    p = b.double();
  }
  return points;
};
var Gpows = void 0;
var ctneg = (cnd, p) => {
  const n = p.negate();
  return cnd ? n : p;
};
var wNAF = (n) => {
  const comp = Gpows || (Gpows = precompute());
  let p = I;
  let f = G;
  const pow_2_w = 2 ** W;
  const maxNum = pow_2_w;
  const mask = big(pow_2_w - 1);
  const shiftBy = big(W);
  for (let w = 0; w < pwindows; w++) {
    let wbits = Number(n & mask);
    n >>= shiftBy;
    if (wbits > pwindowSize) {
      wbits -= maxNum;
      n += 1n;
    }
    const off = w * pwindowSize;
    const offF = off;
    const offP = off + Math.abs(wbits) - 1;
    const isEven2 = w % 2 !== 0;
    const isNeg = wbits < 0;
    if (wbits === 0) {
      f = f.add(ctneg(isEven2, comp[offF]));
    } else {
      p = p.add(ctneg(isNeg, comp[offP]));
    }
  }
  return { p, f };
};
var isServerEnvironment = () => {
  if (typeof process !== "undefined" && process.versions?.node) {
    return true;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return true;
  }
  if (typeof globalThis.Bun !== "undefined") {
    return true;
  }
  return false;
};
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = __require2("crypto").webcrypto;
}
etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, etc.concatBytes(...msgs));
var DEFAULT_TTL_SEC = 300;
var RP_SIGNATURE_MSG_VERSION = 1;
var ETHEREUM_MESSAGE_PREFIX = "Ethereum Signed Message:\n";
var textEncoder = new TextEncoder();
function hashToField(input) {
  const hash = BigInt("0x" + bytesToHex(keccak_256(input))) >> 8n;
  return hexToBytes(hash.toString(16).padStart(64, "0"));
}
function computeRpSignatureMessage(nonceBytes, createdAt, expiresAt, action) {
  const actionBytes = action === void 0 ? void 0 : hashToField(textEncoder.encode(action));
  const message = new Uint8Array(49 + (actionBytes?.length ?? 0));
  message[0] = RP_SIGNATURE_MSG_VERSION;
  message.set(nonceBytes, 1);
  const view = new DataView(message.buffer);
  view.setBigUint64(33, BigInt(createdAt), false);
  view.setBigUint64(41, BigInt(expiresAt), false);
  if (actionBytes) {
    message.set(actionBytes, 49);
  }
  return message;
}
function hashEthereumMessage(message) {
  const prefix = textEncoder.encode(
    `${ETHEREUM_MESSAGE_PREFIX}${message.length}`
  );
  return keccak_256(etc.concatBytes(prefix, message));
}
function signRequest(params) {
  if (!isServerEnvironment()) {
    throw new Error(
      "signRequest can only be used in Node.js environments. This function requires access to signing keys and should never be called from browser/client-side code."
    );
  }
  if (typeof params !== "object" || params === null) {
    throw new Error(
      "signRequest expects an options object: signRequest({ signingKeyHex, action?, ttl? })"
    );
  }
  const { action, signingKeyHex, ttl = DEFAULT_TTL_SEC } = params;
  if (typeof signingKeyHex !== "string") {
    throw new Error(
      "Invalid signing key: expected signingKeyHex to be a string"
    );
  }
  if (action !== void 0 && typeof action !== "string") {
    throw new Error("Invalid action: expected action to be a string");
  }
  const keyHex = signingKeyHex.startsWith("0x") ? signingKeyHex.slice(2) : signingKeyHex;
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error("Invalid signing key: contains non-hex characters");
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `Invalid signing key: expected 32 bytes (64 hex chars), got ${keyHex.length / 2} bytes`
    );
  }
  const privKey = etc.hexToBytes(keyHex);
  const randomBytes2 = crypto.getRandomValues(new Uint8Array(32));
  const nonceBytes = hashToField(randomBytes2);
  const createdAt = Math.floor(Date.now() / 1e3);
  const expiresAt = createdAt + ttl;
  const message = computeRpSignatureMessage(
    nonceBytes,
    createdAt,
    expiresAt,
    action
  );
  const msgHash = hashEthereumMessage(message);
  const recSig = sign(msgHash, privKey);
  const compact = recSig.toCompactRawBytes();
  const sig65 = new Uint8Array(65);
  sig65.set(compact, 0);
  sig65[64] = recSig.recovery + 27;
  return {
    sig: "0x" + bytesToHex(sig65),
    nonce: "0x" + bytesToHex(nonceBytes),
    createdAt,
    expiresAt
  };
}
var SESSION_ID_PATTERN = /^session_[0-9a-fA-F]{128}$/;
function getSessionCommitment(sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(
      "Invalid session ID: expected format session_<128 hex characters>"
    );
  }
  const commitmentHex = sessionId.slice(8, 72);
  return BigInt(`0x${commitmentHex}`);
}

// node_modules/@noble/hashes/esm/_u64.js
var U32_MASK642 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n2 = /* @__PURE__ */ BigInt(32);
function fromBig2(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK642), l: Number(n >> _32n2 & U32_MASK642) };
  return { h: Number(n >> _32n2 & U32_MASK642) | 0, l: Number(n & U32_MASK642) | 0 };
}
function split2(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig2(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH2 = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL2 = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH2 = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL2 = (h, l, s) => h << s - 32 | l >>> 64 - s;

// node_modules/@noble/hashes/esm/utils.js
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber2(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes3(b, ...lengths) {
  if (!isBytes3(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists2(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput2(out, instance) {
  abytes3(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u322(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean2(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var isLE2 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap2(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap322(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap2(arr[i]);
  }
  return arr;
}
var swap32IfBE2 = isLE2 ? (u) => u : byteSwap322;
var hasHexBuiltin2 = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes2 = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex3(bytes) {
  abytes3(bytes);
  if (hasHexBuiltin2)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes2[bytes[i]];
  }
  return hex;
}
var asciis2 = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase162(ch) {
  if (ch >= asciis2._0 && ch <= asciis2._9)
    return ch - asciis2._0;
  if (ch >= asciis2.A && ch <= asciis2.F)
    return ch - (asciis2.A - 10);
  if (ch >= asciis2.a && ch <= asciis2.f)
    return ch - (asciis2.a - 10);
  return;
}
function hexToBytes3(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin2)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase162(hex.charCodeAt(hi));
    const n2 = asciiToBase162(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes2(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes2(data) {
  if (typeof data === "string")
    data = utf8ToBytes2(data);
  abytes3(data);
  return data;
}
var Hash2 = class {
};
function createHasher2(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes2(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/sha3.js
var _0n2 = BigInt(0);
var _1n2 = BigInt(1);
var _2n2 = BigInt(2);
var _7n2 = BigInt(7);
var _256n2 = BigInt(256);
var _0x71n2 = BigInt(113);
var SHA3_PI2 = [];
var SHA3_ROTL2 = [];
var _SHA3_IOTA2 = [];
for (let round = 0, R = _1n2, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI2.push(2 * (5 * y + x));
  SHA3_ROTL2.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n2;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n2 ^ (R >> _7n2) * _0x71n2) % _256n2;
    if (R & _2n2)
      t ^= _1n2 << (_1n2 << /* @__PURE__ */ BigInt(j)) - _1n2;
  }
  _SHA3_IOTA2.push(t);
}
var IOTAS2 = split2(_SHA3_IOTA2, true);
var SHA3_IOTA_H2 = IOTAS2[0];
var SHA3_IOTA_L2 = IOTAS2[1];
var rotlH2 = (h, l, s) => s > 32 ? rotlBH2(h, l, s) : rotlSH2(h, l, s);
var rotlL2 = (h, l, s) => s > 32 ? rotlBL2(h, l, s) : rotlSL2(h, l, s);
function keccakP2(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH2(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL2(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL2[t];
      const Th = rotlH2(curH, curL, shift);
      const Tl = rotlL2(curH, curL, shift);
      const PI = SHA3_PI2[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H2[round];
    s[1] ^= SHA3_IOTA_L2[round];
  }
  clean2(B);
}
var Keccak2 = class _Keccak2 extends Hash2 {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber2(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u322(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE2(this.state32);
    keccakP2(this.state32, this.rounds);
    swap32IfBE2(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists2(this);
    data = toBytes2(data);
    abytes3(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists2(this, false);
    abytes3(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber2(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput2(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean2(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak2(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen2 = (suffix, blockLen, outputLen) => createHasher2(() => new Keccak2(blockLen, suffix, outputLen));
var keccak_2562 = /* @__PURE__ */ (() => gen2(1, 136, 256 / 8))();

// node_modules/@worldcoin/idkit-core/dist/index.js
var __defProp2 = Object.defineProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp2(target, name, { get: all2[name], enumerable: true });
};
var package_default = {
  version: "4.3.0"
};
var IDKitErrorCodes = /* @__PURE__ */ ((IDKitErrorCodes2) => {
  IDKitErrorCodes2["UserRejected"] = "user_rejected";
  IDKitErrorCodes2["VerificationRejected"] = "verification_rejected";
  IDKitErrorCodes2["CredentialUnavailable"] = "credential_unavailable";
  IDKitErrorCodes2["FeatureUnavailable"] = "feature_unavailable";
  IDKitErrorCodes2["WorldId4NotAvailable"] = "world_id_4_not_available";
  IDKitErrorCodes2["WorldId3NotAvailable"] = "world_id_3_not_available";
  IDKitErrorCodes2["MalformedRequest"] = "malformed_request";
  IDKitErrorCodes2["InvalidNetwork"] = "invalid_network";
  IDKitErrorCodes2["InclusionProofPending"] = "inclusion_proof_pending";
  IDKitErrorCodes2["InclusionProofFailed"] = "inclusion_proof_failed";
  IDKitErrorCodes2["UnexpectedResponse"] = "unexpected_response";
  IDKitErrorCodes2["ConnectionFailed"] = "connection_failed";
  IDKitErrorCodes2["MaxVerificationsReached"] = "max_verifications_reached";
  IDKitErrorCodes2["FailedByHostApp"] = "failed_by_host_app";
  IDKitErrorCodes2["UserPresenceFailed"] = "user_presence_failed";
  IDKitErrorCodes2["InvalidRpSignature"] = "invalid_rp_signature";
  IDKitErrorCodes2["NullifierReplayed"] = "nullifier_replayed";
  IDKitErrorCodes2["DuplicateNonce"] = "duplicate_nonce";
  IDKitErrorCodes2["UnknownRp"] = "unknown_rp";
  IDKitErrorCodes2["InactiveRp"] = "inactive_rp";
  IDKitErrorCodes2["TimestampTooOld"] = "timestamp_too_old";
  IDKitErrorCodes2["TimestampTooFarInFuture"] = "timestamp_too_far_in_future";
  IDKitErrorCodes2["InvalidTimestamp"] = "invalid_timestamp";
  IDKitErrorCodes2["RpSignatureExpired"] = "rp_signature_expired";
  IDKitErrorCodes2["IdentityAttributesNotMatched"] = "identity_attributes_not_matched";
  IDKitErrorCodes2["GenericError"] = "generic_error";
  IDKitErrorCodes2["InvalidRpIdFormat"] = "invalid_rp_id_format";
  IDKitErrorCodes2["Timeout"] = "timeout";
  IDKitErrorCodes2["Cancelled"] = "cancelled";
  return IDKitErrorCodes2;
})(IDKitErrorCodes || {});
var idkit_wasm_exports = {};
__export(idkit_wasm_exports, {
  BridgeEncryption: () => BridgeEncryption,
  CredentialRequestWasm: () => CredentialRequestWasm,
  IDKitBuilder: () => IDKitBuilder,
  IDKitInviteCodeRequest: () => IDKitInviteCodeRequest,
  IDKitProof: () => IDKitProof,
  IDKitRequest: () => IDKitRequest,
  RpContextWasm: () => RpContextWasm,
  RpSignature: () => RpSignature,
  base64Decode: () => base64Decode,
  base64Encode: () => base64Encode,
  computeRpSignatureMessage: () => computeRpSignatureMessage2,
  createSession: () => createSession,
  default: () => __wbg_init,
  hashSignal: () => hashSignal,
  initSync: () => initSync,
  init_wasm: () => init_wasm,
  proofResponseToIDKitResult: () => proofResponseToIDKitResult,
  proveSession: () => proveSession,
  request: () => request,
  signRequest: () => signRequest2
});
var BridgeEncryption = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    BridgeEncryptionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_bridgeencryption_free(ptr, 0);
  }
  /**
   * Decrypts a base64-encoded ciphertext using AES-256-GCM
   *
   * # Errors
   *
   * Returns an error if decryption fails or the output is not valid UTF-8
   * @param {string} ciphertext_base64
   * @returns {string}
   */
  decrypt(ciphertext_base64) {
    let deferred3_0;
    let deferred3_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(ciphertext_base64, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.bridgeencryption_decrypt(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr2 = r0;
      var len2 = r1;
      if (r3) {
        ptr2 = 0;
        len2 = 0;
        throw takeObject(r2);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
  }
  /**
   * Encrypts a plaintext string using AES-256-GCM and returns base64
   *
   * # Errors
   *
   * Returns an error if encryption fails
   * @param {string} plaintext
   * @returns {string}
   */
  encrypt(plaintext) {
    let deferred3_0;
    let deferred3_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(plaintext, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.bridgeencryption_encrypt(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr2 = r0;
      var len2 = r1;
      if (r3) {
        ptr2 = 0;
        len2 = 0;
        throw takeObject(r2);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
  }
  /**
   * Returns the key as a base64-encoded string
   * @returns {string}
   */
  keyBase64() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.bridgeencryption_keyBase64(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Creates a new `BridgeEncryption` instance with randomly generated key and nonce
   *
   * # Errors
   *
   * Returns an error if key generation fails
   */
  constructor() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.bridgeencryption_new(retptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      BridgeEncryptionFinalization.register(this, this.__wbg_ptr, this);
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns the nonce as a base64-encoded string
   * @returns {string}
   */
  nonceBase64() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.bridgeencryption_nonceBase64(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
};
if (Symbol.dispose) BridgeEncryption.prototype[Symbol.dispose] = BridgeEncryption.prototype.free;
var CredentialRequestWasm = class _CredentialRequestWasm {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_CredentialRequestWasm.prototype);
    obj.__wbg_ptr = ptr;
    CredentialRequestWasmFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    CredentialRequestWasmFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_credentialrequestwasm_free(ptr, 0);
  }
  /**
   * Gets the credential type
   * @returns {any}
   */
  credentialType() {
    const ret = wasm.credentialrequestwasm_credentialType(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * Gets the signal bytes used by protocol proof requests
   * @returns {Uint8Array | undefined}
   */
  getSignalBytes() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.credentialrequestwasm_getSignalBytes(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      let v1;
      if (r0 !== 0) {
        v1 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Creates a new request item
   *
   * # Arguments
   * * `credential_type` - The type of credential to request (e.g., `proof_of_human`, `selfie`)
   * * `signal` - Optional signal string
   *
   * # Errors
   *
   * Returns an error if the credential type is invalid
   * @param {any} credential_type
   * @param {string | null} [signal]
   */
  constructor(credential_type, signal) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = isLikeNone(signal) ? 0 : passStringToWasm0(signal, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len0 = WASM_VECTOR_LEN;
      wasm.credentialrequestwasm_new(retptr, addHeapObject(credential_type), ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      CredentialRequestWasmFinalization.register(this, this.__wbg_ptr, this);
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Converts the request item to JSON
   *
   * # Errors
   *
   * Returns an error if serialization fails
   * @returns {any}
   */
  toJSON() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.credentialrequestwasm_toJSON(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Creates a new request item with raw bytes for the signal
   *
   * # Errors
   *
   * Returns an error if the credential type is invalid
   * @param {any} credential_type
   * @param {Uint8Array} signal_bytes
   * @returns {CredentialRequestWasm}
   */
  static withBytes(credential_type, signal_bytes) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passArray8ToWasm0(signal_bytes, wasm.__wbindgen_export);
      const len0 = WASM_VECTOR_LEN;
      wasm.credentialrequestwasm_withBytes(retptr, addHeapObject(credential_type), ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return _CredentialRequestWasm.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Creates a new request item with expiration minimum timestamp
   *
   * # Errors
   *
   * Returns an error if the credential type is invalid
   * @param {any} credential_type
   * @param {string | null | undefined} signal
   * @param {bigint} expires_at_min
   * @returns {CredentialRequestWasm}
   */
  static withExpiresAtMin(credential_type, signal, expires_at_min) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = isLikeNone(signal) ? 0 : passStringToWasm0(signal, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len0 = WASM_VECTOR_LEN;
      wasm.credentialrequestwasm_withExpiresAtMin(retptr, addHeapObject(credential_type), ptr0, len0, expires_at_min);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return _CredentialRequestWasm.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Creates a new request item with genesis minimum timestamp
   *
   * # Errors
   *
   * Returns an error if the credential type is invalid
   * @param {any} credential_type
   * @param {string | null | undefined} signal
   * @param {bigint} genesis_min
   * @returns {CredentialRequestWasm}
   */
  static withGenesisMin(credential_type, signal, genesis_min) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = isLikeNone(signal) ? 0 : passStringToWasm0(signal, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len0 = WASM_VECTOR_LEN;
      wasm.credentialrequestwasm_withGenesisMin(retptr, addHeapObject(credential_type), ptr0, len0, genesis_min);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return _CredentialRequestWasm.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
if (Symbol.dispose) CredentialRequestWasm.prototype[Symbol.dispose] = CredentialRequestWasm.prototype.free;
var IDKitBuilder = class _IDKitBuilder {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_IDKitBuilder.prototype);
    obj.__wbg_ptr = ptr;
    IDKitBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IDKitBuilderFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_idkitbuilder_free(ptr, 0);
  }
  /**
   * Creates a `BridgeConnection` with the given constraints
   * @param {any} constraints_json
   * @returns {Promise<any>}
   */
  constraints(constraints_json) {
    const ptr = this.__destroy_into_raw();
    const ret = wasm.idkitbuilder_constraints(ptr, addHeapObject(constraints_json));
    return takeObject(ret);
  }
  /**
   * Creates an invite-code mode `BridgeConnection` with the given constraints (WDP-73).
   * @param {any} constraints_json
   * @returns {Promise<any>}
   */
  constraintsWithInviteCode(constraints_json) {
    const ptr = this.__destroy_into_raw();
    const ret = wasm.idkitbuilder_constraintsWithInviteCode(ptr, addHeapObject(constraints_json));
    return takeObject(ret);
  }
  /**
   * Creates a new builder for creating a new session
   * @param {string} app_id
   * @param {string} package_name
   * @param {string} package_version
   * @param {RpContextWasm} rp_context
   * @param {string | null | undefined} action_description
   * @param {string | null | undefined} bridge_url
   * @param {boolean} require_user_presence
   * @param {string | null} [override_connect_base_url]
   * @param {string | null} [return_to]
   * @param {string | null} [environment]
   * @returns {IDKitBuilder}
   */
  static forCreateSession(app_id, package_name, package_version, rp_context, action_description, bridge_url, require_user_presence, override_connect_base_url, return_to, environment) {
    const ptr0 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    _assertClass(rp_context, RpContextWasm);
    var ptr3 = rp_context.__destroy_into_raw();
    var ptr4 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len4 = WASM_VECTOR_LEN;
    var ptr5 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len5 = WASM_VECTOR_LEN;
    var ptr6 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len6 = WASM_VECTOR_LEN;
    var ptr7 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len7 = WASM_VECTOR_LEN;
    var ptr8 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len8 = WASM_VECTOR_LEN;
    const ret = wasm.idkitbuilder_forCreateSession(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, ptr4, len4, ptr5, len5, require_user_presence, ptr6, len6, ptr7, len7, ptr8, len8);
    return _IDKitBuilder.__wrap(ret);
  }
  /**
   * Creates a new builder for proving an existing session
   * @param {string} session_id
   * @param {string} app_id
   * @param {string} package_name
   * @param {string} package_version
   * @param {RpContextWasm} rp_context
   * @param {string | null | undefined} action_description
   * @param {string | null | undefined} bridge_url
   * @param {boolean} require_user_presence
   * @param {string | null} [override_connect_base_url]
   * @param {string | null} [return_to]
   * @param {string | null} [environment]
   * @returns {IDKitBuilder}
   */
  static forProveSession(session_id, app_id, package_name, package_version, rp_context, action_description, bridge_url, require_user_presence, override_connect_base_url, return_to, environment) {
    const ptr0 = passStringToWasm0(session_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len3 = WASM_VECTOR_LEN;
    _assertClass(rp_context, RpContextWasm);
    var ptr4 = rp_context.__destroy_into_raw();
    var ptr5 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len5 = WASM_VECTOR_LEN;
    var ptr6 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len6 = WASM_VECTOR_LEN;
    var ptr7 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len7 = WASM_VECTOR_LEN;
    var ptr8 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len8 = WASM_VECTOR_LEN;
    var ptr9 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len9 = WASM_VECTOR_LEN;
    const ret = wasm.idkitbuilder_forProveSession(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, ptr5, len5, ptr6, len6, require_user_presence, ptr7, len7, ptr8, len8, ptr9, len9);
    return _IDKitBuilder.__wrap(ret);
  }
  /**
   * Builds the native payload for constraints (synchronous, no bridge connection).
   *
   * Used by the native transport to get the same payload format as the bridge
   * without creating a network connection.
   *
   * # Errors
   *
   * Returns an error if constraints are invalid or payload construction fails.
   * @param {any} constraints_json
   * @returns {any}
   */
  nativePayload(constraints_json) {
    try {
      const ptr = this.__destroy_into_raw();
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitbuilder_nativePayload(retptr, ptr, addHeapObject(constraints_json));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Builds the native payload from a preset (synchronous, no bridge connection).
   *
   * Used by the native transport to get the same payload format as the bridge
   * without creating a network connection.
   *
   * # Errors
   *
   * Returns an error if the preset is invalid or payload construction fails.
   * @param {any} preset_json
   * @returns {any}
   */
  nativePayloadFromPreset(preset_json) {
    try {
      const ptr = this.__destroy_into_raw();
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitbuilder_nativePayloadFromPreset(retptr, ptr, addHeapObject(preset_json));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Builds a v1 (legacy) native payload from a preset (synchronous, no bridge connection).
   *
   * Used by the native transport when the World App only supports verify v1.
   * Only legacy presets produce valid v1 payloads (constraint-based requests
   * default to `Device` level and may not carry the correct action).
   *
   * # Errors
   *
   * Returns an error if the preset is invalid or v1 payload construction fails.
   * @param {any} preset_json
   * @returns {any}
   */
  nativePayloadV1FromPreset(preset_json) {
    try {
      const ptr = this.__destroy_into_raw();
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitbuilder_nativePayloadV1FromPreset(retptr, ptr, addHeapObject(preset_json));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Creates a new builder for uniqueness requests
   * @param {string} app_id
   * @param {string} package_name
   * @param {string} package_version
   * @param {string} action
   * @param {RpContextWasm} rp_context
   * @param {string | null | undefined} action_description
   * @param {string | null | undefined} bridge_url
   * @param {boolean} allow_legacy_proofs
   * @param {boolean} require_user_presence
   * @param {string | null} [override_connect_base_url]
   * @param {string | null} [return_to]
   * @param {string | null} [environment]
   */
  constructor(app_id, package_name, package_version, action, rp_context, action_description, bridge_url, allow_legacy_proofs, require_user_presence, override_connect_base_url, return_to, environment) {
    const ptr0 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len3 = WASM_VECTOR_LEN;
    _assertClass(rp_context, RpContextWasm);
    var ptr4 = rp_context.__destroy_into_raw();
    var ptr5 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len5 = WASM_VECTOR_LEN;
    var ptr6 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len6 = WASM_VECTOR_LEN;
    var ptr7 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len7 = WASM_VECTOR_LEN;
    var ptr8 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len8 = WASM_VECTOR_LEN;
    var ptr9 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len9 = WASM_VECTOR_LEN;
    const ret = wasm.idkitbuilder_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, ptr5, len5, ptr6, len6, allow_legacy_proofs, require_user_presence, ptr7, len7, ptr8, len8, ptr9, len9);
    this.__wbg_ptr = ret >>> 0;
    IDKitBuilderFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Creates a `BridgeConnection` from a preset (works for all request types)
   * @param {any} preset_json
   * @returns {Promise<any>}
   */
  preset(preset_json) {
    const ptr = this.__destroy_into_raw();
    const ret = wasm.idkitbuilder_preset(ptr, addHeapObject(preset_json));
    return takeObject(ret);
  }
  /**
   * Creates an invite-code mode `BridgeConnection` from a preset (WDP-73).
   * @param {any} preset_json
   * @returns {Promise<any>}
   */
  presetWithInviteCode(preset_json) {
    const ptr = this.__destroy_into_raw();
    const ret = wasm.idkitbuilder_presetWithInviteCode(ptr, addHeapObject(preset_json));
    return takeObject(ret);
  }
};
if (Symbol.dispose) IDKitBuilder.prototype[Symbol.dispose] = IDKitBuilder.prototype.free;
var IDKitInviteCodeRequest = class _IDKitInviteCodeRequest {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_IDKitInviteCodeRequest.prototype);
    obj.__wbg_ptr = ptr;
    IDKitInviteCodeRequestFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IDKitInviteCodeRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_idkitinvitecoderequest_free(ptr, 0);
  }
  /**
   * Returns the connector URL the RP should display to the user.
   *
   * This is the same URL shape the URL/QR mode produces, with two extra
   * query params (`c=<canonical_code>`, `a=<app_id>`) the `world.org/verify`
   * landing page uses to render an invite-code-aware view.
   *
   * # Errors
   *
   * Returns an error if the request state is invalid.
   * @returns {string}
   */
  connectUrl() {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitinvitecoderequest_connectUrl(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
  /**
   * Unix-seconds expiry of the unredeemed code.
   *
   * # Errors
   *
   * Returns an error if the request state is invalid.
   * @returns {number}
   */
  expiresAt() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitinvitecoderequest_expiresAt(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getFloat64(retptr + 8 * 0, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      if (r3) {
        throw takeObject(r2);
      }
      return r0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns the latest debug report snapshot for this invite-code request.
   *
   * # Errors
   *
   * Returns an error if report serialization fails.
   * @returns {any}
   */
  getDebugReport() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitinvitecoderequest_getDebugReport(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Polls the bridge for the current status (non-blocking).
   *
   * Mirrors `IDKitRequest::pollForStatus` exactly — same status shape,
   * same close semantics. Adopters use the same poll loop they wrote for
   * URL mode.
   *
   * # Errors
   *
   * Returns an error if the request has been closed or the poll fails.
   * @returns {Promise<any>}
   */
  pollForStatus() {
    const ret = wasm.idkitinvitecoderequest_pollForStatus(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * Returns the request ID for this request.
   *
   * # Errors
   *
   * Returns an error if the request state is invalid.
   * @returns {string}
   */
  requestId() {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitinvitecoderequest_requestId(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
};
if (Symbol.dispose) IDKitInviteCodeRequest.prototype[Symbol.dispose] = IDKitInviteCodeRequest.prototype.free;
var IDKitProof = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IDKitProofFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_idkitproof_free(ptr, 0);
  }
  /**
   * Creates a new legacy proof (protocol v1 / World ID v3)
   *
   * # Errors
   *
   * Returns an error if the verification level cannot be deserialized
   * @param {string} proof
   * @param {string} merkle_root
   * @param {string} nullifier_hash
   * @param {any} verification_level
   */
  constructor(proof, merkle_root, nullifier_hash, verification_level) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(proof, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(merkle_root, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(nullifier_hash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len2 = WASM_VECTOR_LEN;
      wasm.idkitproof_new(retptr, ptr0, len0, ptr1, len1, ptr2, len2, addHeapObject(verification_level));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      IDKitProofFinalization.register(this, this.__wbg_ptr, this);
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Converts the proof to JSON
   *
   * # Errors
   *
   * Returns an error if serialization fails
   * @returns {any}
   */
  toJSON() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitproof_toJSON(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
if (Symbol.dispose) IDKitProof.prototype[Symbol.dispose] = IDKitProof.prototype.free;
var IDKitRequest = class _IDKitRequest {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_IDKitRequest.prototype);
    obj.__wbg_ptr = ptr;
    IDKitRequestFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IDKitRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_idkitrequest_free(ptr, 0);
  }
  /**
   * Returns the connect URL for World App
   *
   * This URL should be displayed as a QR code for users to scan with World App.
   *
   * # Errors
   *
   * Returns an error if the request state is invalid.
   * @returns {string}
   */
  connectUrl() {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitrequest_connectUrl(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
  /**
   * Returns the latest debug report snapshot for this request.
   *
   * # Errors
   *
   * Returns an error if report serialization fails.
   * @returns {any}
   */
  getDebugReport() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitrequest_getDebugReport(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Polls the bridge for the current status (non-blocking)
   *
   * Returns a status object with type:
   * - `"waiting_for_connection"` - Waiting for World App to retrieve the request
   * - `"awaiting_confirmation"` - World App has retrieved the request, waiting for user
   * - `"confirmed"` - User confirmed and provided a proof
   * - `"failed"` - Request has failed
   *
   * # Errors
   *
   * Returns an error if the request fails or the response is invalid
   * @returns {Promise<any>}
   */
  pollForStatus() {
    const ret = wasm.idkitrequest_pollForStatus(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * Returns the request ID for this request
   *
   * # Errors
   *
   * Returns an error if the request state is invalid.
   * @returns {string}
   */
  requestId() {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.idkitrequest_requestId(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
};
if (Symbol.dispose) IDKitRequest.prototype[Symbol.dispose] = IDKitRequest.prototype.free;
var RpContextWasm = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RpContextWasmFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_rpcontextwasm_free(ptr, 0);
  }
  /**
   * Creates a new RP context
   *
   * # Arguments
   * * `rp_id` - The registered RP ID (e.g., `"rp_123456789abcdef0"`)
   * * `nonce` - Unique nonce for this proof request
   * * `created_at` - Unix timestamp (seconds since epoch) when created
   * * `expires_at` - Unix timestamp (seconds since epoch) when expires
   * * `signature` - The RP's ECDSA signature of the `nonce` and `created_at` timestamp
   *
   * # Errors
   *
   * Returns an error if `rp_id` is not a valid RP ID (must start with `rp_`)
   * @param {string} rp_id
   * @param {string} nonce
   * @param {bigint} created_at
   * @param {bigint} expires_at
   * @param {string} signature
   */
  constructor(rp_id, nonce, created_at, expires_at, signature) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(rp_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(nonce, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(signature, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len2 = WASM_VECTOR_LEN;
      wasm.rpcontextwasm_new(retptr, ptr0, len0, ptr1, len1, created_at, expires_at, ptr2, len2);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      RpContextWasmFinalization.register(this, this.__wbg_ptr, this);
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
if (Symbol.dispose) RpContextWasm.prototype[Symbol.dispose] = RpContextWasm.prototype.free;
var RpSignature = class _RpSignature {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_RpSignature.prototype);
    obj.__wbg_ptr = ptr;
    RpSignatureFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RpSignatureFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_rpsignature_free(ptr, 0);
  }
  /**
   * Gets the creation timestamp
   * @returns {bigint}
   */
  get createdAt() {
    const ret = wasm.rpsignature_createdAt(this.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Gets the expiration timestamp
   * @returns {bigint}
   */
  get expiresAt() {
    const ret = wasm.rpsignature_expiresAt(this.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Gets the nonce as hex string (0x-prefixed field element)
   * @returns {string}
   */
  get nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.rpsignature_nonce(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Gets the signature as hex string (0x-prefixed, 65 bytes)
   * @returns {string}
   */
  get sig() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.rpsignature_sig(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Converts to JSON
   *
   * # Errors
   *
   * Returns an error if setting object properties fails
   * @returns {any}
   */
  toJSON() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.rpsignature_toJSON(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
if (Symbol.dispose) RpSignature.prototype[Symbol.dispose] = RpSignature.prototype.free;
function base64Decode(data) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(data, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    wasm.base64Decode(retptr, ptr0, len0);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    if (r3) {
      throw takeObject(r2);
    }
    var v2 = getArrayU8FromWasm0(r0, r1).slice();
    wasm.__wbindgen_export4(r0, r1 * 1, 1);
    return v2;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function base64Encode(data) {
  let deferred2_0;
  let deferred2_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    wasm.base64Encode(retptr, ptr0, len0);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    deferred2_0 = r0;
    deferred2_1 = r1;
    return getStringFromWasm0(r0, r1);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
  }
}
function computeRpSignatureMessage2(nonce, created_at, expires_at, action) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(nonce, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(action) ? 0 : passStringToWasm0(action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    wasm.computeRpSignatureMessage(retptr, ptr0, len0, created_at, expires_at, ptr1, len1);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    if (r3) {
      throw takeObject(r2);
    }
    var v3 = getArrayU8FromWasm0(r0, r1).slice();
    wasm.__wbindgen_export4(r0, r1 * 1, 1);
    return v3;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function createSession(app_id, package_name, package_version, rp_context, action_description, bridge_url, require_user_presence, override_connect_base_url, return_to, environment) {
  const ptr0 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len1 = WASM_VECTOR_LEN;
  const ptr2 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len2 = WASM_VECTOR_LEN;
  _assertClass(rp_context, RpContextWasm);
  var ptr3 = rp_context.__destroy_into_raw();
  var ptr4 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len4 = WASM_VECTOR_LEN;
  var ptr5 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len5 = WASM_VECTOR_LEN;
  var ptr6 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len6 = WASM_VECTOR_LEN;
  var ptr7 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len7 = WASM_VECTOR_LEN;
  var ptr8 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len8 = WASM_VECTOR_LEN;
  const ret = wasm.createSession(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, ptr4, len4, ptr5, len5, require_user_presence, ptr6, len6, ptr7, len7, ptr8, len8);
  return IDKitBuilder.__wrap(ret);
}
function hashSignal(signal) {
  let deferred2_0;
  let deferred2_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.hashSignal(retptr, addHeapObject(signal));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr1 = r0;
    var len1 = r1;
    if (r3) {
      ptr1 = 0;
      len1 = 0;
      throw takeObject(r2);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
  }
}
function init_wasm() {
  wasm.init_wasm();
}
function proofResponseToIDKitResult(proof_response, options) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.proofResponseToIDKitResult(retptr, addHeapObject(proof_response), addHeapObject(options));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    if (r2) {
      throw takeObject(r1);
    }
    return takeObject(r0);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function proveSession(session_id, app_id, package_name, package_version, rp_context, action_description, bridge_url, require_user_presence, override_connect_base_url, return_to, environment) {
  const ptr0 = passStringToWasm0(session_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len1 = WASM_VECTOR_LEN;
  const ptr2 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len2 = WASM_VECTOR_LEN;
  const ptr3 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len3 = WASM_VECTOR_LEN;
  _assertClass(rp_context, RpContextWasm);
  var ptr4 = rp_context.__destroy_into_raw();
  var ptr5 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len5 = WASM_VECTOR_LEN;
  var ptr6 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len6 = WASM_VECTOR_LEN;
  var ptr7 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len7 = WASM_VECTOR_LEN;
  var ptr8 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len8 = WASM_VECTOR_LEN;
  var ptr9 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len9 = WASM_VECTOR_LEN;
  const ret = wasm.proveSession(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, ptr5, len5, ptr6, len6, require_user_presence, ptr7, len7, ptr8, len8, ptr9, len9);
  return IDKitBuilder.__wrap(ret);
}
function request(app_id, package_name, package_version, action, rp_context, action_description, bridge_url, allow_legacy_proofs, require_user_presence, override_connect_base_url, return_to, environment) {
  const ptr0 = passStringToWasm0(app_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(package_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len1 = WASM_VECTOR_LEN;
  const ptr2 = passStringToWasm0(package_version, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len2 = WASM_VECTOR_LEN;
  const ptr3 = passStringToWasm0(action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len3 = WASM_VECTOR_LEN;
  _assertClass(rp_context, RpContextWasm);
  var ptr4 = rp_context.__destroy_into_raw();
  var ptr5 = isLikeNone(action_description) ? 0 : passStringToWasm0(action_description, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len5 = WASM_VECTOR_LEN;
  var ptr6 = isLikeNone(bridge_url) ? 0 : passStringToWasm0(bridge_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len6 = WASM_VECTOR_LEN;
  var ptr7 = isLikeNone(override_connect_base_url) ? 0 : passStringToWasm0(override_connect_base_url, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len7 = WASM_VECTOR_LEN;
  var ptr8 = isLikeNone(return_to) ? 0 : passStringToWasm0(return_to, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len8 = WASM_VECTOR_LEN;
  var ptr9 = isLikeNone(environment) ? 0 : passStringToWasm0(environment, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  var len9 = WASM_VECTOR_LEN;
  const ret = wasm.request(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, ptr5, len5, ptr6, len6, allow_legacy_proofs, require_user_presence, ptr7, len7, ptr8, len8, ptr9, len9);
  return IDKitBuilder.__wrap(ret);
}
function signRequest2(signing_key_hex, ttl_seconds, action) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(signing_key_hex, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(action) ? 0 : passStringToWasm0(action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    wasm.signRequest(retptr, ptr0, len0, !isLikeNone(ttl_seconds), isLikeNone(ttl_seconds) ? BigInt(0) : ttl_seconds, ptr1, len1);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    if (r2) {
      throw takeObject(r1);
    }
    return RpSignature.__wrap(r0);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
      const ret = Error(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    },
    __wbg_String_8564e559799eccda: function(arg0, arg1) {
      const ret = String(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg___wbindgen_bigint_get_as_i64_447a76b5c6ef7bda: function(arg0, arg1) {
      const v = getObject(arg1);
      const ret = typeof v === "bigint" ? v : void 0;
      getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    },
    __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function(arg0) {
      const v = getObject(arg0);
      const ret = typeof v === "boolean" ? v : void 0;
      return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
    },
    __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(arg0, arg1) {
      const ret = debugString(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg___wbindgen_in_41dbb8413020e076: function(arg0, arg1) {
      const ret = getObject(arg0) in getObject(arg1);
      return ret;
    },
    __wbg___wbindgen_is_bigint_e2141d4f045b7eda: function(arg0) {
      const ret = typeof getObject(arg0) === "bigint";
      return ret;
    },
    __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
      const ret = typeof getObject(arg0) === "function";
      return ret;
    },
    __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
      const val = getObject(arg0);
      const ret = typeof val === "object" && val !== null;
      return ret;
    },
    __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
      const ret = typeof getObject(arg0) === "string";
      return ret;
    },
    __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
      const ret = getObject(arg0) === void 0;
      return ret;
    },
    __wbg___wbindgen_jsval_eq_ee31bfad3e536463: function(arg0, arg1) {
      const ret = getObject(arg0) === getObject(arg1);
      return ret;
    },
    __wbg___wbindgen_jsval_loose_eq_5bcc3bed3c69e72b: function(arg0, arg1) {
      const ret = getObject(arg0) == getObject(arg1);
      return ret;
    },
    __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(arg0, arg1) {
      const obj = getObject(arg1);
      const ret = typeof obj === "number" ? obj : void 0;
      getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    },
    __wbg___wbindgen_string_get_395e606bd0ee4427: function(arg0, arg1) {
      const obj = getObject(arg1);
      const ret = typeof obj === "string" ? obj : void 0;
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
    __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(arg0) {
      getObject(arg0)._wbg_cb_unref();
    },
    __wbg_abort_5ef96933660780b7: function(arg0) {
      getObject(arg0).abort();
    },
    __wbg_abort_6479c2d794ebf2ee: function(arg0, arg1) {
      getObject(arg0).abort(getObject(arg1));
    },
    __wbg_append_608dfb635ee8998f: function() {
      return handleError(function(arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
      }, arguments);
    },
    __wbg_arrayBuffer_eb8e9ca620af2a19: function() {
      return handleError(function(arg0) {
        const ret = getObject(arg0).arrayBuffer();
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_call_2d781c1f4d5c0ef8: function() {
      return handleError(function(arg0, arg1, arg2) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_call_e133b57c9155d22c: function() {
      return handleError(function(arg0, arg1) {
        const ret = getObject(arg0).call(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_clearTimeout_6b8d9a38b9263d65: function(arg0) {
      const ret = clearTimeout(takeObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_crypto_38df2bab126b63dc: function(arg0) {
      const ret = getObject(arg0).crypto;
      return addHeapObject(ret);
    },
    __wbg_done_08ce71ee07e3bd17: function(arg0) {
      const ret = getObject(arg0).done;
      return ret;
    },
    __wbg_entries_e8a20ff8c9757101: function(arg0) {
      const ret = Object.entries(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
      }
    },
    __wbg_fetch_5550a88cf343aaa9: function(arg0, arg1) {
      const ret = getObject(arg0).fetch(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_fetch_9dad4fe911207b37: function(arg0) {
      const ret = fetch(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_getRandomValues_a1cf2e70b003a59d: function() {
      return handleError(function(arg0, arg1) {
        globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
      }, arguments);
    },
    __wbg_getRandomValues_c44a50d8cfdaebeb: function() {
      return handleError(function(arg0, arg1) {
        getObject(arg0).getRandomValues(getObject(arg1));
      }, arguments);
    },
    __wbg_get_326e41e095fb2575: function() {
      return handleError(function(arg0, arg1) {
        const ret = Reflect.get(getObject(arg0), getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_get_a8ee5c45dabc1b3b: function(arg0, arg1) {
      const ret = getObject(arg0)[arg1 >>> 0];
      return addHeapObject(ret);
    },
    __wbg_get_unchecked_329cfe50afab7352: function(arg0, arg1) {
      const ret = getObject(arg0)[arg1 >>> 0];
      return addHeapObject(ret);
    },
    __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
      const ret = getObject(arg0)[getObject(arg1)];
      return addHeapObject(ret);
    },
    __wbg_has_926ef2ff40b308cf: function() {
      return handleError(function(arg0, arg1) {
        const ret = Reflect.has(getObject(arg0), getObject(arg1));
        return ret;
      }, arguments);
    },
    __wbg_headers_eb2234545f9ff993: function(arg0) {
      const ret = getObject(arg0).headers;
      return addHeapObject(ret);
    },
    __wbg_idkitinvitecoderequest_new: function(arg0) {
      const ret = IDKitInviteCodeRequest.__wrap(arg0);
      return addHeapObject(ret);
    },
    __wbg_idkitrequest_new: function(arg0) {
      const ret = IDKitRequest.__wrap(arg0);
      return addHeapObject(ret);
    },
    __wbg_instanceof_ArrayBuffer_101e2bf31071a9f6: function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof ArrayBuffer;
      } catch (_) {
        result = false;
      }
      const ret = result;
      return ret;
    },
    __wbg_instanceof_Map_f194b366846aca0c: function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Map;
      } catch (_) {
        result = false;
      }
      const ret = result;
      return ret;
    },
    __wbg_instanceof_Response_9b4d9fd451e051b1: function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Response;
      } catch (_) {
        result = false;
      }
      const ret = result;
      return ret;
    },
    __wbg_instanceof_Uint8Array_740438561a5b956d: function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Uint8Array;
      } catch (_) {
        result = false;
      }
      const ret = result;
      return ret;
    },
    __wbg_isArray_33b91feb269ff46e: function(arg0) {
      const ret = Array.isArray(getObject(arg0));
      return ret;
    },
    __wbg_isSafeInteger_ecd6a7f9c3e053cd: function(arg0) {
      const ret = Number.isSafeInteger(getObject(arg0));
      return ret;
    },
    __wbg_iterator_d8f549ec8fb061b1: function() {
      const ret = Symbol.iterator;
      return addHeapObject(ret);
    },
    __wbg_length_b3416cf66a5452c8: function(arg0) {
      const ret = getObject(arg0).length;
      return ret;
    },
    __wbg_length_ea16607d7b61445b: function(arg0) {
      const ret = getObject(arg0).length;
      return ret;
    },
    __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
      const ret = getObject(arg0).msCrypto;
      return addHeapObject(ret);
    },
    __wbg_new_0837727332ac86ba: function() {
      return handleError(function() {
        const ret = new Headers();
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_new_227d7c05414eb861: function() {
      const ret = new Error();
      return addHeapObject(ret);
    },
    __wbg_new_49d5571bd3f0c4d4: function() {
      const ret = /* @__PURE__ */ new Map();
      return addHeapObject(ret);
    },
    __wbg_new_5f486cdf45a04d78: function(arg0) {
      const ret = new Uint8Array(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_new_a70fbab9066b301f: function() {
      const ret = new Array();
      return addHeapObject(ret);
    },
    __wbg_new_ab79df5bd7c26067: function() {
      const ret = new Object();
      return addHeapObject(ret);
    },
    __wbg_new_c518c60af666645b: function() {
      return handleError(function() {
        const ret = new AbortController();
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_new_from_slice_22da9388ac046e50: function(arg0, arg1) {
      const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
      return addHeapObject(ret);
    },
    __wbg_new_typed_aaaeaf29cf802876: function(arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg02, arg12) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wasm_bindgen_func_elem_1652(a, state0.b, arg02, arg12);
          } finally {
            state0.a = a;
          }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    },
    __wbg_new_with_length_825018a1616e9e55: function(arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return addHeapObject(ret);
    },
    __wbg_new_with_str_and_init_b4b54d1a819bc724: function() {
      return handleError(function(arg0, arg1, arg2) {
        const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_next_11b99ee6237339e3: function() {
      return handleError(function(arg0) {
        const ret = getObject(arg0).next();
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_next_e01a967809d1aa68: function(arg0) {
      const ret = getObject(arg0).next;
      return addHeapObject(ret);
    },
    __wbg_node_84ea875411254db1: function(arg0) {
      const ret = getObject(arg0).node;
      return addHeapObject(ret);
    },
    __wbg_now_16f0c993d5dd6c27: function() {
      const ret = Date.now();
      return ret;
    },
    __wbg_process_44c7a14e11e9f69e: function(arg0) {
      const ret = getObject(arg0).process;
      return addHeapObject(ret);
    },
    __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
      Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
    },
    __wbg_queueMicrotask_0c399741342fb10f: function(arg0) {
      const ret = getObject(arg0).queueMicrotask;
      return addHeapObject(ret);
    },
    __wbg_queueMicrotask_a082d78ce798393e: function(arg0) {
      queueMicrotask(getObject(arg0));
    },
    __wbg_randomFillSync_6c25eac9869eb53c: function() {
      return handleError(function(arg0, arg1) {
        getObject(arg0).randomFillSync(takeObject(arg1));
      }, arguments);
    },
    __wbg_require_b4edbdcf3e2a1ef0: function() {
      return handleError(function() {
        const ret = module.require;
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_resolve_ae8d83246e5bcc12: function(arg0) {
      const ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_setTimeout_f757f00851f76c42: function(arg0, arg1) {
      const ret = setTimeout(getObject(arg0), arg1);
      return addHeapObject(ret);
    },
    __wbg_set_282384002438957f: function(arg0, arg1, arg2) {
      getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    },
    __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
      getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    },
    __wbg_set_7eaa4f96924fd6b3: function() {
      return handleError(function(arg0, arg1, arg2) {
        const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
        return ret;
      }, arguments);
    },
    __wbg_set_bf7251625df30a02: function(arg0, arg1, arg2) {
      const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    },
    __wbg_set_body_a3d856b097dfda04: function(arg0, arg1) {
      getObject(arg0).body = getObject(arg1);
    },
    __wbg_set_cache_ec7e430c6056ebda: function(arg0, arg1) {
      getObject(arg0).cache = __wbindgen_enum_RequestCache[arg1];
    },
    __wbg_set_credentials_ed63183445882c65: function(arg0, arg1) {
      getObject(arg0).credentials = __wbindgen_enum_RequestCredentials[arg1];
    },
    __wbg_set_headers_3c8fecc693b75327: function(arg0, arg1) {
      getObject(arg0).headers = getObject(arg1);
    },
    __wbg_set_method_8c015e8bcafd7be1: function(arg0, arg1, arg2) {
      getObject(arg0).method = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_mode_5a87f2c809cf37c2: function(arg0, arg1) {
      getObject(arg0).mode = __wbindgen_enum_RequestMode[arg1];
    },
    __wbg_set_signal_0cebecb698f25d21: function(arg0, arg1) {
      getObject(arg0).signal = getObject(arg1);
    },
    __wbg_signal_166e1da31adcac18: function(arg0) {
      const ret = getObject(arg0).signal;
      return addHeapObject(ret);
    },
    __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
      const ret = getObject(arg1).stack;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
      const ret = typeof global === "undefined" ? null : global;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
      const ret = typeof globalThis === "undefined" ? null : globalThis;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_SELF_f207c857566db248: function() {
      const ret = typeof self === "undefined" ? null : self;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
      const ret = typeof window === "undefined" ? null : window;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_status_318629ab93a22955: function(arg0) {
      const ret = getObject(arg0).status;
      return ret;
    },
    __wbg_stringify_5ae93966a84901ac: function() {
      return handleError(function(arg0) {
        const ret = JSON.stringify(getObject(arg0));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_subarray_a068d24e39478a8a: function(arg0, arg1, arg2) {
      const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    },
    __wbg_text_372f5b91442c50f9: function() {
      return handleError(function(arg0) {
        const ret = getObject(arg0).text();
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_then_098abe61755d12f6: function(arg0, arg1) {
      const ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_then_9e335f6dd892bc11: function(arg0, arg1, arg2) {
      const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    },
    __wbg_url_7fefc1820fba4e0c: function(arg0, arg1) {
      const ret = getObject(arg1).url;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg_value_21fc78aab0322612: function(arg0) {
      const ret = getObject(arg0).value;
      return addHeapObject(ret);
    },
    __wbg_versions_276b2795b1c6a219: function(arg0) {
      const ret = getObject(arg0).versions;
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000001: function(arg0, arg1) {
      const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_854, __wasm_bindgen_func_elem_855);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000002: function(arg0, arg1) {
      const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_1182, __wasm_bindgen_func_elem_1183);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000003: function(arg0) {
      const ret = arg0;
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000004: function(arg0) {
      const ret = arg0;
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000005: function(arg0, arg1) {
      const ret = getArrayU8FromWasm0(arg0, arg1);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000006: function(arg0, arg1) {
      const ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000007: function(arg0) {
      const ret = BigInt.asUintN(64, arg0);
      return addHeapObject(ret);
    },
    __wbindgen_object_clone_ref: function(arg0) {
      const ret = getObject(arg0);
      return addHeapObject(ret);
    },
    __wbindgen_object_drop_ref: function(arg0) {
      takeObject(arg0);
    }
  };
  return {
    __proto__: null,
    "./idkit_wasm_bg.js": import0
  };
}
function __wasm_bindgen_func_elem_855(arg0, arg1) {
  wasm.__wasm_bindgen_func_elem_855(arg0, arg1);
}
function __wasm_bindgen_func_elem_1183(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_1183(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wasm_bindgen_func_elem_1652(arg0, arg1, arg2, arg3) {
  wasm.__wasm_bindgen_func_elem_1652(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
var __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];
var __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];
var __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
var BridgeEncryptionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_bridgeencryption_free(ptr >>> 0, 1));
var CredentialRequestWasmFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_credentialrequestwasm_free(ptr >>> 0, 1));
var IDKitBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_idkitbuilder_free(ptr >>> 0, 1));
var IDKitInviteCodeRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_idkitinvitecoderequest_free(ptr >>> 0, 1));
var IDKitProofFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_idkitproof_free(ptr >>> 0, 1));
var IDKitRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_idkitrequest_free(ptr >>> 0, 1));
var RpContextWasmFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_rpcontextwasm_free(ptr >>> 0, 1));
var RpSignatureFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_rpsignature_free(ptr >>> 0, 1));
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
var CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((state) => state.dtor(state.a, state.b));
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function dropObject(idx) {
  if (idx < 1028) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
var cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function getObject(idx) {
  return heap[idx];
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_export3(addHeapObject(e));
  }
}
var heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
var heap_next = heap.length;
function isLikeNone(x) {
  return x === void 0 || x === null;
}
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      state.a = a;
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS.unregister(state);
    }
  };
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
var MAX_SAFARI_DECODE_BYTES = 2146435072;
var numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
var cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
}
var WASM_VECTOR_LEN = 0;
var wasm;
function __wbg_finalize_init(instance, module2) {
  wasm = instance.exports;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
}
async function __wbg_load(module2, imports) {
  if (typeof Response === "function" && module2 instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module2, imports);
      } catch (e) {
        const validResponse = module2.ok && expectedResponseType(module2.type);
        if (validResponse && module2.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module2.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module2, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module: module2 };
    } else {
      return instance;
    }
  }
  function expectedResponseType(type) {
    switch (type) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
function initSync(module2) {
  if (wasm !== void 0) return wasm;
  if (module2 !== void 0) {
    if (Object.getPrototypeOf(module2) === Object.prototype) {
      ({ module: module2 } = module2);
    } else {
      console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
    }
  }
  const imports = __wbg_get_imports();
  if (!(module2 instanceof WebAssembly.Module)) {
    module2 = new WebAssembly.Module(module2);
  }
  const instance = new WebAssembly.Instance(module2, imports);
  return __wbg_finalize_init(instance);
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (module_or_path !== void 0) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (module_or_path === void 0) {
    module_or_path = new URL("idkit_wasm_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module: module2 } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance);
}
var wasmInitialized = false;
var wasmInitPromise = null;
async function initIDKit() {
  if (wasmInitialized) {
    return;
  }
  if (wasmInitPromise) {
    return wasmInitPromise;
  }
  wasmInitPromise = (async () => {
    try {
      await __wbg_init();
      wasmInitialized = true;
    } catch (error) {
      wasmInitPromise = null;
      throw new Error(`Failed to initialize IDKit WASM: ${error}`);
    }
  })();
  return wasmInitPromise;
}
var _debug = false;
function isDebug() {
  if (_debug) return true;
  return typeof window !== "undefined" && Boolean(window.IDKIT_DEBUG);
}
function setDebug(enabled) {
  _debug = enabled;
}
function buildDebugReport(report) {
  return {
    ...report,
    version: 1,
    package_version: package_default.version
  };
}
var MINIAPP_VERIFY_ACTION = "miniapp-verify-action";
function toNativeErrorCode(error) {
  const code = error instanceof Error ? error.message : String(error);
  return Object.values(IDKitErrorCodes).includes(code) ? code : "generic_error";
}
function asDebugObject(value) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return { value };
}
function detectNativePlatform() {
  const w = window;
  const webkit = w.webkit;
  if (webkit?.messageHandlers?.minikit) {
    return "ios";
  }
  if (w.Android) {
    return "android";
  }
  return "none";
}
function detectSendChannel() {
  const platform = detectNativePlatform();
  if (platform === "ios") {
    return "webkit.minikit";
  }
  if (platform === "android") {
    return "Android.postMessage";
  }
  return "none";
}
function isInWorldApp() {
  return typeof window !== "undefined" && Boolean(window.WorldApp);
}
function getWorldAppVerifyVersion() {
  const cmds = window.WorldApp?.supported_commands;
  if (!Array.isArray(cmds)) return 1;
  const verify = cmds.find((c) => c.name === "verify");
  return verify?.supported_versions?.includes(2) ? 2 : 1;
}
var _requestCounter = 0;
var _activeNativeRequest = null;
function createNativeRequest(wasmPayload, config, signalHashes = {}, legacySignalHash, version = 2) {
  if (_activeNativeRequest?.isPending()) {
    if (isDebug())
      console.warn(
        "[IDKit] Native: request already in flight, reusing active request"
      );
    return _activeNativeRequest;
  }
  const request2 = new NativeIDKitRequest(
    wasmPayload,
    config,
    signalHashes,
    legacySignalHash,
    version
  );
  _activeNativeRequest = request2;
  return request2;
}
var NativeIDKitRequest = class {
  constructor(wasmPayload, config, signalHashes = {}, legacySignalHash, version = 2) {
    this.connectorURI = "";
    this.completionResult = null;
    this.resolveFn = null;
    this.messageHandler = null;
    this.miniKitHandler = null;
    this.requestId = crypto.randomUUID?.() ?? `native-${Date.now()}-${++_requestCounter}`;
    this.requestPayload = wasmPayload;
    this.responsePayload = void 0;
    this.debugState = {
      verify_version: version,
      platform: detectNativePlatform(),
      send_channel: detectSendChannel()
    };
    this.resultPromise = new Promise((resolve) => {
      this.resolveFn = resolve;
      const recordResponse = (responsePayload, responseChannel) => {
        this.debugState.response_channel = responseChannel;
        this.responsePayload = responsePayload;
      };
      const handleIncomingPayload = (responsePayload, responseChannel) => {
        if (this.completionResult) return;
        recordResponse(responsePayload, responseChannel);
        if (isDebug())
          console.debug("[IDKit] Native: received response", responsePayload);
        if (responsePayload?.status === "error") {
          if (isDebug())
            console.warn(
              "[IDKit] Native: received error response",
              responsePayload.error_code
            );
          this.complete({
            success: false,
            error: responsePayload.error_code ?? "generic_error"
            /* GenericError */
          });
          return;
        }
        try {
          const userPresenceCompleted = getUserPresenceCompleted(responsePayload);
          if (config.require_user_presence === true && !userPresenceCompleted) {
            this.complete({
              success: false,
              error: "user_presence_failed"
              /* UserPresenceFailed */
            });
            return;
          }
          const result = nativeResultToIDKitResult(
            responsePayload,
            config,
            signalHashes,
            legacySignalHash,
            userPresenceCompleted
          );
          if (isDebug())
            console.debug(
              "[IDKit] Native: mapped response",
              result.protocol_version
            );
          this.complete({ success: true, result });
        } catch (error) {
          if (isDebug())
            console.warn("[IDKit] Native: failed to map response", error);
          this.complete({
            success: false,
            error: toNativeErrorCode(error)
          });
        }
      };
      const handler = (event) => {
        const data = event.data;
        if (data?.type === MINIAPP_VERIFY_ACTION || data?.command === MINIAPP_VERIFY_ACTION) {
          handleIncomingPayload(data.payload ?? data, "window.message");
        }
      };
      this.messageHandler = handler;
      window.addEventListener("message", handler);
      let miniKitSubscribed = false;
      try {
        const miniKit = window.MiniKit;
        if (typeof miniKit?.subscribe === "function") {
          miniKitSubscribed = true;
          const miniKitHandler = (payload) => {
            handleIncomingPayload(payload?.payload ?? payload, "minikit");
          };
          this.miniKitHandler = miniKitHandler;
          miniKit.subscribe(MINIAPP_VERIFY_ACTION, miniKitHandler);
        }
      } catch (err2) {
        if (isDebug())
          console.warn("[IDKit] Native: MiniKit subscribe failed", err2);
      }
      this.debugState.minikit_subscribed = miniKitSubscribed;
      const sendPayload = {
        command: "verify",
        version,
        payload: wasmPayload
      };
      try {
        const w = window;
        if (w.webkit?.messageHandlers?.minikit) {
          if (isDebug())
            console.debug(
              `[IDKit] Native: sending verify command (version=${version}, platform=ios)`,
              sendPayload
            );
          w.webkit.messageHandlers.minikit.postMessage(sendPayload);
        } else if (w.Android) {
          if (isDebug())
            console.debug(
              `[IDKit] Native: sending verify command (version=${version}, platform=android)`,
              sendPayload
            );
          w.Android.postMessage(JSON.stringify(sendPayload));
        } else {
          if (isDebug())
            console.warn(
              "[IDKit] Native: no native bridge found (no webkit/Android)"
            );
          this.responsePayload = {
            error: "generic_error"
            /* GenericError */
          };
          this.complete({
            success: false,
            error: "generic_error"
            /* GenericError */
          });
        }
      } catch (err2) {
        if (isDebug()) console.warn("[IDKit] Native: postMessage failed", err2);
        this.responsePayload = {
          error: "generic_error"
          /* GenericError */
        };
        this.complete({
          success: false,
          error: "generic_error"
          /* GenericError */
        });
      }
    });
  }
  getDebugReport() {
    return buildDebugReport({
      transport: "mini_app",
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      request_id: this.requestId,
      request_payload: asDebugObject(this.requestPayload),
      response_payload: asDebugObject(this.responsePayload),
      mini_app: this.debugState
    });
  }
  // Single entry point for finishing the request. Idempotent — first caller wins.
  complete(result) {
    if (this.completionResult) return;
    if (isDebug())
      console.debug(
        "[IDKit] Native: request completed",
        result.success === true ? "success" : `error=${result.error}`
      );
    this.completionResult = result;
    this.cleanup();
    this.resolveFn?.(result);
    if (_activeNativeRequest === this) {
      _activeNativeRequest = null;
    }
  }
  cancel() {
    this.complete({
      success: false,
      error: "cancelled"
      /* Cancelled */
    });
  }
  cleanup() {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.miniKitHandler) {
      try {
        const miniKit = window.MiniKit;
        miniKit?.unsubscribe?.(MINIAPP_VERIFY_ACTION);
      } catch (err2) {
        if (isDebug())
          console.warn("[IDKit] Native: MiniKit unsubscribe failed", err2);
      }
      this.miniKitHandler = null;
    }
  }
  isPending() {
    return this.completionResult === null;
  }
  async pollOnce() {
    const completionResult = this.completionResult;
    if (!completionResult) {
      return { type: "awaiting_confirmation" };
    }
    if (completionResult.success === true) {
      return { type: "confirmed", result: completionResult.result };
    }
    return { type: "failed", error: completionResult.error };
  }
  async pollUntilCompletion(options) {
    const timeout = options?.timeout ?? 9e5;
    const timeoutId = setTimeout(() => {
      this.complete({
        success: false,
        error: "timeout"
        /* Timeout */
      });
    }, timeout);
    const abortHandler = options?.signal ? () => {
      this.complete({
        success: false,
        error: "cancelled"
        /* Cancelled */
      });
    } : null;
    if (abortHandler) {
      if (options.signal.aborted) {
        abortHandler();
      } else {
        options.signal.addEventListener("abort", abortHandler, {
          once: true
        });
      }
    }
    try {
      return await this.resultPromise;
    } catch (error) {
      console.error("Unexpected rejection in native resultPromise", error);
      this.complete({
        success: false,
        error: "generic_error"
        /* GenericError */
      });
      return this.completionResult;
    } finally {
      clearTimeout(timeoutId);
      if (options?.signal && abortHandler) {
        options.signal.removeEventListener("abort", abortHandler);
      }
    }
  }
};
function normalizeLegacyResponseIdentifier(identifier) {
  return identifier === "face" ? "selfie" : identifier;
}
function nativeResultToIDKitResult(payload, config, signalHashes, legacySignalHash, userPresenceCompleted) {
  const p = payload;
  const rpNonce = config.rp_context?.nonce ?? "";
  const integrity_bundle = normalizeIntegrityBundle(p);
  if ("proof_response" in p && p.proof_response != null) {
    const proof_response = p.proof_response;
    if (isDebug())
      console.debug("[IDKit] Native: mapping wrapped v4 proof_response", {
        responseCount: proof_response.responses?.length,
        responseIdentifiers: proof_response.responses?.map(
          (item) => item.identifier
        )
      });
    const result = idkit_wasm_exports.proofResponseToIDKitResult(proof_response, {
      nonce: rpNonce,
      action: config.action,
      action_description: config.action_description,
      environment: config.environment ?? "production",
      signal_hashes: signalHashes,
      identity_attested: p.identity_attested,
      ...config.require_user_presence === true ? { user_presence_completed: userPresenceCompleted } : {}
    });
    result.integrity_bundle = integrity_bundle;
    return result;
  }
  if (Array.isArray(p.responses) && ("id" in p || "version" in p || "error" in p)) {
    throw new Error(
      "unexpected_response"
      /* UnexpectedResponse */
    );
  }
  if ("verifications" in p && Array.isArray(p.verifications)) {
    const verifications = p.verifications;
    return {
      protocol_version: "3.0",
      nonce: rpNonce,
      action: config.action ?? "",
      responses: verifications.map((v) => {
        const incomingIdentifier2 = v.verification_level;
        const identifier2 = normalizeLegacyResponseIdentifier(incomingIdentifier2);
        return {
          identifier: identifier2,
          signal_hash: v.signal_hash ?? signalHashes[identifier2] ?? signalHashes[incomingIdentifier2] ?? legacySignalHash,
          proof: v.proof,
          merkle_root: v.merkle_root,
          nullifier: v.nullifier_hash
        };
      }),
      ...config.require_user_presence === true ? { user_presence_completed: userPresenceCompleted } : {},
      environment: config.environment ?? "production",
      integrity_bundle
    };
  }
  const incomingIdentifier = p.verification_level;
  const identifier = normalizeLegacyResponseIdentifier(incomingIdentifier);
  return {
    protocol_version: "3.0",
    nonce: rpNonce,
    action: config.action ?? "",
    responses: [
      {
        identifier,
        signal_hash: p.signal_hash ?? signalHashes[identifier] ?? signalHashes[incomingIdentifier] ?? legacySignalHash,
        proof: p.proof,
        merkle_root: p.merkle_root,
        nullifier: p.nullifier_hash
      }
    ],
    ...config.require_user_presence === true ? { user_presence_completed: userPresenceCompleted } : {},
    environment: config.environment ?? "production",
    integrity_bundle
  };
}
function getUserPresenceCompleted(payload) {
  const p = payload;
  return p?.user_presence_completed === true || p?.proof_response?.user_presence_completed === true;
}
function normalizeIntegrityBundle(payload) {
  const integrityBundle = payload.integrity_bundle;
  if (integrityBundle == null || typeof integrityBundle !== "object") {
    return void 0;
  }
  return integrityBundle;
}
var SESSION_ID_PATTERN2 = /^session_[0-9a-fA-F]{128}$/;
var CORE_NAMESPACE_OPTIONS = {
  package_name: "idkit_js_core",
  package_version: package_default.version
};
async function pollUntilCompletionLoop(pollOnce, options) {
  const pollInterval = options?.pollInterval ?? 1e3;
  const timeout = options?.timeout ?? 9e5;
  const startTime = Date.now();
  while (true) {
    if (options?.signal?.aborted) {
      return {
        success: false,
        error: "cancelled"
        /* Cancelled */
      };
    }
    if (Date.now() - startTime > timeout) {
      return {
        success: false,
        error: "timeout"
        /* Timeout */
      };
    }
    const status = await pollOnce();
    if (status.type === "confirmed" && status.result) {
      return { success: true, result: status.result };
    }
    if (status.type === "failed") {
      return {
        success: false,
        error: status.error ?? "generic_error"
        /* GenericError */
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}
function getBridgeDebugReport(wasmRequest) {
  return buildDebugReport(
    wasmRequest.getDebugReport()
  );
}
var IDKitRequestImpl = class {
  constructor(wasmRequest) {
    this.wasmRequest = wasmRequest;
    this._connectorURI = wasmRequest.connectUrl();
    this._requestId = wasmRequest.requestId();
  }
  get connectorURI() {
    return this._connectorURI;
  }
  get requestId() {
    return this._requestId;
  }
  async pollOnce() {
    return await this.wasmRequest.pollForStatus();
  }
  pollUntilCompletion(options) {
    return pollUntilCompletionLoop(() => this.pollOnce(), options);
  }
  getDebugReport() {
    return getBridgeDebugReport(this.wasmRequest);
  }
};
var IDKitInviteCodeRequestImpl = class {
  constructor(wasmRequest) {
    this.wasmRequest = wasmRequest;
    this._connectorURI = wasmRequest.connectUrl();
    this._expiresAt = wasmRequest.expiresAt();
    this._requestId = wasmRequest.requestId();
  }
  get connectorURI() {
    return this._connectorURI;
  }
  get expiresAt() {
    return this._expiresAt;
  }
  get requestId() {
    return this._requestId;
  }
  async pollOnce() {
    return await this.wasmRequest.pollForStatus();
  }
  pollUntilCompletion(options) {
    return pollUntilCompletionLoop(() => this.pollOnce(), options);
  }
  getDebugReport() {
    return getBridgeDebugReport(this.wasmRequest);
  }
};
function CredentialRequest(credential_type, options) {
  return {
    type: credential_type,
    signal: options?.signal,
    genesis_issued_at_min: options?.genesis_issued_at_min,
    expires_at_min: options?.expires_at_min
  };
}
function any(...nodes) {
  return { any: nodes };
}
function all(...nodes) {
  return { all: nodes };
}
function enumerate(...nodes) {
  return { enumerate: nodes };
}
function orbLegacy(opts = {}) {
  return { type: "OrbLegacy", signal: opts.signal };
}
function secureDocumentLegacy(opts = {}) {
  return { type: "SecureDocumentLegacy", signal: opts.signal };
}
function documentLegacy(opts = {}) {
  return { type: "DocumentLegacy", signal: opts.signal };
}
function deviceLegacy(opts = {}) {
  return { type: "DeviceLegacy", signal: opts.signal };
}
function selfieCheckLegacy(opts = {}) {
  return { type: "SelfieCheckLegacy", signal: opts.signal };
}
function selfieCheck(opts = {}) {
  return { type: "SelfieCheck", signal: opts.signal };
}
function proofOfHuman(opts = {}) {
  return { type: "ProofOfHuman", signal: opts.signal };
}
function passport(opts = {}) {
  return { type: "Passport", signal: opts.signal };
}
function mnc(opts = {}) {
  return { type: "Mnc", signal: opts.signal };
}
function identityCheck(params) {
  return {
    type: "IdentityCheck",
    attributes: params.attributes,
    ...params.legacy_signal !== void 0 && {
      legacy_signal: params.legacy_signal
    }
  };
}
function createWasmBuilderFromConfig(config) {
  if (!config.rp_context) {
    throw new Error("rp_context is required for WASM bridge transport");
  }
  const rpContext = new idkit_wasm_exports.RpContextWasm(
    config.rp_context.rp_id,
    config.rp_context.nonce,
    BigInt(config.rp_context.created_at),
    BigInt(config.rp_context.expires_at),
    config.rp_context.signature
  );
  if (config.type === "request") {
    return idkit_wasm_exports.request(
      config.app_id,
      config.package_name,
      config.package_version,
      String(config.action ?? ""),
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
      config.allow_legacy_proofs ?? false,
      config.require_user_presence ?? false,
      config.override_connect_base_url ?? null,
      config.return_to ?? null,
      config.environment ?? null
    );
  }
  if (config.type === "proveSession") {
    return idkit_wasm_exports.proveSession(
      config.session_id,
      config.app_id,
      config.package_name,
      config.package_version,
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
      config.require_user_presence ?? false,
      config.override_connect_base_url ?? null,
      config.return_to ?? null,
      config.environment ?? null
    );
  }
  return idkit_wasm_exports.createSession(
    config.app_id,
    config.package_name,
    config.package_version,
    rpContext,
    config.action_description ?? null,
    config.bridge_url ?? null,
    config.require_user_presence ?? false,
    config.override_connect_base_url ?? null,
    config.return_to ?? null,
    config.environment ?? null
  );
}
var IDKitBuilder2 = class {
  constructor(config) {
    this.config = config;
  }
  /**
   * Creates an IDKit request with the given constraints
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all/enumerate combinators)
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false })
   *   .constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
   * ```
   */
  async constraints(constraints) {
    await initIDKit();
    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();
      if (verifyVersion < 2) {
        throw new Error(
          "verify v2 is not supported by this World App version. Use a legacy preset (e.g. orbLegacy()) or update the World App."
        );
      }
      const wasmBuilder2 = createWasmBuilderFromConfig(this.config);
      const wasmResult = wasmBuilder2.nativePayload(constraints);
      return createNativeRequest(
        wasmResult.payload,
        this.config,
        wasmResult.signal_hashes ?? {},
        wasmResult.legacy_signal_hash,
        2
      );
    }
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    const wasmRequest = await wasmBuilder.constraints(
      constraints
    );
    return new IDKitRequestImpl(wasmRequest);
  }
  /**
   * Creates an IDKit request from a preset (works for all request types)
   *
   * Presets provide a simplified way to create requests with predefined
   * credential configurations.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), selfieCheck(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
   *   .preset(orbLegacy({ signal: 'user-123' }));
   * ```
   */
  async preset(preset) {
    if (this.config.type === "createSession" || this.config.type === "proveSession") {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead."
      );
    }
    await initIDKit();
    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();
      if (verifyVersion === 2) {
        const wasmBuilder2 = createWasmBuilderFromConfig(this.config);
        const wasmResult = wasmBuilder2.nativePayloadFromPreset(preset);
        return createNativeRequest(
          wasmResult.payload,
          this.config,
          wasmResult.signal_hashes ?? {},
          wasmResult.legacy_signal_hash,
          2
        );
      }
      try {
        const wasmBuilder2 = createWasmBuilderFromConfig(this.config);
        const wasmResult = wasmBuilder2.nativePayloadV1FromPreset(preset);
        return createNativeRequest(
          wasmResult.payload,
          this.config,
          wasmResult.signal_hashes ?? {},
          wasmResult.legacy_signal_hash,
          1
        );
      } catch (err2) {
        if (err2 instanceof Error && String(err2.message).includes("v1 payload")) {
          throw new Error(
            "verify v2 is not supported by this World App version. Use a legacy preset (e.g. orbLegacy()) or update the World App."
          );
        }
        throw err2;
      }
    }
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    const wasmRequest = await wasmBuilder.preset(
      preset
    );
    return new IDKitRequestImpl(wasmRequest);
  }
};
var IDKitInviteCodeBuilder = class {
  constructor(config) {
    this.config = config;
  }
  /**
   * Creates an invite-code mode IDKit request with the given constraints.
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all/enumerate combinators)
   * @returns A new IDKitInviteCodeRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.requestWithInviteCode({ app_id, action, rp_context, allow_legacy_proofs: false })
   *   .constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
   * displayLink(request.connectorURI);
   * ```
   */
  async constraints(constraints) {
    await initIDKit();
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    const wasmRequest = await wasmBuilder.constraintsWithInviteCode(
      constraints
    );
    return new IDKitInviteCodeRequestImpl(wasmRequest);
  }
  /**
   * Creates an invite-code mode IDKit request from a preset.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), selfieCheck(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitInviteCodeRequest instance
   */
  async preset(preset) {
    if (this.config.type === "createSession" || this.config.type === "proveSession") {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead."
      );
    }
    await initIDKit();
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    const wasmRequest = await wasmBuilder.presetWithInviteCode(
      preset
    );
    return new IDKitInviteCodeRequestImpl(wasmRequest);
  }
};
function createRequestForNamespace(config, options) {
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (config.action === void 0 || config.action === null) {
    throw new Error("action is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest()."
    );
  }
  if (typeof config.allow_legacy_proofs !== "boolean") {
    throw new Error(
      "allow_legacy_proofs is required. Set to true to accept v3 proofs during migration, or false to only accept v4 proofs."
    );
  }
  return new IDKitBuilder2({
    type: "request",
    app_id: config.app_id,
    package_name: options.package_name,
    package_version: options.package_version,
    action: String(config.action),
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    allow_legacy_proofs: config.allow_legacy_proofs,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment
  });
}
function createRequestWithInviteCodeForNamespace(config, options) {
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (config.action === void 0 || config.action === null) {
    throw new Error("action is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest()."
    );
  }
  if (typeof config.allow_legacy_proofs !== "boolean") {
    throw new Error(
      "allow_legacy_proofs is required. Set to true to accept v3 proofs during migration, or false to only accept v4 proofs."
    );
  }
  return new IDKitInviteCodeBuilder({
    type: "request",
    app_id: config.app_id,
    package_name: options.package_name,
    package_version: options.package_version,
    action: String(config.action),
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    allow_legacy_proofs: config.allow_legacy_proofs,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment
  });
}
function createSessionForNamespace(config, options) {
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest()."
    );
  }
  return new IDKitBuilder2({
    type: "createSession",
    app_id: config.app_id,
    package_name: options.package_name,
    package_version: options.package_version,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment
  });
}
function proveSessionForNamespace(sessionId, config, options) {
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  if (!SESSION_ID_PATTERN2.test(sessionId)) {
    throw new Error(
      "session_id must be in the format session_<128 hex characters>"
    );
  }
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest()."
    );
  }
  return new IDKitBuilder2({
    type: "proveSession",
    session_id: sessionId,
    app_id: config.app_id,
    package_name: options.package_name,
    package_version: options.package_version,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment
  });
}
function createIDKitNamespace(options) {
  return {
    request: (config) => createRequestForNamespace(config, options),
    requestWithInviteCode: (config) => createRequestWithInviteCodeForNamespace(config, options),
    createSession: (config) => createSessionForNamespace(config, options),
    proveSession: (sessionId, config) => proveSessionForNamespace(sessionId, config, options),
    CredentialRequest,
    any,
    all,
    enumerate,
    orbLegacy,
    secureDocumentLegacy,
    documentLegacy,
    deviceLegacy,
    selfieCheckLegacy,
    selfieCheck,
    proofOfHuman,
    passport,
    mnc,
    identityCheck
  };
}
var IDKit = createIDKitNamespace(
  CORE_NAMESPACE_OPTIONS
);
var isReactNative = () => {
  return typeof navigator !== "undefined" && typeof navigator.product === "string" && navigator.product === "ReactNative";
};
var isWeb = () => {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
};
var isNode = () => {
  return typeof process !== "undefined" && typeof process.versions !== "undefined" && typeof process.versions.node !== "undefined";
};
function hashToField2(input) {
  const hash = BigInt("0x" + bytesToHex3(keccak_2562(input))) >> 8n;
  return hexToBytes3(hash.toString(16).padStart(64, "0"));
}
function hashSignal2(signal) {
  let input;
  if (signal instanceof Uint8Array) {
    input = signal;
  } else if (signal.startsWith("0x") && isValidHex(signal.slice(2))) {
    input = hexToBytes3(signal.slice(2));
  } else {
    input = new TextEncoder().encode(signal);
  }
  return "0x" + bytesToHex3(hashToField2(input));
}
function isValidHex(s) {
  if (s.length === 0) return false;
  if (s.length % 2 !== 0) return false;
  return /^[0-9a-fA-F]+$/.test(s);
}
export {
  CredentialRequest,
  IDKit,
  IDKitErrorCodes,
  all,
  any,
  createIDKitNamespace,
  deviceLegacy,
  documentLegacy,
  enumerate,
  getSessionCommitment,
  hashSignal2 as hashSignal,
  identityCheck,
  isDebug,
  isInWorldApp,
  isNode,
  isReactNative,
  isWeb,
  mnc,
  orbLegacy,
  passport,
  proofOfHuman,
  secureDocumentLegacy,
  selfieCheck,
  selfieCheckLegacy,
  setDebug,
  signRequest
};
/*! Bundled license information:

@worldcoin/idkit-server/dist/index.js:
  (*! Bundled license information:
  
  @noble/hashes/esm/utils.js:
    (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
  
  @noble/secp256k1/index.js:
    (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)
  *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
