import { Suspense } from "react";
import InviteJoin from "@/components/InviteJoin";

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteJoin token={token} />;
}

export default function JoinPage(props: PageProps<"/join/[token]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={null}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}
