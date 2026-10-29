// Fixed exercise library for the manual plan builder: body parts and the
// exercises of each. Nothing here is generated at run time; picking a body part
// shows exactly that part's list. Ids that also appear in the example plan
// (bench, squat, pec-deck, ...) are kept so "vs last time" comparisons match.

const MAX_NAME_LENGTH = 24;

// id, name, sets, reps, kg, step (kg per swipe), rest seconds, optional rep step
function lift(id, name, sets, reps, kg, step, restSec, repStep) {
  return { id, name, type: 'strength', sets, reps, kg, step, restSec, repStep: repStep || 1 };
}

function cardio(id, name, minutes) {
  return { id, name, type: 'cardio', minutes };
}

// Exercises shared by more than one body part are defined once.
const DEADLIFT = lift('deadlift', 'Deadlift', 4, 5, 100, 2.5, 180);
const SHRUG = lift('shrug', 'Barbell Shrug', 4, 12, 60, 2.5, 60);
const DB_SHRUG = lift('db-shrug', 'DB Shrug', 4, 12, 24, 2, 60);
const FACE_PULL = lift('face-pull', 'Face Pull', 3, 15, 20, 2.5, 60);
const CHIN_UP = lift('chin-up', 'Chin-up', 4, 8, 0, 2.5, 120);
const HAMMER = lift('hammer-curl', 'Hammer Curl', 3, 10, 12, 2, 60);
const REVERSE_CURL = lift('reverse-curl', 'Reverse Curl', 3, 12, 20, 2.5, 60);
const HIP_THRUST = lift('hip-thrust', 'Hip Thrust', 4, 10, 60, 2.5, 90);
const ABDUCTOR = lift('abductor', 'Hip Abductor', 3, 12, 40, 5, 60);
const RDL = lift('rdl', 'Romanian DL', 4, 8, 60, 2.5, 120);
const BULGARIAN = lift('bulgarian', 'Bulgarian Split Squat', 3, 10, 16, 2, 90);
const SUMO_DL = lift('sumo-dl', 'Sumo Deadlift', 4, 5, 90, 2.5, 180);
const STEP_UP = lift('step-up', 'DB Step-up', 3, 10, 16, 2, 90);
const BACK_EXT = lift('back-ext', 'Back Extension', 3, 12, 0, 2.5, 60);
const GOOD_MORNING = lift('good-morning', 'Good Morning', 3, 10, 40, 2.5, 90);
const STANDING_CALF = lift('standing-calf', 'Standing Calf Raise', 4, 12, 60, 5, 60);
const SEATED_CALF = lift('seated-calf', 'Seated Calf Raise', 4, 15, 40, 5, 60);
const PULL_UP = lift('pull-up', 'Pull-up', 4, 8, 0, 2.5, 120);

const CHEST = [
  lift('bench', 'Bench Press', 4, 8, 60, 2.5, 120),
  lift('incline-bench', 'Incline Bench Press', 4, 8, 50, 2.5, 120),
  lift('decline-bench', 'Decline Bench Press', 4, 8, 50, 2.5, 120),
  lift('db-bench', 'DB Bench Press', 4, 10, 20, 2, 90),
  lift('incline-db', 'Incline DB Press', 4, 10, 20, 2, 90),
  lift('decline-db', 'Decline DB Press', 3, 10, 20, 2, 90),
  lift('smith-bench', 'Smith Bench Press', 4, 8, 50, 2.5, 120),
  lift('smith-incline', 'Smith Incline Press', 4, 8, 40, 2.5, 120),
  lift('chest-press', 'Machine Chest Press', 3, 10, 40, 5, 90),
  lift('incline-chest-press', 'Incline Machine Press', 3, 10, 40, 5, 90),
  lift('pec-deck', 'Pec Deck', 3, 12, 45, 5, 60),
  lift('db-fly', 'DB Fly', 3, 12, 12, 2, 60),
  lift('incline-db-fly', 'Incline DB Fly', 3, 12, 10, 2, 60),
  lift('cable-low', 'Cable Crossover', 3, 12, 20, 2.5, 60),
  lift('cable-low-high', 'Low-to-High Cable Fly', 3, 12, 10, 2.5, 60),
  lift('db-floor-press', 'DB Floor Press', 3, 10, 20, 2, 90),
  lift('pullover', 'DB Pullover', 3, 12, 18, 2, 60),
  lift('push-up', 'Push-up', 3, 15, 0, 2.5, 60),
  lift('decline-push-up', 'Decline Push-up', 3, 12, 0, 2.5, 60),
  lift('chest-dip', 'Chest Dip', 3, 10, 0, 2.5, 90)
];

const BACK = [
  PULL_UP,
  CHIN_UP,
  lift('neutral-pull-up', 'Neutral-Grip Pull-up', 4, 8, 0, 2.5, 120),
  lift('lat-pulldown', 'Lat Pulldown', 3, 12, 50, 5, 90),
  lift('close-pulldown', 'Close-Grip Pulldown', 3, 12, 45, 5, 90),
  lift('reverse-pulldown', 'Reverse-Grip Pulldown', 3, 12, 45, 5, 90),
  lift('straight-arm', 'Straight-Arm Pulldown', 3, 12, 25, 2.5, 60),
  lift('barbell-row', 'Barbell Row', 4, 8, 60, 2.5, 120),
  lift('pendlay-row', 'Pendlay Row', 4, 6, 60, 2.5, 120),
  lift('t-bar-row', 'T-Bar Row', 4, 10, 40, 2.5, 90),
  lift('db-row', 'One-Arm DB Row', 4, 10, 24, 2, 90),
  lift('chest-row', 'Chest-Supported Row', 3, 10, 40, 5, 90),
  lift('seated-row', 'Seated Row', 3, 12, 45, 5, 90),
  lift('machine-row', 'Machine Row', 3, 12, 45, 5, 90),
  lift('inverted-row', 'Inverted Row', 3, 12, 0, 2.5, 90),
  DEADLIFT,
  lift('rack-pull', 'Rack Pull', 3, 5, 100, 2.5, 150),
  BACK_EXT,
  GOOD_MORNING,
  SHRUG,
  DB_SHRUG,
  FACE_PULL
];

const BICEPS = [
  lift('bb-curl', 'Barbell Curl', 3, 10, 30, 2.5, 60),
  lift('ez-curl', 'EZ-Bar Curl', 3, 10, 30, 2.5, 60),
  lift('db-curl', 'DB Curl', 3, 10, 12, 2, 60),
  HAMMER,
  lift('incline-curl', 'Incline DB Curl', 3, 10, 10, 2, 60),
  lift('preacher', 'Preacher Curl', 3, 10, 25, 2.5, 60),
  lift('cable-curl', 'Cable Curl', 3, 12, 20, 2.5, 60),
  lift('conc-curl', 'Concentration Curl', 3, 12, 10, 2, 60),
  lift('spider-curl', 'Spider Curl', 3, 10, 8, 2, 60),
  lift('bayesian', 'Bayesian Cable Curl', 3, 12, 10, 2.5, 60),
  lift('machine-curl', 'Machine Curl', 3, 12, 25, 5, 60),
  lift('zottman', 'Zottman Curl', 3, 10, 8, 2, 60),
  lift('drag-curl', 'Drag Curl', 3, 10, 25, 2.5, 60),
  CHIN_UP
];

const TRICEPS = [
  lift('close-bench', 'Close-Grip Bench Press', 4, 8, 50, 2.5, 120),
  lift('pushdown', 'Triceps Pushdown', 3, 12, 30, 2.5, 60),
  lift('rope-pushdown', 'Rope Pushdown', 3, 12, 25, 2.5, 60),
  lift('reverse-pushdown', 'Reverse-Grip Pushdown', 3, 12, 20, 2.5, 60),
  lift('single-pushdown', 'One-Arm Pushdown', 3, 12, 10, 2.5, 60),
  lift('oh-ext-db', 'Overhead DB Extension', 3, 12, 18, 2, 60),
  lift('cable-oh-ext', 'Cable OH Extension', 3, 12, 25, 2.5, 60),
  lift('ez-oh-ext', 'EZ Overhead Extension', 3, 12, 20, 2.5, 60),
  lift('skull', 'Skull Crusher', 3, 10, 30, 2.5, 90),
  lift('jm-press', 'JM Press', 3, 10, 40, 2.5, 90),
  lift('tri-dip', 'Triceps Dip', 3, 10, 0, 2.5, 90),
  lift('bench-dip', 'Bench Dip', 3, 12, 0, 2.5, 60),
  lift('kickback', 'DB Kickback', 3, 12, 8, 1, 60),
  lift('diamond-push-up', 'Diamond Push-up', 3, 12, 0, 2.5, 60),
  lift('tri-machine', 'Machine Triceps Press', 3, 12, 40, 5, 60)
];

const FOREARMS = [
  lift('wrist-curl', 'Wrist Curl', 3, 15, 15, 2.5, 45),
  lift('reverse-wrist-curl', 'Reverse Wrist Curl', 3, 15, 10, 1, 45),
  REVERSE_CURL,
  lift('behind-back-wrist', 'Behind-Back Wrist Curl', 3, 15, 30, 2.5, 45)
];

const SHOULDERS = [
  lift('ohp', 'Overhead Press', 4, 8, 40, 2.5, 120),
  lift('seated-db-press', 'Seated DB Press', 4, 10, 20, 2, 90),
  lift('standing-db-press', 'Standing DB Press', 4, 10, 18, 2, 90),
  lift('arnold', 'Arnold Press', 3, 10, 16, 2, 90),
  lift('machine-shoulder', 'Machine Shoulder Press', 3, 10, 40, 5, 90),
  lift('smith-ohp', 'Smith Shoulder Press', 4, 8, 30, 2.5, 90),
  lift('push-press', 'Push Press', 4, 5, 40, 2.5, 120),
  lift('landmine', 'Landmine Press', 3, 10, 20, 2.5, 90),
  lift('lateral-raise', 'Lateral Raise', 4, 15, 8, 1, 60),
  lift('cable-lateral', 'Cable Lateral Raise', 3, 15, 5, 1, 60),
  lift('machine-lateral', 'Machine Lateral Raise', 3, 15, 20, 5, 60),
  lift('front-raise', 'Front Raise', 3, 12, 8, 1, 60),
  lift('plate-front', 'Plate Front Raise', 3, 12, 10, 2.5, 60),
  lift('reverse-fly', 'Reverse Fly', 3, 15, 6, 1, 60),
  lift('rear-deck', 'Reverse Pec Deck', 3, 15, 30, 5, 60),
  lift('cable-rear', 'Cable Rear Delt Fly', 3, 15, 10, 2.5, 60),
  FACE_PULL,
  lift('upright-row', 'Upright Row', 3, 10, 30, 2.5, 90),
  SHRUG,
  DB_SHRUG
];

const LEGS = [
  lift('squat', 'Squat', 5, 5, 80, 2.5, 150),
  lift('front-squat', 'Front Squat', 4, 6, 50, 2.5, 150),
  lift('hack-squat', 'Hack Squat', 4, 10, 60, 10, 120),
  lift('smith-squat', 'Smith Squat', 4, 8, 50, 2.5, 120),
  lift('goblet', 'Goblet Squat', 3, 12, 20, 2, 90),
  BULGARIAN,
  lift('lunge', 'Walking Lunge', 3, 12, 16, 2, 90),
  lift('reverse-lunge', 'Reverse Lunge', 3, 10, 16, 2, 90),
  STEP_UP,
  lift('leg-press', 'Leg Press', 4, 12, 120, 10, 90),
  lift('leg-ext', 'Leg Extension', 3, 12, 35, 5, 60),
  lift('leg-curl', 'Leg Curl', 3, 12, 35, 5, 60),
  lift('seated-leg-curl', 'Seated Leg Curl', 3, 12, 35, 5, 60),
  RDL,
  lift('sldl', 'Stiff-Leg Deadlift', 3, 8, 60, 2.5, 120),
  SUMO_DL,
  DEADLIFT,
  lift('adductor', 'Hip Adductor', 3, 12, 40, 5, 60),
  ABDUCTOR,
  HIP_THRUST,
  lift('sissy-squat', 'Sissy Squat', 3, 12, 0, 2.5, 60),
  lift('nordic-curl', 'Nordic Curl', 3, 6, 0, 2.5, 90),
  STANDING_CALF,
  SEATED_CALF
];

const GLUTES = [
  HIP_THRUST,
  lift('bb-glute-bridge', 'Barbell Glute Bridge', 4, 10, 60, 2.5, 90),
  lift('glute-bridge', 'Glute Bridge', 3, 15, 0, 2.5, 60),
  lift('single-hip-thrust', 'Single-Leg Hip Thrust', 3, 10, 0, 2.5, 60),
  lift('cable-kickback', 'Cable Glute Kickback', 3, 12, 10, 2.5, 60),
  lift('machine-kickback', 'Glute Kickback Machine', 3, 12, 30, 5, 60),
  lift('cable-pull-through', 'Cable Pull-Through', 3, 12, 25, 2.5, 60),
  ABDUCTOR,
  RDL,
  BULGARIAN,
  SUMO_DL,
  lift('sumo-squat', 'Sumo Squat', 3, 12, 24, 2, 90),
  lift('curtsy-lunge', 'Curtsy Lunge', 3, 10, 12, 2, 60),
  STEP_UP,
  BACK_EXT,
  GOOD_MORNING,
  lift('frog-pump', 'Frog Pump', 3, 20, 0, 2.5, 45),
  lift('band-walk', 'Lateral Band Walk', 3, 15, 0, 2.5, 45)
];

const CALVES = [
  STANDING_CALF,
  SEATED_CALF,
  lift('leg-press-calf', 'Leg Press Calf Raise', 4, 15, 100, 10, 60),
  lift('smith-calf', 'Smith Calf Raise', 4, 12, 50, 5, 60),
  lift('donkey-calf', 'Donkey Calf Raise', 4, 15, 40, 5, 60),
  lift('single-calf', 'Single-Leg Calf Raise', 3, 15, 0, 2.5, 45),
  lift('db-calf', 'DB Calf Raise', 3, 15, 20, 2, 45),
  lift('tibialis', 'Tibialis Raise', 3, 15, 0, 2.5, 45)
];

// Timed holds count seconds in the reps field (rep step 5).
const ABS = [
  lift('crunch', 'Crunch', 3, 20, 0, 2.5, 45),
  lift('cable-crunch', 'Cable Crunch', 3, 15, 30, 5, 60),
  lift('machine-crunch', 'Machine Crunch', 3, 15, 30, 5, 60),
  lift('sit-up', 'Sit-up', 3, 20, 0, 2.5, 45),
  lift('decline-sit-up', 'Decline Sit-up', 3, 15, 0, 2.5, 60),
  lift('bicycle', 'Bicycle Crunch', 3, 20, 0, 2.5, 45),
  lift('v-up', 'V-up', 3, 15, 0, 2.5, 45),
  lift('leg-raise', 'Lying Leg Raise', 3, 15, 0, 2.5, 60),
  lift('hang-leg-raise', 'Hanging Leg Raise', 3, 12, 0, 2.5, 60),
  lift('hang-knee-raise', 'Hanging Knee Raise', 3, 12, 0, 2.5, 60),
  lift('vertical-leg-raise', 'Vertical Leg Raise', 3, 12, 0, 2.5, 60),
  lift('ab-wheel', 'Ab Wheel Rollout', 3, 10, 0, 2.5, 60),
  lift('russian-twist', 'Russian Twist', 3, 20, 0, 2.5, 45),
  lift('woodchop', 'Cable Woodchop', 3, 12, 15, 2.5, 60),
  lift('pallof', 'Pallof Press', 3, 12, 15, 2.5, 60),
  lift('oblique-crunch', 'Oblique Crunch', 3, 15, 0, 2.5, 45),
  lift('side-bend', 'DB Side Bend', 3, 15, 16, 2, 45),
  lift('torso-rotation', 'Torso Rotation Machine', 3, 12, 30, 5, 60),
  lift('dead-bug', 'Dead Bug', 3, 12, 0, 2.5, 45),
  lift('plank', 'Plank (sec)', 3, 45, 0, 2.5, 45, 5),
  lift('side-plank', 'Side Plank (sec)', 3, 30, 0, 2.5, 45, 5),
  lift('hollow-hold', 'Hollow Hold (sec)', 3, 30, 0, 2.5, 45, 5),
  lift('mountain-climber', 'Mountain Climber (sec)', 3, 30, 0, 2.5, 45, 5)
];

const CARDIO = [
  cardio('treadmill', 'Treadmill Run', 20),
  cardio('incline-walk', 'Incline Walk', 30),
  cardio('bike', 'Stationary Bike', 20),
  cardio('run', 'Outdoor Run', 30),
  cardio('cycling', 'Outdoor Cycling', 45),
  cardio('swim', 'Swim', 30),
  cardio('rowing', 'Rowing Machine', 20),
  cardio('elliptical', 'Elliptical', 25),
  cardio('stairs', 'Stair Climber', 20),
  cardio('air-bike', 'Air Bike', 15),
  cardio('jump-rope', 'Jump Rope', 10),
  cardio('hiit', 'HIIT', 15),
  cardio('battle-ropes', 'Battle Ropes', 10),
  cardio('boxing', 'Boxing Bag Work', 15),
  cardio('hiking', 'Hiking', 60),
  cardio('walk', 'Brisk Walk', 30),
  cardio('stretching', 'Stretching', 10),
  cardio('mobility', 'Mobility Work', 10),
  cardio('yoga', 'Yoga', 30),
  cardio('cooldown', 'Cool-down Walk', 10)
];

function unique(list) {
  const seen = new Set();
  return list.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

const LIBRARY = {
  chest: CHEST,
  back: BACK,
  legs: LEGS,
  shoulders: SHOULDERS,
  arms: unique([].concat(BICEPS, TRICEPS, FOREARMS)),
  biceps: BICEPS,
  triceps: TRICEPS,
  glutes: GLUTES,
  calves: CALVES,
  abs: ABS,
  cardio: CARDIO
};

// Picker order. `rest` is a day type, not a library list.
export const PARTS = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'legs', label: 'Legs' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'calves', label: 'Calves' },
  { id: 'abs', label: 'Abs' },
  { id: 'cardio', label: 'Cardio' }
];

export const REST_ID = 'rest';
export const CARDIO_ID = 'cardio';

export function partLabel(partId) {
  const part = PARTS.find((candidate) => candidate.id === partId);
  return part ? part.label : '';
}

// Day focus label ("Chest") -> part id, or null for rest, unknown, or generic labels.
export function partIdForFocus(focus) {
  const text = String(focus || '').trim().toLowerCase();
  const part = PARTS.find((candidate) => candidate.label.toLowerCase() === text);
  return part ? part.id : null;
}

function copy(entry) {
  return Object.assign({}, entry);
}

// Fresh copies of a part's exercises, in display order.
export function exercisesFor(partId) {
  return Object.prototype.hasOwnProperty.call(LIBRARY, partId) ? LIBRARY[partId].map(copy) : [];
}

const BY_ID = {};
Object.keys(LIBRARY).forEach((partId) => {
  LIBRARY[partId].forEach((entry) => {
    if (!BY_ID[entry.id]) BY_ID[entry.id] = entry;
  });
});

export function entryById(id) {
  return Object.prototype.hasOwnProperty.call(BY_ID, id) ? copy(BY_ID[id]) : null;
}

export function allExerciseIds() {
  return Object.keys(BY_ID);
}

export { MAX_NAME_LENGTH };
