import OpportunityScreen from "@/components/OpportunityScreen";

// Where a tapped notification lands. Next hands the route params over as a Promise.
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="flex flex-1 flex-col">
      <OpportunityScreen opportunityId={id} />
    </main>
  );
}
