import {
  CLIPVisionModelWithProjection,
  AutoProcessor,
  RawImage,
  env,
} from "@huggingface/transformers";

export const MODEL = "plhery/mobileclip2-onnx";
export const MODEL_VERSION = "3.0-mobileclip2-s0-fp32-512";

class AIImageService {
  state = "notLoaded";
  error = null;
  model = null;
  processor = null;
  listeners = new Set();

  on(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this.state, this.error));
  }

  async load() {
    if (this.state === "ready") return;
    if (this.state === "loading") return this.promise;
    this.state = "loading";
    this.emit();
    this.promise = (async () => {
      try {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        [this.model, this.processor] = await Promise.all([
          CLIPVisionModelWithProjection.from_pretrained(MODEL, {
            device: "wasm",
            dtype: "fp32",
            model_file_name: "s0/vision_model",
          }),
          AutoProcessor.from_pretrained(MODEL, {
            config_file_name: "onnx/s0/preprocessor_config.json",
          }),
        ]);
        this.state = "ready";
        this.emit();
      } catch (error) {
        this.error = error;
        this.state = "error";
        this.emit();
        throw error;
      }
    })();
    return this.promise;
  }

  async embed(blob) {
    await this.load();
    const url = URL.createObjectURL(blob);
    try {
      const image = await RawImage.fromURL(url);
      const inputs = await this.processor([image]);
      const outputs = await this.model({ pixel_values: inputs.pixel_values });
      const vector = new Float32Array(outputs.image_embeds.data);
      if (vector.length !== 512) {
        throw new Error(
          `Embedding AI sai kích thước: ${vector.length} thay vì 512.`,
        );
      }
      return normalize(vector);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function normalize(vector) {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= magnitude;
  return vector;
}

export const ai = new AIImageService();
