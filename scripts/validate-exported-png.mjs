// Valida a estrutura completa de PNGs gerados pelo editor, não só assinatura/IHDR.
export function validateExportedPng(bytes, expectedWidth, expectedHeight) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw Error('PNG exportado sem assinatura válida');
  let offset = 8, ihdr = 0, idat = 0, iend = 0, plte = 0, idatClosed = false, colorType = null;
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw Error('PNG com chunk truncado');
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) throw Error('PNG com tamanho de chunk inválido');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw Error('Tipo de chunk PNG inválido');
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + size; i++)
      crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(offset + 8 + size))
      throw Error('CRC PNG inválido no chunk ' + type);
    if (!ihdr && type !== 'IHDR') throw Error('IHDR deve ser o primeiro chunk PNG');
    if (idat && type !== 'IDAT') idatClosed = true;
    if (type === 'IHDR') {
      if (ihdr++ || offset !== 8 || size !== 13) throw Error('IHDR duplicado ou inválido');
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      // A especificação PNG exige dimensões positivas de até 2^31 - 1.
      // Não aceitar nem mesmo quando o tamanho esperado for inválido.
      if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff ||
          width !== expectedWidth || height !== expectedHeight)
        throw Error('Dimensões do PNG exportado incorretas');
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      colorType = color;
      const allowed = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!allowed[color]?.includes(depth) || bytes[offset + 18] !== 0 ||
          bytes[offset + 19] !== 0 || ![0,1].includes(bytes[offset + 20]))
        throw Error('Parâmetros IHDR do PNG exportado inválidos');
    } else if (type === 'IDAT') {
      if (!ihdr || iend || idatClosed || (colorType === 3 && !plte))
        throw Error('IDAT fora de ordem ou sem paleta obrigatória');
      idat++;
    } else if (type === 'PLTE') {
      if (!ihdr || idat || iend || plte++ || colorType === 0 || colorType === 4 ||
          !size || size % 3 || size > 768 || (colorType === 3 && size / 3 > (1 << bytes[24])))
        throw Error('PLTE duplicado, inválido ou fora de ordem');
    } else if (type[0] === type[0].toUpperCase() && type !== 'IEND') {
      throw Error('Chunk crítico PNG desconhecido: ' + type);
    }
    else if (type === 'IEND') {
      if (!idat || size || iend++ || end !== bytes.length) throw Error('IEND PNG inválido');
    }
    offset = end;
  }
  if (offset !== bytes.length || ihdr !== 1 || !idat || iend !== 1)
    throw Error('PNG sem IHDR, IDAT ou IEND íntegros');
  return true;
}
