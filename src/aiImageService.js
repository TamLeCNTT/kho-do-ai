import { pipeline, env } from '@huggingface/transformers';
export const MODEL='Xenova/mobileclip_s0';
export const MODEL_VERSION='2.0-q8-image-embeds-512';
class AIImageService {
  state='notLoaded'; error=null; extractor=null; listeners=new Set();
  on(fn){this.listeners.add(fn);fn(this.state);return()=>this.listeners.delete(fn)} emit(){this.listeners.forEach(x=>x(this.state,this.error))}
  async load(){if(this.state==='ready')return;if(this.state==='loading')return this.promise;this.state='loading';this.emit();this.promise=(async()=>{try{env.allowLocalModels=false;env.useBrowserCache=true;this.extractor=await pipeline('image-feature-extraction',MODEL,{device:'wasm',dtype:'q8'});this.state='ready';this.emit();}catch(e){this.error=e;this.state='error';this.emit();throw e;}})();return this.promise;}
  async embed(blob){await this.load();const url=URL.createObjectURL(blob);try{const features=await this.extractor(url);const vector=new Float32Array(features.data);if(vector.length!==512)throw new Error(`Embedding AI sai kích thước: ${vector.length} thay vì 512.`);return normalize(vector);}finally{URL.revokeObjectURL(url)}}
}
function normalize(v){let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;for(let i=0;i<v.length;i++)v[i]/=n;return v;}
export const ai=new AIImageService();
