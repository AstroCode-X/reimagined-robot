/* Standalone, offline-capable GPU Moon viewer. Texture is illustrative, not NASA imagery. */
(function(){
'use strict';
const vert=`attribute vec2 a_pos; varying vec2 v_uv; void main(){v_uv=(a_pos+1.0)*0.5;gl_Position=vec4(a_pos,0.0,1.0);}`;
const frag=`precision highp float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_aspect;
uniform float u_yaw;
uniform float u_pitch;
uniform vec2 u_target;
uniform float u_hasTexture;
const float PI=3.141592653589793;
void main(){
  vec2 p=(v_uv*2.0-1.0)*vec2(max(1.0,u_aspect),max(1.0,1.0/u_aspect))*1.08;
  float d=dot(p,p);
  if(d>1.0){
    vec2 q=floor(v_uv*vec2(218.0,157.0));
    float star=step(0.9985,fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453));
    gl_FragColor=vec4(vec3(0.012,0.025,0.045)+star*0.27,1.0); return;
  }
  vec3 n=vec3(p.x,p.y,sqrt(max(0.0,1.0-d)));
  float cp=cos(u_pitch),sp=sin(u_pitch),cy=cos(u_yaw),sy=sin(u_yaw);
  vec3 np=vec3(n.x,n.y*cp+n.z*sp,-n.y*sp+n.z*cp);
  vec3 world=vec3(np.x*cy+np.z*sy,np.y,-np.x*sy+np.z*cy);
  float lon=atan(world.x,world.z);
  float lat=asin(clamp(world.y,-1.0,1.0));
  vec3 albedo= u_hasTexture>0.5 ? texture2D(u_texture,vec2(fract(0.5+lon/(2.0*PI)),0.5+lat/PI)).rgb : vec3(.52);
  float light=max(dot(n,normalize(vec3(-0.38,0.3,0.88))),0.0);
  vec3 rgb=albedo*(0.19+0.95*light);
  float rimglow=pow(1.0-max(n.z,0.0),3.0);
  rgb+=vec3(.03,.08,.12)*rimglow;
  vec3 target=vec3(cos(u_target.y)*sin(u_target.x),sin(u_target.y),cos(u_target.y)*cos(u_target.x));
  float delta=dot(world,target);
  float spot=smoothstep(0.9984,0.9998,delta);
  rgb=mix(rgb,vec3(0.01,.95,.90),spot*.85);
  gl_FragColor=vec4(rgb,1.0);
}`;
function makeShader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
class MoonGlobe{
 constructor(canvas,image){this.canvas=canvas;this.image=image;this.yaw=0;this.pitch=-0.25;this.target=[0,-89.9];this.dragging=false;this.gl=null;this.ctx=null;this._raf=0;this._last=0;this.hadWebGL=false;this.softwareTexture=null;this.softwareCanvas=null;
   try{const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false});if(!gl)throw Error('WebGL not supported');this.gl=gl;
      const program=gl.createProgram();gl.attachShader(program,makeShader(gl,gl.VERTEX_SHADER,vert));gl.attachShader(program,makeShader(gl,gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);this.program=program;this.loc={};for(const name of ['u_aspect','u_yaw','u_pitch','u_target','u_texture','u_hasTexture'])this.loc[name]=gl.getUniformLocation(program,name);
      const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const attr=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
      const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([125,130,135,255]));this.tex=tex;this.textureUploaded=false;this.hadWebGL=true;
   }catch(e){console.warn('WebGL fallback',e);this.ctx=this.gl?null:canvas.getContext('2d');this.error=e;}
   if(this.image.complete && this.image.naturalWidth)this.setImage(); else this.image.addEventListener('load',()=>this.setImage());
   canvas.addEventListener('pointerdown',e=>{this.dragging=true;this.dragStart=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
   canvas.addEventListener('pointermove',e=>{if(!this.dragging)return;const dx=e.clientX-this.dragStart[0],dy=e.clientY-this.dragStart[1];this.dragStart=[e.clientX,e.clientY];this.yaw-=dx*.008;this.pitch=Math.max(-1.53,Math.min(1.53,this.pitch+dy*.008));this.render();});
   canvas.addEventListener('pointerup',()=>this.dragging=false);canvas.addEventListener('pointercancel',()=>this.dragging=false);
   this._resize=new ResizeObserver(()=>this.resize());this._resize.observe(canvas);this.resize();this.animate();
 }
 setImage(){if(this.gl){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);gl.generateMipmap(gl.TEXTURE_2D);this.textureUploaded=true;}if(this.ctx){const src=document.createElement('canvas');src.width=this.image.naturalWidth;src.height=this.image.naturalHeight;const sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(this.image,0,0);this.softwareTexture=sc.getImageData(0,0,src.width,src.height).data;}this.render();}
 focus(lat,lon){this.pitch=Math.max(-1.53,Math.min(1.53,Number(lat)*Math.PI/180));this.yaw=Number(lon)*Math.PI/180;this.target=[this.yaw,this.pitch];this.render();}
 resize(){const rect=this.canvas.getBoundingClientRect();const w=Math.floor(rect.width*Math.min(devicePixelRatio||1,2)),h=Math.floor(rect.height*Math.min(devicePixelRatio||1,2));if(w<3||h<3)return;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}if(this.gl)this.gl.viewport(0,0,w,h);this.render();}
 render(){const canvas=this.canvas;if(!canvas.width||!canvas.height)return;if(this.gl){const gl=this.gl;gl.useProgram(this.program);gl.uniform1f(this.loc.u_aspect,canvas.width/canvas.height);gl.uniform1f(this.loc.u_yaw,this.yaw);gl.uniform1f(this.loc.u_pitch,this.pitch);gl.uniform2f(this.loc.u_target,...this.target);gl.uniform1f(this.loc.u_hasTexture,this.textureUploaded?1:0);gl.uniform1i(this.loc.u_texture,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}else if(this.ctx){
   const ctx=this.ctx,w=canvas.width,h=canvas.height;
   ctx.fillStyle='#030813';ctx.fillRect(0,0,w,h);
   if(!this.softwareTexture){const r=Math.min(w,h)*.44;ctx.fillStyle='#9fa1a8';ctx.beginPath();ctx.arc(w/2,h/2,r,0,Math.PI*2);ctx.fill();return;}
   // CPU spherical rendering when WebGL is prohibited/absent. Mouse rotation remains functional.
   const size=Math.min(360,Math.min(w,h));if(size<5)return;
   if(!this.softwareCanvas||this.softwareCanvas.width!==size){this.softwareCanvas=document.createElement('canvas');this.softwareCanvas.width=this.softwareCanvas.height=size;}
   const soft=this.softwareCanvas.getContext('2d');const frame=soft.createImageData(size,size);const out=frame.data,source=this.softwareTexture,tw=this.image.naturalWidth,th=this.image.naturalHeight;
   const yaw=this.yaw,pitch=this.pitch,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
   const targetLon=this.target[0],targetLat=this.target[1];
   const tx=Math.cos(targetLat)*Math.sin(targetLon),ty=Math.sin(targetLat),tz=Math.cos(targetLat)*Math.cos(targetLon);
   const radius=size*.48;
   for(let j=0;j<size;j++)for(let i=0;i<size;i++){
     const pos=(j*size+i)*4,x=(i-size/2)/radius,y=(size/2-j)/radius,rr=x*x+y*y;
     if(rr>1)continue;
     const nz=Math.sqrt(1-rr),py=y*cp+nz*sp,pz=-y*sp+nz*cp;
     const wx=x*cy+pz*sy,wy=py,wz=-x*sy+pz*cy;
     const lon=Math.atan2(wx,wz),lat=Math.asin(Math.max(-1,Math.min(1,wy)));
     const u=(.5+lon/(2*Math.PI)+1)%1,v=.5-lat/Math.PI;
     const sx=Math.min(tw-1,Math.floor(u*tw)),sj=Math.min(th-1,Math.floor(v*th)),si=(sj*tw+sx)*4;
     const lit=Math.max(0,(x*(-.38)+y*.3+nz*.88)/1.003),shade=.18+.95*lit;
     const mark=wx*tx+wy*ty+wz*tz>.9995;
     out[pos]=mark?0:Math.min(255,source[si]*shade);
     out[pos+1]=mark?237:Math.min(255,source[si+1]*shade);
     out[pos+2]=mark?226:Math.min(255,source[si+2]*shade);
     out[pos+3]=255;
   }
   soft.putImageData(frame,0,0);
   const d=Math.min(w,h)*.92;ctx.drawImage(this.softwareCanvas,w/2-d/2,h/2-d/2,d,d);
 }}

 animate(ts){if(!this.dragging && ts-this._last>60){this.yaw+=.001;this.render();this._last=ts;}this._raf=requestAnimationFrame(t=>this.animate(t));}
}
window.MoonGlobe=MoonGlobe;
})();
