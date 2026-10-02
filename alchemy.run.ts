// alchemy.run.ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { Bucket } from "./src/bucket.ts";
import Worker from "./src/worker.ts";

export default Alchemy.Stack(
  "MyApp",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const bucket = yield* Bucket;
    const worker = yield* Worker;
    const website = yield* Cloudflare.Website.Foldkit("Website", {
      rootDir: "web",
      env: { VITE_API_URL: worker.url.as<string>() },
    });

    return {
      bucketName: bucket.bucketName,
      url: worker.url,
      crons: worker.crons,
      websiteUrl: website.url,
    };
  }),
);
