import { compileData } from "../engine/indexes";
import { tags } from "./catalog";
import { relations } from "./relations";

export { DATA_VERSION, tags } from "./catalog";
export { PROMPT_DATA_VERSION, prompts } from "./prompts";
export { relations } from "./relations";

export const compiledData = compileData(tags, relations);
