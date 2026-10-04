/**
 * "How to cheer" — the one page for grown-ups (parent mode → How to cheer). Plain words for adults,
 * warm and concrete, with one or two things to try saying under each idea. Then a short "how the game
 * works" so grown-ups know what the stones, the sinking sun and the rest mean.
 *
 * The same voice rules as every other piece of copy apply (tests/unit/parentCopy.test.ts): no banned
 * phrases even as counter-examples, nothing that compares a child with anyone, nothing that assigns.
 * No names: the child is "your climber" / "they".
 */

export type CheerTipId = 'try' | 'learn' | 'flops' | 'rescue' | 'bargain' | 'compare'

export interface CheerTip {
  id: CheerTipId
  title: string
  body: string
  /** One or two things a grown-up could say. */
  tryThese: readonly string[]
}

export type CheerFactId = 'brave' | 'stones' | 'trail' | 'sun' | 'falls' | 'weather' | 'plans'

export interface CheerFact {
  id: CheerFactId
  title: string
  body: string
}

export const CHEER = {
  title: 'How to cheer',
  intro: [
    'Up Anyway is built on two ideas. It’s okay to be scared and do it anyway. And it’s okay to flop: a flop is information, not a verdict.',
    'The game makes falling safe and silly. The real-life brave things happen out here, and that’s where you come in.',
  ],
  tipsTitle: 'Six ways to cheer',
  tryLabel: 'Try saying',
  tips: [
    {
      id: 'try',
      title: 'Praise the try, not the result',
      body: 'The brave part is going anyway with a racing heart. Whether it worked out is mostly luck and practice. Name the exact moment they went for it — that’s the part they can do again.',
      tryThese: [
        'You put your hand up even though you weren’t sure. That took guts.',
        'Your legs were wobbly and you jumped in anyway.',
      ],
    },
    {
      id: 'learn',
      title: 'Ask “What did you learn?”, not “Why didn’t you…?”',
      body: '“Why didn’t you…?” asks for an excuse. “What did you learn?” turns a flop into information, which is all a flop is. Then listen. No fixing, no speech.',
      tryThese: ['What did you find out?', 'What would you try differently next time?'],
    },
    {
      id: 'flops',
      title: 'Tell them about your own flops',
      body: 'Kids often think grown-ups never get it wrong. Tell a real one: what happened, how it felt, what you learned, and that you’re still here. Then hang it in the Grown-ups’ Wing of the Hall of Flops.',
      tryThese: [
        'Today I called someone at work by the wrong name. I went bright red, said sorry, and we both laughed.',
        'I was nervous about my meeting too. I went anyway, and my voice wobbled the whole time.',
      ],
    },
    {
      id: 'rescue',
      title: 'Don’t rescue too fast',
      body: 'When they’re stuck or nervous, wait a beat before stepping in. Sit with the wobbly feeling together and ask what they could try first. A few uncomfortable minutes are how courage grows.',
      tryThese: [
        'That sounds hard. What’s one small thing you could try?',
        'I’m right here. Have a go, and I’ll help if you still need me.',
      ],
    },
    {
      id: 'bargain',
      title: 'Keep the game out of rewards and punishments',
      body: 'Never use the game, its climbing time or its stones as a reward or a punishment for other things, like homework, chores or behaviour. The mountain is theirs. Once it becomes a bargaining chip, brave things turn into jobs done for you.',
      tryThese: [
        'Your climbing time is yours. It isn’t tied to anything else.',
        'That’s a separate thing. The mountain will be there either way.',
      ],
    },
    {
      id: 'compare',
      title: 'Never compare',
      body: 'Not with a brother or sister, a classmate, a cousin, or you at their age. A small brave thing that was hard for them counts exactly as much as a big one. Their cairn is measured against nobody.',
      tryThese: ['That was a big one for you.', 'You did it your way.'],
    },
  ] as readonly CheerTip[],
  flopLink: 'Add a flop to the Wing',
  factsTitle: 'How the game works',
  facts: [
    {
      id: 'brave',
      title: 'Brave means safe but scary',
      body: 'A brave thing is something safe that feels scary: asking a question, trying a new food, joining a game. If something could really hurt them or someone else, the brave move is to stop and tell a grown-up. The game says this at the start and on the ideas page.',
    },
    {
      id: 'stones',
      title: 'The stones',
      body: 'Each brave thing they mark as done adds one stone to their cairn, whatever their fear number: a 2 earns the same stone as a 10, so there’s no reason to inflate the numbers. “Nailed it”, “Wobbly” and “Flopped” all earn the same stone too. At most three brave-thing stones go on each day; extras wait and go on the next day. Each Spotted! letter adds one bonus stone when it’s opened (one a day). Stones are never spent or taken away.',
    },
    {
      id: 'trail',
      title: 'How stones open the mountain',
      body: 'The mountain has 16 pitches (climbing sections). Pitch 1 is open from the start. Each pitch after that opens when two things are true: they have climbed the pitch below it all the way to the top, and their cairn holds enough stones (pitch 2 needs none, pitch 3 needs 1, pitch 4 needs 2, and so on up to 14 for the summit). Real-life brave things are what take them up the mountain.',
    },
    {
      id: 'sun',
      title: 'The sinking sun',
      body: 'Daily climbing time shows as a small sun slowly setting — never numbers or a countdown. When it sets, they finish the attempt they’re on, and the goat says the mountain will be here tomorrow. Camp, the cairn and the Hall of Flops stay open. You choose the minutes in Settings.',
    },
    {
      id: 'falls',
      title: 'Falling is the point',
      body: 'In the game every fall counts as an attempt and is worn with pride: silly fall poses to collect, chalk marks showing each try, and a map of every attempt at the end of a climb. It’s practice at flopping somewhere safe.',
    },
    {
      id: 'weather',
      title: 'The Weather Station',
      body: 'Before a brave thing they forecast how scary it will be, from 0 to 10. Afterwards they say how scary it really was. Over time the chart shows what most of us find: fear forecasts come in stormier than the real weather.',
    },
    {
      id: 'plans',
      title: 'Plans and “Not today”',
      body: 'Plans wait as long as they need. “Not today” costs nothing and isn’t shown anywhere. Please don’t use their plans as a to-do list or a reminder: choosing when is part of the courage.',
    },
  ] as readonly CheerFact[],
  closing: 'You don’t need to get this right every time. Noticing the try is most of it.',
} as const
