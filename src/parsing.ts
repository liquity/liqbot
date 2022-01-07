import { utils, providers, BigNumber } from "ethers";
import { Decimal, LiquidationDetails, Trove } from "@liquity/lib-base";

// event TroveLiquidated(
//   address indexed _borrower,
//   uint256 _debt,
//   uint256 _coll,
//   uint8 _operation
// );

const troveLiquidatedTopic = utils.keccak256(
  utils.toUtf8Bytes("TroveLiquidated(address,uint256,uint256,uint8)")
);

// event Liquidation(
//   uint256 _liquidatedDebt,
//   uint256 _liquidatedColl,
//   uint256 _collGasCompensation,
//   uint256 _LUSDGasCompensation
// );

const liquidationParamTypes = ["uint256", "uint256", "uint256", "uint256"];

const liquidationTopic = utils.keccak256(
  utils.toUtf8Bytes(`Liquidation(${liquidationParamTypes.join(",")})`)
);

const decimalify = (bigNumber: BigNumber): Decimal =>
  Decimal.fromBigNumberString(bigNumber.toHexString());

export const getLiquidationDetails = (
  troveManagerAddress: string,
  logs: providers.Log[]
): LiquidationDetails => {
  const troveManagerEvents = logs.filter(log => log.address === troveManagerAddress);

  const liquidatedAddresses = troveManagerEvents
    .filter(log => log.topics[0] === troveLiquidatedTopic)
    .map<readonly string[]>(log => utils.defaultAbiCoder.decode(["address"], log.topics[1]))
    .map(([_borrower]) => utils.getAddress(_borrower));

  const [totals] = troveManagerEvents
    .filter(log => log.topics[0] === liquidationTopic)
    .map<readonly BigNumber[]>(log => utils.defaultAbiCoder.decode(liquidationParamTypes, log.data))
    .map(([_liquidatedDebt, _liquidatedColl, _collGasCompensation, _LUSDGasCompensation]) => ({
      collateralGasCompensation: decimalify(_collGasCompensation),
      lusdGasCompensation: decimalify(_LUSDGasCompensation),
      totalLiquidated: new Trove(decimalify(_liquidatedColl), decimalify(_liquidatedDebt))
    }));

  return {
    liquidatedAddresses,
    ...totals
  };
};
