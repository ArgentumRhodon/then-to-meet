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
	start: {
		time: string;
		slot: number;
	}
	end: {
		time: string;
		slot: number;
	}
}

interface Meetings {
	[day: string]: {
		[length: string]: MeetingData[];
	};
}

export type { SlotData, Slots, Person, Info, Meetings, MeetingData };
