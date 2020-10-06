/* istanbul ignore - this file is a demo */

export type Input = unknown
export type Output = unknown

/**
 * Simple worker that simply echoes the input as output.
 */
export async function call<I extends Input & Output>(input: I): Promise<I> {
  return input
}
