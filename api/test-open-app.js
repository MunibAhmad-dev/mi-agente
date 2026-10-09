'use strict';
const path = require('path');
require('module-alias').addAlias('~', path.join(__dirname));
const ComputerControl = require('./app/clients/tools/structured/ComputerControl');
const t = new ComputerControl();
const desktopDemo = path.join(require('os').homedir(), 'Desktop', 'agente-demo');
t._call({ action: 'open_app', app: 'explorer', path: desktopDemo }).then(r => {
  console.log('RESULT:', r);
});
