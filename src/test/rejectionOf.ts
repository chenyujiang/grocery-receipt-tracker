// Awaits `promise`'s rejection and returns the error, typed, failing the test
// if the promise resolves instead or rejects with anything but a `type`.
export async function rejectionOf<T>(
  promise: Promise<unknown>,
  type: abstract new (...args: never[]) => T
): Promise<T> {
  const err: unknown = await promise.then(
    () => {
      throw new Error(`Expected a ${type.name} rejection, but the promise resolved`);
    },
    (e: unknown) => e
  );
  if (!(err instanceof type)) throw new Error(`Expected a ${type.name} rejection, got ${String(err)}`);
  return err;
}
