const OBJECT_PROTOTYPE_KEYS = new Set([
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "hasOwnProperty",
  "__lookupGetter__",
  "__lookupSetter__",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "valueOf",
  "__proto__",
  "toLocaleString",
]);

const ARRAY_PROTOTYPE_KEYS = new Set([
  "length",
  "constructor",
  "at",
  "concat",
  "copyWithin",
  "fill",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "lastIndexOf",
  "pop",
  "push",
  "reverse",
  "shift",
  "unshift",
  "slice",
  "sort",
  "splice",
  "includes",
  "indexOf",
  "join",
  "keys",
  "entries",
  "values",
  "forEach",
  "filter",
  "flat",
  "flatMap",
  "map",
  "every",
  "some",
  "reduce",
  "reduceRight",
  "toReversed",
  "toSorted",
  "toSpliced",
  "with",
  "toLocaleString",
  "toString",
]);

function ownStringKeys(value: object): readonly string[] | null {
  try {
    const keys = Reflect.ownKeys(value);
    const strings: string[] = [];
    for (const key of keys) {
      if (typeof key !== "string") return null;
      strings.push(key);
    }
    return strings;
  } catch {
    return null;
  }
}

function sameKeySet(keys: readonly string[], expected: ReadonlySet<string>): boolean {
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

export function trustedIntrinsicPrototypes(): boolean {
  const objectKeys = ownStringKeys(Object.prototype);
  if (objectKeys === null || !sameKeySet(objectKeys, OBJECT_PROTOTYPE_KEYS)) return false;
  try {
    const arrayKeys = Reflect.ownKeys(Array.prototype);
    const arrayStrings = arrayKeys.filter((key): key is string => typeof key === "string");
    const arraySymbols = arrayKeys.filter((key): key is symbol => typeof key === "symbol");
    return sameKeySet(arrayStrings, ARRAY_PROTOTYPE_KEYS)
      && arraySymbols.length === 2
      && arraySymbols.includes(Symbol.iterator)
      && arraySymbols.includes(Symbol.unscopables);
  } catch {
    return false;
  }
}

function inspectSafeData(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return true;
  if (typeof value === "function" || ancestors.has(value)) return false;
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    if (!isSafeArray(value)) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return false;
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !inspectSafeData(descriptor.value, next)) return false;
    }
    return true;
  }
  if (!isPlainRecord(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !inspectSafeData(descriptor.value, next)) return false;
  }
  return true;
}

export function isStructuredCloneable(value: unknown): boolean {
  if (!inspectSafeData(value)) return false;
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return true;
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !trustedIntrinsicPrototypes()) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

export function isSafeArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || !trustedIntrinsicPrototypes()) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return false;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
    }
    for (let index = 0; index < length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, String(index))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
