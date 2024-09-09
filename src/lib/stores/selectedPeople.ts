import type { Person } from "$lib/types";
import { writable, type Writable } from "svelte/store";

const selectedPeople: Writable<Set<Person>> = writable(new Set());

export default selectedPeople;