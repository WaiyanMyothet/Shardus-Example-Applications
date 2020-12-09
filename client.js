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
let USER;
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
// USED TO GET THE TOLL AMOUNT BETWEEN 2 USERS
async function getToll(friendId, yourId) {
  try {
    const res = await axios.get(
      `http://${HOST}/account/${friendId}/${yourId}/toll`
    );
    return { toll: res.data.toll };
  } catch (error) {
    return { error: error };
  }
}

// USED TO GET THE PUBLIC_KEY OF OF AN ACCOUNT FROM THIER ALIAS
async function getAddress(handle) {
  if (handle.length === 64) return handle;
  try {
    const res = await axios.get(
      `http://${HOST}/address/${crypto.hash(handle)}`
    );
    const { address, error } = res.data;
    if (error) {
      console.log(error);
    } else {
      return address;
    }
  } catch (error) {
    console.log(error);
  }
}

// USED TO QUERY MESSAGES
async function queryMessages(to, from) {
  try {
    const res = await axios.get(
      `http://${HOST}/messages/${crypto.hash([from, to].sort().join``)}`
    );
    const { messages } = res.data;
    return messages;
  } catch (error) {
    return error;
  }
}
// COMMAND TO TRANSFER TOKENS FROM ONE ACCOUNT TO ANOTHER
vorpal
  .command("transfer", "transfers tokens to another account")
  .action(async function (_, callback) {
    const answers = await this.prompt([
      {
        type: "input",
        name: "target",
        message: "Enter the target account: ",
      },
      {
        type: "number",
        name: "amount",
        message: "How many tokens do you want to send: ",
        default: 50,
        filter: (value) => parseInt(value),
      },
    ]);
    const to = await getAddress(answers.target);
    const tx = {
      type: "transfer",
      from: USER.address,
      to: to,
      amount: answers.amount,
      timestamp: Date.now(),
    };
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey);
    injectTx(tx).then((res) => {
      this.log(res);
      callback();
    });
  });
// COMMAND TO REGISTER AN ALIAS FOR A USER ACCOUNT
vorpal
  .command("register", "registers a unique alias for your account")
  .action(async function (args, callback) {
    const answer = await this.prompt({
      type: "input",
      name: "alias",
      message: "Enter the alias you want: ",
    });
    const tx = {
      type: "register",
      aliasHash: crypto.hash(answer.alias),
      from: USER.address,
      alias: answer.alias,
      timestamp: Date.now(),
    };
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey);
    injectTx(tx).then((res) => {
      this.log(res);
      callback();
    });
  });

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
vorpal
  .command("create", "submits a create transaction")
  .action(async function (args, callback) {
    const answers = await this.prompt({
      type: "number",
      name: "amount",
      message: "Enter number of tokens to create: ",
      default: 100,
      filter: (value) => parseInt(value),
    });
    const tx = {
      type: "create",
      from: USER.address,
      to: USER.address,
      amount: answers.amount,
      timestamp: Date.now(),
    };
    injectTx(tx).then((res) => {
      this.log(res);
      callback();
    });
  });

// COMMAND TO TRANSFER TOKENS FROM ONE ACCOUNT TO ANOTHER
vorpal
  .command("transfer", "transfers tokens to another account")
  .action(async function (_, callback) {
    const answers = await this.prompt([
      {
        type: "input",
        name: "target",
        message: "Enter the target account: ",
      },
      {
        type: "number",
        name: "amount",
        message: "How many tokens do you want to send: ",
        default: 50,
        filter: (value) => parseInt(value),
      },
    ]);
    const to = walletEntries[answers.target].address;
    if (!to) {
      this.log(`No wallet entry for ${answers.target}`);
      callback();
      return;
    }
    const tx = {
      type: "transfer",
      from: USER.address,
      to: to,
      amount: answers.amount,
      timestamp: Date.now(),
    };
    injectTx(tx).then((res) => {
      this.log(res);
      callback();
    });
  });
vorpal
  .command(
    "query [account]",
    "Queries network data for the account associated with the given [wallet]. Otherwise, gets all network data."
  )
  .action(async function (args, callback) {
    let address;
    if (args.account !== undefined)
      address = walletEntries[args.account].address;
    this.log(`Querying network for ${address ? args.account : "all data"} `);
    const data = await getAccountData(address);
    this.log(data);
    callback();
  });
// COMMAND TO SEND A MESSAGE TO ANOTHER USER ON THE NETWORK
vorpal
  .command("message", "sends a message to another user")
  .action(async function (_, callback) {
    const answers = await this.prompt([
      {
        type: "input",
        name: "to",
        message: "Enter the alias or publicKey of the target: ",
      },
      {
        type: "input",
        name: "message",
        message: "Enter the message: ",
      },
    ]);
    const to = await getAddress(answers.to);
    const data = await getAccountData(USER.address);
    const handle = data.account.alias;
    if (to === undefined || to === null) {
      this.log("Account doesn't exist for: ", answers.to);
      callback();
    }
    const result = await getToll(to, USER.address);
    if (result.error) {
      this.log(`There was an error retrieving the toll for ${answers.to}`);
      this.log(result.error);
      callback();
    } else {
      const answer = await this.prompt({
        type: "list",
        name: "confirm",
        message: `The toll for sending this user a message is ${result.toll}, continue? `,
        choices: [
          { name: "yes", value: true, short: true },
          { name: "no", value: false, short: false },
        ],
        default: "yes",
      });
      if (answer.confirm) {
        const message = stringify({
          body: answers.message,
          handle,
          timestamp: Date.now(),
        });
        const encryptedMsg = crypto.encrypt(
          message,
          crypto.convertSkToCurve(USER.keys.secretKey),
          crypto.convertPkToCurve(to)
        );
        const tx = {
          type: "message",
          from: USER.address,
          to: to,
          chatId: crypto.hash([USER.address, to].sort().join``),
          message: encryptedMsg,
          timestamp: Date.now(),
        };
        crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey);
        injectTx(tx).then((res) => {
          this.log(res);
          callback();
        });
      } else {
        callback();
      }
    }
  });
// COMMAND TO SET A TOLL FOR PEOPLE NOT ON YOUR FRIENDS LIST THAT SEND YOU MESSAGES
vorpal
  .command("toll", "sets a toll people must you in order to send you messages")
  .action(async function (_, callback) {
    const answer = await this.prompt({
      type: "number",
      name: "toll",
      message: "Enter the toll: ",
      filter: (value) => parseInt(value),
    });
    const tx = {
      type: "toll",
      from: USER.address,
      toll: answer.toll,
      timestamp: Date.now(),
    };
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey);
    injectTx(tx).then((res) => {
      this.log(res);
      callback();
    });
  });
  // COMMAND TO ADD A FRIEND TO YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('add friend', 'adds a friend to your account').action(async function(args, callback) {
  const answer = await this.prompt({
    type: 'input',
    name: 'friend',
    message: 'Enter the alias or publicKey of the friend: ',
  })
  const to = await getAddress(answer.friend)
  if (to === undefined || to === null) {
    this.log("Target account doesn't exist for: ", answer.friend)
    callback()
  }
  const tx = {
    type: 'friend',
    alias: answer.friend,
    from: USER.address,
    to: to,
    timestamp: Date.now(),
  }
  crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
  injectTx(tx).then(res => {
    this.log(res)
    callback()
  })
});
// COMMAND TO REMOVE A FRIEND FROM YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('remove friend', 'removes a friend from your account').action(async function(_, callback) {
  const answer = await this.prompt({
    type: 'input',
    name: 'friend',
    message: 'Enter the alias or publicKey of the friend to remove: ',
  })
  const to = await getAddress(answer.friend)
  if (to === undefined || to === null) {
    this.log("Target account doesn't exist for:", answer.friend)
    callback()
  }
  const tx = {
    type: 'remove_friend',
    from: USER.address,
    to: to,
    timestamp: Date.now(),
  }
  crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
  injectTx(tx).then(res => {
    this.log(res)
    callback()
  })
})
// COMMAND TO POLL FOR MESSAGES BETWEEN 2 USERS AFTER A SPECIFIED TIMESTAMP
vorpal.command('message poll <to>', 'gets messages between you and <to>').action(async function(args, callback) {
  const to = await getAddress(args.to)
  let messages = await queryMessages(USER.address, to)
  messages = messages.map(message => JSON.parse(crypto.decrypt(message, crypto.convertSkToCurve(USER.keys.secretKey), crypto.convertPkToCurve(to)).message))
  this.log(messages)
  callback()
})
vorpal
  .command("init", "sets the user wallet if it exists, else creates it")
  .action(function (_, callback) {
    this.prompt(
      {
        type: "input",
        name: "user",
        message: "Enter wallet name: ",
      },
      (result) => {
        callback(null, vorpal.execSync("wallet create " + result.user));
      }
    );
  });
vorpal.delimiter("client$").show();
vorpal.exec("init").then((res) => (USER = res)); // Set's USER variable
