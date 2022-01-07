export interface LiqbotConfig {
  /** JSON-RPC URL of Ethereum node. */
  httpRpcUrl: string;

  /** Chain ID of the network the Ethereum node is running on. */
  chainId: number;

  /**
   * Private key of the account that will be used to send liquidation transactions.
   *
   * This account needs to hold enough ETH to pay for the gas costs of liquidation. If omitted,
   * liqbot will run in "read-only" mode where it simply looks for and logs liquidation
   * opportunities, but doesn't act on them.
   */
  walletKey?: string;

  /** Optional WebSocket URL to use for real-time block events. */
  wsRpcUrl?: string;

  /**
   * URL of Flashbots relay to privately send transactions to.
   *
   * When omitted, transactions will be broadcast through the Ethereum node instead (`httpRpcUrl`).
   */
  relayUrl?: string;

  /**
   * The private key to use as Flashbots searcher identity.
   *
   * This private key does not store funds and is not the primary private key used for signing
   * transactions. It is only used for identity, and it can be any private key.
   */
  bundleKey?: string;

  /**
   * Address of an instance of the LiqbotExecutor contract deployed using `walletKey`.
   *
   * To deploy, first make sure `httpRpcUrl`, `chainId` and `walletKey` are configured, then run
   * `yarn deploy`.
   */
  executorAddress?: string;

  /**
   * The fraction of ETH received from liquidation that should be passed on to the miner
   * (if using Flashbots) as a number between 0 and 1.
   */
  minerCutRate?: number;

  /**
   * Maximum priority fee to pay for the transaction per unit of gas consumed, in wei.
   *
   * When using Flashbots, this is 0 by default, as the miner will be compensated through
   * transferring a portion of the liquidation reward instead.
   *
   * When not using Flashbots, the default is 5 Gwei (i.e. 5 billion wei).
   */
  maxPriorityFeePerGas?: number;

  /**
   * Can be used to limit gas costs by putting an upper limit on the number of Troves that will be
   * included in liquidation attempts (default: 10).
   */
  maxTrovesToLiquidate?: number;
}
