import { execFileSync } from "child_process";

import config from "../config.js";

const hasProp = <T, P extends PropertyKey>(o: T, p: P): o is T & { [_ in P]: unknown } =>
  typeof o === "object" && o !== null && p in o;

try {
  execFileSync(
    "yarn",
    [
      "--cwd",
      "contracts",
      "deploy",
      ...(config.httpRpcUrl ? ["--network", "external"] : []),
      ...process.argv.slice(2)
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PRIVATE_KEY: config.walletKey,
        RPC_URL: config.httpRpcUrl
      }
    }
  );
} catch (err: unknown) {
  if (hasProp(err, "status") && typeof err.status === "number") {
    process.exit(err.status);
  } else {
    throw err;
  }
}
