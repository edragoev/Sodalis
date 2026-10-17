import { Suspense } from "react";
import CallDetail from "@/components/CallDetail";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallDetail id={id} />;
}

export default function CallPage(props: PageProps<"/calls/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={null}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}
