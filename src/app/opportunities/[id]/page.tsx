import { Suspense } from "react";
import OpportunityDetail from "@/components/OpportunityDetail";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpportunityDetail id={id} />;
}

export default function OpportunityPage(props: PageProps<"/opportunities/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={null}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}
