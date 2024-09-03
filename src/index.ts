import { JsonRpcProvider } from '@ethersproject/providers'
import fs from 'fs'
import path from 'path'
import { BatcherTransaction, extractBatcherTransaction } from './transactions/batcherTransaction'

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

testWithExampleData()
  .then((result) => {
    console.log('Batch:')
    console.log(result)
    // console.log('Frames:')
    // console.log(result['frames'])
    // console.log('Frame batches:')
    // console.log(result['frames'][0]['batches'])
    // console.log('Transactions:')
    // console.log(result['frames'][0]['batches'][0]['inner']['transactions'])
  })
  .catch((error) => {
    console.error('An error occurred:', error)
  })
