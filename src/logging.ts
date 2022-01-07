import util from "util";
import chalk from "chalk";

const consoleLog = console.log.bind(console);

export const log = (message: string): void =>
  consoleLog(`${chalk.dim(`[${new Date().toLocaleTimeString()}]`)} ${message}`);

export const info = (message: string): void => log(`${chalk.blue("ℹ")} ${message}`);
export const warn = (message: string): void => log(`${chalk.yellow("‼")} ${message}`);
export const error = (message: string): void => log(`${chalk.red("✖")} ${message}`);
export const success = (message: string): void => log(`${chalk.green("✔")} ${message}`);

Object.assign(globalThis.console, {
  log: (...args: Parameters<typeof util.format>) => log(`${chalk.dim(">")} ${util.format(...args)}`)
});
