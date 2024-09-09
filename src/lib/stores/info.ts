import type { Info } from "$lib/types";
import { writable, type Writable } from "svelte/store";

const info: Writable<Info> = writable();

export default info;