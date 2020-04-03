This javaScript library provides an easy interface to deserialize TON contracts data.

# Installation

Run

```
npm install cassiopeia-ton-sdk
```

# Usage

TON says that everything is Bag of Cells. The account data is Bag of Cell as well. To deserialize this kind of data `BagOfCells` class is used.

`Buffer` with account data should be passed as the first parameter:

```
let c = new BagOfCells(buffer);
```

It returns hte object with the following fields:

```
{
    magic: int,
    has_idx: int,
    has_crc32c: int
    has_cache_bits: int
    flags: int,
    size: int,
    off_bytes: int,
    cells: int,
    roots: int,
    absent: int,
    tot_cells_size: int,
    root_list: int,
    index: int,
    cell_data: Buffer,
    crc32c: int,
}
```
