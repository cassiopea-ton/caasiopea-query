const { TONClient } = require("ton-client-node-js");
const { BagOfCells } = require("./Deserializer");

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
          { type: "grams" }
          // { type: "uint", size: 32 }
        ]
      }
    ]
  }
];

class QueryClient {
  constructor(client) {
    this.client = client;
  }

  async getAccountTransactions(
    addr,
    params = ["id", "now", "status", "in_message { body }"]
  ) {
    return await this.client.queries.transactions.query(
      {
        status: { eq: 3 },
        tr_type: { eq: 0 },
        end_status: { eq: 1 },
        success: { eq: 1 },
        account_addr: {
          eq: addr
        }
      },
      params.join(" ")
    );
  }

  async getAccount(addr, params = ["code", "data"]) {
    return await this.client.queries.accounts.query(
      {
        acc_type: { eq: 1 },
        id: {
          eq: addr
        }
      },
      params.join(" ")
    );
  }
}

async function main(client) {
  let registerAddr =
    "-1:20609b46cd4fe654b72f8ecddde986f6484dc13e737fd109b36ca73b77b6a098";
  let queryClient = new QueryClient(client);
  const account = await queryClient.getAccount(registerAddr);

  const buffer = Buffer.from(account[0].data, "base64");
  // let contractStorage = DataDeserializer.deserializeBoc(buffer);
  let testAbi = [];
  for (let i = 0; i < 1; i++) {
    testAbi.push({
      type: "uint",
      size: 4
    });
  }
  let c = new BagOfCells(buffer);
  console.log(JSON.stringify(c.cell_data_slice[0].deserialize(abi)));

  let dataBinary = buffer.reduce((binStr, el) => {
    return binStr + el.toString(2).padStart(8, "0");
  }, "");
}

(async () => {
  try {
    const client = new TONClient();
    client.config.setData({
      servers: ["https://testnet.ton.dev"]
    });
    await client.setup();
    await main(client);
    process.exit(0);
  } catch (error) {
    console.error(error);
  }
})();
