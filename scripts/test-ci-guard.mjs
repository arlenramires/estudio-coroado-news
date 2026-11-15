import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Exercise the actual CI guard against mutations of the real workflow.
const source=readFileSync('scripts/check-ci-contract.mjs','utf8');
const workflow=readFileSync('.github/workflows/test.yml','utf8');
const root=mkdtempSync(join(tmpdir(),'estudio-ci-guard-'));
try {
  mkdirSync(join(root,'scripts'));
  mkdirSync(join(root,'.github','workflows'),{recursive:true});
  writeFileSync(join(root,'scripts','check-ci-contract.mjs'),source);
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  for(const name of readdirSync('.github/workflows')){
    if(/\.ya?ml$/i.test(name))cpSync(join('.github/workflows',name),join(root,'.github','workflows',name));
  }
  const target=join(root,'.github','workflows','test.yml');
  function check(label,content,shouldPass){
    writeFileSync(target,content);
    const result=spawnSync(process.execPath,['scripts/check-ci-contract.mjs'],{cwd:root,encoding:'utf8'});
    assert.equal(result.status===0,shouldPass,`${label}: ${result.stdout}\n${result.stderr}`);
  }
  check('original workflow',workflow,true);
  check('missing PNG/browser test',workflow.replace('run: node scripts/smoke.mjs','run: echo skipped'),false);
  check('masked video test',workflow.replace('run: node scripts/video-smoke.mjs','run: node scripts/video-smoke.mjs || true'),false);
  check('masked video with echo',workflow.replace('run: node scripts/video-smoke.mjs','run: node scripts/video-smoke.mjs || echo ignored'),false);
  check('masked video with exit zero',workflow.replace('run: node scripts/video-smoke.mjs','run: node scripts/video-smoke.mjs || exit 0'),false);
  check('masked video with printf',workflow.replace('run: node scripts/video-smoke.mjs','run: node scripts/video-smoke.mjs || printf ignored'),false);
  check('missing pipefail',workflow.replace('          set -o pipefail\n',''),false);
  check('public Pages action',workflow.replace('actions/checkout@v4','actions/deploy-pages@v4'),false);
  check('missing private package',workflow.replace('Estudio-Coroado-Privado-PC-Android','public-package'),false);
  console.log('CI guard regression tests passed (positive + 7 negative cases).');
} finally {rmSync(root,{recursive:true,force:true});}
