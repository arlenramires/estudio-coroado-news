import fs from 'node:fs';
import assert from 'node:assert/strict';

// Guard against accidentally publishing the private editor or silently
// removing the browser, audio, offline and package acceptance tests.
const dir='.github/workflows';
const files=fs.readdirSync(dir).filter(name=>/\.ya?ml$/i.test(name));
assert(files.length>0,'No CI workflow exists');
for(const name of files){
  const yaml=fs.readFileSync(dir+'/'+name,'utf8');
  assert(!/actions\/(?:deploy-pages|configure-pages|upload-pages-artifact)@|pages:\s*write|github-pages|gh-pages|peaceiris\/actions-gh-pages/i.test(yaml),
    'Public GitHub Pages deployment detected: '+name);
}
const ci=fs.readFileSync(dir+'/test.yml','utf8');
const required=[
 'node scripts/check-editor.mjs',
 'node scripts/smoke.mjs',
 'node scripts/mobile-smoke.mjs',
 'node scripts/video-smoke.mjs',
 'STUDIO_TEST_MOBILE=1 node scripts/video-smoke.mjs',
 'node scripts/offline-smoke.mjs',
 'node scripts/build-offline.mjs',
 'node scripts/package-private.mjs',
 'node scripts/check-delivery.mjs',
 'node scripts/package-smoke.mjs',
 'actions/upload-artifact@v4',
 'Estudio-Coroado-Privado-PC-Android'
];
for(const step of required)assert(ci.includes(step),'Missing CI acceptance stage: '+step);
assert(/permissions:\s*\n\s*contents:\s*read/.test(ci),'CI must have read-only contents permission');
assert(!/\bworkflow_dispatch\b[\s\S]*?deploy-pages/.test(ci),'No Pages deployment allowed');
console.log('CI guard passed: browser, audio, 22 assets, offline, private package and no Pages deployment.');
