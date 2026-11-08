import { validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };

export const config = validateConfig(tuning);
