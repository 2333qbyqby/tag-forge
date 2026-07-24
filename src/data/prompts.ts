import promptCatalog from "../../data-src/prompts.json";
import type { PromptRecord } from "../engine/v2-types";

interface PromptFile {
  dataVersion: string;
  prompts: PromptRecord[];
}

const typedPrompts = promptCatalog as PromptFile;

export const PROMPT_DATA_VERSION = typedPrompts.dataVersion;
export const prompts = typedPrompts.prompts;
