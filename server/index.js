import { createServer } from "node:http";
import { createApiHandler } from "./httpApp.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

const port = Number(process.env.PORT || 8787);
const server = createServer(createApiHandler());

server.listen(port, "127.0.0.1", () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});
