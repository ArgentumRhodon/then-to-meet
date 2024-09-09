import { DateTime } from "luxon";
import type { Slots } from "$lib/types";

const timeRegex: RegExp = /TimeOfSlot\[(\d+)\]=(\d+);/g;
const availableSlotInitRegex: RegExp = /AvailableAtSlot\[(\d+)\]=new Array\(\);/g;
const availableSlotPushRegex: RegExp = /AvailableAtSlot\[(\d+)\]\.push\((\d+)\);/g;

const parseMatch = (match: RegExpExecArray): number[] => [Number(match[1]), Number(match[2])];

const formatDate = (unixTime: number): string => {
    const date = DateTime.fromSeconds(unixTime);
    return date.year <= 1979
        ? date.toFormat("EEE")
        : date.toFormat("EEE, MMM dd");
}

const formatTime = (unixTime: number): string => {
    const time = DateTime.fromSeconds(unixTime);
    return time.year <= 1978
        ? time.toUTC().toFormat('hh:mm a').replace(/\s/g, '')
        : time.toFormat('hh:mm a').replace(/\s/g, '');
}

const getSlots = (scriptContent: string): Slots => {
    const timeOfSlot: number[] = [];
    const availableAtSlot: number[][] = [];
    const slots: Slots = {};

    let match: RegExpExecArray | null;

    // Extract timeslot values
    while ((match = timeRegex.exec(scriptContent)) !== null) {
        const [index, timeValue] = parseMatch(match);
        timeOfSlot[index] = timeValue;
    }

    // Initialize availableAtSlot arrays
    while ((match = availableSlotInitRegex.exec(scriptContent)) !== null) {
        availableAtSlot[Number(match[1])] = [];
    }

    // Push availableAtSlot values
    while ((match = availableSlotPushRegex.exec(scriptContent)) !== null) {
        const [index, personID] = parseMatch(match);
        availableAtSlot[index]?.push(personID);
    }

    // Construct slots
    Object.keys(timeOfSlot).forEach(key => {
        const slot = Number(key);
        const time = formatTime(timeOfSlot[slot]);
        const available = availableAtSlot[slot] || [];
        const day = formatDate(timeOfSlot[slot]);

        if(!slots[day]){
            slots[day] = [];
        }

        slots[day].push({slot, time, available});
    });

    return slots;
}

export default getSlots;