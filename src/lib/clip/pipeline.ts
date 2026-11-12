/** SigLIP vision weights id (browser). Fine-tuned q4 served from this site. */
export const EMBED_MODEL = 'siglip2-base-q4-ft20261112'

/** D-FINE detector + 15% padded vehicle crop + taught SigLIP fingerprint. Bump when embedder/crop logic changes. */
export const EMBED_PIPELINE = 'siglip2-base-q4-ft20261112+dfine-crop15'

/** Same-origin model folder (public/models/…). Not a Hugging Face model id. */
export const SIGLIP_BROWSER_MODEL = '/models/siglip2-base-ft20261112'
export const SIGLIP_BROWSER_DTYPE = 'q4' as const

export const DFINE_BROWSER_MODEL = 'onnx-community/dfine_n_coco-ONNX'
export const DFINE_BROWSER_DTYPE = 'fp16' as const

export const CROP_PAD = 0.15
/**
 * Vehicle score cutoff after sigmoid. The onnx-community D-FINE export scores lower than the
 * PyTorch checkpoint (ustc-community/dfine-nano-coco) on the same input: a clear truck that scores
 * 0.96 in PyTorch scores about 0.36 here. At 0.5 the crop fell back to the full image on 94 of 100
 * held-out photos. At 0.2 there were no fallbacks, and the picked boxes matched the PyTorch
 * reference rule (score 0.5) at a median IoU of 0.94.
 */
export const DETECT_SCORE_THRESHOLD = 0.2

/** Long-edge cap for the working copy used by detection and cropping (stored binder photos are ~1600px). */
export const WORK_MAX_EDGE = 1600
export const MIN_VEHICLE_BOX_AREA = 0.05
export const CENTRALITY_DIVISOR = 0.71
