import "dotenv/config";

import { createApp } from "./app.js";

const port = Number(process.env.PORT || 5051);
const app = createApp();

app.listen(port, () => {
  console.log(`GlobeReady API listening on http://localhost:${port}`);
});
