import { DateTime } from 'luxon';

/** Free ranges per weekday (Mon–Fri) as [startHour, endHour] pairs, end exclusive. */
type Week = [number, number][][];

// Hand-tuned so the demo shows one everyone-window (Tue 2–3 PM), a few near misses,
// a person with nothing on Friday, and a sign-in with no availability at all.
const DEMO_PEOPLE: { id: number; name: string; week: Week }[] = [
	{
		id: 90210001,
		name: 'Alex Rivera',
		week: [
			[
				[9, 12],
				[13, 17]
			],
			[
				[9, 11],
				[13, 17]
			],
			[[10, 16]],
			[[9, 12]],
			[[9, 15]]
		]
	},
	{
		id: 90210002,
		name: 'Priya Natarajan',
		week: [
			[[10, 12]],
			[[12, 16]],
			[
				[9, 11],
				[14, 17]
			],
			[[13, 17]],
			[[10, 13]]
		]
	},
	{
		id: 90210003,
		// Exercises entity decoding, like a real When2Meet name with an apostrophe.
		name: 'Sam O&#39;Connor',
		week: [
			[
				[9, 12],
				[13, 17]
			],
			[[14, 17]],
			[[9, 12]],
			[[9, 17]],
			[[11, 14]]
		]
	},
	{
		id: 90210004,
		name: 'Jordan Lee',
		week: [
			[[11, 15]],
			[[13.5, 15.5]],
			[[15, 17]],
			[
				[10, 12],
				[14, 16]
			],
			[[9, 12]]
		]
	},
	{
		id: 90210005,
		name: 'Mei Chen',
		week: [
			[[9, 11]],
			[[9, 17]],
			[
				[10, 12],
				[14, 17]
			],
			[[11, 15]],
			[[11, 12.5]]
		]
	},
	{
		id: 90210006,
		name: 'Diego &#193;lvarez',
		week: [[[13, 17]], [[14, 16.5]], [[9, 17]], [[9, 11]], [[11, 13]]]
	},
	{
		id: 90210007,
		name: 'Taylor Brooks',
		week: [[[10, 14]], [[11, 15]], [[15, 17]], [[14, 16]], []]
	},
	{ id: 90210008, name: 'Guest', week: [[], [], [], [], []] }
];

const DEMO_ZONE = 'America/New_York';
const DAY_START = 9;
const DAY_END = 17;

/**
 * Builds a When2Meet-style event page for the week after `now`, in the same script format
 * When2Meet serves. Used for the "Try a demo" button and as a parser test fixture.
 */
export const demoEventHtml = (now: Date = new Date()): string => {
	const today = DateTime.fromJSDate(now).setZone(DEMO_ZONE).startOf('day');
	const monday = today.plus({ days: 8 - today.weekday });

	const lines: string[] = [];
	DEMO_PEOPLE.forEach((person, i) => {
		lines.push(`PeopleNames[${i}] = '${person.name}';PeopleIDs[${i}] = ${person.id};`);
	});

	let slot = 0;
	for (let day = 0; day < 5; day++) {
		for (let hour = DAY_START; hour < DAY_END; hour += 0.25) {
			const time = monday.plus({ days: day, minutes: hour * 60 });
			lines.push(`TimeOfSlot[${slot}]=${time.toSeconds()};`);
			lines.push(`AvailableAtSlot[${slot}]=new Array();`);
			for (const person of DEMO_PEOPLE) {
				if (person.week[day].some(([from, to]) => hour >= from && hour < to)) {
					lines.push(`AvailableAtSlot[${slot}].push(${person.id});`);
				}
			}
			slot++;
		}
	}

	return `<!DOCTYPE html>
<html><head><title>Design team sync - When2meet</title></head>
<body>
<script type="text/javascript">var PeopleNames = []; var PeopleIDs = [];</script>
<script type="text/javascript">
${lines.join('\n')}
</script>
</body></html>`;
};
