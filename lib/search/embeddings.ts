/**
 * Local embedding model — `@huggingface/transformers` running a small
 * on-device ONNX model, so the vector index never requires an API key or a
 * network call at query time. The model is downloaded once from the Hugging
 * Face hub on first use and cached under `node_modules/`; every run after
 * that is fully offline.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/** Must match `EMBEDDING_DIMENSIONS` in `lib/search/store.ts`. */
export const EMBEDDING_DIMENSIONS = 384

/** A function from texts to embeddings — the shape the indexer/search inject. */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID) as Promise<FeatureExtractionPipeline>
  }
  return extractorPromise
}

/** Embed a batch of texts with the local model (mean-pooled, normalized). */
export const embed: Embedder = async (texts) => {
  const extractor = await getExtractor()
  const vectors: Float32Array[] = []
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true })
    vectors.push(Float32Array.from(output.data as Float32Array))
  }
  return vectors
}
