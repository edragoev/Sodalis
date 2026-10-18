// Demo: Soladis phones a senior, knowing who they are from Supabase.
//   npm run call -- Jane            (by name)
//   npm run call -- +14155550142    (by phone number)
// Needs VAPI_API_KEY, VAPI_ASSISTANT_ID and VAPI_PHONE_NUMBER_ID in .env.local.
// Only seniors already in the database can be called.
import { config } from 'dotenv'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadSeniorToCall } from '@/lib/vapi/call-context'
import { startVapiCall } from '@/lib/vapi/start-call'

config({ path: '.env.local', quiet: true })

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set in .env.local`)
  return value
}

async function main() {
  const who = process.argv[2]?.trim()
  if (!who) throw new Error('Say who to call, e.g. npm run call -- Jane')

  const apiKey = requireEnv('VAPI_API_KEY')
  const assistantId = requireEnv('VAPI_ASSISTANT_ID')
  const phoneNumberId = requireEnv('VAPI_PHONE_NUMBER_ID')

  const db = supabaseAdmin()
  const column = who.startsWith('+') ? 'phone_e164' : 'name'
  const query = db.from('seniors').select('id, name')
  const { data: matches, error } = await (column === 'name' ? query.ilike('name', who) : query.eq('phone_e164', who))
  if (error) throw new Error(error.message)
  if (!matches || matches.length === 0) throw new Error(`No senior matches "${who}"`)
  if (matches.length > 1) throw new Error(`${matches.length} seniors match "${who}"; use their phone number instead`)

  const senior = await loadSeniorToCall(db, matches[0].id, new Date())
  console.log(`Calling ${senior.name} at ${senior.phone_e164} with:`)
  console.log(senior.variables)

  const call = await startVapiCall({
    apiKey,
    assistantId,
    phoneNumberId,
    customer: { number: senior.phone_e164, name: senior.name },
    variables: senior.variables,
  })
  console.log(`Call started: ${call.id}. The check-in is saved when the call ends.`)
}

main().catch((err) => {
  console.error((err as Error).message)
  process.exit(1)
})
