import Debug from 'debug'
import { Range } from 'slate'
import Hotkeys from 'slate-hotkeys'
import getWindow from 'get-window'
import {
  IS_FIREFOX,
  IS_IE,
  IS_IOS,
  HAS_INPUT_EVENTS_LEVEL_2,
} from 'slate-dev-environment'

import DATA_ATTRS from '../../constants/data-attributes'
import SELECTORS from '../../constants/selectors'

/**
 * Debug.
 *
 * @type {Function}
 */

const debug = Debug('slate:before')

/**
 * A plugin that adds the "before" browser-specific logic to the editor.
 *
 * @return {Object}
 */

function BeforePlugin() {
  let activeElement = null
  let compositionCount = 0
  let isComposing = false
  let isCopying = false
  let isDragging = false
  let isUserActionPerformed = false

  /**
   * On before input.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onBeforeInput(event, editor, next) {
    console.log(`!! onBeforeInput with data:${event.data} inputType:${event.inputType} has2:${HAS_INPUT_EVENTS_LEVEL_2} isSynthetic:${!!event.nativeEvent}`)
    if (isComposing) return

    const isSynthetic = !!event.nativeEvent
    if (editor.readOnly) return
    isUserActionPerformed = true

    // COMPAT: If the browser supports Input Events Level 2, we will have
    // attached a custom handler for the real `beforeinput` events, instead of
    // allowing React's synthetic polyfill, so we need to ignore synthetics.
    if (isSynthetic && HAS_INPUT_EVENTS_LEVEL_2) return

    debug('onBeforeInput', { event })

    next()
  }

  /**
   * On blur.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onBlur(event, editor, next) {
    if (isCopying) return
    if (editor.readOnly) return

    const { relatedTarget, target } = event
    const window = getWindow(target)

    // COMPAT: If the current `activeElement` is still the previous one, this is
    // due to the window being blurred when the tab itself becomes unfocused, so
    // we want to abort early to allow to editor to stay focused when the tab
    // becomes focused again.
    if (activeElement === window.document.activeElement) return

    // COMPAT: The `relatedTarget` can be null when the new focus target is not
    // a "focusable" element (eg. a `<div>` without `tabindex` set).
    if (relatedTarget) {
      const el = editor.findDOMNode([])

      // COMPAT: The event should be ignored if the focus is returning to the
      // editor from an embedded editable element (eg. an <input> element inside
      // a void node).
      if (relatedTarget === el) return

      // COMPAT: The event should be ignored if the focus is moving from the
      // editor to inside a void node's spacer element.
      if (relatedTarget.hasAttribute(DATA_ATTRS.SPACER)) return

      // COMPAT: The event should be ignored if the focus is moving to a non-
      // editable section of an element that isn't a void node (eg. a list item
      // of the check list example).
      const node = editor.findNode(relatedTarget)

      if (el.contains(relatedTarget) && node && !editor.isVoid(node)) {
        return
      }
    }

    debug('onBlur', { event })
    next()
  }

  /**
   * On composition end.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onCompositionEnd(event, editor, next) {
    console.log('!! onCompositionEnd hasOp:' + !!editor.controller.tmp.nextNativeOperation);
    const n = compositionCount
    isUserActionPerformed = true

    flushQueuedNativeOperations(editor)

    // The `count` check here ensures that if another composition starts
    // before the timeout has closed out this one, we will abort unsetting the
    // `isComposing` flag, since a composition is still in affect.
    window.requestAnimationFrame(() => {
      if (compositionCount > n) return
      isComposing = false
    })

    debug('onCompositionEnd', { event })

    next()
  }

  /**
   * On click.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onClick(event, editor, next) {
    debug('onClick', { event })
    isUserActionPerformed = true
    next()
  }

  /**
   * On composition start.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onCompositionStart(event, editor, next) {
    console.log(`!! onCompositionStart isCollapsed:${editor.value.selection.isCollapsed}`)
    isComposing = true
    compositionCount++

    const { value } = editor
    const { selection } = value
    isUserActionPerformed = true

    if (!selection.isCollapsed) {
      // https://github.com/ianstormtaylor/slate/issues/1879
      // When composition starts and the current selection is not collapsed, the
      // second composition key-down would drop the text wrapping <spans> which
      // resulted on crash in content.updateSelection after composition ends
      // (because it cannot find <span> nodes in DOM). This is a workaround that
      // erases selection as soon as composition starts and preventing <spans>
      // to be dropped.
      editor.delete()
    } else {
      if (editor.controller.tmp.nextNativeOperation) {
        throw Error('YOWIE WOWIE: already have a native op!')
      }

      editor.controller.tmp.nextNativeOperation = {
        selection: editor.value.selection,
        slateSpanNode: window
          .getSelection()
          .anchorNode.parentElement.closest(SELECTORS.KEY),
      }
    }

    debug('onCompositionStart', { event })
    next()
  }

  /**
   * On copy.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onCopy(event, editor, next) {
    const window = getWindow(event.target)
    isCopying = true
    window.requestAnimationFrame(() => (isCopying = false))

    debug('onCopy', { event })
    next()
  }

  /**
   * On cut.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onCut(event, editor, next) {
    if (editor.readOnly) return

    const window = getWindow(event.target)
    isCopying = true
    window.requestAnimationFrame(() => (isCopying = false))

    debug('onCut', { event })
    next()
  }

  /**
   * On drag end.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragEnd(event, editor, next) {
    isDragging = false

    debug('onDragEnd', { event })

    next()
  }

  /**
   * On drag enter.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragEnter(event, editor, next) {
    debug('onDragEnter', { event })

    next()
  }

  /**
   * On drag exit.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragExit(event, editor, next) {
    debug('onDragExit', { event })

    next()
  }

  /**
   * On drag leave.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragLeave(event, editor, next) {
    debug('onDragLeave', { event })

    next()
  }

  /**
   * On drag over.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragOver(event, editor, next) {
    // If the target is inside a void node, and only in this case,
    // call `preventDefault` to signal that drops are allowed.
    // When the target is editable, dropping is already allowed by
    // default, and calling `preventDefault` hides the cursor.
    const node = editor.findNode(event.target)

    if (!node || editor.isVoid(node)) {
      event.preventDefault()
    }

    // COMPAT: IE won't call onDrop on contentEditables unless the
    // default dragOver is prevented:
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/913982/
    // (2018/07/11)
    if (IS_IE) {
      event.preventDefault()
    }

    // If a drag is already in progress, don't do this again.
    if (!isDragging) {
      isDragging = true

      // COMPAT: IE will raise an `unspecified error` if dropEffect is
      // set. (2018/07/11)
      if (!IS_IE) {
        event.nativeEvent.dataTransfer.dropEffect = 'move'
      }
    }

    debug('onDragOver', { event })

    next()
  }

  /**
   * On drag start.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDragStart(event, editor, next) {
    isDragging = true

    debug('onDragStart', { event })

    next()
  }

  /**
   * On drop.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onDrop(event, editor, next) {
    if (editor.readOnly) return
    isUserActionPerformed = true

    // Prevent default so the DOM's value isn't corrupted.
    event.preventDefault()

    debug('onDrop', { event })
    next()
  }

  /**
   * On focus.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onFocus(event, editor, next) {
    if (isCopying) return
    if (editor.readOnly) return

    const el = editor.findDOMNode([])

    // Save the new `activeElement`.
    const window = getWindow(event.target)
    activeElement = window.document.activeElement

    // COMPAT: If the editor has nested editable elements, the focus can go to
    // those elements. In Firefox, this must be prevented because it results in
    // issues with keyboard navigation. (2017/03/30)
    if (IS_FIREFOX && event.target !== el) {
      el.focus()
      return
    }

    debug('onFocus', { event })
    next()
  }

  /**
   * On input.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onInput(event, editor, next) {
    console.log(`!! onInput isComposing:${isComposing} hasOp:${!!editor.controller.tmp.nextNativeOperation}`)
    if (isComposing) return

    if (flushQueuedNativeOperations(editor)) {
      return next()
    }

    if (editor.value.selection.isBlurred) return
    isUserActionPerformed = true
    debug('onInput', { event })
    next()
  }

  /**
   * On key down.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onKeyDown(event, editor, next) {
    if (editor.readOnly) return

    // When composing, we need to prevent all hotkeys from executing while
    // typing. However, certain characters also move the selection before
    // we're able to handle it, so prevent their default behavior.
    if (isComposing) {
      if (Hotkeys.isCompose(event)) event.preventDefault()
      return
    }

    // Certain hotkeys have native editing behaviors in `contenteditable`
    // elements which will editor the DOM and cause our value to be out of sync,
    // so they need to always be prevented.
    if (
      !IS_IOS &&
      (Hotkeys.isBold(event) ||
        Hotkeys.isDeleteBackward(event) ||
        Hotkeys.isDeleteForward(event) ||
        Hotkeys.isDeleteLineBackward(event) ||
        Hotkeys.isDeleteLineForward(event) ||
        Hotkeys.isDeleteWordBackward(event) ||
        Hotkeys.isDeleteWordForward(event) ||
        Hotkeys.isItalic(event) ||
        Hotkeys.isRedo(event) ||
        Hotkeys.isSplitBlock(event) ||
        Hotkeys.isTransposeCharacter(event) ||
        Hotkeys.isUndo(event))
    ) {
      event.preventDefault()
    }

    isUserActionPerformed = true

    debug('onKeyDown', { event })

    next()
  }

  /**
   * On paste.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onPaste(event, editor, next) {
    if (editor.readOnly) return
    isUserActionPerformed = true

    // Prevent defaults so the DOM state isn't corrupted.
    event.preventDefault()

    debug('onPaste', { event })
    next()
  }

  /**
   * On select.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onSelect(event, editor, next) {
    if (isComposing) return
    if (isCopying) return
    if (editor.readOnly) return

    // Save the new `activeElement`.
    const window = getWindow(event.target)
    activeElement = window.document.activeElement
    isUserActionPerformed = true

    debug('onSelect', { event })
    next()
  }

  function userActionPerformed() {
    return isUserActionPerformed
  }

  function clearUserActionPerformed() {
    isUserActionPerformed = false
    return null
  }

  function flushQueuedNativeOperations(editor) {
    console.log('!! flushQueuedNativeOperations')
    const { nextNativeOperation } = editor.controller.tmp
    if (!nextNativeOperation) return false
    editor.controller.tmp.nextNativeOperation = null

    const { selection: oldSelection, slateSpanNode } = nextNativeOperation
    const {
      anchorNode: textNode,
      anchorOffset: currentOffset,
    } = window.getSelection()

    const currentSlateSpanNode = textNode.parentElement.closest(SELECTORS.KEY);
    if (currentSlateSpanNode == null) throw Error('YOWIE WOWIE: could not find slate span')
    if (slateSpanNode !== currentSlateSpanNode) throw Error('YOWIE WOWIE: slate span node mismatch')

    const key = oldSelection.anchor.key
    const path = editor.value.document.getPath(key)
    const node = editor.value.document.getNode(key)
    const slateNodeFromDomNode = editor.findNode(slateSpanNode)
    if (slateNodeFromDomNode !== node) throw Error('YOWIE WOWIE: Slate nodes do not match up!')

    const allChildTextNodes = slateSpanNode.querySelectorAll(`${SELECTORS.STRING}, ${SELECTORS.ZERO_WIDTH}`)
    for (const childTextNode of allChildTextNodes) {
      const isStringNode = childTextNode.hasAttribute(DATA_ATTRS.STRING);
      const isZeroWidth = childTextNode.hasAttribute(DATA_ATTRS.ZERO_WIDTH);
      if (isStringNode || isZeroWidth) {
        const hasZeroWidthChars = childTextNode.textContent.indexOf('\uFEFF') >= 0;
        if ((isStringNode && hasZeroWidthChars) || (isZeroWidth && childTextNode.textContent !== '\uFEFF')) {
          for (const childNode of childTextNode.childNodes) {
            if (childNode.nodeType === 1 && childNode.tagName === 'BR') {
              childTextNode.removeChild(childNode);
            }
          }

          console.log('    REPLACING ' + childTextNode.childNodes.length)
          if (childTextNode.childNodes.length === 1) {
            childTextNode.childNodes[0].textContent = childTextNode.childNodes[0].textContent.replace(/[\uFEFF]/g, '')
            } else {
            childTextNode.textContent = childTextNode.textContent.replace(/[\uFEFF]/g, '')
          }

          childTextNode.removeAttribute(DATA_ATTRS.ZERO_WIDTH)
          childTextNode.removeAttribute(DATA_ATTRS.LENGTH)
        }
      }
    }

    console.log(`    textNode: ${textNode.textContent} ${textNode.textContent.length}`)
    console.log(`    slateSpan: ${slateSpanNode.textContent} ${slateSpanNode.textContent.length}`)
    console.log(`    slateNodeFromDomNode: ${slateNodeFromDomNode.text} ${slateNodeFromDomNode.text.length}`)
    console.log('    flush selBeforeInsert:', JSON.stringify(editor.value.selection.toJSON()))
    console.log(`    editor: len: ${editor.value.document.text.length} selSlate: ${editor.value.selection.anchor.offset} selNative: ${currentOffset} document: ${JSON.stringify(editor.value.document.toJSON())}`)

    const newTextContent = slateSpanNode.textContent.replace(/[\uFEFF]/g, '');
    editor.insertTextAtRange(
      Range.create({
        anchor: { path, key, offset: 0 },
        focus: { path, key, offset: node.text.length },
      }),
      newTextContent
    )

    console.log('    flush selAfterInsert :', JSON.stringify(editor.value.selection.toJSON()))
    console.log(`    editor: len: ${editor.value.document.text.length} selSlate: ${editor.value.selection.anchor.offset} selNative: ${currentOffset} document: ${JSON.stringify(editor.value.document.toJSON())}`)

    if (textNode.parentElement == null) throw Error('YOWIE WOWIE: text node is no longer in the dom!')
    const point = editor.findPoint(textNode, currentOffset)
    if (point == null) throw Error('YOWIE WOWIE: Unable to translate dom position to slate position!')

    editor.select(Range.create({ anchor: point, focus: point }))
    console.log('    flush selAfterSelect1:', JSON.stringify(editor.value.selection.toJSON()))

    window.getSelection().collapse(textNode, currentOffset)
    console.log('    flush selAfterSelect2:', JSON.stringify(editor.value.selection.toJSON()))
  }

  /**
   * Return the plugin.
   *
   * @type {Object}
   */

  return {
    onBeforeInput,
    onBlur,
    onClick,
    onCompositionEnd,
    onCompositionStart,
    onCopy,
    onCut,
    onDragEnd,
    onDragEnter,
    onDragExit,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
    onFocus,
    onInput,
    onKeyDown,
    onPaste,
    onSelect,
    queries: { userActionPerformed },
    commands: { clearUserActionPerformed },
  }
}

/**
 * Export.
 *
 * @type {Function}
 */

export default BeforePlugin
