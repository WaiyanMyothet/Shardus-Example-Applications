const fs = require("fs");
const path = require("path");
const merge = require("deepmerge");
const stringify = require("fast-stable-stringify");
const shardus = require("shardus-global-server-dist").default;
const crypto = require("shardus-crypto-utils");
crypto.init("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

const overwriteMerge = (target, source, options) => source;

let config = { server: { baseDir: "./" } };

if (fs.existsSync(path.join(process.cwd(), "config.json"))) {
  const fileConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "config.json"))
  );
  config = merge(config, fileConfig, { arrayMerge: overwriteMerge });
}

if (process.env.BASE_DIR) {
  const baseDirFileConfig = JSON.parse(
    fs.readFileSync(path.join(process.env.BASE_DIR, "config.json"))
  );
  config = merge(config, baseDirFileConfig, { arrayMerge: overwriteMerge });
  config.server.baseDir = process.env.BASE_DIR;
}

if (process.env.APP_SEEDLIST) {
  config = merge(
    config,
    {
      server: {
        p2p: {
          existingArchivers: [
            {
              ip: process.env.APP_SEEDLIST,
              port: 4000,
              publicKey:
                "758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3",
            },
          ],
        },
      },
    },
    { arrayMerge: overwriteMerge }
  );
}

if (process.env.APP_MONITOR) {
  config = merge(
    config,
    {
      server: {
        reporting: {
          recipient: `http://${process.env.APP_MONITOR}:3000/api`,
        },
      },
    },
    { arrayMerge: overwriteMerge }
  );
}

if (process.env.APP_IP) {
  config = merge(
    config,
    {
      server: {
        ip: {
          externalIp: process.env.APP_IP,
          internalIp: process.env.APP_IP,
        },
      },
    },
    { arrayMerge: overwriteMerge }
  );
}

// Setting minNodesToAllowTxs to 1 allow single node networks
config = merge(config, {
  server: {
    p2p: {
      minNodesToAllowTxs: 1,
    },
  },
});

const dapp = shardus(config);

/**
 * interface account {
 *   id: string,        // 32 byte hex string
 *   hash: string,      // 32 byte hex string
 *   timestamp: number, // ms since epoch
 *   data: {
 *     balance: number
 *   }
 * }
 *
 * interface accounts {
 *   [id: string]: account
 * }
 */
let accounts = {};
function setAccountData(accountsToAdd = []) {
  for (const account of accountsToAdd) {
    accounts[account.id] = account;
  }
}
// CREATE A USER ACCOUNT
function createAccount(id) {
  const account = {
    id: id,
    data: {
      balance: 50,
      toll: null,
      chats: {},
      friends: {},
    },
    alias: null,
    hash: "",
    timestamp: 0,
  };
  account.hash = crypto.hashObj(account);
  return account;
}

function createChat(id) {
  const chat = {
    id: id,
    messages: [], // The messages between two users in a chat
    timestamp: 0,
    hash: "",
  };
  chat.hash = crypto.hashObj(chat);
  return chat;
}

function createAlias(id) {
  const alias = {
    id: id,
    hash: "",
    inbox: "",
    address: "",
    timestamp: 0,
  };
  alias.hash = crypto.hashObj(alias);
  return alias;
}

dapp.registerExternalPost("inject", async (req, res) => {
  console.log(req.body);
  try {
    const response = dapp.put(req.body);
    res.json(response);
  } catch (err) {
    console.log("Failed to inject tx: ", err);
  }
});

dapp.registerExternalGet("account/:id", async (req, res) => {
  const id = req.params["id"];
  const account = accounts[id] || null;
  res.json({ account });
});

dapp.registerExternalGet("account/:id/alias", async (req, res) => {
  try {
    const id = req.params["id"];
    const account = await dapp.getLocalOrRemoteAccount(id);
    res.json({ handle: account && account.data.alias });
  } catch (error) {
    res.json({ error });
  }
});

dapp.registerExternalGet("account/:id/toll", async (req, res) => {
  try {
    const id = req.params["id"];
    const account = await dapp.getLocalOrRemoteAccount(id);
    if (account) {
      if (!account.data.data.toll) {
        res.json({ toll: 0 });
      } else {
        res.json({ toll: account.data.data.toll });
      }
    } else {
      res.json({ error: "No account with the given id" });
    }
  } catch (error) {
    res.json({ error });
  }
});

dapp.registerExternalGet("address/:name", async (req, res) => {
  try {
    const name = req.params["name"];
    const account = await dapp.getLocalOrRemoteAccount(name);
    if (account && account.data) {
      res.json({ address: account.data.address });
    } else {
      res.json({ error: "No account exists for the given handle" });
    }
  } catch (error) {
    res.json({ error });
  }
});

dapp.registerExternalGet("account/:id/:friendId/toll", async (req, res) => {
  const id = req.params["id"];
  const friendId = req.params["friendId"];
  if (!id) {
    res.json({
      error: "No provided id in the route: account/:id/:friendId/toll",
    });
  }
  if (!friendId) {
    res.json({
      error: "No provided friendId in the route: account/:id/:friendId/toll",
    });
  }
  try {
    const account = await dapp.getLocalOrRemoteAccount(id);
    if (account) {
      if (account.data.data.friends[friendId]) {
        res.json({ toll: 0 });
      } else {
        if (account.data.data.toll === null) {
          res.json({ toll: 0 });
        } else {
          res.json({ toll: account.data.data.toll });
        }
      }
    } else {
      res.json({ error: "No account with the given id" });
    }
  } catch (error) {
    res.json({ error });
  }
});

dapp.registerExternalGet("account/:id/friends", async (req, res) => {
  try {
    const id = req.params["id"];
    const account = await dapp.getLocalOrRemoteAccount(id);
    if (account) {
      res.json({ friends: account.data.data.friends });
    } else {
      res.json({ error: "No account for given id" });
    }
  } catch (error) {
    dapp.log(error);
    res.json({ error });
  }
});
dapp.registerExternalGet("messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await dapp.getLocalOrRemoteAccount(chatId);
    dapp.log(chat);
    if (!chat) {
      res.json({ error: "Chat doesn't exist" });
      return;
    }
    if (!chat.data.messages) {
      res.json({ error: "no chat history for this request" });
    } else {
      res.json({ messages: chat.data.messages });
    }
  } catch (error) {
    res.json({ error });
  }
});
dapp.registerExternalGet("accounts", async (req, res) => {
  res.json({ accounts });
});

/**
 * interface tx {
 *   type: string
 *   from: string,
 *   to: string,
 *   amount: number,
 *   timestamp: number
 * }
 */
dapp.setup({
  validateTransaction(tx) {
    const response = {
      result: "fail",
      reason: "Transaction is not valid.",
    };

    // Validate tx here
    if (tx.amount < 0) {
      response.reason = '"amount" must be non-negative.';
      return response;
    }
    switch (tx.type) {
      case "register": {
        const alias =
          wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data;
        if (tx.sign.owner !== tx.from) {
          response.reason = "not signed by from account";
          return response;
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = "incorrect signing";
          return response;
        }
        if (!alias) {
          response.reason = "Alias account was not found for some reason";
          return response;
        }
        if (alias.inbox === tx.alias) {
          response.reason = "This alias is already taken";
          return response;
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      }
      case "create":
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      case "transfer":
        const from = accounts[tx.from];
        if (typeof from === "undefined" || from === null) {
          response.reason = '"from" account does not exist.';
          return response;
        }
        if (from.data.balance < tx.amount) {
          response.reason = '"from" account does not have sufficient funds.';
          return response;
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      case "message": {
        const from = wrappedStates[tx.from].data;
        const to = wrappedStates[tx.to].data;
        if (tx.sign.owner !== tx.from) {
          response.reason = "not signed by from account";
          return response;
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = "incorrect signing";
          return response;
        }
        if (typeof from === "undefined" || from === null) {
          response.reason = '"from" account does not exist.';
          return response;
        }
        if (typeof to === "undefined" || to === null) {
          response.reason = '"target" account does not exist.';
          return response;
        }
        if (to.data.friends[tx.from]) {
          response.result = "pass";
          response.reason = "This transaction is valid!";
          return response;
        } else {
          if (to.data.toll === null) {
            response.result = "pass";
            response.reason = "This transaction is valid!";
            return response;
          } else {
            if (from.data.balance < to.data.toll) {
              response.reason = "from account does not have sufficient funds.";
              return response;
            }
          }
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      }
      case "friend": {
        const from = wrappedStates[tx.from].data;
        if (typeof from === "undefined" || from === null) {
          response.reason = "from account does not exist";
          return response;
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = "not signed by from account";
          return response;
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = "incorrect signing";
          return response;
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      }
      case "toll": {
        const from = wrappedStates[tx.from].data;
        if (tx.sign.owner !== tx.from) {
          response.reason = "not signed by from account";
          return response;
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = "incorrect signing";
          return response;
        }
        if (!from) {
          response.reason = "from account does not exist";
          return response;
        }
        if (!tx.toll) {
          response.reason = "Toll was not defined in the transaction";
          return response;
        }
        if (tx.toll < 1) {
          response.reason = "Toll must be greater than or equal to 1";
          return response;
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      }
      case "remove_friend": {
        const from = wrappedStates[tx.from].data;
        if (typeof from === "undefined" || from === null) {
          response.reason = "from account does not exist";
          return response;
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = "not signed by from account";
          return response;
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = "incorrect signing";
          return response;
        }
        response.result = "pass";
        response.reason = "This transaction is valid!";
        return response;
      }
      default:
        response.reason = '"type" must be "create" or "transfer".';
        return response;
    }
  },
  validateTxnFields(tx) {
    // Validate tx fields here
    let success = true;
    let reason = "";
    const txnTimestamp = tx.timestamp;

    if (typeof tx.type !== "string") {
      success = false;
      reason = '"type" must be a string.';
      throw new Error(reason);
    }
    if (typeof tx.from !== "string") {
      success = false;
      reason = '"from" must be a string.';
      throw new Error(reason);
    }
    if (typeof tx.to !== "string") {
      success = false;
      reason = '"to" must be a string.';
      throw new Error(reason);
    }
    if (typeof tx.amount !== "number") {
      success = false;
      reason = '"amount" must be a number.';
      throw new Error(reason);
    }
    if (typeof tx.timestamp !== "number") {
      success = false;
      reason = '"timestamp" must be a number.';
      throw new Error(reason);
    }
    switch (tx.type) {
      case "register": {
        if (typeof tx.aliasHash !== "string") {
          success = false;
          reason = '"aliasHash" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.from !== "string") {
          success = false;
          reason = '"From" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.alias !== "string") {
          success = false;
          reason = '"alias" must be a string.';
          throw new Error(reason);
        }
        if (tx.alias.length >= 20) {
          success = false;
          reason = '"alias" must be less than 21 characters (20 max)';
          throw new Error(reason);
        }
        break;
      }
      case "message": {
        if (typeof tx.from !== "string") {
          success = false;
          reason = '"From" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.to !== "string") {
          success = false;
          reason = '"To" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.message !== "string") {
          success = false;
          reason = '"Message" must be a string.';
          throw new Error(reason);
        }
        if (tx.message.length > 5000) {
          success = false;
          reason = '"Message" length must be less than 5000 characters.';
          throw new Error(reason);
        }
        break;
      }
      case "toll": {
        if (typeof tx.from !== "string") {
          success = false;
          reason = '"From" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.toll !== "number") {
          success = false;
          reason = '"Toll" must be a number.';
          throw new Error(reason);
        }
        if (tx.toll < 1) {
          success = false;
          reason = 'Minimum "toll" allowed is 1 token';
          throw new Error(reason);
        }
        if (tx.toll > 1000000) {
          success = false;
          reason = "Maximum toll allowed is 1,000,000 tokens.";
          throw new Error(reason);
        }
        break;
      }
      case "friend": {
        if (typeof tx.from !== "string") {
          success = false;
          reason = '"From" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.to !== "string") {
          success = false;
          reason = '"To" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.alias !== "string") {
          success = false;
          reason = '"Message" must be a string.';
          throw new Error(reason);
        }
        break;
      }
      case "remove_friend": {
        if (typeof tx.from !== "string") {
          success = false;
          reason = '"From" must be a string.';
          throw new Error(reason);
        }
        if (typeof tx.to !== "string") {
          success = false;
          reason = '"To" must be a string.';
          throw new Error(reason);
        }
        break;
      }
      // default:
      //   success = false;
      //   reason = '"To" must be a string.';
      //   throw new Error(reason);
    }

    return {
      success,
      reason,
      txnTimestamp,
    };
  },
  apply(tx, wrappedStates) {
    // Validate the tx
    const { result, reason } = this.validateTransaction(tx);
    if (result !== "pass") {
      throw new Error(
        `invalid transaction, reason: ${reason}. tx: ${JSON.stringify(tx)}`
      );
    }
    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    const txId = crypto.hashObj(tx); // compute from tx
    const txTimestamp = tx.timestamp; // get from tx
    console.log("DBG", "attempting to apply tx", txId, "...");
    const applyResponse = dapp.createApplyResponse(txId, txTimestamp);

    // Apply the tx
    switch (tx.type) {
      case "create": {
        // Get the to account
        const to = wrappedStates[tx.to].data;
        if (typeof to === "undefined" || to === null) {
          throw new Error(
            `account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`
          );
        }
        // Increment the to accounts balance
        to.data.balance += tx.amount;
        // Update the to accounts timestamp
        to.timestamp = txTimestamp;
        console.log("DBG", "applied create tx", txId, accounts[tx.to]);
        break;
      }
      case "transfer": {
        // Get the from and to accounts
        const from = wrappedStates[tx.from].data;
        if (typeof from === "undefined" || from === null) {
          throw new Error(
            `from account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`
          );
        }
        const to = wrappedStates[tx.to].data;
        if (typeof to === "undefined" || to === null) {
          throw new Error(
            `to account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`
          );
        }
        // Decrement the from accounts balance
        from.data.balance -= tx.amount;
        // Increment the to accounts balance
        to.data.balance += tx.amount;
        // Update the from accounts timestamp
        from.timestamp = txTimestamp;
        // Update the to accounts timestamp
        to.timestamp = txTimestamp;
        console.log(
          "DBG",
          "applied transfer tx",
          txId,
          accounts[tx.from],
          accounts[tx.to]
        );
        break;
      }
    }
    return applyResponse;
  },
  getKeyFromTransaction(tx) {
    const result = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp,
    };
    switch (tx.type) {
      case "create":
        result.targetKeys = [tx.to];
        break;
      case "transfer":
        result.targetKeys = [tx.to];
        result.sourceKeys = [tx.from];
        break;
      case "register":
        result.sourceKeys = [tx.from]; // Account registering the alias
        result.targetKeys = [tx.aliasHash]; // Alias account that holds the mapping to the User Account
        break;
      case "message":
        result.sourceKeys = [tx.from]; // Account sending the message
        result.targetKeys = [tx.to, tx.chatId]; // [Account receiving message, Chat account holding the messages between the users]
        break;
      case "toll":
        result.sourceKeys = [tx.from]; // Account setting the toll
        break;
      case "friend":
        result.sourceKeys = [tx.from]; // Account adding the friend
        break;
      case "remove_friend":
        result.sourceKeys = [tx.from]; // Account removing the friend
        break;
    }
    result.allKeys = result.allKeys.concat(
      result.sourceKeys,
      result.targetKeys
    );
    return result;
  },
  getStateId(accountAddress, mustExist = true) {
    const account = accounts[accountAddress];
    if (
      (typeof account === "undefined" || account === null) &&
      mustExist === true
    ) {
      throw new Error("Could not get stateId for account " + accountAddress);
    }
    const stateId = account.hash;
    return stateId;
  },
  deleteLocalAccountData() {
    accounts = {};
  },
  setAccountData(accountRecords) {
    let accountsToAdd = [];
    let failedHashes = [];
    for (let { accountId, stateId, data: recordData } of accountRecords) {
      let hash = crypto.hashObj(recordData);
      if (stateId === hash) {
        if (recordData.data) recordData.data = JSON.parse(recordData.data);
        accountsToAdd.push(recordData);
        console.log("setAccountData: " + hash + " txs: " + recordData.txs);
      } else {
        console.log(
          "setAccountData hash test failed: setAccountData for " + accountId
        );
        console.log(
          "setAccountData hash test failed: details: " +
            JSON.stringify({ accountId, hash, stateId, recordData })
        );
        failedHashes.push(accountId);
      }
    }
    console.log("setAccountData: " + accountsToAdd.length);
    setAccountData(accountsToAdd);
    return failedHashes;
  },
  getRelevantData(accountId, tx) {
    let account = accounts[accountId];
    let accountCreated = false;
    // Create the account if it doesn't exist
    if (typeof account === "undefined" || account === null) {
      if (tx.type === "register") {
        if (accountId === tx.aliasHash) {
          account = createAlias(accountId);
          accounts[accountId] = account;
          accountCreated = true;
        }
      } else if (tx.type === "message") {
        if (accountId === tx.chatId) {
          account = createChat(accountId);
          accounts[accountId] = account;
          accountCreated = true;
        }
      }
    }
    // All other transactions will default to creating "User Accounts"
    if (typeof account === "undefined" || account === null) {
      account = createAccount(accountId, tx.timestamp);
      accounts[accountId] = account;
      accountCreated = true;
    }
    // Wrap it for Shardus
    const wrapped = dapp.createWrappedResponse(
      accountId,
      accountCreated,
      account.hash,
      account.timestamp,
      account
    );
    return wrapped;
  },
  apply(tx, wrappedStates) {
    // Validate the tx
    const { result, reason } = this.validateTransaction(tx, wrappedStates);
    if (result !== "pass") {
      throw new Error(
        `invalid transaction, reason: ${reason}. tx: ${JSON.stringify(tx)}`
      );
    }
    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    const txId = crypto.hashObj(tx); // compute txId from tx
    const applyResponse = dapp.createApplyResponse(txId, tx.timestamp);

    switch (tx.type) {
      case "register": {
        const from = wrappedStates[tx.from].data; // grab account data from wrappedStates
        const alias = wrappedStates[tx.aliasHash].data;
        alias.inbox = tx.alias; // set inbox field to the alias
        from.alias = tx.alias; // set alias field on the sender account
        alias.address = tx.from; // set address of sender on the alias account
        alias.timestamp = tx.timestamp; // set timestamps on accounts that were modified
        from.timestamp = tx.timestamp;
        dapp.log("Applied register tx", tx);
        break;
      }
      case "message": {
        const from = wrappedStates[tx.from].data; // grab sender account data from wrappedStates
        const to = wrappedStates[tx.to].data; // grab receiver account data from wrappedStates
        const chat = wrappedStates[tx.chatId].data; // grab chat account data from wrappedStates

        // check whether or not to apply the toll
        if (!to.data.friends[from.id]) {
          if (to.data.toll) {
            from.data.balance -= to.data.toll;
            to.data.balance += to.data.toll;
          }
        }

        // Create a mapping to the chat in each user's chat list
        // so that it can be referenced with ease later
        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = tx.chatId;
        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = tx.chatId;

        // Add the actual chat data to the account holding the messages
        chat.messages.push(tx.message);

        // Add timestamps to the modified accounts
        chat.timestamp = tx.timestamp;
        from.timestamp = tx.timestamp;
        to.timestamp = tx.timestamp;

        dapp.log("Applied message tx", tx);
        break;
      }
      case 'toll': {
        const from = wrappedStates[tx.from].data // grab sender account data from wrappedStates
        from.data.toll = tx.toll // Set the toll field on the sender account
        from.timestamp = tx.timestamp // Add timestamp to the sender account
        dapp.log('Applied toll tx', tx)
        break
      }
      case 'friend': {
        const from = wrappedStates[tx.from].data
        from.data.friends[tx.to] = tx.alias
        from.timestamp = tx.timestamp
        dapp.log('Applied friend tx', from)
        break
      }
      case 'remove_friend': {
        const from = wrappedStates[tx.from].data
        delete from.data.friends[tx.to]
        from.timestamp = tx.timestamp
        dapp.log('Applied remove_friend tx', from)
        break
      }
    }
    return applyResponse
  },
  getAccountData(accountStart, accountEnd, maxRecords) {
    const results = [];
    const start = parseInt(accountStart, 16);
    const end = parseInt(accountEnd, 16);
    // Loop all accounts
    for (const account of Object.values(accounts)) {
      // Skip if not in account id range
      const id = parseInt(account.id, 16);
      if (id < start || id > end) continue;

      // Add to results
      const wrapped = {
        accountId: account.id,
        stateId: account.hash,
        data: account,
        timestamp: account.timestamp,
      };
      results.push(wrapped);

      // Return results early if maxRecords reached
      if (results.length >= maxRecords) return results;
    }
    return results;
  },
  updateAccountFull(wrappedData, localCache, applyResponse) {
    const accountId = wrappedData.accountId;
    const accountCreated = wrappedData.accountCreated;
    const updatedAccount = wrappedData.data;
    // Update hash
    const hashBefore = updatedAccount.hash;
    const hashAfter = crypto.hashObj(updatedAccount.data);
    updatedAccount.hash = hashAfter;
    // Save updatedAccount to db / persistent storage
    accounts[accountId] = updatedAccount;
    // Add data to our required response object
    dapp.applyResponseAddState(
      applyResponse,
      updatedAccount,
      updatedAccount,
      accountId,
      applyResponse.txId,
      applyResponse.txTimestamp,
      hashBefore,
      hashAfter,
      accountCreated
    );
  },
  updateAccountPartial(wrappedData, localCache, applyResponse) {
    this.updateAccountFull(wrappedData, localCache, applyResponse);
  },
  getAccountDataByRange(accountStart, accountEnd, tsStart, tsEnd, maxRecords) {
    const results = [];
    const start = parseInt(accountStart, 16);
    const end = parseInt(accountEnd, 16);
    // Loop all accounts
    for (const account of Object.values(accounts)) {
      // Skip if not in account id range
      const id = parseInt(account.id, 16);
      if (id < start || id > end) continue;
      // Skip if not in timestamp range
      const timestamp = account.timestamp;
      if (timestamp < tsStart || timestamp > tsEnd) continue;
      // Add to results
      const wrapped = {
        accountId: account.id,
        stateId: account.hash,
        data: account,
        timestamp: account.timestamp,
      };
      results.push(wrapped);
      // Return results early if maxRecords reached
      if (results.length >= maxRecords) return results;
    }
    return results;
  },
  calculateAccountHash(account) {
    return crypto.hashObj(account);
  },
  resetAccountData(accountBackupCopies) {
    for (let recordData of accountBackupCopies) {
      // accounts[recordData.id] = recordData

      const account = {
        id: recordData.accountId,
        hash: recordData.hash,
        timestamp: recordData.timestamp,
        data: recordData.data.data,
      };

      accounts[account.id] = account;
    }
  },
  deleteAccountData(addressList) {
    for (const address of addressList) {
      delete accounts[address];
    }
  },
  getAccountDataByList(addressList) {
    const results = [];
    for (const address of addressList) {
      const account = accounts[address];
      if (account) {
        const wrapped = {
          accountId: account.id,
          stateId: account.hash,
          data: account,
          timestamp: account.timestamp,
        };
        results.push(wrapped);
      }
    }
    return results;
  },
  getAccountDebugValue(wrappedAccount) {
    return `${stringify(wrappedAccount)}`;
  },
  close() {
    console.log("Shutting down...");
  },
});

dapp.registerExceptionHandler();

dapp.start();
