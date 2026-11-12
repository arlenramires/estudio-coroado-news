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
  let offset=8, ihdr=false, iend=false, idat=false, idatEnded=false, palette=false;
  let colorType=null, bitDepth=null;
  while(offset<buffer.length){
    assert.ok(offset+12<=buffer.length,'Chunk PNG truncado');
    const length=buffer.readUInt32BE(offset);
    const end=offset+12+length;
    assert.ok(end<=buffer.length,'Dados PNG truncados');
    const type=buffer.toString('ascii',offset+4,offset+8);
    assert.match(type,/^[A-Za-z]{4}$/,'Nome de chunk PNG inválido');
    assert.match(type[2],/^[A-Z]$/,'Bit reservado do chunk PNG deve ser zero');
    const expected=buffer.readUInt32BE(offset+8+length);
    assert.equal(crc32(buffer.subarray(offset+4,offset+8+length)),expected,'CRC inválido: '+type);
    if(!ihdr){
      assert.equal(type,'IHDR','Primeiro chunk deve ser IHDR');
      assert.equal(length,13,'IHDR deve ter 13 bytes');
      assert.equal(buffer.readUInt32BE(offset+8),size,'Largura incorreta');
      assert.equal(buffer.readUInt32BE(offset+12),size,'Altura incorreta');
      // Ícones PWA devem usar PNG com parâmetros de codificação válidos.
      const depth=buffer[offset+16], color=buffer[offset+17];
      colorType=color;
      bitDepth=depth;
      const allowed={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      assert.ok(allowed[color]?.includes(depth),'Profundidade/cor PNG inválidas');
      assert.equal(buffer[offset+18],0,'Compressão PNG inválida');
      assert.equal(buffer[offset+19],0,'Filtro PNG inválido');
      assert.ok([0,1].includes(buffer[offset+20]),'Entrelaçamento PNG inválido');
      ihdr=true;
    }
    if(type==='IHDR'&&ihdr&&offset!==8)assert.fail('IHDR duplicado');
    if(type==='PLTE'){
      assert.ok(!palette&&!idat,'Paleta duplicada ou após IDAT');
      assert.ok(colorType!==0&&colorType!==4,'Paleta proibida neste tipo PNG');
      assert.ok(length>0&&length%3===0&&length<=768,'Paleta PNG inválida');
      if(colorType===3)assert.ok(length/3<=2**bitDepth,'Paleta excede profundidade do PNG indexado');
      palette=true;
    }
    if(type==='IDAT'){
      assert.ok(ihdr,'IDAT antes de IHDR');
      assert.ok(!idatEnded,'Chunks IDAT não contíguos');
      if(colorType===3)assert.ok(palette,'PNG indexado sem paleta');
      idat=true;
    }else if(idat){idatEnded=true;}
    if(type[0]===type[0]?.toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(type))
      assert.fail('Chunk crítico PNG desconhecido: '+type);
    if(type==='IEND')assert.ok(idat,'IEND antes de IDAT');
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
  // Parâmetros IHDR inválidos devem ser rejeitados mesmo com CRC recalculado.
  const invalidColor=Buffer.from(buffer);
  invalidColor[25]=7; // tipo de cor inexistente
  invalidColor.writeUInt32BE(crc32(invalidColor.subarray(12,29)),29);
  assert.throws(()=>verifyPNG(invalidColor,size),/PNG inválidas/);
  // Nomes de chunk inválidos e bit reservado incorreto não devem passar mesmo com CRC válido.
  for(const badName of ['I1DR','IHdR']){
    const invalidChunk=Buffer.from(buffer);
    Buffer.from(badName).copy(invalidChunk,12);
    invalidChunk.writeUInt32BE(crc32(invalidChunk.subarray(12,29)),29);
    assert.throws(()=>verifyPNG(invalidChunk,size),/chunk PNG|Primeiro chunk/);
  }
  // Um byte de dados alterado deve invalidar o CRC do respectivo chunk.
  const idat=buffer.indexOf(Buffer.from('IDAT'));
  assert.ok(idat>=12,'IDAT não encontrado');
  const corruptedData=Buffer.from(buffer);
  corruptedData[idat+4]^=1;
  assert.throws(()=>verifyPNG(corruptedData,size),/CRC inválido/);
  // Chunks críticos desconhecidos devem falhar mesmo com CRC correto.
  const unknown=Buffer.from(buffer);
  Buffer.from('ABCD').copy(unknown,12);
  unknown.writeUInt32BE(crc32(unknown.subarray(12,29)),29);
  assert.throws(()=>verifyPNG(unknown,size),/Primeiro chunk deve ser IHDR|crítico/);
  // Não aceitar bytes anexados após o fim oficial do PNG.
  assert.throws(()=>verifyPNG(Buffer.concat([buffer,Buffer.from([0])]),size),/Dados extras/);
  console.log('PNG '+size+'x'+size+': chunks, CRC e dimensões válidos');
}
