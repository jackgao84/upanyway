/**
 * Everything the goat says. The goat is a fluffy baby mountain goat who is scared of heights and
 * rides along in her backpack: it IS the fear, coming along and saying so out loud, while the climb
 * goes on anyway. Funny, warm, a bit dramatic, and it loves her.
 *
 * Voice rules (PROGRESS.md "Story/voice rules", checked by tests/unit/goatVoice.test.ts):
 * - Scared is allowed and named; going anyway is the move. Never tell her the feeling is wrong.
 * - No generic praise: say what the try actually was ("Try number 4 did it!").
 * - No disappointment, no "you failed", no telling her what she should do. Hints are offers.
 * - Every line ≤ 12 words with its slots filled. Plain English for a young climber (audience and reading level: see .brief/).
 * - Morals (`moral: true`) only at a camp, and the line picker allows at most one per camp arrival.
 *
 * Authoring: write apostrophes straight ('); the line picker (model/goatVoice.ts) turns them into
 * curly ones (’) for display. Use "…" for a trailing-off pause.
 *
 * Slots: {pose} (the fall pose's name), {n} (a count, only said when it is 2 or more), {goat} and
 * {mountain} (the names she typed). A line whose slot has no value is skipped, so every group also
 * has slot-free lines.
 *
 * Tags narrow when a line can be said (lines without a tag can always be said):
 * - zone: only in that zone · scary: only at that Looks Scary moment · whipper: only for that kind
 *   of fall (rope catch, slip onto a lower spot, crumble)
 * - pack: talks from inside the backpack, so it is skipped while the goat climbs beside her (night)
 * - out: only while the goat climbs beside her
 */
import type { WhipperKind } from '../game/events'
import type { LooksScaryKind, ZoneId } from '../game/types'
import type { GoatMood } from '../ui/goatBubble'

export type GoatMoment =
  | 'aim'
  | 'aimBigLeap'
  | 'land'
  | 'bigLeapLanded'
  | 'bigLeapMissed'
  | 'fall'
  | 'repeatFall'
  | 'hintShort'
  | 'hintLong'
  | 'hintSteep'
  | 'hintFlat'
  | 'hintBumped'
  | 'hintGust'
  | 'hintCrumbled'
  | 'ghost'
  | 'looksScaryBefore'
  | 'looksScaryAfter'
  | 'campIdle'
  | 'campReached'
  | 'stoneAdded'
  | 'stoneWaiting'
  | 'cairnVisit'
  | 'cairnEmpty'
  | 'flopLogged'
  | 'notToday'
  | 'summit'
  | 'rope'
  | 'lesson'
  | 'meet'
  | 'hiddenHold'
  | 'sunset'
  | 'send'
  | 'firstCamp'
  | 'crumbleFound'
  | 'gustSoon'
  | 'hop'
  | 'betaOffer'
  | 'smaller'
  | 'planSaved'
  | 'letter'

export interface GoatLine {
  text: string
  /** A gentle one-line moral. Camp moments only; at most one per camp arrival. */
  moral?: true
  /** The bubble mood for this line (default: MOMENT_MOOD of its group). */
  mood?: GoatMood
  zone?: ZoneId
  scary?: LooksScaryKind
  whipper?: WhipperKind
  pack?: true
  out?: true
}

/**
 * Lines said at one fixed point of the story, in order. Screens read them through
 * `scriptedLine()` (model/goatVoice.ts), which adds the mood and curly apostrophes.
 */
export const SCRIPTED = {
  /** First run: the goat peeks out of the backpack (tap Next between lines). */
  meet: [
    "Oh! Hello. I'm a baby mountain goat.",
    "Funny thing about me: I'm scared of heights.",
    'But I want to see the top. Can I come anyway?',
  ],
  /** She has named the goat. */
  named: '{goat}? I love it!',
  /** She is naming her mountain. */
  mountain: "Whoa, that's tall. My knees are wobbling already.",
  /** The lesson's first step (and what the goat repeats if she waits). */
  lessonLeap: "Drag back, then let go. That's how we leap!",
  /** The lesson's first leap landed. */
  lessonLanded: "Our first leap! My tummy's still down there.",
  /** The lesson's fall practice: nothing is reachable from here, so every leap is a fall. */
  lessonFall: 'Now we practise falling. Gulp. Leap anywhere you like!',
  /** The first time the rope ever catches her: why the rope is there. */
  ropeFirst: "The rope catches us. That's why climbers can try hard moves!",
  /** First run: brave means safe but scary. */
  brave: 'Like me in your backpack: scared, but safe.',
  /** First run, last screen: off to Pitch 1. */
  cheer: "My knees are knocking. Let's go up anyway?",
  /** Her first visit to camp: where they are going. */
  firstCamp: "See the very top? That's Sky Lake. That's where we're going.",
  /** A plan gets "Not today". Exactly the brief's words. */
  notToday: "Fear won this round. That's allowed.",
  /** A stone over the day's cap waits beside the cairn. */
  stoneWaiting: "The cairn's full for today. This stone goes on tomorrow.",
  /** The same, when more stones are already waiting and this one can't go on tomorrow. */
  stoneWaitingLater: "The cairn's full for today. This stone waits its turn.",
  /** The day's climbing time is used up. */
  sunset: "The sun's going down. The mountain will be here tomorrow.",
  /** A hidden hold showed up during a fall. */
  hiddenHold: 'Spotted a hold on the way down!',
  /** The Sky Lake finale, in order: arrive, the goat's own leap, the splash, both laughing. */
  finale: [
    'Sky Lake! We made it. I can see EVERYTHING.',
    "My turn. My legs are jelly. I'm going anyway!",
    'SPLASH! I flopped right in! Best flop ever!',
    'We were scared the whole way up. And we came anyway.',
  ],
  /** Night summit send: the short ending, both splash in. */
  nightSplash: 'Both of us this time! One, two, three… SPLASH!',
} as const

export type ScriptedKey = keyof typeof SCRIPTED

/** The bubble mood for each scripted line (one per line for the lists). */
export const SCRIPTED_MOOD: {
  [K in ScriptedKey]: (typeof SCRIPTED)[K] extends string ? GoatMood : readonly GoatMood[]
} = {
  meet: ['happy', 'scared', 'happy'],
  named: 'giggly',
  mountain: 'wobbly',
  lessonLeap: 'happy',
  lessonLanded: 'giggly',
  lessonFall: 'wobbly',
  ropeFirst: 'calm',
  brave: 'calm',
  cheer: 'wobbly',
  firstCamp: 'happy',
  notToday: 'calm',
  stoneWaiting: 'calm',
  stoneWaitingLater: 'calm',
  sunset: 'calm',
  hiddenHold: 'happy',
  finale: ['happy', 'wobbly', 'giggly', 'happy'],
  nightSplash: 'giggly',
}

/** The default bubble mood of each moment. */
export const MOMENT_MOOD: Record<GoatMoment, GoatMood> = {
  aim: 'wobbly',
  aimBigLeap: 'scared',
  land: 'happy',
  bigLeapLanded: 'happy',
  bigLeapMissed: 'giggly',
  fall: 'giggly',
  repeatFall: 'giggly',
  hintShort: 'calm',
  hintLong: 'calm',
  hintSteep: 'calm',
  hintFlat: 'calm',
  hintBumped: 'calm',
  hintGust: 'calm',
  hintCrumbled: 'calm',
  ghost: 'calm',
  looksScaryBefore: 'scared',
  looksScaryAfter: 'giggly',
  campIdle: 'calm',
  campReached: 'happy',
  stoneAdded: 'happy',
  stoneWaiting: 'calm',
  cairnVisit: 'calm',
  cairnEmpty: 'calm',
  flopLogged: 'calm',
  notToday: 'calm',
  summit: 'happy',
  rope: 'calm',
  lesson: 'happy',
  meet: 'happy',
  hiddenHold: 'happy',
  sunset: 'calm',
  send: 'happy',
  firstCamp: 'happy',
  crumbleFound: 'scared',
  gustSoon: 'wobbly',
  hop: 'giggly',
  betaOffer: 'calm',
  smaller: 'happy',
  planSaved: 'happy',
  letter: 'happy',
}

const S = SCRIPTED
const M = SCRIPTED_MOOD

export const GOAT_LINES: Record<GoatMoment, GoatLine[]> = {
  // Aiming: she is dragging back. The goat is scared and coming anyway.
  aim: [
    { text: "My legs are jelly. Let's go anyway?" },
    { text: "Gulp. Okay. I'm scared, and I'm coming." },
    { text: "My tummy's doing flips. Still coming!" },
    { text: 'Hold on tight, ears. Here we go!' },
    { text: "If I squeak, that's just my scared noise. Ignore me!", mood: 'giggly' },
    { text: "Scared and ready at the same time. That's a thing!" },
    { text: "You pull back. I'll do the squeaking.", mood: 'giggly' },
    { text: "Deep breath. Mine's very squeaky." },
    { text: "Eyes open… mostly. Let's go!" },
    { text: "Aim for it! I'll cheer with my eyes shut.", mood: 'happy' },
    { text: "That looks far. Let's find out anyway?" },
    { text: "My heart's going thumpity-thump. That's okay. Let's leap." },
    { text: "I'm gripping the backpack with all four hooves.", pack: true, mood: 'scared' },
    { text: "Even the daisies look high from here. Let's go anyway.", zone: 'meadow' },
    { text: "It's dark in here. Stay close, fireflies!", zone: 'hollow', mood: 'scared' },
    { text: "Some ledges here crumble. We'll find out which!", zone: 'crumble' },
    { text: 'So windy! My ears are flapping like flags.', zone: 'ridge', mood: 'giggly' },
    { text: "I can't see the bottom. Somehow that helps?", zone: 'cloud' },
    { text: 'Nearly at the top. My legs are extra jelly now.', zone: 'summit' },
    { text: 'My own hooves on the rock! Still wobbly. Going anyway.', out: true },
  ],

  // Aiming at a Big Leap: the camera pulls back, her knees wobble, the goat gulps.
  aimBigLeap: [
    { text: "That's a BIG gap. I'm covering my eyes. Go!" },
    { text: "Big leap. I'm scared, and we're going anyway." },
    { text: "I can't look! Tell me when we're across." },
    { text: "My heart's going boom-boom-boom. Let's leap anyway?", mood: 'wobbly' },
    { text: 'Trying this one counts, landed or not. Ready?', mood: 'calm' },
    { text: 'Hooves over eyes. Okay. Go, go, go!' },
    { text: "Let's be scared and leap anyway.", mood: 'wobbly' },
    { text: "Here's my biggest gulp ever. GULP. Okay, go!", mood: 'giggly' },
    { text: "The rope's got us either way. Big breath. Leap!", mood: 'calm' },
    { text: 'This is the part where I squeak. Ready? SQUEAK!', mood: 'giggly' },
    { text: "It's far. Don't tell me how far. Just leap!" },
    { text: 'A big leap into the fog. Wheee anyway?', zone: 'cloud', mood: 'wobbly' },
  ],

  // A leap that landed where she was heading. Name what happened, not "good job".
  land: [
    { text: "We're on! Legs still jelly, but we're on." },
    { text: 'Landed! I opened one eye just in time.', mood: 'giggly' },
    { text: "Feet down. My tummy's still catching up.", mood: 'giggly' },
    { text: 'Huh. That was closer than it looked.', mood: 'calm' },
    { text: 'We did that leap scared. Scared still works!' },
    { text: 'Up we go! I only squeaked a tiny bit.', mood: 'giggly' },
    { text: 'We made it! My ears are still flapping.' },
    { text: 'Higher than before. Still scared. Still here.', mood: 'wobbly' },
    { text: "Look how high we are! Actually, don't. Okay, peek.", mood: 'giggly' },
    { text: 'Try number {n} did it! The chalk showed us how.' },
    { text: "{n} tries at that one, and now we're up!" },
    { text: 'That one took {n} goes. Every go taught us something.' },
    { text: "We got here, and the scared came too. That's fine.", mood: 'calm' },
    { text: "Got it! I'm hugging the backpack so hard.", pack: true },
    { text: 'Got it! The fireflies are cheering. I think.', zone: 'hollow', mood: 'giggly' },
    { text: 'Solid ground in the clouds! Mostly solid. Solid-ish.', zone: 'cloud', mood: 'giggly' },
    { text: 'We both made it! Me on my own hooves!', out: true },
  ],

  // A Big Leap that landed on its target.
  bigLeapLanded: [
    { text: 'We did the big leap! I peeked halfway. Worth it.' },
    { text: 'We FLEW. Over the whole gap!' },
    { text: 'Huh. The big leap was scary AND we landed it.', mood: 'giggly' },
    { text: 'Across the gap! My eyes were shut the whole time.', mood: 'giggly' },
    { text: 'Big leap: done. My heart: still doing the leap.', mood: 'wobbly' },
    { text: "{n} goes at that gap, and now we're across!" },
    { text: "That gap looked huge. Now we're on the other side!" },
    { text: "I'm telling every goat I meet about this leap." },
    { text: "Through the fog, and we landed! I'm all fluffy.", zone: 'cloud', mood: 'giggly' },
  ],

  // A Big Leap tried and not landed: trying it counts, landed or not.
  bigLeapMissed: [
    { text: "We tried the big one! That counts. Rope's got us.", whipper: 'rope', pack: true },
    { text: 'A big leap, tried for real! The rope caught us.', whipper: 'rope', pack: true },
    { text: 'You tried the big one! I saw it all from here.', out: true },
    { text: "We leapt the big gap! Landing is next time's job." },
    { text: 'Big leap tried! Now we know how far it is.' },
    { text: "We actually jumped it! That's the scary part done.", mood: 'happy' },
    { text: 'Look at that chalk. Now we know the gap.', mood: 'calm' },
    { text: 'We went for it! My ears are VERY impressed.' },
    { text: 'Leaping was the scary bit. Landing comes with practice.', mood: 'calm' },
  ],

  // A whipper (a fall). Silly, safe, and information.
  fall: [
    { text: "WHEEE — rope's got us. Now we know.", whipper: 'rope', pack: true },
    { text: "Boing! Rope's got you. I'm cheering from up here!", whipper: 'rope', out: true },
    { text: "Boing! That's what the rope is for.", whipper: 'rope' },
    { text: 'AAAA— oh. The rope. Hi, rope!', whipper: 'rope' },
    { text: 'Whoosh! The rope caught us. My ears are inside out.', whipper: 'rope', pack: true },
    { text: "I squeaked SO loud. The rope didn't even mind.", whipper: 'rope' },
    { text: '{pose}! Very dramatic. Ten out of ten.' },
    { text: '{pose}! My ears went everywhere.' },
    { text: "{pose}! I'd clap, but I'm holding on.", pack: true },
    { text: "Flop! That's information. Very bouncy information." },
    { text: 'Now we know where that one goes.', mood: 'calm' },
    { text: 'The chalk line shows exactly where we went. Handy!', mood: 'calm' },
    { text: 'Down we go! Scared, wobbly and totally fine.', pack: true },
    { text: "Ears up, tummy down. We're okay!" },
    { text: "We fell, and we're fine. I keep being surprised.", mood: 'calm', pack: true },
    { text: "That's one more attempt. Attempts are how mountains get climbed.", mood: 'calm' },
    { text: 'Plop! A lower spot caught us. Comfy, actually.', whipper: 'slip' },
    { text: 'Bump! Landed lower. Not lost, just lower.', whipper: 'slip', mood: 'calm' },
    { text: 'Crumble, crumble, whoosh! Now we know that one crumbles.', whipper: 'crumble' },
    { text: "The ledge crumbled, and we're fine. Crumbly ones do that.", whipper: 'crumble', mood: 'calm' },
  ],

  // Falls piling up at one spot ({n} = falls here so far). Learning, never losing.
  repeatFall: [
    { text: 'Fall number {n} here! This spot knows us now.' },
    { text: 'Attempt {n}! The chalk lines are making a map.', mood: 'calm' },
    { text: '{n} goes at this one. Each chalk line shows us more.', mood: 'calm' },
    { text: 'My ears have flapped {n} times here. Strong ears!' },
    { text: "The rope's caught us {n} times here. It never gets tired.", whipper: 'rope', pack: true },
    { text: "The rope's caught you {n} times here. Still cheering!", whipper: 'rope', out: true },
    { text: "Again! I'm getting good at falling. So are you." },
    { text: "This one's tricky. Tricky means we're learning it.", mood: 'calm' },
    { text: "Look at all that chalk. We're working this out.", mood: 'calm' },
    { text: 'Still scared, still trying, still bouncing. Again?' },
    { text: 'Every chalk line here is a clue. Lots of clues!', mood: 'calm' },
    { text: 'Real climbers fall lots on hard bits. I asked one.' },
  ],

  // Beta hints from her last try at this spot. Offers, never orders; free.
  hintShort: [
    { text: 'We were a bit short. More power?' },
    { text: "Didn't quite reach! Pull back further?" },
    { text: 'Our chalk stops before it. More oomph?' },
    { text: 'A longer drag might get us there. Want to try?' },
    { text: 'Just short! Drag back a bit more?' },
  ],
  hintLong: [
    { text: 'We flew right past it! A bit less pull?', mood: 'giggly' },
    { text: 'Too much zoom! Try a shorter drag?' },
    { text: 'Whoosh, right over it! Gentler this time?' },
    { text: 'We had loads of power. Maybe a bit less?' },
  ],
  hintSteep: [
    { text: 'Lots of up, not much across. Aim more sideways?' },
    { text: 'We went up like a rocket! Lean the aim over?', mood: 'giggly' },
    { text: 'Too high, not far enough. Aim a little lower?' },
    { text: 'We popped straight up. Tip the aim toward it?' },
  ],
  hintFlat: [
    { text: 'We went too flat. Aim a bit higher?' },
    { text: 'Not enough up! Point it more at the sky?' },
    { text: 'We skimmed along low. Try a taller arc?' },
    { text: 'A higher arc, maybe? Ours was a bit flat.' },
  ],
  hintBumped: [
    { text: 'We bonked a ledge on the way. Different angle?', mood: 'giggly' },
    { text: 'Bonk! Something got in the way. Try a new arc?' },
    { text: 'A ledge bumped us. Can we arc around it?' },
    { text: 'Bump! Shall we find an arc that misses that ledge?' },
  ],
  hintGust: [
    { text: 'The wind shoved us! Wait for it to calm?' },
    { text: "Watch the grass. Leap when it's still?" },
    { text: 'A gust got us. Leap between the whooshes?' },
    { text: 'The wind has a rhythm. Leap in the quiet bit?' },
  ],
  hintCrumbled: [
    { text: 'That ledge crumbles. Leap off a bit quicker?' },
    { text: 'Crumbly ledge! Aim fast and go?' },
    { text: 'It crumbled under us. Hop off sooner next time?' },
    { text: "Crumbly ones don't wait. Shall we leap sooner?" },
  ],

  // After more falls at one spot: a faint ghost of a leap that works.
  ghost: [
    { text: 'Want to see a ghost of a leap that works?' },
    { text: 'I can show a see-through ghost leap. Want a peek?' },
    { text: "Climbers watch each other's leaps all the time. Ghost leap?" },
    { text: "Here's a ghost leap to copy, if you like." },
  ],

  // Offering beta (a tip). Asking for beta is what real climbers do.
  betaOffer: [
    { text: 'Want some beta? Climbers share tips all the time.' },
    { text: "I've got a tip from our chalk lines. Want it?" },
    { text: 'Asking for beta is what real climbers do. Tip?' },
    { text: 'Want my idea? Climbers swap ideas all day long.' },
  ],

  // Before a Looks Scary moment (the Fear Forecast comes next).
  looksScaryBefore: [
    { text: 'What IS that? It looks super scary.' },
    { text: 'My ears are hiding. That thing looks scary.' },
    { text: "That looks SO scary. Let's go and see anyway?", mood: 'wobbly' },
    { text: 'Gulp. How scary does that look to you?', mood: 'wobbly' },
    { text: "I'm scared of that. Let's get close and find out.", mood: 'wobbly' },
    { text: 'That gap looks HUGE. My knees are melting.', scary: 'bigleap' },
    { text: 'Is that a gap or a canyon? Gulp.', scary: 'bigleap' },
    { text: 'Glowing eyes in the cave! Lots of them!', scary: 'eyes' },
    { text: 'Something in that cave is looking at us. Eek.', scary: 'eyes' },
    { text: 'The whole cliff is rumbling! What IS that?', scary: 'rumble' },
    { text: 'Grrrumble. Did the mountain just growl at us?', scary: 'rumble' },
    { text: 'A wobbly rope bridge. Wobblier than my knees!', scary: 'bridge', mood: 'wobbly' },
    { text: 'That bridge creaks. My hooves are not happy.', scary: 'bridge' },
    { text: 'A GIANT shadow in the fog! How big is it?', scary: 'shadow' },
    { text: 'Something enormous is up there. I can see its ears!', scary: 'shadow' },
  ],

  // After it, up close: it was gentle all along.
  looksScaryAfter: [
    { text: 'Huh. Looked way scarier from down there.' },
    { text: "Up close it's… kind of nice?", mood: 'happy' },
    { text: 'My scary guess was way bigger than the real thing.' },
    { text: 'Scary from far away. Cozy up close. Huh!', mood: 'happy' },
    { text: "We went anyway. It's nothing like I imagined!", mood: 'happy' },
    { text: 'That giant gap? Just a big hop! My knees overreacted.', scary: 'bigleap' },
    { text: 'The eyes were fireflies! Hello, tiny lights!', scary: 'eyes', mood: 'happy' },
    { text: 'It was just a sleepy bear, snoring! Shh, tiptoe.', scary: 'rumble' },
    { text: 'The bridge held! Wobbly, and totally fine.', scary: 'bridge', mood: 'happy' },
    { text: 'The giant was a fluffy marmot! Fluffier than me!', scary: 'shadow' },
    { text: 'Up close, the giant gap was just a big step!', scary: 'bigleap', mood: 'happy' },
    { text: "Fireflies! Not eyes at all. They're blinking hello!", scary: 'eyes' },
    { text: 'The rumble was a bear, snoring! A sleepy, cozy bear.', scary: 'rumble' },
    { text: 'It creaked and swayed, and it held us up!', scary: 'bridge' },
    { text: 'The giant shadow? A marmot, sunbathing! So fluffy.', scary: 'shadow', mood: 'happy' },
  ],

  // At the camp hub. A few gentle morals; the picker allows one per camp arrival.
  campIdle: [
    { text: "The fire's warm. My legs have nearly stopped wobbling." },
    { text: 'I like camp. The ground stays exactly where it is.', mood: 'giggly' },
    { text: "The mountain looks very tall today. Let's go anyway?", mood: 'wobbly' },
    { text: 'My hooves are ready. My tummy is still deciding.', mood: 'scared' },
    { text: 'Your backpack is the comfiest spot on the whole mountain.', mood: 'happy', pack: true },
    { text: 'I peeked up the trail. Still high. Still coming.' },
    { text: 'Sitting by the fire is my best skill.', mood: 'giggly' },
    { text: "Somewhere up there is Sky Lake. I wonder if it's splashy.", mood: 'happy', pack: true },
    { text: "The fire crackled. I jumped. I'm still sitting here, though.", mood: 'giggly' },
    { text: 'Want to hear my fierce noise? Meh-eh-eh. Terrifying.', mood: 'giggly' },
    { text: "Somebody's tummy rumbled. Not mine. Okay, mine.", mood: 'giggly' },
    { text: "Mountain goats are meant to love heights. I'm a special one.", mood: 'giggly' },
    { text: 'I counted the stars last night. I got to eleven.' },
    { text: 'I dreamed we could see the whole world from Sky Lake.', mood: 'happy', pack: true },
    // After Sky Lake the goat sits beside her by the fire.
    { text: 'I still have Sky Lake in my ears. Best flop ever.', mood: 'giggly', out: true },
    { text: 'Out of the backpack, by the fire. Still a bit wobbly.', mood: 'calm', out: true },
    { text: 'We saw everything from the top. My knees still remember.', mood: 'happy', out: true },
    { text: "Climb by moonlight sometime? I'll bring my wobbly legs.", mood: 'wobbly', out: true },
    { text: 'Being scared just means it matters to us.', moral: true },
    { text: "You don't have to stop being scared to go.", moral: true },
    { text: "I'm scared lots. I come anyway. That's my whole trick.", moral: true },
    { text: 'Every flop teaches us something. Even the silly ones.', moral: true },
    { text: 'Scared legs can still climb. Mine do it every day.', moral: true },
  ],

  // Reaching a camp partway up a pitch (the rope now ties on here).
  campReached: [
    { text: "A camp! The rope's tied on here now." },
    { text: 'Camp! If we fall now, we only come back here.', mood: 'calm' },
    { text: 'Ahh, a camp. My knees can stop wobbling for a bit.', mood: 'calm' },
    { text: 'New camp! Look how far below the last one is.' },
    { text: 'Camp! Every bit below us, we climbed scared.' },
    { text: 'Scared the whole way here. Scared is allowed to come.', moral: true, mood: 'calm' },
  ],

  // A stone joins the cairn ({n} = stones in the cairn now). Same for every brave thing.
  stoneAdded: [
    { text: 'Clack! Stone {n}. Each one is something real you did.' },
    { text: 'Clack! A real-life stone. Those are my favourite kind.' },
    { text: 'A new stone! I heard that clack from the backpack.', pack: true, mood: 'giggly' },
    { text: 'That stone is yours forever. Nobody can take it off.', mood: 'calm' },
    { text: "Our cairn's getting taller than me!", mood: 'giggly' },
    { text: 'You did a real scary thing. Way scarier than leaping!' },
    { text: "Clack! The mountain heard that. I'm sure of it." },
    { text: 'One more stone on the cairn. One more real try.', mood: 'calm' },
  ],

  stoneWaiting: [
    { text: S.stoneWaiting, mood: M.stoneWaiting },
    { text: S.stoneWaitingLater, mood: M.stoneWaitingLater },
    { text: 'This one waits right here. It gets first spot tomorrow.' },
    { text: "A waiting stone! It's still yours. It goes on tomorrow.", mood: 'happy' },
  ],

  // Visiting the cairn with nothing new on it: sitting by the stones together.
  cairnVisit: [
    { text: 'Every stone here is a real thing you did.' },
    { text: 'I like sitting by our cairn. It feels like a hug.', mood: 'happy' },
    { text: "Tap a stone and I'll listen to its story again.", mood: 'happy' },
    { text: 'Some went wobbly. Some flopped. Every stone counts the same.' },
    { text: 'I gave our cairn a sniff. It smells like real life.', mood: 'giggly' },
  ],

  // The cairn's hilltop before the first stone.
  cairnEmpty: [
    { text: 'This hilltop is saving a spot for our first stone.' },
    { text: 'One real brave thing, and a stone lands right here.', mood: 'happy' },
  ],

  // She logged a real brave thing that flopped. Respect, never a joke.
  flopLogged: [
    { text: "It didn't go how you hoped. You still did it." },
    { text: "Flopped, and still here. That's the bravest kind." },
    { text: "You tried something really scary. A flop doesn't undo that." },
    { text: 'Thank you for telling me. Flops are hard to say.' },
    { text: "Here's a hoof hug. You went anyway.", mood: 'happy' },
    { text: 'The scary part was going. You did that part.' },
    { text: 'Flops are how everybody learns. Even mountain goats. Especially me.' },
  ],

  // "Not today" on a plan. It costs nothing.
  notToday: [
    { text: S.notToday, mood: M.notToday },
    { text: 'Not today is a real answer. The plan will keep.' },
    { text: 'My tummy said no too. Some days are like that.' },
    { text: "Okay! It'll still be here whenever you want it.", mood: 'happy' },
    { text: 'No rush. Mountains are very good at waiting.' },
  ],

  // The top of the whole mountain, Sky Lake.
  summit: [
    { text: S.finale[0], mood: M.finale[0] },
    { text: S.finale[1], mood: M.finale[1] },
    { text: S.finale[2], mood: M.finale[2] },
    { text: S.finale[3], mood: M.finale[3] },
    { text: "The top of {mountain}! The whole thing! I'm dizzy!", mood: 'giggly' },
    { text: 'Look how far we came! Every flop is down there.' },
    { text: 'I was scared at every single step. Best climb ever.' },
  ],

  // The first rope catch: always says WHY the rope is there.
  rope: [
    { text: S.ropeFirst, mood: M.ropeFirst },
    { text: "Boing! That's the rope. It's why climbers can try scary moves.", mood: 'giggly' },
  ],

  // The lesson's aiming hint (said again if she waits).
  lesson: [
    { text: S.lessonLeap, mood: M.lessonLeap },
    { text: 'Pull back like a slingshot, then let go!' },
    { text: "Drag back, let go, and I'll hold on tight!", mood: 'wobbly' },
  ],

  meet: S.meet.map((text, i): GoatLine => ({ text, mood: M.meet[i] })),

  hiddenHold: [
    { text: S.hiddenHold, mood: M.hiddenHold },
    { text: 'Ooh! A secret hold. Falling found it!' },
    { text: 'See that? A hidden hold! Flops find things.' },
    { text: "A shortcut hold! We'd never have seen it without falling." },
  ],

  sunset: [
    { text: S.sunset, mood: M.sunset },
    { text: "The sun's sleepy. Me too. Back to camp?" },
    { text: "Orange sky! That's the sun saying goodnight.", mood: 'happy' },
    { text: "The mountain isn't going anywhere. More climbing tomorrow!", mood: 'happy' },
  ],

  // The send: the top of a pitch ({n} = attempts for this pitch, the send included).
  send: [
    { text: 'We sent it! {n} attempts, and every one helped.' },
    { text: '{n} attempts to send it. I felt every whoosh.', mood: 'giggly' },
    { text: 'Top of the pitch! Jelly legs went all the way.' },
    { text: 'We sent it! I was scared the whole way. Ha!', mood: 'giggly' },
    { text: "Sent! Look at all that chalk below. That's our map." },
    { text: 'The top! My knees wobbled up every single bit.', mood: 'wobbly' },
    { text: 'We sent this pitch, scared and wobbly and all.' },
  ],

  firstCamp: [{ text: S.firstCamp, mood: M.firstCamp }],

  // The first time she stands on a crumbly ledge.
  crumbleFound: [
    { text: "This ledge is crumbly! Let's hop off quick!" },
    { text: "Eek, crumbly! Let's not stay long." },
    { text: "It's crumbling! Now we know. Leap off fast?", mood: 'wobbly' },
    { text: 'Cracks! That means go, go, go!' },
  ],

  // A gust is coming (the grass bends first).
  gustSoon: [
    { text: "Ears up! Wind's coming." },
    { text: 'The grass is bending. A gust is on the way!' },
    { text: 'Whoosh incoming! Maybe wait for the calm bit?' },
    { text: "Feel that? The wind's taking a big breath." },
  ],

  // Landed back where she started: no count either way.
  hop: [
    { text: 'Boing. Back where we started. Hi again, spot!' },
    { text: 'A little hop! My tummy enjoyed that.' },
    { text: 'Up and down, same place. Warm-up done!' },
    { text: 'We hopped on the spot. Legs: warmed up!' },
  ],

  // "Make it smaller" on a plan.
  smaller: [
    { text: 'A smaller step still goes up. I love small steps.' },
    { text: "Tiny steps! That's how goats climb everything." },
    { text: 'Half a scary thing is still a scary thing.', mood: 'calm' },
    { text: 'Smaller is clever. Mountains are made of little rocks.' },
  ],

  // "I'll do it later": a brave thing saved to Plans. Plans keep; nothing is late.
  planSaved: [
    { text: "Saved for later! I'll keep it safe in the backpack.", pack: true },
    { text: 'A plan! It can wait as long as it likes.' },
    { text: "Later is a real time. It'll be right here.", mood: 'calm' },
    { text: 'Into Plans it goes. My knees say thank you.', mood: 'giggly' },
    { text: "Whenever you're ready, so is this plan.", mood: 'calm' },
  ],

  // Opening a Spotted! letter.
  letter: [
    { text: 'A letter! Somebody spotted something you did.' },
    { text: 'Mail! Up a mountain! Open it, open it!', mood: 'giggly' },
    { text: 'Someone noticed you being you. Want to read it?', mood: 'calm' },
    { text: 'A Spotted! letter. My ears are wiggling already.', mood: 'giggly' },
  ],
}

/** Every moment, in a fixed order. */
export const GOAT_MOMENTS = Object.keys(GOAT_LINES) as GoatMoment[]
