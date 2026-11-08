/** Deep copy for plain JSON-compatible data (all sim state is, by SAV-2). */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
