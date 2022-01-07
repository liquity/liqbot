import { existsSync, copyFileSync } from "fs";

const configFile = "config.ts";
const configTemplateFile = "config.mainnet.ts";

if (!existsSync(configFile)) {
  copyFileSync(configTemplateFile, configFile);
}
