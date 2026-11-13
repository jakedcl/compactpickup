import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VISITOR_CONSENT_THANK_YOU } from './visitor-submit'

test('consent thank-you copy is visitor-facing only', () => {
  assert.equal(VISITOR_CONSENT_THANK_YOU, 'Thanks — this will help improve the scanner.')
  assert.doesNotMatch(VISITOR_CONSENT_THANK_YOU, /pending|review|binder|approval|queue/i)
})
