#!/usr/bin/env python3
"""Original procedural audio, no third-party recordings or licenses required."""
import math,random,struct,wave
from pathlib import Path
random.seed(17);out=Path(__file__).resolve().parents[1]/'ios/Braive/Audio';out.mkdir(exist_ok=True)
rate=24000
for name,duration in [('whoosh',0.65),('forest',12),('wind',12),('room',12),('crowd',12),('piano',16)]:
 samples=[];filtered=0
 for i in range(int(duration*rate)):
  t=i/rate;filtered=0.985*filtered+0.015*random.uniform(-1,1)
  v=filtered*1.4
  if name=='piano':
   notes=[261.63,329.63,392,523.25,293.66,349.23,440,523.25];beat=int(t/2);age=t%2;f=notes[beat%len(notes)]
   v=sum(math.sin(2*math.pi*f*h*t)*math.exp(-age*(1.4+h*.5))/h**2 for h in range(1,5))*.16
  elif name=='forest':v+=math.sin(2*math.pi*(2200+200*math.sin(t*2))*t)*max(0,math.sin(t*1.7))**35*.025
  elif name=='room':v*=.15
  elif name=='crowd':v+=sum(math.sin(2*math.pi*f*t)*math.sin(t*.9+f) for f in [120,173,231,310])*.018
  elif name=='whoosh':v*=math.sin(math.pi*t/duration)*4
  # Smooth loop edges, avoid clicks.
  envelope=min(1,t/.08,(duration-t)/.08);samples.append(int(max(-1,min(1,v*envelope))*32767))
 with wave.open(str(out/(name+'.wav')),'wb') as w:w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(struct.pack('<'+'h'*len(samples),*samples))
