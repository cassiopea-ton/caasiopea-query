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
      this.references.push(data.readUIntBE(offset, size));
      offset += size;
    }
    offsetObj.offset = offset;
  }
}

class BagOfCells {
  constructor() {
    this.magic = 0;
    this.has_idx = 0;
    this.has_crc32c = 0;
    this.has_cache_bits = 0;
    this.flags = 0;
    this.size = 0;
    this.off_bytes = 0;
    this.cells = 0;
    this.roots = 0;
    this.absent = 0;
    this.tot_cells_size = 0;
    this.root_list = 0;
    this.index = 0;
    this.cell_data = 0;
    this.crc32c = 0;
  }

  constructor(boc) {
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

    this.cell_data = [];
    for (let cell_idx = 0; cell_idx < counter; cell_idx++) {
      let offsetObj = { offset };
      this.cell_data.push(
        new Cell(boc, offsetObj, this.ref_size, cell_idx, this.cells)
      );
      (offset = offsetObj), offset;
    }
    if (this.has_crc32c) {
      this.index = boc.readUIntBE(offset, 4);
    }
  }
}
