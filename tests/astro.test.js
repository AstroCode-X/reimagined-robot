const assert = require('node:assert/strict');
const A = require('../assets/astro.js');
function close(actual, expected, err=1e-7){ assert.ok(Math.abs(actual-expected)<err,`${actual} expected ~${expected}`); }
// Subpoint directly overhead, another point 90deg away, then antipodal.
close(A.directionFromSubpoint(0,0,0,0).el,90);
close(A.directionFromSubpoint(0,0,0,90).el,0);
close(A.directionFromSubpoint(0,0,0,180).el,-90);
close(A.directionFromSubpoint(0,0,0,90).az,90);
const site={id:'test', lat:-89, lon:0};
const dates=A.hourlyTimes('2026-11-14T00:00:00Z',24);
assert.equal(dates.length,25);
const simulated=A.analyze(site,dates,null);
assert.equal(simulated.complete,true);
assert.equal(simulated.total,24);
assert.ok(simulated.sunny>=0&&simulated.sunny<=24);
assert.ok(simulated.contact>=0&&simulated.contact<=24);
const fake={source:'NASA/JPL Horizons',step_hours:1,sites:{test:{
  sun:dates.map(d=>({time:d.toISOString(),az:30,el:2})),
  earth:dates.map((d,i)=>({time:d.toISOString(),az:45,el:i>=12?-2:3}))
}}};
A.validateEphemeris(fake);
const a=A.analyze(site,dates,fake);
assert.equal(a.sunny,24);assert.equal(a.contact,12);assert.equal(a.both,12);
assert.equal(a.windows.length,1);
assert.equal((a.windows[0][1]-a.windows[0][0])/A.HOUR,12);
fake.sites.test.earth[2].el=Infinity;
assert.throws(()=>A.validateEphemeris(fake));
console.log('All JS geometry and dataset checks passed.');
