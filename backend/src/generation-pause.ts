import {setTimeout as delay} from 'node:timers/promises';
import {AppError} from './contracts.js';

/** Sequenced state prevents a delayed resume from overriding a newer STOP. */
export class GenerationPause {
 private sequence=-1;
 private paused=false;
 set(paused:boolean,sequence:number):void {
  if(!Number.isSafeInteger(sequence)||sequence<0)throw new AppError('INVALID_INPUT','Pause sequence must be a nonnegative integer');
  if(sequence<=this.sequence)return;
  this.sequence=sequence;this.paused=paused;
 }
 async wait(signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  while(this.paused)await delay(50,undefined,{signal});
  signal.throwIfAborted();
 }
}
