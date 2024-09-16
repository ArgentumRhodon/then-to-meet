import type { Info } from '$lib/types';
import type { Writable } from 'svelte/store';
import { persisted } from 'svelte-persisted-store';

const linkMemory: Writable<Info[]> = persisted('linkMemory', new Array());

export default linkMemory;
