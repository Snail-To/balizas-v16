const test=require('node:test');
const assert=require('node:assert/strict');
function loadMap(){
  global.window={};
  const path=require.resolve('../assets/js/map');delete require.cache[path];
  global.I18n={get:k=>k,getCurrentLanguage:()=> 'en'};
  return require(path);
}
test('refreshing markers preserves the user map view after initial fit',()=>{
  const manager=loadMap();let fits=0;
  global.ol={Feature:function(props){Object.assign(this,props);},geom:{Point:function(){}},proj:{fromLonLat:c=>c}};
  manager.vectorSource={clear(){},addFeatures(){},getExtent(){return [0,0,1,1];}};
  manager.map={getView:()=>({fit(){fits++;}})};
  manager.renderBeacons([{id:'1',lat:40,lon:-3}]);
  manager.renderBeacons([{id:'2',lat:41,lon:-4}]);
  assert.equal(fits,1);
  delete global.ol;delete global.window;delete global.I18n;
});
test('location layer is excluded from beacon clicks',()=>{
  const manager=loadMap();manager.vectorLayer={};const userLayer={};
  let shown=false;manager.showBeaconPopup=()=>{shown=true;};
  manager.map={forEachFeatureAtPixel(_pixel,_callback,options){
    assert.equal(options.layerFilter(userLayer),false);
    assert.equal(options.layerFilter(manager.vectorLayer),true);
  }};
  manager.handleMapClick({pixel:[1,1]});assert.equal(shown,false);
  delete global.window;delete global.I18n;
});
test('invalid timestamps are displayed as unknown',()=>{
  const manager=loadMap();assert.equal(manager.formatTime('invalid-date'),'unknown');
  delete global.window;delete global.I18n;
});
