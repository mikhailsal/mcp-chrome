/**
 * Random loading copy.
 * Used by the TimelineStatusStep component for playful waiting hints.
 */

const loadingTexts = [
  // Must-have meme energy.
  'This should have been effortless.',
  'Instead, we are sprinting downhill.',
  'I know you are in a hurry, but wait a second.',
  'Dog-paddling through the ocean of knowledge.',
  'Let the answer cook a little longer.',
  'Handcrafting your answer right now.',
  'Assembling the crew from Langlang Mountain.',
  'Do not rush me, it is already in progress.',
  'Thinking hard and visibly sweating.',
  'The CPU is about to overheat.',
  // Everyday-life flavor.
  'Slow-roasting the good stuff.',
  'Flipping the knowledge pancake.',
  'One quick toast and it will be ready.',
  'Putting inspiration into the oven.',
  'Let the answer steep a bit longer.',
  'Dialing the emotional support to maximum.',
  'Knitting a sweater out of language.',
  // Imagination mode.
  'Neurons are dancing.',
  'A sleep-deprived owl is thinking.',
  'Adding color to the answer.',
  'Rummaging through the knowledge base at full speed.',
  'The brain circus is in town.',
  'Trying to squeeze 0 and 1 together.',
  'Charging up a big move.',
  'The magnifying glass fogged up, wiping it off.',
  'Trying to understand this unreasonable request.',
  // Fantasy mode.
  'Casting a spell, do not disturb.',
  'Waking up the silicon-based allies.',
  'Connecting to the wisdom of cyberspace.',
  'Hold on, fellow traveler, calculations are underway.',
  'Crossing a knowledge black hole.',
  'Reverse-engineering human intent.',
  'The crystal ball is blurry, giving it a tap.',
  // Workplace mode.
  'Code is moving faster than the news cycle.',
  'The lead just clocked in, one moment.',
  'Rushing over at full speed.',
  'Hauling knowledge at light speed.',
  'Finding the last puzzle piece.',
  'The answer is almost picture-wrapped.',
  'Launch countdown in progress.',
  'Target locked.',
];

/**
 * Get a random loading line.
 */
export function getRandomLoadingText(): string {
  return loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
}
