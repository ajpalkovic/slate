/** @jsx h */

import { h } from '../../../helpers'

export const input = (
  <value>
    <block>one</block>
    <block>two</block>
  </value>
)

export const run = editor => {
  editor.removeNodeAtPath([1])
}

export const output = (
  <value>
    <block>one</block>
  </value>
)