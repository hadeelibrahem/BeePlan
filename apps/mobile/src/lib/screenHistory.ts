export class ScreenHistory<T extends string> {
  private entries: T[] = []

  push(current: T, next: T) {
    if (current !== next) this.entries.push(current)
  }

  pop(): T | undefined {
    return this.entries.pop()
  }

  clear() {
    this.entries = []
  }
}
