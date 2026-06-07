// Inspect APK contents for sanity check
const JSZip = require('jszip');
const fs = require('fs');

async function inspect() {
  const data = fs.readFileSync('dist/app.apk');
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).filter(f => !zip.files[f].dir).sort();
  
  console.log(`\n=== APK Sanity Check (${files.length} files) ===\n`);
  
  let hasClassesDex = false;
  let hasManifest = false;
  let hasResourcesArsc = false;
  let hasAssets = false;
  let hasMipmap = false;
  let hasAdaptive = false;
  
  for (const f of files) {
    const content = await zip.files[f].async('nodebuffer');
    const sizeKB = (content.length / 1024).toFixed(1);
    console.log(`  ${f} (${sizeKB}KB)`);
    
    if (f === 'classes.dex') hasClassesDex = true;
    if (f === 'AndroidManifest.xml') hasManifest = true;
    if (f === 'resources.arsc') hasResourcesArsc = true;
    if (f.startsWith('assets/')) hasAssets = true;
    if (f.includes('mipmap-') && f.endsWith('.png')) hasMipmap = true;
    if (f.includes('mipmap-anydpi-v26')) hasAdaptive = true;
  }
  
  console.log('\n=== Validation ===\n');
  console.log(`  classes.dex:      ${hasClassesDex ? '✅' : '❌ MISSING'}`);
  console.log(`  AndroidManifest:  ${hasManifest ? '✅' : '❌ MISSING'}`);
  console.log(`  resources.arsc:   ${hasResourcesArsc ? '✅' : '❌ MISSING'}`);
  console.log(`  assets/:          ${hasAssets ? '✅' : '❌ MISSING'}`);
  console.log(`  mipmap PNGs:      ${hasMipmap ? '✅' : '❌ MISSING'}`);
  console.log(`  adaptive v26:     ${hasAdaptive ? '✅' : '⚠️  MISSING (legacy only)'}`);
  console.log(`  Total APK size:   ${(data.length / 1024).toFixed(1)}KB`);
  console.log();
}

inspect().catch(console.error);
