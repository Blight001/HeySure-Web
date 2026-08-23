// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { RwmSnapshot } from '@/types/rwm'
import { RwmDomRenderer } from '../rwmDomRenderer'
import { hasAllowedResourceSignature, RwmResourceLru, RwmTransferAssembler } from '../rwmTransfers'
import { validateRwmSnapshot } from '../rwmValidation'

const snapshot = (attrs: Record<string, string> = {}): RwmSnapshot => ({
  rootId: 1,
  nodes: [
    { id: 1, parent: null, index: 0, kind: 'element', tag: 'html', styleId: 0 },
    { id: 2, parent: 1, index: 0, kind: 'element', tag: 'body', styleId: 0 },
    { id: 3, parent: 2, index: 0, kind: 'element', tag: 'img', attrs, styleId: 0 },
    { id: 4, parent: 2, index: 1, kind: 'text', text: 'safe' },
  ],
  styles: [{ color: 'red', background: 'url(https://evil.invalid/x)' }],
})

describe('RWM safe renderer', () => {
  it('never installs event handlers, source URLs or unsafe style values', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const renderer = new RwmDomRenderer(doc, vi.fn(), () => '')
    renderer.load(snapshot({ onclick: 'alert(1)', src: 'https://evil.invalid/x', title: 'ok' }))
    const image = doc.querySelector('img')!
    expect(image.getAttribute('onclick')).toBeNull()
    expect(image.getAttribute('src')).toBeNull()
    expect(image.getAttribute('title')).toBe('ok')
    expect((doc.body.firstElementChild as HTMLElement).style.background).toBe('')
  })

  it('purges descendants and refuses unsafe remove attributes and text style targets', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const renderer = new RwmDomRenderer(doc, vi.fn(), () => '')
    renderer.load(snapshot())
    renderer.apply([{ op: 'node.remove', id: 2 }])
    expect(() => renderer.apply([{ op: 'text.set', id: 4, text: 'stale' }])).toThrow('patch_node_missing')
    renderer.load(snapshot())
    expect(() => renderer.apply([{ op: 'attr.remove', id: 3, name: 'srcdoc' }])).toThrow('patch_attr_remove')
    expect(() => renderer.apply([{ op: 'style.set', id: 4, styleId: 0 }])).toThrow('patch_style_target')
  })

  it('validates the whole tree and resource magic bytes', () => {
    expect(() => validateRwmSnapshot({ ...snapshot(), nodes: [{ id: 1, parent: 2, index: 0, kind: 'element', tag: 'div' }] })).toThrow()
    expect(hasAllowedResourceSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), 'image/png')).toBe(true)
    expect(hasAllowedResourceSignature(new TextEncoder().encode('<script>'), 'image/png')).toBe(false)
  })

  it('rejects decoded images beyond the pixel policy before creating a blob URL', async () => {
    const lru = new RwmResourceLru(1024, async () => false)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])
    await expect(lru.add('a'.repeat(64), png, 'image/png')).rejects.toThrow('resource_dimensions')
  })

  it('detaches a transfer before async hashing so a reset may safely reuse its id', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise(resolve => { resolveDigest = resolve }) as Promise<ArrayBuffer>)
    const assembler = new RwmTransferAssembler()
    const begin = { transferId: 'same', total: 1, bytes: 1, hash: '', kind: 'resource' as const, mime: 'font/woff' }
    assembler.begin(begin)
    assembler.add({ sessionId: 's', transferId: 'same', kind: 'resource', index: 0, total: 1, bytes: new Uint8Array([1]) })
    const oldTake = assembler.take('same')
    assembler.begin(begin)
    assembler.add({ sessionId: 's', transferId: 'same', kind: 'resource', index: 0, total: 1, bytes: new Uint8Array([2]) })
    resolveDigest(new Uint8Array(32).buffer)
    await oldTake
    digest.mockResolvedValue(new Uint8Array(32).buffer)
    await expect(assembler.take('same')).resolves.toMatchObject({ bytes: new Uint8Array([2]) })
  })

  it('does not commit a resource whose image inspection crosses a reset boundary', async () => {
    let resolveInspection!: (safe: boolean) => void
    let current = true
    const lru = new RwmResourceLru(1024, () => new Promise(resolve => { resolveInspection = resolve }))
    const bytes = new TextEncoder().encode('GIF89a')
    const adding = lru.add('a'.repeat(64), bytes, 'image/gif', () => current)
    current = false
    resolveInspection(true)
    await expect(adding).resolves.toBe('')
    expect(lru.get('a'.repeat(64))).toBe('')
  })
})

describe('RWM safe form interaction', () => {
  it('keeps password snapshots blank while sending locally typed text through the action sink', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const action = vi.fn()
    const renderer = new RwmDomRenderer(doc, action, () => '')
    const password = snapshot()
    password.nodes[2] = { id: 3, parent: 2, index: 0, kind: 'element', tag: 'input', attrs: { type: 'password' }, state: { value: 'device-secret' } }
    renderer.load(password)
    const input = doc.querySelector('input')!
    expect(input.value).toBe('')
    expect(input.name).toBe('')
    expect(input.autocomplete).toBe('new-password')
    input.value = 'operator'
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    input.value = 'operator-secret'
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ action: 'type', args: { text: 'operator-secret' } }))
    expect(input.value).toBe('operator-secret')
    input.dispatchEvent(new Event('blur', { bubbles: false }))
    expect(input.value).toBe('')
    input.value = 'again'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'key', args: expect.objectContaining({ key: 'Enter' }) }))
    expect(input.value).toBe('')
  })

  it('allows local editable keys, sends full input values, and applies option state', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const action = vi.fn()
    const renderer = new RwmDomRenderer(doc, action, () => '')
    const form = snapshot()
    form.nodes.splice(2, 2,
      { id: 3, parent: 2, index: 0, kind: 'element', tag: 'input', attrs: { type: 'text' }, state: { value: '' } },
      { id: 4, parent: 2, index: 1, kind: 'element', tag: 'select', state: { value: 'b' } },
      { id: 5, parent: 4, index: 0, kind: 'element', tag: 'option', attrs: { value: 'b' }, state: { selected: true, disabled: true } },
    )
    renderer.load(form)
    const input = doc.querySelector('input')!
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    input.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(false)
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'type', args: { text: 'abc' } }))
    const option = doc.querySelector('option')!
    expect(option.value).toBe('b')
    expect(option.selected).toBe(true)
    expect(option.disabled).toBe(true)
    renderer.apply([{ op: 'state.set', id: 5, state: { selected: false, disabled: false } }])
    expect(option.disabled).toBe(false)
  })

  it('mirrors contenteditable input and turns local Tab focus into a semantic focus action', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const action = vi.fn()
    const renderer = new RwmDomRenderer(doc, action, () => '')
    const form = snapshot()
    form.nodes.splice(2, 2,
      { id: 3, parent: 2, index: 0, kind: 'element', tag: 'div', attrs: { contenteditable: 'true' }, styleId: 0 },
      { id: 4, parent: 3, index: 0, kind: 'text', text: '' },
      { id: 5, parent: 2, index: 1, kind: 'element', tag: 'button', styleId: 0 },
    )
    renderer.load(form)
    const editable = doc.querySelector<HTMLElement>('[contenteditable]')!
    editable.textContent = '完整文本'
    editable.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'type', args: { text: '完整文本' } }))

    const button = doc.querySelector('button')!
    button.focus()
    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', bubbles: true }))
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'focus', target: { nodeId: 5 } }))
  })

  it('rejects unknown snapshot and node fields at the trust boundary', () => {
    expect(() => validateRwmSnapshot({ ...snapshot(), html: '<script />' })).toThrow('snapshot_shape')
    const unknownNode = snapshot() as any
    unknownNode.nodes[0].onclick = 'evil'
    expect(() => validateRwmSnapshot(unknownNode)).toThrow('snapshot_nodes')
  })

  it('purges resource bindings with removed subtrees', () => {
    const doc = document.implementation.createHTMLDocument('mirror')
    const renderer = new RwmDomRenderer(doc, vi.fn(), () => '')
    const bound = snapshot()
    bound.resources = [{ hash: 'a'.repeat(64), mime: 'image/png', size: 8, bindings: [{ nodeId: 3, slot: 'src' }] }]
    renderer.load(bound)
    expect((renderer as any).resourceBindings.size).toBe(1)
    renderer.apply([{ op: 'node.remove', id: 3 }])
    expect((renderer as any).resourceBindings.size).toBe(0)
    expect(() => renderer.registerResourceBindings('b'.repeat(64), [{ nodeId: 3, slot: 'src' }])).not.toThrow()
    expect((renderer as any).resourceBindings.size).toBe(0)
  })
})
