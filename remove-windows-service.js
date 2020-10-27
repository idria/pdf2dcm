var Service = require('node-windows').Service;
var path = require('path');

var svc = new Service({
  name:'PDF2DCM',
  description: 'PDF2DCM Web Service',
  script: path.join(__dirname, 'index.js')
});

svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ', svc.exists);
});

svc.uninstall();