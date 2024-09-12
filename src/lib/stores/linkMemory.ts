import { localStorageStore } from '@skeletonlabs/skeleton';
import type { Writable } from 'svelte/store';

const linkMemory: Writable<string[]> = localStorageStore('linkMemory', []);

export default linkMemory;
