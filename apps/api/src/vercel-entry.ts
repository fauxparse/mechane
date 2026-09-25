import { attachDatabasePool } from "@vercel/functions";

import { pool } from "./db/client";
import { httpHandler } from "./http-handler";

attachDatabasePool(pool);

export default httpHandler;
