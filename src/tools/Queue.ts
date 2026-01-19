/**
 * A fixed-size queue that automatically removes the oldest element when full.
 */
export class Queue<T> {
  private items: T[] = [];
  private maxLength: number;

  /**
   * Creates a new Queue with a maximum length.
   * @param maxLength - The maximum number of elements the queue can hold
   */
  constructor(maxLength: number) {
    if (maxLength <= 0) {
      throw new Error('maxLength must be greater than 0');
    }
    this.maxLength = maxLength;
  }

  /**
   * Adds an element to the queue.
   * If the queue is full, removes the oldest element first.
   * @param item - The item to add to the queue
   */
  enqueue(item: T): void {
    if (this.items.length >= this.maxLength) {
      this.items.shift(); // Remove the first (oldest) element
    }
    this.items.push(item);
  }

  /**
   * Returns the current number of elements in the queue.
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Checks if the queue is full.
   */
  isFull(): boolean {
    return this.items.length >= this.maxLength;
  }

  /**
   * Checks if the queue is empty.
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Exports the queue contents as an array.
   * Returns a copy to prevent external modification.
   */
  toArray(): T[] {
    return [...this.items];
  }

  /**
   * Clears all elements from the queue.
   */
  clear(): void {
    this.items = [];
  }
}
