// {
//      "type": "ref",
//      "body": { ... }
// }

// {
//      "type": "op_ref",
//      "body": { ... }
// }

// {
//      "type": "int",
//      "size": uint
// }

// {
//      "type": "uint",
//      "size": uint
// }

// {
//      "type": "bits",
//      "size": uint
// }

// {
//      "type": "grams"
// }

// {
//      "type": "dict",
//      "key": { ... },
//      "value": { ... },
// }

class CellData {
  constructor(data, references) {
    this.data = data;
    this.references = references;
    this.offset = 0;
    this.refOffset = 0;
  }

  readBits(counter) {
    let byteStart = Math.floor(this.offset / 8);
    let length = Math.ceil(counter / 8);
    let bitStart = this.offset - byteStart * 8;
    let dataSlice = this.data.readUIntBE(byteStart, length);
    let mask = 0;
    for (let i = 0; i < counter; i++) {
      mask |= 1 << (length * 8 - 1 - bitStart - i);
    }
    this.offset += counter;
    let padding = 8 - ((bitStart + counter) % 8);
    return padding === 8 ? dataSlice & mask : (dataSlice & mask) >> padding;
  }

  readLongBits(counter) {
    let length = Math.ceil(counter / 8);
    let result = [];
    for (let l = 0; l < counter; l += 8) {
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

  static setBits(dataSlice, bit, counter) {
    for (let i = 0; i < counter; i++) {
      dataSlice |= bit << i;
    }
    return dataSlice;
  }

  readUint(counter) {
    let sign = this.readBits(1) ? -1 : 1;
    let int = this.readLongBits(counter - 1);
    if (sign === -1) {
      int = CellData.toggleBits(int, counter - 1) + 1;
    }
    return sign * int;
  }

  readVarUInt(counter) {
    let size = this.readBits(Math.floor(Math.log2(counter + 1)));
    return size ? this.readUint(size * 8) : 0;
  }

  readVarInt(counter) {
    let size = this.readBits(Math.floor(Math.log2(counter + 1)));
    return size ? this.readBits(size * 8) : 0;
  }

  readLabel(maxKeyLength) {
    let labelLength = 0;
    let label = 0;
    if (!this.readBits(1)) {
      console.log("SHORT");
      while (this.readBits(1)) {
        labelLength++;
      }
      label = this.readLongBits(labelLength);
    } else if (!this.readBits(1)) {
      console.log("LONG");
      labelLength = this.readBits(Math.ceil(Math.log2(maxKeyLength + 1)));
      label = this.readLongBits(labelLength);
    } else {
      console.log("SAME");
      let bit = this.readBits(1);
      labelLength = this.readBits(Math.ceil(Math.log2(maxKeyLength + 1)));
      label = CellData.setLongBits(0, bit, labelLength);
    }
    return [labelLength, label];
  }

  readVarNode(keyLength, valueAbi) {
    if (this.readBits(1)) {
      console.log(this);
    } else if (this.readBits(1)) {
      let left = this.references[this.refOffset++]
        ? this.references[this.refOffset++].readVarEdge(keyLength - 1, valueAbi)
        : {};
      let right = this.references[this.refOffset++]
        ? this.references[this.refOffset++].readVarEdge(keyLength - 1, valueAbi)
        : {};
      let value = this.readBits(1) ? this.deserialize(valueAbi) : null;
      return { value: { 0: left, 1: right, value }, leaf: false };
    } else {
      return { value: this.deserialize(valueAbi), leaf: true };
    }
  }

  readNode(keyLength, valueAbi) {
    if (!keyLength) {
      return { value: this.deserialize(valueAbi), leaf: true };
    }
    let left = this.references[this.refOffset++].readEdge(
      keyLength - 1,
      valueAbi
    );
    let right = this.references[this.refOffset++].readEdge(
      keyLength - 1,
      valueAbi
    );
    return { value: { 0: left, 1: right }, leaf: false };
  }

  readEdge(keyLength, valueAbi) {
    let labelInfo = this.readLabel(keyLength);

    let nodeInfo = this.readNode(keyLength - labelInfo[0], valueAbi);
    return { [labelInfo[1]]: nodeInfo };
  }

  readVarEdge(keyLength, valueAbi) {
    let labelInfo = this.readLabel(keyLength);
    let nodeInfo = this.readVarNode(keyLength - labelInfo[0], valueAbi);
    return { [labelInfo[1]]: nodeInfo };
  }

  deserialize(abi) {
    let result = [];
    abi.forEach(item => {
      switch (item.type) {
        case "ref":
          result.push(this.references[this.refOffset++].deserialize(item.body));
          break;
        case "uint":
          result.push(this.readUint(item.size));
          break;
        case "int":
        case "bits":
          result.push(this.readBits(item.size));
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
              item.value
            );
            result.push(dict);
          } else {
            result.push({});
          }
          break;
        case "prxdict":
          if (this.readBits(1)) {
            let dict = this.references[this.refOffset++].readVarEdge(
              item.key.size,
              item.value
            );
            result.push(dict);
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
  constructor(data, offsetObj, ref_size) {
    let offset = offsetObj.offset;
    this.refs_counter = data[offset] & 7;
    this.is_exotic = data[offset] & 8;
    this.has_hash = data[offset] & 16;
    this.level = data[offset++] & (3 << 5);

    this.data_size = (data[offset] >> 1) + (data[offset] & 1);
    this.not_full = data[offset++] & 1;
    this.full_data_size = 2 + this.data_size + this.refs_counter * ref_size;

    this.data = data.slice(offset, (offset += this.data_size));
    this.references = [];
    for (let ref = 0; ref < this.refs_counter; ref++) {
      this.references.push(data.readUIntBE(offset, ref_size));
      offset += ref_size;
    }
    offsetObj.offset = offset;
  }
}

class BagOfCells {
  constructor(boc) {
    //   read general info
    this.magic = boc.readUIntBE(0, 4);

    let b = boc[4];
    this.has_idx = b & (1 << 7);
    this.has_crc32c = b & (1 << 6);
    this.has_cache_bits = b & (1 << 5);
    this.flags = b & (3 << 3);
    this.ref_size = b & 7;
    this.off_bytes = boc[5];

    let offset = 6;
    this.cells = boc.readUIntBE(offset, this.ref_size);
    offset += this.ref_size;

    this.roots = boc.readUIntBE(offset, this.ref_size);
    offset += this.ref_size;

    this.absent = boc.readUIntBE(offset, this.ref_size);
    offset += this.ref_size;

    this.tot_cells_size = boc.readUIntBE(offset, this.off_bytes);
    offset += this.off_bytes;

    this.root_list = boc.slice(offset, (offset += this.roots * this.ref_size));

    if (this.has_idx) {
      this.index = boc.slice(offset, (offset += this.cells * this.off_bytes));
    }

    // manage cells
    this.cell_data = [];
    this.cell_data_slice = [];
    for (let cell_idx = 0; cell_idx < this.cells; cell_idx++) {
      let offsetObj = { offset };
      this.cell_data.push(
        new Cell(boc, offsetObj, this.ref_size, cell_idx, this.cells)
      );
      this.cell_data_slice.push({
        data: Buffer.from(this.cell_data[cell_idx].data),
        references_data: []
      });
      offset = offsetObj.offset;
    }

    // fucking muddle with refs
    for (let cell_idx = this.cells - 1; cell_idx >= 0; cell_idx--) {
      this.cell_data[cell_idx].references_data = [];
      let references = this.cell_data[cell_idx].references;
      for (let ref = 0; ref < references.length; ref++) {
        this.cell_data[cell_idx].references_data.push({
          ...this.cell_data[references[ref]]
        });

        this.cell_data_slice[cell_idx].references_data.push(
          this.cell_data_slice[references[ref]]
        );
      }
      this.cell_data_slice[cell_idx] = new CellData(
        this.cell_data_slice[cell_idx].data,
        this.cell_data_slice[cell_idx].references_data
      );
    }

    if (this.has_crc32c) {
      this.index = boc.readUIntBE(offset, 4);
    }
  }
}

module.exports.Cell = Cell;
module.exports.BagOfCells = BagOfCells;
