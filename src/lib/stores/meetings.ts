import type { Meetings } from '$lib/types';
import { writable, type Writable } from 'svelte/store';

const meetings: Writable<Meetings> = writable<Meetings>({});

export default meetings;
