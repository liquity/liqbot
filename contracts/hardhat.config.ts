import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
  paths: {
    sources: "src"
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          }
        }
      }
    ]
  },
  networks: {
    external: {
      url: process.env.RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined
    }
  }
};

task("deploy", "Deploy the liquidation executor contract", async (_args, hre) => {
  const LiqbotExecutor = await hre.ethers.getContractFactory("LiqbotExecutor");
  const executor = await LiqbotExecutor.deploy();

  console.log("Successfully deployed LiqbotExecutor! Address:");
  console.log(executor.address);
});

export default config;
