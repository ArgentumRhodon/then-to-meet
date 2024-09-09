import type { Person, Slots } from "$lib/types";

const nameRegex: RegExp = /PeopleNames\[\d+\] = '([^']*)'/g;
const idRegex: RegExp = /PeopleIDs\[\d+\] = (\d+)/g;

const getPeople = (scriptContent: string, slots: Slots): Person[] => {
    const peopleNames: string[] = [];
    const peopleIDs: number[] = [];
    const validIDs = new Set<number>();

    let match: RegExpExecArray | null;

    // Extract names
    while((match = nameRegex.exec(scriptContent)) !== null){
        peopleNames.push(match[1]);
    }

    // Extract IDs
    while ((match = idRegex.exec(scriptContent)) !== null) {
        peopleIDs.push(Number(match[1]));
    }

    // Get a set of used ids (to ingore unused logins)
    Object.values(slots).forEach((slotArr) => {
        slotArr.forEach(slot => {
            slot.available.forEach((personID) => {
                validIDs.add(personID);
            })
        });
    });

    return peopleNames.map((name, index) => ({
        name,
        id: peopleIDs[index]
    })).filter((person) => validIDs.has(person.id));
}

export default getPeople;