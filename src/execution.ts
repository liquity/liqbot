import assert from "assert";

import {
  BigNumberish,
  BytesLike,
  Contract,
  Overrides,
  PopulatedTransaction,
  providers,
  Signer,
  // utils,
  Wallet
} from "ethers";

import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
  RelayResponseError
} from "@flashbots/ethers-provider-bundle";

import {
  Decimal,
  Decimalish,
  LiquidationDetails,
  LUSD_LIQUIDATION_RESERVE,
  MinedReceipt,
  Trove
} from "@liquity/lib-base";

import { BlockPolledLiquityStore, PopulatedEthersLiquityTransaction } from "@liquity/lib-ethers";

import config from "../config.js";
import { LiqbotConfig } from "../types/index.js";
import { warn } from "./logging.js";
import { getLiquidationDetails } from "./parsing.js";

const abi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        type: "address",
        name: "to"
      },
      {
        type: "bytes",
        name: "data"
      },
      {
        type: "uint256",
        name: "coinbaseCutRate"
      },
      {
        type: "address[]",
        name: "sweepTokens"
      }
    ],
    stateMutability: "nonpayable",
    outputs: []
  }
];

export interface ExecutionDetails extends LiquidationDetails {
  minerCut?: Decimal;
}

export type ExecutionResult =
  | { status: "failed"; rawReceipt?: providers.TransactionReceipt }
  | { status: "succeeded"; rawReceipt: providers.TransactionReceipt; details: ExecutionDetails };

export interface Executor {
  estimateCompensation(troves: Trove[], price: Decimalish): Decimal;

  execute(
    liquidation: PopulatedEthersLiquityTransaction<LiquidationDetails>
  ): Promise<ExecutionResult>;
}

const addTroves = (troves: Trove[]) => troves.reduce((a, b) => a.add(b), new Trove());

const expectedCompensation = (
  troves: Trove[],
  price: Decimalish,
  minerCutRate: Decimalish = Decimal.ZERO
) =>
  addTroves(troves)
    .collateral.mulDiv(price, 200) // 0.5% of collateral converted to USD
    .mul(Decimal.ONE.sub(minerCutRate)) // deduct miner's cut
    .add(LUSD_LIQUIDATION_RESERVE.mul(troves.length));

class RawExecutor implements Executor {
  estimateCompensation(troves: Trove[], price: Decimalish): Decimal {
    return expectedCompensation(troves, price);
  }

  async execute(
    liquidation: PopulatedEthersLiquityTransaction<LiquidationDetails>
  ): Promise<MinedReceipt<providers.TransactionReceipt, LiquidationDetails>> {
    const tx = await liquidation.send();

    return tx.waitForReceipt();
  }
}

class LiqbotExecutorContract extends Contract {
  constructor(addressOrName: string, signerOrProvider?: Signer | providers.Provider) {
    super(addressOrName, abi, signerOrProvider);
  }
}

interface LiqbotExecutorContract {
  readonly populateTransaction: {
    execute(
      to: string,
      data: BytesLike,
      coinbaseCutRate: BigNumberish,
      sweepTokens: string[],
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}

const assertBaseProvider = (provider: providers.Provider): providers.BaseProvider => {
  if (!(provider instanceof providers.BaseProvider)) {
    throw new Error("Flashbots expects provider to be a subclass of BaseProvider");
  }

  return provider;
};

const defaultMinerCutRate = 0.1;

class FlashbotsRelayError extends Error {
  readonly code: number;

  constructor({ error }: RelayResponseError) {
    super(error.message);
    this.name = "FlashbotsRelayError";
    this.code = error.code;
  }
}

class LiqbotExecutor implements Executor {
  private readonly _store: BlockPolledLiquityStore;
  private readonly _signer: Signer;
  private readonly _bundleProvider: FlashbotsBundleProvider;
  private readonly _contract: LiqbotExecutorContract;
  private readonly _minerCutRate: Decimal;

  constructor(
    store: BlockPolledLiquityStore,
    signer: Signer,
    bundleProvider: FlashbotsBundleProvider,
    executorAddress: string,
    config: LiqbotConfig
  ) {
    let minerCutRate = config.minerCutRate;

    if (minerCutRate == null) {
      warn(`No 'minerCutRate' configured; using default value of ${defaultMinerCutRate}.`);
      minerCutRate = defaultMinerCutRate;
    }

    if (minerCutRate < 0 || minerCutRate > 1) {
      throw new Error("'minerCutRate' must be a number between 0 and 1");
    }

    this._store = store;
    this._signer = signer;
    this._bundleProvider = bundleProvider;
    this._contract = new LiqbotExecutorContract(executorAddress, signer);
    this._minerCutRate = Decimal.from(minerCutRate);
  }

  static async create(
    store: BlockPolledLiquityStore,
    signer: Signer,
    executorAddress: string,
    config: LiqbotConfig
  ): Promise<LiqbotExecutor> {
    if (config.bundleKey == null) {
      throw new Error("you must configure 'bundleKey' when using Flashbots");
    }

    const bundleProvider = await FlashbotsBundleProvider.create(
      assertBaseProvider(store.connection.provider),
      new Wallet(config.bundleKey, store.connection.provider),
      config.relayUrl
    );

    return new LiqbotExecutor(store, signer, bundleProvider, executorAddress, config);
  }

  async execute(
    liquidation: PopulatedEthersLiquityTransaction<LiquidationDetails>
  ): Promise<ExecutionResult> {
    assert(liquidation.rawPopulatedTransaction.to);
    assert(liquidation.rawPopulatedTransaction.data);

    const latestBlock =
      this._store.state.blockTag ?? (await this._store.connection.provider.getBlockNumber());

    const transaction = await this._contract.populateTransaction.execute(
      liquidation.rawPopulatedTransaction.to,
      liquidation.rawPopulatedTransaction.data,
      this._minerCutRate.hex,
      [this._store.connection.addresses["lusdToken"]],
      {
        nonce: this._signer.getTransactionCount(latestBlock), // ignore pending TXs
        gasLimit: liquidation.rawPopulatedTransaction.gasLimit?.add(50000), // LiqbotExecutor overhead
        maxFeePerGas: liquidation.rawPopulatedTransaction.maxFeePerGas,
        maxPriorityFeePerGas: liquidation.rawPopulatedTransaction.maxPriorityFeePerGas
      }
    );

    const populatedTransaction = await this._signer.populateTransaction(transaction);
    const signedTransaction = await this._signer.signTransaction(populatedTransaction);
    const signedBundle = await this._bundleProvider.signBundle([{ signedTransaction }]);

    // signedBundle.forEach(signedTx => console.log(utils.parseTransaction(signedTx)));

    const simulation = await this._bundleProvider.simulate(signedBundle, latestBlock + 1);

    if ("error" in simulation) {
      throw new FlashbotsRelayError(simulation);
    }

    const flashbotsTx = await this._bundleProvider.sendRawBundle(signedBundle, latestBlock + 1);

    if ("error" in flashbotsTx) {
      throw new FlashbotsRelayError(flashbotsTx);
    }

    const resolution = await flashbotsTx.wait();

    if (resolution !== FlashbotsBundleResolution.BundleIncluded) {
      return { status: "failed" };
    }

    const [rawReceipt] = await flashbotsTx.receipts();

    if (!rawReceipt.status) {
      return { status: "failed", rawReceipt };
    }

    const details = getLiquidationDetails(
      this._store.connection.addresses["troveManager"],
      rawReceipt.logs
    );

    return {
      status: "succeeded",
      rawReceipt,
      details: {
        ...details,
        minerCut: details.collateralGasCompensation.mul(this._minerCutRate)
      }
    };
  }

  estimateCompensation(troves: Trove[], price: Decimalish): Decimal {
    return expectedCompensation(troves, price, this._minerCutRate);
  }
}

export const getExecutor = async (store: BlockPolledLiquityStore): Promise<Executor> => {
  return store.connection.signer && config.executorAddress
    ? LiqbotExecutor.create(store, store.connection.signer, config.executorAddress, config)
    : new RawExecutor();
};
