const fs = require("fs");
const { resolve } = require("path");
const vorpal = require("vorpal")();
const got = require("got");
const crypto = require("shardus-crypto-utils");
const stringify = require("fast-stable-stringify");
const axios = require("axios");

crypto.init("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

const walletFile = resolve("./wallet.json");
let walletEntries = {};

try {
  walletEntries = require(walletFile);
} catch (e) {
  saveEntries(walletEntries, walletFile);
  console.log(`Created wallet file '${walletFile}'.`);
}

function saveEntries(entries, file) {
  const stringifiedEntries = JSON.stringify(entries, null, 2);
  fs.writeFileSync(file, stringifiedEntries);
}
function createAccount(keys = crypto.generateKeypair()) {
  return {
    address: keys.publicKey,
    keys,
  };
}
// Creates an account with a keypair and adds it to the clients walletFile
function createEntry(name, id) {
  const account = createAccount();
  if (typeof id === "undefined" || id === null) {
    id = crypto.hash(name);
  }
  account.id = id;
  walletEntries[name] = account;
  saveEntries(walletEntries, walletFile);
  return account;
}

console.log(`Loaded wallet entries from '${walletFile}'.`);
let USER
let HOST = process.argv[2] || "localhost:9001";

function getInjectUrl() {
  return `http://${HOST}/inject`;
}
function getAccountsUrl() {
  return `http://${HOST}/accounts`;
}
function getAccountUrl(id) {
  return `http://${HOST}/account/${id}`;
}

console.log(`Using ${HOST} as coin-app node for queries and transactions.`);

async function postJSON(url, obj) {
  const response = await got(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(obj),
  });
  return response.body;
}
/**
 * interface tx {
 *   type: string
 *   from: string,
 *   to: string,
 *   amount: number,
 *   timestamp: number
 * }
 */
async function injectTx(tx) {
  try {
    const res = await axios.post(`http://${HOST}/inject`, tx);
    return res.data;
  } catch (err) {
    return err.message;
  }
}

async function getAccountData(id) {
  try {
    // If we pass in an id, get the account info for that id, otherwise get all the accounts
    const res = await axios.get(
      `http://${HOST}/${id ? "account/" + id : "accounts"}`
    );
    return res.data;
  } catch (err) {
    return err.message;
  }
}

vorpal
  .command(
    "use <host>",
    "Uses the given <host> as the coin-app node for queries and transactions."
  )
  .action(function (args, callback) {
    HOST = args.host;
    this.log(`Set ${args.host} as coin-app node for transactions.`);
    callback();
  });

// COMMAND TO CREATE A LOCAL WALLET KEYPAIR
vorpal
  .command("wallet create <name>", "creates a wallet <name>")
  .action(function (args, callback) {
    if (
      typeof walletEntries[args.name] !== "undefined" &&
      walletEntries[args.name] !== null
    ) {
      return walletEntries[args.name];
    } else {
      const user = createEntry(args.name, args.id);
      return user;
    }
  });
vorpal
  .command(
    "wallet list [name]",
    "Lists wallet for the given [name]. Otherwise, lists all wallets."
  )
  .action(function (args, callback) {
    let wallet = walletEntries[args.name];
    if (typeof wallet !== "undefined" && wallet !== null) {
      this.log(`${JSON.stringify(wallet, null, 2)}`);
    } else {
      this.log(`${JSON.stringify(walletEntries, null, 2)}`);
    }
    callback();
  });
vorpal
  .command("use <name>", "uses <name> wallet for transactions")
  .action(function (args, callback) {
    USER = vorpal.execSync("wallet create " + args.name);
    this.log("Now using wallet: " + args.name);
    callback();
  }); // COMMAND TO SET THE HOST IP:PORT
vorpal
  .command(
    "use host <host>",
    "uses <host> as the node for queries and transactions"
  )
  .action(function (args, callback) {
    HOST = args.host;
    this.log(`Setting ${args.host} as node for queries and transactions.`);
    callback();
  });
vorpal
  .command(
    "tokens create <amount> <to>",
    "Creates <amount> tokens for the <to> wallet."
  )
  .action(function (args, callback) {
    let toId = walletEntries[args.to];
    if (typeof toId === "undefined" || toId === null) {
      toId = createEntry(args.to);
      this.log(`Created wallet '${args.to}': '${toId}'.`);
    }
    injectTx({
      type: "create",
      from: "0".repeat(32),
      to: toId,
      amount: args.amount,
    }).then((res) => {
      this.log(res);
      callback();
    });
  });

vorpal
  .command(
    "tokens transfer <amount> <from> <to>",
    "Transfers <amount> tokens from the <from> wallet to the <to> wallet."
  )
  .action(function (args, callback) {
    const fromId = walletEntries[args.from];
    if (typeof fromId === "undefined" || fromId === null) {
      this.log(`Wallet '${args.from}' does not exist.`);
      this.callback();
    }
    let toId = walletEntries[args.to];
    if (typeof toId === "undefined" || toId === null) {
      toId = createEntry(args.to);
      this.log(`Created wallet '${args.to}': '${toId}'.`);
    }
    injectTx({
      type: "transfer",
      from: fromId,
      to: toId,
      amount: args.amount,
    }).then((res) => {
      this.log(res);
      callback();
    });
  });
// COMMAND TO CREATE TOKENS FOR USER
vorpal.command('create', 'submits a create transaction').action(async function(args, callback) {
  const answers = await this.prompt({
    type: 'number',
    name: 'amount',
    message: 'Enter number of tokens to create: ',
    default: 100,
    filter: value => parseInt(value),
  })
  const tx = {
    type: 'create',
    from: USER.address,
    to: USER.address,
    amount: answers.amount,
    timestamp: Date.now(),
  }
  injectTx(tx).then(res => {
    this.log(res)
    callback()
  })
})

// COMMAND TO TRANSFER TOKENS FROM ONE ACCOUNT TO ANOTHER
vorpal.command('transfer', 'transfers tokens to another account').action(async function(_, callback) {
  const answers = await this.prompt([
    {
      type: 'input',
      name: 'target',
      message: 'Enter the target account: ',
    },
    {
      type: 'number',
      name: 'amount',
      message: 'How many tokens do you want to send: ',
      default: 50,
      filter: value => parseInt(value),
    },
  ])
  const to = walletEntries[answers.target].address
  if (!to) {
    this.log(`No wallet entry for ${answers.target}`)
    callback()
    return
  }
  const tx = {
    type: 'transfer',
    from: USER.address,
    to: to,
    amount: answers.amount,
    timestamp: Date.now(),
  }
  injectTx(tx).then(res => {
    this.log(res)
    callback()
  })
})
vorpal
  .command('query [account]', 'Queries network data for the account associated with the given [wallet]. Otherwise, gets all network data.')
  .action(async function (args, callback) {
    let address
    if (args.account !== undefined) address = walletEntries[args.account].address
    this.log(`Querying network for ${address ? args.account : 'all data'} `)
    const data = await getAccountData(address)
    this.log(data)
    callback()
  })
  vorpal.command('init', 'sets the user wallet if it exists, else creates it').action(function(_, callback) {
    this.prompt(
      {
        type: 'input',
        name: 'user',
        message: 'Enter wallet name: ',
      },
      result => {
        callback(null, vorpal.execSync('wallet create ' + result.user))
      },
    )
  })
vorpal.delimiter("client$").show();
vorpal.exec('init').then(res => (USER = res)) // Set's USER variable