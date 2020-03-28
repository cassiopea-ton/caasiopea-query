class Deserializer {
  deserialize(cell, abi) {}
}

// ref
// int
// uint
// bits
// grams
// op_ref
// dict

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

  readBits(data, counter) {
    let byteStart = Math.floor(this.offset / 8);
    let length = Math.ceil(counter / 8);
    let bitStart = this.offset - byteStart * 8;
    let dataSlice = data.readUIntBE(byteStart, length);
    let mask = 0;
    for (let i = 0; i < counter; i++) {
      mask |= 1 << (length * 8 - 1 - bitStart - i);
    }
    this.offset += counter;
    let padding = 8 - ((bitStart + counter) % 8);
    return padding === 8 ? dataSlice & mask : (dataSlice & mask) >> padding;
  }

  static toggleBits(dataSlice, counter) {
    for (let i = 0; i < counter; i++) {
      dataSlice ^= 1 << i;
    }
    return dataSlice;
  }

  readUint(data, counter) {
    let sign = this.readBits(data, 1) ? -1 : 1;
    let int = this.readBits(data, counter - 1);
    if (sign === -1) {
      int = CellData.toggleBits(int, counter - 1) + 1;
    }
    return sign * int;
  }
  readDict(cell, keyLength) {
    let dict = {};
    console.log(cell);
    return dict;
  }

  deserialize(abi) {
    let result = [];
    abi.forEach(item => {
      switch (item.type) {
        case "ref":
          break;
        case "uint":
          result.push(this.readUint(this.data, item.size));
          break;
        case "int":
        case "bits":
          result.push(this.readBits(this.data, item.size));
          break;
        case "grams":
          break;
        case "op_ref":
          break;
        case "dict":
          if (this.readBits(this.data, 1)) {
            let dict = this.readDict(
              this.references[this.refOffset],
              item.key.size
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
