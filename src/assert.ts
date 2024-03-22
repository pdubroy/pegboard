export function assert(cond: boolean, msg = "") {
  if (!cond) {
    throw new Error(msg);
  }
}

export function checkNotNull<T>(x: T): NonNullable<T> {
  if (x == null) {
    throw new Error(`expected non-null: ${x}`);
  }
  return x as NonNullable<T>;
}
