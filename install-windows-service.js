var Service = require('node-windows').Service;
var path = require('path');

var svc = new Service({
  name:'PDF2DCM',
  description: 'PDF2DCM Web Service',
  script: path.join(__dirname, 'index.js')
});

svc.on('install',function(){
  svc.start();
});

svc.install();