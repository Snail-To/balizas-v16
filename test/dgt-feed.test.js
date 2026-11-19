const test = require('node:test');
const assert = require('node:assert/strict');
const mapHandler = require('../api/dgt-feed');
const statsHandler = require('../api/dgt-stats');
const peaksHandler = require('../api/dgt-peaks');
function recorder() {
  return { headers: {}, status(code) { this.statusCode=code; return this; },
    setHeader(k,v) { this.headers[k.toLowerCase()]=v; }, json(v) { this.body=v; } };
}
test('map reads the shared cloud snapshot rather than requesting DGT', async () => {
  const original=global.fetch; let requested;
  const beacons=[{id:'v16-1',lat:40.4,lon:-3.7}];
  global.fetch=async url=>{requested=new URL(url); return Response.json({beacons,updatedAt:new Date().toISOString()});};
  const response=recorder();
  try { await mapHandler({method:'GET',url:'/api/dgt-feed'},response); }
  finally { global.fetch=original; }
  assert.equal(requested.hostname,'qkdegdyoupforiuolnon.supabase.co');
  assert.equal(requested.searchParams.get('view'),'map');
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,beacons);
  assert.match(response.headers['cache-control'],/s-maxage=60/);
  assert.equal(response.headers['x-beacons-stale'],'false');
});
test('stale snapshots are explicitly marked',async()=>{
  const original=global.fetch;
  global.fetch=async()=>Response.json({beacons:[],updatedAt:'2020-01-01T00:00:00Z'});
  const response=recorder();
  try {await mapHandler({method:'GET',url:'/'},response);}finally{global.fetch=original;}
  assert.equal(response.headers['x-beacons-stale'],'true');
});
test('statistics forwards the requested date',async()=>{
  const original=global.fetch;let day;
  global.fetch=async url=>{day=new URL(url).searchParams.get('day');return Response.json({hours:[]});};
  const response=recorder();
  try {await statsHandler({method:'GET',url:'/api/dgt-stats?day=2026-11-18'},response);}finally{global.fetch=original;}
  assert.equal(day,'2026-11-18');assert.equal(response.statusCode,200);
});
test('the peak summary uses a fixed cloud view regardless of query parameters', async () => {
  const original = global.fetch;
  const days = [{ day: '2026-11-19', total: null, peak: null, hours: [], activePeak: null, activeAt: null }];
  global.fetch = async url => {
    assert.equal(new URL(url).search, '?view=peaks');
    return Response.json({ days });
  };
  const response = recorder();
  try { await peaksHandler({ method: 'GET', url: '/api/dgt-peaks?view=map&day=invalid' }, response); }
  finally { global.fetch = original; }
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.days, days);
});
test('invalid calendar dates are rejected before network access',async()=>{
  for(const day of ['2026-99-99','2026-02-31','not-a-date']){
    const response=recorder();await statsHandler({method:'GET',url:'/?day='+day},response);
    assert.equal(response.statusCode,400);
  }
});
test('failures are not cached or represented as an empty map',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('',{status:503});
  const response=recorder();
  try {await mapHandler({method:'GET',url:'/'},response);}finally{global.fetch=original;}
  assert.equal(response.statusCode,503);assert.equal(response.headers['cache-control'],'no-store');
  assert.ok(response.body.error);
});
test('write methods are not accepted',async()=>{
  const response=recorder();await mapHandler({method:'POST'},response);
  assert.equal(response.statusCode,405);assert.equal(response.headers.allow,'GET');
});
