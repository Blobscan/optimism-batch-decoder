import fs from 'fs'
import rlp, { NestedUint8Array } from 'rlp'
import stream from 'stream'
import zlib from 'zlib'
import { RawSpanBatch } from './RawSpanBatch'
import { SingularBatch } from './SingularBatch'

type Transaction = {
  type?: string
  to?: `0x${string}` | null
  gas?: bigint
  data?: `0x${string}`
  nonce?: number
  gasPrice?: bigint
  chainId?: number
  v?: bigint
  s?: `0x${string}`
  r?: `0x${string}`
  hash: `0x${string}`
}

type Transactions = Transaction[]

export type InnerBatch = {
  parentHash: string
  epochNum: number
  epochHash: string
  timestamp: number
  transactions: Transactions
}

type Batch = {
  inner: InnerBatch
}

export type Batches = Batch[]

enum BatchType {
  SingularBatch = 0,
  SpanBatch = 1
}

const MAX_BYTES_PER_CHANNEL = 10_000_000

export const parseBatchesData = async (compressedBatches: string): Promise<Batches> => {
  console.log('parsing')
  const decompressed = await decompressBatches_v0(compressedBatches)
  const decodedBatches: Batches = []
  let dataToDecode: Uint8Array = decompressed
  while (dataToDecode?.length) {
    const { data: decoded, remainder } = rlp.decode(dataToDecode, true)
    dataToDecode = remainder
    decodedBatches.push(decodeBatch(decoded))
  }
  return decodedBatches
}

export const decompressBatches_v0 = async (compressedBatches: string): Promise<Buffer> => {
  const inputBuffer = Buffer.from(compressedBatches, 'hex')
  console.log('decompressing', inputBuffer.length, 'bytes')

  fs.writeFileSync('blob1_ts.test', inputBuffer)
  console.log('written blob1_ts.test')

  //console.log(inputBuffer)
  console.log(compressedBatches.slice(0, 100))
  console.log(inputBuffer.toString('hex').slice(0, 100))

  try {
    // Decompress the input buffer
    const decompress = zlib.createInflate({
      maxOutputLength: MAX_BYTES_PER_CHANNEL,
      finishFlush: zlib.constants.Z_SYNC_FLUSH
    })
    //const decompress = zlib.createInflate()
    const decompressStream = stream.Readable.from(inputBuffer)

    const chunks: Buffer[] = []
    for await (const chunk of decompressStream.pipe(decompress)) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch (err) {
    console.error('Error in decompression:', err)
    throw err
  }
}

export const decodeBatch = (decodedBatch: Uint8Array | NestedUint8Array): Batch => {
  if (decodedBatch.length < 1) throw new Error('Batch too short')
  // first byte is the batch type
  switch (decodedBatch[0]) {
    case BatchType.SingularBatch:
      return { inner: SingularBatch.decode(decodedBatch.slice(1)) }
    case BatchType.SpanBatch:
      console.error('SpanBatch is not implemented')
      //return { inner: decodedBatch }
      return { inner: RawSpanBatch.decode(decodedBatch.slice(1)) }
    default:
      throw new Error(`Unrecognized batch type: ${decodedBatch[0]}`)
  }
}
