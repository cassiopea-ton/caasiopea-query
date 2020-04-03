const { toBigIntBE, toBufferBE } = require("bigint-buffer");

class CellData {
  constructor(data, references) {
    this.data = data;
    this.references = references;
    this.offset = 0;
    this.refOffset = 0;
  }

  readBits(counter) {
    let byteStart = Math.floor(this.offset / 8);
    let length = Math.ceil(((this.offset % 8) + counter) / 8);
    let bitStart = this.offset - byteStart * 8;
    let dataSlice = this.data.readUIntBE(byteStart, length);
    let mask = 0;
    for (let i = 0; i < counter; i++) {
      mask |= dataSlice & (1 << (length * 8 - 1 - bitStart - i));
    }
    this.offset += counter;
    let padding = 8 - ((bitStart + counter) % 8);
    return padding === 8 ? mask : mask >> padding;
  }

  readLongBits(counter) {
    let length = Math.ceil(counter / 8);
    let result = [];
    for (let l = 0; l < counter; l += 8) {
      length--;
      result.push(length ? this.readBits(8) : this.readBits(counter - l));
    }
    return Buffer.from(result);
  }

  static setLongBits(counter) {
    let length = Math.ceil(counter / 8);
    let result = [];
    for (let l = 0; l < counter; l += 8) {
      length--;
      result.push(length ? this.setBits(8) : this.setBits(counter - l));
    }
    return Buffer.from(result);
  }

  static toggleBits(dataSlice, counter) {
    for (let i = 0; i < counter; i++) {
      dataSlice ^= 1 << i;
    }
    return dataSlice;
  }

  static toggleLongBits(dataSlice, counter) {
    let length = Math.ceil(counter / 8);
    let result = [];
    for (let l = 0; l < counter; l += 8) {
      result.push(
        length + 1 != Math.ceil(counter / 8)
          ? this.toggleBits(dataSlice[length], 8)
          : this.toggleBits(dataSlice[length], counter - l)
      );
      length++;
    }
    return Buffer.from(result);
  }

  static setBits(dataSlice, bit, counter) {
    for (let i = 0; i < counter; i++) {
      dataSlice |= bit << i;
    }
    return dataSlice;
  }

  readInt(counter) {
    let int = this.readLongBits(counter);
    if (sign === -1) {
      int = toBigIntBE(CellData.toggleLongBits(toBigIntBE(int) - BigInt(1)));
    }
    return int.toString();
  }

  readVarUInt(counter) {
    let size = this.readBits(Math.floor(Math.log2(counter + 1)));
    return size ? this.readBits(size * 8) : 0;
  }

  readVarInt(counter) {
    let size = this.readBits(Math.floor(Math.log2(counter + 1)));
    return size ? this.readInt(size * 8) : 0;
  }

  readLabel(maxKeyLength) {
    let labelLength = 0;
    let label = 0;
    let labelLengthSize = Math.ceil(Math.log2(maxKeyLength + 1));
    let labelLengthBytes = Math.ceil(labelLengthSize / 8);
    if (!this.readBits(1)) {
      while (this.readBits(1)) {
        labelLength++;
      }
      label = this.readLongBits(labelLength);
    } else if (!this.readBits(1)) {
      labelLength = this.readBits(labelLengthSize);
      label = this.readLongBits(labelLength);
    } else {
      let bit = this.readBits(1);
      labelLength = this.readBits(Math.ceil(Math.log2(maxKeyLength + 1)));
      label = CellData.setLongBits(0, bit, labelLength);
    }
    let bufferedLabelLength = Buffer.alloc(labelLengthBytes);
    bufferedLabelLength.writeUIntBE(labelLength, 0, labelLengthBytes);
    return [
      toBigIntBE(bufferedLabelLength),
      labelLength <= 8
        ? toBigIntBE(label)
        : toBigIntBE(label) >>
          BigInt(Math.ceil(labelLength / 8) * 8 - labelLength)
    ];
  }

  readVarNode(keyLength, valueAbi, label, finalizedDict) {
    if (this.readBits(1)) {
      this.references[this.refOffset++].readVarEdge(
        keyLength - 1,
        valueAbi,
        label << CellData.convertToBigInt(1),
        finalizedDict
      );
      this.references[this.refOffset++].readVarEdge(
        keyLength - 1,
        valueAbi,
        (label << CellData.convertToBigInt(1)) + CellData.convertToBigInt(1),
        finalizedDict
      );
    } else {
      finalizedDict[label] = this.deserialize(valueAbi);
    }
  }

  static convertToBigInt(number) {
    return BigInt(number);
  }

  readNode(keyLength, valueAbi, label, finalizedDict) {
    if (!keyLength) {
      finalizedDict[label] = this.deserialize(valueAbi);
    } else {
      this.references[this.refOffset++].readEdge(
        keyLength - 1,
        valueAbi,
        label << CellData.convertToBigInt(1),
        finalizedDict
      );
      this.references[this.refOffset++].readEdge(
        keyLength - 1,
        valueAbi,
        (label << CellData.convertToBigInt(1)) + CellData.convertToBigInt(1),
        finalizedDict
      );
    }
  }

  readEdge(keyLength, valueAbi, label, finalizedDict) {
    let labelInfo = this.readLabel(keyLength);
    label = (label << labelInfo[0]) + labelInfo[1];
    this.readNode(
      keyLength - parseInt(labelInfo[0]),
      valueAbi,
      label,
      finalizedDict
    );
    return finalizedDict;
  }

  readVarEdge(keyLength, valueAbi, label, finalizedDict) {
    let labelInfo = this.readLabel(keyLength);
    label = (label << labelInfo[0]) + labelInfo[1];
    this.readVarNode(
      keyLength - parseInt(labelInfo[0]),
      valueAbi,
      label,
      finalizedDict
    );
    return finalizedDict;
  }

  deserialize(abi) {
    let result = [];
    abi.forEach(item => {
      switch (item.type) {
        case "ref":
          result.push(this.references[this.refOffset++].deserialize(item.body));
          break;
        case "uint":
          result.push(toBigIntBE(this.readLongBits(item.size)).toString());
          break;
        case "int":
          result.push(toBigIntBE(this.readLongBits(item.size)).toString());
          break;
        case "bits":
          result.push(this.readLongBits(item.size));
          break;
        case "grams":
          result.push(this.readVarUInt(16));
          break;
        case "op_ref":
          if (this.readBits(1)) {
            result.push(
              this.references[this.refOffset++].deserialize(item.body)
            );
          } else {
            result.push({});
          }
          break;
        case "dict":
          if (this.readBits(1)) {
            let dict = this.references[this.refOffset++].readEdge(
              item.key.size,
              item.value,
              toBigIntBE(Buffer.from("")),
              {}
            );
            let prettifiedDict = {};
            Object.entries(dict).forEach(([key, value]) => {
              switch (item.key.type) {
                case "string":
                  prettifiedDict[key] = toBufferBE(value).toString();
                  break;
                default:
                  prettifiedDict[key] = value;
              }
            });
            result.push(prettifiedDict);
          } else {
            result.push({});
          }
          break;
        case "prxdict":
          if (this.readBits(1)) {
            let dict = this.references[this.refOffset++].readVarEdge(
              item.key.size,
              item.value,
              toBigIntBE(Buffer.from("")),
              {}
            );
            let prettifiedDict = {};
            Object.entries(dict).forEach(([key, value]) => {
              switch (item.key.type) {
                case "string":
                  prettifiedDict[
                    toBufferBE(
                      BigInt(key),
                      Math.ceil(BigInt(key).toString(16).length / 2)
                    ).toString("utf8")
                  ] = value;
                  break;
                default:
                  prettifiedDict[key] = value;
              }
            });
            result.push(prettifiedDict);
          } else {
            result.push({});
          }
          break;
      }
    });
    return result;
  }
}

class Cell {
  constructor(data, offsetObj, refSize) {
    let offset = offsetObj.offset;
    this.refsCounter = data[offset] & 7;
    this.isExotic = data[offset] & 8;
    this.hasHash = data[offset] & 16;
    this.level = data[offset++] & (3 << 5);

    this.dataSize = (data[offset] >> 1) + (data[offset] & 1);
    this.notFull = data[offset++] & 1;
    this.fullDataSize = 2 + this.dataSize + this.refsCounter * refSize;

    this.data = data.slice(offset, (offset += this.dataSize));
    this.references = [];
    for (let ref = 0; ref < this.refsCounter; ref++) {
      this.references.push(data.readUIntBE(offset, refSize));
      offset += refSize;
    }
    offsetObj.offset = offset;
  }
}

class BagOfCells {
  constructor(boc) {
    //   read general info
    this.magic = boc.readUIntBE(0, 4);

    let b = boc[4];
    this.hasIdx = b & (1 << 7);
    this.hasCrc32c = b & (1 << 6);
    this.hasCacheBits = b & (1 << 5);
    this.flags = b & (3 << 3);
    this.refSize = b & 7;
    this.offBytes = boc[5];

    let offset = 6;
    this.cells = boc.readUIntBE(offset, this.refSize);
    offset += this.refSize;

    this.roots = boc.readUIntBE(offset, this.refSize);
    offset += this.refSize;

    this.absent = boc.readUIntBE(offset, this.refSize);
    offset += this.refSize;

    this.totCellsSize = boc.readUIntBE(offset, this.offBytes);
    offset += this.offBytes;

    this.rootList = boc.slice(offset, (offset += this.roots * this.refSize));

    if (this.hasIdx) {
      this.index = boc.slice(offset, (offset += this.cells * this.offBytes));
    }

    // manage cells
    this.cellData = [];
    this.cellDataSlice = [];
    for (let cellIdx = 0; cellIdx < this.cells; cellIdx++) {
      let offsetObj = { offset };
      this.cellData.push(
        new Cell(boc, offsetObj, this.refSize, cellIdx, this.cells)
      );
      this.cellDataSlice.push({
        data: Buffer.from(this.cellData[cellIdx].data),
        referencesData: []
      });
      offset = offsetObj.offset;
    }

    for (let cellIdx = this.cells - 1; cellIdx >= 0; cellIdx--) {
      this.cellData[cellIdx].referencesData = [];
      let references = this.cellData[cellIdx].references;
      for (let ref = 0; ref < references.length; ref++) {
        this.cellData[cellIdx].referencesData.push({
          ...this.cellData[references[ref]]
        });

        this.cellDataSlice[cellIdx].referencesData.push(
          this.cellDataSlice[references[ref]]
        );
      }
      this.cellDataSlice[cellIdx] = new CellData(
        this.cellDataSlice[cellIdx].data,
        this.cellDataSlice[cellIdx].referencesData
      );
    }

    if (this.hasCrc32c) {
      this.index = boc.readUIntBE(offset, 4);
    }
  }
}

module.exports.Cell = Cell;
module.exports.CellData = CellData;
module.exports.BagOfCells = BagOfCells;
