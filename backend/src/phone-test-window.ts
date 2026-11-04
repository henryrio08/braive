// A paired phone action renews the existing approval window. Idle expiry pauses
// provider access; it must not make the local app server disappear.
export class PhoneTestWindow {
 private expiresAt=0;
 constructor(private authorizedAtLaunch:boolean,private seconds:number,private now=Date.now){
  if(!Number.isFinite(seconds)||seconds<=0)throw Error('A positive phone test activity window is required');
 }
 get active(){return this.authorizedAtLaunch && this.now()<this.expiresAt;}
 get remainingMilliseconds(){return this.active?Math.max(0,this.expiresAt-this.now()):0;}
 get remainingSeconds(){return Math.ceil(this.remainingMilliseconds/1000);}
 renew(method:string,path:string){
  const action=['/v1/session-plans','/v1/scene-revisions','/v1/dialogue','/v1/feedback','/v1/adaptations','/v1/world-edit-plans'].includes(path)
   || /^\/v1\/jobs\/[^/]+\/validation$/.test(path);
  if(!this.authorizedAtLaunch || method!=='POST' || !action)return false;
  this.expiresAt=this.now()+this.seconds*1000;
  return true;
 }
}
