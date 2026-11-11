/** SigLIP vision weights id (browser). */
export const EMBED_MODEL = 'siglip2-base-q4'

/** D-FINE detector + 15% padded vehicle crop + SigLIP fingerprint. Bump when embedder/crop logic changes. */
export const EMBED_PIPELINE = 'siglip2-base-q4+dfine-crop15'

export const SIGLIP_BROWSER_MODEL = 'onnx-community/siglip2-base-patch16-224-ONNX'
export const SIGLIP_BROWSER_DTYPE = 'q4' as const

export const DFINE_BROWSER_MODEL = 'onnx-community/dfine_n_coco-ONNX'
export const DFINE_BROWSER_DTYPE = 'fp16' as const

export const CROP_PAD = 0.15
export const DETECT_SCORE_THRESHOLD = 0.5
export const MIN_VEHICLE_BOX_AREA = 0.05
export const CENTRALITY_DIVISOR = 0.71
