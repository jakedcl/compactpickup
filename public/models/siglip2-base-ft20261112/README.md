# Taught SigLIP2-base vision weights (browser)

Small files in this folder (`config.json`, `preprocessor_config.json`) come from the public `onnx-community/siglip2-base-patch16-224-ONNX` repo on Hugging Face. The taught vision weights are **not** on Hugging Face.

| File | Source |
|---|---|
| `config.json`, `preprocessor_config.json` | Hugging Face community ONNX repo (unchanged architecture) |
| `onnx/vision_model_q4.onnx` | Fine-tuned MatMulNBits q4 (~63 MB). Same-origin only. |

## Install `vision_model_q4.onnx`

The ONNX file is gitignored. Before production or preview deploy:

```sh
# Local copy (path Jake provides after training)
SIGLIP_VISION_ONNX_PATH=/path/to/vision_model_q4.onnx npm run install:siglip-vision

# Or HTTPS (e.g. short-lived R2 presign on Vercel)
SIGLIP_VISION_ONNX_URL='https://…' npm run install:siglip-vision
```

`npm run build` runs this script automatically via `prebuild`. Expected sha256:

`220d474a3a1261059c8f66b133e04cb76666ecadd0dc6e225ca24a735366e91b`

Visitors load the weights from `https://compactpickup.com/models/siglip2-base-ft20261112/onnx/vision_model_q4.onnx` (browser cache on). D-FINE still loads from Hugging Face.
