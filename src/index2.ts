import fs from 'fs'
import rlp from 'rlp'
import { Readable } from 'stream'
import zlib from 'zlib'
import { decompressBatches_v0 } from './batches/batch'
import type { Frames, FramesWithCompressedData } from './frames/frame'
//import { extractFrames_v0 } from './frames/frame'
/**
 * Read the binary file and split it into chunks of the specified size.
 * @param buffer - The binary data from the file.
 * @param chunkSize - The size of each chunk.
 * @returns An array of chunks.
 */
function chunks(buffer: Uint8Array, chunkSize: number): Uint8Array[] {
  const result = []
  for (let i = 0; i < buffer.length; i += chunkSize) {
    result.push(buffer.slice(i, i + chunkSize))
  }
  return result
}

/**
 * Convert the byte array to a number.
 * @param bytes - The array of bytes to convert.
 * @returns The number representation of the bytes.
 */
function bytesToNumber(bytes: Uint8Array): number {
  return bytes.reduce((acc, byte, index) => acc + (byte << (8 * (bytes.length - index - 1))), 0)
}

/**
 * Function to process data and extract frames, decoding according to the provided logic.
 * @param datas - Array of Uint8Array data chunks to process.
 * @returns An array of frames with compressed data.
 */
function processChannelData(datas: Uint8Array[]): FramesWithCompressedData {
  const frames: FramesWithCompressedData = []

  for (let data of datas) {
    if (data[0] !== 0) throw new Error('Assertion failed: data[0] must be 0 (derivation version)')

    data = data.slice(1) // Strip prefix byte

    while (data.length > 0) {
      console.log(`remaining data bytes: ${data.length}`)

      const channelIdBytes = data.slice(0, 16)
      const channelId = Array.from(channelIdBytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

      const frameNum = (data[16] << 8) | data[17] // Convert 2 bytes to an integer
      console.log(`frame num: ${frameNum}`)

      const frameLength = (data[18] << 24) | (data[19] << 16) | (data[20] << 8) | data[21] // Convert 4 bytes to an integer
      console.log('frame data length:', frameLength)

      const end = 16 + 2 + 4 + frameLength + 1
      console.log('end:', end)

      const isLast = data[end - 1] === 1 // Determine if it's the last frame
      console.log('is_last:', isLast)

      const frameDataBytes = data.slice(16 + 2 + 4, end - 1)
      const frameData = Array.from(frameDataBytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

      frames.push({
        channelId,
        frameNumber: frameNum,
        data: frameData,
        isLast
      })

      data = data.slice(end) // Move to the next chunk of data
    }
  }

  return frames
}

/**
 * Function to incrementally decompress a zlib-compressed data stream.
 * @param inputBuffer - The input buffer containing zlib-compressed data.
 * @returns A promise that resolves with the decompressed data.
 */
function decompressIncrementally(inputBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const inflate = zlib.createInflate({ finishFlush: zlib.constants.Z_SYNC_FLUSH })
    // zlib.createInflate complains like "Error: unexpected end of file"
    // zlib.createInflateRaw() complains like "Error: invalid stored block lengths"
    const chunks: Buffer[] = []

    // Create a readable stream from the input buffer
    const inputStream = new Readable({
      read() {
        this.push(inputBuffer)
        this.push(null) // Signal end of input
      }
    })

    // Pipe the input stream into the inflate stream
    inputStream.pipe(inflate)

    // Collect the decompressed chunks
    inflate.on('data', (chunk) => {
      chunks.push(chunk)
    })

    // Resolve the promise once decompression is complete
    inflate.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    // Handle errors during decompression
    inflate.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Reads a bit list from a Uint8Array.
 * @param length - The number of bits to read.
 * @param buffer - The Uint8Array containing the data.
 * @param offset - The starting offset.
 * @returns An object containing the list of bits and the new offset.
 */
function readBitlist(length: number, buffer: Uint8Array, offset: number): { bits: boolean[]; newOffset: number } {
  const bits: boolean[] = []
  let currentOffset = offset

  while (length > 0 && currentOffset < buffer.length) {
    const byte = buffer[currentOffset++]
    const tempBits: boolean[] = []

    for (let i = 0; i < Math.min(8, length); i++) {
      tempBits.push(((byte >> i) & 1) === 1)
    }

    bits.push(...tempBits.reverse())
    length -= 8
  }

  return { bits, newOffset: currentOffset }
}

/**
 * Function to read a variable-length integer (varint) from a Uint8Array.
 * @param buffer - The input Uint8Array containing the varint.
 * @param offset - The offset at which to start reading.
 * @returns An object containing the decoded varint and the new offset.
 */
function readVarint(buffer: Uint8Array, offset: number): { value: number; newOffset: number } {
  let result = 0
  let shift = 0
  let currentOffset = offset

  while (currentOffset < buffer.length) {
    const byte = buffer[currentOffset++]
    result |= (byte & 0b01111111) << shift
    if ((byte & 0b10000000) === 0) {
      break // Stop if the most significant bit is 0
    }
    shift += 7
  }

  return { value: result, newOffset: currentOffset }
}

/**
 * Function to read a specific number of bytes from a Uint8Array.
 * @param buffer - The input Uint8Array.
 * @param offset - The offset at which to start reading.
 * @param length - The number of bytes to read.
 * @returns An object containing the read bytes as a hex string and the new offset.
 */
function readBytesAsHex(buffer: Uint8Array, offset: number, length: number): { hex: string; newOffset: number } {
  const bytes = buffer.slice(offset, offset + length)
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { hex, newOffset: offset + length }
}

/**
 * Main function to read and process the binary file.
 * @param filename - The name of the file to read.
 */
async function processFile(filename: string): Promise<void> {
  const blobs = fs.readFileSync(filename) // Read the binary file
  const datas: Uint8Array[] = []

  for (const blob of chunks(blobs, 131072)) {
    if (blob[1] !== 0) throw new Error('Assertion failed: blob[1] must be 0')
    const declaredLength = bytesToNumber(blob.slice(2, 5))
    console.log('found version 0 blob, declared length:', declaredLength)
    let blobData = new Uint8Array()

    for (const chunk of chunks(blob, 128)) {
      // split into chunks of 128 bytes
      const byteA = chunk[32 * 0]
      const byteB = chunk[32 * 1]
      const byteC = chunk[32 * 2]
      const byteD = chunk[32 * 3]

      if ((byteA | byteB | byteC | byteD) & 0b1100_0000) {
        throw new Error('Assertion failed: bytes must meet specific criteria')
      }

      const tailA = chunk.slice(32 * 0 + 1, 32 * 1)
      const tailB = chunk.slice(32 * 1 + 1, 32 * 2)
      const tailC = chunk.slice(32 * 2 + 1, 32 * 3)
      const tailD = chunk.slice(32 * 3 + 1, 32 * 4)

      const x = (byteA & 0b0011_1111) | ((byteB & 0b0011_0000) << 2)
      const y = (byteB & 0b0000_1111) | ((byteD & 0b0000_1111) << 4)
      const z = (byteC & 0b0011_1111) | ((byteD & 0b0011_0000) << 2)

      const result = new Uint8Array(4 * 31 + 3)
      result.set(tailA, 0)
      result[tailA.length] = x
      result.set(tailB, tailA.length + 1)
      result[tailA.length + 1 + tailB.length] = y
      result.set(tailC, tailA.length + 1 + tailB.length + 1)
      result[tailA.length + 1 + tailB.length + 1 + tailC.length] = z
      result.set(tailD, tailA.length + 1 + tailB.length + 1 + tailC.length + 1)

      if (result.length !== 4 * 31 + 3) throw new Error('Assertion failed: length of result is incorrect')

      const newBlobData = new Uint8Array(blobData.length + result.length)
      newBlobData.set(blobData, 0)
      newBlobData.set(result, blobData.length)
      blobData = newBlobData
    }

    datas.push(blobData.slice(4, declaredLength + 4))
  }

  //const rawFrames = extractFrames_v0(calldata.slice(4))
  //const rawFrames2 = extractFrames_v0(datas.toString())
  const frames: Frames = []
  const channel_parts: string[] = []
  //const rawFrames = processChannelData(datas.slice(4))
  const rawFrames = processChannelData(datas)
  // console.log(rawFrames)

  for (const rawFrame of rawFrames) {
    console.log('adding frame')
    console.log(rawFrame.data.slice(0, 100))
    const buffer = Buffer.from(rawFrame.data, 'hex')
    console.log(buffer.slice(0, 100))

    channel_parts.push(rawFrame.data)
  }
  const channel = Buffer.from(channel_parts.join(''), 'hex')

  console.log('full channel', channel.length, 'bytes')
  //console.log(channel.slice(0, 100).toString())
  console.log(channel.toString('hex').slice(0, 100))

  /*
  decompressIncrementally(channel)
    .then((decompressedData) => {
      console.log('Decompressed data:', decompressedData.toString())
    })
    .catch((err) => {
      console.error('Error decompressing data:', err)
    })

  decompressBatches_v0(channel_parts.join(''))
    .then((result) => {
      console.log(result) // Output the result decompressed
      console.log('result of', result.length, 'bytes:', result.slice(0, 100))
    })
    .catch((error) => {
      console.error('An error occurred:', error)
    })
  */

  const fullChannel = channel_parts.join('')

  const decompressed = await decompressBatches_v0(fullChannel)
  const dataToDecode: Uint8Array = decompressed
  const { data: decoded, remainder } = rlp.decode(dataToDecode, true)
  console.log('DECODED:', typeof decoded)
  console.log(decoded)

  if (decoded[0] !== 1) {
    throw new Error('decoded value is not a span batch')
  }

  if (!(decoded instanceof Uint8Array)) {
    return
  }

  //console.log('timestamp since L2 genesis:', readVarint(decoded.slice(1))) // Decode the varint

  //console.log('result of', result.length, 'bytes:', result.slice(0, 100))

  let currentOffset = 1

  const timestampResult = readVarint(decoded, currentOffset)
  console.log('timestamp since L2 genesis:', timestampResult.value)
  currentOffset = timestampResult.newOffset

  const l1OriginNumberResult = readVarint(decoded, currentOffset)
  console.log('last L1 origin number:', l1OriginNumberResult.value)
  currentOffset = l1OriginNumberResult.newOffset

  const parentL2BlockHashResult = readBytesAsHex(decoded, currentOffset, 20)
  console.log('parent L2 block hash:', parentL2BlockHashResult.hex)
  currentOffset = parentL2BlockHashResult.newOffset

  const l1OriginBlockHashResult = readBytesAsHex(decoded, currentOffset, 20)
  console.log('L1 origin block hash:', l1OriginBlockHashResult.hex)
  currentOffset = l1OriginBlockHashResult.newOffset

  // Read L2 blocks number
  const l2BlocksNumberResult = readVarint(decoded, currentOffset)
  const l2BlocksNumber = l2BlocksNumberResult.value
  currentOffset = l2BlocksNumberResult.newOffset

  console.log('number of L2 blocks:', l2BlocksNumber)

  // Read L1 origin changes bitlist
  const originChangesResult = readBitlist(l2BlocksNumber, decoded, currentOffset)
  const originChangesCount = originChangesResult.bits.filter((bit) => bit).length
  currentOffset = originChangesResult.newOffset

  console.log('how many were changed by L1 origin:', originChangesCount)

  // Read total transactions
  let totalTxs = 0
  for (let i = 0; i < l2BlocksNumber; i++) {
    const txCountResult = readVarint(decoded, currentOffset)
    totalTxs += txCountResult.value
    currentOffset = txCountResult.newOffset
  }

  console.log('total txs:', totalTxs)

  // Read contract creation transactions number
  const contractCreationResult = readBitlist(totalTxs, decoded, currentOffset)
  const contractCreationTxsNumber = contractCreationResult.bits.filter((bit) => bit).length
  currentOffset = contractCreationResult.newOffset

  console.log('contract creation txs number:', contractCreationTxsNumber)

  /*
  // Read y parity bits
  const yParityBitsResult = readBitlist(totalTxs, decoded, currentOffset)
  currentOffset = yParityBitsResult.newOffset

  // Read transaction signatures, to addresses, and other fields
  const txSigs = []
  const txTos = []
  for (let i = 0; i < totalTxs; i++) {
    const sigResult = readBytesAsHex(decoded, currentOffset, 64)
    txSigs.push(sigResult.hex)
    currentOffset = sigResult.newOffset

    const toResult = readBytesAsHex(decoded, currentOffset, 20)
    txTos.push(toResult.hex)
    currentOffset = toResult.newOffset
  }

  // Verify contract creation addresses
  const contractCreationCount = txTos.filter((to) => parseInt(to, 16) === 0).length
  console.assert(contractCreationCount === contractCreationTxsNumber, 'Contract creation transaction number mismatch')

  // Remaining data processing
  const remainingData = decoded.slice(currentOffset)
  let p = 0
  let legacyTxsNumber = 0
  const txDatas = []

  for (let i = 0; i < totalTxs; i++) {
    if (remainingData[p] === 1 || remainingData[p] === 2) {
      p++
    } else {
      legacyTxsNumber++
    }
    const txData = rlp.decode(remainingData.slice(p)) as any
    txDatas.push(txData)

    const consumedLength = rlp.codec.consumeLengthPrefix(remainingData.slice(p), 0)[2] as number
    p += consumedLength
  }

  console.log('legacy txs number:', legacyTxsNumber)

  // Calculate nonce values
  const txNonces = []
  for (let i = 0; i < totalTxs; i++) {
    const nonceResult = readVarint(decoded, currentOffset)
    txNonces.push(nonceResult.value)
    currentOffset = nonceResult.newOffset
  }

  // Calculate total gas
  let totalGasLimit = 0
  for (let i = 0; i < totalTxs; i++) {
    const gasLimitResult = readVarint(decoded, currentOffset)
    totalGasLimit += gasLimitResult.value
    currentOffset = gasLimitResult.newOffset
  }

  console.log('total gas limit in txs:', totalGasLimit)

  // Calculate protected legacy transactions
  const protectedLegacyTxsResult = readBitlist(legacyTxsNumber, decoded, currentOffset)
  const protectedLegacyTxsCount = protectedLegacyTxsResult.bits.filter((bit) => bit).length
  console.log('number of EIP-155 protected legacy txs:', protectedLegacyTxsCount)
  */
}

// Example usage
const filename = 'opstack_blobs_19538908.bin' // Replace with your binary file
processFile(filename)
