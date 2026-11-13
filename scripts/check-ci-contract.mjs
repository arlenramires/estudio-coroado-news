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
 'node scripts/check-manifest-private.mjs',
 'node scripts/check-sw-privacy.mjs',
 'node scripts/check-sw-lifecycle.mjs',
 'node scripts/check-private-launchers.mjs',
 'node scripts/media-ready-smoke.mjs',
 'node scripts/test-converter-mp4.mjs',
 'node scripts/smoke.mjs',
 'node scripts/mobile-smoke.mjs',
 'node scripts/video-smoke.mjs',
 'STUDIO_TEST_MOBILE=1 node scripts/video-smoke.mjs',
 'STUDIO_TEST_CODEC_FALLBACK=1 node scripts/video-smoke.mjs',
 'STUDIO_TEST_CODEC_START_FALLBACK=1 node scripts/video-smoke.mjs',
 'STUDIO_URL="file://$GITHUB_WORKSPACE/dist/Estudio_Coroado_Offline.html" node scripts/video-smoke.mjs',
 'node scripts/offline-smoke.mjs',
 'node scripts/build-offline.mjs',
 'node scripts/test-build-offline-integrity.mjs',
 'node scripts/package-private.mjs',
 'node scripts/check-delivery.mjs',
 'python3 scripts/test-package-integrity.py',
 'node scripts/test-package-tampering.mjs',
 'node scripts/package-smoke.mjs',
 'actions/upload-artifact@v4',
 'Estudio-Coroado-Privado-PC-Android'
];
// Check executable run steps, not command names merely mentioned in comments.
const runCommands=ci.split('\n').filter(line=>/^\s*run:\s*/.test(line)).map(line=>line.replace(/^\s*run:\s*/,''));
for(const step of required.filter(s=>s.startsWith('node ')||s.startsWith('python3 ')||s.startsWith('STUDIO_')))
  assert(runCommands.includes(step),'Missing executable CI acceptance stage: '+step);
for(const step of required.filter(s=>!s.startsWith('node ')&&!s.startsWith('python3 ')&&!s.startsWith('STUDIO_')))
  assert(ci.includes(step),'Missing CI acceptance stage: '+step);
// The package must only be uploaded after all acceptance checks have run.
const artifactPosition=ci.indexOf('actions/upload-artifact@v4');
for(const step of required.filter(s=>s!=='actions/upload-artifact@v4'&&s!=='Estudio-Coroado-Privado-PC-Android'))
  assert(ci.indexOf(step)<artifactPosition,'Acceptance check appears after artifact publication: '+step);
assert(/permissions:\s*\n\s*contents:\s*read/.test(ci),'CI must have read-only contents permission');
assert(!/\bworkflow_dispatch\b[\s\S]*?deploy-pages/.test(ci),'No Pages deployment allowed');
console.log('CI guard passed: browser, audio, 22 assets, offline, private package and no Pages deployment.');
