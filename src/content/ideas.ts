/**
 * Idea cards for "What's the brave thing?" (log flow → Pick an idea). She always chooses: an idea is
 * only ever a suggestion, never a task. Parents can add more (save.customIdeas), never assign.
 *
 * Brave ideas: everyday things a young climber would recognise (audience: see .brief/) — the canteen,
 * swimming lessons, assembly, PE, school trips, clubs, ordering food (Decision 24: school-life
 * details, never names of schools, places or people).
 *
 * Oops Missions: small mistakes made on purpose. They never touch graded schoolwork, safety or
 * anyone's feelings — no pranks, nothing mean, nothing unsafe (tests/unit/ideas.test.ts checks).
 *
 * Every text is at most 12 words, in her voice: "I" or a plain "do this".
 */
import type { CustomIdea } from '../storage/schema'

export type IdeaGroup = 'school' | 'friends' | 'family' | 'out' | 'me' | 'oops'

export interface Idea {
  id: string
  text: string
  oops: boolean
  group: IdeaGroup
}

/** The groups in the order the ideas screen shows them (Oops Missions get their own section last). */
export const IDEA_GROUPS: readonly { id: IdeaGroup; title: string }[] = [
  { id: 'school', title: 'At school' },
  { id: 'friends', title: 'With friends' },
  { id: 'family', title: 'With family' },
  { id: 'out', title: 'Out and about' },
  { id: 'me', title: 'Just me' },
  { id: 'oops', title: 'Oops Missions' },
]

/** The one line under the Oops Missions heading. */
export const OOPS_INTRO = 'Little mistakes made on purpose, just to see what happens.'

const brave = (group: Exclude<IdeaGroup, 'oops'>, id: string, text: string): Idea => ({ id, text, oops: false, group })
const oops = (id: string, text: string): Idea => ({ id, text, oops: true, group: 'oops' })

export const IDEAS: readonly Idea[] = [
  // At school
  brave('school', 'school-ask-question', 'Ask the teacher a question in class'),
  brave('school', 'school-hand-up', 'Put my hand up, even if I’m not sure'),
  brave('school', 'school-dont-know', 'Say “I don’t know” out loud in class'),
  brave('school', 'school-read-aloud', 'Read out loud in front of the class'),
  brave('school', 'school-stuck', 'Tell the teacher when I’m stuck'),
  brave('school', 'school-toilet', 'Ask to go to the toilet during a lesson'),
  brave('school', 'school-canteen', 'Order my own food at the canteen'),
  brave('school', 'school-deep-end', 'Jump into the deep end at swimming lessons'),
  brave('school', 'school-length', 'Swim a whole length at swimming lessons'),
  brave('school', 'school-face-under', 'Put my whole face under the water at swimming'),
  brave('school', 'school-pe-game', 'Have a go at a PE game I find hard'),
  brave('school', 'school-assembly', 'Say something in front of the whole assembly'),
  brave('school', 'school-club', 'Try a club I’ve never been to'),
  brave('school', 'school-trip', 'Go on the school trip, nervous tummy and all'),
  brave('school', 'school-sports-day', 'Run in a race on sports day'),
  brave('school', 'school-silly-question', 'Ask a question, even if it might sound silly'),

  // With friends
  brave('friends', 'friends-join-game', 'Join a game with kids I don’t know'),
  brave('friends', 'friends-new-lunch', 'Sit with someone new at lunch'),
  brave('friends', 'friends-what-i-want', 'Say what I actually want, even when it’s different'),
  brave('friends', 'friends-sorry-first', 'Say sorry first after a falling-out'),
  brave('friends', 'friends-ask-play', 'Ask someone new to play at break time'),
  brave('friends', 'friends-no-thanks', 'Say “no thanks” when I don’t want to'),
  brave('friends', 'friends-feelings', 'Tell a friend how I really feel'),
  brave('friends', 'friends-new-kid', 'Say hi to the new kid in my class'),
  brave('friends', 'friends-pick-game', 'Suggest the game we play at break'),
  brave('friends', 'friends-losing', 'Keep playing a game, even when I’m losing'),

  // With family
  brave('family', 'family-call', 'Call a relative on the phone and talk first'),
  brave('family', 'family-show', 'Put on a song or dance show for my family'),
  brave('family', 'family-mistake', 'Tell my family about a mistake I made'),
  brave('family', 'family-worry', 'Tell a grown-up something that’s worrying me'),
  brave('family', 'family-light-off', 'Sleep with the light off'),
  brave('family', 'family-sleepover', 'Sleep over at a relative’s house'),
  brave('family', 'family-help', 'Ask a grown-up for help with something hard'),

  // Out and about
  brave('out', 'out-restaurant', 'Order my own food at a restaurant'),
  brave('out', 'out-shop-ask', 'Ask a shop assistant where something is'),
  brave('out', 'out-pay', 'Pay at the counter by myself'),
  brave('out', 'out-new-food', 'Try a new food I’m not sure about'),
  brave('out', 'out-waiter', 'Ask the waiter for something I need'),
  brave('out', 'out-hairdresser', 'Tell the hairdresser how I’d like my hair'),
  brave('out', 'out-doctor', 'Ask the doctor or dentist a question'),
  brave('out', 'out-new-class', 'Go to a class where I don’t know anyone'),
  brave('out', 'out-neighbour', 'Say hello to a neighbour first'),
  brave('out', 'out-water-slide', 'Go down the big water slide'),

  // Just me
  brave('me', 'me-ask-help', 'Ask for help when I need it'),
  brave('me', 'me-not-good-yet', 'Try something I’m not good at yet'),
  brave('me', 'me-show-drawing', 'Show someone a drawing I made'),
  brave('me', 'me-wear-love', 'Wear something I love, even if it’s different'),
  brave('me', 'me-five-more', 'Keep going on something tricky for five more minutes'),
  brave('me', 'me-dark-room', 'Walk into a dark room to switch the light on'),

  // Oops Missions
  oops('oops-odd-socks', 'Wear odd socks for a whole day'),
  oops('oops-other-hand', 'Draw with my other hand and show someone'),
  oops('oops-pen', 'Draw in pen, so I can’t rub anything out'),
  oops('oops-note-mistake', 'Leave one mistake in a note and don’t fix it'),
  oops('oops-worst-joke', 'Tell my very worst joke'),
  oops('oops-timer', 'Stop a puzzle when the timer rings, finished or not'),
  oops('oops-messy-hair', 'Wear my hair messy on purpose for a day'),
  oops('oops-sing-badly', 'Sing a song badly on purpose'),
  oops('oops-wonky-tower', 'Build a wonky tower and leave it wonky'),
  oops('oops-outside-lines', 'Colour outside the lines on purpose, at home'),
  oops('oops-dance-badly', 'Dance really badly to a song at home'),
  oops('oops-scribble', 'Start a drawing with a big scribble'),
  oops('oops-no-score', 'Play a game without keeping score'),
  oops('oops-inside-out', 'Wear a T-shirt inside out at home'),
  oops('oops-eyes-closed', 'Write my name with my eyes closed on scrap paper'),
  oops('oops-wrong-notes', 'Play a tune for someone, wrong notes and all'),
  oops('oops-card', 'Make a card for someone without starting again'),
  oops('oops-tongue-twister', 'Say a tongue twister super fast and let it tangle'),
  oops('oops-one-minute', 'Draw myself in one minute and stick it up'),
  oops('oops-paper-plane', 'Fold a paper plane in one go and fly it'),
  oops('oops-clash', 'Wear colours that clash, on purpose'),
  oops('oops-umms', 'Send a voice message and keep the umms in'),
]

/** A built-in idea by id. */
export function ideaById(id: string): Idea | undefined {
  return IDEAS.find((i) => i.id === id)
}

/** Ideas a grown-up added in parent mode, as idea cards. Brave ones show in their own section. */
export function customIdeaCards(custom: readonly CustomIdea[]): Idea[] {
  return custom
    .filter((c) => c.text.trim())
    .map((c) => ({ id: c.id, text: c.text.trim(), oops: c.oops, group: c.oops ? 'oops' : 'me' }))
}
