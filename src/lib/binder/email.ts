import { Resend } from 'resend'
import { requireEnv } from '@/lib/binder/env'

let resend: Resend | undefined

function client(): Resend {
  if (!resend) resend = new Resend(requireEnv('RESEND_API_KEY'))
  return resend
}

export async function sendLoginCode(to: string, code: string): Promise<void> {
  const result = await client().emails.send({
    from: requireEnv('AUTH_EMAIL_FROM'),
    to,
    subject: 'Your Compact Pickup sign-in code',
    text: [
      `Your sign-in code is ${code}.`,
      '',
      'It expires in 10 minutes. If you did not ask for this, you can ignore this email.',
    ].join('\n'),
  })
  if (result.error) {
    console.error(`binder: resend ${result.error.name}`)
    throw new Error('email send failed')
  }
}
