import { isValidElement, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import OpportunityScreen from '@/components/OpportunityScreen'
import OpportunityPage from '@/app/opportunities/[id]/page'

// Next 16 hands a page its route params as a Promise. The page only passes the id on to the
// client component, which reads the session and the data in the browser (like the dashboard).

/** Finds the first element of a given type anywhere in a React element tree. */
function find(node: unknown, type: unknown): ReactElement<{ opportunityId?: string }> | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node as ReactElement<{ opportunityId?: string }>
  const children = (node.props as { children?: unknown }).children
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return null
}

describe('/opportunities/[id] page', () => {
  it('renders the screen for the id in the URL', async () => {
    const tree = await OpportunityPage({ params: Promise.resolve({ id: 'opp-42' }) })
    expect(find(tree, OpportunityScreen)?.props.opportunityId).toBe('opp-42')
  })

  it('uses the id exactly as given, so the screen\'s own lookup decides what is valid', async () => {
    const tree = await OpportunityPage({ params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(find(tree, OpportunityScreen)?.props.opportunityId).toBe('not-a-uuid')
  })
})
