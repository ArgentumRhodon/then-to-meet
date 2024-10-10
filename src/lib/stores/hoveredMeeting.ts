import type { MeetingData } from "$lib/types";
import { writable, type Writable } from "svelte/store";

const hoveredMeeting: Writable<MeetingData | null> = writable();

export default hoveredMeeting;