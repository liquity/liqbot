import { Decimal, LiquityStoreState, Trove, UserTrove } from "@liquity/lib-base";

const liquidatableInNormalMode = (state: LiquidationState) => (trove: Trove) =>
  trove.collateralRatioIsBelowMinimum(state.price);

const liquidatableInRecoveryMode = (state: LiquidationState) => (trove: Trove) =>
  trove.collateralRatioIsBelowMinimum(state.price) ||
  (trove.collateralRatio(state.price).lt(state.total.collateralRatio(state.price)) &&
    trove.debt.lte(state.lusdInStabilityPool));

const liquidatable = (state: LiquidationState) =>
  state.total.collateralRatioIsBelowCritical(state.price)
    ? liquidatableInRecoveryMode(state)
    : liquidatableInNormalMode(state);

const byDescendingCollateral = ({ collateral: a }: Trove, { collateral: b }: Trove) =>
  b.gt(a) ? 1 : b.lt(a) ? -1 : 0;

export type LiquidationState = Readonly<
  Pick<LiquityStoreState, "total" | "price" | "lusdInStabilityPool">
>;

function tryToOffset(state: LiquidationState, offset: Trove): LiquidationState {
  if (offset.debt.lte(state.lusdInStabilityPool)) {
    // Completely offset
    return {
      ...state,
      lusdInStabilityPool: state.lusdInStabilityPool.sub(offset.debt),
      total: state.total.subtract(offset)
    };
  } else if (state.lusdInStabilityPool.gt(Decimal.ZERO)) {
    // Partially offset, emptying the pool
    return {
      ...state,
      lusdInStabilityPool: Decimal.ZERO,
      total: state.total
        .subtractDebt(state.lusdInStabilityPool)
        .subtractCollateral(offset.collateral.mulDiv(state.lusdInStabilityPool, offset.debt))
    };
  } else {
    // Empty pool, no offset
    return state;
  }
}

const simulateLiquidation = (state: LiquidationState, liquidatedTrove: Trove): LiquidationState => {
  const recoveryMode = state.total.collateralRatioIsBelowCritical(state.price);
  const collateralGasCompensation = liquidatedTrove.collateral.div(200); // 0.5%

  if (!recoveryMode || liquidatedTrove.collateralRatio(state.price) > Decimal.ONE) {
    state = tryToOffset(state, liquidatedTrove.subtractCollateral(collateralGasCompensation));
  }

  return {
    ...state,
    total: state.total.subtractCollateral(collateralGasCompensation)
  };
};

export const selectForLiquidation = (
  candidates: UserTrove[],
  state: LiquidationState,
  limit: number
): UserTrove[] => {
  candidates = candidates.slice().sort(byDescendingCollateral); // bigger Troves first

  const selected: UserTrove[] = [];

  for (let i = 0; i < limit; ++i) {
    const biggestLiquidatableIdx = candidates.findIndex(liquidatable(state));

    if (biggestLiquidatableIdx < 0) {
      break;
    }

    const [trove] = candidates.splice(biggestLiquidatableIdx, 1);
    selected.push(trove);
    state = simulateLiquidation(state, trove);
  }

  return selected;
};
