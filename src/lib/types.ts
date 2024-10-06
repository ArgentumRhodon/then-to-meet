interface SlotData {
	slot: number;
	time: string;
	available: number[];
}

interface Slots {
	[day: string]: SlotData[];
}

interface Person {
	id: number;
	name: string;
}

interface Info {
	title: string;
	link: string;
}

interface MeetingData {
	start: string;
	end: string;
}

interface Meetings {
	[day: string]: {
		[length: number]: MeetingData[];
	};
}

export type { SlotData, Slots, Person, Info, Meetings, MeetingData };
