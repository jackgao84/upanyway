/**
 * Idea cards, Oops Missions and the log flow's chips and smaller versions (PROGRESS: The Cairn).
 * Enough ideas a young climber would recognise, each short and in her voice; Oops Missions are
 * small mistakes made on purpose that never touch graded schoolwork, safety or anyone's feelings.
 */
import { describe, expect, it } from 'vitest'
import { HAPPENED_CHIPS } from '../../src/content/happenedChips'
import { IDEAS, IDEA_GROUPS, OOPS_INTRO, customIdeaCards, ideaById, type IdeaGroup } from '../../src/content/ideas'
import { LEARN_CHIPS } from '../../src/content/learnChips'
import { SMALLER_WAYS, WRITE_MY_OWN, WRITE_MY_OWN_HINT, baseText, smallerText } from '../../src/content/smaller'
import { LOG_COPY, PLANS_COPY } from '../../src/screens/log/copy'
import { plain, bannedIn, wordCount } from './voice'

const brave = IDEAS.filter((i) => !i.oops)
const oops = IDEAS.filter((i) => i.oops)

/** Oops Missions stay away from graded schoolwork. */
const SCHOOLWORK = /\b(homework|tests?|exams?|grades?|marks?|scores? (?:in|on) (?:a|my) test|worksheets?|spelling|maths|math|quiz(?:zes)?|assignments?|project|teacher'?s?|class ?work|school ?work|lessons?|essay|report card)\b/
/** …and from anything unsafe… */
const UNSAFE = /\b(knife|knives|scissors|fire|matches|lighter|candle|stove|oven|hot|road|roads|street|traffic|cross|crossing|climb\w*|roof|tree|ledge|high|jump\w*|run(?:ning)? away|alone|strangers?|swim\w*|water|pool|deep|dark|lock\w*|medicine|pills?|plug|socket|electric\w*|bike|scooter|skateboard|without a grown-up)\b/
/** …and from anyone's feelings: no pranks, tricks, teasing or anything mean. */
const UNKIND = /\b(prank\w*|trick\w*|tease|teasing|mean|lie|lies|lying|fib|hide|hiding|steal|break|broke|ruin\w*|scare|scaring|laugh at|make fun|copy|cheat\w*|someone else'?s|their (?:work|things|stuff)|on someone)\b/

describe('idea cards', () => {
  it('has enough brave ideas and Oops Missions', () => {
    expect(brave.length).toBeGreaterThanOrEqual(34)
    expect(oops.length).toBeGreaterThanOrEqual(18)
  })

  it('every idea has a unique id and a known group', () => {
    const ids = IDEAS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    const groups = new Set<IdeaGroup>(IDEA_GROUPS.map((g) => g.id))
    for (const idea of IDEAS) {
      expect(groups.has(idea.group), idea.id).toBe(true)
      expect(idea.oops, idea.id).toBe(idea.group === 'oops')
      expect(ideaById(idea.id)).toBe(idea)
    }
  })

  it('every group has ideas and a title', () => {
    for (const g of IDEA_GROUPS) {
      expect(g.title.trim(), g.id).not.toBe('')
      expect(IDEAS.filter((i) => i.group === g.id).length, g.id).toBeGreaterThanOrEqual(4)
    }
  })

  it('every text is short, plain and in her voice', () => {
    for (const idea of IDEAS) {
      expect(idea.text.trim(), idea.id).toBe(idea.text)
      expect(idea.text.length, idea.id).toBeGreaterThan(0)
      expect(wordCount(idea.text), idea.text).toBeLessThanOrEqual(12)
      expect(bannedIn(idea.text), idea.text).toEqual([])
      expect(idea.text, idea.text).toMatch(/^[A-Z]/)
      expect(idea.text, idea.text).not.toMatch(/[.!]$/)
      expect(idea.text, idea.text).not.toMatch(/'/) // curly apostrophes on screen
    }
    expect(new Set(IDEAS.map((i) => plain(i.text))).size, 'no duplicate texts').toBe(IDEAS.length)
  })

  it('covers everyday school life and the brief’s own examples', () => {
    const all = IDEAS.map((i) => plain(i.text)).join('\n')
    for (const must of [
      'ask the teacher',
      'canteen',
      'swimming',
      'assembly',
      'pe ',
      'school trip',
      'club',
      'join a game with kids i don',
      "i don't know",
      'ask for help',
      'what i actually want',
      'new food',
      'read out loud',
      'call a relative',
      'shop assistant',
      'light off',
      'for my family',
      'someone new at lunch',
      'sorry first',
    ]) {
      expect(all, must).toContain(must)
    }
    const oopsAll = oops.map((i) => plain(i.text)).join('\n')
    for (const must of ['odd socks', 'other hand', 'in pen', 'one mistake in a note', 'worst joke', 'timer rings']) {
      expect(oopsAll, must).toContain(must)
    }
  })

  it('puts Oops Missions that could land on schoolwork somewhere safe (at home, scrap paper)', () => {
    for (const idea of oops) {
      const t = plain(idea.text)
      if (/\b(draw\w*|note|write|writing|colour in|colour outside|scribble)\b/.test(t)) {
        expect(/\bat home\b|scrap paper/.test(t), idea.text).toBe(true)
      }
    }
  })

  it('Oops Missions never touch schoolwork, safety or anyone’s feelings', () => {
    for (const idea of oops) {
      const t = plain(idea.text)
      expect(t.match(SCHOOLWORK)?.[0] ?? null, idea.text).toBeNull()
      expect(t.match(UNSAFE)?.[0] ?? null, idea.text).toBeNull()
      expect(t.match(UNKIND)?.[0] ?? null, idea.text).toBeNull()
    }
  })

  it('the keyword checks do catch the kinds of thing they guard against', () => {
    expect(plain('Leave a mistake in my homework').match(SCHOOLWORK)).not.toBeNull()
    expect(plain('Get one answer wrong on a test').match(SCHOOLWORK)).not.toBeNull()
    expect(plain('Cross the road with my eyes closed').match(UNSAFE)).not.toBeNull()
    expect(plain('Climb the tree without holding on').match(UNSAFE)).not.toBeNull()
    expect(plain('Play a prank on my brother').match(UNKIND)).not.toBeNull()
    expect(plain('Hide someone’s shoes').match(UNKIND)).not.toBeNull()
  })

  it('the Oops Missions have a one-line explanation', () => {
    expect(OOPS_INTRO.trim()).not.toBe('')
    expect(OOPS_INTRO.split('\n').length).toBe(1)
    expect(bannedIn(OOPS_INTRO)).toEqual([])
  })

  it('grown-ups’ ideas become cards she can choose (blank ones are skipped)', () => {
    const at = new Date(2026, 0, 5).toISOString()
    const cards = customIdeaCards([
      { id: 'c1', createdAt: at, text: '  Ask Grandma about her first job ', oops: false },
      { id: 'c2', createdAt: at, text: 'Wear a silly hat to dinner', oops: true },
      { id: 'c3', createdAt: at, text: '   ', oops: false },
    ])
    expect(cards).toEqual([
      { id: 'c1', text: 'Ask Grandma about her first job', oops: false, group: 'me' },
      { id: 'c2', text: 'Wear a silly hat to dinner', oops: true, group: 'oops' },
    ])
  })
})

describe('chips', () => {
  it('has enough "What did I learn?" and "What actually happened?" chips', () => {
    expect(LEARN_CHIPS.length).toBeGreaterThanOrEqual(10)
    expect(HAPPENED_CHIPS.length).toBeGreaterThanOrEqual(8)
  })

  it('chips are short, unique and free of banned phrases', () => {
    for (const list of [LEARN_CHIPS, HAPPENED_CHIPS]) {
      expect(new Set(list.map(plain)).size).toBe(list.length)
      for (const text of list) {
        expect(text.trim(), text).toBe(text)
        expect(text.length, text).toBeGreaterThan(0)
        expect(wordCount(text), text).toBeLessThanOrEqual(10)
        expect(bannedIn(text), text).toEqual([])
        expect(text, text).not.toMatch(/'/)
      }
    }
  })

  it('learn chips are her own thoughts, not orders', () => {
    for (const text of LEARN_CHIPS) {
      expect(plain(text), text).not.toMatch(/\b(you should|you must|you need|always|never give up)\b/)
    }
  })
})

describe('make it smaller', () => {
  it('offers the brief’s three smaller versions plus write my own', () => {
    expect(SMALLER_WAYS.map((w) => w.id)).toEqual(['half', 'someone', 'home'])
    expect(WRITE_MY_OWN.trim()).not.toBe('')
    const labels = SMALLER_WAYS.map((w) => plain(w.label)).join('\n')
    expect(labels).toContain('half')
    expect(labels).toContain('with someone first')
    expect(labels).toContain('practise at home first')
  })

  it('each way has a short, plain line saying what it means', () => {
    for (const hint of [...SMALLER_WAYS.map((w) => w.hint), WRITE_MY_OWN_HINT]) {
      expect(hint.trim(), hint).not.toBe('')
      expect(wordCount(hint), hint).toBeLessThanOrEqual(12)
      expect(bannedIn(hint), hint).toEqual([])
      expect(hint, hint).not.toMatch(/'/)
    }
  })

  it('every way turns any plan into a non-empty smaller text that keeps her words', () => {
    for (const way of SMALLER_WAYS) {
      for (const idea of IDEAS) {
        const t = smallerText(way.id, idea.text)
        expect(t.trim(), `${way.id}: ${idea.text}`).not.toBe('')
        expect(t, `${way.id}: ${idea.text}`).toContain(idea.text)
        expect(t.startsWith(way.prefix), t).toBe(true)
      }
      expect(smallerText(way.id, '   ').trim()).not.toBe('')
    }
  })

  it('making a smaller step smaller again does not pile up prefixes', () => {
    const once = smallerText('half', 'Sleep with the light off')
    const twice = smallerText('someone', once)
    expect(twice).toBe('With someone first: Sleep with the light off')
    expect(baseText(twice)).toBe('Sleep with the light off')
  })
})

describe('log and plans copy', () => {
  it('uses the brief’s exact outcome words and brave-vs-dangerous line', () => {
    expect(LOG_COPY.outcome.nailed).toBe('Nailed it')
    expect(LOG_COPY.outcome.wobbly).toBe('Wobbly, but I did it')
    expect(LOG_COPY.outcome.flopped).toBe('Flopped — and I’m still here')
    expect(`${LOG_COPY.ideas.brave} ${LOG_COPY.ideas.care}`).toBe(
      'Brave means safe but scary. If something could really hurt you or someone else, the brave move is to stop and tell a grown-up.',
    )
    expect(PLANS_COPY.did).toBe('I did it!')
    expect(PLANS_COPY.notToday).toBe('Not today')
    expect(PLANS_COPY.offer.q).toBe('Make it smaller?')
  })

  it('never counts, dates, nags or uses banned phrases', () => {
    const strings: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (typeof v === 'function') strings.push(String((v as (...a: unknown[]) => unknown)('Cloudy', 4)))
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(LOG_COPY)
    walk(PLANS_COPY)
    for (const s of strings) {
      expect(bannedIn(s), s).toEqual([])
      expect(plain(s), s).not.toMatch(/\b(streak|days? in a row|yesterday|overdue|late|expire\w*|deadline|hurry|times)\b/)
    }
  })
})
