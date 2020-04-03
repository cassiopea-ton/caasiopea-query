const { TONClient } = require("ton-client-node-js");
const { BagOfCells } = require("cassiopeia-ton-sdk");

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

class QueryClient {
  /**
   * Client class that wraps TONClient requests
   * @param  {TONClient} client - Configured TONClient
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Fetches all successful finalized transaction for address
   * @param  {String} addr - Address to be search for
   * @param  {Array} params - Parameters of transaction to be returned
   * @return {Array} - Queried result
   */
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

  /**
   * Return account info
   * @param  {String} addr - Address to be search for
   * @param  {Array} params - Parameters of account to be returned
   * @return {Array} - Queried result
   */
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
    "-1:441c478f14f86140604578eabdac3531471273f7e8dbc826e309e9d8b328a1d9";
  let queryClient = new QueryClient(client);

  // Look up for smart contract storage
  const account = await queryClient.getAccount(registerAddr);

  // Convert smart contract storage to buffer
  const buffer = Buffer.from(account[0].data, "base64");

  // Deserialize smart contract storage (general information, without data)
  let c = new BagOfCells(buffer);

  // Deserialize root cell in storage
  console.log(JSON.stringify(c.cell_data_slice[0].deserialize(abi)));
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
