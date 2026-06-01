import { createApiHandler } from "../../server/httpApp.js";
import { loadEnvFiles } from "../../server/env.js";

loadEnvFiles();

export default createApiHandler();
