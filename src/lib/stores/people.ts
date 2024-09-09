import type { Person } from "$lib/types";
import { writable, type Writable } from "svelte/store";

const people: Writable<Person[]> = writable([]);

export default people;