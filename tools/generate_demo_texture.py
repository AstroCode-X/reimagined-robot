#!/usr/bin/env python3
"""Create an *illustrative*, procedurally generated Moon texture (NOT NASA imagery).
Dependencies for regeneration: numpy, scipy, Pillow. Shipped JPGs need no Python.
"""
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'; OUT.mkdir(exist_ok=True)
w,h=2048,1024
rng=np.random.default_rng(4471)
# Multiscale albedo and pseudo-topography; this is ART not lunar science data.
height=np.zeros((h,w),dtype=np.float32)
for sigma,weight in [(140,.35),(56,.31),(18,.24),(5,.10),(1.0,.045)]:
    a=rng.normal(size=(h,w)).astype(np.float32)
    a=gaussian_filter(a,sigma=sigma,mode='wrap')
    a=(a-a.mean())/(a.std()+.0001)
    height+=a*weight
base=141+height*24
YY,XX=np.mgrid[:h,:w]
for cx,cy,rx,ry,inten in [(1060,385,310,170,46),(760,330,170,110,38),(1220,430,160,92,33),
                            (1540,550,180,110,27),(395,560,130,70,28)]:
    ellipse=((XX-cx)/rx)**2+((YY-cy)/ry)**2
    base-=inten*np.exp(-ellipse*1.7)
# crater depressions + bright rim
for i in range(430):
    cx=int(rng.uniform(0,w));cy=int(rng.uniform(0,h));r=float(rng.uniform(2,13) if i>50 else rng.uniform(14,66))
    left=max(0,int(cx-2*r));right=min(w,int(cx+2*r)+1); top=max(0,int(cy-2*r));bottom=min(h,int(cy+2*r)+1)
    if left>=right or top>=bottom:continue
    y,x=np.ogrid[top:bottom,left:right];dx=(x-cx)/r;dy=(y-cy)/r; rr=np.sqrt(dx*dx+dy*dy)
    shape=(-14*np.exp(-(rr/.66)**4)+17*np.exp(-((rr-1)/.13)**2)-5*np.exp(-((rr-1.27)/.18)**2))
    base[top:bottom,left:right]+=shape*(.45+ rng.random()*.75)
img=np.uint8(np.clip(base,31,235))
# near grayscale with subtle warm grey tint
rgb=np.stack([img,np.uint8(np.clip(img*.98+2,0,255)),np.uint8(np.clip(img*.96+2,0,255))],axis=-1)
Image.fromarray(rgb,'RGB').save(OUT/'moon_illustrative.jpg',quality=90,optimize=True)
# Independent stylized polar terrain (avoids equirectangular polar stretch).
s=1100
py,px=np.mgrid[:s,:s]
rr=np.sqrt(((px-s/2)/(s/2-22))**2+((py-s/2)/(s/2-22))**2)
rng=np.random.default_rng(1846)
terrain=np.full((s,s),125,dtype=np.float32)
for sigma,weight in [(105,23),(43,16),(11,10),(2,5)]:
  n=rng.normal(size=(s,s)).astype(np.float32);n=gaussian_filter(n,sigma);n=(n-n.mean())/(n.std()+.0001);terrain+=n*weight
for j in range(280):
  x=int(rng.integers(25,s-25));y=int(rng.integers(25,s-25))
  rad=float(rng.uniform(4,21) if j>35 else rng.uniform(23,92))
  x0=max(0,int(x-2*rad));x1=min(s,int(x+2*rad));y0=max(0,int(y-2*rad));y1=min(s,int(y+2*rad))
  if not (x1>x0 and y1>y0):continue
  yy,xx=np.ogrid[y0:y1,x0:x1]
  cr=np.hypot((xx-x)/rad,(yy-y)/rad)
  terrain[y0:y1,x0:x1]+=(-13*np.exp(-(cr/.77)**4)+17*np.exp(-((cr-1)/.13)**2)-8*np.exp(-((cr-1.3)/.23)**2))
terrain-=np.maximum(0,rr-.5)*11
polar=np.uint8(np.clip(terrain,30,236))
prgb=np.stack([polar,np.uint8(np.clip(polar*.98+2,0,255)),np.uint8(np.clip(polar*.96+2,0,255))],axis=-1)
prgb[rr>1.04]=np.array([8,15,24],dtype=np.uint8)
Image.fromarray(prgb,'RGB').save(OUT/'south_pole_illustrative.jpg',quality=90,optimize=True)
print('Illustrative offline Moon assets created (NOT NASA measurements)')
