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
}

export type {SlotData, Slots, Person, Info}