import type { Slots } from "$lib/types";
import { writable, type Writable } from "svelte/store";

const slots: Writable<Slots> = writable({}); 

export default slots;