import { BigNumber } from '@ethersproject/bignumber'
import { keccak } from 'ethereumjs-util'
import rlp, { NestedUint8Array } from 'rlp'
import { OpStackTransactionSerialized } from 'viem/chains'
import { parseTransaction } from 'viem/op-stack'
import type { InnerBatch } from './batch'

// https://github.com/ethereum-optimism/optimism/blob/375b9766bdf4678253932beae8234cc52f1f46ee/op-node/rollup/derive/singular_batch.go#L22
// https://specs.optimism.io/protocol/derivation.html#batch-submission-wire-format
// Singular batches (pre-Delta hardfork)
// https://specs.optimism.io/protocol/derivation.html#batch-format
export class SingularBatch {
  static decode(data: Uint8Array | NestedUint8Array): InnerBatch {
    const decoded = rlp.decode(data)
    const transactionList = (decoded[4] as NestedUint8Array).map(
      (tx) => `0x${Buffer.from(tx as Uint8Array).toString('hex')}`
    )
    return {
      parentHash: `0x${Buffer.from(decoded[0] as Uint8Array).toString('hex')}`,
      epochNum: BigNumber.from(decoded[1]).toNumber(),
      epochHash: `0x${Buffer.from(decoded[2] as Uint8Array).toString('hex')}`,
      timestamp: BigNumber.from(decoded[3]).toNumber(),
      transactions: transactionList.map((txData) => {
        const transactionBuffer = Buffer.from(txData.slice(2), 'hex')
        const transactionHash: `0x${string}` = `0x${keccak(transactionBuffer).toString('hex')}`
        return {
          ...parseTransaction(txData as OpStackTransactionSerialized),
          hash: transactionHash
        }
      })
    }
  }
}
