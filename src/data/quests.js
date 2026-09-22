/**
 * The hunt's quest chain. Only one quest is active at a time; clearing it
 * unlocks the next automatically. Capped at three so a session has a clear
 * finish line instead of an endless checklist.
 */
export const QUEST_CHAIN = [
  {
    id: 'thin-the-pack',
    title: 'Hunt: Thin the Pack',
    blurb: 'Cull the small game before they overrun the plains and forest.',
    objectives: [
      { species: 'jagras', required: 2 },
      { species: 'raptor', required: 1 },
    ],
  },
  {
    id: 'apex-predator',
    title: 'Hunt: Apex Predator',
    blurb: 'The raptors are getting bolder. Bring down two more to break their nerve.',
    objectives: [
      { species: 'raptor', required: 2 },
      { species: 'jagras', required: 1 },
    ],
  },
  {
    id: 'the-rathwyrm',
    title: 'Hunt: The Ember Rathwyrm',
    blurb: 'The big one has been sighted in the Ashen Hollow. End it.',
    objectives: [{ species: 'drake', required: 1 }],
  },
]

export const MAX_QUESTS = QUEST_CHAIN.length
