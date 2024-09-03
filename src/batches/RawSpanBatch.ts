import { NestedUint8Array } from 'rlp'
import { InnerBatch } from './batch'

/*
type spanBatchPrefix struct {
	relTimestamp  uint64   // Relative timestamp of the first block
	l1OriginNum   uint64   // L1 origin number
	parentCheck   [20]byte // First 20 bytes of the first block's parent hash
	l1OriginCheck [20]byte // First 20 bytes of the last block's L1 origin hash
}

type spanBatchPayload struct {
	blockCount    uint64        // Number of L2 block in the span
	originBits    *big.Int      // Standard span-batch bitlist of blockCount bits. Each bit indicates if the L1 origin is changed at the L2 block.
	blockTxCounts []uint64      // List of transaction counts for each L2 block
	txs           *spanBatchTxs // Transactions encoded in SpanBatch specs
}
*/

// https://ethereum.stackexchange.com/questions/163066/how-is-rollup-data-verified-with-blobs
// Span batches (post-Delta hardfork)
// https://specs.optimism.io/protocol/delta/span-batches.html#span-batch-format
export class RawSpanBatch {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static decode(data: Uint8Array | NestedUint8Array): InnerBatch {
    // TODO: implement: prefix ++ payload
    // const decoded = rlp.decode(data)
    // https://github.com/ethereum-optimism/optimism/blob/375b9766bdf4678253932beae8234cc52f1f46ee/op-node/rollup/derive/span_batch.go#L49
    return {} as InnerBatch
  }
}
