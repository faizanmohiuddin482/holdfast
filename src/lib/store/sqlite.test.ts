import { storeContract } from "./contract";
import { createSqliteStore } from "./sqlite";

storeContract("SQLite", () => createSqliteStore(":memory:"));
