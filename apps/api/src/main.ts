import { bootstrapApi } from "./app/bootstrap.ts";
import { startHttpServer } from "./app/server.ts";

const { config, app } = bootstrapApi();

startHttpServer(app, config.port).then(() => {
  console.log(`PrepshipV2 API listening on http://127.0.0.1:${config.port}`);
});

