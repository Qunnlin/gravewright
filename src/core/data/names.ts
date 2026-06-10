import { chance, pick } from '../rng';

const FIRST = [
  'Almeric', 'Bessa', 'Corvin', 'Drusilla', 'Edmund', 'Fenn', 'Gretchen',
  'Hadrian', 'Isolde', 'Jorah', 'Katla', 'Lucan', 'Maren', 'Nikolaus',
  'Odette', 'Piotr', 'Quenby', 'Roswitha', 'Sigmund', 'Thessaly',
  'Ulric', 'Vesna', 'Wendeline', 'Xanthe', 'Yorick', 'Zofia',
  'Ansgar', 'Brunhild', 'Caspar', 'Dietlinde', 'Erwin', 'Friedhelm',
];

const EPITHETS = [
  'the Doomed', 'the Unlucky', 'the Brave-ish', 'the Expendable',
  'of the Debt', 'the Twice-Sold', 'the Volunteer', 'the Replaceable',
  'the Hopeful', 'Last-of-Kin', 'the Foolhardy', 'of No Estate',
  'the Contractual', 'the Unmourned', 'the Eager', 'Ninth-Born',
  'the Promising', 'the Brief', 'of the Fine Print', 'the Optimist',
];

export function vesselName(): string {
  const name = pick(FIRST);
  return chance(0.75) ? `${name} ${pick(EPITHETS)}` : name;
}

/** Lines the crypt murmurs on a death. */
export const DEATH_LINES = [
  'The crypt accepts.',
  'A fair exchange.',
  'They knew. They all know.',
  'The soul comes loose like a tooth.',
  'Somewhere above, a bell declines to ring.',
  'You file the paperwork in bone.',
  'The dark licks its lips.',
  'Their last thought was of soup.',
  'A lesson nobody will learn from.',
  'The crypt grows one scream richer.',
];
