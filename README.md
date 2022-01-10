# `liquity-liqbot` 🤖

A liquidation bot for Liquity Protocol. Features:

- Real-time monitoring via WebSockets
- Smart Trove selection
- Flashbots support

## Prerequisites

- Node v12 or newer
- Yarn v1.22.x ("Classic")

## Installation

After cloning the repo:

```
cd liqbot
yarn
```

## Configuration

The installation step creates a configuration file `config.ts` inside the `liqbot` directory. See the [LiqbotConfig](types/index.d.ts) interface for a description of each configuration field.

At the very least, you should configure the following fields:

- `httpRpcUrl`
- `wsRpcUrl` (optional, but highly recommended)
- `chainId`
- `walletKey`

If you're starting from the default configuration template, you only need to provide an Alchemy API key in addition to `walletKey`. If you're not going to use Alchemy for connecting to Ethereum, you'll need to configure `httpRpcUrl` and `wsRpcUrl` yourself.

### Using Flashbots

If you'd like liqbot to send transactions privately through a Flashbots relay, you'll have to do some additional configuration.

Liqbot uses a [helper contract](contracts/src/LiqbotExecutor.sol) to pay a pre-configured portion of the ETH it receives from liquidation as compensation to the miner. (This portion can be configured using the `minerCutRate` field).

You'll have to deploy an instance of this contract before you can start using liqbot through Flashbots. After configuring the basics (see above), run the following command:

```
yarn deploy
```

If successful, this will print the address of the newly deployed helper contract. Copy and paste this address into the `executorAddress` field of the configuration file.

Additionally, you'll have to configure a `bundleKey`. This is an Ethereum private key just like `walletKey`, but it doesn't need to hold any ETH, and will only be used for identification towards the Flashbots network.

### Testing on Görli testnet

You can use [config.goerli.ts](config.goerli.ts) as an alternate configuration template for testing purposes. Görli is the only testnet currently supported by Flashbots. Be aware that Flashbots only runs a small portion of the validators on the network, so [it can take a long time](https://docs.flashbots.net/flashbots-auction/searchers/advanced/goerli-testnet) to get a bundle included.

## Running

Run this command to start liqbot:

```
yarn start
```

It will keep running and logging liquidation attempts until killed with Ctrl+C.
