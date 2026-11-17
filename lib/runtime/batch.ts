export async function isolateBatchItem<T>(work: () => Promise<T>, onError: (error: unknown) => T | Promise<T>) {
  try {
    return await work();
  } catch (error) {
    return await onError(error);
  }
}
