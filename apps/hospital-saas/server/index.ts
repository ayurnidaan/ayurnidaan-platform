import { app } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
const server = app.listen(config.PORT, config.HOST, () =>
  console.log(`Vaidya API ready at http://${config.HOST}:${config.PORT}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
