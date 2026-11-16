import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const context=vm.createContext({URL,self:{registration:{scope:'https://studio.invalid/'},addEventListener(){}}});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
const validate=vm.runInContext('isEditorHtml',context);
const response=html=>({clone(){return {text:async()=>html}}});
const title='<title>Estúdio Coroado News 24H</title>';
const controls='<main id="editorial"></main><button id="savePNG">Salvar</button>';
if(!(await validate(response(title+controls))))throw new Error('Editor legítimo rejeitado');
for(const tag of ['textarea','noscript']){
  const html=title+'<'+tag+'>'+controls+'</'+tag+'>';
  if(await validate(response(html)))throw new Error('Controles inativos em '+tag+' aceitos como editor');
}
console.log('OK: controles inativos em textarea/noscript rejeitados');
