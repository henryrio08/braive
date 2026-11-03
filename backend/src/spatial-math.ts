export type Vec3=[number,number,number];
export type Bounds={min:Vec3,max:Vec3};
export const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const multiply=(a:number[],b:number[])=>Array.from({length:16},(_,i)=>{
 const row=i%4,col=Math.floor(i/4);return [0,1,2,3].reduce((n,k)=>n+a[k*4+row]*b[col*4+k],0);
});
export const point=(m:number[],p:number[]):Vec3=>[0,1,2].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]) as Vec3;
export function transform(position:number[],rotation:number[],scale:number[]){
 const [x,y,z]=rotation,cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 const rx=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1],ry=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1],rz=[cz,sz,0,0,-sz,cz,0,0,0,0,1,0,0,0,0,1];
 // SceneKit applies roll, then yaw, then pitch to column vectors.
 const m=multiply(multiply(rx,ry),rz);
 for(let col=0;col<3;col++)for(let row=0;row<3;row++)m[col*4+row]*=scale[col];
 m[12]=position[0];m[13]=position[1];m[14]=position[2];return m;
}
export function inverse(m:number[]){
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
 const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('Singular spatial frame');
 const out=[(e*i-f*h)/det,(f*g-d*i)/det,(d*h-e*g)/det,0,(c*h-b*i)/det,(a*i-c*g)/det,(b*g-a*h)/det,0,(b*f-c*e)/det,(c*d-a*f)/det,(a*e-b*d)/det,0,0,0,0,1];
 const t=point(out,[-m[12],-m[13],-m[14]]);out[12]=t[0];out[13]=t[1];out[14]=t[2];return out;
}
export function transformedBounds(bounds:Bounds,m:number[]):Bounds {
 const values:Vec3[]=[];
 for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])values.push(point(m,[x,y,z]));
 return {min:[0,1,2].map(i=>Math.min(...values.map(p=>p[i]))) as Vec3,max:[0,1,2].map(i=>Math.max(...values.map(p=>p[i]))) as Vec3};
}
export const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const contains=(outer:Bounds,inner:Bounds,tolerance=0)=>[0,1,2].every(i=>inner.min[i]>=outer.min[i]-tolerance&&inner.max[i]<=outer.max[i]+tolerance);
