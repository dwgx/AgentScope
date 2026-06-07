import type { enUS } from "./resources/en-US.js";

export type WidenStrings<T> = T extends string ? string : { [K in keyof T]: WidenStrings<T[K]> };
export type ResourceTree = WidenStrings<typeof enUS>;
