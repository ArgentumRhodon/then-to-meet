import info from "./info";
import people from "./people"
import selectedPeople from "./selectedPeople";
import slots from "./slots";

const resetMeetingStores = (): void => {
    people.set([]);
    slots.set({});
    selectedPeople.set(new Set());
    info.set({link: "", title: ""});
}

export default resetMeetingStores;