import { compileData } from "../engine/indexes";
import { tags } from "./catalog";
import { relations } from "./relations";

export { DATA_VERSION, tags } from "./catalog";
export { relations } from "./relations";

export const compiledData = compileData(tags, relations);

