import { JsonRpcProvider } from '@ethersproject/providers'
import fs from 'fs'
import path from 'path'
import { BatcherTransaction, extractBatcherTransaction } from './transactions/batcherTransaction'

/**
 * Convert a binary file to a text file where text is the hexadecimal representation.
 * @param inputFilePath Path to the binary input file.
 * @param outputFilePath Path to the output text file.
 */
function convertBinaryToHex(inputFilePath: string, outputFilePath: string): void {
  // Read the binary file into a Buffer
  const binaryData = fs.readFileSync(inputFilePath)

  // Convert the binary data to a hexadecimal string
  const hexString = binaryData.toString('hex')

  // TODO: add leading 0x

  // Write the hexadecimal string to the output file
  fs.writeFileSync(outputFilePath, hexString)

  console.log(`Successfully converted ${inputFilePath} to hexadecimal format and saved as ${outputFilePath}`)
}

export const testWithExampleData = async (
  filePath: string = 'example-data/calldata.txt'
): Promise<BatcherTransaction> => {
  console.log('testing with', filePath)
  const examplePath = path.join(path.dirname(__dirname), filePath)
  const exampleCallData = fs.readFileSync(examplePath).toString()
  return await extractBatcherTransaction(exampleCallData)
}

export const decodeBatcherTransaction = async (txHash: string, providerUrl: string): Promise<BatcherTransaction> => {
  const provider = new JsonRpcProvider(providerUrl)
  const tx = await provider.getTransaction(txHash)
  if (!tx.data) throw new Error('Transaction is missing calldata')
  return await extractBatcherTransaction(tx.data)
}

export const decodeBatcherTransactionCalldata = async (calldata: string): Promise<BatcherTransaction> => {
  return await extractBatcherTransaction(calldata)
}

//convertBinaryToHex('opstack_blobs_19538908.bin', 'opstack_blobs_19538908.txt')
//
// testWithExampleData()
//   .then((result) => {
//     console.log('Batch:')
//     console.log(result)
//     // console.log('Frames:')
//     // console.log(result['frames'])
//     // console.log('Frame batches:')
//     // console.log(result['frames'][0]['batches'])
//     // console.log('Transactions:')
//     // console.log(result['frames'][0]['batches'][0]['inner']['transactions'])
//   })
//   .catch((error) => {
//     console.error('An error occurred:', error)
//   })

/*
testWithExampleData(
  'example-data/calldata_tx_0xa47e5c4c1b03e60c878612737ff777484d21da0f0740c42d0343aa73d92764c6-pre-delta'
)
  .then((result) => {
    console.log(result) // Output the result
    //decodeOptimismBlob('opstack_blobs_19538908.txt')
    //decodeOptimismBlob()
  })
  .catch((error) => {
    console.error('An error occurred:', error)
  })
*/

testWithExampleData('opstack_blobs_19538908.txt')
  .then((result) => {
    console.log(result) // Output the result
    //decodeOptimismBlob('opstack_blobs_19538908.txt')
    //decodeOptimismBlob()
  })
  .catch((error) => {
    console.error('An error occurred:', error)
  })
