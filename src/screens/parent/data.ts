/**
 * Backup and data (#/parent/data).
 *
 * - Save a backup: one JSON file, `upanyway-backup-YYYY-MM-DD.json` (storage/backup.ts). "Share /
 *   Save to Files" uses the share sheet when the browser can share files (the reliable path on an
 *   iPad, also from the Home Screen app); "Download file" is a Blob + <a download> (the path e2e
 *   drives); "Copy as text" uses the clipboard, or shows the text ready to copy by hand.
 * - Restore: a file (<input type=file>) or pasted text → parseImport → a side-by-side preview of the
 *   backup and the game on this device → confirm → applyImport (the current save becomes the backup
 *   first) → the page shows the restored game (or the first run, if the backup was made before it).
 * - Storage: whether the browser agreed to keep the data (flags.persistGranted, "Ask again"), Home
 *   Screen vs browser, a failed save (store.lastWriteError, "Try saving again") and load notices.
 * - Update ready: a new version is waiting → "Restart now" (sw-register applyUpdateIfSafe()).
 * - Start over: asked twice, with "Save a backup first" offered → store.reset() (the old save is kept
 *   in the backup key; never localStorage.clear) → #/setup.
 */
import { isStandalone, now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { applyUpdateIfSafe, onUpdateReady, updateReady } from '../../app/sw-register'
import { applyImport, backupFileName, exportJson, parseImport, summarize, type ImportSummary } from '../../storage/backup'
import type { SaveData } from '../../storage/schema'
import { requestPersistence, store } from '../../storage/store'
import { button, confirm, modal, setDisabled, textField, toast } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { icon, type IconName } from '../../ui/icons'
import { keepInView } from '../../ui/keyboard'
import { PARENT_COPY } from './copy'
import { formError, panel, para, parentLayout, shortDate } from './parts'

const c = PARENT_COPY.data

// ---------------------------------------------------------------------------------------------
// Export helpers

interface Backup {
  name: string
  text: string
}

function makeBackup(): Backup {
  const at = now()
  return { name: backupFileName(at), text: exportJson(save(), at) }
}

function backupFile(b: Backup): File | null {
  try {
    return new File([b.text], b.name, { type: 'application/json' })
  } catch {
    return null
  }
}

type ShareNavigator = Navigator & {
  canShare?: (data: { files?: File[] }) => boolean
  share?: (data: { files?: File[]; title?: string }) => Promise<void>
}

/** True when this browser can hand a file to the share sheet (iPad/iPhone Safari, some others). */
export function canShareFiles(): boolean {
  const nav = navigator as ShareNavigator
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    const probe = new File(['{}'], 'upanyway-backup.json', { type: 'application/json' })
    return nav.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/** 'shared' | 'cancelled' (the grown-up closed the sheet) | 'failed'. */
async function shareBackup(b: Backup): Promise<'shared' | 'cancelled' | 'failed'> {
  const nav = navigator as ShareNavigator
  const file = backupFile(b)
  if (!file || typeof nav.share !== 'function') return 'failed'
  try {
    if (nav.canShare && !nav.canShare({ files: [file] })) return 'failed'
    await nav.share({ files: [file], title: b.name })
    return 'shared'
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
    console.warn('[upanyway] share failed', err)
    return 'failed'
  }
}

/** Save the backup through the browser's downloads (Blob + <a download>). */
function downloadBackup(b: Backup): boolean {
  try {
    const url = URL.createObjectURL(new Blob([b.text], { type: 'application/json' }))
    const a = h('a', { href: url, download: b.name, class: 'pp-hidden', 'aria-hidden': 'true', tabindex: '-1' })
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.remove()
    }, 10_000)
    return true
  } catch (err) {
    console.warn('[upanyway] download failed', err)
    return false
  }
}

/** Show the backup text in a dialog, selected, for copying by hand (no clipboard access here). */
function showCopyDialog(text: string): void {
  const area = h('textarea', {
    class: 'field__input pp-copy__text',
    readonly: true,
    rows: 8,
    'aria-label': c.export.copyLabel,
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
  })
  area.value = text
  const selectAll = () => {
    area.focus()
    try {
      area.setSelectionRange(0, area.value.length)
    } catch {
      area.select()
    }
  }
  area.addEventListener('focus', () => setTimeout(selectAll, 0))
  modal({
    title: c.export.copyTitle,
    body: [h('p', null, c.export.copyText), area],
    art: 'copy',
    dismissible: true,
    class: 'pp-copy',
    actions: [
      {
        label: c.export.selectAll,
        icon: 'copy',
        onClick: () => {
          selectAll()
          let copied = false
          try {
            copied = document.execCommand('copy')
          } catch {
            copied = false
          }
          if (copied) toast(c.export.copied, { icon: 'check', tone: 'leaf' })
          return false
        },
      },
      { label: c.export.done, variant: 'secondary' },
    ],
  })
}

/** Copy the backup to the clipboard; if the browser won't, show it ready to copy by hand. */
function copyBackup(b: Backup): void {
  const clip = navigator.clipboard
  if (clip && typeof clip.writeText === 'function') {
    clip.writeText(b.text).then(
      () => toast(c.export.copied, { icon: 'check', tone: 'leaf' }),
      () => showCopyDialog(b.text),
    )
    return
  }
  showCopyDialog(b.text)
}

/** Save a backup the best way this device offers (share sheet first on an iPad, else a download). */
async function saveBackupAnyWay(): Promise<boolean> {
  const b = makeBackup()
  if (canShareFiles()) {
    const r = await shareBackup(b)
    if (r === 'shared') return true
    if (r === 'cancelled') return false
  }
  return downloadBackup(b)
}

// ---------------------------------------------------------------------------------------------
// Import helpers

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file)
  })
}

/** When the backup was saved (the envelope's exportedAt), if it says. */
function exportedAt(text: string): string | undefined {
  try {
    const v = JSON.parse(text.replace(/^﻿/, '').trim()) as { exportedAt?: unknown }
    return typeof v.exportedAt === 'string' ? v.exportedAt : undefined
  } catch {
    return undefined
  }
}

function summaryList(s: ImportSummary): HTMLElement {
  const i = c.import
  const row = (name: IconName, text: string) => h('li', null, icon(name, 22), h('span', null, text))
  return h(
    'ul',
    { class: 'pp-summary__list' },
    row('cairn', i.stones(s.stones)),
    row('heart', i.brave(s.braveThings)),
    row('flag', i.pitches(s.pitchesSent)),
    row('goat', i.goat(s.goatName.trim() || i.unnamed)),
    row('mountain', i.mountain(s.mountainName.trim() || i.unnamed)),
  )
}

// ---------------------------------------------------------------------------------------------
// The page

export const dataScreen: Screen = (root, ctx) => {
  const cleanups: (() => void)[] = []
  const cleanup = () => {
    for (const fn of cleanups.splice(0)) fn()
  }

  function render(): void {
    cleanup()
    clear(root)
    root.appendChild(
      parentLayout(ctx, {
        title: c.title,
        class: 'parent--data',
        body: [h('p', { class: 'pp-page-lead' }, c.lead), updatePanel(), exportPanel(), importPanel(), storagePanel(), resetPanel()],
      }),
    )
  }

  // ---- Save a backup ------------------------------------------------------------------------
  function exportPanel(): HTMLElement {
    const e = c.export
    const share = canShareFiles()
      ? button(e.share, {
          icon: 'share',
          size: 'big',
          class: 'pp-export__share',
          onClick: async () => {
            const r = await shareBackup(makeBackup())
            if (r === 'shared') toast(e.shared, { icon: 'check', tone: 'leaf' })
            else if (r === 'failed') toast(e.shareFailed, { icon: 'info', tone: 'sun' })
          },
        })
      : null
    const download = button(e.download, {
      icon: 'download',
      variant: share ? 'secondary' : 'primary',
      onClick: () => {
        if (downloadBackup(makeBackup())) toast(e.downloaded, { icon: 'check', tone: 'leaf' })
      },
    })
    const copy = button(e.copy, { icon: 'copy', variant: 'secondary', onClick: () => copyBackup(makeBackup()) })
    const kb = Math.max(1, Math.round(exportJson(save(), now()).length / 1024))
    return panel(
      { title: e.title, icon: 'download', tone: 'leaf', lead: e.text, class: 'pp-export' },
      share,
      h('div', { class: 'pp-actions pp-actions--wrap' }, download, copy),
      para(e.size(backupFileName(now()), kb), 'pp__text--faint pp-export__file'),
      para(e.where, 'pp__text--faint'),
    )
  }

  // ---- Restore ------------------------------------------------------------------------------
  function importPanel(): HTMLElement {
    const i = c.import
    const host = h('div', { class: 'pp-import' })
    const error = formError()

    const fileInput = h('input', {
      type: 'file',
      accept: '.json,application/json,text/plain',
      class: 'pp-file',
      'aria-label': i.choose,
      tabindex: '-1',
    })
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (!file) return
      error.clear()
      try {
        check(await readFileText(file))
      } catch (err) {
        console.warn('[upanyway] could not read the backup file', err)
        error.show(i.readFail)
      }
    })
    const choose = button(i.choose, { icon: 'upload', onClick: () => fileInput.click() })

    let pasted = ''
    const pasteField = textField({
      label: i.pasteLabel,
      value: '',
      placeholder: i.pastePlaceholder,
      multiline: true,
      autocapitalize: 'none',
      name: 'backup-text',
      onInput: (v) => {
        pasted = v
        error.clear()
      },
    })
    pasteField.input.setAttribute('autocorrect', 'off')
    pasteField.input.setAttribute('spellcheck', 'false')
    pasteField.classList.add('pp-paste__field')
    const pasteBox = h(
      'div',
      { class: 'pp-paste' },
      pasteField,
      h('div', { class: 'pp-actions pp-actions--end' }, button(i.check, { icon: 'check', onClick: () => check(pasted) })),
    )
    pasteBox.hidden = true
    const pasteToggle = button(i.paste, {
      icon: 'pencil',
      variant: 'secondary',
      onClick: () => {
        pasteBox.hidden = !pasteBox.hidden
        pasteToggle.setAttribute('aria-expanded', String(!pasteBox.hidden))
        if (!pasteBox.hidden) {
          pasteField.input.focus()
          keepInView(pasteField.input)
        }
      },
    })
    pasteToggle.setAttribute('aria-expanded', 'false')

    const preview = h('div', { class: 'pp-preview', 'aria-live': 'polite' })

    function check(text: string): void {
      error.clear()
      clear(preview)
      const r = parseImport(text, now())
      if (!r.ok) {
        error.show(r.error)
        return
      }
      showPreview(r.data, r.summary, exportedAt(text))
    }

    function showPreview(data: SaveData, summary: ImportSummary, at: string | undefined): void {
      const today = now()
      const card = h(
        'div',
        { class: 'pp-summary' },
        h(
          'div',
          { class: 'pp-summary__col pp-summary__col--new' },
          h('h3', { class: 'pp-summary__title' }, icon('upload', 24), i.inBackup),
          at ? h('p', { class: 'pp-summary__date' }, i.savedOn(shortDate(at, today))) : null,
          summaryList(summary),
        ),
        h(
          'div',
          { class: 'pp-summary__col' },
          h('h3', { class: 'pp-summary__title' }, icon('tent', 24), i.onDevice),
          summaryList(summarize(save())),
        ),
      )
      preview.append(
        card,
        para(i.pinNote, 'pp__text--faint'),
        h(
          'div',
          { class: 'pp-actions pp-actions--end' },
          button(i.cancel, { variant: 'secondary', onClick: () => clear(preview) }),
          button(i.restore, { icon: 'check', onClick: () => void restore(data) }),
        ),
      )
      keepInView(card)
    }

    async function restore(data: SaveData): Promise<void> {
      const ok = await confirm({
        title: i.confirmTitle,
        body: [h('p', null, i.confirmBody), h('p', null, i.pinNote)],
        yes: i.confirmYes,
        no: i.cancel,
        art: 'upload',
      })
      if (!ok) return
      applyImport(store(), data)
      toast(i.done, { icon: 'check', tone: 'leaf' })
      // A backup made before the first run finished carries on from there; otherwise show it here.
      if (!store().data.setup.complete) ctx.navigate('/setup', { replace: true })
      else render()
    }

    host.append(
      h('div', { class: 'pp-actions pp-actions--wrap' }, choose, pasteToggle),
      fileInput,
      pasteBox,
      error,
      preview,
    )
    return panel({ title: i.title, icon: 'upload', tone: 'sky', lead: i.text, class: 'pp-restore' }, host)
  }

  // ---- Storage ------------------------------------------------------------------------------
  function storagePanel(): HTMLElement {
    const s = c.storage
    const body = h('div', { class: 'pp-storage' })
    const supported = typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.persist === 'function'
    let asking = false

    const ask = async () => {
      if (asking) return
      asking = true
      const granted = await requestPersistence()
      asking = false
      update((d) => {
        d.flags.persistGranted = granted
      })
      toast(granted ? s.askYes : s.askNo, { icon: granted ? 'check' : 'info', tone: granted ? 'leaf' : 'sun' })
    }

    const line = (tone: string, name: IconName, text: string, action?: HTMLElement | null) =>
      h('div', { class: 'pp-status', dataset: { tone } }, h('span', { class: 'pp-status__icon', 'aria-hidden': 'true' }, icon(name, 26)), h('div', { class: 'pp-status__text' }, h('p', null, text), action ?? null))

    const paint = () => {
      clear(body)
      const d = save()
      const granted = d.flags.persistGranted
      if (!supported) body.append(line('paper', 'info', s.persistUnsupported))
      else if (granted === true) body.append(line('leaf', 'check', s.persistYes))
      else
        body.append(
          line(
            'sun',
            'info',
            granted === false ? s.persistNo : s.persistAsk,
            button(granted === false ? s.ask : s.askNow, { variant: 'secondary', onClick: () => void ask() }),
          ),
        )
      body.append(line(isStandalone() ? 'leaf' : 'sky', isStandalone() ? 'check' : 'info', isStandalone() ? s.homeYes : s.homeNo))
      const err = store().lastWriteError
      if (err)
        body.append(
          line(
            'coral',
            'info',
            s.writeError(err),
            button(s.retry, {
              variant: 'secondary',
              icon: 'undo',
              onClick: () => {
                store().flush()
                const still = store().lastWriteError
                toast(still ? s.retryFail : s.retryOk, { icon: still ? 'info' : 'check', tone: still ? 'sun' : 'leaf' })
                paint()
              },
            }),
          ),
        )
      const info = store().loadInfo
      if (info.message && info.kind !== 'fresh' && info.kind !== 'loaded') body.append(line(info.kind === 'migrated' ? 'sky' : 'sun', 'info', info.message))
    }
    paint()
    cleanups.push(store().subscribe(paint))

    // The browser may have granted it since (e.g. after Add to Home Screen): check quietly.
    if (supported && typeof navigator.storage.persisted === 'function' && save().flags.persistGranted !== true) {
      navigator.storage.persisted().then(
        (p) => {
          if (p && body.isConnected)
            update((d) => {
              d.flags.persistGranted = true
            })
        },
        () => undefined,
      )
    }

    return panel({ title: s.title, icon: 'settings', tone: 'paper', class: 'pp-storage-panel' }, body)
  }

  // ---- Update ready -------------------------------------------------------------------------
  function updatePanel(): HTMLElement {
    const u = c.update
    const restart = button(u.restart, {
      icon: 'undo',
      onClick: () => {
        if (applyUpdateIfSafe()) {
          setDisabled(restart, true)
          const label = restart.querySelector('.btn__label')
          if (label) label.textContent = u.restarting
        } else el.hidden = !updateReady()
      },
    })
    const el = panel({ title: u.title, icon: 'download', tone: 'sun', lead: u.text, class: 'pp-update' }, h('div', { class: 'pp-actions' }, restart))
    el.hidden = !updateReady()
    cleanups.push(
      onUpdateReady(() => {
        el.hidden = false
      }),
    )
    return el
  }

  // ---- Start over ---------------------------------------------------------------------------
  function resetPanel(): HTMLElement {
    const r = c.reset
    const start = () => {
      let saved = false
      const exportFirst = button(r.exportFirst, {
        icon: 'download',
        size: 'big',
        onClick: async () => {
          if (!(await saveBackupAnyWay())) return
          saved = true
          const label = exportFirst.querySelector('.btn__label')
          if (label) label.textContent = r.exported
          exportFirst.classList.add('is-done')
        },
      })
      modal({
        title: r.ask1Title,
        body: h('p', null, r.ask1Body),
        art: 'info',
        dismissible: true,
        tone: 'coral',
        actions: [
          exportFirst,
          { label: r.cancel, variant: 'secondary' },
          {
            label: r.next,
            variant: 'danger',
            onClick: () => {
              setTimeout(() => void lastCheck(saved), 280)
            },
          },
        ],
      })
    }
    const lastCheck = async (saved: boolean) => {
      const ok = await confirm({
        title: r.ask2Title,
        body: h('p', null, saved ? r.ask2BodySaved : r.ask2Body),
        yes: r.yes,
        no: r.back,
        danger: true,
      })
      if (!ok) return
      store().reset(now())
      ctx.navigate('/setup', { replace: true })
    }
    return panel(
      { title: r.title, icon: 'undo', tone: 'coral', lead: r.text, class: 'pp-reset' },
      h('div', { class: 'pp-actions' }, button(r.button, { variant: 'danger', icon: 'undo', onClick: start })),
    )
  }

  render()
  return cleanup
}
