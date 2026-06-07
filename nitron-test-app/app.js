import { app } from '../dist/index.js';

app.init({
  name: 'Nitron Real Test App',
  packageId: 'com.nitron.realtest',
  version: '1.0.0',
  entry: 'build/index.html',
  icon: 'src/icon.png',
  orientation: 'portrait',
  statusBar: 'visible'
});
