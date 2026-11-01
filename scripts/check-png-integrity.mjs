// Validação independente da integridade dos ícones PNG do PWA.
// Execute: node scripts/check-png-integrity.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,n)=>{
  let c=n;
  for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer)crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function verifyPNG(buffer,size){
  assert.ok(buffer.subarray(0,8).equals(signature),'Assinatura PNG inválida');
  let offset=8, ihdr=false, iend=false, idat=false;
  while(offset<buffer.length){
    assert.ok(offset+12<=buffer.length,'Chunk PNG truncado');
    const length=buffer.readUInt32BE(offset);
    const end=offset+12+length;
    assert.ok(end<=buffer.length,'Dados PNG truncados');
    const type=buffer.toString('ascii',offset+4,offset+8);
    const expected=buffer.readUInt32BE(offset+8+length);
    assert.equal(crc32(buffer.subarray(offset+4,offset+8+length)),expected,'CRC inválido: '+type);
    if(!ihdr){
      assert.equal(type,'IHDR','Primeiro chunk deve ser IHDR');
      assert.equal(length,13,'IHDR deve ter 13 bytes');
      assert.equal(buffer.readUInt32BE(offset+8),size,'Largura incorreta');
      assert.equal(buffer.readUInt32BE(offset+12),size,'Altura incorreta');
      ihdr=true;
    }
    if(type==='IDAT')idat=true;
    offset=end;
    if(type==='IEND'){
      assert.equal(length,0,'IEND inválido');
      assert.equal(offset,buffer.length,'Dados extras após IEND');
      iend=true;
      break;
    }
  }
  assert.ok(ihdr&&idat&&iend,'PNG sem IHDR, IDAT ou IEND');
}
for(const size of [192,512]){
  const buffer=fs.readFileSync('icons/studio-'+size+'.png');
  verifyPNG(buffer,size);
  const tampered=Buffer.from(buffer);
  // Um bit alterado no IHDR não pode passar pelo teste.
  tampered[16]^=1;
  assert.throws(()=>verifyPNG(tampered,size));
  console.log('PNG '+size+'x'+size+': chunks, CRC e dimensões válidos');
}
