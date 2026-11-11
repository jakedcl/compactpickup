/** SigLIP vision weights id (browser). */
export const EMBED_MODEL = 'siglip2-base-q4'

/** D-FINE detector + 15% padded vehicle crop + SigLIP fingerprint. Bump when embedder/crop logic changes. */
export const EMBED_PIPELINE = 'siglip2-base-q4+dfine-crop15'

export const SIGLIP_BROWSER_MODEL = 'onnx-community/siglip2-base-patch16-224-ONNX'
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
