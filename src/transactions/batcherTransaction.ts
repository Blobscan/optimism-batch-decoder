import { Frames, addBatchesToFrame_v0, extractFrames_v0 } from '../frames/frame'

export type BatcherTransaction = {
  version: number
  frames: Frames
}

const DERIVATION_VERSION_0 = 0

export const extractBatcherTransaction = async (calldata: string): Promise<BatcherTransaction> => {
  if (calldata.length === 0) {
    throw new Error('data array must not be empty')
  }

  const version = Number(calldata.slice(0, 4))
  console.log(`Derivation version: ${version}`)
  const frames: Frames = []

  // TODO: Add support for batcher transaction format v1
  // https://specs.optimism.io/protocol/derivation.html#batcher-transaction-format
  if (version !== DERIVATION_VERSION_0) {
    throw new Error(`invalid derivation format byte: got ${version}`)
  }

  // This extracts data from calldata version 0
  // Skip the derivation version byte and 0x at the start
  const rawFrames = extractFrames_v0(calldata.slice(4))
  for (const rawFrame of rawFrames) {
    const frame = await addBatchesToFrame_v0(rawFrame)
    frames.push(frame)
  }
  return { version, frames }
}
