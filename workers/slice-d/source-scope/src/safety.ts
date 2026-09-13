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

export function isStructuredCloneable(value: unknown): boolean {
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
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, String(index))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
