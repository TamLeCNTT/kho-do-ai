import { pipeline, env, RawImage } from '@huggingface/transformers';
export const MODEL='onnx-community/mobilenetv4_conv_small.e2400_r224_in1k';
export const MODEL_VERSION='1.0-q8-logits';
class AIImageService {
  state='notLoaded'; error=null; extractor=null; listeners=new Set();
  on(fn){this.listeners.add(fn);fn(this.state);return()=>this.listeners.delete(fn)} emit(){this.listeners.forEach(x=>x(this.state,this.error))}
  async load(){if(this.state==='ready')return;if(this.state==='loading')return this.promise;this.state='loading';this.emit();this.promise=(async()=>{try{env.allowLocalModels=false;env.useBrowserCache=true;this.extractor=await pipeline('image-classification',MODEL,{device:'wasm',dtype:'q8'});this.state='ready';this.emit();}catch(e){this.error=e;this.state='error';this.emit();throw e;}})();return this.promise;}
  async embed(blob){await this.load();const url=URL.createObjectURL(blob);try{const img=await RawImage.fromURL(url);const {pixel_values}=await this.extractor.processor(img);const out=await this.extractor.model({pixel_values});const tensor=out.logits||Object.values(out)[0];return normalize(new Float32Array(tensor.data));}finally{URL.revokeObjectURL(url)}}
}
function normalize(v){let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;for(let i=0;i<v.length;i++)v[i]/=n;return v;}
export const ai=new AIImageService();
