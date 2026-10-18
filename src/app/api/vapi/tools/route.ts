import { createVapiTools } from '@/lib/vapi/tools'
import { vapiToolsDeps } from '@/lib/vapi/tools-deps'

// Soladis's in-call tool calls (flag_concern); see src/lib/vapi/tools.ts.
export const maxDuration = 30

export function POST(request: Request) {
  return createVapiTools(vapiToolsDeps())(request)
}
