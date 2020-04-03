This javaScript library provides an easy interface to deserialize TON contracts data.

# Installation

Run

```
npm install cassiopeia-ton-sdk
```

# Usage

## BagOfCells

TON says that everything is Bag of Cells. The account data is Bag of Cell as well. To deserialize this kind of data `BagOfCells` class is used.

`Buffer` with account data should be passed as the first parameter:

```
let c = new BagOfCells(buffer);
```

It returns hte object with that represents following fields:

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

## Cell

Each piece of data in `BagOfCells` is `Cell`. To deserialize `Cell` `deserialize` method is used. It requires ABI(application binary interface) as the first parameter. ABI describes the structure of storage, consequently describing each type that was serialized.

ABI is an array of objects that describe types.
The simplest one is:

```
let abi = [];
```

it shows that the cell is empty.

Deserializer supported types:

- ref
- uint
- int
- bits
- grams
- op_ref
- dict
- prxdict

ref, uint, int, bits and op_ref are objects with two fields: `type` and `size`. grams has only field `type`. `type` is a string of the type, `size` is unsigned int between 0 to 1023.

dict and prxdict has fields of `type`, `key` and `value`. `type` is string "dict" or "prxdict", `key` is one of ref, uint, int, bits and op_ref description types and `value` is an array similar to abi.

For example:

```
let abi = [
  {
    type: "dict",
    key: { type: "uint", size: 8 },
    value: [
      {
        type: "prxdict",
        key: { type: "string", size: 1023 },
        value: [
          { type: "int", size: 8 },
          { type: "uint", size: 256 },
          { type: "uint", size: 32 },
          { type: "grams" },
          { type: "uint", size: 32 }
        ]
      }
    ]
  },
  {
    type: "dict",
    key: { type: "uint", size: 256 },
    value: [
      { type: "uint", size: 32 },
      { type: "int", size: 32 },
      { type: "uint", size: 32 },
      { type: "grams" },
      { type: "uint", size: 32 }
    ]
  }
];
```
