import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  provisionBrunoFixtures,
  serializeBrunoDotEnv,
} from "./bruno-local-fixtures.mjs";

const environmentPath = resolve("bruno/.env");
const secretEnvironment = await provisionBrunoFixtures();

writeFileSync(
  environmentPath,
  serializeBrunoDotEnv(secretEnvironment),
  {
    encoding: "utf8",
    mode: 0o600,
  },
);
chmodSync(environmentPath, 0o600);

console.log(
  "Prepared the ignored Bruno environment at bruno/.env without printing credentials.",
);
