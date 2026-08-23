import type { RwmAction, RwmNode, RwmPatchOp, RwmSnapshot } from '@/types/rwm'

const ELEMENT_TAGS = new Set([
  'html', 'body', 'main', 'section', 'article', 'nav', 'header', 'footer', 'aside', 'div', 'span',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'button', 'input', 'textarea', 'select',
  'option', 'label', 'img', 'picture', 'video', 'canvas', 'details', 'summary', 'progress',
  'meter', 'pre', 'code', 'strong', 'em', 'small', 'sub', 'sup', 'blockquote', 'br', 'hr', 'form',
])
const ATTRIBUTES = new Set([
  'alt', 'aria-checked', 'aria-current', 'aria-disabled', 'aria-expanded', 'aria-label',
  'aria-pressed', 'aria-selected', 'checked', 'colspan', 'disabled', 'max', 'maxlength', 'min',
  'minlength', 'multiple', 'name', 'placeholder', 'readonly', 'required', 'role', 'rowspan',
  'selected', 'size', 'step', 'title', 'type', 'dir', 'lang', 'autocomplete', 'inputmode', 'rows', 'cols', 'wrap',
  'contenteditable',
])
const STYLE_PROPERTIES = new Set([
  'align-items', 'background-color', 'border-bottom-color', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-bottom-style', 'border-bottom-width', 'border-left-color',
  'border-left-style', 'border-left-width', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-top-color', 'border-top-left-radius', 'border-top-right-radius',
  'border-top-style', 'border-top-width', 'box-shadow', 'color', 'display', 'flex-direction',
  'flex-grow', 'flex-shrink', 'font-family', 'font-size', 'font-style', 'font-weight', 'gap',
  'height', 'justify-content', 'letter-spacing', 'line-height', 'margin-bottom', 'margin-left',
  'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'opacity',
  'overflow', 'overflow-x', 'overflow-y', 'padding-bottom', 'padding-left', 'padding-right',
  'padding-top', 'position', 'text-align', 'text-decoration', 'text-overflow', 'text-transform',
  'transform', 'transform-origin', 'vertical-align', 'visibility', 'white-space', 'width', 'word-break',
  'z-index', 'box-sizing', 'border-radius', 'flex-wrap', 'align-content', 'grid-template-columns',
  'grid-template-rows', 'cursor', 'list-style-type',
  'top', 'right', 'bottom', 'left', 'flex-basis', 'order', 'grid-column-start', 'grid-column-end',
  'grid-row-start', 'grid-row-end', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
  'justify-self', 'align-self',
])

type ActionSink = (action: Omit<RwmAction, 'kind' | 'requestId' | 'pageId' | 'epoch' | 'clientSeq'>) => void
type ResourceResolver = (hash: string) => string

const validStyleValue = (value: string) => value.length <= 2048
  && !/url\s*\(|expression\s*\(|javascript:|data\s*:\s*text\/html/i.test(value)
const validAttribute = (name: string, element?: Element) => ATTRIBUTES.has(name.toLowerCase())
  || /^aria-[a-z0-9-]+$/.test(name.toLowerCase())
  || (name.toLowerCase() === 'value' && element?.tagName === 'OPTION')
const safeAttributeValue = (name: string, value: string, element?: Element) => validAttribute(name, element)
  && value.length <= 4096
  && !/javascript:|data\s*:\s*text\/html/i.test(value)
const normalizeStyles = (styles: RwmSnapshot['styles']) => new Map(styles.map((style, index): [number, Record<string, string>] => {
  const structured = style as { id?: unknown; properties?: unknown }
  return typeof structured.id === 'number' && structured.properties && typeof structured.properties === 'object'
    ? [structured.id, structured.properties as Record<string, string>]
    : [index, style as Record<string, string>]
}))
const isEditableElement = (element: HTMLElement | null) => element?.isContentEditable === true
  || element?.getAttribute('contenteditable') === 'true' || element?.getAttribute('contenteditable') === ''

export class RwmDomRenderer {
  private nodes = new Map<number, Node>()
  private nodeSpecs = new Map<number, RwmNode>()
  private styles = new Map<number, Record<string, string>>()
  private resourceBindings = new Map<string, string>()
  private childSpecs = new Map<number, RwmNode[]>()

  constructor(
    private readonly document: Document,
    private readonly actionSink: ActionSink,
    private readonly resourceResolver: ResourceResolver,
  ) {
    this.attachEvents()
  }

  load(snapshot: RwmSnapshot) {
    this.nodes.clear()
    this.nodeSpecs.clear()
    this.childSpecs.clear()
    this.styles = normalizeStyles(snapshot.styles)
    this.resourceBindings.clear()
    for (const node of snapshot.nodes) {
      if (this.nodeSpecs.has(node.id)) throw new Error('duplicate_node')
      this.nodeSpecs.set(node.id, node)
      if (node.parent != null) {
        const siblings = this.childSpecs.get(node.parent) || []
        siblings.push(node)
        this.childSpecs.set(node.parent, siblings)
      }
    }
    const root = this.build(snapshot.rootId, new Set())
    this.document.body.replaceChildren(root)
    for (const node of snapshot.nodes) {
      this.applyInitialState(node)
      this.applyInitialScroll(node)
    }
    if (snapshot.scroll) this.document.defaultView?.scrollTo(snapshot.scroll.x ?? snapshot.scroll.left ?? 0, snapshot.scroll.y ?? snapshot.scroll.top ?? 0)
    if (snapshot.focusId != null) (this.nodes.get(snapshot.focusId) as HTMLElement | undefined)?.focus()
    for (const resource of snapshot.resources || []) this.registerResourceBindings(resource.hash, resource.bindings)
  }

  apply(ops: RwmPatchOp[]) {
    for (const op of ops) this.applyOne(op)
  }

  refreshResource(hash: string) {
    const url = this.resourceResolver(hash)
    if (!url) return
    for (const [key, boundHash] of this.resourceBindings) {
      if (boundHash !== hash) continue
      const [idRaw, attribute] = key.split(':')
      const element = this.nodes.get(Number(idRaw))
      if (element?.nodeType === 1 && (attribute === 'src' || attribute === 'poster')) (element as Element).setAttribute(attribute, url)
    }
  }

  registerResourceBindings(hash: string, bindings: Array<{ nodeId: number; slot: 'src' | 'poster' }>) {
    for (const binding of bindings) {
      if (this.nodes.has(binding.nodeId)) this.bindResource(binding.nodeId, binding.slot, hash)
    }
  }

  private build(id: number, visiting: Set<number>): Node {
    if (visiting.has(id)) throw new Error('node_cycle')
    const spec = this.nodeSpecs.get(id)
    if (!spec) throw new Error('node_missing')
    visiting.add(id)
    const node = this.create(spec)
    this.nodes.set(id, node)
    const children = (this.childSpecs.get(id) || []).sort((a, b) => a.index - b.index)
    for (const child of children) node.appendChild(this.build(child.id, visiting))
    visiting.delete(id)
    return node
  }

  private create(spec: RwmNode) {
    if (spec.kind === 'text') return this.document.createTextNode(String(spec.text || '').slice(0, 65_536))
    const tag = String(spec.tag || 'div').toLowerCase()
    if (!ELEMENT_TAGS.has(tag)) throw new Error('tag_denied')
    const element = this.createSafeElement(tag)
    element.dataset.rwmNodeId = String(spec.id)
    this.applyAttributes(element, spec.attrs || {})
    this.applyStyle(element, spec.styleId)
    this.applyState(element, spec.state || {})
    return element
  }

  private createSafeElement(tag: string) {
    const safeTag = tag === 'html' || tag === 'body' || tag === 'video' || tag === 'canvas' ? 'div' : tag
    const element = this.document.createElement(safeTag)
    if (tag === 'video' || tag === 'canvas') element.dataset.rwmPixelFallback = tag
    return element
  }

  private applyAttributes(element: HTMLElement, attrs: Record<string, string>) {
    for (const [name, value] of Object.entries(attrs)) {
      if (safeAttributeValue(name, value, element)) element.setAttribute(name, value)
    }
    this.hardenPassword(element)
  }

  private applyInitialScroll(spec: RwmNode) {
    if (!spec.scroll) return
    const node = this.nodes.get(spec.id)
    if (node?.nodeType !== 1) return
    ;(node as Element).scrollTo(spec.scroll.left, spec.scroll.top)
  }

  private applyInitialState(spec: RwmNode) {
    if (!spec.state) return
    const node = this.nodes.get(spec.id)
    if (node?.nodeType === 1) this.applyState(node as HTMLElement, spec.state)
  }

  private applyStyle(element: HTMLElement, styleId?: number) {
    element.removeAttribute('style')
    if (styleId == null) return
    const style = this.styles.get(styleId)
    if (!style) throw new Error('style_missing')
    for (const [name, value] of Object.entries(style)) {
      if (STYLE_PROPERTIES.has(name) && validStyleValue(value)) element.style.setProperty(name, value)
    }
  }

  private applyState(element: HTMLElement, state: Record<string, unknown>) {
    if (element.tagName === 'INPUT') return this.applyInputState(element as HTMLInputElement, state)
    if (element.tagName === 'TEXTAREA') return this.applyTextareaState(element as HTMLTextAreaElement, state)
    if (element.tagName === 'SELECT') return this.applySelectState(element as HTMLSelectElement, state)
    if (element.tagName === 'OPTION') this.applyOptionState(element as HTMLOptionElement, state)
  }

  private applyInputState(input: HTMLInputElement, state: Record<string, unknown>) {
    if (input.type !== 'password') input.value = String(state.value || '').slice(0, 65_536)
    input.checked = state.checked === true
    input.disabled = state.disabled === true
    this.hardenPassword(input)
  }

  private applyTextareaState(textarea: HTMLTextAreaElement, state: Record<string, unknown>) {
    textarea.value = String(state.value || '').slice(0, 65_536)
    textarea.disabled = state.disabled === true
  }

  private applySelectState(select: HTMLSelectElement, state: Record<string, unknown>) {
    if (typeof state.value === 'string') select.value = state.value
    select.disabled = state.disabled === true
  }

  private applyOptionState(option: HTMLOptionElement, state: Record<string, unknown>) {
    if (typeof state.value === 'string') option.value = state.value.slice(0, 2048)
    option.selected = state.selected === true
    option.disabled = state.disabled === true
  }

  private requireNode(id: number) {
    const node = this.nodes.get(id)
    if (!node) throw new Error('patch_node_missing')
    return node
  }

  private applyOne(op: RwmPatchOp) {
    if (op.op === 'node.add') return this.addNodes(op.nodes || (op.node ? [op.node] : []))
    if (op.op === 'node.remove') return this.removeNode(op.id)
    if (op.op === 'node.move') return this.moveNode(op.id, op.parent, op.index)
    if (op.op === 'text.set') return this.setText(op.id, op.text)
    this.applyElementOperation(op)
  }

  private applyElementOperation(op: RwmPatchOp) {
    if (op.op === 'style.set') return this.applyElementStyle(op.id, op.styleId)
    if (op.op === 'style.define') return this.defineStyle(op.styleId, op.style)
    if (op.op === 'state.set') return this.applyElementState(op.id, op.state)
    if (op.op === 'attr.set') return this.setAttribute(op.id, op.name, op.value)
    if (op.op === 'attr.remove') return this.removeAttribute(op.id, op.name)
    if (op.op === 'scroll.set') return this.setScroll(op)
    if (op.op === 'focus.set') return (op.id == null ? null : this.requireNode(op.id) as HTMLElement)?.focus()
    if (op.op === 'resource.bind') return this.bindResource(op.id, op.attribute, op.hash)
    if (op.op === 'box.set') return
    throw new Error('patch_op_denied')
  }

  private addNodes(specs: RwmNode[]) {
    if (!specs.length) throw new Error('patch_add')
    for (const spec of specs) {
      if (this.nodes.has(spec.id) || spec.parent == null) throw new Error('patch_add')
      const parent = this.requireNode(spec.parent)
      const node = this.create(spec)
      parent.insertBefore(node, parent.childNodes[Math.max(0, spec.index)] || null)
      this.nodes.set(spec.id, node)
      this.nodeSpecs.set(spec.id, spec)
    }
  }

  private removeNode(id: number) {
    const node = this.requireNode(id)
    this.purgeTrackedTree(node)
    node.parentNode?.removeChild(node)
  }

  private purgeTrackedTree(node: Node) {
    for (const child of Array.from(node.childNodes)) this.purgeTrackedTree(child)
    for (const [trackedId, trackedNode] of this.nodes) {
      if (trackedNode !== node) continue
      this.nodes.delete(trackedId)
      this.nodeSpecs.delete(trackedId)
      for (const key of [...this.resourceBindings.keys()]) {
        if (key.startsWith(`${trackedId}:`)) this.resourceBindings.delete(key)
      }
      break
    }
  }

  private moveNode(id: number, parentId: number, index: number) {
    const node = this.requireNode(id)
    const parent = this.requireNode(parentId)
    parent.insertBefore(node, parent.childNodes[Math.max(0, index)] || null)
  }

  private setText(id: number, text: string) {
    const node = this.requireNode(id)
    if (node.nodeType !== 3) throw new Error('patch_text_target')
    ;(node as Text).data = text.slice(0, 65_536)
  }

  private setAttribute(id: number, name: string, value: string) {
    const element = this.requireNode(id)
    if (element.nodeType !== 1 || !safeAttributeValue(name, value, element as Element)) throw new Error('patch_attr')
    if ((element as Element).tagName === 'INPUT' && (element as HTMLInputElement).type === 'password') {
      if (name.toLowerCase() === 'name') return
      if (name.toLowerCase() === 'autocomplete') value = 'new-password'
    }
    ;(element as Element).setAttribute(name, value)
    this.hardenPassword(element as HTMLElement)
  }

  private removeAttribute(id: number, name: string) {
    const element = this.requireNode(id)
    if (element.nodeType !== 1 || !validAttribute(name, element as Element)) throw new Error('patch_attr_remove')
    if ((element as Element).tagName === 'INPUT' && (element as HTMLInputElement).type === 'password'
      && name.toLowerCase() === 'autocomplete') return
    ;(element as Element).removeAttribute(name)
  }

  private applyElementStyle(id: number, styleId: number) {
    const element = this.requireNode(id)
    if (element.nodeType !== 1) throw new Error('patch_style_target')
    this.applyStyle(element as HTMLElement, styleId)
  }

  private defineStyle(styleId: number, style: Record<string, string>) {
    const safe: Record<string, string> = {}
    for (const [name, value] of Object.entries(style)) {
      if (STYLE_PROPERTIES.has(name) && validStyleValue(value)) safe[name] = value
    }
    this.styles.set(styleId, safe)
  }

  private applyElementState(id: number, state: Record<string, unknown>) {
    const element = this.requireNode(id)
    if (element.nodeType !== 1) throw new Error('patch_state_target')
    this.applyState(element as HTMLElement, state)
  }

  private setScroll(op: Extract<RwmPatchOp, { op: 'scroll.set' }>) {
    const x = op.x ?? op.left ?? 0
    const y = op.y ?? op.top ?? 0
    if (op.id == null) this.document.defaultView?.scrollTo(x, y)
    else {
      const node = this.requireNode(op.id)
      if (node.nodeType !== 1) throw new Error('patch_scroll_target')
      ;(node as Element).scrollTo(x, y)
    }
  }

  private bindResource(id: number, attribute: 'src' | 'poster', hash: string) {
    const node = this.requireNode(id)
    if (node.nodeType !== 1 || (attribute !== 'src' && attribute !== 'poster')) throw new Error('resource_binding')
    this.resourceBindings.set(`${id}:${attribute}`, hash)
    const url = this.resourceResolver(hash)
    if (url) (node as Element).setAttribute(attribute, url)
  }

  private attachEvents() {
    this.document.addEventListener('click', event => {
      this.sendEvent(event, 'click')
      this.clearSubmitPasswords(event.target)
    }, true)
    this.document.addEventListener('dblclick', event => this.sendEvent(event, 'doubleClick'), true)
    this.document.addEventListener('contextmenu', event => this.sendEvent(event, 'contextMenu'), true)
    this.document.addEventListener('input', event => this.handleInputEvent(event), true)
    this.document.addEventListener('keydown', event => this.handleKeydown(event as KeyboardEvent), true)
    this.document.addEventListener('keyup', event => this.handleKeyup(event as KeyboardEvent), true)
    this.document.addEventListener('blur', event => this.clearPassword(event.target), true)
    this.document.addEventListener('submit', event => this.clearFormPasswords(event.target), true)
    this.document.addEventListener('wheel', event => this.handleWheel(event as WheelEvent), { capture: true, passive: false })
  }

  private sendEvent(event: Event, action: RwmAction['action'], args: Record<string, unknown> = {}) {
    const eventTarget = event.target as Element | null
    const target = eventTarget?.nodeType === 1 ? eventTarget.closest<HTMLElement>('[data-rwm-node-id]') : null
    if (!target) return
    event.preventDefault()
    this.actionSink({ target: { nodeId: Number(target.dataset.rwmNodeId) }, action, args })
  }

  private handleInputEvent(event: Event) {
    const input = event.target as HTMLElement | null
    if (!input) return
    if (input.tagName === 'SELECT') return this.sendEvent(event, 'select', { value: (input as HTMLSelectElement).value })
    if (input.tagName === 'INPUT' && ['checkbox', 'radio'].includes((input as HTMLInputElement).type)) return this.sendEvent(event, 'click')
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      return this.sendEvent(event, 'type', { text: (input as HTMLInputElement | HTMLTextAreaElement).value })
    }
    if (isEditableElement(input)) this.sendEvent(event, 'type', { text: input.textContent || '' })
  }

  private handleKeydown(key: KeyboardEvent) {
    if (!this.shouldSendKey(key)) return
    this.sendEvent(key, 'key', { key: key.key, ctrl: key.ctrlKey, alt: key.altKey, shift: key.shiftKey, meta: key.metaKey })
    if (key.key === 'Enter') this.clearPassword(key.target)
  }

  private handleKeyup(key: KeyboardEvent) {
    if (key.key !== 'Tab') return
    const active = this.document.activeElement as HTMLElement | null
    const target = active?.closest<HTMLElement>('[data-rwm-node-id]')
      || (key.target as HTMLElement | null)?.closest<HTMLElement>('[data-rwm-node-id]')
    if (target) this.actionSink({ target: { nodeId: Number(target.dataset.rwmNodeId) }, action: 'focus', args: {} })
  }

  private handleWheel(wheel: WheelEvent) {
    this.sendEvent(wheel, 'scroll', { dx: wheel.deltaX, dy: wheel.deltaY })
  }

  private clearFormPasswords(target: EventTarget | null) {
    const form = target as HTMLFormElement | null
    for (const input of form?.querySelectorAll<HTMLInputElement>('input[type="password"]') || []) input.value = ''
  }

  private shouldSendKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    const editable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      || target?.tagName === 'SELECT' || isEditableElement(target)
    const enterControl = event.key === 'Enter' && target?.tagName !== 'TEXTAREA' && !isEditableElement(target)
    return event.key !== 'Tab' && (!editable || enterControl || event.key === 'Escape' || /^F\d{1,2}$/.test(event.key))
  }

  private clearPassword(target: EventTarget | null) {
    const input = target as HTMLInputElement | null
    if (input?.tagName === 'INPUT' && input.type === 'password') input.value = ''
  }

  private hardenPassword(element: HTMLElement) {
    if (element.tagName !== 'INPUT') return
    if ((element as HTMLInputElement).type === 'file') {
      ;(element as HTMLInputElement).disabled = true
      return
    }
    if ((element as HTMLInputElement).type !== 'password') return
    element.removeAttribute('name')
    element.setAttribute('autocomplete', 'new-password')
  }

  private clearSubmitPasswords(target: EventTarget | null) {
    const element = target as HTMLElement | null
    if (!element || !['BUTTON', 'INPUT'].includes(element.tagName)) return
    const type = (element as HTMLButtonElement | HTMLInputElement).type
    if (type !== 'submit') return
    for (const input of element.closest('form')?.querySelectorAll<HTMLInputElement>('input[type="password"]') || []) input.value = ''
  }
}
