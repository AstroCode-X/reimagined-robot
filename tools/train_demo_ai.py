#!/usr/bin/env python3
"""Train an actual logistic regression on SYNTHETIC mission scenarios.
The labels are fabricated by a documented illustrative scoring formula, not
NASA ground truth. The score is not a safety probability or ice probability.
Requires numpy and scikit-learn only if regenerating; inference runs offline in JS.
"""
from pathlib import Path
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

rng=np.random.default_rng(2026)
N=12000
slope=rng.uniform(0,22,N)
sun=rng.uniform(0,100,N)
earth=rng.uniform(0,100,N)
thermal=rng.uniform(30,180,N)
features=np.column_stack([slope,sun,earth,thermal])
# Fictional CLPS teaching labels: lower slope, more Sun, more Earth visibility,
# less severe cold -> higher chance of positive synthetic label.
linear=2.8 - .39*slope + .032*(sun-50)+.027*(earth-50)+.008*(thermal-90)
labels=(linear+rng.normal(0,1.1,N)>0).astype(int)
scaler=StandardScaler().fit(features)
clf=LogisticRegression(max_iter=500).fit(scaler.transform(features),labels)
model={
  'model_type':'LogisticRegression', 'version':'synthetic_demo_v1',
  'training_data':'Synthetic random scenarios; labels derived from illustrative slope/solar/earth/temperature decision rule with Gaussian noise; not real NASA outcomes.',
  'features':['slope_deg','sun_above_horizon_pct','earth_above_horizon_pct','minimum_thermal_k'],
  'means':scaler.mean_.round(9).tolist(),'scales':scaler.scale_.round(9).tolist(),
  'weights':clf.coef_[0].round(9).tolist(),'bias':float(round(clf.intercept_[0],9)),
  'interpretation':'Demo ML score, NOT landing safety probability and NOT ice detection.'
}
out=Path(__file__).resolve().parents[1]/'assets'
(out/'ml-model.json').write_text(json.dumps(model,indent=2,ensure_ascii=False),encoding='utf-8')
(out/'ml-model.js').write_text('window.DANCING_ML_MODEL = '+json.dumps(model,separators=(',',':'))+';\n',encoding='utf-8')
print('Training data synthetic:',N,'samples, positive %:',round(float(labels.mean()*100),1))
print('Model saved:',out/'ml-model.json')
