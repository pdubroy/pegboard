import { Result } from "./types.js";

export interface MemoEntry {
  cst: Result;
  nextPos?: number;
}

export class MemoTable<K> {
  table: Map<K, MemoEntry>[] = [];

  has(pos: number, key: K) {
    const col = this.table[pos];
    return col && col.has(key);
  }

  memoizeResult(pos: number, key: K, entry: MemoEntry) {
    let col = this.table[pos];
    if (!col) {
      col = this.table[pos] = new Map();
    }
    col.set(key, entry);
  }

  getResult(pos: number, key: K) {
    const col = this.table[pos];
    return col.get(key);
  }

  reset() {
    this.table = [];
  }
}
