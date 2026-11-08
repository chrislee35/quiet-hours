import { validateConfig } from "../src/index.ts";
import tuning from "../../../content/config/tuning.json" with { type: "json" };

export const config = validateConfig(tuning);
